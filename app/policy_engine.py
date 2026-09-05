from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

# Configuration Constants (Derived from regulatory & network limits)
ECONOMIC_FLOOR_INR = 100
AFA_REQUIRED_THRESHOLD_INR = 15000
MAX_RETRIES_UPI = 3
MAX_RETRIES_CARD = 15
RBI_PRE_DEBIT_NOTICE_WINDOW_HOURS = 24

class PolicyDecision(Enum):
    APPROVE_RETRY = "APPROVE_RETRY"
    APPROVE_RESCUE_LINK = "APPROVE_RESCUE_LINK"
    REQUIRE_AFA = "REQUIRE_AFA"
    REJECT_QUOTA_EXCEEDED = "REJECT_QUOTA_EXCEEDED"
    STOP_AND_ESCALATE = "STOP_AND_ESCALATE"
    SCHEDULE_NOTICE_AND_WAIT = "SCHEDULE_NOTICE_AND_WAIT"

def check_economic_floor(amount_inr: int) -> bool:
    """Returns True if the amount is worth retrying economically."""
    return amount_inr >= ECONOMIC_FLOOR_INR

def check_network_quota(payment_method: str, retries_used: int) -> bool:
    """Returns True if within network retry limits."""
    limit = MAX_RETRIES_UPI if payment_method.lower() == "upi" else MAX_RETRIES_CARD
    return retries_used < limit

def check_rbi_notice_window(last_notice_sent_at: Optional[datetime]) -> bool:
    """Returns True if 24 hours have passed since the last pre-debit notice."""
    if not last_notice_sent_at:
        return False
    return datetime.utcnow() - last_notice_sent_at >= timedelta(hours=RBI_PRE_DEBIT_NOTICE_WINDOW_HOURS)

def requires_afa(amount_inr: int) -> bool:
    """Returns True if the amount exceeds the limit requiring Additional Factor of Authentication."""
    return amount_inr > AFA_REQUIRED_THRESHOLD_INR

def evaluate(
    diagnosis_classification: str,
    amount_inr: int,
    payment_method: str,
    retries_used: int,
    last_notice_sent_at: Optional[datetime] = None
) -> PolicyDecision:
    """
    Main gatekeeper function.
    No side effects, pure determinism based on the inputs.
    """
    if not check_economic_floor(amount_inr):
        return PolicyDecision.STOP_AND_ESCALATE

    if requires_afa(amount_inr):
        return PolicyDecision.REQUIRE_AFA

    if not check_network_quota(payment_method, retries_used):
        return PolicyDecision.REJECT_QUOTA_EXCEEDED
    
    if diagnosis_classification in ["HARD_DECLINE", "DISPUTED_CHARGE"]:
        return PolicyDecision.STOP_AND_ESCALATE
    
    if diagnosis_classification == "MANDATE_DEGRADED":
        return PolicyDecision.APPROVE_RESCUE_LINK
    
    if diagnosis_classification == "LIQUIDITY_EXHAUSTION":
        # For insufficient funds on non-UPI (recurring mandate), check RBI pre-debit notice
        if payment_method.lower() != "upi" and not check_rbi_notice_window(last_notice_sent_at):
            return PolicyDecision.SCHEDULE_NOTICE_AND_WAIT
        # For UPI liquidity issues, send a rescue link so customer can pay via different method
        return PolicyDecision.APPROVE_RESCUE_LINK

    # TRANSIENT_CONGESTION → always safe to retry immediately
    return PolicyDecision.APPROVE_RETRY
