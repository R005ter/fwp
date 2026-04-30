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

const FireworksPlanner = () => {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [checkingAuth, setCheckingAuth] = React.useState(true);

  const [currentView, setCurrentView] = React.useState('dashboard');
  const [currentShowName, setCurrentShowName] = React.useState(null);
  // user_id of the show currently loaded into the editor. Used so admin
  // viewing-another-user's-show flows don't accidentally clone or stomp
  // the show under the admin's account.
  const [currentShowOwnerId, setCurrentShowOwnerId] = React.useState(null);

  const [videos, setVideos] = React.useState([]);
  const [downloadedVideos, setDownloadedVideos] = React.useState(new Map());
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
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // ---------- Auth ----------
  const checkAuth = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated && data.user) {
        setAuthenticated(true);
        setCurrentUser(data.user);
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

  const handleLogin = (user) => {
    setAuthenticated(true);
    setCurrentUser(user);
    showToast(`Welcome, ${user.username}!`, 'success');
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
    setSavedSessions([]);
    setDownloadedVideos(new Map());
    setVideos([]);
    setCurrentView('dashboard');
    showToast('Logged out', 'info');
  };

  // ---------- Server data ----------
  const loadSessionsList = React.useCallback(async () => {
    if (!authenticated) {
      const sessions = JSON.parse(localStorage.getItem('fwp_sessions') || '[]');
      setSavedSessions(sessions);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/shows`, { credentials: 'include' });
      if (!res.ok) {
        setSavedSessions([]);
        return;
      }
      const sessions = await res.json();
      setSavedSessions(
        sessions.map((s) => ({
          name: s.name,
          timestamp: s.timestamp,
          totalDuration: s.data.totalDuration || 60,
          zoom: s.data.zoom || 1,
          videos: s.data.videos || [],
          user_id: s.user_id,
          creator_username: s.creator_username,
          creator_email: s.creator_email,
        })),
      );
    } catch (err) {
      console.error('Failed to load shows from server:', err);
      setSavedSessions([]);
    }
  }, [authenticated]);

  const loadAvailableVideos = React.useCallback(async () => {
    const videoMap = new Map();
    if (!authenticated) {
      setDownloadedVideos(videoMap);
      return;
    }
    try {
      const videosRes = await fetch(`${API_BASE}/api/videos`, { credentials: 'include' });
      if (!videosRes.ok) {
        setDownloadedVideos(videoMap);
        return;
      }
      const serverVideos = await videosRes.json();

      let serverLibrary = {};
      try {
        const libraryRes = await fetch(`${API_BASE}/api/library`, { credentials: 'include' });
        if (libraryRes.ok) serverLibrary = await libraryRes.json();
      } catch (e) {
        console.warn('Failed to load library from server:', e);
      }

      serverVideos.forEach((video) => {
        if (videoMap.has(video.filename)) return;
        const savedData = serverLibrary[video.filename] || {};
        videoMap.set(video.filename, {
          filename: video.filename,
          title: savedData.title || video.title || video.filename,
          url: `${API_BASE}/videos/${video.filename}`,
          sourceUrl: savedData.sourceUrl || null,
          size: video.size,
          duration: savedData.duration || video.duration || null,
          defaultTrimStart: savedData.defaultTrimStart || 0,
          defaultTrimEnd: savedData.defaultTrimEnd || 0,
          defaultCropX: savedData.defaultCropX || 0,
          defaultCropY: savedData.defaultCropY || 0,
          defaultCropWidth: savedData.defaultCropWidth || 100,
          defaultCropHeight: savedData.defaultCropHeight || 100,
        });
      });
    } catch (err) {
      console.warn('Failed to load videos from server:', err);
    }
    setDownloadedVideos(videoMap);
  }, [authenticated]);

  React.useEffect(() => {
    if (!authenticated) return;
    loadSessionsList();
    loadAvailableVideos();
    const savedGridHeight = localStorage.getItem('fwp_gridHeight');
    if (savedGridHeight) setGridHeight(parseInt(savedGridHeight, 10));
  }, [authenticated, loadSessionsList, loadAvailableVideos]);

  React.useEffect(() => {
    if (authenticated && currentView === 'dashboard') loadAvailableVideos();
  }, [currentView, authenticated, loadAvailableVideos]);

  // ---------- Library mutations ----------
  const saveLibraryMetadata = async (videosMap) => {
    const libraryData = {};
    videosMap.forEach((video, filename) => {
      libraryData[filename] = {
        title: video.title,
        sourceUrl: video.sourceUrl,
        duration: video.duration,
        defaultTrimStart: video.defaultTrimStart || 0,
        defaultTrimEnd: video.defaultTrimEnd || 0,
        defaultCropX: video.defaultCropX || 0,
        defaultCropY: video.defaultCropY || 0,
        defaultCropWidth: video.defaultCropWidth || 100,
        defaultCropHeight: video.defaultCropHeight || 100,
      };
    });
    localStorage.setItem('fwp_library', JSON.stringify(libraryData));
    if (!authenticated) return;
    try {
      for (const [filename, metadata] of Object.entries(libraryData)) {
        await fetch(`${API_BASE}/api/library`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ filename, metadata }),
        });
      }
    } catch (err) {
      console.warn('Failed to sync library to server:', err);
    }
  };

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
    let session = null;
    if (authenticated) {
      try {
        const res = await fetch(`${API_BASE}/api/shows`, { credentials: 'include' });
        if (res.ok) {
          const shows = await res.json();
          // Disambiguate by user_id when the caller knows it (admins viewing
          // someone else's show); otherwise fall back to name match.
          const found = shows.find((s) =>
            ownerUserId != null
              ? s.name === showName && s.user_id === ownerUserId
              : s.name === showName,
          );
          if (found) {
            session = {
              name: found.name,
              timestamp: found.timestamp,
              totalDuration: found.data.totalDuration || 60,
              zoom: found.data.zoom || 1,
              videos: found.data.videos || [],
              user_id: found.user_id,
            };
          }
        }
      } catch (err) {
        console.warn('Failed to load show from server:', err);
      }
    }
    if (!session) {
      const sessions = JSON.parse(localStorage.getItem('fwp_sessions') || '[]');
      session = sessions.find((s) => s.name === showName);
    }
    if (!session) {
      showToast('Session not found', 'error');
      return;
    }

    videos.forEach((v) => {
      if (v.url && v.url.startsWith('blob:')) URL.revokeObjectURL(v.url);
    });
    Object.keys(videoRefs.current).forEach((key) => delete videoRefs.current[key]);

    const restoredVideos = session.videos
      .filter((v) => v.filename)
      .map((v) => {
        const libraryVideo = downloadedVideos.get(v.filename);
        let videoUrl = null;
        if (libraryVideo && libraryVideo.url) {
          videoUrl = libraryVideo.url.startsWith('blob:')
            ? libraryVideo.url
            : `${API_BASE}/videos/${v.filename}`;
        } else if (v.filename) {
          videoUrl = `${API_BASE}/videos/${v.filename}`;
        }

        let duration = 0;
        if (v.duration && v.duration > 0) {
          duration = v.duration;
        } else if (libraryVideo && libraryVideo.duration && libraryVideo.duration > 0) {
          duration = libraryVideo.duration;
        } else {
          try {
            const cache = JSON.parse(
              localStorage.getItem('fwp_video_metadata_cache') || '{}',
            );
            const cached = cache[v.filename];
            if (cached && cached.duration && cached.duration > 0) {
              const cacheAge = Date.now() - (cached.cachedAt || 0);
              if (cacheAge < 7 * 24 * 60 * 60 * 1000) duration = cached.duration;
            }
          } catch (err) {
            console.warn('Failed to read video metadata cache:', err);
          }
        }

        return {
          ...v,
          url: videoUrl,
          duration,
          id: v.id || `${v.filename || 'video'}-${Date.now()}-${Math.random()}`,
        };
      })
      .filter((v) => v.url);

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
    // Only auto-save when current user actually owns the show. Without this
    // check, an admin viewing another user's show would silently clone it
    // under their own account on every navigation back to the dashboard.
    const isOwner =
      currentShowOwnerId == null || currentShowOwnerId === currentUser?.id;
    if (currentShowName && videos.length > 0 && isOwner) {
      saveShow(currentShowName, true);
    }
    setCurrentShowOwnerId(null);
    setCurrentShowName(null);
    setCurrentView('dashboard');
    setIsPlaying(false);
    loadSessionsList();
  };

  const handleGoToLibrary = () => {
    setCurrentView('library');
    loadAvailableVideos();
  };

  const handleBackFromLibrary = () => {
    setCurrentView('dashboard');
    loadAvailableVideos();
  };

  const handleDeleteShow = async (name, ownerUserId = null) => {
    const sessions = JSON.parse(localStorage.getItem('fwp_sessions') || '[]');
    localStorage.setItem(
      'fwp_sessions',
      JSON.stringify(sessions.filter((s) => s.name !== name)),
    );
    if (authenticated) {
      try {
        const url = new URL(
          `${API_BASE}/api/shows/${encodeURIComponent(name)}`,
        );
        // Pass user_id when admin is deleting someone else's show; backend
        // enforces admin-only for cross-user deletes.
        if (ownerUserId != null && ownerUserId !== currentUser?.id) {
          url.searchParams.set('user_id', String(ownerUserId));
        }
        await fetch(url.toString(), {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch (err) {
        console.warn('Failed to delete show from server:', err);
      }
    }
    loadSessionsList();
    showToast(`Deleted show "${name}"`, 'success');
  };

  const handleDownloadComplete = async (dl) => {
    const isServerSideDownload =
      dl.filename && dl.status === 'complete' && !dl.localUrl && (!dl.videoId || dl.serverSide);
    if (isServerSideDownload) {
      setTimeout(async () => {
        await loadAvailableVideos();
        showToast(`Downloaded: ${dl.title || dl.filename || 'Video'}`, 'success');
      }, 500);
      return;
    }
    showToast(`Downloaded: ${dl.title || dl.filename || 'Video'}`, 'success');
  };

  const handleDeleteVideo = async (video) => {
    try {
      await fetch(`${API_BASE}/api/videos/${video.filename}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setDownloadedVideos((prev) => {
        const newMap = new Map(prev);
        newMap.delete(video.filename);
        saveLibraryMetadata(newMap);
        return newMap;
      });
      setVideos((prev) => prev.filter((v) => v.filename !== video.filename));
      showToast(`"${video.title}" deleted`, 'success');
    } catch (err) {
      showToast('Failed to delete video: ' + err.message, 'error');
    }
  };

  const handleSaveVideoSettings = async (filename, updates) => {
    setDownloadedVideos((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(filename);
      if (!existing) return newMap;

      const updated = { ...existing, ...updates };
      newMap.set(filename, updated);

      const metadata = {
        title: updated.title,
        sourceUrl: updated.sourceUrl,
        duration: updated.duration,
        defaultTrimStart: updated.defaultTrimStart || 0,
        defaultTrimEnd: updated.defaultTrimEnd || 0,
        defaultCropX: updated.defaultCropX || 0,
        defaultCropY: updated.defaultCropY || 0,
        defaultCropWidth: updated.defaultCropWidth || 100,
        defaultCropHeight: updated.defaultCropHeight || 100,
      };

      if (authenticated) {
        fetch(`${API_BASE}/api/library`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ filename, metadata }),
        })
          .then((res) => {
            if (!res.ok) {
              return res.json().then((err) => {
                throw new Error(err.error || `Server error: ${res.status}`);
              });
            }
            return res.json();
          })
          .catch((err) => {
            console.error('Failed to save video settings:', err);
            showToast(`Failed to save settings: ${err.message}`, 'error');
          });
      }

      const libraryData = JSON.parse(localStorage.getItem('fwp_library') || '{}');
      libraryData[filename] = metadata;
      localStorage.setItem('fwp_library', JSON.stringify(libraryData));
      return newMap;
    });
    showToast('Video settings saved', 'success');
  };

  const handleAddToLibrary = async (filename, title) => {
    if (!authenticated || !filename) return { ok: false, error: 'not authenticated' };
    try {
      // /api/library POST with metadata for this filename — server's
      // save_library_metadata looks up the video by filename and creates
      // the per-user library row (or updates if already there).
      const res = await fetch(`${API_BASE}/api/library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ filename, metadata: { title: title || filename } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`Couldn't add to library: ${err.error || res.status}`, 'error');
        return { ok: false, error: err.error || `HTTP ${res.status}` };
      }
      await loadAvailableVideos();
      showToast(`Added "${title || filename}" to library`, 'success');
      return { ok: true };
    } catch (err) {
      showToast(`Couldn't add to library: ${err.message}`, 'error');
      return { ok: false, error: err.message };
    }
  };

  const handleAddFromLibrary = (videoData) => {
    const initialDuration =
      videoData.duration && videoData.duration > 0 ? videoData.duration : 0;

    const newInstance = {
      id: `${videoData.filename}-${Date.now()}`,
      name: videoData.title || videoData.filename,
      filename: videoData.filename,
      url: videoData.url,
      sourceUrl: videoData.sourceUrl,
      offset: 0,
      duration: initialDuration,
      volume: 1.0,
      trimStart: videoData.defaultTrimStart || 0,
      trimEnd: videoData.defaultTrimEnd || 0,
      cropX: videoData.defaultCropX || 0,
      cropY: videoData.defaultCropY || 0,
      cropWidth: videoData.defaultCropWidth || 100,
      cropHeight: videoData.defaultCropHeight || 100,
      color: `hsl(${videos.length * 60}, 70%, 50%)`,
    };
    setVideos((prev) => [...prev, newInstance]);

    if (!initialDuration && videoData.url) {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = videoData.url;
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
    }
  };

  const saveShow = React.useCallback(
    async (name, silent = false) => {
      if (!name || !name.trim()) {
        if (!silent) showToast('Please enter a show name', 'warning');
        return;
      }

      const sessionData = {
        totalDuration,
        zoom,
        videos: videos.map((v) => ({
          id: v.id,
          name: v.name,
          filename: v.filename,
          url: null, // reconstructed from API_BASE on load
          offset: v.offset,
          duration: v.duration,
          volume: v.volume,
          trimStart: v.trimStart || 0,
          trimEnd: v.trimEnd || 0,
          cropX: v.cropX || 0,
          cropY: v.cropY || 0,
          cropWidth: v.cropWidth || 100,
          cropHeight: v.cropHeight || 100,
          color: v.color,
        })),
      };

      const session = {
        name: name.trim(),
        timestamp: new Date().toISOString(),
        ...sessionData,
      };
      const sessions = JSON.parse(localStorage.getItem('fwp_sessions') || '[]');
      const existingIndex = sessions.findIndex((s) => s.name === name.trim());
      if (existingIndex >= 0) sessions[existingIndex] = session;
      else sessions.push(session);
      localStorage.setItem('fwp_sessions', JSON.stringify(sessions));
      localStorage.setItem('fwp_lastSession', name.trim());

      if (authenticated) {
        try {
          await fetch(`${API_BASE}/api/shows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: name.trim(), data: sessionData }),
          });
        } catch (err) {
          console.warn('Failed to sync show to server:', err);
        }
      }

      loadSessionsList();
      setCurrentShowName(name.trim());
      if (!silent) showToast(`Show "${name.trim()}" saved!`, 'success');
    },
    [
      totalDuration,
      zoom,
      videos,
      authenticated,
      loadSessionsList,
      showToast,
    ],
  );

  // Auto-save (debounced)
  const prevVideosStateRef = React.useRef(null);
  React.useEffect(() => {
    if (currentView !== 'editor' || !currentShowName || videos.length === 0) {
      prevVideosStateRef.current = null;
      return;
    }
    // Don't auto-save when the current user doesn't own the show. Admin
    // viewing another user's show is read-only at the persistence layer;
    // they can still scrub / preview / fork via Save As.
    const isOwner =
      currentShowOwnerId == null || currentShowOwnerId === currentUser?.id;
    if (!isOwner) return;
    const hasAnyVideosLoaded = videos.some((v) => v.duration && v.duration > 0);
    if (!hasAnyVideosLoaded) return;

    const currentVideosState = JSON.stringify(
      videos
        .map((v) => ({
          id: v.id,
          filename: v.filename,
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
        .sort((a, b) => a.id.localeCompare(b.id)),
    );

    const fullState = JSON.stringify({ videos: currentVideosState, totalDuration, zoom });
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

  // Playback loop
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

  // Per-frame video sync — drives playback of all child videos against masterTime
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
            const videoContainer = videoEl.parentElement;
            if (videoContainer) {
              const computedStyle = window.getComputedStyle(videoContainer);
              if (computedStyle.visibility === 'hidden' || computedStyle.opacity === '0') {
                videoContainer.style.visibility = 'visible';
                videoContainer.style.opacity = '1';
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

  return (
    <div>
      {currentView === 'dashboard' && (
        <Dashboard
          onEditShow={handleEditShow}
          onNewShow={handleNewShow}
          onGoToLibrary={handleGoToLibrary}
          savedSessions={savedSessions}
          onDeleteShow={handleDeleteShow}
          downloadedVideos={downloadedVideos}
          onDownloadComplete={handleDownloadComplete}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      )}
      {currentView === 'library' && (
        <LibraryView
          downloadedVideos={downloadedVideos}
          setDownloadedVideos={setDownloadedVideos}
          onBack={handleBackFromLibrary}
          onDeleteVideo={handleDeleteVideo}
          onSaveVideoSettings={handleSaveVideoSettings}
          onDownloadComplete={handleDownloadComplete}
        />
      )}
      {currentView === 'editor' && (
        <ShowEditor
          showName={currentShowName}
          videos={videos}
          setVideos={setVideos}
          downloadedVideos={downloadedVideos}
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
          onAddToLibrary={handleAddToLibrary}
          onDownloadComplete={handleDownloadComplete}
          showToast={showToast}
          isReadOnly={
            currentShowOwnerId != null && currentShowOwnerId !== currentUser?.id
          }
          ownerLabel={
            currentShowOwnerId != null && currentShowOwnerId !== currentUser?.id
              ? savedSessions.find(
                  (s) => s.user_id === currentShowOwnerId && s.name === currentShowName,
                )?.creator_username || 'another user'
              : null
          }
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
