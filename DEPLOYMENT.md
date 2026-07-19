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

AppSail is Catalyst's PaaS (Catalyst-managed Python runtime) that runs a full web
app with a start command. It runs our FastAPI/uvicorn backend.

> **Why not Render / Railway / etc.?** The hackathon rules require deployment
> **exclusively on the Catalyst platform**. Frontend → Catalyst **Slate**,
> backend → Catalyst **AppSail**. Anything else disqualifies the submission.

### The one thing that trips everyone up (read this first)
AppSail does **not** run `pip install -r requirements.txt` on the server. You must
**bundle the Python packages with your app** — and they must be **Linux
(manylinux) wheels**, not the Windows ones pip installs by default. If you deploy
without vendoring Linux wheels, the app crashes on startup with `ModuleNotFoundError`
(fastapi/uvicorn not found) even though it runs fine locally.

To make this painless, the backend was slimmed down so it needs only a handful of
light, wheel-friendly packages. The heavy ML stack (scikit-learn/numpy) is now
**optional** — the app auto-falls back to a keyword-based intent classifier in the
cloud, so we don't have to ship those big binaries at all.

### Prep already done in the code
- `main.py` binds to Catalyst's port env var `X_ZOHO_CATALYST_LISTEN_PORT`.
- On startup the app **auto-seeds** the DB (deterministic dataset) when empty.
- scikit-learn/numpy are optional; without them a keyword classifier is used.
- `KSP_NLP_PROVIDER=rules` is used in the cloud (Ollama can't run on Catalyst).
- SQLite writes to `/tmp` (the app directory is read-only on AppSail).

### Step 1 — Install the CLI and log in
```bash
npm install -g zcatalyst-cli
catalyst login
```

### Step 2 — Initialize the AppSail service
```bash
cd ksp-crime-ai
catalyst init
#  › Select: AppSail
#  › Source directory:   backend
#  › Stack:              Python 3.11   (any of 3.10 / 3.11 / 3.12 / 3.13 is fine)
#  › Startup command:    python main.py
```
This creates `backend/app-config.json` (plus a project-level `catalyst.json`).

### Step 3 — Vendor Linux wheels into the backend folder  ← the critical step
From the `backend` folder, download **Linux cp311 wheels** for every dependency
into the folder so they ship with the app. Match the number after `cp` to the
stack you picked (Python 3.11 → `cp311`, 3.12 → `cp312`, etc.):

```bash
cd backend
pip install -r requirements.txt -t . ^
  --only-binary=:all: ^
  --platform manylinux2014_x86_64 ^
  --python-version 3.11 --implementation cp --abi cp311
```
(On macOS/Linux use `\` for line-continuation instead of `^`.)

This drops `fastapi/`, `uvicorn/`, `starlette/`, `pydantic/`, `pydantic_core/`,
`sqlalchemy/`, `requests/`, etc. right next to `main.py`. They get bundled and
uploaded on deploy. (You can delete these folders again after deploying — they're
build artifacts.)

> Prefer it automatic? Add this to the `"scripts"` key of `backend/app-config.json`
> so the CLI vendors before every deploy:
> ```json
> "scripts": {
>   "predeploy": "pip install -r requirements.txt -t . --only-binary=:all: --platform manylinux2014_x86_64 --python-version 3.11 --implementation cp --abi cp311"
> }
> ```
> If the deploy fails to find a wheel, your AppSail region may be ARM — swap
> `manylinux2014_x86_64` for `manylinux2014_aarch64`.

### Step 4 — Deploy
```bash
catalyst deploy          # bundles backend/ and deploys the AppSail service
```

### Step 5 — Set AppSail environment variables (Catalyst console → AppSail → Configuration)
| Key | Value |
|-----|-------|
| `DATABASE_URL` | `sqlite:////tmp/ksp_crime_ai.db`  (app dir is read-only — use /tmp) |
| `KSP_NLP_PROVIDER` | `rules` |
| `KSP_SECRET_KEY` | a long random string |
| `KSP_CORS_ORIGINS` | your Slate frontend URL (e.g. `https://ksp-xxxx…slate.in`) |
| `KSP_AUTOSEED` | `true` |

Redeploy (or restart the instance) after setting env vars.

### Step 6 — Wire the frontend to the backend
- AppSail gives the backend a URL. Put it into **Slate → App Variables →
  `REACT_APP_API_BASE`** and redeploy the frontend.
- Test the API directly: `GET <appsail-url>/health` → `{"status":"healthy",...}`.

### Troubleshooting
- **`ModuleNotFoundError: No module named 'fastapi'`** → Step 3 was skipped or the
  wrong architecture/python-version wheels were vendored. Re-run Step 3 with the
  `cpXYZ` matching your stack, then redeploy.
- **`Read-only file system` on the DB** → make sure `DATABASE_URL` points at
  `/tmp` as shown above.
- **`os has no attribute add_dll_directory`** → Windows wheels got bundled. You
  didn't use `--platform manylinux2014_*`; re-run Step 3.
- **CORS errors in the browser** → `KSP_CORS_ORIGINS` must exactly match the Slate
  URL (scheme + host, no trailing slash).

---

## Docker (alternative full-stack hosting)
`docker-compose up --build` runs backend (8004) + frontend (nginx, 3000) together —
useful for a VM deployment.
