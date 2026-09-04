from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError
from datetime import datetime
import asyncio

from app.models import RecoveryLedger
from app.diagnostic_agent import diagnose_failure
from app.policy_engine import evaluate, PolicyDecision
from app.dispatcher import retry_subscription_charge, create_rescue_payment_link, create_afa_challenge_link

async def process_payment_failure(
    event_id: str,
    payment_id: str,
    amount_inr: int,
    payment_method: str,
    error_code: str,
    error_reason: str,
    retries_used: int,
    db: AsyncSession
) -> str:
    """
    Core pipeline:
    1. WAL Idempotency Lock
    2. Diagnostics (LLM)
    3. Policy Evaluation
    4. Dispatch (Stubbed for now)
    """
    
    # 1. WAL Idempotency Lock
    new_event = RecoveryLedger(
        event_id=event_id,
        payment_id=payment_id,
        status="PENDING_REASONING",
        lock_heartbeat=datetime.utcnow()
    )
    db.add(new_event)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Event already exists - return cached status
        stmt = select(RecoveryLedger).where(RecoveryLedger.event_id == event_id)
        result = await db.execute(stmt)
        existing_event = result.scalar_one_or_none()
        return existing_event.status if existing_event else "UNKNOWN"

    # From here, we exclusively own this event_id
    # 2. Diagnostic LLM Agent
    diagnosis = await diagnose_failure(error_code, error_reason, payment_method)
    
    # Update DB with diagnosis
    stmt = select(RecoveryLedger).where(RecoveryLedger.event_id == event_id).with_for_update()
    result = await db.execute(stmt)
    locked_event = result.scalar_one()
    
    locked_event.diagnosis = diagnosis.classification
    locked_event.lock_heartbeat = datetime.utcnow()
    await db.commit()
    
    # 3. Policy Engine Gatekeeper
    decision = evaluate(
        diagnosis_classification=diagnosis.classification,
        amount_inr=amount_inr,
        payment_method=payment_method,
        retries_used=retries_used,
        last_notice_sent_at=None  # Simplified for the buildathon
    )
    
    locked_event.policy_decision = decision.value
    locked_event.lock_heartbeat = datetime.utcnow()
    await db.commit()
    
    # 4. Bounded Dispatcher
    dispatch_result_data = None
    if decision == PolicyDecision.APPROVE_RETRY:
        dispatch_result_data = retry_subscription_charge("sub_fake123", event_id)
        locked_event.status = "COMPLETED"
    elif decision == PolicyDecision.APPROVE_RESCUE_LINK:
        dispatch_result_data = create_rescue_payment_link(amount_inr, event_id)
        locked_event.status = "COMPLETED"
    elif decision == PolicyDecision.REQUIRE_AFA:
        dispatch_result_data = create_afa_challenge_link(amount_inr, event_id)
        locked_event.status = "COMPLETED"
    elif decision == PolicyDecision.SCHEDULE_NOTICE_AND_WAIT:
        locked_event.status = "PENDING_VERIFICATION"
    else:
        locked_event.status = "ESCALATED"
        
    if dispatch_result_data:
        locked_event.dispatch_result = dispatch_result_data.get("action", "unknown")
        
    await db.commit()
    
    return locked_event.status
