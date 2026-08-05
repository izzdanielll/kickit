import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Position } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateFantasyPoints, PlayerMetrics } from './scoring';

type ProviderRow = PlayerMetrics & { realWorldPlayerId: number; updatedAt: string };

@Injectable()
export class SportsDataService {
  private readonly logger = new Logger(SportsDataService.name);
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async ingest(gameweekId: string, gameweekNumber: number): Promise<number> {
    const baseUrl = this.config.get<string>('SPORTS_API_URL');
    const apiKey = this.config.get<string>('SPORTS_API_KEY');
    if (!baseUrl || !apiKey) {
      throw new Error('Sports ingestion is not configured');
    }

    const url = new URL(baseUrl);
    url.searchParams.set('gameweek', String(gameweekNumber));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`Sports provider returned HTTP ${response.status}`);
    const body: unknown = await this.readBoundedJson(response, 2 * 1024 * 1024);
    if (!Array.isArray(body) || body.length > 5000) throw new Error('Invalid sports provider payload');

    const validatedRows = body.map((candidate) => this.validateRow(candidate));
    const latestByPlayer = new Map<number, ProviderRow>();
    for (const row of validatedRows) {
      const previous = latestByPlayer.get(row.realWorldPlayerId);
      if (!previous || Date.parse(previous.updatedAt) < Date.parse(row.updatedAt)) latestByPlayer.set(row.realWorldPlayerId, row);
    }
    const rows = [...latestByPlayer.values()];
    const templates = await this.prisma.cardTemplate.findMany({
      where: { realWorldPlayerId: { in: rows.map((row) => row.realWorldPlayerId) } },
      select: { id: true, realWorldPlayerId: true, position: true },
    });
    const templateByProviderId = new Map(templates.map((template) => [template.realWorldPlayerId, template]));
    const existingScores = await this.prisma.playerWeeklyScore.findMany({
      where: { gameweekId, templateId: { in: templates.map((template) => template.id) } },
      select: { templateId: true, sourceUpdatedAt: true },
    });
    const existingByTemplate = new Map(existingScores.map((score) => [score.templateId, score.sourceUpdatedAt]));
    const pending: Array<{ templateId: string; sourceUpdatedAt: Date; totalPoints: number; metrics: PlayerMetrics }> = [];
    for (const row of rows) {
      const template = templateByProviderId.get(row.realWorldPlayerId);
      if (!template) continue;
      const sourceUpdatedAt = new Date(row.updatedAt);
      const existingUpdatedAt = existingByTemplate.get(template.id);
      if (existingUpdatedAt && existingUpdatedAt >= sourceUpdatedAt) continue;
      const totalPoints = calculateFantasyPoints(template.position, row);
      const { realWorldPlayerId: _providerId, updatedAt: _providerUpdatedAt, ...metrics } = row;
      pending.push({ templateId: template.id, sourceUpdatedAt, totalPoints, metrics });
    }

    for (let index = 0; index < pending.length; index += 100) {
      const batch = pending.slice(index, index + 100);
      await this.prisma.$transaction(batch.map((item) => this.prisma.playerWeeklyScore.upsert({
        where: { gameweekId_templateId: { gameweekId, templateId: item.templateId } },
        create: { ...item.metrics, gameweekId, templateId: item.templateId, sourceUpdatedAt: item.sourceUpdatedAt, totalPoints: item.totalPoints },
        update: { ...item.metrics, sourceUpdatedAt: item.sourceUpdatedAt, totalPoints: item.totalPoints },
      })));
      await this.prisma.gameweek.updateMany({
        where: { id: gameweekId, status: 'SETTLING' },
        data: { processingStartedAt: new Date() },
      });
    }

    await this.assertCoverage(gameweekId);
    return pending.length;
  }

  private async assertCoverage(gameweekId: string) {
    const required = await this.prisma.tournamentEntryCard.findMany({
      where: { entry: { gameweekId } },
      distinct: ['templateId'],
      select: { templateId: true },
    });
    if (required.length === 0) return;
    const scored = await this.prisma.playerWeeklyScore.count({
      where: { gameweekId, templateId: { in: required.map((item) => item.templateId) } },
    });
    const coverage = (scored / required.length) * 100;
    const minimum = Number(this.config.get<string>('SPORTS_MIN_COVERAGE_PERCENT', '95'));
    if (coverage < minimum) {
      throw new Error(`Sports data coverage ${coverage.toFixed(1)}% is below required ${minimum}%`);
    }
  }

  private validateRow(value: unknown): ProviderRow {
    if (!value || typeof value !== 'object') throw new Error('Invalid sports metric row');
    const input = value as Record<string, unknown>;
    const integer = (key: string, max: number) => {
      const result = input[key];
      if (!Number.isInteger(result) || (result as number) < 0 || (result as number) > max) throw new Error(`Invalid ${key}`);
      return result as number;
    };
    const updatedAt = input.updatedAt;
    if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid updatedAt');
    return {
      realWorldPlayerId: integer('realWorldPlayerId', 2_147_483_647),
      minutesPlayed: integer('minutesPlayed', 180), goals: integer('goals', 20), assists: integer('assists', 20),
      yellowCards: integer('yellowCards', 2), redCards: integer('redCards', 1), ownGoals: integer('ownGoals', 10),
      penaltyMisses: integer('penaltyMisses', 10), saves: integer('saves', 100), penaltySaves: integer('penaltySaves', 20),
      cleanSheet: this.boolean(input.cleanSheet, 'cleanSheet'), updatedAt,
    };
  }

  private boolean(value: unknown, key: string) {
    if (typeof value !== 'boolean') throw new Error(`Invalid ${key}`);
    return value;
  }

  private async readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > maximumBytes) throw new Error('Sports provider payload is too large');
    if (!response.body) throw new Error('Sports provider returned an empty response');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new Error('Sports provider payload is too large');
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return JSON.parse(buffer.toString('utf8'));
  }
}
