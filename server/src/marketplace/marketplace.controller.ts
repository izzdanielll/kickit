import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketplaceService } from './marketplace.service';
import { AuthenticatedUser, CurrentUser } from '../common/auth/authenticated-user';
import { CreateListingDto, MarketplaceQueryDto } from './dto/marketplace.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class MarketplaceController {
  constructor(private marketplaceService: MarketplaceService) {}

  @Get('listings')
  getListings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MarketplaceQueryDto,
  ) {
    return this.marketplaceService.getListings(user.id, query);
  }

  @Get('my-listings')
  getMyListings(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationDto) {
    return this.marketplaceService.getMyListings(user.id, query);
  }

  @Get('my-purchases')
  getMyPurchases(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationDto) {
    return this.marketplaceService.getMyPurchases(user.id, query);
  }

  @Post('listings')
  createListing(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateListingDto) {
    return this.marketplaceService.createListing(user.id, dto);
  }

  @Post('buy/:id')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  buyListing(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.marketplaceService.buyListing(user.id, id);
  }

  @Delete('listings/:id')
  cancelListing(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.marketplaceService.cancelListing(user.id, id);
  }
}
