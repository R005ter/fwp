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
 * Small "Upload photo" control. Posts a single file to /api/photos and
 * calls onUploaded(url) with the resulting public URL. The actual URL
 * field is the source of truth (the user can also paste a URL by hand).
 */
const PhotoUploadControl = ({ currentUrl, onUploaded, showToast }) => {
  const inputRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);

  const onPick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('Pick an image file (jpg / png / webp / gif)', 'warning');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/api/photos`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      onUploaded?.(url);
      showToast?.('Photo uploaded', 'success');
    } catch (err) {
      showToast?.(`Upload failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={onPick}
        disabled={busy}
        className="flex-1 bg-surface2 hover:bg-surface3 border border-border hover:border-border-strong disabled:opacity-50 text-text px-3 py-1.5 rounded text-xs transition"
      >
        {busy ? 'Uploading…' : currentUrl ? '🔁 Replace photo' : '📷 Upload photo'}
      </button>
      {currentUrl && (
        <button
          type="button"
          onClick={() => onUploaded?.('')}
          className="bg-surface2 hover:bg-surface3 border border-border text-dim hover:text-ember px-2 py-1.5 rounded text-xs transition"
          title="Clear photo"
        >
          ✕
        </button>
      )}
    </div>
  );
};


/**
 * Row for one firework_video inside the Videos panel.
 * Manages its own dirty state; auto-saves on blur via a small Save button
 * so a user can fiddle with values without each keystroke firing a PATCH.
 */
const FireworkVideoRow = ({ video, onChanged, showToast }) => {
  const [kind, setKind] = React.useState(video.kind || 'user');
  const [trimStart, setTrimStart] = React.useState(video.default_trim_start ?? 0);
  const [trimEnd, setTrimEnd] = React.useState(video.default_trim_end ?? 0);
  const [cropX, setCropX] = React.useState(video.default_crop_x ?? 0);
  const [cropY, setCropY] = React.useState(video.default_crop_y ?? 0);
  const [cropW, setCropW] = React.useState(video.default_crop_width ?? 100);
  const [cropH, setCropH] = React.useState(video.default_crop_height ?? 100);
  const [busy, setBusy] = React.useState(false);

  const dirty =
    kind !== (video.kind || 'user') ||
    trimStart !== (video.default_trim_start ?? 0) ||
    trimEnd !== (video.default_trim_end ?? 0) ||
    cropX !== (video.default_crop_x ?? 0) ||
    cropY !== (video.default_crop_y ?? 0) ||
    cropW !== (video.default_crop_width ?? 100) ||
    cropH !== (video.default_crop_height ?? 100);

  const patch = async (body) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/firework_videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast?.(`Save failed: ${err.error || res.status}`, 'error');
        return false;
      }
      return true;
    } catch (err) {
      showToast?.(`Save failed: ${err.message}`, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    const ok = await patch({
      kind,
      default_trim_start: parseFloat(trimStart) || 0,
      default_trim_end: parseFloat(trimEnd) || 0,
      default_crop_x: parseFloat(cropX) || 0,
      default_crop_y: parseFloat(cropY) || 0,
      default_crop_width: parseFloat(cropW) || 100,
      default_crop_height: parseFloat(cropH) || 100,
    });
    if (ok) {
      showToast?.('Saved', 'success');
      onChanged?.();
    }
  };

  const onSetPrimary = async () => {
    const ok = await patch({ is_primary: true });
    if (ok) {
      showToast?.('Set as primary', 'success');
      onChanged?.();
    }
  };

  const onRemove = async () => {
    if (!window.confirm(
      `Remove this video link from the firework?\n\n` +
      `The video file itself stays in storage; this just unlinks it.`
    )) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/firework_videos/${video.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast?.(`Remove failed: ${err.error || res.status}`, 'error');
        return;
      }
      showToast?.('Video unlinked', 'success');
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const numCls =
    'bg-surface2 border border-border text-text px-2 py-1 rounded text-xs w-20 focus:outline-none focus:border-accent';

  return (
    <div className="bg-surface2 border border-border rounded p-3">
      <div className="flex items-start gap-3 mb-3">
        <video
          src={video.url}
          className="w-40 h-24 object-cover bg-deepstone rounded flex-shrink-0"
          preload="metadata"
          controls
        />
        <div className="flex-1 min-w-0 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate text-text">
              {video.video_title || video.filename}
            </span>
            {video.is_primary ? (
              <span className="text-[10px] uppercase tracking-wider text-gold border border-gold/40 px-1.5 py-0.5 rounded">
                primary
              </span>
            ) : (
              <button
                onClick={onSetPrimary}
                disabled={busy}
                className="text-[10px] uppercase tracking-wider text-dim hover:text-text border border-border hover:border-border-strong px-1.5 py-0.5 rounded"
              >
                set as primary
              </button>
            )}
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="text-xs bg-surface3 border border-border text-text px-2 py-0.5 rounded"
            >
              <option value="user">user</option>
              <option value="manufacturer">manufacturer</option>
              <option value="review">review</option>
            </select>
          </div>
          <div className="text-xs text-dim font-mono truncate mt-1">
            {video.filename}
          </div>
        </div>
        <button
          onClick={onRemove}
          disabled={busy}
          className="text-xs text-ember hover:text-ember/80 border border-ember/40 hover:border-ember px-2 py-1 rounded shrink-0"
          title="Unlink this video from the firework"
        >
          unlink
        </button>
      </div>

      {/* Default trim + crop */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-dim w-20">Trim start</span>
          <input
            type="number" step="0.1" min="0"
            value={trimStart}
            onChange={(e) => setTrimStart(e.target.value)}
            className={numCls}
          />
          <span className="text-muted">s</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-dim w-20">Trim end</span>
          <input
            type="number" step="0.1" min="0"
            value={trimEnd}
            onChange={(e) => setTrimEnd(e.target.value)}
            className={numCls}
          />
          <span className="text-muted">s</span>
        </label>
        <div />
        <label className="flex items-center gap-2">
          <span className="text-dim w-20">Crop X</span>
          <input
            type="number" step="1" min="0" max="100"
            value={cropX}
            onChange={(e) => setCropX(e.target.value)}
            className={numCls}
          />
          <span className="text-muted">%</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-dim w-20">Crop Y</span>
          <input
            type="number" step="1" min="0" max="100"
            value={cropY}
            onChange={(e) => setCropY(e.target.value)}
            className={numCls}
          />
          <span className="text-muted">%</span>
        </label>
        <div />
        <label className="flex items-center gap-2">
          <span className="text-dim w-20">Crop W</span>
          <input
            type="number" step="1" min="1" max="100"
            value={cropW}
            onChange={(e) => setCropW(e.target.value)}
            className={numCls}
          />
          <span className="text-muted">%</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-dim w-20">Crop H</span>
          <input
            type="number" step="1" min="1" max="100"
            value={cropH}
            onChange={(e) => setCropH(e.target.value)}
            className={numCls}
          />
          <span className="text-muted">%</span>
        </label>
        <div className="flex items-center justify-end">
          <button
            onClick={onSave}
            disabled={!dirty || busy}
            className="bg-accent hover:bg-accent-strong disabled:bg-surface3 disabled:text-muted disabled:cursor-not-allowed text-bg font-medium px-3 py-1 rounded"
          >
            {busy ? '…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    </div>
  );
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
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="text-center text-dim">Loading firework…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg text-text p-8">
        <button
          onClick={onBack}
          className="text-dim hover:text-text border border-border hover:border-border-strong px-3 py-1 rounded text-sm transition mb-4"
        >
          ← Back
        </button>
        <p className="text-ember">Couldn't load firework: {error}</p>
      </div>
    );
  }

  const hasPhoto = boxPhotoUrl?.trim().length > 0;
  const primaryVideo = (original?.videos || []).find((v) => v.is_primary);

  const inputCls =
    'w-full bg-surface2 border border-border text-text px-3 py-2 rounded focus:outline-none focus:border-accent text-sm';
  const labelCls =
    'block text-[11px] uppercase tracking-wider text-dim mb-1.5';

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top bar */}
      <header className="border-b border-border bg-surface sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="text-dim hover:text-text border border-border hover:border-border-strong px-3 py-1 rounded text-xs transition"
          >
            ← back to library
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-accent hover:bg-accent-strong disabled:bg-surface3 disabled:text-muted disabled:cursor-not-allowed text-bg font-semibold px-5 py-2 rounded text-sm"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Top — photo + name + manufacturer */}
        <section className="bg-surface border border-border rounded p-5 flex flex-col md:flex-row gap-5">
          <div className="md:w-56 flex-shrink-0">
            <div className="aspect-square bg-deepstone rounded overflow-hidden border border-border">
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
                <div className="w-full h-full flex items-center justify-center text-muted text-sm">
                  No photo or video
                </div>
              )}
            </div>
            <input
              type="text"
              value={boxPhotoUrl}
              onChange={(e) => setBoxPhotoUrl(e.target.value)}
              placeholder="Box photo URL (optional)"
              className="mt-2 w-full bg-surface2 border border-border text-text px-2 py-1.5 rounded text-xs focus:outline-none focus:border-accent"
            />
            <PhotoUploadControl
              currentUrl={boxPhotoUrl}
              onUploaded={(url) => setBoxPhotoUrl(url)}
              showToast={showToast}
            />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label className={labelCls}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface2 border border-border text-text text-xl font-semibold px-3 py-2 rounded focus:outline-none focus:border-accent"
                placeholder="King Cake"
              />
            </div>
            <div>
              <label className={labelCls}>Manufacturer</label>
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className={inputCls}
                placeholder="Winda Fireworks"
              />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={inputCls}
                placeholder="500-gram zipper cake with crackling tail and silver palms…"
              />
            </div>
          </div>
        </section>

        {/* Spec grid */}
        <section className="bg-surface border border-border rounded p-5">
          <h2 className="text-[11px] uppercase tracking-wider text-dim font-medium mb-4">
            Specs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Shot count</label>
              <input
                type="number"
                value={shotCount}
                onChange={(e) => setShotCount(e.target.value)}
                min="0"
                className={inputCls}
                placeholder="16"
              />
            </div>
            <div>
              <label className={labelCls}>Powder grams</label>
              <input
                type="number"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                min="0"
                className={inputCls}
                placeholder="500"
              />
            </div>
            <div>
              <label className={labelCls}>Price (USD)</label>
              <input
                type="text"
                inputMode="decimal"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                className={inputCls}
                placeholder="49.99"
              />
            </div>
            <div>
              <label className={labelCls}>Fuse delay (sec)</label>
              <input
                type="number"
                value={fuseDelay}
                onChange={(e) => setFuseDelay(e.target.value)}
                step="0.1"
                min="0"
                className={inputCls}
                placeholder="3.5"
              />
              <p className="text-[10px] text-muted mt-1">Light → first effect</p>
            </div>
            <div>
              <label className={labelCls}>Effect duration (sec)</label>
              <input
                type="number"
                value={effectDuration}
                onChange={(e) => setEffectDuration(e.target.value)}
                step="0.1"
                min="0"
                className={inputCls}
                placeholder="35"
              />
              <p className="text-[10px] text-muted mt-1">First effect → last</p>
            </div>
            <div>
              <label className={labelCls}>Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className={inputCls}
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
            <label className={labelCls}>Where to buy (URL)</label>
            <input
              type="text"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className={inputCls}
              placeholder="https://…"
            />
          </div>
        </section>

        {/* JSONB metadata */}
        <section className="bg-surface border border-border rounded p-5">
          <h2 className="text-[11px] uppercase tracking-wider text-dim font-medium mb-1">
            Extra metadata <span className="text-muted normal-case">(JSON)</span>
          </h2>
          <p className="text-xs text-dim mb-3">
            For fields without a first-class column yet — scraped specs, color
            tags, fuse type, etc. Stored as JSONB; queryable later.
          </p>
          <textarea
            value={metaText}
            onChange={(e) => {
              setMetaText(e.target.value);
              setMetaError(null);
            }}
            rows={6}
            spellCheck={false}
            className={`w-full bg-deepstone border text-text px-3 py-2 rounded font-mono text-xs focus:outline-none ${
              metaError
                ? 'border-ember focus:border-ember'
                : 'border-border focus:border-accent'
            }`}
            placeholder='{"colors": ["red","gold"], "fuse_type": "visco"}'
          />
          {metaError && <p className="text-xs text-ember mt-1">⚠ {metaError}</p>}
        </section>

        {/* Videos */}
        <section className="bg-surface border border-border rounded p-5">
          <h2 className="text-[11px] uppercase tracking-wider text-dim font-medium mb-3">
            Videos
          </h2>
          {(original?.videos || []).length === 0 ? (
            <p className="text-muted text-sm">
              No videos linked. Use the desktop downloader to add one.
            </p>
          ) : (
            <div className="space-y-3">
              {original.videos.map((v) => (
                <FireworkVideoRow
                  key={v.id}
                  video={v}
                  showToast={showToast}
                  onChanged={async () => {
                    // Refetch to pick up any field updates / primary swaps.
                    const res = await fetch(`${API_BASE}/api/fireworks/${fireworkId}`, {
                      credentials: 'include',
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setOriginal(data);
                    }
                  }}
                />
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted mt-3">
            Adding alternate videos to an existing firework — coming in a
            follow-up. For now the desktop downloader creates a fresh firework
            per upload.
          </p>
        </section>
      </main>
    </div>
  );
};

export default FireworkEditor;
