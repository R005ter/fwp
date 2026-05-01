import React from 'react';
import { API_BASE } from '../api.js';

const PLATFORM_ICON = {
  windows: '🪟',
  linux: '🐧',
  mac: '🍎',
};

/**
 * Admin-only widget on the Dashboard right column. Lists per-OS download
 * links for the desktop "add a YouTube video" mini-app. URLs come from
 * the backend's /api/desktop/releases endpoint (latest GitHub Release).
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
      <div className="border border-border bg-surface rounded p-4">
        <h2 className="font-medium text-text mb-1">🖥️ Desktop app</h2>
        <p className="text-xs text-dim">Loading releases…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border border-border bg-surface rounded p-4">
        <h2 className="font-medium text-text mb-1">🖥️ Desktop app</h2>
        <p className="text-xs text-ember">Couldn't load releases: {error || 'unknown'}</p>
      </div>
    );
  }

  return (
    <div className="border border-border bg-surface rounded p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-medium text-text">🖥️ Desktop app</h2>
        <span className="text-[10px] uppercase tracking-wider text-dim">admin</span>
      </div>
      <p className="text-xs text-dim mb-3 leading-snug">
        Adds YouTube videos to the library. Run on a residential network —
        Render's IPs are blocked by YouTube.
      </p>

      <div className="space-y-1.5">
        {data.platforms.map((p) => (
          <a
            key={p.os}
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start justify-between gap-2 bg-surface2 hover:bg-surface3 border border-border hover:border-border-strong rounded p-2.5 transition"
          >
            <span className="flex items-start gap-2 min-w-0">
              <span className="text-xl shrink-0">{PLATFORM_ICON[p.os] || '💾'}</span>
              <span className="min-w-0">
                <div className="text-sm font-medium text-text">{p.label}</div>
                <div className="text-[11px] text-dim font-mono truncate">
                  {p.filename}
                </div>
                {p.note && (
                  <div className="text-[11px] text-muted mt-0.5">{p.note}</div>
                )}
              </span>
            </span>
            <span className="text-[10px] text-accent shrink-0 mt-0.5">↓</span>
          </a>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted">
        Latest release of <code className="text-dim">{data.repo}</code>.{' '}
        <a
          href={`${data.source_url}/blob/main/desktop/README.md`}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:text-accent-strong"
        >
          setup notes →
        </a>
      </div>
    </div>
  );
};

export default AdminDesktopDownload;
