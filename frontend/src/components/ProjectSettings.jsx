import React from 'react';
import { API_BASE } from '../api.js';

const ROLE_LABELS = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

/**
 * Modal: project metadata + members.
 *
 * - Owners can rename the project, add/remove members, change member roles.
 * - Editors and viewers see the member list read-only.
 * - Self-removal is blocked server-side; we hide the button in UI too.
 */
const ProjectSettings = ({
  projectId,
  currentUserId,
  onClose,
  onProjectChanged,
  showToast,
}) => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [project, setProject] = React.useState(null);
  const [role, setRole] = React.useState('viewer');
  const [members, setMembers] = React.useState([]);

  // Editable fields
  const [name, setName] = React.useState('');
  const [renaming, setRenaming] = React.useState(false);

  // Add member form
  const [inviteIdent, setInviteIdent] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState('editor');
  const [inviting, setInviting] = React.useState(false);

  const isOwner = role === 'owner';

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProject(data.project);
      setRole(data.role);
      setMembers(data.members || []);
      setName(data.project?.name || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const onRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === project?.name) return;
    setRenaming(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showToast?.('Project renamed', 'success');
      onProjectChanged?.();
      reload();
    } catch (err) {
      showToast?.(`Rename failed: ${err.message}`, 'error');
    } finally {
      setRenaming(false);
    }
  };

  const onInvite = async () => {
    const ident = inviteIdent.trim();
    if (!ident) return;
    const body = ident.includes('@') ? { email: ident } : { username: ident };
    body.role = inviteRole;
    setInviting(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setInviteIdent('');
      showToast?.(`Added ${ident} as ${inviteRole}`, 'success');
      reload();
    } catch (err) {
      showToast?.(`Add failed: ${err.message}`, 'error');
    } finally {
      setInviting(false);
    }
  };

  const onRemove = async (memberUserId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this project?`)) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/projects/${projectId}/members/${memberUserId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showToast?.(`Removed ${memberName}`, 'success');
      reload();
    } catch (err) {
      showToast?.(`Remove failed: ${err.message}`, 'error');
    }
  };

  const onChangeRole = async (memberUserId, memberName, newRole) => {
    try {
      // Re-add with new role — POST upserts via ON CONFLICT.
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: members.find((m) => m.user_id === memberUserId)?.username,
          email: members.find((m) => m.user_id === memberUserId)?.email,
          role: newRole,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showToast?.(`${memberName} is now ${ROLE_LABELS[newRole]}`, 'success');
      reload();
    } catch (err) {
      showToast?.(`Update failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto elev-2">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="font-semibold text-text">⚙️ Project settings</h2>
          <button
            onClick={onClose}
            className="text-dim hover:text-text text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-dim text-center">Loading…</div>
        ) : error ? (
          <div className="p-6 text-ember">Couldn't load: {error}</div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Project name */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-dim mb-2">
                Project name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner}
                  className="flex-1 bg-surface2 border border-border text-text px-3 py-2 rounded text-sm focus:outline-none focus:border-accent disabled:opacity-60"
                />
                {isOwner && (
                  <button
                    onClick={onRename}
                    disabled={renaming || name.trim() === project?.name}
                    className="bg-accent hover:bg-accent-strong disabled:bg-surface3 disabled:text-muted disabled:cursor-not-allowed text-bg font-semibold px-4 py-2 rounded text-sm"
                  >
                    {renaming ? '…' : 'Rename'}
                  </button>
                )}
              </div>
              <div className="mt-1 text-xs text-muted">
                Plan: <span className="text-dim">{project?.plan || 'free'}</span>
                {' · '}
                You are <span className="text-dim">{ROLE_LABELS[role]}</span>
              </div>
            </div>

            {/* Members */}
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-dim mb-2">
                Members ({members.length})
              </h3>
              <div className="space-y-1">
                {members.map((m) => {
                  const isSelf = m.user_id === currentUserId;
                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center gap-3 bg-surface2 border border-border rounded px-3 py-2 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-text truncate">{m.username}</div>
                        {m.email && (
                          <div className="text-xs text-dim font-mono truncate">{m.email}</div>
                        )}
                      </div>
                      {isOwner && !isSelf ? (
                        <select
                          value={m.role}
                          onChange={(e) =>
                            onChangeRole(m.user_id, m.username, e.target.value)
                          }
                          className="bg-surface3 border border-border text-text text-xs px-2 py-1 rounded"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="owner">Owner</option>
                        </select>
                      ) : (
                        <span className="text-xs text-dim">
                          {ROLE_LABELS[m.role]}
                          {isSelf && ' (you)'}
                        </span>
                      )}
                      {isOwner && !isSelf && (
                        <button
                          onClick={() => onRemove(m.user_id, m.username)}
                          className="text-xs text-ember hover:text-ember/80 border border-ember/40 hover:border-ember px-2 py-1 rounded"
                          title="Remove from project"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invite */}
            {isOwner && (
              <div className="bg-surface2 border border-border rounded p-4">
                <h3 className="text-[11px] uppercase tracking-wider text-dim mb-2">
                  Add member
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={inviteIdent}
                    onChange={(e) => setInviteIdent(e.target.value)}
                    placeholder="email or username"
                    className="flex-1 bg-surface3 border border-border text-text px-3 py-2 rounded text-sm focus:outline-none focus:border-accent"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="bg-surface3 border border-border text-text px-3 py-2 rounded text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    onClick={onInvite}
                    disabled={inviting || !inviteIdent.trim()}
                    className="bg-accent hover:bg-accent-strong disabled:bg-surface3 disabled:text-muted disabled:cursor-not-allowed text-bg font-semibold px-4 py-2 rounded text-sm"
                  >
                    {inviting ? '…' : 'Add'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  The user must already have signed in once. Adding them here
                  gives them immediate access; there's no email invite yet.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectSettings;
