import React from 'react';
import { API_BASE } from '../api.js';

const PLATFORM_ICON = {
  windows: '🪟',
  linux: '🐧',
  mac: '🍎',
};

/**
 * Admin-only widget on the Dashboard right column. Lists per-OS download links
 * for the desktop "add a YouTube video" mini-app. URLs come from the backend's
 * /api/desktop/releases endpoint, which points at GitHub Releases for the
 * configured repo. If CI hasn't published a release yet, the GitHub link will
 * 404 — the admin clicks through and sees that explicitly.
 */
const AdminDesktopDownload = () => {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`${API_BASE}/api/desktop/releases`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-yellow-500/30">
        <h2 className="text-xl font-bold text-yellow-300 mb-2">🖥️ Desktop App</h2>
        <p className="text-sm text-gray-400">Loading releases…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-yellow-500/30">
        <h2 className="text-xl font-bold text-yellow-300 mb-2">🖥️ Desktop App</h2>
        <p className="text-sm text-red-300">Couldn't load releases: {error || 'unknown'}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-yellow-500/30">
      <h2 className="text-xl font-bold text-yellow-300 mb-2">🖥️ Desktop App (admin)</h2>
      <p className="text-xs text-gray-400 mb-4">
        Mini downloader for adding YouTube videos to the library. Use this on a
        residential network — Render's IPs are blocked by YouTube.
      </p>

      <div className="space-y-2">
        {data.platforms.map((p) => (
          <a
            key={p.os}
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start justify-between gap-3 bg-gray-700/60 hover:bg-gray-700 rounded p-3 transition border border-gray-600 hover:border-yellow-400"
          >
            <span className="flex items-start gap-3 min-w-0">
              <span className="text-2xl shrink-0">{PLATFORM_ICON[p.os] || '💾'}</span>
              <span className="min-w-0">
                <div className="font-medium text-white">{p.label}</div>
                <div className="text-xs text-gray-400 truncate">{p.filename}</div>
                {p.note && (
                  <div className="text-[11px] text-gray-500 mt-1">{p.note}</div>
                )}
              </span>
            </span>
            <span className="text-xs text-yellow-300 shrink-0">↓ Download</span>
          </a>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
        Latest release of <code className="text-gray-300">{data.repo}</code>.
        First-time setup details:{' '}
        <a
          href={`${data.source_url}/blob/main/desktop/README.md`}
          target="_blank"
          rel="noreferrer"
          className="text-yellow-300 hover:underline"
        >
          desktop/README.md
        </a>
      </div>
    </div>
  );
};

export default AdminDesktopDownload;
