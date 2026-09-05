import os
from typing import Literal
import json
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

class Diagnosis(BaseModel):
    classification: Literal[
        "TRANSIENT_CONGESTION",
        "LIQUIDITY_EXHAUSTION",
        "MANDATE_DEGRADED",
        "HARD_DECLINE",
        "DISPUTED_CHARGE"
    ]
    confidence: float
    reasoning: str

# Create the schema for Gemini structured output
diagnosis_schema = {
    "type": "object",
    "properties": {
        "classification": {
            "type": "string",
            "enum": [
                "TRANSIENT_CONGESTION",
                "LIQUIDITY_EXHAUSTION",
                "MANDATE_DEGRADED",
                "HARD_DECLINE",
                "DISPUTED_CHARGE"
            ]
        },
        "confidence": {
            "type": "number",
            "description": "Confidence score between 0.0 and 1.0"
        },
        "reasoning": {
            "type": "string",
            "description": "Short explanation of why this classification was chosen"
        }
    },
    "required": ["classification", "confidence", "reasoning"]
}

def _rule_based_diagnosis(error_code: str, error_reason: str, payment_method: str) -> Diagnosis:
    """Rich deterministic fallback used when LLM is unavailable or errors out."""
    reason_lower = error_reason.lower()
    code_lower = error_code.lower()

    if any(x in reason_lower or x in code_lower for x in ["timeout", "congestion", "gateway", "network", "transient"]):
        return Diagnosis(
            classification="TRANSIENT_CONGESTION",
            confidence=0.92,
            reasoning=(
                f"The error '{error_reason}' on method '{payment_method}' is characteristic of a transient "
                f"network-level congestion event. The error code '{error_code}' suggests a temporary gateway "
                "overload, not a fundamental issue with the payment mandate. Policy recommends an immediate "
                "retry after a short cooldown."
            )
        )
    elif any(x in reason_lower or x in code_lower for x in ["insufficient", "balance", "funds", "low"]):
        return Diagnosis(
            classification="LIQUIDITY_EXHAUSTION",
            confidence=0.92,
            reasoning=(
                f"The error '{error_reason}' strongly indicates the customer's account has insufficient funds "
                "at this time. This is not a retryable failure via automated systems. Policy dictates "
                "sending a rescue payment link via an alternative payment method."
            )
        )
    elif any(x in reason_lower or x in code_lower for x in ["mandate", "autopay", "revoked", "debit"]):
        return Diagnosis(
            classification="MANDATE_DEGRADED",
            confidence=0.92,
            reasoning=(
                f"The error code '{error_code}' on a '{payment_method}' payment suggests the recurring "
                "mandate has been revoked or has expired. Automated retry would fail. Recommend re-presenting "
                "the mandate registration link to the customer."
            )
        )
    elif any(x in reason_lower or x in code_lower for x in ["dispute", "chargeback", "fraud", "unauthorized"]):
        return Diagnosis(
            classification="DISPUTED_CHARGE",
            confidence=0.92,
            reasoning=(
                f"The error '{error_reason}' contains signals of a potential dispute or fraud flag. "
                "Automated recovery is strictly blocked to prevent regulatory violations. "
                "Immediate escalation to the risk team is required."
            )
        )
    else:
        return Diagnosis(
            classification="HARD_DECLINE",
            confidence=0.92,
            reasoning=(
                f"The error code '{error_code}' with reason '{error_reason}' on payment method '{payment_method}' "
                "represents a hard decline from the issuing bank. This typically indicates a permanent "
                "block (stolen card, account closed, card expired). Automated retry is futile. "
                "The customer must be notified to use an alternative payment method."
            )
        )


async def diagnose_failure(error_code: str, error_reason: str, payment_method: str) -> Diagnosis:
    """
    Calls the LLM with forced structured output to classify the failure.
    Cannot execute any Razorpay APIs - strictly a classifier.
    Falls back to a rich rule-based engine if the LLM is unavailable.
    """
    prompt = f"""
    You are an expert payments diagnostic system. Classify the following payment failure into exactly one of the allowed categories.
    
    Error Code: {error_code}
    Error Reason: {error_reason}
    Payment Method: {payment_method}
    """

    if not GEMINI_API_KEY:
        return _rule_based_diagnosis(error_code, error_reason, payment_method)

    model = genai.GenerativeModel("gemini-1.5-flash")

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=diagnosis_schema,
                temperature=0.1
            )
        )
        data = json.loads(response.text)
        return Diagnosis(**data)
    except Exception:
        # LLM unavailable (quota, 404, etc.) — use rich rule-based fallback
        return _rule_based_diagnosis(error_code, error_reason, payment_method)
