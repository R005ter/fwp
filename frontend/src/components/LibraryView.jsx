import React from 'react';
import FireworkEditor from './FireworkEditor.jsx';

/**
 * Project firework library.
 *
 * Two modes:
 *   - List: grid of fireworks in the current project. Click a card to open
 *     the editor.
 *   - Editor: <FireworkEditor> for the selected firework. Save/back returns
 *     here and triggers a refresh from the parent.
 */
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-green-400 mb-1">📚 Fireworks</h1>
              <p className="text-sm text-gray-400">
                {currentProject?.name || 'No project'}
                {' · '}
                {filtered.length} of {(fireworks || []).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur rounded-lg p-4 border border-green-500/30 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fireworks…"
            className="w-full bg-gray-700/50 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-gray-800/50 backdrop-blur rounded-lg border border-green-500/30">
            <div className="text-6xl mb-4">🎆</div>
            <p className="text-xl text-gray-400 mb-2">
              {fireworks && fireworks.length > 0
                ? 'No fireworks match your search'
                : 'No fireworks in this project'}
            </p>
            <p className="text-sm text-gray-500">
              Use the desktop app to add new fireworks to the project library.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => setEditingId(f.id)}
                className="text-left bg-gray-800/50 backdrop-blur rounded-lg p-4 border border-green-500/30 hover:border-green-400 hover:bg-gray-800/70 transition focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {/* Box photo or video poster */}
                <div className="aspect-video bg-black rounded mb-3 overflow-hidden">
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
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                      No video yet
                    </div>
                  )}
                </div>

                <div className="font-bold text-white mb-1 truncate" title={f.name}>
                  {f.name}
                </div>
                <div className="flex flex-wrap gap-1 text-xs text-gray-400">
                  {f.manufacturer && (
                    <span className="bg-gray-700/60 px-2 py-0.5 rounded">
                      {f.manufacturer}
                    </span>
                  )}
                  {f.shot_count != null && (
                    <span className="bg-gray-700/60 px-2 py-0.5 rounded">
                      {f.shot_count} shots
                    </span>
                  )}
                  {f.grams != null && (
                    <span className="bg-gray-700/60 px-2 py-0.5 rounded">
                      {f.grams}g
                    </span>
                  )}
                  {f.fuse_delay_seconds != null && (
                    <span className="bg-gray-700/60 px-2 py-0.5 rounded">
                      delay {f.fuse_delay_seconds}s
                    </span>
                  )}
                  {f.price_cents != null && (
                    <span className="bg-gray-700/60 px-2 py-0.5 rounded">
                      ${(f.price_cents / 100).toFixed(2)}
                    </span>
                  )}
                </div>
                {(f.default_trim_start > 0 || f.default_trim_end > 0) && (
                  <div className="text-xs text-yellow-400 mt-2">
                    ✂️ trim {f.default_trim_start?.toFixed(1)}s –{' '}
                    {f.default_trim_end?.toFixed(1)}s
                  </div>
                )}
                <div className="mt-2 text-[11px] text-green-400">
                  Click to edit →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryView;
