import { Position } from '@prisma/client';

export interface PlayerMetrics {
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltyMisses: number;
  cleanSheet: boolean;
  saves: number;
  penaltySaves: number;
}

export function calculateFantasyPoints(position: Position, stats: PlayerMetrics): number {
  let points = stats.minutesPlayed >= 60 ? 2 : stats.minutesPlayed > 0 ? 1 : 0;
  const goalPoints = position === Position.GK || position === Position.DEF ? 5 : position === Position.MID ? 4 : 3;
  points += stats.goals * goalPoints;
  points += stats.assists * 3;
  points -= stats.yellowCards;
  points -= stats.redCards * 3;
  points -= stats.ownGoals * 2;
  points -= stats.penaltyMisses * 2;
  if ((position === Position.GK || position === Position.DEF) && stats.cleanSheet && stats.minutesPlayed >= 60) points += 4;
  if (position === Position.GK) points += Math.floor(stats.saves / 3) + stats.penaltySaves * 3;
  return points;
}

export function rarityMultiplierBps(rarity: string): number {
  return { COMMON: 10000, RARE: 10500, EPIC: 11000, LEGENDARY: 11500, MYTHIC: 12500 }[rarity] ?? 10000;
}
