import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PacksService } from './packs.service';
import { IsNotEmpty, IsString } from 'class-validator';

export class OpenPackDto {
  @IsString()
  @IsNotEmpty()
  packId: string;
}

@UseGuards(JwtAuthGuard)
@Controller('packs')
export class PacksController {
  constructor(private packsService: PacksService) {}

  @Get()
  getPacks() {
    return this.packsService.getPacks();
  }

  @Post('open')
  openPack(@Req() req: any, @Body() dto: OpenPackDto) {
    return this.packsService.openPack(req.user.id, dto.packId);
  }
}
