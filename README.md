# 🎆 Fireworks Show Planner

A local application for planning and timing your fireworks show by synchronizing multiple video clips on a timeline.

## Features

- **YouTube Integration**: Paste YouTube URLs to download fireworks videos directly
- **Local File Support**: Load videos from your computer
- **Multi-video Playback**: View 2-6 videos simultaneously in a responsive grid
- **Timeline Editor**: Drag clips to set precise start times (CapCut-style)
- **Synchronized Playback**: All videos play together with a master clock
- **Cue Sheet**: Auto-generated timing list for your show

## Quick Start

### Prerequisites

1. **Python 3.8+** - [Download here](https://www.python.org/downloads/)
2. **FFmpeg** - Required for merging video and audio from YouTube
   ```powershell
   # Install FFmpeg for yt-dlp
   winget install yt-dlp.FFmpeg
   ```

### Installation

```bash
# 1. Clone or download this folder

# 2. Set up Python virtual environment
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows PowerShell
pip install -r requirements.txt
```

### Running the App

**🚀 Easy Way (Windows):**
Just double-click one of these files in the project root:
- **`START.bat`** - Starts both servers in new windows
- **`STOP.bat`** - Stops all running servers
- **`RESTART.bat`** - Restarts both servers

**📝 Manual Way:**

**Terminal 1 - Start the backend:**
```bash
cd backend
.\venv\Scripts\Activate.ps1  # Windows
python server.py
```
You should see:
```
🎆 Fireworks Planner Backend
📁 Videos will be saved to: /path/to/backend/videos
🌐 Starting server on http://localhost:5000
```

**Terminal 2 - Open the frontend:**
```bash
cd frontend
python -m http.server 8080
# Then open http://localhost:8080 in your browser
```

**💡 Pro Tip:** After running START.bat, open http://localhost:8080 in your browser!

## Usage

### Adding Videos

1. **From YouTube**: 
   - Click "📥 YouTube" button
   - Paste a YouTube URL
   - Click Download
   - Video appears in grid when complete

2. **From Local Files**:
   - Click "+ Local Files"
   - Select one or more video files

### Planning Your Show

1. Videos appear in the grid and on the timeline
2. **Drag clips** on the timeline to set when each firework starts
3. **Fine-tune** with the number inputs on each video (0.1s precision)
4. **Preview** by clicking Play - all videos sync to the master clock
5. **Scrub** by clicking anywhere on the timeline or using the slider

### Timeline Controls

- **Zoom**: Adjust timeline zoom to see more detail
- **Duration**: Set total show length
- **Playhead**: Red line shows current position
- **Drag clips**: Move left/right to change start time

### Cue Sheet

The bottom panel shows a sorted list of all your fireworks with their start times - perfect for printing or referencing during your actual show!

## Folder Structure

```
fireworks-planner/
├── backend/
│   ├── server.py        # Flask API server
│   ├── requirements.txt # Python dependencies
│   └── videos/          # Downloaded videos stored here
├── frontend/
│   ├── index.html       # Main application
│   └── src/
│       └── App.jsx      # React component (for reference)
└── README.md
```

## Troubleshooting

### "Backend offline" message
- Make sure `server.py` is running
- Check that port 5000 isn't in use
- Try: `curl http://localhost:5000/api/health`

### YouTube download fails
- Update yt-dlp: `pip install -U yt-dlp`
- Some videos may be geo-restricted or age-gated
- Check the terminal running server.py for error messages

### Videos won't sync properly
- Ensure videos have loaded (wait for duration to appear)
- Try clicking Reset then Play again
- Some video formats may have seeking issues

### CORS errors in browser console
- Use `python -m http.server` instead of opening file directly
- Or use a browser that allows local file access

## Tips for Best Results

1. **Download in advance**: Get all your videos downloaded before show day
2. **Note your actual delays**: Real fuses have ignition delays - account for this
3. **Test with audio off first**: Easier to see timing without sound
4. **Print the cue sheet**: Having a paper backup is always smart

## Tech Stack

- **Backend**: Python, Flask, yt-dlp
- **Frontend**: React (via ESM), Tailwind CSS
- **No build step required** - just HTML + Python

---

Made for planning the perfect backyard fireworks show! 🎇
