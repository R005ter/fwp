import React from 'react';
import { API_BASE } from '../api.js';

// Pretty-print JSON safely; falls back to "{}" on bad input.
const stringifyMeta = (obj) => {
  try {
    return JSON.stringify(obj || {}, null, 2);
  } catch {
    return '{}';
  }
};

// Convert cents (int) ⇆ dollar string for the price input.
const centsToDollars = (cents) => (cents == null ? '' : (cents / 100).toFixed(2));
const dollarsToCents = (s) => {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
};

/**
 * Detail/edit view for one firework.
 *
 * Loads /api/fireworks/:id on mount (so we get the videos list, which the
 * project-fireworks listing doesn't carry). PATCH on save. The trim/crop
 * defaults shown for videos here are read-only — they're set from the
 * "💾 → Default" chip in the show editor and (in a future iteration) from
 * an inline editor on each video.
 */
const FireworkEditor = ({ fireworkId, onBack, onSaved, showToast }) => {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [original, setOriginal] = React.useState(null);

  // Editable fields
  const [name, setName] = React.useState('');
  const [manufacturer, setManufacturer] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [boxPhotoUrl, setBoxPhotoUrl] = React.useState('');
  const [fuseDelay, setFuseDelay] = React.useState('');
  const [effectDuration, setEffectDuration] = React.useState('');
  const [shotCount, setShotCount] = React.useState('');
  const [grams, setGrams] = React.useState('');
  const [priceDollars, setPriceDollars] = React.useState('');
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [visibility, setVisibility] = React.useState('project');
  const [metaText, setMetaText] = React.useState('{}');
  const [metaError, setMetaError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/fireworks/${fireworkId}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setOriginal(data);
        setName(data.name || '');
        setManufacturer(data.manufacturer || '');
        setDescription(data.description || '');
        setBoxPhotoUrl(data.box_photo_url || '');
        setFuseDelay(data.fuse_delay_seconds ?? '');
        setEffectDuration(data.effect_duration_seconds ?? '');
        setShotCount(data.shot_count ?? '');
        setGrams(data.grams ?? '');
        setPriceDollars(centsToDollars(data.price_cents));
        setSourceUrl(data.source_url || '');
        setVisibility(data.visibility || 'project');
        setMetaText(stringifyMeta(data.metadata));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fireworkId]);

  const onSave = async () => {
    if (!name.trim()) {
      showToast?.('Name is required', 'warning');
      return;
    }
    let parsedMeta = {};
    if (metaText.trim()) {
      try {
        parsedMeta = JSON.parse(metaText);
        if (parsedMeta && typeof parsedMeta !== 'object') {
          throw new Error('metadata must be a JSON object');
        }
        setMetaError(null);
      } catch (err) {
        setMetaError(err.message);
        showToast?.(`Metadata JSON: ${err.message}`, 'error');
        return;
      }
    }

    const patch = {
      name: name.trim(),
      manufacturer: manufacturer.trim() || null,
      description: description.trim() || null,
      box_photo_url: boxPhotoUrl.trim() || null,
      fuse_delay_seconds: fuseDelay === '' ? null : parseFloat(fuseDelay),
      effect_duration_seconds:
        effectDuration === '' ? null : parseFloat(effectDuration),
      shot_count: shotCount === '' ? null : parseInt(shotCount, 10),
      grams: grams === '' ? null : parseInt(grams, 10),
      price_cents: priceDollars === '' ? null : dollarsToCents(priceDollars),
      source_url: sourceUrl.trim() || null,
      visibility,
      metadata: parsedMeta,
    };

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/fireworks/${fireworkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showToast?.(`Saved "${patch.name}"`, 'success');
      onSaved?.();
    } catch (err) {
      showToast?.(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center text-gray-400">Loading firework…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <button
          onClick={onBack}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded mb-4"
        >
          ← Back
        </button>
        <p className="text-red-400">Couldn't load firework: {error}</p>
      </div>
    );
  }

  const hasPhoto = boxPhotoUrl?.trim().length > 0;
  const primaryVideo = (original?.videos || []).find((v) => v.is_primary);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition"
          >
            ← Back to library
          </button>
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-6 py-2 rounded font-bold transition"
            >
              {saving ? 'Saving…' : '💾 Save'}
            </button>
          </div>
        </div>

        {/* Top — photo + name + manufacturer */}
        <div className="bg-gray-800/60 rounded-lg border border-green-500/30 p-6 mb-4 flex flex-col md:flex-row gap-6">
          <div className="md:w-64 flex-shrink-0">
            <div className="aspect-square bg-black rounded overflow-hidden border border-gray-700">
              {hasPhoto ? (
                <img
                  src={boxPhotoUrl}
                  alt={name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : primaryVideo?.url ? (
                <video
                  src={primaryVideo.url}
                  preload="metadata"
                  controls
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                  No photo or video
                </div>
              )}
            </div>
            <input
              type="text"
              value={boxPhotoUrl}
              onChange={(e) => setBoxPhotoUrl(e.target.value)}
              placeholder="Box photo URL (optional)"
              className="mt-2 w-full bg-gray-700 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-700 text-white text-2xl font-bold px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="King Cake"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                Manufacturer
              </label>
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Winda Fireworks"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="500-gram zipper cake with crackling tail and silver palms…"
              />
            </div>
          </div>
        </div>

        {/* Spec grid */}
        <div className="bg-gray-800/60 rounded-lg border border-purple-500/30 p-6 mb-4">
          <h2 className="text-sm uppercase tracking-wide text-purple-300 font-bold mb-4">
            Specs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Shot count</label>
              <input
                type="number"
                value={shotCount}
                onChange={(e) => setShotCount(e.target.value)}
                min="0"
                className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="16"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Powder grams</label>
              <input
                type="number"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                min="0"
                className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Price (USD)</label>
              <input
                type="text"
                inputMode="decimal"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="49.99"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Fuse delay (sec)
              </label>
              <input
                type="number"
                value={fuseDelay}
                onChange={(e) => setFuseDelay(e.target.value)}
                step="0.1"
                min="0"
                className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="3.5"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Light → first effect
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Effect duration (sec)
              </label>
              <input
                type="number"
                value={effectDuration}
                onChange={(e) => setEffectDuration(e.target.value)}
                step="0.1"
                min="0"
                className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="35"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                First effect → last
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="project">Project-only</option>
                <option value="private">Private</option>
                <option value="public" disabled>
                  Public (coming soon)
                </option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs text-gray-400 mb-1">
              Where to buy (URL)
            </label>
            <input
              type="text"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full bg-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="https://…"
            />
          </div>
        </div>

        {/* JSONB metadata */}
        <div className="bg-gray-800/60 rounded-lg border border-blue-500/30 p-6 mb-4">
          <h2 className="text-sm uppercase tracking-wide text-blue-300 font-bold mb-2">
            Extra metadata <span className="text-gray-500 font-normal">(JSON)</span>
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            For fields the app doesn't have first-class columns for yet —
            scraped manufacturer specs, color tags, fuse type, etc. Stored as
            JSONB; queryable later.
          </p>
          <textarea
            value={metaText}
            onChange={(e) => {
              setMetaText(e.target.value);
              setMetaError(null);
            }}
            rows={6}
            spellCheck={false}
            className={`w-full bg-gray-900 text-gray-100 px-3 py-2 rounded font-mono text-xs focus:outline-none focus:ring-2 ${
              metaError ? 'ring-2 ring-red-500' : 'focus:ring-blue-500'
            }`}
            placeholder='{"colors": ["red","gold"], "fuse_type": "visco"}'
          />
          {metaError && (
            <p className="text-xs text-red-400 mt-1">⚠ {metaError}</p>
          )}
        </div>

        {/* Videos */}
        <div className="bg-gray-800/60 rounded-lg border border-orange-500/30 p-6 mb-4">
          <h2 className="text-sm uppercase tracking-wide text-orange-300 font-bold mb-3">
            Videos
          </h2>
          {(original?.videos || []).length === 0 ? (
            <p className="text-gray-500 text-sm">
              No videos linked. Use the desktop downloader to add one.
            </p>
          ) : (
            <div className="space-y-3">
              {original.videos.map((v) => (
                <div
                  key={v.id}
                  className="flex items-start gap-4 bg-gray-900/40 p-3 rounded"
                >
                  <video
                    src={v.url}
                    className="w-32 h-20 object-cover bg-black rounded flex-shrink-0"
                    preload="metadata"
                    controls
                  />
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {v.video_title || v.filename}
                      </span>
                      {v.is_primary && (
                        <span className="text-[10px] uppercase tracking-wide bg-orange-600/40 border border-orange-400/60 text-orange-100 px-2 py-0.5 rounded">
                          primary
                        </span>
                      )}
                      <span className="text-[10px] text-gray-500">
                        ({v.kind})
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {v.filename}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Default trim {(v.default_trim_start || 0).toFixed(1)}s –{' '}
                      {(v.default_trim_end || 0).toFixed(1)}s · crop{' '}
                      {(v.default_crop_x || 0).toFixed(0)}/
                      {(v.default_crop_y || 0).toFixed(0)} ·{' '}
                      {(v.default_crop_width ?? 100).toFixed(0)}×
                      {(v.default_crop_height ?? 100).toFixed(0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-500 mt-3">
            Add/remove videos and reset defaults — coming in a follow-up. For now
            the show editor's <strong>💾 → Default</strong> chip writes to the
            primary video's defaults when your show-instance trim/crop diverges.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FireworkEditor;
