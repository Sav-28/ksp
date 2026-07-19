from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
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

app = FastAPI(title="KSP Crime AI API", description="Conversational interface for crime database")

# CORS: restrict to configured origins (comma-separated). Defaults to local dev.
_cors_origins = os.getenv("KSP_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """Ensure tables exist, auto-seed a fresh DB, and warm up the LLM."""
    import logging
    create_tables()

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


@app.get("/")
async def root():
    return {"message": "KSP Crime AI API is running"}


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """Health check endpoint that verifies database connectivity."""
    try:
        # Execute a simple query to check database
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004)
