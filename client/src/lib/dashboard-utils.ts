import type { PlayerCard } from './types';

export function cardOverall(card: PlayerCard) {
  return Math.round(
    (card.template.baseAttack +
      card.template.baseDefense +
      card.template.basePace +
      card.template.basePassing +
      card.template.basePhysical) / 5,
  ) + (card.level - 1);
}

export function formatCountdown(target: string, now: number) {
  const remaining = Math.max(0, new Date(target).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  if (remaining === 0) return 'due now';
  return [days ? `${days}d` : '', `${hours}h`, `${minutes}m`].filter(Boolean).join(' ');
}

export interface MarketplaceFilters {
  page: number;
  search: string;
  club: string;
  position: string;
  rarity: string;
  currency: string;
  sort: string;
  minPrice: string;
  maxPrice: string;
}

export function marketplaceParams(filters: MarketplaceFilters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: '24', sort: filters.sort });
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.club.trim()) params.set('club', filters.club.trim());
  if (filters.position !== 'ALL') params.set('position', filters.position);
  if (filters.rarity !== 'ALL') params.set('rarity', filters.rarity);
  if (filters.currency !== 'ALL') params.set('currency', filters.currency);
  if (filters.minPrice) params.set('minPrice', filters.minPrice);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  return params;
}
