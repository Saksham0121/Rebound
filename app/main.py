from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB (in production, use Alembic instead)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="Revenue Resilience AI", lifespan=lifespan)

@app.get("/")
def read_root():
    return {"message": "Welcome to Revenue Resilience AI API"}
