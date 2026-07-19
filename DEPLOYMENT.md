# Deploying KSP Crime AI

## Frontend → Zoho Catalyst **Slate** (Git deploy)

Slate hosts the React front-end and rebuilds automatically on every push to GitHub.

### One-time setup in the Slate dashboard
1. In the payment/upgrade popup, click **Cancel** — the **free tier** covers hosting.
2. Click **Start Exploring** (or **Create App** / **Deploy from Git**).
3. **Connect GitHub** → authorize Zoho Catalyst → select the repository **`Sav-28/ksp`**, branch **`main`**.
4. Configure the build (the app lives in the `frontend` sub-folder):

   | Setting | Value |
   |---|---|
   | Framework preset | React / Create React App |
   | **Root (base) directory** | `frontend` |
   | **Build command** | `npm run build` |
   | **Output / publish directory** | `build` |
   | Node version (if asked) | 18 |

5. **Environment Variables** → add:

   | Key | Value |
   |---|---|
   | `REACT_APP_API_BASE` | your live backend URL (e.g. `https://ksp-api.onrender.com`) |

6. Click **Deploy**. Slate installs deps, runs `npm run build`, and serves the site at a
   `https://<app>.catalystserverless.com` (or your custom domain).

### After deploy
- On the **backend**, set `KSP_CORS_ORIGINS` to include the Slate URL so the browser
  can call the API.
- Every `git push` to `main` triggers a fresh Slate build.

---

## Backend (needed for a fully working live site)

Slate is front-end only, so the FastAPI backend must run elsewhere. Fastest options:

### Option: Render (free tier, Python-friendly)
1. Create a new **Web Service** from the same GitHub repo, root dir `backend`.
2. Build: `pip install -r requirements.txt`
3. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add a **PostgreSQL** instance; set `DATABASE_URL` (the ORM is DB-agnostic).
5. Set env: `KSP_SECRET_KEY`, `KSP_CORS_ORIGINS=https://<your-slate-url>`,
   `KSP_NLP_PROVIDER=rules` (Ollama can't run on a small host), etc.
6. First deploy: run the seed + train scripts once (shell), then it's live.
7. Put the resulting URL into Slate's `REACT_APP_API_BASE`.

> Note: SQLite doesn't persist on serverless/ephemeral hosts — use PostgreSQL in
> production. The local LLM (Ollama) needs a GPU/persistent box; the hosted demo
> falls back to the rule-based engine automatically when Ollama isn't reachable.

---

## Docker (alternative full-stack hosting)
`docker-compose up --build` runs backend (8004) + frontend (nginx, 3000) together —
useful for a VM deployment.
