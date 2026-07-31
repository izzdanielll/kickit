import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CardsService } from './cards.service';
import { AuthenticatedUser, CurrentUser } from '../common/auth/authenticated-user';
import { CardQueryDto } from './dto/card-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private cardsService: CardsService) {}

  @Get()
  getUserCards(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CardQueryDto,
  ) {
    return this.cardsService.getUserCards(user.id, query);
  }

  @Get(':id')
  getCardById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cardsService.getCardById(user.id, id);
  }
}
