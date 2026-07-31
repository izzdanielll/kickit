import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SquadsService } from './squads.service';
import { AuthenticatedUser, CurrentUser } from '../common/auth/authenticated-user';
import { SaveSquadDto } from './dto/save-squad.dto';

@UseGuards(JwtAuthGuard)
@Controller('squads')
export class SquadsController {
  constructor(private squadsService: SquadsService) {}

  @Get('active')
  getActiveSquad(@CurrentUser() user: AuthenticatedUser) {
    return this.squadsService.getActiveSquad(user.id);
  }

  @Post('save')
  saveSquad(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveSquadDto) {
    return this.squadsService.saveSquad(user.id, dto);
  }
}
