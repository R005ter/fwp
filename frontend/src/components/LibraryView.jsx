import React from 'react';
import FireworkEditor from './FireworkEditor.jsx';

const LibraryView = ({
  fireworks,
  currentProject,
  onBack,
  onRefresh,
  showToast,
}) => {
  const [search, setSearch] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);

  const filtered = (fireworks || []).filter((f) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (f.name || '').toLowerCase().includes(q) ||
      (f.manufacturer || '').toLowerCase().includes(q) ||
      (f.primary_filename || '').toLowerCase().includes(q)
    );
  });

  if (editingId != null) {
    return (
      <FireworkEditor
        fireworkId={editingId}
        showToast={showToast}
        onBack={() => setEditingId(null)}
        onSaved={async () => {
          await onRefresh?.();
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top bar */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-dim hover:text-text border border-border hover:border-border-strong px-2 py-1 rounded text-xs transition"
          >
            ← back
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <span className="font-semibold tracking-tight">Fireworks library</span>
          </div>
          <span className="text-xs text-dim">
            {currentProject?.name || 'No project'} ·{' '}
            <span className="font-mono">
              {filtered.length}
              {filtered.length !== (fireworks || []).length &&
                ` of ${(fireworks || []).length}`}
            </span>
          </span>
          <div className="flex-1" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="bg-surface2 border border-border text-text px-3 py-1 rounded text-sm w-48 focus:outline-none focus:border-accent"
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {filtered.length === 0 ? (
          <div className="border border-border rounded p-12 text-center bg-surface">
            <div className="text-4xl mb-3 opacity-60">🎆</div>
            <p className="text-text font-medium mb-1">
              {fireworks && fireworks.length > 0
                ? 'No fireworks match your search'
                : 'No fireworks in this project'}
            </p>
            <p className="text-sm text-dim">
              Use the desktop app to add new fireworks to the library.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => setEditingId(f.id)}
                className="text-left bg-surface hover:bg-surface2 border border-border hover:border-border-strong rounded overflow-hidden transition focus:outline-none focus:border-accent group"
              >
                {/* Box photo or video poster */}
                <div className="aspect-video bg-deepstone overflow-hidden">
                  {f.box_photo_url ? (
                    <img
                      src={f.box_photo_url}
                      alt={f.name}
                      className="w-full h-full object-cover"
                    />
                  ) : f.primary_url ? (
                    <video
                      src={f.primary_url}
                      preload="metadata"
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                      no media
                    </div>
                  )}
                </div>

                <div className="p-3">
                  <div className="font-medium text-text truncate mb-1" title={f.name}>
                    {f.name}
                  </div>
                  {f.manufacturer && (
                    <div className="text-[11px] text-dim truncate mb-1">
                      {f.manufacturer}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 text-[10px] text-dim font-mono">
                    {f.shot_count != null && (
                      <span className="bg-surface2 border border-border px-1.5 py-0.5 rounded">
                        {f.shot_count}sh
                      </span>
                    )}
                    {f.grams != null && (
                      <span className="bg-surface2 border border-border px-1.5 py-0.5 rounded">
                        {f.grams}g
                      </span>
                    )}
                    {f.fuse_delay_seconds != null && (
                      <span className="bg-surface2 border border-border px-1.5 py-0.5 rounded">
                        {f.fuse_delay_seconds}s
                      </span>
                    )}
                    {f.price_cents != null && (
                      <span className="bg-surface2 border border-border px-1.5 py-0.5 rounded">
                        ${(f.price_cents / 100).toFixed(0)}
                      </span>
                    )}
                  </div>
                  {(f.default_trim_start > 0 || f.default_trim_end > 0) && (
                    <div className="text-[10px] text-gold mt-1.5 font-mono">
                      trim {f.default_trim_start?.toFixed(1)}s –{' '}
                      {f.default_trim_end?.toFixed(1)}s
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default LibraryView;
