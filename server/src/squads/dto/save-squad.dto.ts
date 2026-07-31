import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveSquadSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  slotIndex: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cardId: string;
}

export class SaveSquadDto {
  @IsString()
  @IsOptional()
  @MaxLength(40)
  name?: string;

  @IsIn(['1-2-1', '2-1-1', '1-1-2'])
  formation: string;

  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => SaveSquadSlotDto)
  slots: SaveSquadSlotDto[];
}
