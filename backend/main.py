import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, query_db
from seed_data import seed_database
from routes import trains, assets, sections, maintenance, blocks, optimizer, conflicts, analytics, auth, demo, ai

app = FastAPI(
    title="IR-BlockPlan AI - Indian Railways Automatic Block Planning System",
    description="Smart India Hackathon 2026 (SIH26027) - AI-Powered Automatic Block Planning to Maximize Asset Availability for Train Operations on Indian Railways",
    version="1.0.0"
)

# CORS setup for local development and frontend client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(trains.router)
app.include_router(assets.router)
app.include_router(sections.router)
app.include_router(maintenance.router)
app.include_router(blocks.router)
app.include_router(optimizer.router)
app.include_router(ai.router)
app.include_router(conflicts.router)
app.include_router(analytics.router)
app.include_router(demo.router)

@app.on_event("startup")
def on_startup():
    # A fresh checkout should be immediately demo-ready. Seed only when the
    # database has no sections; never overwrite data on an ordinary restart.
    init_db()
    if not query_db("SELECT section_id FROM sections LIMIT 1"):
        seed_database()

@app.get("/")
def root():
    return {
        "system": "IR-BlockPlan AI",
        "organization": "Ministry of Railways / Indian Railways",
        "hackathon": "Smart India Hackathon 2026 (SIH26027)",
        "status": "Operational",
        "api_docs": "/docs",
        "demo_scenario": "/api/demo/scenario"
    }

@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "IR-BlockPlan AI Backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
