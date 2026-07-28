import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Position, Rarity } from '@prisma/client';

@Injectable()
export class CardsService {
  constructor(private prisma: PrismaService) {}

  async getUserCards(
    userId: string,
    filters?: { position?: Position; rarity?: Rarity; search?: string },
  ) {
    if (!this.prisma.isDbConnected) {
      let cards = Array.from(this.prisma.memStore.cards.values()).filter((c) => c.ownerId === userId);

      if (filters?.position && (filters.position as string) !== 'ALL') {
        cards = cards.filter((c) => c.template.position === filters.position);
      }
      if (filters?.rarity && (filters.rarity as string) !== 'ALL') {
        cards = cards.filter((c) => c.template.rarity === filters.rarity);
      }
      if (filters?.search?.trim()) {
        const query = filters.search.toLowerCase();
        cards = cards.filter((c) => c.template.playerName.toLowerCase().includes(query));
      }

      return cards;
    }

    const where: any = { ownerId: userId };

    if (filters?.position) {
      where.template = { ...where.template, position: filters.position };
    }

    if (filters?.rarity) {
      where.template = { ...where.template, rarity: filters.rarity };
    }

    if (filters?.search) {
      where.template = {
        ...where.template,
        playerName: { contains: filters.search, mode: 'insensitive' },
      };
    }

    const cards = await this.prisma.card.findMany({
      where,
      include: {
        template: true,
        listings: {
          where: { status: 'ACTIVE' },
          select: { id: true, price: true, currency: true },
        },
      },
      orderBy: { template: { rarity: 'desc' } },
    });

    return cards;
  }

  async getCardById(userId: string, cardId: string) {
    if (!this.prisma.isDbConnected) {
      const card = this.prisma.memStore.cards.get(cardId);
      if (!card || card.ownerId !== userId) {
        throw new NotFoundException('Card not found');
      }
      return card;
    }

    const card = await this.prisma.card.findFirst({
      where: { id: cardId, ownerId: userId },
      include: {
        template: true,
        listings: {
          where: { status: 'ACTIVE' },
        },
        squadCards: {
          include: {
            squad: {
              select: { id: true, name: true, formation: true },
            },
          },
        },
      },
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    return card;
  }
}
