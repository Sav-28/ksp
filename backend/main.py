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
    """Ensure all database tables (including audit_logs) exist."""
    create_tables()


# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(audit_router, prefix="/api")


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
