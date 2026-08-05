import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { MetricsService } from './common/observability/metrics.service';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.useBodyParser('json', { limit: '32kb', strict: true });
  app.useBodyParser('urlencoded', { limit: '8kb', extended: false, parameterLimit: 50 });
  const metrics = app.get(MetricsService);
  app.use((error: unknown, _request: unknown, response: any, next: (error?: unknown) => void) => {
    const parserError = error as { type?: string; status?: number };
    const status = parserError.type === 'entity.too.large' ? 413 : parserError.type === 'entity.parse.failed' ? 400 : undefined;
    if (!status) return next(error);
    metrics.increment('body_parser_rejections');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.status(status).json({ statusCode: status, message: status === 413 ? 'Payload too large' : 'Malformed request body' });
  });
  const proxyHops = Number(config.get<string>('TRUST_PROXY_HOPS', '0'));
  if (proxyHops > 0) app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string>('CLIENT_URL', 'http://localhost:3000').split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }));
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = app.get(ConfigService).get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`KickIt API listening on port ${port}`);
}

if (require.main === module) void bootstrap();
