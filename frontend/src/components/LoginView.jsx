import React from 'react';
import { API_BASE } from '../api.js';

const OAUTH_ERROR_MESSAGES = {
  oauth_not_configured: 'Google sign-in is not configured on the server.',
  oauth_failed: 'Google sign-in failed. Please try again.',
  user_creation_failed: 'Could not create account. Please try again.',
  oauth_error: 'An error occurred during sign-in. Please try again.',
};

const inputClasses =
  'w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-base';

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800/90 backdrop-blur rounded-lg p-8 w-full max-w-md border border-purple-500/30 shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-orange-400 mb-2">🎆 Fireworks Planner</h1>
          <p className="text-gray-300">
            {isLogin ? 'Sign in to access your shows' : 'Create an account to get started'}
          </p>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-600 text-red-200 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              className={inputClasses}
              placeholder="Enter username"
              autoFocus
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">Email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClasses}
                placeholder="your@email.com"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isLogin ? 1 : 6}
              className={inputClasses}
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-3 rounded-lg font-bold text-base transition ${
              loading ? 'opacity-50' : ''
            }`}
          >
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>

          <div className="text-center pt-4">
            <button
              type="button"
              onClick={toggleMode}
              className="text-purple-400 hover:text-purple-300 text-sm underline"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="flex items-center mb-4">
            <div className="flex-1 border-t border-gray-600" />
            <span className="px-4 text-sm text-gray-400">OR</span>
            <div className="flex-1 border-t border-gray-600" />
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-gray-100 text-gray-800 px-4 py-3 rounded-lg font-medium text-base transition flex items-center justify-center gap-3 border border-gray-300"
          >
            <GoogleIcon />
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
