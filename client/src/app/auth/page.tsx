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
  const [mode, setMode] = useState<'login' | 'register'>(searchParams.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'login') await login(email, password);
    else await register(email, username, password);
  };

  const switchMode = () => {
    clearError();
    setMode((current) => (current === 'login' ? 'register' : 'login'));
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

        {error && <div className="error-message"><span>!</span>{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="modal-field"><span>Email address</span><input type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          {mode === 'register' && <label className="modal-field animate-fade-in"><span>Club name</span><input type="text" placeholder="Wak Joko XI" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+( [A-Za-z0-9_]+)*" title="Use letters, numbers, underscores, and single spaces between words." required /></label>}
          <label className="modal-field"><span>Password</span><div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} pattern={mode === 'register' ? '(?=.*[A-Z])(?=.*\\d).*' : undefined} title={mode === 'register' ? 'Use at least 8 characters, including one uppercase letter and one number.' : undefined} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode === 'register' && <small className="field-hint">8+ characters, with one uppercase letter and one number.</small>}</label>
          {mode === 'login' && <button type="button" className="forgot-link">Forgot password?</button>}
          <button type="submit" className="btn btn-primary auth-submit" disabled={isLoading}>{isLoading ? <span className="spinner" /> : mode === 'login' ? 'Sign in to kickIt' : 'Create free account'}</button>
        </form>

        <div className="auth-security"><ShieldCheck size={16} /><span>Your session is protected with secure cookies.</span></div>
        <p className="auth-switch">{mode === 'login' ? 'New to kickIt?' : 'Already have an account?'} <button onClick={switchMode}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
      </section>
    </main>
  );
}

export default function AuthPage() {
  return <Suspense fallback={<div className="page-loader"><div className="spinner" /></div>}><AuthForm /></Suspense>;
}
