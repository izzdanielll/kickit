import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => request?.cookies?.kickit_access ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; jti: string }) {
    if (!payload?.sub || !payload?.email || !payload?.jti) {
      throw new UnauthorizedException();
    }

    if (!this.prisma.isDbConnected) {
      const user = this.prisma.memStore.users.get(payload.sub);
      const session = this.prisma.memStore.sessions.get(payload.jti);
      if (!user || user.email !== payload.email || (this.requiresVerification() && !user.emailVerifiedAt) || !session || session.userId !== user.id || session.revokedAt || session.expiresAt <= new Date()) {
        throw new UnauthorizedException();
      }
      return { id: user.id, email: user.email, username: user.username, sessionId: session.id };
    }

    const session = await this.prisma.session.findFirst({
      where: { id: payload.jti, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, email: true, username: true, emailVerifiedAt: true } } },
    });

    if (!session || session.user.email !== payload.email || (this.requiresVerification() && !session.user.emailVerifiedAt)) {
      throw new UnauthorizedException();
    }

    // Attach to request object (req.user)
    return { id: session.user.id, email: session.user.email, username: session.user.username, sessionId: session.id };
  }

  private requiresVerification() {
    return this.config.get<string>('REQUIRE_EMAIL_VERIFICATION', 'false') === 'true';
  }
}
