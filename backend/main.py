from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="KSP Crime AI API", description="Conversational interface for crime database")

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "KSP Crime AI API is running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)