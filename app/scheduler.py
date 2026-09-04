import asyncio
import structlog
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.future import select
from sqlalchemy import update

from app.database import AsyncSessionLocal
from app.models import RecoveryLedger

logger = structlog.get_logger()
scheduler = AsyncIOScheduler()

async def sweep_zombie_locks():
    """
    Finds rows stuck in PENDING_REASONING with lock_heartbeat older than 120 seconds
    and flips them to STOP_AND_ESCALATE.
    """
    logger.info("Running zombie lock sweeper...")
    try:
        async with AsyncSessionLocal() as db:
            threshold = datetime.utcnow() - timedelta(seconds=120)
            
            stmt = (
                update(RecoveryLedger)
                .where(RecoveryLedger.status == 'PENDING_REASONING')
                .where(RecoveryLedger.lock_heartbeat < threshold)
                .values(status='STOP_AND_ESCALATE')
            )
            result = await db.execute(stmt)
            await db.commit()
            
            if result.rowcount > 0:
                logger.warning(f"Swept {result.rowcount} zombie locks to STOP_AND_ESCALATE")
    except Exception as e:
        logger.error("Zombie sweeper failed", exc_info=True)

def start_scheduler():
    scheduler.add_job(sweep_zombie_locks, 'interval', seconds=30)
    scheduler.start()
    logger.info("APScheduler started")

def stop_scheduler():
    scheduler.shutdown()
    logger.info("APScheduler stopped")
