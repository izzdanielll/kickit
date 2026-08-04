'use client';

import React from 'react';

interface LogoProps {
  variant?: 'full' | 'mark' | 'hero' | 'compact';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
  showTagline?: boolean;
}

export function Logo({
  variant = 'full',
  size = 'md',
  className = '',
  onClick,
  showTagline = true,
}: LogoProps) {
  const sizeMap = {
    sm: { height: 28, fontSize: '1.1rem', taglineSize: '0.48rem' },
    md: { height: 38, fontSize: '1.35rem', taglineSize: '0.55rem' },
    lg: { height: 52, fontSize: '1.8rem', taglineSize: '0.65rem' },
    xl: { height: 90, fontSize: '2.5rem', taglineSize: '0.8rem' },
  };

  const dim = sizeMap[size];

  if (variant === 'hero') {
    return (
      <div
        className={`logo-hero-wrapper ${className}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <img
          src="/logo.jpg"
          alt="KICK IT - Play. Collect. Compete. Win."
          className="logo-hero-image"
          style={{
            maxWidth: '100%',
            height: 'auto',
            maxHeight: '320px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 25px rgba(245, 158, 11, 0.45)) drop-shadow(0 10px 30px rgba(0,0,0,0.8))',
            borderRadius: '16px',
            transition: 'transform 0.3s ease, filter 0.3s ease',
          }}
        />
      </div>
    );
  }

  if (variant === 'mark') {
    return (
      <div
        className={`brand-mark-wrapper ${className}`}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center' }}
      >
        <img
          src="/logo.jpg"
          alt="kickIt Emblem"
          style={{
            height: dim.height,
            width: 'auto',
            objectFit: 'contain',
            borderRadius: '6px',
            filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.4))',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`brand-logo-container ${className}`}
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <img
        src="/logo.jpg"
        alt="kickIt Logo Mark"
        style={{
          height: dim.height,
          width: 'auto',
          objectFit: 'contain',
          filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.5))',
          borderRadius: '6px',
        }}
      />
      <div className="brand-text-group" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span
          className="brand-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: dim.fontSize,
            letterSpacing: '-0.02em',
          }}
        >
          <span style={{ color: '#F8FAFC', textShadow: '0 0 10px rgba(248, 250, 252, 0.3)' }}>KICK</span>
          <span style={{ color: '#F59E0B', textShadow: '0 0 14px rgba(245, 158, 11, 0.6)', marginLeft: '2px' }}>IT</span>
        </span>
        {showTagline && (
          <span
            className="brand-tagline"
            style={{
              fontSize: dim.taglineSize,
              fontWeight: 800,
              color: '#D4AF37',
              letterSpacing: '0.14em',
              marginTop: '2px',
              textTransform: 'uppercase',
              opacity: 0.9,
            }}
          >
            PLAY · COLLECT · COMPETE · WIN
          </span>
        )}
      </div>
    </div>
  );
}
