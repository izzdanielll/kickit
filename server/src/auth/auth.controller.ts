import { Controller, Post, Get, Body, UseGuards, Res, Req, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, EmailRequestDto, TokenDto, PasswordResetConfirmDto } from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/auth/authenticated-user';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const auth = await this.authService.register(dto, this.securityContext(req));
    if ('accessToken' in auth) {
      this.setAccessCookie(res, auth.accessToken);
      return { user: auth.user };
    }
    return auth;
  }

  @Post('login')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const auth = await this.authService.login(dto, this.securityContext(req));
    this.setAccessCookie(res, auth.accessToken);
    return { user: auth.user };
  }

  @Post('verify-email/request')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 3, ttl: 60 * 60 * 1000 } })
  requestVerification(@Body() dto: EmailRequestDto, @Req() req: Request) {
    return this.authService.requestEmailVerification(dto.email, this.securityContext(req));
  }

  @Post('verify-email/confirm')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  confirmVerification(@Body() dto: TokenDto, @Req() req: Request) {
    return this.authService.confirmEmail(dto.token, this.securityContext(req));
  }

  @Post('password-reset/request')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 3, ttl: 60 * 60 * 1000 } })
  requestPasswordReset(@Body() dto: EmailRequestDto, @Req() req: Request) {
    return this.authService.requestPasswordReset(dto.email, this.securityContext(req));
  }

  @Post('password-reset/confirm')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  confirmPasswordReset(@Body() dto: PasswordResetConfirmDto, @Req() req: Request) {
    return this.authService.confirmPasswordReset(dto.token, dto.password, this.securityContext(req));
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  async logout(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.id, user.sessionId, this.securityContext(req));
    res.clearCookie('kickit_access', this.cookieOptions());
    return { success: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(user.id, this.securityContext(req));
    res.clearCookie('kickit_access', this.cookieOptions());
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @Header('Cache-Control', 'no-store')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
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
      sameSite: 'strict' as const,
      path: '/api',
    };
  }

  private securityContext(request: Request) {
    return { ip: request.ip, userAgent: request.get('user-agent') };
  }
}
