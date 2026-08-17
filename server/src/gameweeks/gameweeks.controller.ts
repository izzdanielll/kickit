import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/auth/authenticated-user';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { GameweeksService } from './gameweeks.service';

@UseGuards(JwtAuthGuard)
@Controller('gameweeks')
export class GameweeksController {
  constructor(private readonly gameweeks: GameweeksService) {}

  @Get('current')
  current(@CurrentUser() user: AuthenticatedUser) { return this.gameweeks.getCurrent(user.id); }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationDto) {
    return this.gameweeks.history(user.id, query.page, query.limit);
  }

  @Get(':id/my-entry')
  entry(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.gameweeks.entryDetails(user.id, id);
  }

  @Get(':id/leaderboard')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  leaderboard(@Param('id', ParseUUIDPipe) id: string, @Query() query: LeaderboardQueryDto) {
    return this.gameweeks.leaderboard(id, query.page, query.limit);
  }
}
