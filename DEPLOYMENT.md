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

## Backend → Zoho Catalyst **AppSail** (required — deploy must be on Catalyst)

AppSail is Catalyst's PaaS that runs a full web app with a start command. It runs
our FastAPI/uvicorn backend almost as-is.

### Prep already done in the code
- `main.py` binds to Catalyst's port env var `X_ZOHO_CATALYST_LISTEN_PORT`.
- On startup the app **auto-seeds** the DB and **retrains** the NLP model in memory
  if the shipped model can't load (library version differences).
- `KSP_NLP_PROVIDER=rules` is used in the cloud (Ollama can't run on Catalyst).

### Deploy steps (Catalyst CLI)
```bash
npm install -g zcatalyst-cli
catalyst login
cd ksp-crime-ai
catalyst init            # select AppSail; source directory = backend
#   Stack: Python (choose the highest available, e.g. Python 3.10/3.11)
#   Startup command:  python main.py
catalyst deploy          # bundles backend/ and deploys the AppSail service
```

### AppSail environment variables (set in the Catalyst console → AppSail → Config)
| Key | Value |
|-----|-------|
| `DATABASE_URL` | `sqlite:////tmp/ksp_crime_ai.db`  (app dir is read-only — use /tmp) |
| `KSP_NLP_PROVIDER` | `rules` |
| `KSP_SECRET_KEY` | a long random string |
| `KSP_CORS_ORIGINS` | your Slate frontend URL (e.g. `https://ksp-xxxx…slate.in`) |
| `KSP_AUTOSEED` | `true` |

### After deploy
- AppSail gives the backend a URL. Put it into **Slate → App Variables →
  `REACT_APP_API_BASE`** and redeploy the frontend.
- Test the API: `GET <appsail-url>/health` → `{"status":"healthy",...}`.

> Notes: The app directory is read-only on AppSail, so SQLite must live in `/tmp`
> (set via `DATABASE_URL`). The local LLM (Ollama) is not used in the cloud — the
> rule-based engine handles queries there.

---

## Docker (alternative full-stack hosting)
`docker-compose up --build` runs backend (8004) + frontend (nginx, 3000) together —
useful for a VM deployment.
