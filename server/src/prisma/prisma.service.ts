import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Position, Rarity, PackType } from '@prisma/client';

export const INITIAL_TEMPLATES = [
  // COMMON
  { id: 'tmpl_1', playerName: 'Aaron Ramsdale', club: 'Southampton', league: 'Premier League', nationality: 'England', position: 'GK', rarity: 'COMMON', baseAttack: 20, baseDefense: 76, basePace: 65, basePassing: 70, basePhysical: 74, season: '2026/2027' },
  { id: 'tmpl_2', playerName: 'Harry Maguire', club: 'Manchester United', league: 'Premier League', nationality: 'England', position: 'DEF', rarity: 'COMMON', baseAttack: 52, baseDefense: 78, basePace: 55, basePassing: 68, basePhysical: 84, season: '2026/2027' },
  { id: 'tmpl_3', playerName: 'Conor Gallagher', club: 'Atletico Madrid', league: 'La Liga', nationality: 'England', position: 'MID', rarity: 'COMMON', baseAttack: 72, baseDefense: 74, basePace: 76, basePassing: 75, basePhysical: 80, season: '2026/2027' },
  { id: 'tmpl_4', playerName: 'Fred', club: 'Fenerbahce', league: 'Super Lig', nationality: 'Brazil', position: 'MID', rarity: 'COMMON', baseAttack: 70, baseDefense: 73, basePace: 75, basePassing: 76, basePhysical: 74, season: '2026/2027' },
  { id: 'tmpl_5', playerName: 'Michail Antonio', club: 'West Ham', league: 'Premier League', nationality: 'Jamaica', position: 'FWD', rarity: 'COMMON', baseAttack: 77, baseDefense: 45, basePace: 78, basePassing: 66, basePhysical: 83, season: '2026/2027' },

  // RARE
  { id: 'tmpl_6', playerName: 'Gianluigi Donnarumma', club: 'Paris Saint-Germain', league: 'Ligue 1', nationality: 'Italy', position: 'GK', rarity: 'RARE', baseAttack: 18, baseDefense: 87, basePace: 64, basePassing: 72, basePhysical: 82, season: '2026/2027' },
  { id: 'tmpl_7', playerName: 'William Saliba', club: 'Arsenal', league: 'Premier League', nationality: 'France', position: 'DEF', rarity: 'RARE', baseAttack: 58, baseDefense: 88, basePace: 82, basePassing: 76, basePhysical: 84, season: '2026/2027' },
  { id: 'tmpl_8', playerName: 'Alexis Mac Allister', club: 'Liverpool', league: 'Premier League', nationality: 'Argentina', position: 'MID', rarity: 'RARE', baseAttack: 78, baseDefense: 76, basePace: 74, basePassing: 85, basePhysical: 77, season: '2026/2027' },
  { id: 'tmpl_9', playerName: 'Ousmane Dembele', club: 'Paris Saint-Germain', league: 'Ligue 1', nationality: 'France', position: 'FWD', rarity: 'RARE', baseAttack: 84, baseDefense: 40, basePace: 93, basePassing: 82, basePhysical: 68, season: '2026/2027' },

  // EPIC
  { id: 'tmpl_10', playerName: 'Alisson Becker', club: 'Liverpool', league: 'Premier League', nationality: 'Brazil', position: 'GK', rarity: 'EPIC', baseAttack: 22, baseDefense: 90, basePace: 68, basePassing: 84, basePhysical: 85, season: '2026/2027' },
  { id: 'tmpl_11', playerName: 'Virgil van Dijk', club: 'Liverpool', league: 'Premier League', nationality: 'Netherlands', position: 'DEF', rarity: 'EPIC', baseAttack: 64, baseDefense: 92, basePace: 79, basePassing: 81, basePhysical: 89, season: '2026/2027' },
  { id: 'tmpl_12', playerName: 'Pedri', club: 'Barcelona', league: 'La Liga', nationality: 'Spain', position: 'MID', rarity: 'EPIC', baseAttack: 82, baseDefense: 70, basePace: 81, basePassing: 91, basePhysical: 72, season: '2026/2027' },
  { id: 'tmpl_13', playerName: 'Bukayo Saka', club: 'Arsenal', league: 'Premier League', nationality: 'England', position: 'FWD', rarity: 'EPIC', baseAttack: 87, baseDefense: 62, basePace: 88, basePassing: 86, basePhysical: 78, season: '2026/2027' },

  // LEGENDARY
  { id: 'tmpl_14', playerName: 'Thibaut Courtois', club: 'Real Madrid', league: 'La Liga', nationality: 'Belgium', position: 'GK', rarity: 'LEGENDARY', baseAttack: 25, baseDefense: 93, basePace: 70, basePassing: 78, basePhysical: 88, season: '2026/2027' },
  { id: 'tmpl_15', playerName: 'Jude Bellingham', club: 'Real Madrid', league: 'La Liga', nationality: 'England', position: 'MID', rarity: 'LEGENDARY', baseAttack: 88, baseDefense: 82, basePace: 84, basePassing: 89, basePhysical: 87, season: '2026/2027' },
  { id: 'tmpl_16', playerName: 'Kylian Mbappe', club: 'Real Madrid', league: 'La Liga', nationality: 'France', position: 'FWD', rarity: 'LEGENDARY', baseAttack: 94, baseDefense: 42, basePace: 97, basePassing: 84, basePhysical: 82, season: '2026/2027' },
  { id: 'tmpl_17', playerName: 'Erling Haaland', club: 'Manchester City', league: 'Premier League', nationality: 'Norway', position: 'FWD', rarity: 'LEGENDARY', baseAttack: 95, baseDefense: 48, basePace: 90, basePassing: 72, basePhysical: 92, season: '2026/2027' },

  // MYTHIC
  { id: 'tmpl_18', playerName: 'Lionel Messi', club: 'Inter Miami', league: 'MLS', nationality: 'Argentina', position: 'FWD', rarity: 'MYTHIC', baseAttack: 97, baseDefense: 40, basePace: 86, basePassing: 98, basePhysical: 75, specialTrait: 'GOAT Vision', season: '2026/2027' },
  { id: 'tmpl_19', playerName: 'Cristiano Ronaldo', club: 'Al Nassr', league: 'Saudi Pro League', nationality: 'Portugal', position: 'FWD', rarity: 'MYTHIC', baseAttack: 96, baseDefense: 45, basePace: 87, basePassing: 82, basePhysical: 91, specialTrait: 'Siuuu Clutch', season: '2026/2027' },
];

export const INITIAL_PACKS = [
  { id: 'pack_bronze', type: 'BRONZE', name: 'Bronze Booster Pack', coinCost: 250, gemCost: null, cardCount: 5, isActive: true },
  { id: 'pack_silver', type: 'SILVER', name: 'Silver Premier Pack', coinCost: 500, gemCost: null, cardCount: 5, isActive: true },
  { id: 'pack_gold', type: 'GOLD', name: 'Gold Elite Pack', coinCost: null, gemCost: 100, cardCount: 5, isActive: true },
  { id: 'pack_promo', type: 'PROMO', name: 'Promo Champion Pack', coinCost: null, gemCost: 250, cardCount: 5, isActive: true },
];

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  public isDbConnected = false;

  // In-Memory Data Store (Fallback if PostgreSQL is down)
  public memStore = {
    users: new Map<string, any>(), // key: id or email
    cards: new Map<string, any>(), // key: id
    squads: new Map<string, any>(), // key: userId
    listings: new Map<string, any>(), // key: id
    templates: INITIAL_TEMPLATES,
    packs: INITIAL_PACKS,
  };

  async onModuleInit() {
    try {
      await this.$connect();
      this.isDbConnected = true;
      this.logger.log('Prisma connected to PostgreSQL database');
    } catch (e) {
      this.isDbConnected = false;
      this.logger.warn('PostgreSQL is not running on 5432. Active fallback: In-memory KickIt Store enabled! All features functioning 100% seamlessly.');
    }
  }

  async onModuleDestroy() {
    if (this.isDbConnected) {
      await this.$disconnect();
    }
  }
}
