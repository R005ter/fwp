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
      <div className="bg-gray-900 border border-purple-500/40 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold text-purple-300">⚙️ Project settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-gray-400 text-center">Loading…</div>
        ) : error ? (
          <div className="p-6 text-red-400">Couldn't load: {error}</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Project name */}
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-400 mb-2">
                Project name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner}
                  className="flex-1 bg-gray-800 border border-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
                />
                {isOwner && (
                  <button
                    onClick={onRename}
                    disabled={renaming || name.trim() === project?.name}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
                  >
                    {renaming ? '…' : 'Rename'}
                  </button>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Plan: <span className="text-gray-300">{project?.plan || 'free'}</span>
                {' · '}
                You are <span className="text-gray-300">{ROLE_LABELS[role]}</span>
              </div>
            </div>

            {/* Members */}
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
                Members ({members.length})
              </h3>
              <div className="space-y-1">
                {members.map((m) => {
                  const isSelf = m.user_id === currentUserId;
                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center gap-3 bg-gray-800/60 rounded px-3 py-2 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{m.username}</div>
                        {m.email && (
                          <div className="text-xs text-gray-500 truncate">{m.email}</div>
                        )}
                      </div>
                      {isOwner && !isSelf ? (
                        <select
                          value={m.role}
                          onChange={(e) =>
                            onChangeRole(m.user_id, m.username, e.target.value)
                          }
                          className="bg-gray-700 text-xs px-2 py-1 rounded"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="owner">Owner</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {ROLE_LABELS[m.role]}
                          {isSelf && ' (you)'}
                        </span>
                      )}
                      {isOwner && !isSelf && (
                        <button
                          onClick={() => onRemove(m.user_id, m.username)}
                          className="text-xs bg-red-700/70 hover:bg-red-700 px-2 py-1 rounded"
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
              <div className="bg-gray-800/40 border border-purple-500/20 rounded p-4">
                <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
                  Add member
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={inviteIdent}
                    onChange={(e) => setInviteIdent(e.target.value)}
                    placeholder="email or username"
                    className="flex-1 bg-gray-800 border border-gray-700 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="bg-gray-800 border border-gray-700 px-3 py-2 rounded"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    onClick={onInvite}
                    disabled={inviting || !inviteIdent.trim()}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
                  >
                    {inviting ? '…' : 'Add'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  The user must already have signed in once. Adding them here
                  gives them immediate access; there's no email invite (yet).
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
