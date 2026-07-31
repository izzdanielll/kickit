import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService, INITIAL_TEMPLATES } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // ── Register ────────────────────────────────────────
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();

    if (!this.prisma.isDbConnected) {
      // In-Memory Fallback
      for (const u of this.prisma.memStore.users.values()) {
        if (u.email === email) throw new ConflictException('Email is already taken');
        if (u.username === username) throw new ConflictException('Username is already taken');
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

      return this.buildAuthResponse(newUser);
    }

    // PostgreSQL path
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      const field = existing.email === email ? 'Email' : 'Username';
      throw new ConflictException(`${field} is already taken`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { email, username, passwordHash, coins: 500 },
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

    return this.buildAuthResponse(user);
  }

  // ── Login ───────────────────────────────────────────
  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    if (!this.prisma.isDbConnected) {
      // In-Memory Fallback
      const user = this.prisma.memStore.users.get(email);
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      return this.buildAuthResponse(user);
    }

    // PostgreSQL path
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
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

  private buildAuthResponse(user: { id: string; email: string; username: string; coins?: number; gems?: number }) {
    const payload = { sub: user.id, email: user.email };
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
