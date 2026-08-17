import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Currency, ListingStatus, Position, Rarity } from '@prisma/client';
import { MarketplaceQueryDto } from './dto/marketplace.dto';
import { runSerializable } from '../common/database/serializable-transaction';
import { PaginationDto } from '../common/dto/pagination.dto';

const MAX_BALANCE = 2_000_000_000;

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  async getListings(userId: string, filters: MarketplaceQueryDto) {
    if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
      throw new BadRequestException('Minimum price cannot be greater than maximum price');
    }
    if (!this.prisma.isDbConnected) {
      let listings = Array.from(this.prisma.memStore.listings.values()).filter(
        (l) => l.status === 'ACTIVE' && l.sellerId !== userId,
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
      if (filters?.club?.trim()) {
        const club = filters.club.trim().toLowerCase();
        listings = listings.filter((l) => l.card.template.club.toLowerCase().includes(club));
      }
      if (filters?.minPrice !== undefined) listings = listings.filter((l) => l.price >= filters.minPrice!);
      if (filters?.maxPrice !== undefined) listings = listings.filter((l) => l.price <= filters.maxPrice!);
      if (filters?.sort === 'price_asc') listings.sort((a, b) => a.price - b.price);
      if (filters?.sort === 'price_desc') listings.sort((a, b) => b.price - a.price);
      if (filters?.sort === 'rarity_desc') {
        const order = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
        listings.sort((a, b) => order.indexOf(b.card.template.rarity) - order.indexOf(a.card.template.rarity));
      }
      const start = (filters.page - 1) * filters.limit;
      return listings.slice(start, start + filters.limit);
    }

    const where: any = {
      status: ListingStatus.ACTIVE,
      sellerId: { not: userId },
    };

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

    if (filters?.club) {
      where.card = {
        ...where.card,
        template: {
          ...(where.card?.template ?? {}),
          club: { contains: filters.club, mode: 'insensitive' },
        },
      };
    }

    if (filters?.minPrice !== undefined || filters?.maxPrice !== undefined) {
      where.price = {
        ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
        ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
      };
    }

    let orderBy: any = { createdAt: 'desc' };
    if (filters?.sort === 'price_asc') orderBy = { price: 'asc' };
    if (filters?.sort === 'price_desc') orderBy = { price: 'desc' };
    if (filters?.sort === 'rarity_desc') orderBy = { card: { template: { rarity: 'desc' } } };

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
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    });

    return listings;
  }

  async getMyListings(userId: string, pagination: PaginationDto = new PaginationDto()) {
    if (!this.prisma.isDbConnected) {
      const listings = Array.from(this.prisma.memStore.listings.values()).filter(
        (l) => l.sellerId === userId,
      );
      const start = (pagination.page - 1) * pagination.limit;
      return listings.slice(start, start + pagination.limit);
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
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });
  }

  async getMyPurchases(userId: string, pagination: PaginationDto = new PaginationDto()) {
    if (!this.prisma.isDbConnected) {
      const listings = Array.from(this.prisma.memStore.listings.values())
        .filter((listing) => listing.buyerId === userId && listing.status === 'COMPLETED');
      const start = (pagination.page - 1) * pagination.limit;
      return listings.slice(start, start + pagination.limit);
    }

    return this.prisma.marketplaceListing.findMany({
      where: { buyerId: userId, status: ListingStatus.COMPLETED },
      include: {
        card: { include: { template: true } },
        seller: { select: { id: true, username: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
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

      const activeSquad = this.prisma.memStore.squads.get(userId);
      if (activeSquad?.squadCards?.some((row: any) => row.card?.id === data.cardId)) {
        throw new BadRequestException('Remove this card from your active squad before listing it');
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

    return runSerializable(this.prisma, async (tx) => {
      const card = await tx.card.findFirst({
        where: { id: data.cardId, ownerId: userId },
      });

      if (!card) {
        throw new NotFoundException('Card not found in your collection');
      }

      if (card.isLocked) {
        throw new BadRequestException('Card is already locked or listed');
      }

      const squadAssignment = await tx.squadCard.findFirst({
        where: { cardId: data.cardId, squad: { isActive: true } },
        select: { id: true },
      });
      if (squadAssignment) {
        throw new BadRequestException('Remove this card from your active squad before listing it');
      }

      const lock = await tx.card.updateMany({
        where: { id: data.cardId, ownerId: userId, isLocked: false },
        data: { isLocked: true },
      });
      if (lock.count !== 1) {
        throw new BadRequestException('Card is already locked or listed');
      }

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
      const seller = this.prisma.memStore.users.get(listing.sellerId);
      const sellerEarnings = Math.floor(listing.price * 0.95);
      if (seller) {
        const balance = listing.currency === 'COINS' ? seller.coins : seller.gems;
        if (balance > MAX_BALANCE - sellerEarnings) throw new BadRequestException('Seller balance limit reached');
      }

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
      if (seller) {
        if (listing.currency === 'COINS') seller.coins += sellerEarnings;
        else seller.gems += sellerEarnings;
      }
      listing.status = 'COMPLETED';

      return {
        listing,
        user: { coins: buyer.coins, gems: buyer.gems },
      };
    }

    return runSerializable(this.prisma, async (tx) => {
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


      const claimed = await tx.marketplaceListing.updateMany({
        where: { id: listingId, status: ListingStatus.ACTIVE },
        data: { buyerId, status: ListingStatus.COMPLETED },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Listing is no longer active');
      }

      const buyer = await tx.user.findUnique({ where: { id: buyerId } });
      if (!buyer) throw new NotFoundException('Buyer user not found');

      const taxRate = 0.05;
      const sellerEarnings = Math.floor(listing.price * (1 - taxRate));

      if (listing.currency === Currency.COINS) {
        const debit = await tx.user.updateMany({
          where: { id: buyerId, coins: { gte: listing.price } },
          data: { coins: { decrement: listing.price } },
        });
        if (debit.count !== 1) throw new BadRequestException('Insufficient Coins');
        const credit = await tx.user.updateMany({
          where: { id: listing.sellerId, coins: { lte: MAX_BALANCE - sellerEarnings } },
          data: { coins: { increment: sellerEarnings } },
        });
        if (credit.count !== 1) throw new BadRequestException('Seller balance limit reached');
      } else {
        const debit = await tx.user.updateMany({
          where: { id: buyerId, gems: { gte: listing.price } },
          data: { gems: { decrement: listing.price } },
        });
        if (debit.count !== 1) throw new BadRequestException('Insufficient Gems');
        const credit = await tx.user.updateMany({
          where: { id: listing.sellerId, gems: { lte: MAX_BALANCE - sellerEarnings } },
          data: { gems: { increment: sellerEarnings } },
        });
        if (credit.count !== 1) throw new BadRequestException('Seller balance limit reached');
      }

      await tx.card.update({
        where: { id: listing.cardId },
        data: {
          ownerId: buyerId,
          isLocked: false,
        },
      });

      const updatedListing = await tx.marketplaceListing.findUnique({
        where: { id: listingId },
        include: {
          card: { include: { template: true } },
        },
      });

      const updatedBuyer = await tx.user.findUnique({
        where: { id: buyerId },
        select: { coins: true, gems: true },
      });
      const updatedSeller = await tx.user.findUnique({
        where: { id: listing.sellerId },
        select: { coins: true, gems: true },
      });
      if (!updatedBuyer || !updatedSeller) throw new NotFoundException('Marketplace account not found');
      await tx.economyTransaction.createMany({
        data: [
          {
            userId: buyerId, currency: listing.currency, amount: -listing.price,
            balanceAfter: listing.currency === Currency.COINS ? updatedBuyer.coins : updatedBuyer.gems,
            reason: 'MARKETPLACE_PURCHASE', referenceId: listing.id,
          },
          {
            userId: listing.sellerId, currency: listing.currency, amount: sellerEarnings,
            balanceAfter: listing.currency === Currency.COINS ? updatedSeller.coins : updatedSeller.gems,
            reason: 'MARKETPLACE_SALE', referenceId: listing.id,
          },
        ],
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
      if (listing.status !== 'ACTIVE') throw new BadRequestException('Listing is not active');

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

      const claimed = await tx.marketplaceListing.updateMany({
        where: { id: listingId, sellerId: userId, status: ListingStatus.ACTIVE },
        data: { status: ListingStatus.CANCELLED },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Listing is not active');
      }

      await tx.card.update({
        where: { id: listing.cardId },
        data: { isLocked: false },
      });

      const cancelledListing = await tx.marketplaceListing.findUniqueOrThrow({ where: { id: listingId } });

      return cancelledListing;
    });
  }
}
