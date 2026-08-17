import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameweekStatus, Position } from '@prisma/client';
import { runSerializable } from '../common/database/serializable-transaction';

export interface SaveSquadSlot {
  slotIndex: number;
  cardId: string;
}

const FORMATION_POSITIONS: Record<string, Position[]> = {
  '1-2-1': [Position.GK, Position.DEF, Position.MID, Position.MID, Position.FWD],
  '2-1-1': [Position.GK, Position.DEF, Position.DEF, Position.MID, Position.FWD],
  '1-1-2': [Position.GK, Position.DEF, Position.MID, Position.FWD, Position.FWD],
};

@Injectable()
export class SquadsService {
  constructor(private prisma: PrismaService) {}

  async getActiveSquad(userId: string) {
    if (!this.prisma.isDbConnected) {
      let squad = this.prisma.memStore.squads.get(userId);
      if (!squad) {
        // Create default squad for user
        const userCards = Array.from(this.prisma.memStore.cards.values())
          .filter((c) => c.ownerId === userId && !c.isLocked)
          .slice(0, 7);

        const squadCards = userCards.map((card, idx) => ({
          id: `sc_${card.id}`,
          slotIndex: idx,
          card,
        }));

        squad = {
          id: `sqd_${userId}`,
          name: 'My 5-a-Side Squad',
          ownerId: userId,
          formation: '1-2-1',
          isActive: true,
          squadCards,
        };
        this.prisma.memStore.squads.set(userId, squad);
      }
      return squad;
    }

    let squad = await this.prisma.squad.findFirst({
      where: { ownerId: userId, isActive: true },
      include: {
        squadCards: {
          include: {
            card: {
              include: { template: true },
            },
          },
          orderBy: { slotIndex: 'asc' },
        },
      },
    });

    if (!squad) {
      const existingSquad = await this.prisma.squad.findFirst({
        where: { ownerId: userId },
        include: {
          squadCards: {
            include: { card: { include: { template: true } } },
            orderBy: { slotIndex: 'asc' },
          },
        },
      });

      if (existingSquad) {
        await this.prisma.squad.update({
          where: { id: existingSquad.id },
          data: { isActive: true },
        });
        squad = existingSquad;
      } else {
        const userCards = await this.prisma.card.findMany({
          where: { ownerId: userId, isLocked: false },
          take: 7,
        });

        squad = await this.prisma.squad.create({
          data: {
            name: 'My 5-a-Side Squad',
            ownerId: userId,
            formation: '1-2-1',
            isActive: true,
          },
          include: {
            squadCards: {
              include: { card: { include: { template: true } } },
              orderBy: { slotIndex: 'asc' },
            },
          },
        });

        for (let i = 0; i < userCards.length; i++) {
          await this.prisma.squadCard.create({
            data: {
              squadId: squad.id,
              cardId: userCards[i].id,
              slotIndex: i,
            },
          });
        }

        squad = await this.prisma.squad.findUnique({
          where: { id: squad.id },
          include: {
            squadCards: {
              include: { card: { include: { template: true } } },
              orderBy: { slotIndex: 'asc' },
            },
          },
        });
      }
    }

    return squad;
  }

  async saveSquad(
    userId: string,
    dto: { name?: string; formation: string; slots: SaveSquadSlot[] },
  ) {
    if (this.prisma.isDbConnected) {
      const lockedGameweek = await this.prisma.gameweek.findFirst({
        where: { status: { in: [GameweekStatus.LOCKED, GameweekStatus.SETTLING] } },
        select: { id: true },
      });
      if (lockedGameweek) {
        throw new BadRequestException('Squads cannot be changed while a gameweek is locked');
      }
    }
    const validFormations = ['1-2-1', '2-1-1', '1-1-2'];
    if (!validFormations.includes(dto.formation)) {
      throw new BadRequestException(`Invalid formation. Choose from: ${validFormations.join(', ')}`);
    }

    if (!dto.slots || dto.slots.length < 5) {
      throw new BadRequestException('A 5-a-side starting squad requires at least 5 starters');
    }

    const cardIds = dto.slots.map((s) => s.cardId);
    if (new Set(cardIds).size !== cardIds.length) {
      throw new BadRequestException('Cannot place the same card in multiple slots');
    }
    const slotIndexes = dto.slots.map((slot) => slot.slotIndex);
    if (new Set(slotIndexes).size !== slotIndexes.length) {
      throw new BadRequestException('Cannot assign multiple cards to the same squad slot');
    }

    if (!this.prisma.isDbConnected) {
      const userCards = Array.from(this.prisma.memStore.cards.values()).filter(
        (c) => c.ownerId === userId && !c.isLocked && cardIds.includes(c.id),
      );

      const cardMap = new Map(userCards.map((c) => [c.id, c]));
      const starterSlots = dto.slots.filter((s) => s.slotIndex >= 0 && s.slotIndex <= 4);
      if (userCards.length !== cardIds.length) {
        throw new BadRequestException('One or more selected cards are unavailable');
      }
      if (starterSlots.length !== 5) {
        throw new BadRequestException('All five starting positions are required');
      }
      const requiredPositions = FORMATION_POSITIONS[dto.formation];
      for (let slotIndex = 0; slotIndex < requiredPositions.length; slotIndex++) {
        const slot = starterSlots.find((item) => item.slotIndex === slotIndex);
        const card = slot ? cardMap.get(slot.cardId) : undefined;
        if (!card || card.template.position !== requiredPositions[slotIndex]) {
          throw new BadRequestException(
            `Slot ${slotIndex} requires a ${requiredPositions[slotIndex]} player`,
          );
        }
      }

      let totalOvr = 0;
      for (const slot of starterSlots) {
        const card = cardMap.get(slot.cardId);
        if (card) {
          const baseOvr = Math.round(
            (card.template.baseAttack +
              card.template.baseDefense +
              card.template.basePace +
              card.template.basePassing +
              card.template.basePhysical) / 5,
          );
          totalOvr += baseOvr + (card.level - 1);
        }
      }
      const avgOvr = totalOvr / starterSlots.length;
      if (avgOvr > 85) {
        throw new BadRequestException(`Starting squad average OVR ${Math.round(avgOvr)} exceeds the 85 cap`);
      }

      const squadCards = dto.slots.map((s) => ({
        id: `sc_${s.cardId}`,
        slotIndex: s.slotIndex,
        card: cardMap.get(s.cardId),
      }));

      const squadObj = {
        id: `sqd_${userId}`,
        name: dto.name || 'My 5-a-Side Squad',
        ownerId: userId,
        formation: dto.formation,
        isActive: true,
        squadCards,
      };
      this.prisma.memStore.squads.set(userId, squadObj);

      return {
        squad: squadObj,
        avgOvr: Math.round(avgOvr),
        ratingCap: 85,
        withinCap: avgOvr <= 85,
      };
    }

    // PostgreSQL path
    const cards = await this.prisma.card.findMany({
      where: { id: { in: cardIds }, ownerId: userId, isLocked: false },
      include: { template: true },
    });

    if (cards.length !== cardIds.length) {
      throw new BadRequestException('One or more selected cards do not belong to you');
    }

    const cardMap = new Map(cards.map((c) => [c.id, c]));

    const starterSlots = dto.slots.filter((s) => s.slotIndex >= 0 && s.slotIndex <= 4);
    if (starterSlots.length !== 5) {
      throw new BadRequestException('All five starting positions are required');
    }

    const requiredPositions = FORMATION_POSITIONS[dto.formation];
    for (let slotIndex = 0; slotIndex < requiredPositions.length; slotIndex++) {
      const slot = starterSlots.find((item) => item.slotIndex === slotIndex);
      const card = slot ? cardMap.get(slot.cardId) : undefined;
      if (!card || card.template.position !== requiredPositions[slotIndex]) {
        throw new BadRequestException(
          `Slot ${slotIndex} requires a ${requiredPositions[slotIndex]} player`,
        );
      }
    }

    let totalOvr = 0;
    for (const slot of starterSlots) {
      const card = cardMap.get(slot.cardId)!;
      const baseOvr = Math.round(
        (card.template.baseAttack +
          card.template.baseDefense +
          card.template.basePace +
          card.template.basePassing +
          card.template.basePhysical) / 5,
      );
      totalOvr += baseOvr + (card.level - 1);
    }
    const avgOvr = totalOvr / starterSlots.length;
    if (avgOvr > 85) {
      throw new BadRequestException(`Starting squad average OVR ${Math.round(avgOvr)} exceeds the 85 cap`);
    }

    return runSerializable(this.prisma, async (tx) => {
      const lockedGameweek = await tx.gameweek.findFirst({
        where: { status: { in: [GameweekStatus.LOCKED, GameweekStatus.SETTLING] } },
        select: { id: true },
      });
      if (lockedGameweek) throw new BadRequestException('Squads cannot be changed while a gameweek is locked');

      const transactionCards = await tx.card.findMany({
        where: { id: { in: cardIds }, ownerId: userId, isLocked: false },
        include: { template: true },
      });
      if (transactionCards.length !== cardIds.length) throw new BadRequestException('One or more selected cards are unavailable');
      const transactionCardMap = new Map(transactionCards.map((card) => [card.id, card]));
      for (let slotIndex = 0; slotIndex < requiredPositions.length; slotIndex++) {
        const slot = starterSlots.find((item) => item.slotIndex === slotIndex);
        if (!slot || transactionCardMap.get(slot.cardId)?.template.position !== requiredPositions[slotIndex]) {
          throw new BadRequestException(`Slot ${slotIndex} requires a ${requiredPositions[slotIndex]} player`);
        }
      }

      let squad = await tx.squad.findFirst({
        where: { ownerId: userId, isActive: true },
      });

      if (!squad) {
        squad = await tx.squad.create({
          data: {
            name: dto.name || 'My 5-a-Side Squad',
            ownerId: userId,
            formation: dto.formation,
            isActive: true,
          },
        });
      } else {
        squad = await tx.squad.update({
          where: { id: squad.id },
          data: {
            name: dto.name || squad.name,
            formation: dto.formation,
          },
        });
      }

      await tx.squadCard.deleteMany({
        where: { squadId: squad.id },
      });

      for (const slot of dto.slots) {
        await tx.squadCard.create({
          data: {
            squadId: squad.id,
            cardId: slot.cardId,
            slotIndex: slot.slotIndex,
          },
        });
      }

      const updatedSquad = await tx.squad.findUnique({
        where: { id: squad.id },
        include: {
          squadCards: {
            include: { card: { include: { template: true } } },
            orderBy: { slotIndex: 'asc' },
          },
        },
      });

      return {
        squad: updatedSquad,
        avgOvr: Math.round(avgOvr),
        ratingCap: 85,
        withinCap: avgOvr <= 85,
      };
    });
  }
}
