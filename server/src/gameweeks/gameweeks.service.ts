import { Injectable, NotFoundException } from '@nestjs/common';
import { GameweekStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardCacheService } from './leaderboard-cache.service';
import { rarityMultiplierBps } from './scoring';

@Injectable()
export class GameweeksService {
  constructor(private readonly prisma: PrismaService, private readonly cache: LeaderboardCacheService) {}

  async getCurrent(userId: string) {
    if (!this.prisma.isDbConnected) return null;
    const gameweek = await this.prisma.gameweek.findFirst({
      where: { status: { in: [GameweekStatus.OPEN, GameweekStatus.LOCKED] } },
      orderBy: { number: 'desc' },
    }) ?? await this.prisma.gameweek.findFirst({ orderBy: { number: 'desc' } });
    if (!gameweek) return null;
    const entry = await this.prisma.tournamentEntry.findUnique({
      where: { userId_gameweekId: { userId, gameweekId: gameweek.id } },
      select: { totalScore: true, rank: true },
    });
    return { ...gameweek, entry };
  }

  async leaderboard(gameweekId: string, page: number, limit: number) {
    if (!this.prisma.isDbConnected) return { data: [], page, limit };
    const exists = await this.prisma.gameweek.findUnique({ where: { id: gameweekId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Gameweek not found');
    const cached = await this.cache.page(gameweekId, page, limit);
    if (cached) return { data: cached, page, limit, source: 'cache' };
    const skip = (page - 1) * limit;
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { gameweekId }, orderBy: [{ totalScore: 'desc' }, { createdAt: 'asc' }], skip, take: limit,
      select: { userId: true, totalScore: true, user: { select: { username: true } } },
    });
    return { data: entries.map((entry, index) => ({ rank: skip + index + 1, userId: entry.userId, username: entry.user.username, totalScore: entry.totalScore })), page, limit, source: 'database' };
  }

  async openDue(now: Date) {
    await this.prisma.gameweek.updateMany({ where: { status: GameweekStatus.UPCOMING, startTime: { lte: now } }, data: { status: GameweekStatus.OPEN } });
  }

  async ensureUpcoming(now: Date) {
    const upcoming = await this.prisma.gameweek.findFirst({ where: { status: GameweekStatus.UPCOMING }, select: { id: true } });
    if (upcoming) return;
    const latest = await this.prisma.gameweek.findFirst({ orderBy: { number: 'desc' }, select: { number: true, startTime: true } });
    const startTime = latest ? new Date(latest.startTime.getTime() + 7 * 86_400_000) : this.nextMondayAtNoon(now);
    if (startTime <= now) startTime.setUTCDate(startTime.getUTCDate() + 7);
    const lockTime = new Date(startTime.getTime() + 4 * 86_400_000 + 6 * 3_600_000);
    const endTime = new Date(startTime.getTime() + 8 * 86_400_000);
    try {
      await this.prisma.gameweek.create({ data: { number: (latest?.number ?? 0) + 1, startTime, lockTime, endTime } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }

  private nextMondayAtNoon(now: Date) {
    const result = new Date(now);
    result.setUTCHours(12, 0, 0, 0);
    const days = (8 - result.getUTCDay()) % 7 || 7;
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  async lockDue(now: Date) {
    const due = await this.prisma.gameweek.findMany({ where: { status: GameweekStatus.OPEN, lockTime: { lte: now } }, select: { id: true } });
    for (const item of due) await this.lockOne(item.id);
  }

  private async lockOne(gameweekId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.gameweek.updateMany({ where: { id: gameweekId, status: GameweekStatus.OPEN }, data: { status: GameweekStatus.LOCKED } });
      if (claimed.count !== 1) return;
      const squads = await tx.squad.findMany({
        where: { isActive: true }, include: { squadCards: { where: { slotIndex: { lte: 4 } }, include: { card: { include: { template: true } } }, orderBy: { slotIndex: 'asc' } } },
      });
      for (const squad of squads) {
        if (squad.squadCards.length !== 5 || squad.squadCards.some((row, index) => row.slotIndex !== index || row.card.ownerId !== squad.ownerId || row.card.isLocked)) continue;
        const entry = await tx.tournamentEntry.create({ data: { userId: squad.ownerId, squadId: squad.id, gameweekId } });
        await tx.tournamentEntryCard.createMany({ data: squad.squadCards.map((row) => ({ entryId: entry.id, templateId: row.card.templateId, slotIndex: row.slotIndex, multiplierBps: rarityMultiplierBps(row.card.template.rarity) })) });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async settle(gameweekId: string) {
    const entries = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.gameweek.updateMany({ where: { id: gameweekId, status: GameweekStatus.SETTLING }, data: { status: GameweekStatus.COMPLETED, settledAt: new Date() } });
      if (claimed.count !== 1) return null;
      const allEntries = await tx.tournamentEntry.findMany({ where: { gameweekId }, include: { cards: { include: { template: { include: { weeklyScores: { where: { gameweekId } } } } } }, user: { select: { username: true } } } });
      const scored = allEntries.map((entry) => ({ entry, totalScore: entry.cards.reduce((sum, card) => sum + Math.round((card.template.weeklyScores[0]?.totalPoints ?? 0) * card.multiplierBps / 10000), 0) }));
      scored.sort((a, b) => b.totalScore - a.totalScore || a.entry.createdAt.getTime() - b.entry.createdAt.getTime());
      let previousScore: number | undefined;
      let rank = 0;
      for (let index = 0; index < scored.length; index++) {
        if (scored[index].totalScore !== previousScore) rank = index + 1;
        previousScore = scored[index].totalScore;
        await tx.tournamentEntry.update({ where: { id: scored[index].entry.id }, data: { totalScore: scored[index].totalScore, rank } });
      }
      return scored.map(({ entry, totalScore }) => ({ userId: entry.userId, totalScore, user: entry.user }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (entries) await this.cache.rebuild(gameweekId, entries);
  }

  async lockedEndingBefore(now: Date) {
    const staleLease = new Date(now.getTime() - 15 * 60_000);
    return this.prisma.gameweek.findMany({
      where: { endTime: { lte: now }, OR: [{ status: GameweekStatus.LOCKED }, { status: GameweekStatus.SETTLING, processingStartedAt: { lt: staleLease } }] },
      select: { id: true, number: true },
    });
  }

  async claimSettlement(gameweekId: string, now: Date) {
    const staleLease = new Date(now.getTime() - 15 * 60_000);
    const result = await this.prisma.gameweek.updateMany({
      where: { id: gameweekId, OR: [{ status: GameweekStatus.LOCKED }, { status: GameweekStatus.SETTLING, processingStartedAt: { lt: staleLease } }] },
      data: { status: GameweekStatus.SETTLING, processingStartedAt: now },
    });
    return result.count === 1;
  }
}
