import React from 'react';
import { API_BASE, extractVideoId } from '../api.js';

// Match what App.jsx uses, but provide a safe fallback if absent.
const noopToast = (msg) => alert(msg);

// True if the show-instance trim/crop values differ from any non-default
// (i.e. anything other than 0/0/100/100 trim and full-frame crop).
const hasNonDefaultTrimCrop = (v) =>
  (v.trimStart || 0) > 0 ||
  (v.trimEnd || 0) > 0 ||
  (v.cropX || 0) !== 0 ||
  (v.cropY || 0) !== 0 ||
  (v.cropWidth ?? 100) !== 100 ||
  (v.cropHeight ?? 100) !== 100;

// True if the show-instance trim/crop differs from the firework's primary-
// video defaults (firework_videos.default_*). The firework rows arrive
// keyed by id from /api/projects/:id/fireworks.
const trimCropDiffersFromFirework = (v, firework) => {
  if (!firework) return false;
  return (
    (v.trimStart || 0) !== (firework.default_trim_start || 0) ||
    (v.trimEnd || 0) !== (firework.default_trim_end || 0) ||
    (v.cropX || 0) !== (firework.default_crop_x || 0) ||
    (v.cropY || 0) !== (firework.default_crop_y || 0) ||
    (v.cropWidth ?? 100) !== (firework.default_crop_width ?? 100) ||
    (v.cropHeight ?? 100) !== (firework.default_crop_height ?? 100)
  );
};

const trimCropAsLibraryDefaults = (v) => ({
  defaultTrimStart: v.trimStart || 0,
  defaultTrimEnd: v.trimEnd || 0,
  defaultCropX: v.cropX || 0,
  defaultCropY: v.cropY || 0,
  defaultCropWidth: v.cropWidth ?? 100,
  defaultCropHeight: v.cropHeight ?? 100,
});

const ShowEditor = ({
  showName,
  videos,
  setVideos,
  fireworks,
  fireworksById,
  isPlaying,
  setIsPlaying,
  masterTime,
  setMasterTime,
  totalDuration,
  setTotalDuration,
  zoom,
  setZoom,
  draggingId,
  setDraggingId,
  dragStartX,
  setDragStartX,
  dragStartOffset,
  setDragStartOffset,
  gridHeight, // currently unused; preserved for parity
  setGridHeight, // currently unused; preserved for parity
  videoRefs,
  timelineRef,
  onSave,
  onBack,
  onAddFromLibrary,
  onSaveSettingsToLibrary,
  onDownloadComplete,
  showToast = noopToast,
  isReadOnly = false,
  ownerLabel = null,
}) => {
  const [saveAsName, setSaveAsName] = React.useState('');
  const [showSaveAs, setShowSaveAs] = React.useState(false);
  const [showLibraryAdd, setShowLibraryAdd] = React.useState(false);

  const [, setLoadedVideoIds] = React.useState(new Set());
  const [bufferedRanges, setBufferedRanges] = React.useState(new Map());
  const [errorVideoIds, setErrorVideoIds] = React.useState(new Set());
  const [videosWithMetadata, setVideosWithMetadata] = React.useState(new Set());
  const [videosReadyToPlay, setVideosReadyToPlay] = React.useState(new Set());

  const canStartPlayback = React.useMemo(() => {
    if (videos.length === 0) return true;
    const videosWithDuration = videos.filter((v) => v.duration && v.duration > 0);
    if (videosWithDuration.length === 0) return false;

    return videosWithDuration.every((v) => {
      if (errorVideoIds.has(v.id)) return true;
      const videoEl = videoRefs.current[v.id];
      if (videoEl) return videoEl.readyState >= 2;
      return videosReadyToPlay.has(v.id);
    });
  }, [videos, errorVideoIds, videosReadyToPlay, videoRefs]);

  React.useEffect(() => {
    videos.forEach((v) => {
      const videoEl = videoRefs.current[v.id];
      if (videoEl && videoEl.readyState >= 2 && !videosReadyToPlay.has(v.id)) {
        setVideosReadyToPlay((prev) => new Set(prev).add(v.id));
      }
    });
  }, [videos, videosReadyToPlay, videoRefs]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const newRanges = new Map();
      videos.forEach((v) => {
        const videoEl = videoRefs.current[v.id];
        if (videoEl && videoEl.buffered && videoEl.buffered.length > 0) {
          const bufferedEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
          const duration = videoEl.duration || v.duration || 0;
          if (duration > 0) {
            newRanges.set(v.id, {
              buffered: bufferedEnd,
              total: duration,
              percentage: (bufferedEnd / duration) * 100,
            });
          }
        }
      });
      if (newRanges.size > 0) {
        setBufferedRanges((prev) => {
          const updated = new Map(prev);
          newRanges.forEach((value, key) => updated.set(key, value));
          return updated;
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [videos, videoRefs]);

  // YouTube download state
  const [showYoutubeDownload, setShowYoutubeDownload] = React.useState(false);
  const [youtubeUrl, setYoutubeUrl] = React.useState('');
  const [downloading, setDownloading] = React.useState([]);
  const [backendStatus, setBackendStatus] = React.useState(null);
  const [youtubeSearchQuery, setYoutubeSearchQuery] = React.useState('');
  const [showYoutubePanel, setShowYoutubePanel] = React.useState(false);

  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice =
        window.innerWidth < 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  React.useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((data) => setBackendStatus(data))
      .catch(() => setBackendStatus({ status: 'offline' }));
  }, []);

  React.useEffect(() => {
    if (downloading.length === 0) return;
    const serverDownloads = downloading.filter((dl) => dl.serverSide === true);
    if (serverDownloads.length === 0) return;

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        serverDownloads.map(async (dl) => {
          try {
            const res = await fetch(`${API_BASE}/api/download/${dl.id}`, {
              credentials: 'include',
            });
            if (!res.ok) return dl;
            return { ...dl, ...(await res.json()) };
          } catch {
            return dl;
          }
        }),
      );

      setDownloading((prev) => {
        const clientDownloads = prev.filter((dl) => !dl.serverSide);
        const updatedServerDownloads = updates.filter((dl) => dl.status === 'downloading');
        return [...clientDownloads, ...updatedServerDownloads];
      });

      updates
        .filter((dl) => dl.status === 'complete' && dl.filename)
        .forEach((dl) => onDownloadComplete(dl));
    }, 1000);

    return () => clearInterval(interval);
  }, [downloading, onDownloadComplete]);

  const handleYoutubeDownload = async () => {
    if (!youtubeUrl.trim()) return;
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      alert('Invalid YouTube URL. Please enter a valid YouTube video URL.');
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
        title: 'Starting download...',
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
        alert(`Download failed: ${data.error}`);
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
        onDownloadComplete({
          id: downloadId,
          videoId,
          filename: data.filename,
          title: data.title,
          status: 'complete',
          localUrl: `${API_BASE}/videos/${data.filename}`,
        });
        setYoutubeUrl('');
      }
    } catch (err) {
      alert(`Download failed: ${err.message}\n\nPlease check your connection and try again.`);
      setDownloading((prev) => prev.filter((dl) => dl.id !== downloadId));
    }
  };

  const persistDurationToStorage = (filename, duration) => {
    if (!filename || !duration || duration <= 0) return;
    try {
      const libraryData = JSON.parse(localStorage.getItem('fwp_library') || '{}');
      libraryData[filename] = { ...(libraryData[filename] || {}), duration };
      localStorage.setItem('fwp_library', JSON.stringify(libraryData));

      const cache = JSON.parse(localStorage.getItem('fwp_video_metadata_cache') || '{}');
      cache[filename] = { duration, cachedAt: Date.now() };
      localStorage.setItem('fwp_video_metadata_cache', JSON.stringify(cache));
    } catch (err) {
      console.warn('Failed to save duration to localStorage:', err);
    }
  };

  const handleVideoLoaded = (id, duration) => {
    setLoadedVideoIds((prev) => new Set(prev).add(id));
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        persistDurationToStorage(v.filename, duration);
        return { ...v, duration };
      }),
    );
  };

  const videosLoadCalled = React.useRef(new Set());

  React.useEffect(() => {
    setLoadedVideoIds(new Set());
    setErrorVideoIds(new Set());
    setVideosWithMetadata(new Set());
    setVideosReadyToPlay(new Set());
    videosLoadCalled.current = new Set();
  }, [videos.length]);

  React.useEffect(() => {
    videos.forEach((video) => {
      const videoEl = videoRefs.current[video.id];
      if (videoEl && videoEl.readyState === 0 && !videosLoadCalled.current.has(video.id)) {
        videosLoadCalled.current.add(video.id);
        videoEl.load();
      }
    });
  }, [videos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const getEventX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

  const handleTimelineMouseDown = (e, videoId) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videos.find((v) => v.id === videoId);
    setDraggingId(videoId);
    setDragStartX(getEventX(e));
    setDragStartOffset(video.offset);
  };

  const handleTimelineMove = React.useCallback(
    (e) => {
      if (!draggingId || !timelineRef.current) return;
      e.preventDefault();
      const timelineWidth = timelineRef.current.offsetWidth;
      const pixelsPerSecond = (timelineWidth * zoom) / totalDuration;
      const deltaX = getEventX(e) - dragStartX;
      const deltaTime = deltaX / pixelsPerSecond;
      const newOffset = Math.max(0, dragStartOffset + deltaTime);
      setVideos((prev) =>
        prev.map((v) => (v.id === draggingId ? { ...v, offset: newOffset } : v)),
      );
    },
    [draggingId, dragStartX, dragStartOffset, zoom, totalDuration, setVideos, timelineRef],
  );

  const handleTimelineUp = React.useCallback(
    (e) => {
      e.preventDefault();
      setDraggingId(null);
    },
    [setDraggingId],
  );

  React.useEffect(() => {
    if (!draggingId) return;
    window.addEventListener('mousemove', handleTimelineMove);
    window.addEventListener('mouseup', handleTimelineUp);
    window.addEventListener('touchmove', handleTimelineMove, { passive: false });
    window.addEventListener('touchend', handleTimelineUp, { passive: false });
    return () => {
      window.removeEventListener('mousemove', handleTimelineMove);
      window.removeEventListener('mouseup', handleTimelineUp);
      window.removeEventListener('touchmove', handleTimelineMove);
      window.removeEventListener('touchend', handleTimelineUp);
    };
  }, [draggingId, handleTimelineMove, handleTimelineUp]);

  const handleTimelineClick = (e) => {
    if (draggingId) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = getEventX(e) - rect.left;
    const clickTime = ((x / rect.width) * totalDuration) / zoom;
    setMasterTime(Math.max(0, Math.min(clickTime, totalDuration)));
  };

  const removeVideo = (id) => {
    const video = videos.find((v) => v.id === id);
    if (video?.url?.startsWith('blob:')) URL.revokeObjectURL(video.url);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const updateOffset = (id, newOffset) => {
    setVideos((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, offset: Math.max(0, parseFloat(newOffset) || 0) } : v,
      ),
    );
  };

  const updateTrimStart = (id, newTrimStart) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const trimEnd = v.trimEnd || 0;
        const trimStart = Math.max(
          0,
          Math.min(parseFloat(newTrimStart) || 0, v.duration - trimEnd - 0.1),
        );
        return { ...v, trimStart };
      }),
    );
  };

  const updateTrimEnd = (id, newTrimEnd) => {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const trimStart = v.trimStart || 0;
        const trimEnd = Math.max(
          0,
          Math.min(parseFloat(newTrimEnd) || 0, v.duration - trimStart - 0.1),
        );
        return { ...v, trimEnd };
      }),
    );
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const handleSave = () => {
    // Read-only (admin viewing another user's show): force Save-As so the
    // admin explicitly forks under a new name instead of stomping the owner.
    if (isReadOnly) {
      setShowSaveAs(true);
      return;
    }
    if (showName) onSave(showName);
    else setShowSaveAs(true);
  };

  const handleSaveAs = () => {
    if (saveAsName.trim()) {
      onSave(saveAsName.trim());
      setSaveAsName('');
      setShowSaveAs(false);
    }
  };

  const [isPortrait, setIsPortrait] = React.useState(false);
  React.useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 768);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  React.useEffect(() => {
    if (videos.length === 0) {
      setTotalDuration(60);
      return;
    }
    const videosWithDuration = videos.filter((v) => v.duration && v.duration > 0);
    if (videosWithDuration.length === 0) {
      setTotalDuration(60);
      return;
    }
    const maxEnd = Math.max(
      ...videosWithDuration.map((v) => {
        const trimStart = v.trimStart || 0;
        const trimEnd = v.trimEnd || 0;
        return (v.offset || 0) + (v.duration - trimStart - trimEnd);
      }),
    );
    if (maxEnd > 0 && isFinite(maxEnd)) {
      setTotalDuration(Math.max(60, maxEnd + 10));
    }
  }, [videos, setTotalDuration]);

  const activeVideos = React.useMemo(() => {
    return videos.filter((video) => {
      try {
        if (!video.duration || video.duration === 0) return false;
        const trimStart = video.trimStart || 0;
        const trimEnd = video.trimEnd || 0;
        const videoTime = masterTime - (video.offset || 0);
        const trimmedDuration = video.duration - trimStart - trimEnd;
        return videoTime >= 0 && videoTime <= trimmedDuration;
      } catch {
        return false;
      }
    });
  }, [videos, masterTime]);

  // Hidden preloader: load full data for each unique video URL/filename.
  const renderHiddenPreloader = () => {
    const unique = new Map();
    videos
      .filter((v) => v.url)
      .forEach((video) => {
        const key = video.filename || video.url;
        if (key && !unique.has(key)) unique.set(key, video);
      });

    return (
      <div
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {Array.from(unique.values()).map((video) => {
          const key = video.filename || video.url;
          return (
            <video
              key={`preload-${key}`}
              src={video.url}
              preload="auto"
              onLoadedMetadata={(e) => {
                try {
                  const duration = e.target.duration;
                  if (!duration || duration <= 0) return;
                  setVideos((prev) =>
                    prev.map((v) => {
                      const vKey = v.filename || v.url;
                      if (vKey === key && (!v.duration || v.duration === 0)) {
                        setLoadedVideoIds((ids) => new Set(ids).add(v.id));
                        setVideosWithMetadata((ids) => new Set(ids).add(v.id));
                        persistDurationToStorage(v.filename, duration);
                        return { ...v, duration };
                      }
                      return v;
                    }),
                  );
                } catch (err) {
                  console.error(`[Preloader] Error loading ${key}:`, err);
                }
              }}
              onCanPlay={() => {
                setVideos((prev) => {
                  prev.forEach((v) => {
                    const vKey = v.filename || v.url;
                    if (vKey === key) {
                      setVideosReadyToPlay((ids) => new Set(ids).add(v.id));
                    }
                  });
                  return prev;
                });
              }}
              onError={() => {
                setVideos((prev) => {
                  prev.forEach((v) => {
                    const vKey = v.filename || v.url;
                    if (vKey === key) {
                      setErrorVideoIds((ids) => new Set(ids).add(v.id));
                    }
                  });
                  return prev;
                });
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderVideoGridCell = (video) => {
    const trimStart = video.trimStart || 0;
    const trimEnd = video.trimEnd || 0;
    const videoTime = masterTime - (video.offset || 0);
    const trimmedDuration = (video.duration || 0) - trimStart - trimEnd;
    const isActive =
      video.duration && video.duration > 0 && videoTime >= 0 && videoTime <= trimmedDuration;
    const shouldShow = videoTime >= 0 && videoTime <= trimmedDuration;
    const firework =
      video.firework_id && fireworksById ? fireworksById.get(video.firework_id) : null;
    const settingsDifferFromLibrary =
      !!firework && trimCropDiffersFromFirework(video, firework);

    const cellStyle = {
      borderColor: isActive ? video.color : '#374151',
      width: '100%',
      visibility: shouldShow ? 'visible' : 'hidden',
      opacity: shouldShow ? 1 : 0,
      pointerEvents: shouldShow ? 'auto' : 'none',
      position: shouldShow ? 'relative' : 'absolute',
      ...(shouldShow ? {} : { left: '-9999px', top: '-9999px', zIndex: -1 }),
    };

    return (
      <div
        key={video.id}
        className="relative bg-black rounded-lg overflow-hidden border-2 transition-colors flex items-center justify-center w-full"
        style={cellStyle}
      >
        {video.url ? (
          <video
            ref={(el) => {
              if (el) videoRefs.current[video.id] = el;
            }}
            src={video.url}
            className="w-full h-auto object-contain"
            style={{
              maxWidth: '100%',
              clipPath: `inset(${video.cropY || 0}% ${100 - (video.cropX || 0) - (video.cropWidth || 100)}% ${100 - (video.cropY || 0) - (video.cropHeight || 100)}% ${video.cropX || 0}%)`,
            }}
            onLoadedMetadata={(e) => {
              try {
                const duration = e.target.duration;
                if (duration && duration > 0) {
                  handleVideoLoaded(video.id, duration);
                  e.target.currentTime = video.trimStart || 0;
                }
              } catch (err) {
                console.error(`[Video Metadata] Error for ${video.id}:`, err);
              }
            }}
            onError={() => setErrorVideoIds((prev) => new Set(prev).add(video.id))}
            onCanPlay={() => setVideosReadyToPlay((prev) => new Set(prev).add(video.id))}
            onLoadedData={() => {
              try {
                const videoEl = videoRefs.current[video.id];
                if (videoEl && videoEl.readyState >= 2) {
                  videoEl.currentTime = video.trimStart || 0;
                }
              } catch (err) {
                console.error(`[Video] onLoadedData error for ${video.id}:`, err);
              }
            }}
            crossOrigin="anonymous"
            preload="auto"
            playsInline
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            {`No video URL (filename: ${video.filename || 'unknown'})`}
          </div>
        )}

        <div
          className="absolute top-2 left-2 px-2 py-1 rounded text-sm font-medium max-w-[60%] truncate"
          style={{ backgroundColor: video.color }}
        >
          {video.name}
        </div>
        <button
          onClick={() => removeVideo(video.id)}
          className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 w-6 h-6 rounded flex items-center justify-center text-sm"
        >
          ×
        </button>

        {/* "Save settings to Firework" chip — when the per-instance trim/crop
            in this show differs from the firework's primary-video defaults,
            offer to push them back so future shows start with these values. */}
        {settingsDifferFromLibrary && onSaveSettingsToLibrary && !isReadOnly && firework && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const ok = window.confirm(
                `Save this show's trim & crop as the default for "${firework.name}"?\n\n` +
                  'Future shows that add this firework will start with these settings.\n' +
                  'Existing shows are not affected.',
              );
              if (!ok) return;
              await onSaveSettingsToLibrary(
                firework.id,
                trimCropAsLibraryDefaults(video),
              );
            }}
            className="absolute top-2 right-10 bg-blue-600/80 hover:bg-blue-500 text-blue-50 px-2 py-1 rounded text-xs font-medium border border-blue-400/50"
            title="Push these trim/crop settings back to the firework's defaults"
          >
            💾 → Default
          </button>
        )}

        <div className="absolute bottom-2 left-2 right-2 bg-black/80 px-2 py-1 rounded space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs">Start:</span>
            <input
              type="number"
              value={video.offset.toFixed(1)}
              onChange={(e) => updateOffset(video.id, e.target.value)}
              className="w-16 md:w-14 bg-gray-800 text-white text-sm md:text-xs px-2 md:px-1 py-2 md:py-0.5 rounded"
              step="0.1"
              min="0"
            />
            <span className="text-xs text-gray-400">s</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs">Trim:</span>
            <input
              type="number"
              value={trimStart.toFixed(1)}
              onChange={(e) => updateTrimStart(video.id, e.target.value)}
              className="w-14 md:w-12 bg-gray-800 text-white text-sm md:text-xs px-2 md:px-1 py-2 md:py-0.5 rounded"
              step="0.1"
              min="0"
            />
            <span className="text-xs text-gray-400">↔</span>
            <input
              type="number"
              value={trimEnd.toFixed(1)}
              onChange={(e) => updateTrimEnd(video.id, e.target.value)}
              className="w-14 md:w-12 bg-gray-800 text-white text-sm md:text-xs px-2 md:px-1 py-2 md:py-0.5 rounded"
              step="0.1"
              min="0"
            />
            <span className="text-xs text-gray-400">s</span>
            <span className="text-xs text-gray-500 ml-auto">{`${(trimmedDuration || 0).toFixed(1)}s`}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderTimelineClip = (video, index) => {
    const trimStart = video.trimStart || 0;
    const trimEnd = video.trimEnd || 0;
    const trimmedDuration =
      video.duration && video.duration > 0
        ? Math.max(0, video.duration - trimStart - trimEnd)
        : 0;

    if (!video.duration || video.duration <= 0) {
      return (
        <div
          key={video.id}
          className="absolute h-10 md:h-8 rounded cursor-move flex items-center px-2 text-xs font-medium overflow-hidden whitespace-nowrap transition-shadow hover:shadow-lg no-select touch-none opacity-50"
          style={{
            top: index * 50 + 10,
            left: `${((video.offset || 0) / totalDuration) * 100 * zoom}%`,
            width: '60px',
            backgroundColor: video.color || '#666',
            minWidth: '60px',
            touchAction: 'none',
          }}
          onMouseDown={(e) => handleTimelineMouseDown(e, video.id)}
          onTouchStart={(e) => handleTimelineMouseDown(e, video.id)}
        >
          {`${video.name} (loading...)`}
        </div>
      );
    }

    const bufferedInfo = bufferedRanges.get(video.id);
    const bufferedPercentage = bufferedInfo ? bufferedInfo.percentage : 0;
    const isBuffering = bufferedPercentage < 100 && bufferedPercentage > 0;
    const videoEl = videoRefs.current[video.id];
    const isReadyToPlay = videoEl ? videoEl.readyState >= 2 : videosReadyToPlay.has(video.id);
    const isLoading = !isReadyToPlay && !errorVideoIds.has(video.id);

    return (
      <div
        key={video.id}
        className="absolute h-10 md:h-8 rounded cursor-move flex flex-col overflow-hidden transition-shadow hover:shadow-lg no-select touch-none"
        style={{
          top: index * 50 + 10,
          left: `${((video.offset || 0) / totalDuration) * 100 * zoom}%`,
          width: `${(trimmedDuration / totalDuration) * 100 * zoom}%`,
          backgroundColor: video.color,
          minWidth: '60px',
          touchAction: 'none',
          opacity: isLoading ? 0.5 : 1,
        }}
        onMouseDown={(e) => handleTimelineMouseDown(e, video.id)}
        onTouchStart={(e) => handleTimelineMouseDown(e, video.id)}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20">
            <div className="text-[10px] text-white">Loading...</div>
          </div>
        )}
        {isBuffering && (
          <div
            className="absolute top-0 left-0 h-1 bg-white/40 transition-all z-10"
            style={{ width: `${bufferedPercentage}%` }}
          />
        )}
        <div
          className="flex items-center px-2 text-xs font-medium whitespace-nowrap h-full relative z-10"
          style={{ color: '#fff', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
        >
          {`${video.name} (${trimmedDuration.toFixed(1)}s)`}
          {isBuffering && (
            <span className="ml-1 text-[10px] opacity-75">
              {`[${Math.round(bufferedPercentage)}%]`}
            </span>
          )}
        </div>
      </div>
    );
  };

  const playButtonText = !canStartPlayback && !isPlaying
    ? '⏳ Loading...'
    : isPlaying
      ? '⏸ Pause'
      : '▶ Play';

  const openYoutubeSearch = () => {
    if (youtubeSearchQuery.trim()) {
      window.open(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeSearchQuery)}`,
        '_blank',
      );
    }
  };

  try {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-2 md:p-4 flex flex-col">
        {isPortrait && (
          <div className="bg-yellow-600 text-yellow-100 px-4 py-3 mb-4 rounded-lg text-sm text-center">
            📱 Tip: Rotate to landscape for the best editing experience!
          </div>
        )}

        {isReadOnly && (
          <div className="bg-yellow-900/40 border border-yellow-500/50 text-yellow-100 px-4 py-3 mb-4 rounded-lg text-sm text-center">
            👀 Viewing {ownerLabel ? `${ownerLabel}'s` : "another user's"} show.
            Changes won't be saved unless you click <strong>Save As</strong> to fork it under
            your account.
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-2">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
            <button
              onClick={onBack}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-3 md:py-2 rounded transition text-base md:text-sm"
            >
              ← Back to Dashboard
            </button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-orange-400">
                {showName ? `Editing: ${showName}` : 'New Show'}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isMobile && (
              <button
                onClick={() => setShowYoutubeDownload(!showYoutubeDownload)}
                className={`px-4 py-3 md:py-2 rounded transition text-base md:text-sm ${
                  showYoutubeDownload
                    ? 'bg-orange-600 border-2 border-orange-400'
                    : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                📥 YouTube
              </button>
            )}
            <button
              onClick={() => setShowLibraryAdd(!showLibraryAdd)}
              className="bg-green-600 hover:bg-green-700 px-4 py-3 md:py-2 rounded transition text-base md:text-sm"
            >
              + Add from Library
            </button>
            {showName && !isReadOnly ? (
              <button
                onClick={handleSave}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded transition font-bold"
              >
                💾 Save
              </button>
            ) : (
              <button
                onClick={() => setShowSaveAs(true)}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded transition font-bold"
              >
                💾 Save As…
              </button>
            )}
          </div>
        </div>

        {/* Save As Dialog */}
        {showSaveAs && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold mb-4">Save Show As</h3>
              <input
                type="text"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                placeholder="Enter show name..."
                className="w-full bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveAs()}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveAs}
                  disabled={!saveAsName.trim()}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-4 py-2 rounded transition"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveAs(false);
                    setSaveAsName('');
                  }}
                  className="flex-1 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* YouTube Download Dialog */}
        {showYoutubeDownload && !isMobile && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-orange-300">📥 Download from YouTube</h3>
                <button
                  onClick={() => setShowYoutubeDownload(false)}
                  className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded"
                >
                  ✕
                </button>
              </div>

              {backendStatus?.status === 'ok' ? (
                <div className="text-xs text-green-400 flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  {`Connected • yt-dlp ${backendStatus.ytdlp_version}`}
                </div>
              ) : (
                <div className="text-xs text-red-400 flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-red-400 rounded-full" />
                  Backend offline - start server.py
                </div>
              )}

              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="Paste YouTube URL..."
                    className="flex-1 bg-gray-700/50 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleYoutubeDownload()}
                  />
                  <button
                    onClick={handleYoutubeDownload}
                    disabled={!youtubeUrl.trim() || backendStatus?.status !== 'ok'}
                    className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition font-bold"
                  >
                    Download
                  </button>
                </div>

                {downloading.length > 0 && (
                  <div className="space-y-2">
                    {downloading.map((dl) => (
                      <div key={dl.id} className="bg-gray-700/50 rounded p-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="truncate">{dl.title || 'Downloading...'}</span>
                          <span>{`${Math.round(dl.progress || 0)}%`}</span>
                        </div>
                        <div className="h-2 bg-gray-600 rounded overflow-hidden">
                          <div
                            className="h-full bg-orange-500 transition-all"
                            style={{ width: `${dl.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-gray-700">
                  <button
                    onClick={() => setShowYoutubePanel(!showYoutubePanel)}
                    className="text-sm text-blue-400 hover:text-blue-300 underline"
                  >
                    {showYoutubePanel ? '↑ Hide YouTube Search' : '🔍 Search YouTube'}
                  </button>
                </div>

                {showYoutubePanel && (
                  <div className="bg-gray-900/50 rounded-lg p-3 border border-blue-500/30">
                    <p className="text-xs text-gray-400 mb-2">Search YouTube in new tab:</p>
                    <input
                      type="text"
                      value={youtubeSearchQuery}
                      onChange={(e) => setYoutubeSearchQuery(e.target.value)}
                      placeholder="e.g., fireworks display..."
                      className="w-full bg-gray-700/50 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-2"
                      onKeyDown={(e) => e.key === 'Enter' && openYoutubeSearch()}
                    />
                    <button
                      onClick={openYoutubeSearch}
                      className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-sm transition"
                    >
                      🔍 Search on YouTube
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add from Library Dialog */}
        {showLibraryAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">📚 Add from Library</h3>
                <button
                  onClick={() => setShowLibraryAdd(false)}
                  className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded"
                >
                  ✕
                </button>
              </div>
              {!fireworks || fireworks.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No fireworks in this project's library yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {fireworks.map((fw) => (
                    <div
                      key={fw.id}
                      className="bg-gray-700 rounded p-3 hover:bg-gray-600 transition cursor-pointer flex items-center gap-3"
                      onClick={() => {
                        onAddFromLibrary(fw);
                        setShowLibraryAdd(false);
                      }}
                    >
                      {fw.primary_url && (
                        <video
                          src={fw.primary_url}
                          className="w-20 h-12 object-cover rounded bg-black flex-shrink-0"
                          muted
                          preload="metadata"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{fw.name}</div>
                        <div className="flex flex-wrap gap-1 text-[10px] text-gray-400 mt-0.5">
                          {fw.manufacturer && <span>{fw.manufacturer}</span>}
                          {fw.shot_count != null && <span>· {fw.shot_count} shots</span>}
                          {fw.grams != null && <span>· {fw.grams}g</span>}
                        </div>
                        {(fw.default_trim_start > 0 || fw.default_trim_end > 0) && (
                          <div className="text-xs text-yellow-400 mt-1">
                            {`Default trim: ${(fw.default_trim_start || 0).toFixed(1)}s – ${(fw.default_trim_end || 0).toFixed(1)}s`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {renderHiddenPreloader()}

        {/* Video Grid */}
        <div className="mb-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-2 gap-2">
            <h2 className="font-semibold text-gray-300 text-sm md:text-base">
              {`Video Grid (${activeVideos.length} playing / ${videos.length} total)`}
            </h2>
          </div>
          <div
            className="gap-2 bg-gray-900 rounded-lg p-2 flex items-center justify-center"
            style={{
              minHeight: '200px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              alignContent: 'start',
              alignItems: 'center',
              justifyItems: 'center',
              gap: '0.5rem',
            }}
          >
            {videos.length === 0 ? (
              <div className="col-span-full flex items-center justify-center border-2 border-dashed border-gray-600 rounded-lg">
                <div className="text-center text-gray-400">
                  <p className="text-lg mb-2">No videos loaded</p>
                  <p className="text-sm">
                    Use &quot;Add from Library&quot; to add videos to your timeline
                  </p>
                </div>
              </div>
            ) : (
              videos.map(renderVideoGridCell)
            )}
          </div>
        </div>

        {/* Transport Controls */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={() => setMasterTime(0)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-3 md:py-2 rounded text-base md:text-sm"
            >
              ⏮ Reset
            </button>
            <button
              onClick={() => setMasterTime((prev) => Math.max(0, prev - 1))}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-3 md:py-2 rounded text-base md:text-sm"
            >
              -1s
            </button>
            <button
              onClick={() => {
                if (!canStartPlayback && !isPlaying) {
                  showToast('Videos are still loading. Please wait...', 'warning');
                  return;
                }
                setIsPlaying(!isPlaying);
              }}
              disabled={!canStartPlayback && !isPlaying}
              className={`px-6 py-3 md:py-2 rounded font-bold text-base md:text-sm ${
                !canStartPlayback && !isPlaying
                  ? 'bg-gray-600 cursor-not-allowed opacity-50'
                  : isPlaying
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {playButtonText}
            </button>
            <button
              onClick={() => setMasterTime((prev) => Math.min(totalDuration, prev + 1))}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-3 md:py-2 rounded text-base md:text-sm"
            >
              +1s
            </button>
            <div className="text-xl font-mono ml-4">
              {`${formatTime(masterTime)} / ${formatTime(totalDuration)}`}
            </div>
          </div>
          <input
            type="range"
            min="0"
            max={totalDuration}
            step="0.1"
            value={masterTime}
            onChange={(e) => setMasterTime(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
        </div>

        {/* Timeline */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Timeline</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Duration:</span>
                <input
                  type="number"
                  value={totalDuration}
                  onChange={(e) =>
                    setTotalDuration(Math.max(10, parseFloat(e.target.value) || 60))
                  }
                  className="w-16 bg-gray-700 text-white text-sm px-2 py-1 rounded"
                  min="10"
                />
                <span className="text-sm">sec</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 whitespace-nowrap">Zoom:</span>
                <input
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-24 md:w-32"
                />
                <span className="text-sm text-gray-300 whitespace-nowrap w-10">
                  {`${zoom.toFixed(1)}x`}
                </span>
              </div>
            </div>
          </div>

          <div className="relative h-6 mb-1 overflow-hidden">
            {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }, (_, i) => (
              <div
                key={i}
                className="absolute text-xs text-gray-500"
                style={{ left: `${((i * 5) / totalDuration) * 100 * zoom}%` }}
              >
                {`${i * 5}s`}
              </div>
            ))}
          </div>

          <div
            ref={timelineRef}
            className="relative bg-gray-900 rounded overflow-x-auto cursor-pointer touch-pan-x"
            style={{ minHeight: Math.max(100, videos.length * 50 + 20) }}
            onClick={handleTimelineClick}
            onTouchStart={(e) => {
              if (!draggingId) handleTimelineClick(e);
            }}
          >
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
              style={{ left: `${(masterTime / totalDuration) * 100 * zoom}%` }}
            >
              <div className="absolute -top-1 -left-2 w-0 h-0 border-l-4 border-r-4 border-t-8 border-transparent border-t-red-500" />
            </div>
            {videos.map(renderTimelineClip)}
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Drag clips to adjust timing • Click timeline to seek
          </p>
        </div>

        {/* Cue Sheet */}
        {videos.length > 0 && (
          <div className="mt-4 bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Show Timing Cue Sheet</h3>
            <div className="grid gap-1 text-sm font-mono">
              {[...videos]
                .sort((a, b) => a.offset - b.offset)
                .map((video) => {
                  const trimStart = video.trimStart || 0;
                  const trimEnd = video.trimEnd || 0;
                  const trimmedDuration = (video.duration || 0) - trimStart - trimEnd;
                  return (
                    <div key={video.id} className="flex gap-2">
                      <span style={{ color: video.color }}>●</span>
                      <span className="text-gray-400 w-16">{formatTime(video.offset)}</span>
                      <span>{video.name}</span>
                      <span className="text-gray-500">
                        {`(${(trimmedDuration || 0).toFixed(1)}s)`}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    console.error('Error rendering ShowEditor:', err);
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <h1 className="text-red-500 text-xl mb-4">Error in Show Editor</h1>
        <pre className="bg-gray-800 p-4 rounded overflow-auto">
          {err.message + '\n' + err.stack}
        </pre>
      </div>
    );
  }
};

export default ShowEditor;
