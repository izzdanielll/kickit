import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
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

  async validate(payload: { sub: string; email: string }) {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException();
    }

    if (!this.prisma.isDbConnected) {
      const user = this.prisma.memStore.users.get(payload.sub);
      if (!user || user.email !== payload.email) {
        throw new UnauthorizedException();
      }
      return { id: user.id, email: user.email, username: user.username };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, username: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    // Attach to request object (req.user)
    return { id: user.id, email: user.email, username: user.username };
  }
}
