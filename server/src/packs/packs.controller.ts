import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PacksService } from './packs.service';
import { AuthenticatedUser, CurrentUser } from '../common/auth/authenticated-user';
import { OpenPackDto } from './dto/open-pack.dto';

@UseGuards(JwtAuthGuard)
@Controller('packs')
export class PacksController {
  constructor(private packsService: PacksService) {}

  @Get()
  getPacks() {
    return this.packsService.getPacks();
  }

  @Post('open')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  openPack(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenPackDto) {
    return this.packsService.openPack(user.id, dto.packId);
  }
}
