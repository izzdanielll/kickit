import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, INITIAL_TEMPLATES, INITIAL_PACKS } from '../prisma/prisma.service';
import { Currency, Rarity, PackType } from '@prisma/client';

@Injectable()
export class PacksService {
  constructor(private prisma: PrismaService) {}

  async getPacks() {
    if (!this.prisma.isDbConnected) {
      return this.prisma.memStore.packs;
    }
    return this.prisma.packDefinition.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async openPack(userId: string, packId: string) {
    if (!this.prisma.isDbConnected) {
      // In-Memory Pack Opening Fallback
      const pack = this.prisma.memStore.packs.find((p) => p.id === packId || p.type === packId);
      if (!pack) throw new NotFoundException('Pack not found');

      const user = this.prisma.memStore.users.get(userId);
      if (!user) throw new NotFoundException('User not found');

      // Deduct currency
      if (pack.coinCost !== null && pack.coinCost > 0) {
        if (user.coins < pack.coinCost) throw new BadRequestException('Insufficient Coins');
        user.coins -= pack.coinCost;
      } else if (pack.gemCost !== null && pack.gemCost > 0) {
        if (user.gems < pack.gemCost) throw new BadRequestException('Insufficient Gems');
        user.gems -= pack.gemCost;
      }

      // Generate N cards based on pack odds
      const generatedCards: any[] = [];
      for (let i = 0; i < pack.cardCount; i++) {
        const rarity = this.rollRarityStr(pack.type);
        const matchingTemplates = INITIAL_TEMPLATES.filter((t) => t.rarity === rarity);
        const pool = matchingTemplates.length > 0 ? matchingTemplates : INITIAL_TEMPLATES;
        const selectedTemplate = pool[Math.floor(Math.random() * pool.length)];

        const cardId = `crd_pack_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;
        const cardObj = {
          id: cardId,
          ownerId: userId,
          templateId: selectedTemplate.id,
          template: selectedTemplate,
          level: 1,
          xp: 0,
          isLocked: false,
          listings: [],
        };
        this.prisma.memStore.cards.set(cardId, cardObj);
        generatedCards.push(cardObj);
      }

      return {
        packOpeningId: `po_${Date.now()}`,
        cards: generatedCards,
        user: { coins: user.coins, gems: user.gems },
      };
    }

    // PostgreSQL path
    const pack = await this.prisma.packDefinition.findUnique({
      where: { id: packId },
    });

    if (!pack || !pack.isActive) {
      throw new NotFoundException('Pack not found or inactive');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      let usedCurrency: Currency;
      let cost: number;

      if (pack.coinCost !== null && pack.coinCost > 0) {
        if (user.coins < pack.coinCost) throw new BadRequestException('Insufficient Coins');
        usedCurrency = Currency.COINS;
        cost = pack.coinCost;
        await tx.user.update({ where: { id: userId }, data: { coins: { decrement: cost } } });
      } else if (pack.gemCost !== null && pack.gemCost > 0) {
        if (user.gems < pack.gemCost) throw new BadRequestException('Insufficient Gems');
        usedCurrency = Currency.GEMS;
        cost = pack.gemCost;
        await tx.user.update({ where: { id: userId }, data: { gems: { decrement: cost } } });
      } else {
        throw new BadRequestException('Invalid pack cost configuration');
      }

      const packOpening = await tx.packOpening.create({
        data: { ownerId: userId, packId: pack.id, currency: usedCurrency, cost },
      });

      const allTemplates = await tx.cardTemplate.findMany();
      if (allTemplates.length === 0) throw new BadRequestException('No card templates available');

      const templatesByRarity: Record<Rarity, typeof allTemplates> = {
        COMMON: [], RARE: [], EPIC: [], LEGENDARY: [], MYTHIC: [],
      };
      for (const t of allTemplates) templatesByRarity[t.rarity].push(t);

      const generatedCards: any[] = [];
      for (let i = 0; i < pack.cardCount; i++) {
        const rarity = this.rollRarity(pack.type);
        const pool = templatesByRarity[rarity].length > 0 ? templatesByRarity[rarity] : allTemplates;
        const selectedTemplate = pool[Math.floor(Math.random() * pool.length)];

        const card = await tx.card.create({
          data: { ownerId: userId, templateId: selectedTemplate.id, packOpeningId: packOpening.id },
          include: { template: true },
        });
        generatedCards.push(card);
      }

      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { coins: true, gems: true },
      });

      return { packOpeningId: packOpening.id, cards: generatedCards, user: updatedUser };
    });
  }

  private rollRarityStr(packType: string): string {
    const roll = Math.random();
    if (packType === 'PROMO') {
      if (roll < 0.050) return 'MYTHIC';
      if (roll < 0.200) return 'LEGENDARY';
      if (roll < 0.500) return 'EPIC';
      if (roll < 0.850) return 'RARE';
      return 'COMMON';
    }
    if (packType === 'GOLD') {
      if (roll < 0.020) return 'MYTHIC';
      if (roll < 0.100) return 'LEGENDARY';
      if (roll < 0.300) return 'EPIC';
      if (roll < 0.700) return 'RARE';
      return 'COMMON';
    }
    if (packType === 'SILVER') {
      if (roll < 0.010) return 'MYTHIC';
      if (roll < 0.060) return 'LEGENDARY';
      if (roll < 0.180) return 'EPIC';
      if (roll < 0.500) return 'RARE';
      return 'COMMON';
    }
    if (roll < 0.005) return 'MYTHIC';
    if (roll < 0.030) return 'LEGENDARY';
    if (roll < 0.100) return 'EPIC';
    if (roll < 0.300) return 'RARE';
    return 'COMMON';
  }

  private rollRarity(packType: PackType): Rarity {
    return this.rollRarityStr(packType as string) as Rarity;
  }
}
