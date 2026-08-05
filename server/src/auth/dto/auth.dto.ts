import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+(?: [a-zA-Z0-9_]+)*$/, {
    message: 'Club name can contain letters, numbers, underscores, and single spaces between words',
  })
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must include at least one uppercase letter and one number',
  })
  password: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;
}

export class EmailRequestDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class TokenDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token: string;
}

export class PasswordResetConfirmDto extends TokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must include at least one uppercase letter and one number',
  })
  password: string;
}
