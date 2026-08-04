import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const proxyHops = Number(config.get<string>('TRUST_PROXY_HOPS', '0'));
  if (proxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);
  }

  // Global prefix for all API routes
  app.setGlobalPrefix('api');

  // Enable CORS for the frontend
  app.enableCors({
    origin: config
      .get<string>('CLIENT_URL', 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });

  // Cookie parser for JWT refresh tokens
  app.use(cookieParser());

  // Global validation pipe — auto-validates all incoming DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  const port = config.get<number>('PORT', 3001);
  app.enableShutdownHooks();
  await app.listen(port);
  console.log(`🚀 kickIt API running on http://localhost:${port}/api`);
}

void bootstrap();
