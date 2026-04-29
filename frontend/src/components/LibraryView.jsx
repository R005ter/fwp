import React from 'react';
import { API_BASE, extractVideoId } from '../api.js';

const cropPresetClass =
  'bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded text-xs transition';
const inputClass =
  'w-full bg-gray-700 text-white px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';

const LibraryView = ({
  downloadedVideos,
  setDownloadedVideos,
  onBack,
  onEditVideo, // currently unused — preserved for parity with original prop signature
  onDeleteVideo,
  onSaveVideoSettings,
  onDownloadComplete,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [editingVideo, setEditingVideo] = React.useState(null);
  const [previewVideoRef, setPreviewVideoRef] = React.useState(null);
  const [previewTime, setPreviewTime] = React.useState(0);
  const [previewPlaying, setPreviewPlaying] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');
  const [editTrimStart, setEditTrimStart] = React.useState(0);
  const [editTrimEnd, setEditTrimEnd] = React.useState(0);

  const [editCropX, setEditCropX] = React.useState(0);
  const [editCropY, setEditCropY] = React.useState(0);
  const [editCropWidth, setEditCropWidth] = React.useState(100);
  const [editCropHeight, setEditCropHeight] = React.useState(100);

  const [youtubeUrl, setYoutubeUrl] = React.useState('');
  const [downloading, setDownloading] = React.useState([]);
  const [, setBackendStatus] = React.useState(null);
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
            const status = await res.json();
            return { ...dl, ...status };
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

  const filteredVideos = Array.from(downloadedVideos.values()).filter(
    (v) =>
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleEditVideo = (video) => {
    setEditingVideo(video);
    setEditTitle(video.title);
    setEditTrimStart(video.defaultTrimStart || 0);
    setEditTrimEnd(video.defaultTrimEnd || 0);
    setEditCropX(video.defaultCropX || 0);
    setEditCropY(video.defaultCropY || 0);
    setEditCropWidth(video.defaultCropWidth || 100);
    setEditCropHeight(video.defaultCropHeight || 100);
    setPreviewTime(video.defaultTrimStart || 0);
    setPreviewPlaying(false);
  };

  const handleSaveVideo = () => {
    if (!editingVideo) return;
    onSaveVideoSettings(editingVideo.filename, {
      title: editTitle,
      defaultTrimStart: editTrimStart,
      defaultTrimEnd: editTrimEnd,
      defaultCropX: editCropX,
      defaultCropY: editCropY,
      defaultCropWidth: editCropWidth,
      defaultCropHeight: editCropHeight,
    });
    if (previewVideoRef) previewVideoRef.pause();
    setEditingVideo(null);
  };

  const handleCancelEdit = () => {
    if (previewVideoRef) previewVideoRef.pause();
    setEditingVideo(null);
  };

  const openYoutubeSearch = () => {
    if (youtubeSearchQuery.trim()) {
      window.open(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeSearchQuery)}`,
        '_blank',
      );
    }
  };

  // ---------- Sub-render: video list ----------
  const renderVideoList = () => (
    <div>
      {!isMobile && (
        <div className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-orange-500/30 mb-6">
          <h2 className="text-xl font-bold text-orange-300 mb-4">📥 Add Videos to Library</h2>
          <div className="text-xs text-blue-400 flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-blue-400 rounded-full" />
            Server-side download via yt-dlp
          </div>

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
                disabled={!youtubeUrl.trim()}
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
      )}

      <div className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-green-500/30 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search videos..."
          className="w-full bg-gray-700/50 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {downloadedVideos.size === 0 ? (
        <div className="text-center py-20 bg-gray-800/50 backdrop-blur rounded-lg border border-green-500/30">
          <div className="text-6xl mb-4">📹</div>
          <p className="text-xl text-gray-400 mb-2">No videos in library</p>
          <p className="text-sm text-gray-500">Download videos from YouTube to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video) => {
            const trimmedDuration =
              (video.duration || 0) - (video.defaultTrimStart || 0) - (video.defaultTrimEnd || 0);
            const hasTrim = video.defaultTrimStart > 0 || video.defaultTrimEnd > 0;
            return (
              <div
                key={video.filename}
                className="bg-gray-800/50 backdrop-blur rounded-lg p-4 border border-green-500/30 hover:border-green-400 transition"
              >
                <div className="mb-3">
                  <div className="font-bold text-lg mb-2 text-white truncate">{video.title}</div>
                  <div className="text-xs text-gray-400 mb-2 truncate">{video.filename}</div>

                  {video.duration && (
                    <div className="text-sm text-blue-400 mb-2 flex items-center gap-1">
                      <span>⏱️</span>
                      <span>{`${trimmedDuration.toFixed(1)}s`}</span>
                      {hasTrim && (
                        <span className="text-gray-500 text-xs">{`(${video.duration?.toFixed(1)}s full)`}</span>
                      )}
                    </div>
                  )}

                  {hasTrim && (
                    <div className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                      <span>✂️</span>
                      <span>{`Trim: ${video.defaultTrimStart.toFixed(1)}s - ${video.defaultTrimEnd.toFixed(1)}s`}</span>
                    </div>
                  )}

                  {/* Hidden video element to load metadata duration */}
                  {!video.duration && (
                    <video
                      src={video.url}
                      style={{ display: 'none' }}
                      onLoadedMetadata={(e) => {
                        const duration = e.target.duration;
                        setDownloadedVideos((prev) => {
                          const newMap = new Map(prev);
                          const existing = newMap.get(video.filename);
                          if (existing) {
                            newMap.set(video.filename, { ...existing, duration });
                            const libraryData = JSON.parse(
                              localStorage.getItem('fwp_library') || '{}',
                            );
                            libraryData[video.filename] = {
                              ...libraryData[video.filename],
                              duration,
                            };
                            localStorage.setItem('fwp_library', JSON.stringify(libraryData));
                          }
                          return newMap;
                        });
                      }}
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditVideo(video)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm transition"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${video.title}" from library?\n\nThis will remove it from the server and all shows.`,
                        )
                      ) {
                        onDeleteVideo(video);
                      }
                    }}
                    className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm transition"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ---------- Sub-render: editor ----------
  const renderEditor = () => {
    if (!editingVideo) return null;
    const duration = previewVideoRef?.duration || 0;
    return (
      <div className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-blue-500/30">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-blue-400 mb-2">Editing Video Settings</h2>
          <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 text-sm">
            <div className="font-bold text-yellow-400 mb-2 flex items-center gap-2">
              <span>⚠️</span>
              <span>Important: Default Settings</span>
            </div>
            <p className="text-yellow-200 mb-2">
              These are DEFAULT settings for new uses of this video.
            </p>
            <p className="text-yellow-300">
              Videos already added to shows will keep their existing settings and timing. This
              prevents accidental timing changes in your saved shows.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Preview */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-300">Preview</h3>
            <div className="relative bg-black rounded-lg mb-3 overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video
                ref={(el) => setPreviewVideoRef(el)}
                src={editingVideo.url}
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  clipPath: `inset(${editCropY}% ${100 - editCropX - editCropWidth}% ${100 - editCropY - editCropHeight}% ${editCropX}%)`,
                }}
                onTimeUpdate={(e) => setPreviewTime(e.target.currentTime)}
                onLoadedMetadata={(e) => {
                  e.target.currentTime = editTrimStart;
                }}
              />
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => {
                  if (!previewVideoRef) return;
                  if (previewPlaying) {
                    previewVideoRef.pause();
                    setPreviewPlaying(false);
                  } else {
                    previewVideoRef.play();
                    setPreviewPlaying(true);
                  }
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded transition"
              >
                {previewPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                onClick={() => {
                  if (previewVideoRef) previewVideoRef.currentTime = editTrimStart;
                }}
                className="bg-gray-600 hover:bg-gray-500 py-2 px-4 rounded transition"
              >
                ↻ Go to Start
              </button>
            </div>

            {previewVideoRef && (
              <div className="mb-3">
                <input
                  type="range"
                  min="0"
                  max={duration}
                  step="0.1"
                  value={previewTime}
                  onChange={(e) => {
                    const newTime = parseFloat(e.target.value);
                    setPreviewTime(newTime);
                    previewVideoRef.currentTime = newTime;
                  }}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0:00</span>
                  <span>
                    {duration
                      ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60)
                          .toString()
                          .padStart(2, '0')}`
                      : '0:00'}
                  </span>
                </div>
              </div>
            )}

            <div className="text-center text-sm text-gray-400">
              {`Current Time: ${previewTime.toFixed(2)}s`}
              {previewVideoRef && ` / ${duration.toFixed(2)}s`}
            </div>
          </div>

          {/* Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-300">Default Settings</h3>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Video Title:</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">
                Default Trim Start (seconds):
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={editTrimStart}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setEditTrimStart(val);
                    if (previewVideoRef) previewVideoRef.currentTime = val;
                  }}
                  step="0.1"
                  min="0"
                  className="flex-1 bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => setEditTrimStart(parseFloat(previewTime.toFixed(2)))}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded transition text-sm whitespace-nowrap"
                >
                  ↓ Use Current Time
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Trim this many seconds from the beginning
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                Default Trim End (seconds):
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={editTrimEnd}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setEditTrimEnd(val);
                    if (previewVideoRef) {
                      previewVideoRef.currentTime = previewVideoRef.duration - val;
                    }
                  }}
                  step="0.1"
                  min="0"
                  className="flex-1 bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => {
                    if (!previewVideoRef) return;
                    const trimEnd = previewVideoRef.duration - previewTime;
                    setEditTrimEnd(parseFloat(Math.max(0, trimEnd).toFixed(2)));
                  }}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded transition text-sm whitespace-nowrap"
                >
                  ↓ Use Current Time
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Trim this many seconds from the end</p>
            </div>

            <div className="mb-6 pt-6 border-t border-gray-700">
              <h4 className="text-md font-semibold mb-3 text-gray-300">
                ✂️ Crop/Region Selection
              </h4>
              <p className="text-xs text-gray-400 mb-3">
                Perfect for split-screen or quad-view videos! Select just the cake you want.
              </p>

              <div className="mb-3">
                <label className="block text-sm text-gray-400 mb-2">Quick Presets:</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button
                    onClick={() => {
                      setEditCropX(0);
                      setEditCropY(0);
                      setEditCropWidth(50);
                      setEditCropHeight(50);
                    }}
                    className={cropPresetClass}
                  >
                    ↖ Top Left
                  </button>
                  <button
                    onClick={() => {
                      setEditCropX(50);
                      setEditCropY(0);
                      setEditCropWidth(50);
                      setEditCropHeight(50);
                    }}
                    className={cropPresetClass}
                  >
                    ↗ Top Right
                  </button>
                  <button
                    onClick={() => {
                      setEditCropX(0);
                      setEditCropY(0);
                      setEditCropWidth(100);
                      setEditCropHeight(50);
                    }}
                    className={cropPresetClass}
                  >
                    ⬆ Top Half
                  </button>
                  <button
                    onClick={() => {
                      setEditCropX(0);
                      setEditCropY(50);
                      setEditCropWidth(50);
                      setEditCropHeight(50);
                    }}
                    className={cropPresetClass}
                  >
                    ↙ Bottom Left
                  </button>
                  <button
                    onClick={() => {
                      setEditCropX(50);
                      setEditCropY(50);
                      setEditCropWidth(50);
                      setEditCropHeight(50);
                    }}
                    className={cropPresetClass}
                  >
                    ↘ Bottom Right
                  </button>
                  <button
                    onClick={() => {
                      setEditCropX(0);
                      setEditCropY(50);
                      setEditCropWidth(100);
                      setEditCropHeight(50);
                    }}
                    className={cropPresetClass}
                  >
                    ⬇ Bottom Half
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setEditCropX(0);
                      setEditCropY(0);
                      setEditCropWidth(50);
                      setEditCropHeight(100);
                    }}
                    className={cropPresetClass}
                  >
                    ← Left Half
                  </button>
                  <button
                    onClick={() => {
                      setEditCropX(50);
                      setEditCropY(0);
                      setEditCropWidth(50);
                      setEditCropHeight(100);
                    }}
                    className={cropPresetClass}
                  >
                    Right Half →
                  </button>
                  <button
                    onClick={() => {
                      setEditCropX(0);
                      setEditCropY(0);
                      setEditCropWidth(100);
                      setEditCropHeight(100);
                    }}
                    className="bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded text-xs transition"
                  >
                    ⊡ Full Frame
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm text-gray-400 mb-2">
                  Fine-tune (% of frame):
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">X Position:</label>
                    <input
                      type="number"
                      value={editCropX}
                      onChange={(e) =>
                        setEditCropX(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))
                      }
                      step="1"
                      min="0"
                      max="100"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Y Position:</label>
                    <input
                      type="number"
                      value={editCropY}
                      onChange={(e) =>
                        setEditCropY(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))
                      }
                      step="1"
                      min="0"
                      max="100"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Width:</label>
                    <input
                      type="number"
                      value={editCropWidth}
                      onChange={(e) =>
                        setEditCropWidth(
                          Math.max(1, Math.min(100, parseFloat(e.target.value) || 100)),
                        )
                      }
                      step="1"
                      min="1"
                      max="100"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Height:</label>
                    <input
                      type="number"
                      value={editCropHeight}
                      onChange={(e) =>
                        setEditCropHeight(
                          Math.max(1, Math.min(100, parseFloat(e.target.value) || 100)),
                        )
                      }
                      step="1"
                      min="1"
                      max="100"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-400 bg-gray-900/50 rounded p-3 mb-6">
              {previewVideoRef && (
                <div>
                  <div>{`Total Duration: ${duration.toFixed(2)}s`}</div>
                  <div className="text-green-400 font-bold">
                    {`Trimmed Duration: ${(duration - editTrimStart - editTrimEnd).toFixed(2)}s`}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveVideo}
                className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-3 rounded-lg transition font-bold"
              >
                ✓ Save Changes
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex-1 bg-gray-600 hover:bg-gray-500 px-4 py-3 rounded-lg transition font-bold"
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition"
              >
                ← Back
              </button>
              <div>
                <h1 className="text-4xl font-bold text-green-400 mb-2">📚 Video Library</h1>
                <p className="text-gray-300">Manage your fireworks video collection</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-400">{downloadedVideos.size}</div>
            <div className="text-sm text-gray-400">Total Videos</div>
          </div>
        </div>

        {!editingVideo ? renderVideoList() : renderEditor()}
      </div>
    </div>
  );
};

export default LibraryView;
