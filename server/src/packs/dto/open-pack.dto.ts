import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class OpenPackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  packId: string;

  @IsUUID('4')
  idempotencyKey: string;
}
