import { Currency, Position, Rarity } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateListingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cardId: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  price: number;

  @IsEnum(Currency)
  currency: Currency;
}

export class MarketplaceQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(Position)
  position?: Position;

  @IsOptional()
  @IsEnum(Rarity)
  rarity?: Rarity;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'recent'])
  sort?: 'price_asc' | 'price_desc' | 'recent';
}
