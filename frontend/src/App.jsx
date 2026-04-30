import React from 'react';
import { API_BASE } from './api.js';
import LoginView from './components/LoginView.jsx';
import Dashboard from './components/Dashboard.jsx';
import LibraryView from './components/LibraryView.jsx';
import ShowEditor from './components/ShowEditor.jsx';

const TOAST_BG = {
  error: 'bg-red-600',
  success: 'bg-green-600',
  warning: 'bg-yellow-600',
  info: 'bg-blue-600',
};
const TOAST_ICON = {
  error: '❌',
  success: '✅',
  warning: '⚠️',
  info: 'ℹ️',
};

// ---------------------------------------------------------------------------
// Show instance hydration
// ---------------------------------------------------------------------------
//
// The DB stores show.data.fireworks[] as dehydrated instances:
//   { id, firework_id, video_id, offset, trim_start, trim_end,
//     crop_x, crop_y, crop_width, crop_height, volume, color, label }
//
// ShowEditor wants to operate on the legacy "video" shape with field names
// like trimStart/cropWidth and a real video URL. We hydrate on load and
// dehydrate on save so ShowEditor's internals barely change.

const pickFirst = (...values) => values.find((v) => v !== undefined && v !== null);

function hydrateInstance(inst, fireworksById) {
  const fw = fireworksById.get(inst.firework_id);
  if (!fw) {
    return null; // orphan reference — caller filters out
  }
  return {
    id: inst.id || `${inst.firework_id}-${Date.now()}-${Math.random()}`,
    firework_id: fw.id,
    video_id: inst.video_id || null,
    name: inst.label || fw.name,
    filename: fw.primary_filename,
    url: fw.primary_url,
    offset: inst.offset || 0,
    duration: 0, // discovered from video metadata at render time
    volume: pickFirst(inst.volume, 1.0),
    trimStart: pickFirst(inst.trim_start, fw.default_trim_start, 0),
    trimEnd: pickFirst(inst.trim_end, fw.default_trim_end, 0),
    cropX: pickFirst(inst.crop_x, fw.default_crop_x, 0),
    cropY: pickFirst(inst.crop_y, fw.default_crop_y, 0),
    cropWidth: pickFirst(inst.crop_width, fw.default_crop_width, 100),
    cropHeight: pickFirst(inst.crop_height, fw.default_crop_height, 100),
    color: inst.color,
  };
}

function dehydrateInstance(video) {
  return {
    id: video.id,
    firework_id: video.firework_id,
    video_id: video.video_id || null,
    offset: video.offset || 0,
    trim_start: video.trimStart || 0,
    trim_end: video.trimEnd || 0,
    crop_x: video.cropX || 0,
    crop_y: video.cropY || 0,
    crop_width: video.cropWidth ?? 100,
    crop_height: video.cropHeight ?? 100,
    volume: video.volume ?? 1.0,
    color: video.color,
    label: video.name,
  };
}

const FireworksPlanner = () => {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [checkingAuth, setCheckingAuth] = React.useState(true);

  // Project context
  const [projects, setProjects] = React.useState([]);
  const [currentProjectId, setCurrentProjectId] = React.useState(null);

  // Per-project library of fireworks (replaces downloadedVideos)
  const [fireworks, setFireworks] = React.useState([]);

  const [currentView, setCurrentView] = React.useState('dashboard');
  const [currentShowName, setCurrentShowName] = React.useState(null);
  const [currentShowOwnerId, setCurrentShowOwnerId] = React.useState(null);

  const [videos, setVideos] = React.useState([]);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [masterTime, setMasterTime] = React.useState(0);
  const [totalDuration, setTotalDuration] = React.useState(60);
  const [zoom, setZoom] = React.useState(1);
  const [draggingId, setDraggingId] = React.useState(null);
  const [dragStartX, setDragStartX] = React.useState(0);
  const [dragStartOffset, setDragStartOffset] = React.useState(0);

  const [savedSessions, setSavedSessions] = React.useState([]);
  const [gridHeight, setGridHeight] = React.useState(400);
  const [toasts, setToasts] = React.useState([]);

  const videoRefs = React.useRef({});
  const timelineRef = React.useRef(null);
  const animationRef = React.useRef(null);
  const lastTimeRef = React.useRef(Date.now());
  const isPlayingRef = React.useRef(false);

  const showToast = React.useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // --- Derived maps over the firework inventory --------------------------
  const fireworksById = React.useMemo(
    () => new Map(fireworks.map((f) => [f.id, f])),
    [fireworks],
  );

  // ---------- Auth ----------
  const checkAuth = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated && data.user) {
        setAuthenticated(true);
        setCurrentUser(data.user);
        const userProjects = data.user.projects || [];
        setProjects(userProjects);
        if (userProjects.length > 0) setCurrentProjectId(userProjects[0].id);

        const hash = window.location.hash;
        if (hash.includes('#/dashboard') || hash.includes('error=')) {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname + '#/dashboard',
          );
        }
      } else {
        setAuthenticated(false);
        setCurrentUser(null);
        setProjects([]);
        setCurrentProjectId(null);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      setAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  React.useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogin = async (user) => {
    setAuthenticated(true);
    setCurrentUser(user);
    showToast(`Welcome, ${user.username}!`, 'success');
    // /api/auth/login returns the basic user record; the projects list lives
    // on /api/auth/me. Re-fetch so the UI knows what projects this user has.
    await checkAuth();
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    setAuthenticated(false);
    setCurrentUser(null);
    setProjects([]);
    setCurrentProjectId(null);
    setSavedSessions([]);
    setFireworks([]);
    setVideos([]);
    setCurrentView('dashboard');
    showToast('Logged out', 'info');
  };

  // ---------- Server data (project-scoped) ----------
  const loadFireworks = React.useCallback(async (projectId) => {
    if (!projectId) {
      setFireworks([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/fireworks`, {
        credentials: 'include',
      });
      if (!res.ok) {
        console.error('Failed to load project fireworks:', res.status);
        setFireworks([]);
        return;
      }
      const data = await res.json();
      setFireworks(data);
    } catch (err) {
      console.error('Failed to load fireworks:', err);
      setFireworks([]);
    }
  }, []);

  const loadShowsList = React.useCallback(async (projectId) => {
    if (!projectId) {
      setSavedSessions([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/shows`, {
        credentials: 'include',
      });
      if (!res.ok) {
        setSavedSessions([]);
        return;
      }
      const shows = await res.json();
      setSavedSessions(
        shows.map((s) => ({
          name: s.name,
          timestamp: s.timestamp,
          totalDuration: s.data?.totalDuration || 60,
          zoom: s.data?.zoom || 1,
          fireworks: s.data?.fireworks || [],
          user_id: s.created_by_user_id,
          creator_username: s.creator_username,
        })),
      );
    } catch (err) {
      console.error('Failed to load shows:', err);
      setSavedSessions([]);
    }
  }, []);

  React.useEffect(() => {
    if (!authenticated || !currentProjectId) return;
    loadFireworks(currentProjectId);
    loadShowsList(currentProjectId);
    const savedGridHeight = localStorage.getItem('fwp_gridHeight');
    if (savedGridHeight) setGridHeight(parseInt(savedGridHeight, 10));
  }, [authenticated, currentProjectId, loadFireworks, loadShowsList]);

  React.useEffect(() => {
    if (authenticated && currentView === 'dashboard' && currentProjectId) {
      loadFireworks(currentProjectId);
    }
  }, [currentView, authenticated, currentProjectId, loadFireworks]);

  // ---------- Show navigation ----------
  const handleNewShow = () => {
    setCurrentShowName(null);
    setCurrentShowOwnerId(null);
    setVideos([]);
    setMasterTime(0);
    setTotalDuration(60);
    setZoom(1);
    setIsPlaying(false);
    setCurrentView('editor');
  };

  const handleEditShow = async (showName, ownerUserId = null) => {
    if (!currentProjectId) return;
    let session = null;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${currentProjectId}/shows`, {
        credentials: 'include',
      });
      if (res.ok) {
        const shows = await res.json();
        const found = shows.find((s) =>
          ownerUserId != null
            ? s.name === showName && s.created_by_user_id === ownerUserId
            : s.name === showName,
        );
        if (found) {
          session = {
            name: found.name,
            timestamp: found.timestamp,
            totalDuration: found.data?.totalDuration || 60,
            zoom: found.data?.zoom || 1,
            fireworks: found.data?.fireworks || [],
            user_id: found.created_by_user_id,
          };
        }
      }
    } catch (err) {
      console.warn('Failed to load show from server:', err);
    }

    if (!session) {
      showToast('Show not found', 'error');
      return;
    }

    // Clean up existing video refs
    videos.forEach((v) => {
      if (v.url && v.url.startsWith('blob:')) URL.revokeObjectURL(v.url);
    });
    Object.keys(videoRefs.current).forEach((key) => delete videoRefs.current[key]);

    // Hydrate firework instances against the in-memory fireworks index.
    const restoredVideos = session.fireworks
      .map((inst) => hydrateInstance(inst, fireworksById))
      .filter(Boolean);

    setVideos(restoredVideos);
    setTotalDuration(session.totalDuration || 60);
    setZoom(session.zoom || 1);
    setMasterTime(0);
    setIsPlaying(false);
    setCurrentShowName(showName);
    setCurrentShowOwnerId(session.user_id ?? ownerUserId ?? currentUser?.id ?? null);
    setCurrentView('editor');
    setTimeout(() => showToast(`Loaded "${showName}"`, 'success'), 100);
  };

  const handleBackToDashboard = () => {
    // Project members all share editing on a project's shows; persist any
    // outstanding edits before navigating back.
    if (currentShowName && videos.length > 0) {
      saveShow(currentShowName, true);
    }
    setCurrentShowOwnerId(null);
    setCurrentShowName(null);
    setCurrentView('dashboard');
    setIsPlaying(false);
    if (currentProjectId) loadShowsList(currentProjectId);
  };

  const handleGoToLibrary = () => {
    setCurrentView('library');
    if (currentProjectId) loadFireworks(currentProjectId);
  };

  const handleBackFromLibrary = () => {
    setCurrentView('dashboard');
    if (currentProjectId) loadFireworks(currentProjectId);
  };

  const handleDeleteShow = async (name, ownerUserId = null) => {
    if (!currentProjectId) return;
    try {
      await fetch(
        `${API_BASE}/api/projects/${currentProjectId}/shows/${encodeURIComponent(name)}`,
        { method: 'DELETE', credentials: 'include' },
      );
    } catch (err) {
      console.warn('Failed to delete show:', err);
    }
    loadShowsList(currentProjectId);
    showToast(`Deleted show "${name}"`, 'success');
  };

  const handleDownloadComplete = async (dl) => {
    // Server-side downloads now mint a firework + add to project inventory.
    // We just refresh the firework list.
    if (currentProjectId) await loadFireworks(currentProjectId);
    showToast(`Downloaded: ${dl.title || dl.filename || 'Video'}`, 'success');
  };

  // Add a firework (already in project inventory) into the current show.
  const handleAddFromLibrary = (firework) => {
    const newInstance = {
      id: `${firework.id}-${Date.now()}`,
      firework_id: firework.id,
      video_id: null,
      name: firework.name,
      filename: firework.primary_filename,
      url: firework.primary_url,
      offset: 0,
      duration: 0,
      volume: 1.0,
      trimStart: firework.default_trim_start || 0,
      trimEnd: firework.default_trim_end || 0,
      cropX: firework.default_crop_x || 0,
      cropY: firework.default_crop_y || 0,
      cropWidth: firework.default_crop_width ?? 100,
      cropHeight: firework.default_crop_height ?? 100,
      color: `hsl(${videos.length * 60}, 70%, 50%)`,
    };
    setVideos((prev) => [...prev, newInstance]);

    if (!firework.primary_filename) {
      showToast(`"${firework.name}" has no video yet`, 'warning');
      return;
    }
    // Try to load duration via a temp video element so the timeline knows the length.
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = firework.primary_url;
    tempVideo.crossOrigin = 'anonymous';
    tempVideo.addEventListener('loadedmetadata', () => {
      const duration = tempVideo.duration;
      if (duration && duration > 0) {
        setVideos((prev) =>
          prev.map((v) => (v.id === newInstance.id ? { ...v, duration } : v)),
        );
      }
      tempVideo.remove();
    });
    tempVideo.addEventListener('error', () => tempVideo.remove());
    tempVideo.load();
  };

  // Push the show-instance trim/crop back to the firework's primary video defaults.
  const handleSaveSettingsToLibrary = async (firework_id, settings) => {
    if (!firework_id) return { ok: false };
    const fw = fireworksById.get(firework_id);
    if (!fw || !fw.primary_firework_video_id) {
      showToast('Firework has no primary video to update', 'warning');
      return { ok: false };
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/firework_videos/${fw.primary_firework_video_id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            default_trim_start: settings.defaultTrimStart,
            default_trim_end: settings.defaultTrimEnd,
            default_crop_x: settings.defaultCropX,
            default_crop_y: settings.defaultCropY,
            default_crop_width: settings.defaultCropWidth,
            default_crop_height: settings.defaultCropHeight,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`Couldn't save: ${err.error || res.status}`, 'error');
        return { ok: false };
      }
      await loadFireworks(currentProjectId);
      showToast(`Saved trim/crop to "${fw.name}"`, 'success');
      return { ok: true };
    } catch (err) {
      showToast(`Couldn't save settings: ${err.message}`, 'error');
      return { ok: false };
    }
  };

  const saveShow = React.useCallback(
    async (name, silent = false) => {
      if (!name || !name.trim()) {
        if (!silent) showToast('Please enter a show name', 'warning');
        return;
      }
      if (!currentProjectId) return;
      const sessionData = {
        totalDuration,
        zoom,
        fireworks: videos.map(dehydrateInstance),
      };
      try {
        await fetch(`${API_BASE}/api/projects/${currentProjectId}/shows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: name.trim(), data: sessionData }),
        });
      } catch (err) {
        console.warn('Failed to save show to server:', err);
      }
      loadShowsList(currentProjectId);
      setCurrentShowName(name.trim());
      if (!silent) showToast(`Show "${name.trim()}" saved!`, 'success');
    },
    [totalDuration, zoom, videos, currentProjectId, loadShowsList, showToast],
  );

  // Auto-save (debounced)
  const prevVideosStateRef = React.useRef(null);
  React.useEffect(() => {
    if (currentView !== 'editor' || !currentShowName || videos.length === 0) {
      prevVideosStateRef.current = null;
      return;
    }
    const hasAnyVideosLoaded = videos.some((v) => v.duration && v.duration > 0);
    if (!hasAnyVideosLoaded) return;

    const currentVideosState = JSON.stringify(
      videos
        .map((v) => ({
          id: v.id,
          firework_id: v.firework_id,
          offset: v.offset,
          trimStart: v.trimStart,
          trimEnd: v.trimEnd,
          cropX: v.cropX,
          cropY: v.cropY,
          cropWidth: v.cropWidth,
          cropHeight: v.cropHeight,
          volume: v.volume,
          color: v.color,
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    );
    const fullState = JSON.stringify({
      videos: currentVideosState,
      totalDuration,
      zoom,
    });
    if (fullState === prevVideosStateRef.current) return;
    prevVideosStateRef.current = fullState;

    const timeoutId = setTimeout(() => saveShow(currentShowName, true), 15000);
    return () => clearTimeout(timeoutId);
  }, [
    currentView,
    currentShowName,
    currentShowOwnerId,
    currentUser,
    videos,
    totalDuration,
    zoom,
    saveShow,
  ]);

  // Playback loop (unchanged from prior version)
  React.useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  React.useEffect(() => {
    if (isPlaying && totalDuration > 0) {
      lastTimeRef.current = Date.now();
      const tick = () => {
        if (!isPlayingRef.current) {
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }
          return;
        }
        const now = Date.now();
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        setMasterTime((prev) => {
          const next = prev + delta;
          if (next >= totalDuration) {
            isPlayingRef.current = false;
            setIsPlaying(false);
            return totalDuration;
          }
          return next;
        });
        animationRef.current = requestAnimationFrame(tick);
      };
      animationRef.current = requestAnimationFrame(tick);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, totalDuration]);

  // Per-frame sync (unchanged)
  React.useEffect(() => {
    videos.forEach((video) => {
      const videoEl = videoRefs.current[video.id];
      if (!videoEl) return;
      if (!video.duration || video.duration <= 0) return;
      videoEl.volume = video.volume || 1.0;
      const trimStart = video.trimStart || 0;
      const trimEnd = video.trimEnd || 0;
      const videoTime = masterTime - (video.offset || 0);
      const trimmedDuration = video.duration - trimStart - trimEnd;
      if (trimmedDuration <= 0) return;

      if (videoTime >= 0 && videoTime <= trimmedDuration) {
        const actualVideoTime = videoTime + trimStart;
        if (videoEl.paused) {
          if (Math.abs(videoEl.currentTime - actualVideoTime) > 0.1) {
            videoEl.currentTime = actualVideoTime;
          }
        } else if (Math.abs(videoEl.currentTime - actualVideoTime) > 0.5) {
          videoEl.currentTime = actualVideoTime;
        }
        if (isPlaying && videoEl.paused) {
          if (videoEl.readyState >= 2) {
            const container = videoEl.parentElement;
            if (container) {
              const cs = window.getComputedStyle(container);
              if (cs.visibility === 'hidden' || cs.opacity === '0') {
                container.style.visibility = 'visible';
                container.style.opacity = '1';
              }
            }
            if (Math.abs(videoEl.currentTime - actualVideoTime) > 0.1) {
              videoEl.currentTime = actualVideoTime;
            }
            videoEl.volume = video.volume || 1.0;
            if (video.volume > 0) videoEl.muted = false;
            const playPromise = videoEl.play();
            if (playPromise !== undefined) {
              playPromise.catch((err) => {
                console.error(
                  `[Video Sync] Failed to play ${video.id} (${video.name || 'unnamed'}):`,
                  err,
                );
              });
            }
          }
        } else if (!isPlaying && !videoEl.paused) {
          videoEl.pause();
        }
      } else {
        if (!videoEl.paused) videoEl.pause();
        if (videoTime < 0) videoEl.currentTime = trimStart;
      }
    });
  }, [masterTime, videos, isPlaying]);

  // ---------- Project switcher (header) ----------
  const handleProjectSwitch = (projectId) => {
    setCurrentProjectId(projectId);
    setCurrentView('dashboard');
    setVideos([]);
    setCurrentShowName(null);
    setCurrentShowOwnerId(null);
  };

  // ---------- Render ----------
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🎆</div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  if (projects.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white flex items-center justify-center p-6">
        <div className="bg-gray-800/80 rounded-lg p-8 max-w-md text-center border border-purple-500/30">
          <div className="text-4xl mb-4">🎆</div>
          <h2 className="text-xl font-bold mb-2">No projects yet</h2>
          <p className="text-gray-400 mb-4">
            You're signed in but you don't have access to any projects. Ask an
            admin to add you to one, or create a new project below.
          </p>
          <button
            className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded font-bold"
            onClick={async () => {
              const name = window.prompt('Project name (e.g. "2027 - 4th of July"):');
              if (!name?.trim()) return;
              const res = await fetch(`${API_BASE}/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: name.trim() }),
              });
              if (res.ok) {
                const proj = await res.json();
                setProjects([proj]);
                setCurrentProjectId(proj.id);
              }
            }}
          >
            + Create Project
          </button>
          <button onClick={handleLogout} className="block mt-4 text-sm text-gray-400 underline w-full">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const currentProject = projects.find((p) => p.id === currentProjectId);

  return (
    <div>
      {currentView === 'dashboard' && (
        <Dashboard
          onEditShow={handleEditShow}
          onNewShow={handleNewShow}
          onGoToLibrary={handleGoToLibrary}
          savedSessions={savedSessions}
          onDeleteShow={handleDeleteShow}
          fireworks={fireworks}
          onDownloadComplete={handleDownloadComplete}
          currentUser={currentUser}
          currentProject={currentProject}
          projects={projects}
          onSwitchProject={handleProjectSwitch}
          onLogout={handleLogout}
          showToast={showToast}
        />
      )}
      {currentView === 'library' && (
        <LibraryView
          fireworks={fireworks}
          currentProject={currentProject}
          onBack={handleBackFromLibrary}
          onDownloadComplete={handleDownloadComplete}
          onRefresh={() => loadFireworks(currentProjectId)}
          showToast={showToast}
        />
      )}
      {currentView === 'editor' && (
        <ShowEditor
          showName={currentShowName}
          videos={videos}
          setVideos={setVideos}
          fireworks={fireworks}
          fireworksById={fireworksById}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          masterTime={masterTime}
          setMasterTime={setMasterTime}
          totalDuration={totalDuration}
          setTotalDuration={setTotalDuration}
          zoom={zoom}
          setZoom={setZoom}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          dragStartX={dragStartX}
          setDragStartX={setDragStartX}
          dragStartOffset={dragStartOffset}
          setDragStartOffset={setDragStartOffset}
          gridHeight={gridHeight}
          setGridHeight={setGridHeight}
          videoRefs={videoRefs}
          timelineRef={timelineRef}
          onSave={saveShow}
          onBack={handleBackToDashboard}
          onAddFromLibrary={handleAddFromLibrary}
          onSaveSettingsToLibrary={handleSaveSettingsToLibrary}
          onDownloadComplete={handleDownloadComplete}
          showToast={showToast}
          isReadOnly={false}
          ownerLabel={null}
        />
      )}

      {/* Toast notifications */}
      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2"
        style={{ maxWidth: '400px' }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${TOAST_BG[toast.type] || TOAST_BG.info} text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-2`}
          >
            <span className="text-lg">{TOAST_ICON[toast.type] || TOAST_ICON.info}</span>
            <span className="flex-1 text-sm">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FireworksPlanner;
