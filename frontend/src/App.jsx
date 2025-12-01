import React, { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:5000';

const FireworksPlanner = () => {
  const [videos, setVideos] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterTime, setMasterTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(60);
  const [zoom, setZoom] = useState(1);
  const [draggingId, setDraggingId] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  
  // YouTube download state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [downloading, setDownloading] = useState([]);
  const [backendStatus, setBackendStatus] = useState(null);
  const [showDownloader, setShowDownloader] = useState(false);
  
  const videoRefs = useRef({});
  const timelineRef = useRef(null);
  const animationRef = useRef(null);
  const lastTimeRef = useRef(Date.now());

  // Check backend health on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(res => res.json())
      .then(data => setBackendStatus(data))
      .catch(() => setBackendStatus({ status: 'offline' }));
    
    // Load existing videos
    loadVideosFromServer();
  }, []);

  const loadVideosFromServer = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/videos`);
      const serverVideos = await res.json();
      // Don't replace, just make available - user can add from library
    } catch (err) {
      console.error('Failed to load videos:', err);
    }
  };

  // Poll download progress
  useEffect(() => {
    if (downloading.length === 0) return;
    
    const interval = setInterval(async () => {
      const updates = await Promise.all(
        downloading.map(async (dl) => {
          try {
            const res = await fetch(`${API_BASE}/api/download/${dl.id}`);
            const status = await res.json();
            return { ...dl, ...status };
          } catch {
            return dl;
          }
        })
      );
      
      setDownloading(updates.filter(dl => dl.status === 'downloading'));
      
      // Add completed downloads to videos
      updates
        .filter(dl => dl.status === 'complete' && dl.filename)
        .forEach(dl => {
          if (!videos.find(v => v.filename === dl.filename)) {
            addVideoToTimeline({
              id: dl.id,
              name: dl.title || dl.filename,
              filename: dl.filename,
              url: `${API_BASE}/videos/${dl.filename}`,
            });
          }
        });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [downloading, videos]);

  const addVideoToTimeline = (videoData) => {
    const newVideo = {
      id: videoData.id || Date.now().toString(),
      name: videoData.name,
      filename: videoData.filename,
      url: videoData.url,
      offset: 0,
      duration: 0,
      volume: 0.5,
      color: `hsl(${videos.length * 60}, 70%, 50%)`
    };
    setVideos(prev => [...prev, newVideo]);
  };

  const handleYoutubeDownload = async () => {
    if (!youtubeUrl.trim()) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl })
      });
      
      const data = await res.json();
      
      if (data.error) {
        alert(data.error);
        return;
      }
      
      setDownloading(prev => [...prev, { 
        id: data.id, 
        url: youtubeUrl, 
        status: 'downloading',
        progress: 0 
      }]);
      setYoutubeUrl('');
    } catch (err) {
      alert('Failed to start download. Is the backend running?');
    }
  };

  // File input handler for local files
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const newVideos = files.map((file, index) => ({
      id: Date.now() + index,
      name: file.name.replace(/\.[^/.]+$/, ''),
      url: URL.createObjectURL(file),
      offset: 0,
      duration: 0,
      volume: 0.5,
      color: `hsl(${(videos.length + index) * 60}, 70%, 50%)`
    }));
    setVideos(prev => [...prev, ...newVideos]);
  };

  // Update video duration once loaded
  const handleVideoLoaded = (id, duration) => {
    setVideos(prev => {
      const updated = prev.map(v => 
        v.id === id ? { ...v, duration } : v
      );
      const maxEnd = Math.max(...updated.map(v => v.offset + v.duration));
      if (maxEnd > totalDuration) {
        setTotalDuration(maxEnd + 10);
      }
      return updated;
    });
  };

  // Master playback loop
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = Date.now();
      
      const tick = () => {
        const now = Date.now();
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        
        setMasterTime(prev => {
          const next = prev + delta;
          if (next >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
        
        animationRef.current = requestAnimationFrame(tick);
      };
      
      animationRef.current = requestAnimationFrame(tick);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, totalDuration]);

  // Sync individual videos to master time
  useEffect(() => {
    videos.forEach(video => {
      const videoEl = videoRefs.current[video.id];
      if (!videoEl) return;
      
      const videoTime = masterTime - video.offset;
      
      if (videoTime >= 0 && videoTime <= video.duration) {
        if (Math.abs(videoEl.currentTime - videoTime) > 0.3) {
          videoEl.currentTime = videoTime;
        }
        if (isPlaying && videoEl.paused) {
          videoEl.play().catch(() => {});
        } else if (!isPlaying && !videoEl.paused) {
          videoEl.pause();
        }
      } else {
        if (!videoEl.paused) {
          videoEl.pause();
        }
        if (videoTime < 0) {
          videoEl.currentTime = 0;
        }
      }
    });
  }, [masterTime, videos, isPlaying]);

  // Timeline drag handlers
  const handleTimelineMouseDown = (e, videoId) => {
    e.stopPropagation();
    const video = videos.find(v => v.id === videoId);
    setDraggingId(videoId);
    setDragStartX(e.clientX);
    setDragStartOffset(video.offset);
  };

  const handleTimelineMouseMove = useCallback((e) => {
    if (!draggingId || !timelineRef.current) return;
    
    const timelineWidth = timelineRef.current.offsetWidth;
    const pixelsPerSecond = (timelineWidth * zoom) / totalDuration;
    const deltaX = e.clientX - dragStartX;
    const deltaTime = deltaX / pixelsPerSecond;
    const newOffset = Math.max(0, dragStartOffset + deltaTime);
    
    setVideos(prev => prev.map(v => 
      v.id === draggingId ? { ...v, offset: newOffset } : v
    ));
  }, [draggingId, dragStartX, dragStartOffset, zoom, totalDuration]);

  const handleTimelineMouseUp = useCallback(() => {
    setDraggingId(null);
  }, []);

  useEffect(() => {
    if (draggingId) {
      window.addEventListener('mousemove', handleTimelineMouseMove);
      window.addEventListener('mouseup', handleTimelineMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleTimelineMouseMove);
        window.removeEventListener('mouseup', handleTimelineMouseUp);
      };
    }
  }, [draggingId, handleTimelineMouseMove, handleTimelineMouseUp]);

  const handleTimelineClick = (e) => {
    if (draggingId) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timelineWidth = rect.width;
    const clickTime = (x / timelineWidth) * totalDuration / zoom;
    setMasterTime(Math.max(0, Math.min(clickTime, totalDuration)));
  };

  const removeVideo = (id) => {
    const video = videos.find(v => v.id === id);
    if (video && video.url.startsWith('blob:')) {
      URL.revokeObjectURL(video.url);
    }
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  const updateOffset = (id, newOffset) => {
    setVideos(prev => prev.map(v => 
      v.id === id ? { ...v, offset: Math.max(0, parseFloat(newOffset) || 0) } : v
    ));
  };

  const getGridClass = () => {
    const count = videos.length;
    if (count <= 1) return 'grid-cols-1';
    if (count <= 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    return 'grid-cols-3';
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-orange-400">🎆 Fireworks Show Planner</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDownloader(!showDownloader)}
            className={`px-4 py-2 rounded transition ${
              showDownloader ? 'bg-orange-600' : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {showDownloader ? '✕ Close' : '📥 YouTube'}
          </button>
          <label className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded cursor-pointer transition">
            + Local Files
            <input
              type="file"
              accept="video/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* YouTube Downloader Panel */}
      {showDownloader && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-semibold">Download from YouTube</h3>
            {backendStatus?.status === 'ok' ? (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                Backend connected (yt-dlp {backendStatus.ytdlp_version})
              </span>
            ) : (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                Backend offline - start server.py first
              </span>
            )}
          </div>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              className="flex-1 bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
              onKeyDown={(e) => e.key === 'Enter' && handleYoutubeDownload()}
            />
            <button
              onClick={handleYoutubeDownload}
              disabled={!youtubeUrl.trim() || backendStatus?.status !== 'ok'}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded transition"
            >
              Download
            </button>
          </div>

          {/* Active downloads */}
          {downloading.length > 0 && (
            <div className="mt-3 space-y-2">
              {downloading.map(dl => (
                <div key={dl.id} className="bg-gray-700 rounded p-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="truncate">{dl.title || 'Downloading...'}</span>
                    <span>{Math.round(dl.progress || 0)}%</span>
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
        </div>
      )}

      {/* Video Grid */}
      <div className={`grid ${getGridClass()} gap-2 flex-1 min-h-0 mb-4`} style={{ minHeight: '300px' }}>
        {videos.length === 0 ? (
          <div className="col-span-full flex items-center justify-center border-2 border-dashed border-gray-600 rounded-lg">
            <div className="text-center text-gray-400">
              <p className="text-lg mb-2">No videos loaded</p>
              <p className="text-sm">Use "YouTube" to download clips or "Local Files" to load from disk</p>
            </div>
          </div>
        ) : (
          videos.map(video => {
            const videoTime = masterTime - video.offset;
            const isActive = videoTime >= 0 && videoTime <= video.duration;
            
            return (
              <div
                key={video.id}
                className={`relative bg-black rounded-lg overflow-hidden border-2 transition-colors`}
                style={{ borderColor: isActive ? video.color : '#374151' }}
              >
                <video
                  ref={el => videoRefs.current[video.id] = el}
                  src={video.url}
                  className="w-full h-full object-contain"
                  onLoadedMetadata={(e) => handleVideoLoaded(video.id, e.target.duration)}
                  crossOrigin="anonymous"
                />
                
                <div 
                  className="absolute top-2 left-2 px-2 py-1 rounded text-sm font-medium max-w-[70%] truncate"
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
                
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-black/70 px-2 py-1 rounded">
                  <span className="text-xs">Start:</span>
                  <input
                    type="number"
                    value={video.offset.toFixed(1)}
                    onChange={(e) => updateOffset(video.id, e.target.value)}
                    className="w-16 bg-gray-800 text-white text-xs px-1 py-0.5 rounded"
                    step="0.1"
                    min="0"
                  />
                  <span className="text-xs text-gray-400">sec</span>
                  
                  {!isActive && videoTime < 0 && (
                    <span className="text-xs text-yellow-400 ml-auto">
                      Starts in {(-videoTime).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Transport Controls */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            onClick={() => setMasterTime(0)}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded"
          >
            ⏮ Reset
          </button>
          <button
            onClick={() => setMasterTime(prev => Math.max(0, prev - 1))}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded"
          >
            -1s
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-6 py-2 rounded font-bold ${
              isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            onClick={() => setMasterTime(prev => Math.min(totalDuration, prev + 1))}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded"
          >
            +1s
          </button>
          <div className="text-xl font-mono ml-4">
            {formatTime(masterTime)} / {formatTime(totalDuration)}
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
                onChange={(e) => setTotalDuration(Math.max(10, parseFloat(e.target.value) || 60))}
                className="w-16 bg-gray-700 text-white text-sm px-2 py-1 rounded"
                min="10"
              />
              <span className="text-sm">sec</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Zoom:</span>
              <input
                type="range"
                min="0.5"
                max="4"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-24"
              />
              <span className="text-sm">{zoom.toFixed(1)}x</span>
            </div>
          </div>
        </div>

        {/* Time markers */}
        <div className="relative h-6 mb-1 overflow-hidden">
          {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }, (_, i) => (
            <div
              key={i}
              className="absolute text-xs text-gray-500"
              style={{ left: `${(i * 5 / totalDuration) * 100 * zoom}%` }}
            >
              {i * 5}s
            </div>
          ))}
        </div>

        {/* Timeline tracks */}
        <div
          ref={timelineRef}
          className="relative bg-gray-900 rounded overflow-x-auto cursor-pointer"
          style={{ minHeight: Math.max(100, videos.length * 40 + 20) }}
          onClick={handleTimelineClick}
        >
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ left: `${(masterTime / totalDuration) * 100 * zoom}%` }}
          >
            <div className="absolute -top-1 -left-2 w-0 h-0 border-l-4 border-r-4 border-t-8 border-transparent border-t-red-500" />
          </div>

          {/* Video clips */}
          {videos.map((video, index) => (
            <div
              key={video.id}
              className="absolute h-8 rounded cursor-move flex items-center px-2 text-xs font-medium overflow-hidden whitespace-nowrap transition-shadow hover:shadow-lg"
              style={{
                top: index * 40 + 10,
                left: `${(video.offset / totalDuration) * 100 * zoom}%`,
                width: `${(video.duration / totalDuration) * 100 * zoom}%`,
                backgroundColor: video.color,
                minWidth: '60px'
              }}
              onMouseDown={(e) => handleTimelineMouseDown(e, video.id)}
            >
              {video.name} ({video.duration.toFixed(1)}s)
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 mt-2">
          Drag clips to adjust timing • Click timeline to seek • Scroll to view full timeline
        </p>
      </div>

      {/* Show Timing Summary */}
      {videos.length > 0 && (
        <div className="mt-4 bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Show Timing Cue Sheet</h3>
          <div className="grid gap-1 text-sm font-mono">
            {videos
              .sort((a, b) => a.offset - b.offset)
              .map(video => (
                <div key={video.id} className="flex gap-2">
                  <span style={{ color: video.color }}>●</span>
                  <span className="text-gray-400 w-16">{formatTime(video.offset)}</span>
                  <span>{video.name}</span>
                  <span className="text-gray-500">({video.duration.toFixed(1)}s)</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FireworksPlanner;
