import React from 'react';
import {
  THEME_PRESETS,
  CUSTOMIZABLE_TOKENS,
  loadPreset,
  loadOverrides,
  applyTheme,
  readToken,
  savePreset,
  saveOverrides,
} from '../theme.js';

// Some <input type="color"> implementations refuse non-#hex values.
// Convert rgb()/rgba()/named into a hex starting with #; fall back to
// #000000 if we can't.
const toHex = (raw) => {
  if (!raw) return '#000000';
  const s = raw.trim();
  if (s.startsWith('#')) {
    if (s.length === 4) {
      // #RGB → #RRGGBB
      return '#' + s.slice(1).split('').map((c) => c + c).join('');
    }
    return s.slice(0, 7); // strip alpha if present
  }
  // crude rgb(a) parse
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    const [, r, g, b] = m;
    return (
      '#' +
      [r, g, b]
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  return '#000000';
};

/**
 * Theme customizer modal.
 *
 * - Pick a preset (one click apply).
 * - Tweak the handful of tokens that actually drive the look on top of
 *   the preset; live preview via setProperty on body. Hit Save to
 *   persist; Reset wipes overrides for the active preset.
 */
const ThemeCustomizer = ({ onClose }) => {
  const [preset, setPreset] = React.useState(loadPreset());
  const [overrides, setOverrides] = React.useState(loadOverrides());

  // Initial swatch value per token: prefer existing override, otherwise
  // whatever the preset renders.
  const [draft, setDraft] = React.useState({});

  // Re-init draft whenever preset changes — read the post-preset values.
  React.useEffect(() => {
    applyTheme(preset, overrides);
    const next = {};
    for (const t of CUSTOMIZABLE_TOKENS) {
      next[t.key] = overrides[t.key] || readToken(t.key);
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const onPickToken = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    document.body.style.setProperty(key, value);
  };

  const onSave = () => {
    // Persist preset + only tokens that diverge from the preset baseline.
    savePreset(preset);
    // To know what "diverges," temporarily strip overrides and read
    // baseline values, then compute deltas.
    const stripped = {};
    for (const t of CUSTOMIZABLE_TOKENS) {
      document.body.style.removeProperty(t.key);
    }
    const baseline = {};
    for (const t of CUSTOMIZABLE_TOKENS) {
      baseline[t.key] = readToken(t.key);
    }
    // Re-apply current draft so the viewport doesn't flicker.
    for (const [k, v] of Object.entries(draft)) {
      document.body.style.setProperty(k, v);
    }
    // Save only tokens whose draft value differs from the preset baseline.
    const diff = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v && toHex(v) !== toHex(baseline[k])) {
        diff[k] = v;
        stripped[k] = v;
      }
    }
    saveOverrides(diff);
    setOverrides(diff);
    onClose?.();
  };

  const onResetOverrides = () => {
    saveOverrides({});
    setOverrides({});
    applyTheme(preset, {});
    const next = {};
    for (const t of CUSTOMIZABLE_TOKENS) {
      next[t.key] = readToken(t.key);
    }
    setDraft(next);
  };

  const onCancel = () => {
    // Restore the saved state in case the user fiddled.
    applyTheme(loadPreset(), loadOverrides());
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface elev-2 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="font-semibold text-text">Customize theme</h2>
          <button
            onClick={onCancel}
            className="text-dim hover:text-text text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Preset picker */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-dim mb-2">
              Base palette
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {THEME_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={`text-left border rounded p-3 transition ${
                    preset === p.id
                      ? 'border-accent bg-accent-soft'
                      : 'border-border hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{p.icon}</span>
                    <span className="font-medium text-sm">{p.label}</span>
                  </div>
                  <p className="text-[11px] text-dim leading-snug">{p.blurb}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Token tweaks */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-wider text-dim">
                Tweak colors
              </h3>
              <button
                onClick={onResetOverrides}
                className="text-xs text-dim hover:text-text underline"
              >
                reset to preset
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CUSTOMIZABLE_TOKENS.map((t) => {
                const value = toHex(draft[t.key] || '');
                return (
                  <label
                    key={t.key}
                    className="flex items-center gap-3 bg-surface2 border border-border rounded p-2"
                  >
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => onPickToken(t.key, e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer bg-transparent"
                      style={{ padding: 0, border: 'none' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text">
                        {t.label}
                      </div>
                      <div className="text-[11px] text-dim truncate">{t.hint}</div>
                    </div>
                    <code className="font-mono text-[11px] text-dim">
                      {value}
                    </code>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Live preview */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-dim mb-2">
              Preview
            </h3>
            <div className="border border-border rounded bg-surface p-4">
              <div className="flex items-center gap-3 mb-3">
                <button className="bg-accent text-bg font-semibold px-3 py-1.5 rounded text-sm">
                  Primary
                </button>
                <button className="bg-surface2 border border-border text-text px-3 py-1.5 rounded text-sm">
                  Secondary
                </button>
                <span className="text-xs uppercase tracking-wide text-gold border border-gold/40 px-1.5 py-0.5 rounded">
                  TAG
                </span>
                <span className="text-xs text-ember">⚠ warning</span>
                <span className="text-xs text-leaf">● ok</span>
              </div>
              <p className="text-sm text-text">
                The quick brown fox jumps over the lazy dog.
              </p>
              <p className="text-xs text-dim mt-1 font-mono">
                3 fireworks · 60s · 4/29/2026
              </p>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-surface">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-dim hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="bg-accent hover:bg-accent-strong text-bg font-semibold px-4 py-2 rounded text-sm"
          >
            Save theme
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThemeCustomizer;
