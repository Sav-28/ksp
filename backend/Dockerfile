# KSP Crime AI — Backend (FastAPI)
FROM python:3.11-slim

WORKDIR /app

# System deps (kept minimal)
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Seed + train on first build if the DB/model are absent (idempotent at runtime
# is handled by the app's startup table creation; data/model are baked here).
EXPOSE 8004

# Production server. Override CMD for multiple workers behind a proxy.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004"]
