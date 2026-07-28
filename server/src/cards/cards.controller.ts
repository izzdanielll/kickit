import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CardsService } from './cards.service';
import { Position, Rarity } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private cardsService: CardsService) {}

  @Get()
  getUserCards(
    @Req() req: any,
    @Query('position') position?: Position,
    @Query('rarity') rarity?: Rarity,
    @Query('search') search?: string,
  ) {
    return this.cardsService.getUserCards(req.user.id, { position, rarity, search });
  }

  @Get(':id')
  getCardById(@Req() req: any, @Param('id') id: string) {
    return this.cardsService.getCardById(req.user.id, id);
  }
}
