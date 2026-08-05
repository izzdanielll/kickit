import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../common/observability/metrics.service';

export interface RequestSecurityContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);
  private readonly secret: string;
  constructor(config: ConfigService, private readonly prisma: PrismaService, private readonly metrics: MetricsService) {
    this.secret = config.get<string>('AUDIT_LOG_SECRET') ?? config.getOrThrow<string>('JWT_SECRET');
  }

  async record(type: string, context: RequestSecurityContext, options: { userId?: string; identifier?: string; metadata?: Record<string, string | number | boolean> } = {}) {
    const event = {
      type: type.slice(0, 80),
      userId: options.userId,
      identifierHash: options.identifier ? this.hash(options.identifier.trim().toLowerCase()) : undefined,
      ipHash: context.ip ? this.hash(context.ip) : undefined,
      userAgent: context.userAgent?.slice(0, 300),
      metadata: options.metadata,
      createdAt: new Date(),
    };
    if (!this.prisma.isDbConnected) {
      this.prisma.memStore.securityEvents.push(event);
      return;
    }
    try {
      await this.prisma.securityEvent.create({ data: event });
    } catch (error) {
      // Authentication must remain available, but every dropped audit write is alertable.
      this.metrics.increment('security_audit_write_failures');
      this.logger.error('Security audit event write failed', error instanceof Error ? error.stack : String(error));
    }
  }

  private hash(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }
}
