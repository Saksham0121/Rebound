from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from app.database import Base

class RecoveryLedger(Base):
    __tablename__ = "recovery_ledger"

    event_id = Column(String, primary_key=True, index=True)
    payment_id = Column(String, nullable=False)
    status = Column(String, nullable=False, default='PENDING_REASONING')
    diagnosis = Column(String, nullable=True)
    policy_decision = Column(String, nullable=True)
    dispatch_result = Column(String, nullable=True)
    lock_heartbeat = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
