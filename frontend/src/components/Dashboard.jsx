import React from 'react';
import { API_BASE, extractVideoId } from '../api.js';
import AdminDesktopDownload from './AdminDesktopDownload.jsx';

const Dashboard = ({
  onEditShow,
  onNewShow,
  onGoToLibrary,
  savedSessions,
  onDeleteShow,
  downloadedVideos,
  onDownloadComplete,
  currentUser,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [youtubeSearchQuery, setYoutubeSearchQuery] = React.useState('');
  const [showYoutubePanel, setShowYoutubePanel] = React.useState(false);
  const [youtubeUrl, setYoutubeUrl] = React.useState('');
  const [downloading, setDownloading] = React.useState([]);
  const [backendStatus, setBackendStatus] = React.useState(null);

  React.useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((data) => setBackendStatus(data))
      .catch(() => setBackendStatus({ status: 'offline' }));
  }, []);

  React.useEffect(() => {
    if (downloading.length === 0) return;

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        downloading.map(async (dl) => {
          try {
            const res = await fetch(`${API_BASE}/api/download/${dl.id}`, {
              credentials: 'include',
            });
            const status = await res.json();
            return { ...dl, ...status };
          } catch {
            return dl;
          }
        }),
      );

      setDownloading(updates.filter((dl) => dl.status === 'downloading'));

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

      // Adopt the server's download id so polling matches.
      if (data.id && data.id !== downloadId) {
        setDownloading((prev) =>
          prev.map((dl) =>
            dl.id === downloadId
              ? { ...dl, id: data.id, status: 'downloading', serverSide: true }
              : dl,
          ),
        );
      }

      // Some downloads complete synchronously (cache hit).
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

  const filteredSessions = savedSessions.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const sortedSessions = [...filteredSessions].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  );

  const openYoutubeSearch = () => {
    if (youtubeSearchQuery.trim()) {
      window.open(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeSearchQuery)}`,
        '_blank',
      );
    }
  };

  const backendOk = backendStatus?.status === 'ok';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-orange-400 mb-2">
              🎆 Fireworks Show Planner
            </h1>
            <p className="text-sm md:text-base text-gray-300">
              {currentUser
                ? `Welcome, ${currentUser.username}!`
                : 'Plan your perfect fireworks show'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <button
              onClick={onGoToLibrary}
              className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded-lg font-bold text-base md:text-lg transition shadow-lg"
            >
              📚 Library
            </button>
            <button
              onClick={onNewShow}
              className="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-bold text-base md:text-lg transition shadow-lg"
            >
              + New Show
            </button>
            <button
              onClick={onLogout}
              className="bg-gray-600 hover:bg-gray-700 px-4 py-3 rounded-lg font-medium text-sm md:text-base transition"
            >
              🚪 Logout
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6 md:mb-8">
          <div
            className="bg-gray-800/50 backdrop-blur rounded-lg p-4 border border-purple-500/30 cursor-pointer hover:border-purple-400 transition"
            onClick={() =>
              sortedSessions.length > 0 &&
              onEditShow(sortedSessions[0].name, sortedSessions[0].user_id)
            }
          >
            <div className="text-3xl font-bold text-purple-400">{savedSessions.length}</div>
            <div className="text-sm text-gray-400 mt-1">Total Shows</div>
          </div>
          <div
            className="bg-gray-800/50 backdrop-blur rounded-lg p-4 border border-blue-500/30 cursor-pointer hover:border-blue-400 transition"
            onClick={onGoToLibrary}
          >
            <div className="text-3xl font-bold text-blue-400">{downloadedVideos.size}</div>
            <div className="text-sm text-gray-400 mt-1">Videos in Library</div>
          </div>
          <div className="bg-gray-800/50 backdrop-blur rounded-lg p-4 border border-green-500/30">
            <div
              className={`text-3xl font-bold ${backendOk ? 'text-green-400' : 'text-red-400'}`}
            >
              {backendOk ? '●' : '○'}
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {backendOk ? 'Backend Connected' : 'Backend Offline'}
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Shows list */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-purple-500/30">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-purple-300">🎭 Your Shows</h2>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search shows..."
                  className="bg-gray-700/50 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-64"
                />
              </div>

              {sortedSessions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🎆</div>
                  <p className="text-xl text-gray-400 mb-2">No shows yet</p>
                  <p className="text-sm text-gray-500 mb-6">
                    Create your first fireworks show to get started!
                  </p>
                  <button
                    onClick={onNewShow}
                    className="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-bold transition"
                  >
                    + Create First Show
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {sortedSessions.map((session) => {
                    const isOwn =
                      session.user_id == null || session.user_id === currentUser?.id;
                    const ownerLabel = isOwn
                      ? null
                      : session.creator_username || session.creator_email || 'unknown';
                    return (
                      <div
                        key={`${session.user_id ?? 'me'}:${session.name}`}
                        className={`bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition cursor-pointer border hover:border-purple-500 ${
                          isOwn ? 'border-transparent' : 'border-yellow-500/40'
                        }`}
                        onClick={() => onEditShow(session.name, session.user_id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h3 className="text-xl font-bold text-white">{session.name}</h3>
                              <span className="text-xs px-2 py-1 bg-purple-600 rounded">
                                {`${session.videos.length} items`}
                              </span>
                              {ownerLabel && (
                                <span
                                  className="text-xs px-2 py-1 bg-yellow-600/40 border border-yellow-500/60 rounded text-yellow-100"
                                  title={`Owner user_id: ${session.user_id}`}
                                >
                                  by {ownerLabel}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-400 mb-2">
                              Duration: {session.totalDuration?.toFixed(0) || 60}s
                            </div>
                            <div className="text-xs text-gray-500">
                              Last modified:{' '}
                              {new Date(session.timestamp).toLocaleDateString()} at{' '}
                              {new Date(session.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => onEditShow(session.name, session.user_id)}
                              className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm transition"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => {
                                const prompt = isOwn
                                  ? `Delete show "${session.name}"?`
                                  : `Delete ${ownerLabel}'s show "${session.name}"?`;
                                if (confirm(prompt)) {
                                  onDeleteShow(session.name, session.user_id);
                                }
                              }}
                              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right column: YouTube + Library quick-links */}
          <div className="space-y-6">
            <div className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-orange-500/30">
              <h2 className="text-xl font-bold text-orange-300 mb-4">📥 YouTube Downloader</h2>
              <div className="text-xs text-blue-400 flex items-center gap-2 mb-3">
                <span className="w-2 h-2 bg-blue-400 rounded-full" />
                Server-side download via yt-dlp
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste YouTube URL..."
                  className="w-full bg-gray-700/50 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleYoutubeDownload()}
                />
                <button
                  onClick={handleYoutubeDownload}
                  disabled={!youtubeUrl.trim()}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition font-bold"
                >
                  Download Video
                </button>

                {downloading.length > 0 && (
                  <div className="space-y-2 mt-3">
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

            {currentUser?.is_admin && <AdminDesktopDownload />}

            {/* Quick Library Preview */}
            <div
              className="bg-gray-800/50 backdrop-blur rounded-lg p-6 border border-green-500/30 cursor-pointer hover:border-green-400 transition"
              onClick={onGoToLibrary}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-green-300">📚 Library</h2>
                <span className="text-sm text-gray-400">{downloadedVideos.size} videos</span>
              </div>
              <p className="text-sm text-gray-400 mb-3">Manage your video collection</p>
              <button className="w-full bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition">
                Manage Library →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
