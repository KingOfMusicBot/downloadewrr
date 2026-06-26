# Deployment Guide - Deploying both Frontend and Backend on Heroku (One-Click)

This guide explains how to deploy the M3U8 Downloader project. We will deploy **both the Next.js Frontend and the Express Backend (along with the background worker)** onto a **single Heroku application** under one domain and port.

---

## Part 1: How it Works (Under the Hood)
- **Unified Port Routing:** Heroku only allows a single web port (`PORT`) to be exposed to the public. Next.js will run on this main port.
- **Internal Proxying:** We have configured Next.js `rewrites` so that any API requests (under `/api/*`) and downloaded files (under `/uploads/*`) are automatically proxied internally to the Express backend running on local port `5000`.
- **One Dyno Setup:** The single `web` dyno starts a production orchestrator (`run_prod.js`) which runs both Next.js and Express side-by-side, sharing local resources and resolving CORS restrictions.

---

## Part 2: Step-by-Step Deployment Instructions

### Step 1: Push your code to GitHub
Create a GitHub repository and push your project's code to it:
```bash
git init
git add .
git commit -m "Configure Monorepo Heroku Deploy"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```
*(Replace `YOUR_GITHUB_USERNAME/YOUR_REPO_NAME` with your actual GitHub username and repository name).*

### Step 2: Click the Deploy Button
Open your web browser and navigate to:
```
https://heroku.com/deploy?template=https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME
```
*(Replace `YOUR_GITHUB_USERNAME/YOUR_REPO_NAME` at the end with your GitHub repo details).*

### Step 3: Configure Settings on Heroku
On the Heroku deployment page, fill in the following:
1. **App Name:** Choose a name for your application (e.g. `my-m3u8-downloader`).
2. **MONGODB_URI:** Paste your MongoDB Atlas Connection String (e.g., `mongodb+srv://...`).
3. **REDIS_URL:** Paste your Redis connection URL (e.g. `redis://...`). You can get a free Redis instance from [Redis Cloud](https://redis.com) or other providers, or add a Redis addon to your Heroku app.
4. **Click "Deploy app"**:
   * Heroku will install **Node.js** and the **FFmpeg buildpack** automatically.
   * It will install dependencies and compile typescript files for both backend and frontend.

### Step 4: Dyno Scaling (No Separate Worker Required)
- **Web Dyno only:** The background worker runs automatically inside the same `web` dyno along with the frontend and backend servers.
- Therefore, you **do not** need to scale or turn on a separate `worker` process under the **Resources** tab on Heroku. Keep it toggled **OFF** to save dyno quota/cost!


### Step 5: Test the App
Once deployed, open your application:
`https://your-app-name.herokuapp.com`
Log in/register, paste an M3U8 link, click **Analyze Stream**, select your quality, and start downloading!
