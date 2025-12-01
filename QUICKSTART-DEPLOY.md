# 🚀 Quick Deployment Checklist

## Before You Start
- [ ] Render.com account created ✓
- [ ] GitHub account (create at github.com if needed)
- [ ] Git installed (download from git-scm.com if needed)

## 5-Minute Deployment

### 1️⃣ Create GitHub Repository (2 min)
```
1. Go to: https://github.com/new
2. Name: fireworks-planner
3. Keep it PUBLIC (required for Render free tier)
4. Don't initialize with README
5. Click "Create repository"
```

### 2️⃣ Push Your Code (2 min)
```powershell
cd c:\CODE\fwp
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/fireworks-planner.git
git branch -M main
git push -u origin main
```

**Replace YOUR_USERNAME with your GitHub username!**

### 3️⃣ Deploy on Render (1 min + wait)
```
1. Go to: https://dashboard.render.com/
2. Click "New +" → "Blueprint"
3. Click "Connect GitHub"
4. Select your "fireworks-planner" repo
5. Click "Apply"
6. Wait ~10 minutes for deployment
```

### 4️⃣ Get Your URL
```
- Render will show: https://fireworks-planner-xyz123.onrender.com
- Click it to test
- Share with anyone!
```

## ⚠️ First-Time Users Note

Your URL will show this on first visit:
```
"Backend offline - start server.py"
```

**This is normal!** The free tier "spins down" when idle. Just:
1. Wait 30-60 seconds
2. Refresh the page
3. Server will wake up and connect

---

For detailed instructions, see DEPLOY.md

Need help? The main issue is usually:
- Forgot to make repo PUBLIC (Render free tier requirement)
- Cold start delay (just wait and refresh)

