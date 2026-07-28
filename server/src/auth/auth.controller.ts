import { Controller, Post, Get, Body, UseGuards, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const auth = await this.authService.register(dto);
    this.setAccessCookie(res, auth.accessToken);
    return { user: auth.user };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const auth = await this.authService.login(dto);
    this.setAccessCookie(res, auth.accessToken);
    return { user: auth.user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('kickit_access', this.cookieOptions());
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  private setAccessCookie(res: Response, accessToken: string) {
    res.cookie('kickit_access', accessToken, {
      ...this.cookieOptions(),
      maxAge: this.config.get<number>('JWT_COOKIE_MAX_AGE_MS', 15 * 60 * 1000),
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/api',
    };
  }
}
