import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CardsModule } from './cards/cards.module';
import { PacksModule } from './packs/packs.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { SquadsModule } from './squads/squads.module';
import { AppController } from './app.controller';
import { HttpLoggerMiddleware } from './common/middleware/logger.middleware';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import { GameweeksModule } from './gameweeks/gameweeks.module';

@Module({
  imports: [
    // Load .env globally
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => {
        const secret = env.JWT_SECRET;
        if (
          typeof secret !== 'string' ||
          secret.length < 32 ||
          secret.includes('change-this-in-production')
        ) {
          throw new Error('JWT_SECRET must be a unique secret of at least 32 characters');
        }
        if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
          throw new Error('DATABASE_URL is required in production');
        }
        if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
          throw new Error('REDIS_URL is required in production');
        }
        if (env.NODE_ENV === 'production') {
          const clientOrigins = String(env.CLIENT_URL ?? '').split(',').filter(Boolean);
          if (!clientOrigins.length || clientOrigins.some((origin) => !origin.startsWith('https://'))) {
            throw new Error('CLIENT_URL must contain HTTPS origins in production');
          }
          if (env.REDIS_URL && !String(env.REDIS_URL).startsWith('rediss://')) {
            throw new Error('REDIS_URL must use TLS (rediss://) in production');
          }
          if (env.SPORTS_API_URL && !String(env.SPORTS_API_URL).startsWith('https://')) {
            throw new Error('SPORTS_API_URL must use HTTPS in production');
          }
          const proxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
          if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 2) {
            throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 2');
          }
        }
        return env;
      },
    }),

    // Baseline API limit. Sensitive auth routes have stricter route-level limits.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    CardsModule,
    PacksModule,
    MarketplaceModule,
    SquadsModule,
    GameweeksModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware, HttpLoggerMiddleware).forRoutes('*');
  }
}
