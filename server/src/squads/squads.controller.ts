import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SquadsService, SaveSquadSlot } from './squads.service';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaveSquadSlotDto implements SaveSquadSlot {
  @IsInt()
  slotIndex: number;

  @IsString()
  @IsNotEmpty()
  cardId: string;
}

export class SaveSquadDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  formation: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveSquadSlotDto)
  slots: SaveSquadSlotDto[];
}

@UseGuards(JwtAuthGuard)
@Controller('squads')
export class SquadsController {
  constructor(private squadsService: SquadsService) {}

  @Get('active')
  getActiveSquad(@Req() req: any) {
    return this.squadsService.getActiveSquad(req.user.id);
  }

  @Post('save')
  saveSquad(@Req() req: any, @Body() dto: SaveSquadDto) {
    return this.squadsService.saveSquad(req.user.id, dto);
  }
}
