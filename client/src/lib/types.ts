export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
export type Currency = 'COINS' | 'GEMS';

export interface CardTemplate {
  id: string;
  playerName: string;
  club: string;
  league: string;
  nationality: string;
  position: Position;
  rarity: Rarity;
  baseAttack: number;
  baseDefense: number;
  basePace: number;
  basePassing: number;
  basePhysical: number;
  specialTrait?: string;
  season: string;
}

export interface PlayerCard {
  id: string;
  ownerId: string;
  templateId: string;
  template: CardTemplate;
  level: number;
  xp: number;
  isLocked: boolean;
  acquiredAt?: string;
  listings?: { id: string; price: number; currency: Currency }[];
}

export interface PackDefinition {
  id: string;
  type: string;
  name: string;
  coinCost: number | null;
  gemCost: number | null;
  cardCount: number;
}

export interface Listing {
  id: string;
  cardId: string;
  sellerId: string;
  price: number;
  currency: Currency;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt?: string;
  updatedAt?: string;
  seller: { id: string; username: string };
  buyer?: { id: string; username: string } | null;
  card: PlayerCard;
}

export interface ActiveSquad {
  id: string;
  name: string;
  formation: string;
  squadCards: { id: string; slotIndex: number; card: PlayerCard }[];
}

export interface Gameweek {
  id: string;
  number: number;
  status: 'UPCOMING' | 'OPEN' | 'LOCKED' | 'SETTLING' | 'COMPLETED';
  startTime: string;
  lockTime: string;
  endTime: string;
  settledAt?: string | null;
  entry: { totalScore: number; rank: number | null } | null;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  totalScore: number;
}

export interface EntryCardScore {
  slotIndex: number;
  playerName: string;
  position: Position;
  rarity: Rarity;
  basePoints: number;
  multiplier: number;
  totalPoints: number;
}

export interface GameweekEntryDetails {
  entry: { id: string; totalScore: number; rank: number | null };
  cards: EntryCardScore[];
}

export interface GameweekHistoryItem extends Omit<Gameweek, 'entry'> {
  entry: Gameweek['entry'];
}
