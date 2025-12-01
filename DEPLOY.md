# 🚀 Deploying to Render.com

This guide will help you deploy your Fireworks Show Planner to Render.com so you can share it publicly.

## Prerequisites

- [x] Render.com account (you have this!)
- [ ] GitHub account
- [ ] Git installed on your computer

## Step 1: Push Your Code to GitHub

### First-time Git Setup (if needed)
```powershell
# Check if git is installed
git --version

# If not installed, download from: https://git-scm.com/download/win
```

### Create GitHub Repository

1. Go to https://github.com/new
2. Create a repository (e.g., `fireworks-planner`)
3. Keep it **Public** (Render.com free tier requires public repos)
4. **Don't** initialize with README (we already have one)

### Push Your Code

```powershell
# Navigate to your project
cd c:\CODE\fwp

# Initialize git (if not already done)
git init

# Add all files
git add .

# Make your first commit
git commit -m "Initial commit - Fireworks Show Planner"

# Add your GitHub repo as remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/fireworks-planner.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 2: Deploy on Render.com

### Connect Your Repository

1. Go to https://dashboard.render.com/
2. Click **"New +"** → **"Blueprint"**
3. Click **"Connect GitHub"** (authorize Render to access your repos)
4. Find and select your `fireworks-planner` repository
5. Render will detect the `render.yaml` file automatically
6. Click **"Apply"**

### What Render Will Do

✅ Install Python and dependencies  
✅ Install FFmpeg for yt-dlp  
✅ Create persistent storage for videos (1GB)  
✅ Start your Flask server  
✅ Serve your frontend  
✅ Give you a public URL (e.g., `https://fireworks-planner.onrender.com`)

### Deployment Time

- **First deployment**: ~10-15 minutes
- **Subsequent deployments**: ~5-7 minutes
- Render auto-deploys when you push to GitHub!

## Step 3: Access Your App

Once deployment completes:

1. Render will show you a URL (e.g., `https://fireworks-planner-abc123.onrender.com`)
2. Click it to open your app
3. Share this URL with anyone!

## ⚠️ Important Notes

### Free Tier Limitations

**Render.com Free Tier:**
- ✅ Perfect for demos and personal use
- ⚠️ App "spins down" after 15 minutes of inactivity
- ⚠️ First request after spin-down takes 30-60 seconds to wake up
- ⚠️ 1GB video storage limit
- ⚠️ Limited bandwidth

**Recommendations:**
- Warn users about the initial cold-start delay
- Use compressed videos to save space
- Consider paid tier ($7/month) for always-on service

### YouTube Downloads

- ✅ yt-dlp works on Render
- ⚠️ Some videos may be blocked by YouTube
- ⚠️ Large downloads may timeout (keep videos under 50MB)

### Data Persistence

- ✅ Videos stored on persistent disk (survives redeployments)
- ✅ localStorage data (shows, library) saved in user's browser
- ✅ Each user has their own session data

## 🔧 Updating Your Deployment

After making changes locally:

```powershell
cd c:\CODE\fwp
git add .
git commit -m "Description of your changes"
git push
```

Render automatically redeploys within 5-10 minutes!

## 🆘 Troubleshooting

### "Application failed to respond"
- Check Render logs (Dashboard → Your Service → Logs)
- May need to wait for cold start (first request after idle)

### Videos won't download
- Check that yt-dlp is working in logs
- Some videos may be geo-restricted
- Try shorter videos first

### "Out of storage"
- Free tier has 1GB limit
- Delete old videos via the Library page
- Consider paid tier for more storage

## 💰 Cost

**Free Tier:** $0/month
- 750 hours/month free
- 1GB disk storage
- Perfect for personal use and demos

**Paid Tier:** $7/month
- Always-on (no cold starts)
- Better performance
- More storage options

## 🎉 You're Done!

Your Fireworks Show Planner is now publicly accessible! Share the URL with friends, family, or your fireworks crew!

---

Need help? Check the Render logs or refer to the main README.md for local development.

