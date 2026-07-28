import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketplaceService } from './marketplace.service';
import { Currency, Position, Rarity } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateListingDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @IsInt()
  @Min(1)
  price: number;

  @IsEnum(Currency)
  currency: Currency;
}

@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class MarketplaceController {
  constructor(private marketplaceService: MarketplaceService) {}

  @Get('listings')
  getListings(
    @Query('position') position?: Position,
    @Query('rarity') rarity?: Rarity,
    @Query('currency') currency?: Currency,
    @Query('search') search?: string,
    @Query('sort') sort?: 'price_asc' | 'price_desc' | 'recent',
  ) {
    return this.marketplaceService.getListings({
      position,
      rarity,
      currency,
      search,
      sort,
    });
  }

  @Get('my-listings')
  getMyListings(@Req() req: any) {
    return this.marketplaceService.getMyListings(req.user.id);
  }

  @Post('listings')
  createListing(@Req() req: any, @Body() dto: CreateListingDto) {
    return this.marketplaceService.createListing(req.user.id, dto);
  }

  @Post('buy/:id')
  buyListing(@Req() req: any, @Param('id') id: string) {
    return this.marketplaceService.buyListing(req.user.id, id);
  }

  @Delete('listings/:id')
  cancelListing(@Req() req: any, @Param('id') id: string) {
    return this.marketplaceService.cancelListing(req.user.id, id);
  }
}
