import React from 'react';
import { API_BASE } from '../api.js';

const OAUTH_ERROR_MESSAGES = {
  oauth_not_configured: 'Google sign-in is not configured on the server.',
  oauth_failed: 'Google sign-in failed. Please try again.',
  user_creation_failed: 'Could not create account. Please try again.',
  oauth_error: 'An error occurred during sign-in. Please try again.',
};

const inputClasses =
  'w-full bg-surface2 border border-border text-text px-3 py-2.5 rounded focus:outline-none focus:border-accent text-sm';

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const LoginView = ({ onLogin }) => {
  const [isLogin, setIsLogin] = React.useState(true);
  const [username, setUsername] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.split('?')[1] || '');
    const oauthError = urlParams.get('error');
    if (oauthError) {
      setError(OAUTH_ERROR_MESSAGES[oauthError] || 'Sign-in failed. Please try again.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin ? { username, password } : { username, email, password };
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onLogin(data.user);
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Connection error. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const frontendUrl = window.location.origin;
    window.location.href = `${API_BASE}/api/auth/google?frontend_url=${encodeURIComponent(
      frontendUrl,
    )}`;
  };

  const toggleMode = () => {
    setIsLogin((v) => !v);
    setError('');
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎆</div>
          <h1 className="text-2xl font-semibold text-text mb-1">Fireworks Planner</h1>
          <p className="text-sm text-dim">
            {isLogin ? 'Sign in to your shows' : 'Create an account'}
          </p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6 elev-1">
          {error && (
            <div className="bg-ember/10 border border-ember/40 text-ember px-3 py-2 rounded mb-4 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-dim mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                className={inputClasses}
                placeholder="username"
                autoFocus
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-dim mb-1.5">
                  Email <span className="text-muted normal-case">(optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClasses}
                  placeholder="you@example.com"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-dim mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isLogin ? 1 : 6}
                className={inputClasses}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-accent hover:bg-accent-strong text-bg font-semibold px-4 py-2.5 rounded transition text-sm ${
                loading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </button>

            <button
              type="button"
              onClick={toggleMode}
              className="w-full text-center text-xs text-dim hover:text-text pt-1"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </form>

          {/* Google */}
          <div className="mt-5 pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full bg-surface2 hover:bg-surface3 border border-border hover:border-border-strong text-text px-3 py-2.5 rounded text-sm transition flex items-center justify-center gap-2"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted mt-4">
          For residential fireworks show creators
        </p>
      </div>
    </div>
  );
};

export default LoginView;
