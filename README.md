# MSS Backend - Separate Deployment Guide

This folder contains the standalone backend for the MSS UEMK portal, configured for deployment to Vercel.

## 📋 Setup Steps

### 1. **Copy the server.ts file from the main project**
```bash
cp ../MLSA-MSS-UEMK-main/server.ts ./server.ts
```

### 2. **Copy the db.json file (optional, for local fallback)**
```bash
cp ../MLSA-MSS-UEMK-main/db.json ./db.json
```

### 3. **Install dependencies**
```bash
npm install
```

### 4. **Test locally**
```bash
npm run dev
```
Backend will run at `http://localhost:3000`

---

## 🚀 Deploy to Vercel

### Option A: Using Vercel CLI

```bash
# Install Vercel CLI globally (if not already installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

### Option B: Using GitHub Integration

1. Push this repository to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "Add New Project"
4. Select "Import Git Repository"
5. Choose this repository
6. Vercel will auto-detect the configuration
7. Add environment variables (see below)
8. Click "Deploy"

---

## 🔑 Environment Variables (Set in Vercel)

In the Vercel dashboard, go to **Settings → Environment Variables** and add:

```
MONGODB_URI=mongodb+srv://microsoftstudentsocietyuemk_db_user:WueN69emGDPhuQ@cluster0.nhzbfpl.mongodb.net/?appName=Cluster0
GEMINI_API_KEY=your_gemini_api_key_here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=microsoftstudentsocietyuemk@gmail.com
SMTP_PASS=nwujlixabysxgjoi
SMTP_FROM="Microsoft Student Society UEMK" <microsoftstudentsocietyuemk@gmail.com>
PORT=3000
```

---

## 📱 Update Frontend API URL

After deployment, you'll get a Vercel URL like: `https://your-backend-project.vercel.app`

Update your frontend `.env` file:

```env
VITE_API_URL=https://your-backend-project.vercel.app
APP_URL=https://your-backend-project.vercel.app
```

Or update the frontend code where API calls are made:

```typescript
// Instead of:
const API_URL = 'http://localhost:3000';

// Use:
const API_URL = 'https://your-backend-project.vercel.app';
```

---

## 📊 Project Structure

```
MLSA-MSS-UEMK-backend/
├── api/
│   └── index.ts              # Vercel serverless handler
├── server.ts                 # Main Express application (copy from main project)
├── db.json                   # Local database fallback (optional)
├── package.json              # Dependencies
├── vercel.json               # Vercel configuration
├── tsconfig.json             # TypeScript config (from main project)
└── .env.example              # Environment variable template
```

---

## ✅ Verification

After deployment, test the backend:

```bash
curl https://your-backend-project.vercel.app/api/data
```

You should get a JSON response with the app data.

---

## 🔗 API Endpoints

All endpoints from your Express server are now available at:
- `https://your-backend-project.vercel.app/api/data`
- `https://your-backend-project.vercel.app/api/team`
- `https://your-backend-project.vercel.app/api/events`
- ... and all other API routes

---

## 💡 Notes

- The Vercel free tier allows up to **100 deployments per day**
- Each serverless function has a **10-second timeout** by default (configured to 30s in vercel.json)
- Cold starts may take 1-2 seconds on the free tier
- MongoDB connections are pooled and reused for performance
- Local `db.json` fallback ensures service continues even if MongoDB is down

---

## 🆘 Troubleshooting

**Problem: "Cannot find module 'server.ts'"**
- Make sure you've copied `server.ts` from the main project to this folder

**Problem: "MONGODB_URI is undefined"**
- Check Environment Variables in Vercel dashboard are set correctly

**Problem: "SMTP connection failed"**
- Verify SMTP credentials are correct
- Gmail requires "App Passwords" (not regular account password)
- Enable Less Secure App Access if using Gmail

**Problem: "Timeout errors"**
- Your function might be taking too long
- Increase `maxDuration` in `vercel.json` if needed
- Check MongoDB connection timeouts

---

For more help, see the [Vercel Documentation](https://vercel.com/docs)
