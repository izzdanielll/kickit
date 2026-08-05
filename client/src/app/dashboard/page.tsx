'use client';

import {
  CircleDollarSign,
  Gem,
  Home,
  LayoutGrid,
  LogOut,
  Package,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
  X,
  CheckCircle,
  AlertCircle,
  Tag,
  Info,
} from 'lucide-react';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';

type Tab = 'play' | 'club' | 'shop' | 'market' | 'squads';

interface CardTemplate {
  id: string;
  playerName: string;
  club: string;
  league: string;
  nationality: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
  baseAttack: number;
  baseDefense: number;
  basePace: number;
  basePassing: number;
  basePhysical: number;
  specialTrait?: string;
  season: string;
}

interface PlayerCard {
  id: string;
  ownerId: string;
  templateId: string;
  template: CardTemplate;
  level: number;
  xp: number;
  isLocked: boolean;
  acquiredAt?: string;
  listings?: { id: string; price: number; currency: 'COINS' | 'GEMS' }[];
}

interface PackDefinition {
  id: string;
  type: string;
  name: string;
  coinCost: number | null;
  gemCost: number | null;
  cardCount: number;
}

interface Listing {
  id: string;
  cardId: string;
  sellerId: string;
  price: number;
  currency: 'COINS' | 'GEMS';
  status: string;
  seller: { id: string; username: string };
  card: PlayerCard;
}

interface SquadSlot {
  slotIndex: number;
  cardId: string;
  card?: PlayerCard;
}

interface ActiveSquad {
  id: string;
  name: string;
  formation: string;
  squadCards: { id: string; slotIndex: number; card: PlayerCard }[];
}

interface Gameweek {
  id: string;
  number: number;
  status: 'UPCOMING' | 'OPEN' | 'LOCKED' | 'SETTLING' | 'COMPLETED';
  startTime: string;
  lockTime: string;
  endTime: string;
  entry: { totalScore: number; rank: number | null } | null;
}

interface LeaderboardRow { rank: number; userId: string; username: string; totalScore: number }

const PACK_ODDS: Record<string, { COMMON: string; RARE: string; EPIC: string; LEGENDARY: string; MYTHIC: string }> = {
  BRONZE: { COMMON: '70.0%', RARE: '20.0%', EPIC: '7.0%', LEGENDARY: '2.5%', MYTHIC: '0.5%' },
  SILVER: { COMMON: '50.0%', RARE: '32.0%', EPIC: '12.0%', LEGENDARY: '5.0%', MYTHIC: '1.0%' },
  GOLD: { COMMON: '30.0%', RARE: '40.0%', EPIC: '20.0%', LEGENDARY: '8.0%', MYTHIC: '2.0%' },
  PROMO: { COMMON: '15.0%', RARE: '35.0%', EPIC: '30.0%', LEGENDARY: '15.0%', MYTHIC: '5.0%' },
};

type PlayerPosition = CardTemplate['position'];
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

const RARITY_RANK: Record<CardTemplate['rarity'], number> = {
  COMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
  MYTHIC: 5,
};

const cardOverall = (card: PlayerCard) =>
  Math.round(
    (card.template.baseAttack +
      card.template.baseDefense +
      card.template.basePace +
      card.template.basePassing +
      card.template.basePhysical) /
      5,
  ) +
  (card.level - 1);

export default function DashboardPage() {
  const { user, isLoading, logout, refreshUser, updateUserCoinsGems } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('play');

  // ── States ──────────────────────────────────────────────────
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [packs, setPacks] = useState<PackDefinition[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [squad, setSquad] = useState<ActiveSquad | null>(null);
  const [gameweek, setGameweek] = useState<Gameweek | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  // Filters & Loading
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [rarityFilter, setRarityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collectionSort, setCollectionSort] = useState<CollectionSort>('newest');
  const [collectionStatus, setCollectionStatus] = useState<'ALL' | 'AVAILABLE' | 'LISTED'>('ALL');
  const [marketTab, setMarketTab] = useState<'browse' | 'my-listings'>('browse');
  const [marketNotice, setMarketNotice] = useState<string | null>(null);
  const [cancellingListingId, setCancellingListingId] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  // Redirect unauthenticated users
  useEffect(() => {
    if (!isLoading && !user) router.push('/auth?mode=login');
  }, [user, isLoading, router]);

  // ── Data Fetching ───────────────────────────────────────────
  const fetchCollection = useCallback(async () => {
    try {
      const res = await fetch('/api/cards');
      if (res.ok) setCards(await res.json());
    } catch (e) {
      console.error('Error fetching cards:', e);
    }
  }, []);

  const fetchPacks = useCallback(async () => {
    try {
      const res = await fetch('/api/packs');
      if (res.ok) setPacks(await res.json());
    } catch (e) {
      console.error('Error fetching packs:', e);
    }
  }, []);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch('/api/marketplace/listings');
      if (res.ok) setListings(await res.json());
      const myRes = await fetch('/api/marketplace/my-listings');
      if (myRes.ok) setMyListings(await myRes.json());
    } catch (e) {
      console.error('Error fetching market:', e);
    }
  }, []);

  const fetchSquad = useCallback(async () => {
    try {
      const res = await fetch('/api/squads/active');
      if (res.ok) {
        const data: ActiveSquad = await res.json();
        setSquad(data);
        if (data.formation) setSelectedFormation(data.formation);
        const slots: (PlayerCard | null)[] = Array(7).fill(null);
        data.squadCards?.forEach((sc) => {
          if (sc.slotIndex >= 0 && sc.slotIndex < 7) {
            slots[sc.slotIndex] = sc.card;
          }
        });
        setSquadSlots(slots);
      }
    } catch (e) {
      console.error('Error fetching squad:', e);
    }
  }, []);

  const fetchGameweek = useCallback(async () => {
    try {
      const response = await fetch('/api/gameweeks/current', { cache: 'no-store' });
      if (!response.ok) return;
      const current: Gameweek | null = await response.json();
      setGameweek(current);
      if (!current) return setLeaderboard([]);
      const leaderboardResponse = await fetch(`/api/gameweeks/${current.id}/leaderboard?limit=5`, { cache: 'no-store' });
      if (leaderboardResponse.ok) setLeaderboard((await leaderboardResponse.json()).data);
    } catch (error) {
      console.error('Error fetching gameweek:', error);
    }
  }, []);

  // Load data based on tab selection
  useEffect(() => {
    if (!user) return;
    if (activeTab === 'play') void fetchGameweek();
    if (activeTab === 'club') void fetchCollection();
    if (activeTab === 'shop') void fetchPacks();
    if (activeTab === 'market') void fetchMarket();
    if (activeTab === 'squads') {
      void fetchCollection();
      void fetchSquad();
    }
  }, [activeTab, user, fetchCollection, fetchPacks, fetchMarket, fetchSquad, fetchGameweek]);

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
    return listings.filter((l) => {
      if (l.sellerId === user?.id) return false;
      if (posFilter !== 'ALL' && l.card.template.position !== posFilter) return false;
      if (rarityFilter !== 'ALL' && l.card.template.rarity !== rarityFilter) return false;
      if (searchQuery.trim()) {
        const name = l.card.template.playerName.toLowerCase();
        if (!name.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [listings, posFilter, rarityFilter, searchQuery, user?.id]);

  // ── Actions ─────────────────────────────────────────────────
  const handleOpenPack = async (packId: string) => {
    setOpeningPack(true);
    const idempotencyKey = packRequestKeys.current.get(packId) ?? crypto.randomUUID();
    packRequestKeys.current.set(packId, idempotencyKey);
    try {
      const res = await fetch('/api/packs/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId, idempotencyKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        packRequestKeys.current.delete(packId);
        alert(data.message || 'Failed to open pack');
        return;
      }
      setRevealedCards(data.cards);
      packRequestKeys.current.delete(packId);
      if (data.user) {
        updateUserCoinsGems(data.user.coins, data.user.gems);
      } else {
        await refreshUser();
      }
    } catch (e) {
      alert('Error opening pack');
    } finally {
      setOpeningPack(false);
    }
  };

  const handleCreateListing = async () => {
    if (!selectedCard) return;
    setIsSelling(true);
    try {
      const res = await fetch('/api/marketplace/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: selectedCard.id,
          price: Number(sellPrice),
          currency: sellCurrency,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to create listing');
        return;
      }
      alert('Card successfully listed on the Marketplace!');
      setSelectedCard(null);
      void fetchCollection();
    } catch (e) {
      alert('Error creating listing');
    } finally {
      setIsSelling(false);
    }
  };

  const handleBuyListing = async () => {
    if (!buyingListing) return;
    if (buyingListing.sellerId === user?.id) {
      setBuyingListing(null);
      alert('You cannot purchase your own listing. Use My Listings to cancel it.');
      return;
    }
    setIsPurchasing(true);
    try {
      const res = await fetch(`/api/marketplace/buy/${buyingListing.id}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Purchase failed');
        return;
      }
      alert('Purchase successful! Card added to your collection.');
      setBuyingListing(null);
      if (data.user) updateUserCoinsGems(data.user.coins, data.user.gems);
      else await refreshUser();
      void fetchMarket();
    } catch (e) {
      alert('Error purchasing listing');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleCancelListing = async (id: string) => {
    setCancellingListingId(id);
    setMarketNotice(null);
    try {
      const res = await fetch(`/api/marketplace/listings/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setMyListings((current) =>
          current.map((listing) =>
            listing.id === id ? { ...listing, status: 'CANCELLED' } : listing,
          ),
        );
        setListings((current) => current.filter((listing) => listing.id !== id));
        setMarketNotice('Listing cancelled successfully.');
        await fetchMarket();
      } else {
        setMarketNotice(data.message || 'Unable to cancel the listing.');
      }
    } catch (e) {
      setMarketNotice('Unable to cancel the listing. Please try again.');
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

      const res = await fetch('/api/squads/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formation: selectedFormation,
          slots: slotsToSave,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSquadNotice(`❌ ${data.message || 'Failed to save squad'}`);
        return;
      }
      setSquadNotice(`✅ Squad saved! Avg OVR: ${data.avgOvr} (Cap: ${data.ratingCap})`);
      void fetchSquad();
    } catch (e) {
      setSquadNotice('❌ Error saving squad');
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
  };

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
          <button className="topbar-icon" aria-label="Rewards"><Trophy size={18} /></button>
          <button className="profile-menu">
            <span className="profile-avatar">{user.username.charAt(0).toUpperCase()}</span>
            <b>{user.username}</b>
            <span>⌄</span>
          </button>
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
          <div className="pitch-stage">
            <div className="pitch-crowd" aria-hidden="true" />
            <div className="pitch-lines" aria-hidden="true"><span /><i /><b /></div>
            <section className="play-panel animate-fade-in">
              <div className="play-kicker"><Sparkles size={15} /> KickIt tournaments</div>
              <h1>YOUR CLUB.<br /><span>YOUR GLORY.</span></h1>
              <p>Choose a competition, build your 5-a-side, and turn real-world football into points.</p>
              <div className="competition-card available">
                <div className="competition-banner"><span className="competition-badge">{gameweek?.status ?? 'SCHEDULED'}</span><span>GAMEWEEK {String(gameweek?.number ?? 1).padStart(2, '0')}</span></div>
                <div className="competition-body"><Trophy size={25} /><div><b>Rising Stars Cup</b><small>{gameweek ? `Squad lock: ${new Date(gameweek.lockTime).toLocaleString()}` : 'The next gameweek is being scheduled'}</small></div></div>
                {gameweek?.entry && <div className="competition-body"><Users size={22} /><div><b>Your rank: {gameweek.entry.rank ? `#${gameweek.entry.rank}` : 'Pending'}</b><small>{gameweek.entry.totalScore} points</small></div></div>}
                {leaderboard.length > 0 && <div className="competition-body"><Trophy size={22} /><div><b>Leaders</b><small>{leaderboard.map((row) => `${row.rank}. ${row.username} (${row.totalScore})`).join(' · ')}</small></div></div>}
              </div>
              <div className="competition-card locked">
                <div className="competition-banner"><span>COMING NEXT</span></div>
                <div className="competition-body"><Shield size={25} /><div><b>Champions Circuit</b><small>Opens after Gameweek 01</small></div></div>
              </div>
              <button className="btn btn-primary play-cta" onClick={() => setActiveTab('squads')}>
                Build my squad <span>→</span>
              </button>
            </section>
            <div className="stage-caption"><span className="pulse-dot" /> LIVE GAMEWEEK · BUILD BEFORE FRIDAY 18:00 UTC</div>
          </div>
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
            <div className="cards-grid">
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

            {marketTab === 'browse' ? (
              <>
                <div className="filters-bar">
                  <input
                    type="text"
                    placeholder="Search market by player..."
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
                </div>

                <div className="marketplace-grid">
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
              </>
            ) : (
              <div className="marketplace-grid">
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
                  <small style={{ color: '#94a3b8' }}>Formation: {selectedFormation}</small>
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
                  </div>

                  <button className="btn btn-primary" disabled={savingSquad} onClick={handleSaveSquad}>
                    {savingSquad ? 'Saving...' : 'Save Squad'}
                  </button>
                </div>
              </div>

              {squadNotice && (
                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {squadNotice}
                </div>
              )}

              {/* Pitch Sockets */}
              <div className="pitch-socket-board">
                {/* Row 1: Forward(s) */}
                <div className="pitch-row">
                  <div className="pitch-socket filled" onClick={() => setActivePickerSlot(4)}>
                    <span className="socket-position-label">{FORMATION_POSITIONS[selectedFormation][4]}</span>
                    {squadSlots[4] ? (
                      <div><b>{squadSlots[4]!.template.playerName}</b></div>
                    ) : (
                      <span>+ Select {FORMATION_POSITIONS[selectedFormation][4]}</span>
                    )}
                  </div>
                </div>

                {/* Row 2: Midfielder(s) */}
                <div className="pitch-row">
                  <div className="pitch-socket filled" onClick={() => setActivePickerSlot(2)}>
                    <span className="socket-position-label">{FORMATION_POSITIONS[selectedFormation][2]}</span>
                    {squadSlots[2] ? (
                      <div><b>{squadSlots[2]!.template.playerName}</b></div>
                    ) : (
                      <span>+ Select {FORMATION_POSITIONS[selectedFormation][2]}</span>
                    )}
                  </div>
                  <div className="pitch-socket filled" onClick={() => setActivePickerSlot(3)}>
                    <span className="socket-position-label">{FORMATION_POSITIONS[selectedFormation][3]}</span>
                    {squadSlots[3] ? (
                      <div><b>{squadSlots[3]!.template.playerName}</b></div>
                    ) : (
                      <span>+ Select {FORMATION_POSITIONS[selectedFormation][3]}</span>
                    )}
                  </div>
                </div>

                {/* Row 3: Defender(s) */}
                <div className="pitch-row">
                  <div className="pitch-socket filled" onClick={() => setActivePickerSlot(1)}>
                    <span className="socket-position-label">{FORMATION_POSITIONS[selectedFormation][1]}</span>
                    {squadSlots[1] ? (
                      <div><b>{squadSlots[1]!.template.playerName}</b></div>
                    ) : (
                      <span>+ Select {FORMATION_POSITIONS[selectedFormation][1]}</span>
                    )}
                  </div>
                </div>

                {/* Row 4: Goalkeeper */}
                <div className="pitch-row">
                  <div className="pitch-socket filled" onClick={() => setActivePickerSlot(0)}>
                    <span className="socket-position-label">{FORMATION_POSITIONS[selectedFormation][0]}</span>
                    {squadSlots[0] ? (
                      <div><b>{squadSlots[0]!.template.playerName}</b></div>
                    ) : (
                      <span>+ Select {FORMATION_POSITIONS[selectedFormation][0]}</span>
                    )}
                  </div>
                </div>

                {/* Substitutes Bench */}
                <div className="subs-bench-row">
                  <div className="pitch-socket" onClick={() => setActivePickerSlot(5)}>
                    <span className="socket-position-label">SUB 1</span>
                    {squadSlots[5] ? <div><b>{squadSlots[5]!.template.playerName}</b></div> : <span>+ Bench</span>}
                  </div>
                  <div className="pitch-socket" onClick={() => setActivePickerSlot(6)}>
                    <span className="socket-position-label">SUB 2</span>
                    {squadSlots[6] ? <div><b>{squadSlots[6]!.template.playerName}</b></div> : <span>+ Bench</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CARD DETAIL & SELL MODAL */}
        {selectedCard && (
          <div className="modal-overlay" onClick={() => setSelectedCard(null)}>
            <div className="modal-card-dialog animate-fade-in" onClick={(e) => e.stopPropagation()}>
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
            <div className="modal-card-dialog animate-fade-in" style={{ width: 'min(100%, 750px)' }} onClick={(e) => e.stopPropagation()}>
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
            <div className="modal-card-dialog animate-fade-in" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setBuyingListing(null)}><X size={20} /></button>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h2>Buy {buyingListing.card.template.playerName}?</h2>
                <p>Price: <b>{buyingListing.price} {buyingListing.currency}</b></p>
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
            <div className="modal-card-dialog animate-fade-in" style={{ width: 'min(100%, 600px)' }} onClick={(e) => e.stopPropagation()}>
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
            <div className="modal-card-dialog" onClick={(e) => e.stopPropagation()}>
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
