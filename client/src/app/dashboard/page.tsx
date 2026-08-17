'use client';

import {
  CircleDollarSign,
  Gem,
  Home,
  LayoutGrid,
  LogOut,
  Package,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
  X,
  Tag,
  Info,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { PlayTab } from '@/components/dashboard/PlayTab';
import { apiRequest, errorMessage } from '@/lib/api';
import type { ActiveSquad, Listing, PackDefinition, PlayerCard } from '@/lib/types';
import { cardOverall, marketplaceParams } from '@/lib/dashboard-utils';

type Tab = 'play' | 'club' | 'shop' | 'market' | 'squads';

const PACK_ODDS: Record<string, { COMMON: string; RARE: string; EPIC: string; LEGENDARY: string; MYTHIC: string }> = {
  BRONZE: { COMMON: '70.0%', RARE: '20.0%', EPIC: '7.0%', LEGENDARY: '2.5%', MYTHIC: '0.5%' },
  SILVER: { COMMON: '50.0%', RARE: '32.0%', EPIC: '12.0%', LEGENDARY: '5.0%', MYTHIC: '1.0%' },
  GOLD: { COMMON: '30.0%', RARE: '40.0%', EPIC: '20.0%', LEGENDARY: '8.0%', MYTHIC: '2.0%' },
  PROMO: { COMMON: '15.0%', RARE: '35.0%', EPIC: '30.0%', LEGENDARY: '15.0%', MYTHIC: '5.0%' },
};

type PlayerPosition = PlayerCard['template']['position'];
type CollectionSort =
  | 'newest'
  | 'oldest'
  | 'ovr_desc'
  | 'ovr_asc'
  | 'name_asc'
  | 'name_desc'
  | 'level_desc'
  | 'rarity_desc'
  | 'rarity_asc';

const FORMATION_POSITIONS: Record<string, PlayerPosition[]> = {
  '1-2-1': ['GK', 'DEF', 'MID', 'MID', 'FWD'],
  '2-1-1': ['GK', 'DEF', 'DEF', 'MID', 'FWD'],
  '1-1-2': ['GK', 'DEF', 'MID', 'FWD', 'FWD'],
};

const RARITY_RANK: Record<PlayerCard['template']['rarity'], number> = {
  COMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
  MYTHIC: 5,
};

function SquadSocket({ label, card, onPick, onRemove, bench = false }: {
  label: string;
  card: PlayerCard | null;
  onPick: () => void;
  onRemove: () => void;
  bench?: boolean;
}) {
  return (
    <div
      className={`pitch-socket ${card ? 'filled' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${card ? `Replace ${card.template.playerName}` : 'Select player'} for ${label}`}
      onClick={onPick}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onPick(); }}
    >
      <span className="socket-position-label">{label}</span>
      {card ? <><div><b>{card.template.playerName}</b><small>{cardOverall(card)} OVR · tap to replace</small></div><button className="socket-remove" aria-label={`Remove ${card.template.playerName}`} onClick={(event) => { event.stopPropagation(); onRemove(); }}><Trash2 size={13} /></button></> : <span>+ {bench ? 'Bench' : `Select ${label}`}</span>}
    </div>
  );
}

export default function DashboardPage() {
  const { user, isLoading, logout, refreshUser, updateUserCoinsGems } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('play');

  // ── States ──────────────────────────────────────────────────
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [packs, setPacks] = useState<PackDefinition[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [purchasedListings, setPurchasedListings] = useState<Listing[]>([]);

  // Filters & Loading
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [rarityFilter, setRarityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collectionSort, setCollectionSort] = useState<CollectionSort>('newest');
  const [collectionStatus, setCollectionStatus] = useState<'ALL' | 'AVAILABLE' | 'LISTED'>('ALL');
  const [marketTab, setMarketTab] = useState<'browse' | 'my-listings' | 'purchases'>('browse');
  const [marketNotice, setMarketNotice] = useState<string | null>(null);
  const [cancellingListingId, setCancellingListingId] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [marketSearch, setMarketSearch] = useState('');
  const [marketClub, setMarketClub] = useState('');
  const [debouncedMarketClub, setDebouncedMarketClub] = useState('');
  const [debouncedMarketSearch, setDebouncedMarketSearch] = useState('');
  const [marketPosition, setMarketPosition] = useState('ALL');
  const [marketRarity, setMarketRarity] = useState('ALL');
  const [marketCurrency, setMarketCurrency] = useState('ALL');
  const [marketSort, setMarketSort] = useState('recent');
  const [marketMinPrice, setMarketMinPrice] = useState('');
  const [marketMaxPrice, setMarketMaxPrice] = useState('');
  const [marketPage, setMarketPage] = useState(1);
  const [marketHasMore, setMarketHasMore] = useState(false);
  const [resourceState, setResourceState] = useState<Record<string, 'idle' | 'loading' | 'error'>>({});
  const [resourceError, setResourceError] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  // Modals & Actions
  const [selectedCard, setSelectedCard] = useState<PlayerCard | null>(null);
  const [selectedOddsPack, setSelectedOddsPack] = useState<PackDefinition | null>(null);
  const [sellPrice, setSellPrice] = useState<number>(100);
  const [sellCurrency, setSellCurrency] = useState<'COINS' | 'GEMS'>('COINS');
  const [isSelling, setIsSelling] = useState<boolean>(false);

  const [openingPack, setOpeningPack] = useState<boolean>(false);
  const packRequestKeys = useRef(new Map<string, string>());
  const [revealedCards, setRevealedCards] = useState<PlayerCard[] | null>(null);

  const [buyingListing, setBuyingListing] = useState<Listing | null>(null);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);

  // Squad Builder State
  const [selectedFormation, setSelectedFormation] = useState<string>('1-2-1');
  const [squadSlots, setSquadSlots] = useState<(PlayerCard | null)[]>(Array(7).fill(null));
  const [activePickerSlot, setActivePickerSlot] = useState<number | null>(null);
  const [savingSquad, setSavingSquad] = useState<boolean>(false);
  const [squadNotice, setSquadNotice] = useState<string | null>(null);
  const [squadDirty, setSquadDirty] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!isLoading && !user) router.push('/auth?mode=login');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedMarketSearch(marketSearch);
      setDebouncedMarketClub(marketClub);
      setMarketPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [marketClub, marketSearch]);

  const beginResource = (name: string) => {
    setResourceState((current) => ({ ...current, [name]: 'loading' }));
    setResourceError((current) => ({ ...current, [name]: '' }));
  };
  const failResource = (name: string, cause: unknown) => {
    setResourceState((current) => ({ ...current, [name]: 'error' }));
    setResourceError((current) => ({ ...current, [name]: errorMessage(cause) }));
  };
  const finishResource = (name: string) => setResourceState((current) => ({ ...current, [name]: 'idle' }));

  // ── Data Fetching ───────────────────────────────────────────
  const fetchCollection = useCallback(async () => {
    beginResource('cards');
    try {
      setCards(await apiRequest<PlayerCard[]>('/api/cards?limit=100'));
      finishResource('cards');
    } catch (cause) {
      failResource('cards', cause);
    }
  }, []);

  const fetchPacks = useCallback(async () => {
    beginResource('packs');
    try {
      setPacks(await apiRequest<PackDefinition[]>('/api/packs'));
      finishResource('packs');
    } catch (cause) {
      failResource('packs', cause);
    }
  }, []);

  const fetchMarket = useCallback(async () => {
    beginResource('market');
    try {
      const params = marketplaceParams({ page: marketPage, search: debouncedMarketSearch, club: debouncedMarketClub, position: marketPosition, rarity: marketRarity, currency: marketCurrency, sort: marketSort, minPrice: marketMinPrice, maxPrice: marketMaxPrice });
      const [available, mine, purchases] = await Promise.all([
        apiRequest<Listing[]>(`/api/marketplace/listings?${params}`),
        apiRequest<Listing[]>('/api/marketplace/my-listings?limit=100'),
        apiRequest<Listing[]>('/api/marketplace/my-purchases?limit=100'),
      ]);
      setListings(available);
      setMarketHasMore(available.length === 24);
      setMyListings(mine);
      setPurchasedListings(purchases);
      finishResource('market');
    } catch (cause) {
      failResource('market', cause);
    }
  }, [debouncedMarketClub, debouncedMarketSearch, marketCurrency, marketMaxPrice, marketMinPrice, marketPage, marketPosition, marketRarity, marketSort]);

  const fetchSquad = useCallback(async () => {
    beginResource('squad');
    try {
      const data = await apiRequest<ActiveSquad>('/api/squads/active');
      if (data.formation) setSelectedFormation(data.formation);
      const slots: (PlayerCard | null)[] = Array(7).fill(null);
      data.squadCards?.forEach((sc) => {
        if (sc.slotIndex >= 0 && sc.slotIndex < 7) slots[sc.slotIndex] = sc.card;
      });
      setSquadSlots(slots);
      setSquadDirty(false);
      finishResource('squad');
    } catch (cause) {
      failResource('squad', cause);
    }
  }, []);

  // Load data based on tab selection
  useEffect(() => {
    if (!user) return;
    if (activeTab === 'club') void fetchCollection();
    if (activeTab === 'shop') void fetchPacks();
    if (activeTab === 'market') void fetchMarket();
    if (activeTab === 'squads') {
      void fetchCollection();
      void fetchSquad();
    }
  }, [activeTab, user, fetchCollection, fetchPacks, fetchMarket, fetchSquad]);

  // Keep My Club synchronized without a manual refresh control.
  useEffect(() => {
    if (!user || activeTab !== 'club') return;
    const syncCollection = () => void fetchCollection();
    const interval = window.setInterval(syncCollection, 15_000);
    window.addEventListener('focus', syncCollection);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncCollection);
    };
  }, [activeTab, user, fetchCollection]);

  // Filtered Cards in Collection
  const filteredCards = useMemo(() => {
    const result = cards.filter((c) => {
      if (posFilter !== 'ALL' && c.template.position !== posFilter) return false;
      if (rarityFilter !== 'ALL' && c.template.rarity !== rarityFilter) return false;
      if (collectionStatus === 'AVAILABLE' && c.isLocked) return false;
      if (collectionStatus === 'LISTED' && !c.isLocked) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const searchable = [
          c.template.playerName,
          c.template.club,
          c.template.league,
          c.template.nationality,
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
    return result.sort((a, b) => {
      if (collectionSort === 'oldest') {
        return new Date(a.acquiredAt ?? 0).getTime() - new Date(b.acquiredAt ?? 0).getTime();
      }
      if (collectionSort === 'ovr_desc') return cardOverall(b) - cardOverall(a);
      if (collectionSort === 'ovr_asc') return cardOverall(a) - cardOverall(b);
      if (collectionSort === 'name_asc') {
        return a.template.playerName.localeCompare(b.template.playerName);
      }
      if (collectionSort === 'name_desc') {
        return b.template.playerName.localeCompare(a.template.playerName);
      }
      if (collectionSort === 'level_desc') return b.level - a.level;
      if (collectionSort === 'rarity_desc') {
        return RARITY_RANK[b.template.rarity] - RARITY_RANK[a.template.rarity];
      }
      if (collectionSort === 'rarity_asc') {
        return RARITY_RANK[a.template.rarity] - RARITY_RANK[b.template.rarity];
      }
      return new Date(b.acquiredAt ?? 0).getTime() - new Date(a.acquiredAt ?? 0).getTime();
    });
  }, [cards, posFilter, rarityFilter, searchQuery, collectionSort, collectionStatus]);

  // Filtered Market Listings
  const filteredListings = useMemo(() => {
    return listings.filter((listing) => listing.sellerId !== user?.id);
  }, [listings, user?.id]);

  // ── Actions ─────────────────────────────────────────────────
  const handleOpenPack = async (packId: string) => {
    setOpeningPack(true);
    const idempotencyKey = packRequestKeys.current.get(packId) ?? crypto.randomUUID();
    packRequestKeys.current.set(packId, idempotencyKey);
    try {
      const data = await apiRequest<{ cards: PlayerCard[]; user?: { coins: number; gems: number } }>('/api/packs/open', {
        method: 'POST',
        body: JSON.stringify({ packId, idempotencyKey }),
      });
      setRevealedCards(data.cards);
      packRequestKeys.current.delete(packId);
      if (data.user) {
        updateUserCoinsGems(data.user.coins, data.user.gems);
      } else {
        await refreshUser();
      }
      setToast({ message: 'Pack opened. Your new cards are safely in My Club.', tone: 'success' });
    } catch (cause) {
      setToast({ message: errorMessage(cause, 'Unable to open the pack.'), tone: 'error' });
    } finally {
      setOpeningPack(false);
    }
  };

  const handleCreateListing = async () => {
    if (!selectedCard) return;
    setIsSelling(true);
    try {
      await apiRequest<Listing>('/api/marketplace/listings', {
        method: 'POST',
        body: JSON.stringify({
          cardId: selectedCard.id,
          price: Number(sellPrice),
          currency: sellCurrency,
        }),
      });
      setToast({ message: 'Card listed successfully.', tone: 'success' });
      setSelectedCard(null);
      void fetchCollection();
    } catch (cause) {
      setToast({ message: errorMessage(cause, 'Unable to list this card.'), tone: 'error' });
    } finally {
      setIsSelling(false);
    }
  };

  const handleBuyListing = async () => {
    if (!buyingListing) return;
    if (buyingListing.sellerId === user?.id) {
      setBuyingListing(null);
      setToast({ message: 'Use My Listings to cancel your own listing.', tone: 'error' });
      return;
    }
    setIsPurchasing(true);
    try {
      const data = await apiRequest<{ user?: { coins: number; gems: number } }>(`/api/marketplace/buy/${buyingListing.id}`, {
        method: 'POST',
      });
      setToast({ message: 'Purchase complete. The card is now in My Club.', tone: 'success' });
      setBuyingListing(null);
      if (data.user) updateUserCoinsGems(data.user.coins, data.user.gems);
      else await refreshUser();
      void fetchMarket();
    } catch (cause) {
      setToast({ message: errorMessage(cause, 'Unable to complete the purchase.'), tone: 'error' });
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleCancelListing = async (id: string) => {
    setCancellingListingId(id);
    setMarketNotice(null);
    try {
      await apiRequest<Listing>(`/api/marketplace/listings/${id}`, { method: 'DELETE' });
      setMyListings((current) => current.map((listing) => listing.id === id ? { ...listing, status: 'CANCELLED' } : listing));
      setListings((current) => current.filter((listing) => listing.id !== id));
      setMarketNotice('Listing cancelled successfully.');
      await fetchMarket();
    } catch (cause) {
      setMarketNotice(errorMessage(cause, 'Unable to cancel the listing.'));
    } finally {
      setCancellingListingId(null);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await logout();
    router.replace('/auth?mode=login');
    router.refresh();
  };

  const handleSaveSquad = async () => {
    setSavingSquad(true);
    setSquadNotice(null);
    try {
      const slotsToSave = squadSlots
        .map((card, idx) => (card ? { slotIndex: idx, cardId: card.id } : null))
        .filter(Boolean);

      const data = await apiRequest<{ avgOvr: number; ratingCap: number }>('/api/squads/save', {
        method: 'POST',
        body: JSON.stringify({
          formation: selectedFormation,
          slots: slotsToSave,
        }),
      });
      setSquadNotice(`Squad saved! Avg OVR: ${data.avgOvr} (Cap: ${data.ratingCap})`);
      setToast({ message: 'Your active squad has been saved.', tone: 'success' });
      void fetchSquad();
    } catch (cause) {
      setSquadNotice(errorMessage(cause, 'Unable to save the squad.'));
    } finally {
      setSavingSquad(false);
    }
  };

  const handleFormationChange = (formation: string) => {
    const requiredPositions = FORMATION_POSITIONS[formation];
    setSelectedFormation(formation);
    setSquadSlots((current) =>
      current.map((card, index) => {
        if (index >= 5 || !card) return card;
        return card.template.position === requiredPositions[index] ? card : null;
      }),
    );
    setSquadNotice(null);
    setSquadDirty(true);
  };

  useEffect(() => {
    if (!squadDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [squadDirty]);

  useEffect(() => {
    const modalOpen = Boolean(selectedCard || revealedCards || buyingListing || activePickerSlot !== null || selectedOddsPack);
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSelectedCard(null); setRevealedCards(null); setBuyingListing(null); setActivePickerSlot(null); setSelectedOddsPack(null);
    };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', close); };
  }, [activePickerSlot, buyingListing, revealedCards, selectedCard, selectedOddsPack]);

  // Compute Squad Average OVR
  const starterCards = squadSlots.slice(0, 5).filter(Boolean) as PlayerCard[];
  const squadAvgOvr = useMemo(() => {
    if (starterCards.length === 0) return 0;
    const sum = starterCards.reduce((acc, c) => {
      const base = Math.round(
        (c.template.baseAttack +
          c.template.baseDefense +
          c.template.basePace +
          c.template.basePassing +
          c.template.basePhysical) /
          5,
      );
      return acc + base + (c.level - 1);
    }, 0);
    return Math.round(sum / starterCards.length);
  }, [starterCards]);

  if (isLoading) return <div className="page-loader"><div className="spinner" /></div>;
  if (!user) return null;

  return (
    <main className="club-shell">
      {toast && <div className={`app-toast toast-${toast.tone}`} role="status" aria-live="polite">{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div>}
      {/* Sidebar Navigation */}
      <aside className="club-sidebar">
        <div className="club-brand" style={{ cursor: 'pointer', marginBottom: '20px' }} onClick={() => router.push('/')}>
          <Logo variant="full" size="sm" />
        </div>
        <div className="club-selector">
          <span className="club-selector-icon">⚽</span>
          <span>Football</span>
          <span className="selector-chevron">⌄</span>
        </div>
        <nav className="club-navigation" aria-label="Main navigation">
          {[
            { id: 'play', label: 'Play', icon: Home },
            { id: 'club', label: 'My Club', icon: LayoutGrid },
            { id: 'shop', label: 'Shop', icon: Package },
            { id: 'market', label: 'Market', icon: ShoppingBag },
            { id: 'squads', label: 'Squads', icon: Users },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={activeTab === id ? 'active' : ''}
              onClick={() => setActiveTab(id as Tab)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-wallet">
          <div>
            <span><CircleDollarSign size={15} /> Coins</span>
            <b>{user.coins?.toLocaleString() ?? 500}</b>
          </div>
          <div>
            <span><Gem size={15} /> Gems</span>
            <b>{user.gems ?? 0}</b>
          </div>
          <button onClick={() => setActiveTab('shop')}>
            <span>+</span> Get currency
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <section className="club-main">
        {/* Topbar */}
        <header className="club-topbar">
          <div className="mobile-brand" style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>
            <Logo variant="full" size="sm" showTagline={false} />
          </div>
          <div className="topbar-spacer" />
          <div className="level-progress" aria-label={`Level ${user.level ?? 1}, ${user.xp ?? 0} experience points`}><Trophy size={16} /><span>Level {user.level ?? 1}</span><small>{user.xp ?? 0} XP</small></div>
          <div className="profile-menu">
            <span className="profile-avatar">{user.username.charAt(0).toUpperCase()}</span>
            <b>{user.username}</b>
          </div>
          <button
            className="topbar-icon logout-icon"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Sign out"
          >
            <LogOut size={17} />
          </button>
        </header>

        {/* TAB 1: PLAY */}
        {activeTab === 'play' && (
          <PlayTab userId={user.id} onBuildSquad={() => setActiveTab('squads')} />
        )}

        {/* TAB 2: MY CLUB (COLLECTION) */}
        {activeTab === 'club' && (
          <div className="club-panel-content animate-fade-in">
            <div className="panel-header">
              <h1>My Card Collection ({filteredCards.length})</h1>
            </div>

            {/* Filter Bar */}
            <div className="filters-bar">
              <input
                type="text"
                placeholder="Search player, club, league..."
                className="filter-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="filter-pill-group">
                {['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((pos) => (
                  <button
                    key={pos}
                    className={`filter-pill ${posFilter === pos ? 'active' : ''}`}
                    onClick={() => setPosFilter(pos)}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <div className="filter-pill-group">
                {['ALL', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].map((rarity) => (
                  <button
                    key={rarity}
                    className={`filter-pill ${rarityFilter === rarity ? 'active' : ''}`}
                    onClick={() => setRarityFilter(rarity)}
                  >
                    {rarity}
                  </button>
                ))}
              </div>
              <select
                aria-label="Filter collection status"
                value={collectionStatus}
                onChange={(e) =>
                  setCollectionStatus(e.target.value as 'ALL' | 'AVAILABLE' | 'LISTED')
                }
                style={{
                  background: '#111827',
                  color: '#fff',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
              >
                <option value="ALL">All card statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="LISTED">Listed</option>
              </select>
              <select
                aria-label="Sort card collection"
                value={collectionSort}
                onChange={(e) => setCollectionSort(e.target.value as CollectionSort)}
                style={{
                  background: '#111827',
                  color: '#fff',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
              >
                <option value="newest">Newest acquired</option>
                <option value="oldest">Oldest acquired</option>
                <option value="ovr_desc">Overall: high to low</option>
                <option value="ovr_asc">Overall: low to high</option>
                <option value="level_desc">Level: high to low</option>
                <option value="rarity_desc">Rarity: high to low</option>
                <option value="rarity_asc">Rarity: low to high</option>
                <option value="name_asc">Player: A to Z</option>
                <option value="name_desc">Player: Z to A</option>
              </select>
            </div>

            {/* Collection Grid */}
            {resourceState.cards === 'error' && <div className="inline-error" role="alert">{resourceError.cards}<button onClick={() => void fetchCollection()}>Retry</button></div>}
            {resourceState.cards === 'loading' && !cards.length && <div className="skeleton-grid"><div /><div /><div /></div>}
            {resourceState.cards === 'idle' && !filteredCards.length && <div className="empty-panel"><LayoutGrid size={28} /><h2>No cards found</h2><p>Adjust your filters or open a pack to grow your club.</p><button className="btn btn-primary" onClick={() => setActiveTab('shop')}>Visit pack shop</button></div>}
            <div className="cards-grid" aria-busy={resourceState.cards === 'loading'}>
              {filteredCards.map((card) => {
                const ovr = cardOverall(card);

                return (
                  <div
                    key={card.id}
                    className="card-item"
                    onClick={() => setSelectedCard(card)}
                  >
                    {card.isLocked && <div className="card-badge-locked">Listed</div>}
                    <article className={`tcg-card standalone ${card.template.rarity.toLowerCase()}`}>
                      <div className="tcg-card-top">
                        <span>{card.template.rarity}</span>
                        <Trophy size={15} />
                      </div>
                      <div className="player-silhouette">⚽</div>
                      <div className="tcg-card-meta">
                        <strong>{ovr}</strong>
                        <div>
                          <b>{card.template.playerName}</b>
                          <span>{card.template.position} · {card.template.club}</span>
                        </div>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: SHOP (PACK STORE) */}
        {activeTab === 'shop' && (
          <div className="club-panel-content animate-fade-in">
            <div className="panel-header">
              <h1>Pack Store & Booster Packs</h1>
              <p>Spend Coins or Gems to collect new player cards!</p>
            </div>

            <div className="packs-grid">
              {resourceState.packs === 'error' && <div className="inline-error" role="alert">{resourceError.packs}<button onClick={() => void fetchPacks()}>Retry</button></div>}
              {resourceState.packs === 'loading' && !packs.length && <div className="skeleton-grid"><div /><div /><div /></div>}
              {resourceState.packs === 'idle' && !packs.length && <div className="empty-panel"><Package size={28} /><h2>No packs available</h2><p>The shop is being restocked. Please check again soon.</p></div>}
              {packs.map((pack) => (
                <div key={pack.id} className="pack-card" style={{ position: 'relative' }}>
                  <button
                    className="pack-info-badge"
                    title="View Pack Drop Odds"
                    onClick={() => setSelectedOddsPack(pack)}
                    aria-label={`View ${pack.name} drop odds`}
                  >
                    <Info size={16} />
                  </button>
                  <div className="pack-icon-wrapper">📦</div>
                  <h3>{pack.name}</h3>
                  <p>Contains {pack.cardCount} player cards with guaranteed rarity weights.</p>
                  <div className="pack-cost-container">
                    {pack.coinCost && (
                      <span className="pack-cost coins">
                        <CircleDollarSign size={18} /> {pack.coinCost} Coins
                      </span>
                    )}
                    {pack.gemCost && (
                      <span className="pack-cost gems">
                        <Gem size={18} /> {pack.gemCost} Gems
                      </span>
                    )}
                  </div>
                  <button
                    className="btn btn-primary btn-lg"
                    disabled={openingPack}
                    onClick={() => handleOpenPack(pack.id)}
                  >
                    {openingPack ? 'Opening...' : 'Open Pack'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: MARKETPLACE */}
        {activeTab === 'market' && (
          <div className="club-panel-content animate-fade-in">
            <div className="panel-header">
              <h1>Peer-to-Peer Marketplace</h1>
              <div className="filter-pill-group">
                <button
                  className={`filter-pill ${marketTab === 'browse' ? 'active' : ''}`}
                  onClick={() => setMarketTab('browse')}
                >
                  Browse Market
                </button>
                <button
                  className={`filter-pill ${marketTab === 'my-listings' ? 'active' : ''}`}
                  onClick={() => setMarketTab('my-listings')}
                >
                  My Listings ({myListings.length})
                </button>
                <button
                  className={`filter-pill ${marketTab === 'purchases' ? 'active' : ''}`}
                  onClick={() => setMarketTab('purchases')}
                >
                  Purchases ({purchasedListings.length})
                </button>
              </div>
            </div>
            {marketNotice && (
              <div
                role="status"
                style={{
                  marginBottom: '16px',
                  padding: '10px 14px',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: '8px',
                  background: 'rgba(245,158,11,0.08)',
                }}
              >
                {marketNotice}
              </div>
            )}
            {resourceState.market === 'error' && <div className="inline-error" role="alert">{resourceError.market}<button onClick={() => void fetchMarket()}>Retry</button></div>}

            {marketTab === 'browse' ? (
              <>
                <div className="filters-bar">
                  <input
                    type="text"
                    placeholder="Search player name..."
                    className="filter-search"
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Filter by club..."
                    className="filter-search"
                    value={marketClub}
                    onChange={(event) => setMarketClub(event.target.value)}
                  />
                  <div className="filter-pill-group">
                    {['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((pos) => (
                      <button
                        key={pos}
                        className={`filter-pill ${marketPosition === pos ? 'active' : ''}`}
                        onClick={() => { setMarketPosition(pos); setMarketPage(1); }}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                  <select aria-label="Market rarity" value={marketRarity} onChange={(event) => { setMarketRarity(event.target.value); setMarketPage(1); }}>
                    <option value="ALL">All rarities</option><option value="COMMON">Common</option><option value="RARE">Rare</option><option value="EPIC">Epic</option><option value="LEGENDARY">Legendary</option><option value="MYTHIC">Mythic</option>
                  </select>
                  <select aria-label="Market currency" value={marketCurrency} onChange={(event) => { setMarketCurrency(event.target.value); setMarketPage(1); }}>
                    <option value="ALL">All currencies</option><option value="COINS">Coins</option><option value="GEMS">Gems</option>
                  </select>
                  <input aria-label="Minimum price" className="price-filter" type="number" min="1" placeholder="Min price" value={marketMinPrice} onChange={(event) => { setMarketMinPrice(event.target.value); setMarketPage(1); }} />
                  <input aria-label="Maximum price" className="price-filter" type="number" min="1" placeholder="Max price" value={marketMaxPrice} onChange={(event) => { setMarketMaxPrice(event.target.value); setMarketPage(1); }} />
                  <select aria-label="Sort marketplace" value={marketSort} onChange={(event) => { setMarketSort(event.target.value); setMarketPage(1); }}>
                    <option value="recent">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="rarity_desc">Rarest first</option>
                  </select>
                </div>

                {resourceState.market === 'loading' && !listings.length && <div className="skeleton-grid"><div /><div /><div /></div>}
                {resourceState.market === 'idle' && !filteredListings.length && <div className="empty-panel"><ShoppingBag size={28} /><h2>No matching listings</h2><p>Try widening the filters or check back after other managers list cards.</p></div>}
                <div className="marketplace-grid" aria-busy={resourceState.market === 'loading'}>
                  {filteredListings.map((listing) => {
                    const c = listing.card;
                    const ovr = Math.round(
                      (c.template.baseAttack +
                        c.template.baseDefense +
                        c.template.basePace +
                        c.template.basePassing +
                        c.template.basePhysical) /
                        5,
                    ) + (c.level - 1);

                    return (
                      <div key={listing.id} className="card-item">
                        <article className={`tcg-card standalone ${c.template.rarity.toLowerCase()}`}>
                          <div className="tcg-card-top">
                            <span>{c.template.rarity}</span>
                            <Tag size={15} />
                          </div>
                          <div className="player-silhouette">⚽</div>
                          <div className="tcg-card-meta">
                            <strong>{ovr}</strong>
                            <div>
                              <b>{c.template.playerName}</b>
                              <span>{c.template.position} · {c.template.club}</span>
                            </div>
                          </div>
                        </article>
                        <div className="listing-card-footer">
                          <span className="price-tag">
                            {listing.currency === 'COINS' ? <CircleDollarSign size={16} /> : <Gem size={16} />}
                            {listing.price}
                          </span>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setBuyingListing(listing)}
                          >
                            Buy Card
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="pagination-controls">
                  <button className="btn btn-ghost" disabled={marketPage === 1 || resourceState.market === 'loading'} onClick={() => setMarketPage((page) => Math.max(1, page - 1))}>Previous</button>
                  <span>Page {marketPage}</span>
                  <button className="btn btn-ghost" disabled={!marketHasMore || resourceState.market === 'loading'} onClick={() => setMarketPage((page) => page + 1)}>Next</button>
                </div>
              </>
            ) : marketTab === 'my-listings' ? (
              <div className="marketplace-grid">
                {resourceState.market === 'idle' && !myListings.length && <div className="empty-panel"><Tag size={28} /><h2>No listing history</h2><p>Select an available card in My Club to put it on the market.</p></div>}
                {myListings.map((listing) => {
                  const c = listing.card;
                  return (
                    <div key={listing.id} className="card-item">
                      <article className={`tcg-card standalone ${c.template.rarity.toLowerCase()}`}>
                        <div className="tcg-card-top">
                          <span>{listing.status}</span>
                        </div>
                        <div className="player-silhouette">⚽</div>
                        <div className="tcg-card-meta">
                          <b>{c.template.playerName}</b>
                        </div>
                      </article>
                      <div className="listing-card-footer">
                        <span className="price-tag">{listing.price} {listing.currency}</span>
                        {listing.status === 'ACTIVE' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleCancelListing(listing.id)}
                            disabled={cancellingListingId === listing.id}
                          >
                            {cancellingListingId === listing.id ? 'Cancelling...' : 'Cancel'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="marketplace-grid">
                {resourceState.market === 'idle' && !purchasedListings.length && <div className="empty-panel"><ShoppingBag size={28} /><h2>No purchases yet</h2><p>Cards you buy from other managers will appear here.</p></div>}
                {purchasedListings.map((listing) => (
                  <div key={listing.id} className="card-item">
                    <article className={`tcg-card standalone ${listing.card.template.rarity.toLowerCase()}`}>
                      <div className="tcg-card-top"><span>BOUGHT</span><Tag size={15} /></div>
                      <div className="player-silhouette">⚽</div>
                      <div className="tcg-card-meta"><strong>{cardOverall(listing.card)}</strong><div><b>{listing.card.template.playerName}</b><span>{listing.card.template.position} · from {listing.seller.username}</span></div></div>
                    </article>
                    <div className="listing-card-footer"><span className="price-tag">{listing.price} {listing.currency}</span><small>{listing.updatedAt ? new Date(listing.updatedAt).toLocaleDateString() : 'Completed'}</small></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SQUAD BUILDER */}
        {activeTab === 'squads' && (
          <div className="club-panel-content animate-fade-in">
            <div className="squad-builder-stage">
              <div className="squad-controls-bar">
                <div>
                  <h2>5-a-Side Squad Builder</h2>
                  <small style={{ color: '#94a3b8' }}>{starterCards.length}/5 starters · 2 optional substitutes {squadDirty ? '· Unsaved changes' : ''}</small>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <select
                    value={selectedFormation}
                    onChange={(e) => handleFormationChange(e.target.value)}
                    style={{ background: '#1e293b', color: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <option value="1-2-1">Balanced (1-2-1)</option>
                    <option value="2-1-1">Defensive (2-1-1)</option>
                    <option value="1-1-2">Offensive (1-1-2)</option>
                  </select>

                  <div className="ovr-meter-container">
                    <span>Avg OVR:</span>
                    <span className={`ovr-badge ${squadAvgOvr > 85 ? 'over-cap' : ''}`}>{squadAvgOvr} / 85 Cap</span>
                    <small>{Math.max(0, 85 - squadAvgOvr)} OVR remaining</small>
                  </div>

                  <button className="btn btn-primary" disabled={savingSquad || starterCards.length !== 5 || squadAvgOvr > 85 || !squadDirty} onClick={handleSaveSquad}>
                    {savingSquad ? 'Saving...' : 'Save Squad'}
                  </button>
                </div>
              </div>

              {resourceState.squad === 'error' && <div className="inline-error" role="alert">{resourceError.squad}<button onClick={() => void fetchSquad()}>Retry</button></div>}
              {starterCards.length !== 5 && <div className="squad-guidance">Fill every starting position before saving.</div>}
              {squadAvgOvr > 85 && <div className="inline-error" role="alert">Your starting average is above the 85 OVR competition cap. Replace a starter with a lower-rated card.</div>}

              {squadNotice && (
                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {squadNotice}
                </div>
              )}

              {/* Pitch Sockets */}
              <div className="pitch-socket-board">
                {/* Row 1: Forward(s) */}
                <div className="pitch-row">
                  <SquadSocket label={FORMATION_POSITIONS[selectedFormation][4]} card={squadSlots[4]} onPick={() => setActivePickerSlot(4)} onRemove={() => { setSquadSlots((slots) => slots.map((card, index) => index === 4 ? null : card)); setSquadDirty(true); }} />
                </div>

                {/* Row 2: Midfielder(s) */}
                <div className="pitch-row">
                  <SquadSocket label={FORMATION_POSITIONS[selectedFormation][2]} card={squadSlots[2]} onPick={() => setActivePickerSlot(2)} onRemove={() => { setSquadSlots((slots) => slots.map((card, index) => index === 2 ? null : card)); setSquadDirty(true); }} />
                  <SquadSocket label={FORMATION_POSITIONS[selectedFormation][3]} card={squadSlots[3]} onPick={() => setActivePickerSlot(3)} onRemove={() => { setSquadSlots((slots) => slots.map((card, index) => index === 3 ? null : card)); setSquadDirty(true); }} />
                </div>

                {/* Row 3: Defender(s) */}
                <div className="pitch-row">
                  <SquadSocket label={FORMATION_POSITIONS[selectedFormation][1]} card={squadSlots[1]} onPick={() => setActivePickerSlot(1)} onRemove={() => { setSquadSlots((slots) => slots.map((card, index) => index === 1 ? null : card)); setSquadDirty(true); }} />
                </div>

                {/* Row 4: Goalkeeper */}
                <div className="pitch-row">
                  <SquadSocket label={FORMATION_POSITIONS[selectedFormation][0]} card={squadSlots[0]} onPick={() => setActivePickerSlot(0)} onRemove={() => { setSquadSlots((slots) => slots.map((card, index) => index === 0 ? null : card)); setSquadDirty(true); }} />
                </div>

                {/* Substitutes Bench */}
                <div className="subs-bench-row">
                  <SquadSocket bench label="SUB 1" card={squadSlots[5]} onPick={() => setActivePickerSlot(5)} onRemove={() => { setSquadSlots((slots) => slots.map((card, index) => index === 5 ? null : card)); setSquadDirty(true); }} />
                  <SquadSocket bench label="SUB 2" card={squadSlots[6]} onPick={() => setActivePickerSlot(6)} onRemove={() => { setSquadSlots((slots) => slots.map((card, index) => index === 6 ? null : card)); setSquadDirty(true); }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CARD DETAIL & SELL MODAL */}
        {selectedCard && (
          <div className="modal-overlay" onClick={() => setSelectedCard(null)}>
            <div className="modal-card-dialog animate-fade-in" role="dialog" aria-modal="true" aria-label="Card details" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedCard(null)}><X size={20} /></button>
              <div className="card-detail-layout">
                <h2>{selectedCard.template.playerName}</h2>
                <div className="card-stats-grid">
                  <div className="stat-box"><small>ATT</small><b>{selectedCard.template.baseAttack}</b></div>
                  <div className="stat-box"><small>DEF</small><b>{selectedCard.template.baseDefense}</b></div>
                  <div className="stat-box"><small>PAS</small><b>{selectedCard.template.basePassing}</b></div>
                  <div className="stat-box"><small>PHY</small><b>{selectedCard.template.basePhysical}</b></div>
                </div>

                {!selectedCard.isLocked && (
                  <div style={{ width: '100%', marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h3>Sell Card on Marketplace</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number"
                        min={1}
                        value={sellPrice}
                        onChange={(e) => setSellPrice(Number(e.target.value))}
                        className="input"
                        placeholder="Price"
                      />
                      <select
                        value={sellCurrency}
                        onChange={(e) => setSellCurrency(e.target.value as 'COINS' | 'GEMS')}
                        className="input"
                        style={{ width: '120px' }}
                      >
                        <option value="COINS">Coins</option>
                        <option value="GEMS">Gems</option>
                      </select>
                    </div>
                    <button className="btn btn-primary" disabled={isSelling} onClick={handleCreateListing}>
                      {isSelling ? 'Listing...' : 'Confirm Listing'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* GACHA PACK REVEAL MODAL */}
        {revealedCards && (
          <div className="modal-overlay" onClick={() => setRevealedCards(null)}>
            <div className="modal-card-dialog animate-fade-in" role="dialog" aria-modal="true" aria-label="Pack results" style={{ width: 'min(100%, 750px)' }} onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setRevealedCards(null)}><X size={20} /></button>
              <div className="gacha-reveal-stage">
                <Sparkles size={40} color="#facc15" />
                <h2>Pack Opened! Here are your new cards:</h2>
                <div className="revealed-cards-container">
                  {revealedCards.map((c) => (
                    <div key={c.id} className="revealed-card-wrapper">
                      <article className={`tcg-card standalone ${c.template.rarity.toLowerCase()}`}>
                        <div className="tcg-card-top"><span>{c.template.rarity}</span></div>
                        <div className="player-silhouette">⚽</div>
                        <div className="tcg-card-meta">
                          <b>{c.template.playerName}</b>
                        </div>
                      </article>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary btn-lg" onClick={() => setRevealedCards(null)}>
                  Collect Cards
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BUY CONFIRMATION MODAL */}
        {buyingListing && (
          <div className="modal-overlay" onClick={() => setBuyingListing(null)}>
            <div className="modal-card-dialog animate-fade-in" role="dialog" aria-modal="true" aria-label="Confirm card purchase" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setBuyingListing(null)}><X size={20} /></button>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h2>Buy {buyingListing.card.template.playerName}?</h2>
                <p>Price: <b>{buyingListing.price} {buyingListing.currency}</b></p>
                <small className="purchase-note">You pay the displayed price. A 5% marketplace tax is deducted from the seller&apos;s proceeds.</small>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button className="btn btn-ghost" onClick={() => setBuyingListing(null)}>Cancel</button>
                  <button className="btn btn-primary" disabled={isPurchasing} onClick={handleBuyListing}>
                    {isPurchasing ? 'Purchasing...' : 'Confirm Buy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SQUAD CARD PICKER MODAL */}
        {activePickerSlot !== null && (
          <div className="modal-overlay" onClick={() => setActivePickerSlot(null)}>
            <div className="modal-card-dialog animate-fade-in" role="dialog" aria-modal="true" aria-label="Select squad card" style={{ width: 'min(100%, 600px)' }} onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setActivePickerSlot(null)}><X size={20} /></button>
              <h2>
                Select {activePickerSlot < 5
                  ? FORMATION_POSITIONS[selectedFormation][activePickerSlot]
                  : 'Substitute'}
              </h2>
              <div className="cards-grid" style={{ marginTop: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                {cards
                  .filter((card) => {
                    if (card.isLocked) return false;
                    const alreadyUsed = squadSlots.some(
                      (selected, index) => index !== activePickerSlot && selected?.id === card.id,
                    );
                    if (alreadyUsed) return false;
                    if (activePickerSlot >= 5) return true;
                    return (
                      card.template.position ===
                      FORMATION_POSITIONS[selectedFormation][activePickerSlot]
                    );
                  })
                  .map((card) => (
                    <div
                      key={card.id}
                      className="card-item"
                      onClick={() => {
                        const newSlots = [...squadSlots];
                        newSlots[activePickerSlot] = card;
                        setSquadSlots(newSlots);
                        setSquadDirty(true);
                        setActivePickerSlot(null);
                      }}
                    >
                      <article className={`tcg-card standalone ${card.template.rarity.toLowerCase()}`} style={{ height: '200px' }}>
                        <div className="tcg-card-top"><span>{card.template.position}</span></div>
                        <div className="player-silhouette" style={{ width: '70px', fontSize: '2rem' }}>⚽</div>
                        <div className="tcg-card-meta"><b>{card.template.playerName}</b></div>
                      </article>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* PACK ODDS INFO MODAL */}
        {selectedOddsPack && (
          <div className="modal-overlay animate-fade-in" onClick={() => setSelectedOddsPack(null)}>
            <div className="modal-card-dialog" role="dialog" aria-modal="true" aria-label="Pack rarity odds" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="modal-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedOddsPack(null);
                }}
                aria-label="Close odds info"
              >
                <X size={20} />
              </button>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px', filter: 'drop-shadow(0 0 12px rgba(245,158,11,0.5))' }}>📦</div>
                <h2 style={{ fontFamily: 'var(--font-display)', color: '#fff', fontSize: '1.5rem', marginBottom: '4px' }}>
                  {selectedOddsPack.name}
                </h2>
                <span style={{ fontSize: '0.75rem', color: '#fcd34d', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  Rarity Drop Rates (Per Card Pull)
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(245,158,11,0.03)', padding: '18px', borderRadius: '14px', border: '1px solid rgba(245,158,11,0.2)' }}>
                {(() => {
                  const odds = PACK_ODDS[selectedOddsPack.type] || PACK_ODDS['BRONZE'];
                  const rarityColors: Record<string, { label: string; color: string; border: string; bg: string }> = {
                    MYTHIC: { label: 'Mythic', color: '#fef08a', border: '#f59e0b', bg: 'linear-gradient(135deg, rgba(245,158,11,0.8), rgba(254,240,138,0.9))' },
                    LEGENDARY: { label: 'Legendary', color: '#fcd34d', border: '#b45309', bg: 'linear-gradient(135deg, #b45309, #d4af37)' },
                    EPIC: { label: 'Epic', color: '#e2e8f0', border: '#64748b', bg: 'linear-gradient(135deg, #475569, #cbd5e1)' },
                    RARE: { label: 'Rare', color: '#67e8f9', border: '#0284c7', bg: 'linear-gradient(135deg, #0284c7, #38bdf8)' },
                    COMMON: { label: 'Common', color: '#94a3b8', border: '#475569', bg: 'rgba(148,163,184,0.5)' },
                  };

                  return (Object.keys(rarityColors) as Array<keyof typeof rarityColors>).map((rarityKey) => {
                    const rateStr = odds[rarityKey as keyof typeof odds];
                    const info = rarityColors[rarityKey];
                    const numPercent = parseFloat(rateStr);

                    return (
                      <div key={rarityKey} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: 800, color: info.color, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: info.color, boxShadow: `0 0 8px ${info.color}` }} />
                            {info.label}
                          </span>
                          <b style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: '0.95rem' }}>{rateStr}</b>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '999px', overflow: 'hidden', border: `1px solid rgba(255,255,255,0.1)` }}>
                          <div
                            style={{
                              width: `${Math.max(numPercent, 2)}%`,
                              height: '100%',
                              background: info.bg,
                              borderRadius: '999px',
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
