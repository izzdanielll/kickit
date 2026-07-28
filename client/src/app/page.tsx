'use client';

import { ArrowRight, Check, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';

import { Logo } from '@/components/Logo';

const cards = [
  { name: 'Amara Silva', position: 'MID', rating: 91, rarity: 'MYTHIC', tone: 'mythic' },
  { name: 'Noah Bennett', position: 'FWD', rating: 88, rarity: 'LEGENDARY', tone: 'legendary' },
  { name: 'Luca Moretti', position: 'DEF', rating: 84, rarity: 'EPIC', tone: 'epic' },
];

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="marketing-page">
      <nav className="marketing-nav container">
        <div style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>
          <Logo variant="full" size="md" />
        </div>
        <div className="nav-actions">
          <button className="nav-link" onClick={() => router.push('/auth?mode=login')}>Sign in</button>
          <button className="btn btn-primary" onClick={() => router.push('/auth?mode=register')}>Play free <ArrowRight size={16} /></button>
        </div>
      </nav>

      <section className="hero container">
        <div className="hero-copy animate-fade-in">
          <div className="eyebrow"><Sparkles size={15} /> The football TCG, reimagined</div>
          <h1>Build a squad that<br /><span>owns the pitch.</span></h1>
          <p>
            Collect player cards, build your ultimate 5-a-side, and rise through weekly
            tournaments powered by real football performances.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => router.push('/auth?mode=register')}>
              Start your club <ArrowRight size={18} />
            </button>
            <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={17} /></span> Free to play · Your collection, your legacy</div>
          </div>
          <div className="hero-stats">
            <div><strong>5</strong><span>Starting players</span></div>
            <div><strong>7</strong><span>Cards per squad</span></div>
            <div><strong>1</strong><span>Weekly champion</span></div>
          </div>
        </div>

        <div className="hero-visual animate-slide-up" aria-label="Featured player card collection">
          <div className="visual-glow" />
          <div className="rating-orbit">91<br /><small>OVR</small></div>
          <div className="card-stack">
            {cards.map((card, index) => (
              <article className={`tcg-card ${card.tone}`} key={card.name} style={{ '--card-index': index } as CSSProperties}>
                <div className="tcg-card-top"><span>{card.rarity}</span><Trophy size={15} /></div>
                <div className="player-silhouette">⚽</div>
                <div className="tcg-card-meta"><strong>{card.rating}</strong><div><b>{card.name}</b><span>{card.position} · Season 26/27</span></div></div>
              </article>
            ))}
          </div>
          <div className="live-chip"><span /> Gameweek 01 is open</div>
        </div>
      </section>

      <section className="how-it-works container">
        <div className="section-heading"><span className="eyebrow">Your route to glory</span><h2>Every gameweek is a new story.</h2></div>
        <div className="loop-grid">
          {[
            ['01', 'Collect the uncommon', 'Open packs and discover a club full of football talent.'],
            ['02', 'Set your 5-a-side', 'Pick your formation, make the smart calls, and lock your squad.'],
            ['03', 'Climb the table', 'Follow real-world action and earn rewards for every performance.'],
          ].map(([number, title, body]) => <article className="loop-card glass" key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p><Check size={18} /></article>)}
        </div>
      </section>

      <footer className="marketing-footer container"><span>© 2026 kickIt</span><span>Built for the beautiful game.</span></footer>
    </main>
  );
}
