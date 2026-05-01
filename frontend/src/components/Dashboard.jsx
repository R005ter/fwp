import React from 'react';
import { API_BASE, extractVideoId } from '../api.js';
import AdminDesktopDownload from './AdminDesktopDownload.jsx';
import ProjectSettings from './ProjectSettings.jsx';

const THEME_KEY = 'fwp_theme';
const THEMES = ['ember', 'midnight'];

const useTheme = () => {
  const [theme, setTheme] = React.useState(() => {
    if (typeof window === 'undefined') return 'ember';
    return localStorage.getItem(THEME_KEY) || 'ember';
  });
  React.useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return [theme, setTheme];
};

const Dashboard = ({
  onEditShow,
  onNewShow,
  onGoToLibrary,
  savedSessions,
  onDeleteShow,
  fireworks,
  onDownloadComplete,
  currentUser,
  currentProject,
  projects,
  onSwitchProject,
  onLogout,
  showToast,
}) => {
  const [theme, setTheme] = useTheme();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [youtubeUrl, setYoutubeUrl] = React.useState('');
  const [youtubeSearchQuery, setYoutubeSearchQuery] = React.useState('');
  const [showYoutubePanel, setShowYoutubePanel] = React.useState(false);
  const [downloading, setDownloading] = React.useState([]);
  const [backendStatus, setBackendStatus] = React.useState(null);
  const [showSettings, setShowSettings] = React.useState(false);

  React.useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then(setBackendStatus)
      .catch(() => setBackendStatus({ status: 'offline' }));
  }, []);

  // Poll active downloads (web client returns 403 from Render but locally
  // works — the polling itself is harmless either way).
  React.useEffect(() => {
    if (downloading.length === 0) return;
    const interval = setInterval(async () => {
      const updates = await Promise.all(
        downloading.map(async (dl) => {
          try {
            const res = await fetch(`${API_BASE}/api/download/${dl.id}`, {
              credentials: 'include',
            });
            return { ...dl, ...(await res.json()) };
          } catch {
            return dl;
          }
        }),
      );
      setDownloading(updates.filter((dl) => dl.status === 'downloading'));
      updates
        .filter((dl) => dl.status === 'complete' && dl.filename)
        .forEach(onDownloadComplete);
    }, 1000);
    return () => clearInterval(interval);
  }, [downloading, onDownloadComplete]);

  const handleYoutubeDownload = async () => {
    if (!youtubeUrl.trim()) return;
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      showToast?.('Invalid YouTube URL', 'warning');
      return;
    }
    const downloadId = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setDownloading((prev) => [
      ...prev,
      {
        id: downloadId,
        url: youtubeUrl,
        videoId,
        status: 'downloading',
        progress: 0,
        title: 'Starting download…',
        serverSide: true,
      },
    ]);
    try {
      const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: youtubeUrl }),
      });
      const data = await res.json();
      if (data.error) {
        showToast?.(`Download failed: ${data.error}`, 'error');
        setDownloading((prev) => prev.filter((dl) => dl.id !== downloadId));
        return;
      }
      if (data.id && data.id !== downloadId) {
        setDownloading((prev) =>
          prev.map((dl) =>
            dl.id === downloadId
              ? { ...dl, id: data.id, status: 'downloading', serverSide: true }
              : dl,
          ),
        );
      }
      if (data.status === 'complete') {
        setDownloading((prev) => prev.filter((dl) => dl.id !== downloadId));
        setYoutubeUrl('');
        onDownloadComplete({ ...data, id: downloadId });
      }
    } catch (err) {
      showToast?.(`Download failed: ${err.message}`, 'error');
      setDownloading((prev) => prev.filter((dl) => dl.id !== downloadId));
    }
  };

  const filteredSessions = savedSessions.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const sortedSessions = [...filteredSessions].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  );

  const openYoutubeSearch = () => {
    if (!youtubeSearchQuery.trim()) return;
    window.open(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeSearchQuery)}`,
      '_blank',
    );
  };

  const backendOk = backendStatus?.status === 'ok';
  const fireworkCount = fireworks?.length || 0;

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top app bar */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xl">🎆</span>
            <span className="font-semibold tracking-tight text-text">
              Fireworks Planner
            </span>
          </div>

          {/* Project switcher (compact) */}
          {projects && projects.length > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-dim">project</span>
              <select
                value={currentProject?.id || ''}
                onChange={(e) => onSwitchProject?.(parseInt(e.target.value, 10))}
                className="bg-surface2 border border-border text-text text-xs px-2 py-1 rounded focus:outline-none focus:border-accent"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.role !== 'editor' ? ` · ${p.role}` : ''}
                  </option>
                ))}
              </select>
              {currentProject && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-dim hover:text-text px-1"
                  title="Project settings"
                >
                  ⚙
                </button>
              )}
              <button
                onClick={async () => {
                  const projName = window.prompt(
                    'New project name (e.g. "2027 - 4th of July"):',
                  );
                  if (!projName?.trim()) return;
                  const res = await fetch(`${API_BASE}/api/projects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ name: projName.trim() }),
                  });
                  if (res.ok) {
                    const proj = await res.json();
                    onSwitchProject?.(proj.id);
                    window.location.reload();
                  }
                }}
                className="text-dim hover:text-text px-1"
                title="Create a new project"
              >
                +
              </button>
            </div>
          )}

          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={() =>
              setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])
            }
            className="text-xs text-dim hover:text-text px-2 py-1 border border-border rounded transition"
            title="Switch theme"
          >
            {theme === 'ember' ? '🔥 ember' : '🌙 midnight'}
          </button>

          {/* User badge + logout */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-dim hidden sm:inline">
              {currentUser?.username || ''}
            </span>
            <button
              onClick={onLogout}
              className="text-dim hover:text-text border border-border hover:border-border-strong px-2 py-1 rounded transition"
            >
              sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Hero / primary actions */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-text">
              {currentProject?.name || 'Project'}
            </h1>
            <p className="text-sm text-dim mt-1">
              {savedSessions.length} {savedSessions.length === 1 ? 'show' : 'shows'}
              {' · '}
              {fireworkCount} {fireworkCount === 1 ? 'firework' : 'fireworks'}
              {' · '}
              <span
                className={backendOk ? 'text-leaf' : 'text-ember'}
                title={backendOk ? 'Backend connected' : 'Backend offline'}
              >
                ●
              </span>{' '}
              <span className="text-dim">
                {backendOk ? 'connected' : 'offline'}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onGoToLibrary}
              className="bg-surface2 hover:bg-surface3 border border-border hover:border-border-strong text-text px-4 py-2 rounded transition text-sm"
            >
              📚 Library
            </button>
            <button
              onClick={onNewShow}
              className="bg-accent hover:bg-accent-strong text-bg font-semibold px-4 py-2 rounded transition text-sm shadow"
            >
              + New show
            </button>
          </div>
        </section>

        {/* Two-column main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Shows */}
          <section className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wider text-dim font-medium">
                Shows
              </h2>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="bg-surface border border-border text-text px-3 py-1 rounded text-sm w-48 focus:outline-none focus:border-accent"
              />
            </div>

            {sortedSessions.length === 0 ? (
              <div className="border border-border rounded p-10 text-center bg-surface">
                <div className="text-4xl mb-3 opacity-60">🎆</div>
                <p className="text-text font-medium mb-1">No shows yet</p>
                <p className="text-sm text-dim mb-4">
                  Start designing your show — drop fireworks on the timeline.
                </p>
                <button
                  onClick={onNewShow}
                  className="bg-accent hover:bg-accent-strong text-bg font-semibold px-4 py-2 rounded text-sm"
                >
                  + Create first show
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-border border border-border rounded bg-surface overflow-hidden">
                {sortedSessions.map((session) => {
                  const isOwn =
                    session.user_id == null || session.user_id === currentUser?.id;
                  const ownerLabel = isOwn
                    ? null
                    : session.creator_username || session.creator_email || 'unknown';
                  const itemCount = (session.fireworks || session.videos || []).length;
                  return (
                    <li
                      key={`${session.user_id ?? 'me'}:${session.name}`}
                      className="px-4 py-3 hover:bg-surface2 transition cursor-pointer flex items-center gap-3"
                      onClick={() => onEditShow(session.name, session.user_id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-medium text-text truncate">
                            {session.name}
                          </h3>
                          {ownerLabel && (
                            <span className="text-[10px] uppercase tracking-wide text-gold border border-gold/40 px-1.5 py-0.5 rounded">
                              by {ownerLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-dim font-mono">
                          {itemCount} {itemCount === 1 ? 'firework' : 'fireworks'}
                          {' · '}
                          {Math.round(session.totalDuration || 60)}s
                          {' · '}
                          {new Date(session.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => onEditShow(session.name, session.user_id)}
                          className="text-xs text-dim hover:text-accent px-2 py-1"
                          title="Edit"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => {
                            const prompt = isOwn
                              ? `Delete show "${session.name}"?`
                              : `Delete ${ownerLabel}'s show "${session.name}"?`;
                            if (window.confirm(prompt))
                              onDeleteShow(session.name, session.user_id);
                          }}
                          className="text-xs text-dim hover:text-ember px-2 py-1"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Right column */}
          <aside className="space-y-4">
            {/* Library quick link */}
            <button
              onClick={onGoToLibrary}
              className="w-full text-left border border-border bg-surface hover:bg-surface2 hover:border-border-strong rounded p-4 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-medium text-text">📚 Fireworks library</h2>
                <span className="text-xs text-dim font-mono">{fireworkCount}</span>
              </div>
              <p className="text-xs text-dim">
                Photos, manufacturer, fuse delay, grams, price.
              </p>
            </button>

            {/* YouTube downloader (collapsed by default — not the primary action) */}
            <details className="border border-border bg-surface rounded">
              <summary className="cursor-pointer px-4 py-3 flex items-center justify-between text-sm font-medium select-none">
                <span>📥 Quick YouTube download</span>
                <span className="text-xs text-dim">server-side</span>
              </summary>
              <div className="px-4 pb-4 pt-1 space-y-2">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtube.com/…"
                  className="w-full bg-surface2 border border-border text-text px-3 py-2 rounded text-sm focus:outline-none focus:border-accent"
                  onKeyDown={(e) => e.key === 'Enter' && handleYoutubeDownload()}
                />
                <button
                  onClick={handleYoutubeDownload}
                  disabled={!youtubeUrl.trim()}
                  className="w-full bg-accent hover:bg-accent-strong disabled:bg-surface2 disabled:text-muted disabled:cursor-not-allowed text-bg font-medium px-3 py-2 rounded text-sm"
                >
                  Download
                </button>

                {downloading.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {downloading.map((dl) => (
                      <div
                        key={dl.id}
                        className="bg-surface2 border border-border rounded p-2"
                      >
                        <div className="flex justify-between text-xs mb-1">
                          <span className="truncate text-dim">
                            {dl.title || 'Downloading…'}
                          </span>
                          <span className="font-mono">
                            {Math.round(dl.progress || 0)}%
                          </span>
                        </div>
                        <div className="h-1 bg-deepstone rounded overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${dl.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowYoutubePanel(!showYoutubePanel)}
                  className="text-xs text-dim hover:text-text underline mt-1"
                >
                  {showYoutubePanel ? 'hide search' : '🔍 search YouTube'}
                </button>
                {showYoutubePanel && (
                  <div className="bg-surface2 border border-border rounded p-2">
                    <input
                      type="text"
                      value={youtubeSearchQuery}
                      onChange={(e) => setYoutubeSearchQuery(e.target.value)}
                      placeholder="e.g., King Cake fireworks"
                      className="w-full bg-deepstone border border-border text-text px-2 py-1.5 rounded text-xs mb-2 focus:outline-none focus:border-accent"
                      onKeyDown={(e) => e.key === 'Enter' && openYoutubeSearch()}
                    />
                    <button
                      onClick={openYoutubeSearch}
                      className="w-full bg-surface3 hover:bg-surface2 border border-border text-text px-2 py-1.5 rounded text-xs"
                    >
                      Search on YouTube ↗
                    </button>
                  </div>
                )}
              </div>
            </details>

            {currentUser?.is_admin && <AdminDesktopDownload />}
          </aside>
        </div>
      </main>

      {showSettings && currentProject && (
        <ProjectSettings
          projectId={currentProject.id}
          currentUserId={currentUser?.id}
          onClose={() => setShowSettings(false)}
          onProjectChanged={() => window.location.reload()}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default Dashboard;
