import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { RedisThrottlerStorage } from './common/security/redis-throttler.storage';
import { SecurityAuditModule } from './security-audit/security-audit.module';
import { MetricsModule } from './common/observability/metrics.module';
import { validateEnvironment } from './config/validate-environment';

@Module({
  imports: [
    // Load .env globally
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),

    // Baseline API limit. Sensitive auth routes have stricter route-level limits.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: new RedisThrottlerStorage(
          config.get<string>('REDIS_URL'),
          config.get<string>('NODE_ENV') === 'production',
        ),
        throttlers: [{ ttl: 60_000, limit: 100, blockDuration: 60_000 }],
      }),
    }),
    ScheduleModule.forRoot(),

    // Database
    PrismaModule,
    MetricsModule,
    SecurityAuditModule,

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
    consumer.apply(HttpLoggerMiddleware, SecurityMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
