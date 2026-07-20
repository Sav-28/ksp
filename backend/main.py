import os
import sys

# On Catalyst AppSail the runtime does NOT pip-install requirements.txt — the
# dependencies are vendored (as Linux wheels) into ./vendor before deploy. Add
# that folder to the import path so `import fastapi` etc. resolve on the cloud.
# Locally this is harmless: the folder won't exist and packages come from the
# active environment instead.
# NOTE: append (not insert) so locally-installed packages take priority on your
# dev machine — the vendored Linux wheels are only used as a fallback, which is
# exactly the situation on the clean AppSail runtime.
_VENDOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor")
if os.path.isdir(_VENDOR) and _VENDOR not in sys.path:
    sys.path.append(_VENDOR)

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from sqlalchemy.orm import Session
from sqlalchemy import text

# Import database session
from src.database.session import get_db, create_tables

# Import and include routers
from src.api.routes.chat import router as chat_router
from src.api.routes.stats import router as stats_router
from src.api.routes.audit import router as audit_router
from src.api.routes.auth_routes import router as auth_router
from src.api.routes.details import router as details_router
from src.api.routes.network import router as network_router
from src.api.routes.hotspots import router as hotspots_router
from src.api.routes.insights import router as insights_router
from src.api.routes.decision_support import router as decision_router
from src.api.routes.briefing import router as briefing_router
from src.api.routes.casework import router as casework_router

app = FastAPI(title="KSP Crime AI API", description="Conversational interface for crime database")

# CORS: allow the configured origins (comma-separated) plus any Catalyst-hosted
# frontend (Slate / catalystserverless / catalystappsail domains) via a regex,
# so the deployed frontend can call the API without hard-coding its exact URL.
_cors_origins = os.getenv("KSP_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(",") if o.strip()]

# Matches https://<anything>.slate.in / .catalystserverless.com / .catalystappsail.in
# / .zohostratus.com (Catalyst-hosted frontends). Override via KSP_CORS_ORIGIN_REGEX.
_default_regex = r"https://([a-z0-9-]+\.)*(slate\.in|catalystserverless\.com|catalystappsail\.in|zohostratus\.com)"
ALLOWED_ORIGIN_REGEX = os.getenv("KSP_CORS_ORIGIN_REGEX", _default_regex)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """Ensure tables exist, auto-seed a fresh DB, and warm up the LLM."""
    import logging
    create_tables()

    # Ensure the NLP model is usable. If scikit-learn is installed but the shipped
    # model couldn't be loaded (e.g. a version mismatch), retrain it in memory.
    # If scikit-learn isn't installed at all (e.g. the slim cloud build), the
    # classifier transparently uses a keyword-based fallback — nothing to do.
    try:
        from src.nlp.intent_classifier import nlp_service, SKLEARN_AVAILABLE
        if SKLEARN_AVAILABLE and not nlp_service.is_trained:
            logging.info("NLP model not loaded — training in memory...")
            from src.nlp.train_model import create_training_data
            X, y = create_training_data()
            try:
                nlp_service.train(X, y)  # fits; save may fail on read-only FS (fine)
            except Exception:
                pass  # in-memory model is already fitted
        elif not SKLEARN_AVAILABLE:
            logging.info("scikit-learn not installed — using keyword intent classifier.")
    except Exception as e:
        logging.warning(f"NLP init warning: {e}")

    # Auto-seed on a fresh/empty database (e.g. ephemeral cloud hosts that
    # don't persist SQLite). Deterministic dataset; runs only when empty.
    if os.getenv("KSP_AUTOSEED", "true").lower() != "false":
        try:
            from src.database.session import SessionLocal
            from src.database.models import Crime
            db = SessionLocal()
            empty = db.query(Crime).count() == 0
            db.close()
            if empty:
                logging.info("Empty database detected — seeding narrative dataset...")
                import generate_narrative_data
                generate_narrative_data.main()
        except Exception as e:
            logging.warning(f"Auto-seed skipped/failed: {e}")

        # Project the analytics data into the official FIR schema (system of
        # record). Runs when the official CaseMaster table is empty but source
        # crimes exist — keeps the deployed DB schema-compliant automatically.
        try:
            from src.database.session import SessionLocal
            from src.database.models import Crime
            from src.database.models_fir import CaseMaster
            db = SessionLocal()
            needs_projection = db.query(Crime).count() > 0 and db.query(CaseMaster).count() == 0
            db.close()
            if needs_projection:
                logging.info("Projecting data into official FIR schema...")
                import migrate_to_fir_schema
                migrate_to_fir_schema.main()
        except Exception as e:
            logging.warning(f"FIR-schema projection skipped/failed: {e}")

    # Pre-load the Ollama model in the background so the first query is fast.
    if os.getenv("KSP_NLP_PROVIDER", "ollama").lower() == "ollama":
        import threading
        from src.ai import ollama_client
        from src.ai import language_provider

        def _warm():
            if ollama_client.is_available():
                ollama_client.warmup()          # load model into memory
                language_provider.warmup()      # prime the system-prompt cache

        threading.Thread(target=_warm, daemon=True).start()


# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(details_router, prefix="/api")
app.include_router(network_router, prefix="/api")
app.include_router(hotspots_router, prefix="/api")
app.include_router(insights_router, prefix="/api")
app.include_router(decision_router, prefix="/api")
app.include_router(briefing_router, prefix="/api")
app.include_router(casework_router, prefix="/api")


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """Health check endpoint that verifies database connectivity."""
    try:
        # Execute a simple query to check database
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


# ---- Serve the React frontend from the SAME origin (no CORS) ---------------
# The production build is copied into ./static before deploy. Serving it here
# means the browser calls /api/... on the same host as the app, so there is no
# cross-origin preflight (which the Catalyst gateway intercepts). If the build
# isn't present (pure-API/local runs), we just expose a simple root message.
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

_STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

if os.path.isdir(_STATIC) and os.path.isfile(os.path.join(_STATIC, "index.html")):
    # CRA emits hashed assets under /static — mount them directly.
    _assets = os.path.join(_STATIC, "static")
    if os.path.isdir(_assets):
        app.mount("/static", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve a real file if it exists, else index.html (client-side routing)."""
        candidate = os.path.join(_STATIC, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_STATIC, "index.html"))
else:
    @app.get("/")
    async def root():
        return JSONResponse({"message": "KSP Crime AI API is running"})


if __name__ == "__main__":
    # Catalyst AppSail provides the port via X_ZOHO_CATALYST_LISTEN_PORT.
    port = int(os.getenv("X_ZOHO_CATALYST_LISTEN_PORT", os.getenv("PORT", "8004")))
    uvicorn.run(app, host="0.0.0.0", port=port)
