# PostgreSQL Database Setup Guide

This guide explains how to set up a shared PostgreSQL database so your local and Render instances use the same database, keeping shows and library data in sync.

## Why PostgreSQL?

**Problem:** SQLite databases are separate files - your local client and Render server each have their own database, so:
- ❌ Shows saved locally don't appear on Render
- ❌ Library changes don't sync
- ❌ User data is isolated per instance

**Solution:** Use PostgreSQL (shared database) that both instances connect to:
- ✅ Shows sync across local and Render
- ✅ Library changes sync automatically
- ✅ Single source of truth for all data

## Database Options

You can use either:
- **Supabase** (Recommended) - Free tier, no expiration, great for production
- **Render PostgreSQL** - Free tier, expires after 90 days

---

## Option A: Supabase Setup (Recommended)

### Step 1: Get Supabase Connection String

**⚠️ IMPORTANT:** For Render deployments, use **Connection Pooling** URL with pooler hostname

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **Database**
4. Scroll to **"Connection pooling"** section
5. Select **"Session"** mode (recommended for Render - uses IPv4-compatible pooler)
6. Copy the connection string - it will look like:
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
   ```
   **Example:**
   ```
   postgresql://postgres.ttdrydqzszdkkzqbhccf:[YOUR-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres
   ```

**Why this format?**
- Uses `pooler.supabase.com` hostname (resolves to IPv4 addresses)
- Works with Render's IPv4-only network
- Uses port `5432` (standard PostgreSQL port)
- Better connection reliability

**Important:** 
- Replace `[YOUR-PASSWORD]` with your actual database password
- The username format is `postgres.[PROJECT-REF]` (not just `postgres`)
- Use the pooler hostname (`aws-*.pooler.supabase.com`) not the direct hostname (`db.*.supabase.co`)

### Step 2: Configure Render Web Service

1. Go to your web service in Render Dashboard
2. Go to **"Environment"** tab
3. Add environment variable:
   - **Key:** `DATABASE_URL`
   - **Value:** Your Supabase connection string
4. Click **"Save Changes"**
5. Render will automatically redeploy

### Step 3: Configure Local Development

Add to `backend/.env`:
```
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

**Note:** Supabase requires SSL connections. The connection string should work as-is.

### Step 4: Install PostgreSQL Driver Locally

```powershell
cd backend
pip install psycopg2-binary
```

### Step 5: Test Connection

1. Restart your local server
2. Check logs - you should see:
   ```
   ✓ Using PostgreSQL database (shared)
   ✅ Database initialized
   ```

---

## Option B: Render PostgreSQL Setup

### Step 1: Create PostgreSQL Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name:** `fireworks-planner-db` (or your preferred name)
   - **Database:** `fireworks` (or leave default)
   - **User:** Auto-generated
   - **Region:** Same as your web service
   - **Plan:** **Free** (1 GB storage, perfect for development)
4. Click **"Create Database"**
5. Wait ~2 minutes for database to be created

## Step 2: Get Database Connection String

1. In Render Dashboard, click on your PostgreSQL database
2. Find **"Internal Database URL"** or **"Connection String"**
3. It will look like:
   ```
   postgresql://user:password@hostname:5432/dbname
   ```
4. **Copy this URL** - you'll need it for both local and Render

## Step 3: Configure Render Web Service

1. Go to your web service in Render Dashboard
2. Go to **"Environment"** tab
3. Add environment variable:
   - **Key:** `DATABASE_URL`
   - **Value:** Your PostgreSQL connection string from Step 2
4. Click **"Save Changes"**
5. Render will automatically redeploy

## Step 4: Configure Local Development

### Option A: Add to .env file (Recommended)

Add to `backend/.env`:
```
DATABASE_URL=postgresql://user:password@hostname:5432/dbname
```

**Important:** Use the **"External Database URL"** for local connections (not Internal). Render provides both:
- **Internal URL:** Only works from within Render's network
- **External URL:** Works from anywhere (your computer)

### Option B: Set Environment Variable

```powershell
$env:DATABASE_URL="postgresql://user:password@hostname:5432/dbname"
```

## Step 5: Install PostgreSQL Driver Locally

```powershell
cd backend
pip install psycopg2-binary
```

Or it will be installed automatically when you install requirements:
```powershell
pip install -r requirements.txt
```

## Step 6: Test the Connection

1. Restart your local server
2. Check logs - you should see:
   ```
   ✓ Using PostgreSQL database (shared)
   ✅ Database initialized
   ```
3. If you see SQLite instead, check that `DATABASE_URL` is set correctly

## How It Works

**Without DATABASE_URL (SQLite):**
- Local: `backend/fireworks.db` (local file)
- Render: `backend/fireworks.db` (separate file)
- ❌ Data doesn't sync

**With DATABASE_URL (PostgreSQL):**
- Local: Connects to PostgreSQL on Render
- Render: Connects to same PostgreSQL database
- ✅ Data syncs automatically!

## Migration from SQLite

**Existing data:** Your SQLite database won't automatically migrate. Options:

### Option 1: Fresh Start (Recommended for Testing)
- Start fresh with PostgreSQL
- Old SQLite data stays in `backend/fireworks.db` as backup

### Option 2: Manual Migration
1. Export data from SQLite (if needed)
2. Import to PostgreSQL (if needed)
3. For most cases, starting fresh is easier

## Troubleshooting

### "psycopg2 not found"
```powershell
pip install psycopg2-binary
```

### "Connection refused" or "Can't connect"
- Make sure you're using **External Database URL** for local connections
- Check that database is running in Render dashboard
- Verify firewall/network settings

### "Still using SQLite"
- Check that `DATABASE_URL` environment variable is set
- Restart your server after setting environment variable
- Check logs for database type message

### "Table doesn't exist"
- Database will auto-create tables on first run
- Check that `init_db()` is being called
- Look for "Database initialized" message in logs

## Free Tier Comparison

### Supabase Free Tier:
- ✅ 500 MB database storage
- ✅ Unlimited connections
- ✅ **No expiration** (free forever)
- ✅ Connection pooling included
- ✅ Built-in backups
- ✅ Great for production

### Render PostgreSQL Free Tier:
- ✅ 1 GB storage
- ✅ Unlimited connections
- ⚠️ **90 days free** (then $7/month)
- ⚠️ Database expires after 90 days if not upgraded

**Recommendation:** Use Supabase for production - no expiration and better free tier!

## Benefits

✅ **Unified Data:** Same shows/library on local and Render  
✅ **Real-time Sync:** Changes appear immediately  
✅ **No Conflicts:** Single source of truth  
✅ **Scalable:** Can handle multiple instances  
✅ **Free:** Works on Render's free tier  

## Next Steps

**For Supabase:**
1. ✅ Get connection string from Supabase Dashboard
2. ✅ Set `DATABASE_URL` on Render web service
3. ✅ Set `DATABASE_URL` in local `.env`
4. ✅ Install `psycopg2-binary` locally
5. ✅ Restart servers and test!

**For Render PostgreSQL:**
1. ✅ Create PostgreSQL database on Render
2. ✅ Set `DATABASE_URL` on Render web service
3. ✅ Set `DATABASE_URL` in local `.env` (use External URL)
4. ✅ Install `psycopg2-binary` locally
5. ✅ Restart servers and test!

Your local and Render instances will now share the same database! 🎉

## SSL Connection (Supabase)

Supabase requires SSL connections. The `psycopg2` driver handles this automatically, but if you encounter SSL errors, you may need to add SSL parameters to your connection string:

```
postgresql://postgres:password@host:5432/postgres?sslmode=require
```

The standard Supabase connection string should work without modification.

