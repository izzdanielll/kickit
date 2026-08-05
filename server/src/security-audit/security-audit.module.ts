import { Global, Module } from '@nestjs/common';
import { SecurityAuditService } from './security-audit.service';
import { SecurityMaintenanceService } from './security-maintenance.service';

@Global()
@Module({ providers: [SecurityAuditService, SecurityMaintenanceService], exports: [SecurityAuditService] })
export class SecurityAuditModule {}
