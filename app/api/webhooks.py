from fastapi import APIRouter, Request, HTTPException, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
import hmac
import hashlib
import os
import json
import structlog

from app.database import get_db
from app.services.recovery_flow import process_payment_failure

router = APIRouter()
logger = structlog.get_logger()

RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "zzzzzz")

def verify_razorpay_signature(body: bytes, signature: str) -> bool:
    if not signature:
        return False
    expected_mac = hmac.new(
        key=RAZORPAY_WEBHOOK_SECRET.encode('utf-8'),
        msg=body,
        digestmod=hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected_mac, signature)

@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None),
    db: AsyncSession = Depends(get_db)
):
    body = await request.body()
    
    # 1. HMAC Verification (Security Requirement)
    if not verify_razorpay_signature(body, x_razorpay_signature):
        logger.warning("Invalid webhook signature attempt")
        raise HTTPException(status_code=400, detail="Invalid signature")
        
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
        
    event_id = payload.get("id")
    event_type = payload.get("event")
    
    # Only process failure events
    if event_type not in ["payment.failed", "subscription.halted"]:
        return {"status": "ignored", "reason": "Event type not handled"}
        
    try:
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        payment_id = payment_entity.get("id", "unknown_payment")
        amount = payment_entity.get("amount", 0) / 100  # Convert paise to INR
        method = payment_entity.get("method", "upi")
        error_code = payment_entity.get("error_code", "UNKNOWN")
        error_reason = payment_entity.get("error_reason", "UNKNOWN")
        
        # Simulate retries used (in real life, fetch from DB or metadata)
        retries_used = 0 
        
        status = await process_payment_failure(
            event_id=event_id,
            payment_id=payment_id,
            amount_inr=int(amount),
            payment_method=method,
            error_code=error_code,
            error_reason=error_reason,
            retries_used=retries_used,
            db=db
        )
        
        return {"status": status}
    except Exception as e:
        logger.error("Error processing webhook", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
