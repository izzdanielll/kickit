import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const suppliedId = request.get('x-request-id');
    const requestId = suppliedId && /^[a-zA-Z0-9_-]{8,64}$/.test(suppliedId) ? suppliedId : randomUUID();
    const startTime = Date.now();
    response.setHeader('X-Request-ID', requestId);

    response.on('finish', () => {
      // Query strings can contain private data or reset tokens, so never write them to logs.
      const path = request.originalUrl.split('?')[0];
      const responseTimeMs = Date.now() - startTime;
      this.metrics.recordHttp(request.method, response.statusCode, responseTimeMs);
      this.logger.log(JSON.stringify({
        event: 'http_request',
        requestId,
        method: request.method,
        path,
        statusCode: response.statusCode,
        responseTimeMs,
      }));
    });

    next();
  }
}
