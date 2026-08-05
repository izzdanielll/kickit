'use client';

import { Eye, EyeOff, ShieldCheck, X } from 'lucide-react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';

function AuthForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login, register, user, error, clearError, isLoading } = useAuth();
  const initialMode = searchParams.get('mode');
  const [accountToken] = useState(() => searchParams.get('token'));
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset' | 'verify'>(initialMode === 'register' || initialMode === 'reset-password' || initialMode === 'verify-email' ? ({ register: 'register', 'reset-password': 'reset', 'verify-email': 'verify' } as const)[initialMode] : 'login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (accountToken) window.history.replaceState({}, '', `/auth?mode=${initialMode || 'login'}`);
  }, [accountToken, initialMode]);

  useEffect(() => {
    if (!isLoading && user) router.replace('/dashboard');
  }, [user, isLoading, router]);

  useEffect(() => {
    const requested = searchParams.get('mode');
    setMode(requested === 'register' || requested === 'reset-password' || requested === 'verify-email' ? ({ register: 'register', 'reset-password': 'reset', 'verify-email': 'verify' } as const)[requested] : 'login');
  }, [searchParams]);

  useEffect(() => {
    if (mode !== 'verify') return;
    const token = accountToken;
    if (!token) { setLocalError('Verification link is invalid.'); return; }
    void fetch('/api/auth/verify-email/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (res) => { if (!res.ok) throw new Error((await res.json()).message || 'Verification failed'); setNotice('Email verified. You can now sign in.'); })
      .catch((err) => setLocalError(err.message));
  }, [mode, accountToken]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(''); setLocalError('');
    if (mode === 'login') await login(email, password);
    else if (mode === 'register') {
      if (await register(email, username, password)) setNotice('Account created. Check your email to verify it before signing in.');
    } else if (mode === 'forgot') {
      const res = await fetch('/api/auth/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json(); if (!res.ok) setLocalError(data.message || 'Request failed'); else setNotice(data.message);
    } else if (mode === 'reset') {
      const token = accountToken;
      const res = await fetch('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const data = await res.json(); if (!res.ok) setLocalError(data.message || 'Reset failed'); else setNotice('Password changed. You can now sign in.');
    }
  };

  const switchMode = () => {
    clearError();
    const nextMode = mode === 'login' ? 'register' : 'login';
    setMode(nextMode);
    router.replace(`/auth?mode=${nextMode}`);
  };

  return (
    <main className="auth-stage">
      <div className="auth-background" aria-hidden="true">
        <div className="auth-nav">
          <div style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>
            <Logo variant="full" size="sm" />
          </div>
          <span>Fantasy football, made collectible.</span>
        </div>
        <div className="stadium-lines" />
        <div className="background-card background-card-one"><span>91</span><b>MYTHIC</b><i>⚽</i></div>
        <div className="background-card background-card-two"><span>86</span><b>EPIC</b><i>⚽</i></div>
        <div className="background-copy"><span>GAMEWEEK 01</span><h1>BUILD. LOCK.<br />CLIMB.</h1><p>Your club’s next chapter starts here.</p></div>
      </div>

      <section className="auth-modal glass-strong animate-fade-in" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
        <button className="modal-close" onClick={() => router.push('/')} aria-label="Close sign in"><X size={20} /></button>
        <header className="auth-modal-header">
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
            <Logo variant="mark" size="lg" />
          </div>
          <h1>{mode === 'login' ? 'Welcome back' : 'Start your club'}</h1>
          <p>{mode === 'login' ? 'Sign in to manage your squad.' : 'Create your account and collect your first cards.'}</p>
        </header>

        {(error || localError) && <div className="error-message"><span>!</span>{error || localError}</div>}
        {notice && <div className="auth-security"><ShieldCheck size={16} /><span>{notice}</span></div>}

        {mode !== 'verify' && <form className="auth-form" onSubmit={handleSubmit}>
          <label className="modal-field"><span>Email address</span><input type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required /></label>
          {mode === 'register' && <label className="modal-field animate-fade-in"><span>Club name</span><input type="text" placeholder="Wak Joko XI" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+( [A-Za-z0-9_]+)*" title="Use letters, numbers, underscores, and single spaces between words." required /></label>}
          {mode !== 'forgot' && <label className="modal-field"><span>{mode === 'reset' ? 'New password' : 'Password'}</span><div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={64} pattern={mode === 'register' || mode === 'reset' ? '(?=.*[A-Z])(?=.*\\d).*' : undefined} title={mode === 'register' || mode === 'reset' ? 'Use at least 8 characters, including one uppercase letter and one number.' : undefined} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{(mode === 'register' || mode === 'reset') && <small className="field-hint">8+ characters, with one uppercase letter and one number.</small>}</label>}
          {mode === 'login' && <button type="button" className="forgot-link" onClick={() => { clearError(); setMode('forgot'); }}>Forgot password?</button>}
          <button type="submit" className="btn btn-primary auth-submit" disabled={isLoading}>{isLoading ? <span className="spinner" /> : mode === 'login' ? 'Sign in to kickIt' : mode === 'register' ? 'Create free account' : mode === 'forgot' ? 'Send reset link' : 'Change password'}</button>
        </form>}

        <div className="auth-security"><ShieldCheck size={16} /><span>Your session is protected with secure cookies.</span></div>
        <p className="auth-switch">{mode === 'login' ? 'New to kickIt?' : 'Already have an account?'} <button onClick={mode === 'login' || mode === 'register' ? switchMode : () => { setMode('login'); router.replace('/auth?mode=login'); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
      </section>
    </main>
  );
}

export default function AuthPage() {
  return <Suspense fallback={<div className="page-loader"><div className="spinner" /></div>}><AuthForm /></Suspense>;
}
