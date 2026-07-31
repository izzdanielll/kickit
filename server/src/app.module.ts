import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CardsModule } from './cards/cards.module';
import { PacksModule } from './packs/packs.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { SquadsModule } from './squads/squads.module';
import { AppController } from './app.controller';
import { HttpLoggerMiddleware } from './common/middleware/logger.middleware';
import { SecurityMiddleware } from './common/middleware/security.middleware';

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
        return env;
      },
    }),

    // Baseline API limit. Sensitive auth routes have stricter route-level limits.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    CardsModule,
    PacksModule,
    MarketplaceModule,
    SquadsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware, HttpLoggerMiddleware).forRoutes('*');
  }
}
