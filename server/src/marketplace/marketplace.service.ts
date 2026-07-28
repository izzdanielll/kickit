import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Currency, ListingStatus, Position, Rarity } from '@prisma/client';

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  async getListings(filters?: {
    position?: Position;
    rarity?: Rarity;
    currency?: Currency;
    search?: string;
    sort?: 'price_asc' | 'price_desc' | 'recent';
  }) {
    if (!this.prisma.isDbConnected) {
      let listings = Array.from(this.prisma.memStore.listings.values()).filter(
        (l) => l.status === 'ACTIVE',
      );

      if (filters?.currency) {
        listings = listings.filter((l) => l.currency === filters.currency);
      }
      if (filters?.position && (filters.position as string) !== 'ALL') {
        listings = listings.filter((l) => l.card.template.position === filters.position);
      }
      if (filters?.rarity && (filters.rarity as string) !== 'ALL') {
        listings = listings.filter((l) => l.card.template.rarity === filters.rarity);
      }
      if (filters?.search?.trim()) {
        const query = filters.search.toLowerCase();
        listings = listings.filter((l) =>
          l.card.template.playerName.toLowerCase().includes(query),
        );
      }
      return listings;
    }

    const where: any = { status: ListingStatus.ACTIVE };

    if (filters?.currency) {
      where.currency = filters.currency;
    }

    if (filters?.position) {
      where.card = { ...where.card, template: { position: filters.position } };
    }

    if (filters?.rarity) {
      where.card = {
        ...where.card,
        template: {
          ...(where.card?.template ?? {}),
          rarity: filters.rarity,
        },
      };
    }

    if (filters?.search) {
      where.card = {
        ...where.card,
        template: {
          ...(where.card?.template ?? {}),
          playerName: { contains: filters.search, mode: 'insensitive' },
        },
      };
    }

    let orderBy: any = { createdAt: 'desc' };
    if (filters?.sort === 'price_asc') orderBy = { price: 'asc' };
    if (filters?.sort === 'price_desc') orderBy = { price: 'desc' };

    const listings = await this.prisma.marketplaceListing.findMany({
      where,
      include: {
        seller: {
          select: { id: true, username: true, avatarUrl: true },
        },
        card: {
          include: {
            template: true,
          },
        },
      },
      orderBy,
    });

    return listings;
  }

  async getMyListings(userId: string) {
    if (!this.prisma.isDbConnected) {
      return Array.from(this.prisma.memStore.listings.values()).filter(
        (l) => l.sellerId === userId,
      );
    }

    return this.prisma.marketplaceListing.findMany({
      where: { sellerId: userId },
      include: {
        card: {
          include: { template: true },
        },
        buyer: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createListing(
    userId: string,
    data: { cardId: string; price: number; currency: Currency },
  ) {
    if (data.price <= 0) {
      throw new BadRequestException('Price must be greater than 0');
    }

    if (!this.prisma.isDbConnected) {
      const card = this.prisma.memStore.cards.get(data.cardId);
      if (!card || card.ownerId !== userId) {
        throw new NotFoundException('Card not found in your collection');
      }
      if (card.isLocked) {
        throw new BadRequestException('Card is already locked or listed');
      }

      card.isLocked = true;
      const user = this.prisma.memStore.users.get(userId);

      const listingObj = {
        id: `lst_${Date.now()}`,
        cardId: data.cardId,
        sellerId: userId,
        seller: { id: userId, username: user?.username || 'Club Manager' },
        price: data.price,
        currency: data.currency,
        status: 'ACTIVE',
        createdAt: new Date(),
        card,
      };
      this.prisma.memStore.listings.set(listingObj.id, listingObj);
      return listingObj;
    }

    return this.prisma.$transaction(async (tx) => {
      const card = await tx.card.findFirst({
        where: { id: data.cardId, ownerId: userId },
      });

      if (!card) {
        throw new NotFoundException('Card not found in your collection');
      }

      if (card.isLocked) {
        throw new BadRequestException('Card is already locked or listed');
      }

      await tx.card.update({
        where: { id: data.cardId },
        data: { isLocked: true },
      });

      const listing = await tx.marketplaceListing.create({
        data: {
          cardId: data.cardId,
          sellerId: userId,
          price: data.price,
          currency: data.currency,
          status: ListingStatus.ACTIVE,
        },
        include: {
          card: { include: { template: true } },
        },
      });

      return listing;
    });
  }

  async buyListing(buyerId: string, listingId: string) {
    if (!this.prisma.isDbConnected) {
      const listing = this.prisma.memStore.listings.get(listingId);
      if (!listing || listing.status !== 'ACTIVE') {
        throw new NotFoundException('Listing is no longer active');
      }
      if (listing.sellerId === buyerId) {
        throw new BadRequestException('You cannot purchase your own listing');
      }

      const buyer = this.prisma.memStore.users.get(buyerId);
      if (!buyer) throw new NotFoundException('Buyer user not found');

      if (listing.currency === 'COINS') {
        if (buyer.coins < listing.price) throw new BadRequestException('Insufficient Coins');
        buyer.coins -= listing.price;
      } else {
        if (buyer.gems < listing.price) throw new BadRequestException('Insufficient Gems');
        buyer.gems -= listing.price;
      }

      const card = this.prisma.memStore.cards.get(listing.cardId);
      if (card) {
        card.ownerId = buyerId;
        card.isLocked = false;
      }
      listing.status = 'COMPLETED';

      return {
        listing,
        user: { coins: buyer.coins, gems: buyer.gems },
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: listingId },
        include: { card: true },
      });

      if (!listing || listing.status !== ListingStatus.ACTIVE) {
        throw new NotFoundException('Listing is no longer active');
      }

      if (listing.sellerId === buyerId) {
        throw new BadRequestException('You cannot purchase your own listing');
      }

      const buyer = await tx.user.findUnique({ where: { id: buyerId } });
      if (!buyer) throw new NotFoundException('Buyer user not found');

      if (listing.currency === Currency.COINS) {
        if (buyer.coins < listing.price) {
          throw new BadRequestException('Insufficient Coins');
        }
      } else {
        if (buyer.gems < listing.price) {
          throw new BadRequestException('Insufficient Gems');
        }
      }

      const taxRate = 0.05;
      const sellerEarnings = Math.floor(listing.price * (1 - taxRate));

      if (listing.currency === Currency.COINS) {
        await tx.user.update({
          where: { id: buyerId },
          data: { coins: { decrement: listing.price } },
        });
        await tx.user.update({
          where: { id: listing.sellerId },
          data: { coins: { increment: sellerEarnings } },
        });
      } else {
        await tx.user.update({
          where: { id: buyerId },
          data: { gems: { decrement: listing.price } },
        });
        await tx.user.update({
          where: { id: listing.sellerId },
          data: { gems: { increment: sellerEarnings } },
        });
      }

      await tx.card.update({
        where: { id: listing.cardId },
        data: {
          ownerId: buyerId,
          isLocked: false,
        },
      });

      const updatedListing = await tx.marketplaceListing.update({
        where: { id: listingId },
        data: {
          buyerId,
          status: ListingStatus.COMPLETED,
        },
        include: {
          card: { include: { template: true } },
        },
      });

      const updatedBuyer = await tx.user.findUnique({
        where: { id: buyerId },
        select: { coins: true, gems: true },
      });

      return {
        listing: updatedListing,
        user: updatedBuyer,
      };
    });
  }

  async cancelListing(userId: string, listingId: string) {
    if (!this.prisma.isDbConnected) {
      const listing = this.prisma.memStore.listings.get(listingId);
      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.sellerId !== userId) throw new ForbiddenException('You can only cancel your own listings');

      const card = this.prisma.memStore.cards.get(listing.cardId);
      if (card) card.isLocked = false;
      listing.status = 'CANCELLED';
      return listing;
    }

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: listingId },
      });

      if (!listing) {
        throw new NotFoundException('Listing not found');
      }

      if (listing.sellerId !== userId) {
        throw new ForbiddenException('You can only cancel your own listings');
      }

      if (listing.status !== ListingStatus.ACTIVE) {
        throw new BadRequestException('Listing is not active');
      }

      await tx.card.update({
        where: { id: listing.cardId },
        data: { isLocked: false },
      });

      const cancelledListing = await tx.marketplaceListing.update({
        where: { id: listingId },
        data: { status: ListingStatus.CANCELLED },
      });

      return cancelledListing;
    });
  }
}
