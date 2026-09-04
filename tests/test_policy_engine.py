import pytest
from datetime import datetime, timedelta
from app.policy_engine import (
    check_economic_floor,
    check_network_quota,
    check_rbi_notice_window,
    requires_afa,
    evaluate,
    PolicyDecision,
    ECONOMIC_FLOOR_INR,
    AFA_REQUIRED_THRESHOLD_INR,
    MAX_RETRIES_UPI,
    MAX_RETRIES_CARD
)

def test_check_economic_floor():
    assert check_economic_floor(ECONOMIC_FLOOR_INR) is True
    assert check_economic_floor(ECONOMIC_FLOOR_INR + 10) is True
    assert check_economic_floor(ECONOMIC_FLOOR_INR - 10) is False

def test_check_network_quota():
    assert check_network_quota("upi", MAX_RETRIES_UPI - 1) is True
    assert check_network_quota("upi", MAX_RETRIES_UPI) is False
    assert check_network_quota("card", MAX_RETRIES_CARD - 1) is True
    assert check_network_quota("card", MAX_RETRIES_CARD) is False

def test_check_rbi_notice_window():
    now = datetime.utcnow()
    assert check_rbi_notice_window(None) is False
    assert check_rbi_notice_window(now - timedelta(hours=23)) is False
    assert check_rbi_notice_window(now - timedelta(hours=25)) is True

def test_requires_afa():
    assert requires_afa(AFA_REQUIRED_THRESHOLD_INR) is False
    assert requires_afa(AFA_REQUIRED_THRESHOLD_INR + 1) is True

def test_evaluate_stop_and_escalate_economic_floor():
    res = evaluate("TRANSIENT_CONGESTION", 50, "upi", 0)
    assert res == PolicyDecision.STOP_AND_ESCALATE

def test_evaluate_require_afa():
    res = evaluate("TRANSIENT_CONGESTION", 20000, "upi", 0)
    assert res == PolicyDecision.REQUIRE_AFA

def test_evaluate_reject_quota_exceeded():
    res = evaluate("TRANSIENT_CONGESTION", 500, "upi", 3)
    assert res == PolicyDecision.REJECT_QUOTA_EXCEEDED

def test_evaluate_hard_decline():
    res = evaluate("HARD_DECLINE", 500, "upi", 0)
    assert res == PolicyDecision.STOP_AND_ESCALATE

def test_evaluate_mandate_degraded():
    res = evaluate("MANDATE_DEGRADED", 500, "upi", 0)
    assert res == PolicyDecision.APPROVE_RESCUE_LINK

def test_evaluate_approve_retry_upi():
    res = evaluate("TRANSIENT_CONGESTION", 500, "upi", 0)
    assert res == PolicyDecision.APPROVE_RETRY

def test_evaluate_schedule_notice_card():
    now = datetime.utcnow()
    # Missing notice or less than 24h
    res = evaluate("TRANSIENT_CONGESTION", 500, "card", 0, last_notice_sent_at=now - timedelta(hours=10))
    assert res == PolicyDecision.SCHEDULE_NOTICE_AND_WAIT

    # Notice was sent 25h ago
    res2 = evaluate("TRANSIENT_CONGESTION", 500, "card", 0, last_notice_sent_at=now - timedelta(hours=25))
    assert res2 == PolicyDecision.APPROVE_RETRY
