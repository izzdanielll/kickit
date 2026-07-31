import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OpenPackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  packId: string;
}
