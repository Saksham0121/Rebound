from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from app.database import get_db
from app.models import RecoveryLedger

router = APIRouter()

@router.get("/ledger")
async def get_ledger(limit: int = 50, db: AsyncSession = Depends(get_db)):
    stmt = select(RecoveryLedger).order_by(desc(RecoveryLedger.created_at)).limit(limit)
    result = await db.execute(stmt)
    events = result.scalars().all()
    
    return [
        {
            "event_id": e.event_id,
            "payment_id": e.payment_id,
            "status": e.status,
            "diagnosis": e.diagnosis,
            "policy_decision": e.policy_decision,
            "dispatch_result": e.dispatch_result,
            "created_at": e.created_at.isoformat() if e.created_at else None
        }
        for e in events
    ]
