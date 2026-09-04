from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database import engine, Base
from app.scheduler import start_scheduler, stop_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (in production, use Alembic instead)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    start_scheduler()
    yield
    stop_scheduler()

app = FastAPI(title="Revenue Resilience AI", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo purposes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.webhooks import router as webhooks_router
from app.api.ledger import router as ledger_router

app.include_router(webhooks_router, prefix="/api")
app.include_router(ledger_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to Revenue Resilience AI API"}
