import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService, INITIAL_TEMPLATES } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto';
import { RequestSecurityContext, SecurityAuditService } from '../security-audit/security-audit.service';
import { EmailService } from './email.service';
import { MetricsService } from '../common/observability/metrics.service';
import { runSerializable } from '../common/database/serializable-transaction';

// A fixed cost-12 hash makes unknown-account login perform equivalent password
// work without creating a per-request hash or exposing a usable credential.
const DUMMY_PASSWORD_HASH = '$2b$12$XATTrhO.qQ87Fm6BHdlXcuiX652D1w8t3ZnKEfxzVbR4vKLctBena';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: SecurityAuditService,
    private emailService: EmailService,
    private metrics?: MetricsService,
  ) {}

  // ── Register ────────────────────────────────────────
  async register(dto: RegisterDto, context: RequestSecurityContext = {}) {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();

    if (!this.prisma.isDbConnected) {
      // In-Memory Fallback
      for (const u of this.prisma.memStore.users.values()) {
        if (u.email === email || u.username === username) {
          await this.audit.record('REGISTER_REJECTED_DUPLICATE', context, { identifier: email });
          throw new ConflictException(u.email === email ? 'Email is already taken' : 'Username is already taken');
        }
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const userId = `usr_${Date.now()}`;
      const newUser = {
        id: userId,
        email,
        username,
        passwordHash,
        coins: 500,
        gems: 100,
        xp: 0,
        level: 1,
        createdAt: new Date(),
        emailVerifiedAt: this.requiresVerification() ? null : new Date(),
      };
      this.prisma.memStore.users.set(userId, newUser);
      this.prisma.memStore.users.set(email, newUser);

      // Starter cards
      const starterTemplates = INITIAL_TEMPLATES.filter((t) => t.rarity === 'COMMON').slice(0, 5);
      const squadCards: any[] = [];

      starterTemplates.forEach((tmpl, idx) => {
        const cardId = `crd_start_${Date.now()}_${idx}`;
        const cardObj = {
          id: cardId,
          ownerId: userId,
          templateId: tmpl.id,
          template: tmpl,
          level: 1,
          xp: 0,
          isLocked: false,
          listings: [],
        };
        this.prisma.memStore.cards.set(cardId, cardObj);
        squadCards.push({ id: `sc_${cardId}`, slotIndex: idx, card: cardObj });
      });

      // Starter squad
      const squadObj = {
        id: `sqd_${userId}`,
        name: `${username}'s XI`,
        ownerId: userId,
        formation: '1-2-1',
        isActive: true,
        squadCards,
      };
      this.prisma.memStore.squads.set(userId, squadObj);

      const response = await this.finishRegistration(newUser, context);
      await this.audit.record('REGISTER_SUCCEEDED', context, { userId: newUser.id, identifier: email });
      return response;
    }

    // PostgreSQL path
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      const field = existing.email === email ? 'Email' : 'Username';
      await this.audit.record('REGISTER_REJECTED_DUPLICATE', context, { identifier: email });
      throw new ConflictException(`${field} is already taken`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { email, username, passwordHash, coins: 500 },
        });
        await tx.economyTransaction.createMany({
          data: [
            { userId: newUser.id, currency: 'COINS', amount: 500, balanceAfter: 500, reason: 'INITIAL_GRANT', referenceId: `${newUser.id}:COINS` },
            { userId: newUser.id, currency: 'GEMS', amount: 0, balanceAfter: 0, reason: 'INITIAL_GRANT', referenceId: `${newUser.id}:GEMS` },
          ],
        });

        const templates = await tx.cardTemplate.findMany({
          where: { rarity: 'COMMON' },
          take: 5,
        });

        const createdCards: any[] = [];
        for (const t of templates) {
          const card = await tx.card.create({
            data: { ownerId: newUser.id, templateId: t.id },
          });
          createdCards.push(card);
        }

        if (createdCards.length > 0) {
          const squad = await tx.squad.create({
            data: {
              name: `${username}'s XI`,
              ownerId: newUser.id,
              formation: '1-2-1',
              isActive: true,
            },
          });

          for (let i = 0; i < createdCards.length; i++) {
            await tx.squadCard.create({
              data: {
                squadId: squad.id,
                cardId: createdCards[i].id,
                slotIndex: i,
              },
            });
          }
        }

        return newUser;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email or username is already taken');
      }
      throw error;
    }

    const response = await this.finishRegistration(user, context);
    await this.audit.record('REGISTER_SUCCEEDED', context, { userId: user.id, identifier: email });
    return response;
  }

  // ── Login ───────────────────────────────────────────
  async login(dto: LoginDto, context: RequestSecurityContext = {}) {
    const email = dto.email.trim().toLowerCase();

    if (!this.prisma.isDbConnected) {
      // In-Memory Fallback
      const user = this.prisma.memStore.users.get(email);
      if (!user) {
        await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
        await this.audit.record('LOGIN_FAILED', context, { identifier: email });
        throw new UnauthorizedException('Invalid credentials');
      }
      const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordValid) {
        await this.audit.record('LOGIN_FAILED', context, { userId: user.id, identifier: email });
        throw new UnauthorizedException('Invalid credentials');
      }

      if (this.requiresVerification() && !user.emailVerifiedAt) {
        await this.audit.record('LOGIN_REJECTED_UNVERIFIED', context, { userId: user.id, identifier: email });
        throw new UnauthorizedException('Verify your email before signing in');
      }

      const response = await this.buildAuthResponse(user);
      await this.audit.record('LOGIN_SUCCEEDED', context, { userId: user.id, identifier: email });
      return response;
    }

    // PostgreSQL path
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      await this.audit.record('LOGIN_FAILED', context, { identifier: email });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.audit.record('LOGIN_FAILED', context, { userId: user.id, identifier: email });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.requiresVerification() && !user.emailVerifiedAt) {
      await this.audit.record('LOGIN_REJECTED_UNVERIFIED', context, { userId: user.id, identifier: email });
      throw new UnauthorizedException('Verify your email before signing in');
    }

    const response = await this.buildAuthResponse(user);
    await this.audit.record('LOGIN_SUCCEEDED', context, { userId: user.id, identifier: email });
    return response;
  }

  // ── Get current user profile ────────────────────────
  async getProfile(userId: string) {
    if (!this.prisma.isDbConnected) {
      const user = this.prisma.memStore.users.get(userId);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        coins: user.coins ?? 500,
        gems: user.gems ?? 100,
        xp: user.xp ?? 0,
        level: user.level ?? 1,
        avatarUrl: user.avatarUrl ?? null,
        createdAt: user.createdAt,
      };
    }

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        coins: true,
        gems: true,
        xp: true,
        level: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  async logout(userId: string, sessionId: string, context: RequestSecurityContext = {}) {
    if (!this.prisma.isDbConnected) {
      const session = this.prisma.memStore.sessions.get(sessionId);
      if (session?.userId === userId) session.revokedAt = new Date();
    } else {
      await this.prisma.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.record('SESSION_REVOKED', context, { userId });
  }

  async logoutAll(userId: string, context: RequestSecurityContext = {}) {
    if (!this.prisma.isDbConnected) {
      for (const session of this.prisma.memStore.sessions.values()) if (session.userId === userId) session.revokedAt = new Date();
    } else {
      await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.record('ALL_SESSIONS_REVOKED', context, { userId });
  }

  async requestEmailVerification(emailInput: string, context: RequestSecurityContext = {}) {
    const startedAt = Date.now();
    const email = emailInput.trim().toLowerCase();
    const user = this.prisma.isDbConnected
      ? await this.prisma.user.findUnique({ where: { email } })
      : this.prisma.memStore.users.get(email);
    if (user && !user.emailVerifiedAt) await this.issueRecoveryTokenSafely(user, 'EMAIL_VERIFICATION', context);
    await this.applyAccountRequestDelay(startedAt);
    return { message: 'If that account needs verification, an email has been sent.' };
  }

  async confirmEmail(token: string, context: RequestSecurityContext = {}) {
    let userId: string;
    if (!this.prisma.isDbConnected) {
      userId = this.consumeMemoryToken(token, 'EMAIL_VERIFICATION');
      const user = this.prisma.memStore.users.get(userId);
      if (user) user.emailVerifiedAt = new Date();
    } else {
      userId = await this.prisma.$transaction(async (tx) => {
        const consumedUserId = await this.consumeDatabaseToken(tx, token, 'EMAIL_VERIFICATION');
        await tx.user.update({ where: { id: consumedUserId }, data: { emailVerifiedAt: new Date() } });
        return consumedUserId;
      });
    }
    await this.audit.record('EMAIL_VERIFIED', context, { userId });
    return { success: true };
  }

  async requestPasswordReset(emailInput: string, context: RequestSecurityContext = {}) {
    const startedAt = Date.now();
    const email = emailInput.trim().toLowerCase();
    const user = this.prisma.isDbConnected
      ? await this.prisma.user.findUnique({ where: { email } })
      : this.prisma.memStore.users.get(email);
    if (user) await this.issueRecoveryTokenSafely(user, 'PASSWORD_RESET', context);
    await this.applyAccountRequestDelay(startedAt);
    return { message: 'If that account exists, a password reset email has been sent.' };
  }

  async confirmPasswordReset(token: string, password: string, context: RequestSecurityContext = {}) {
    if (!(await this.isAccountTokenValid(token, 'PASSWORD_RESET'))) throw new BadRequestException('Invalid or expired token');
    const passwordHash = await this.hashPassword(password);
    let userId: string;
    if (!this.prisma.isDbConnected) {
      userId = this.consumeMemoryToken(token, 'PASSWORD_RESET');
      const user = this.prisma.memStore.users.get(userId);
      if (!user) throw new BadRequestException('Invalid or expired token');
      user.passwordHash = passwordHash;
      for (const session of this.prisma.memStore.sessions.values()) if (session.userId === userId) session.revokedAt = new Date();
    } else {
      userId = await this.prisma.$transaction(async (tx) => {
        const consumedUserId = await this.consumeDatabaseToken(tx, token, 'PASSWORD_RESET');
        await tx.user.update({ where: { id: consumedUserId }, data: { passwordHash } });
        await tx.session.updateMany({ where: { userId: consumedUserId, revokedAt: null }, data: { revokedAt: new Date() } });
        return consumedUserId;
      });
    }
    await this.audit.record('PASSWORD_RESET_COMPLETED', context, { userId });
    return { success: true };
  }

  private async finishRegistration(user: any, context: RequestSecurityContext) {
    if (!this.requiresVerification()) return this.buildAuthResponse(user);
    await this.issueAccountToken(user, 'EMAIL_VERIFICATION', context);
    return { verificationRequired: true as const, email: user.email };
  }

  private requiresVerification() {
    return this.config.get<string>('REQUIRE_EMAIL_VERIFICATION', 'false') === 'true';
  }

  private async issueAccountToken(user: { id: string; email: string }, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET', context: RequestSecurityContext) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const ttlKey = type === 'EMAIL_VERIFICATION' ? 'EMAIL_VERIFICATION_TTL_MS' : 'PASSWORD_RESET_TTL_MS';
    const defaultTtl = type === 'EMAIL_VERIFICATION' ? 86_400_000 : 3_600_000;
    const expiresAt = new Date(Date.now() + Number(this.config.get<string>(ttlKey, String(defaultTtl))));
    if (!this.prisma.isDbConnected) {
      for (const stored of this.prisma.memStore.accountTokens.values()) if (stored.userId === user.id && stored.type === type && !stored.consumedAt) stored.consumedAt = new Date();
      this.prisma.memStore.accountTokens.set(tokenHash, { userId: user.id, type, expiresAt, consumedAt: null });
    } else {
      await this.prisma.$transaction([
        this.prisma.accountToken.updateMany({ where: { userId: user.id, type, consumedAt: null }, data: { consumedAt: new Date() } }),
        this.prisma.accountToken.create({ data: { userId: user.id, type, tokenHash, expiresAt } }),
      ]);
    }
    const baseUrl = (this.config.get<string>('CLIENT_URL', 'http://localhost:3000').split(',')[0]).replace(/\/$/, '');
    const path = type === 'EMAIL_VERIFICATION' ? 'verify-email' : 'reset-password';
    const subject = type === 'EMAIL_VERIFICATION' ? 'Verify your KickIt email' : 'Reset your KickIt password';
    await this.emailService.send(user.email, subject, `${baseUrl}/auth?mode=${path}&token=${encodeURIComponent(token)}\n\nThis link expires soon. If you did not request it, ignore this email.`);
    await this.audit.record(`${type}_REQUESTED`, context, { userId: user.id, identifier: user.email });
  }

  private async issueRecoveryTokenSafely(user: { id: string; email: string }, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET', context: RequestSecurityContext) {
    try {
      await this.issueAccountToken(user, type, context);
    } catch {
      this.metrics?.increment('email_delivery_failures');
      await this.audit.record('ACCOUNT_EMAIL_DELIVERY_FAILED', context, { userId: user.id });
    }
  }

  private async applyAccountRequestDelay(startedAt: number) {
    const production = this.config.get<string>('NODE_ENV') === 'production';
    const minimum = Number(this.config.get<string>('ACCOUNT_REQUEST_MIN_DELAY_MS', production ? '750' : '0'));
    const remaining = minimum + (minimum > 0 ? randomInt(101) : 0) - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  private consumeMemoryToken(token: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const stored = this.prisma.memStore.accountTokens.get(tokenHash);
    if (!stored || stored.type !== type || stored.consumedAt || stored.expiresAt <= now) throw new BadRequestException('Invalid or expired token');
    stored.consumedAt = now;
    return stored.userId as string;
  }

  private async isAccountTokenValid(token: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    if (!this.prisma.isDbConnected) {
      const stored = this.prisma.memStore.accountTokens.get(tokenHash);
      return Boolean(stored && stored.type === type && !stored.consumedAt && stored.expiresAt > now);
    }
    return Boolean(await this.prisma.accountToken.findFirst({
      where: { tokenHash, type, consumedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    }));
  }

  private hashPassword(password: string) {
    return bcrypt.hash(password, 12);
  }

  private async consumeDatabaseToken(tx: Prisma.TransactionClient, token: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const stored = await tx.accountToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.type !== type || stored.consumedAt || stored.expiresAt <= now) throw new BadRequestException('Invalid or expired token');
    const updated = await tx.accountToken.updateMany({ where: { id: stored.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (updated.count !== 1) throw new BadRequestException('Invalid or expired token');
    return stored.userId;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private async buildAuthResponse(user: { id: string; email: string; username: string; coins?: number; gems?: number }) {
    const sessionId = randomUUID();
    const lifetime = Number(this.config.get<string>('JWT_COOKIE_MAX_AGE_MS', '900000'));
    const expiresAt = new Date(Date.now() + lifetime);
    const maximumSessions = Number(this.config.get<string>('MAX_ACTIVE_SESSIONS_PER_USER', '10'));
    if (!this.prisma.isDbConnected) {
      const createdAt = new Date();
      this.prisma.memStore.sessions.set(sessionId, { id: sessionId, userId: user.id, expiresAt, revokedAt: null, createdAt });
      const active = [...this.prisma.memStore.sessions.values()]
        .filter((session) => session.userId === user.id && !session.revokedAt && session.expiresAt > createdAt)
        .reverse();
      for (const session of active.slice(maximumSessions)) session.revokedAt = createdAt;
    } else {
      await runSerializable(this.prisma, async (tx) => {
        await tx.session.create({ data: { id: sessionId, userId: user.id, expiresAt } });
        const overflow = await tx.session.findMany({
          where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: maximumSessions,
          select: { id: true },
        });
        if (overflow.length) await tx.session.updateMany({ where: { id: { in: overflow.map((session) => session.id) } }, data: { revokedAt: new Date() } });
      });
    }
    const payload = { sub: user.id, email: user.email, jti: sessionId };
    const accessToken = this.jwt.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        coins: user.coins ?? 500,
        gems: user.gems ?? 100,
      },
    };
  }
}
