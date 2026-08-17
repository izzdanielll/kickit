'use client';

import { AlertCircle, Clock3, RefreshCw, Shield, Sparkles, Trophy, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, errorMessage } from '@/lib/api';
import type { Gameweek, GameweekEntryDetails, GameweekHistoryItem, LeaderboardRow } from '@/lib/types';
import { formatCountdown } from '@/lib/dashboard-utils';

interface Props {
  userId: string;
  onBuildSquad: () => void;
}

export function PlayTab({ userId, onBuildSquad }: Props) {
  const [gameweek, setGameweek] = useState<Gameweek | null>(null);
  const [leaders, setLeaders] = useState<LeaderboardRow[]>([]);
  const [details, setDetails] = useState<GameweekEntryDetails | null>(null);
  const [history, setHistory] = useState<GameweekHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await apiRequest<Gameweek | null>('/api/gameweeks/current');
      setGameweek(current);
      const [historyResult, leaderboardResult, detailResult] = await Promise.all([
        apiRequest<GameweekHistoryItem[]>('/api/gameweeks/history?limit=5'),
        current
          ? apiRequest<{ data: LeaderboardRow[] }>(`/api/gameweeks/${current.id}/leaderboard?limit=10`)
          : Promise.resolve({ data: [] }),
        current?.entry
          ? apiRequest<GameweekEntryDetails | null>(`/api/gameweeks/${current.id}/my-entry`)
          : Promise.resolve(null),
      ]);
      setHistory(historyResult);
      setLeaders(leaderboardResult.data);
      setDetails(detailResult);
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to load the current competition.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const deadline = useMemo(() => {
    if (!gameweek) return null;
    if (gameweek.status === 'UPCOMING') return { label: 'Opens in', value: formatCountdown(gameweek.startTime, now) };
    if (gameweek.status === 'OPEN') return { label: 'Squad locks in', value: formatCountdown(gameweek.lockTime, now) };
    if (gameweek.status === 'LOCKED' || gameweek.status === 'SETTLING') return { label: 'Results expected in', value: formatCountdown(gameweek.endTime, now) };
    return { label: 'Status', value: 'Final results' };
  }, [gameweek, now]);

  if (loading) {
    return <div className="play-dashboard"><div className="skeleton-card" /><div className="skeleton-grid"><div /><div /></div></div>;
  }

  if (error) {
    return (
      <div className="play-dashboard empty-panel" role="alert">
        <AlertCircle size={30} /><h2>Competition data is unavailable</h2><p>{error}</p>
        <button className="btn btn-primary" onClick={() => void load()}><RefreshCw size={16} /> Retry</button>
      </div>
    );
  }

  return (
    <div className="play-dashboard animate-fade-in">
      <section className="gameweek-hero">
        <div>
          <div className="play-kicker"><Sparkles size={15} /> KickIt weekly competition</div>
          <h1>{gameweek ? `GAMEWEEK ${String(gameweek.number).padStart(2, '0')}` : 'NEXT GAMEWEEK'}</h1>
          <p>{gameweek ? 'Your real-world football performance hub.' : 'The next competition is being scheduled.'}</p>
        </div>
        {gameweek && <span className={`status-chip status-${gameweek.status.toLowerCase()}`}>{gameweek.status}</span>}
      </section>

      <div className="gameweek-stat-grid">
        <article><Clock3 /><span>{deadline?.label ?? 'Schedule'}</span><b>{deadline?.value ?? 'Coming soon'}</b></article>
        <article><Trophy /><span>Your score</span><b>{gameweek?.entry?.totalScore ?? 0} pts</b></article>
        <article><Users /><span>Your rank</span><b>{gameweek?.entry?.rank ? `#${gameweek.entry.rank}` : gameweek?.entry ? 'Pending' : 'Not entered'}</b></article>
      </div>

      {!gameweek?.entry && gameweek?.status === 'OPEN' && (
        <div className="entry-callout"><Shield size={22} /><div><b>Build a valid squad before the lock</b><span>Your active five starters will be enrolled automatically.</span></div><button className="btn btn-primary" onClick={onBuildSquad}>Build squad</button></div>
      )}

      <div className="play-data-grid">
        <section className="data-panel">
          <div className="data-panel-heading"><div><span>Live table</span><h2>Leaderboard</h2></div><button aria-label="Refresh competition" onClick={() => void load()}><RefreshCw size={16} /></button></div>
          {leaders.length ? (
            <div className="leaderboard-list">{leaders.map((row) => <div className={row.userId === userId ? 'is-user' : ''} key={row.userId}><b>#{row.rank}</b><span>{row.username}{row.userId === userId ? ' (you)' : ''}</span><strong>{row.totalScore}</strong></div>)}</div>
          ) : <p className="panel-empty">Rankings appear after squads are enrolled.</p>}
        </section>

        <section className="data-panel">
          <div className="data-panel-heading"><div><span>Your five</span><h2>Point breakdown</h2></div></div>
          {details?.cards.length ? (
            <div className="score-list">{details.cards.map((card) => <div key={card.slotIndex}><span><b>{card.playerName}</b><small>{card.position} · {card.rarity} · {card.multiplier.toFixed(2)}×</small></span><strong>{card.totalPoints} pts</strong></div>)}</div>
          ) : <p className="panel-empty">Your five-player score breakdown appears once enrolled.</p>}
        </section>
      </div>

      <section className="data-panel history-panel">
        <div className="data-panel-heading"><div><span>Form</span><h2>Recent gameweeks</h2></div></div>
        {history.length ? <div className="history-list">{history.map((item) => <div key={item.id}><span>GW {String(item.number).padStart(2, '0')}</span><b>{item.status}</b><strong>{item.entry ? `${item.entry.totalScore} pts · ${item.entry.rank ? `#${item.entry.rank}` : 'unranked'}` : 'No entry'}</strong></div>)}</div> : <p className="panel-empty">No completed gameweeks yet.</p>}
      </section>
    </div>
  );
}
