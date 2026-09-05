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

async def diagnose_failure(error_code: str, error_reason: str, payment_method: str) -> Diagnosis:
    """
    Calls the LLM with forced structured output to classify the failure.
    Cannot execute any Razorpay APIs - strictly a classifier.
    """
    prompt = f"""
    You are an expert payments diagnostic system. Classify the following payment failure into exactly one of the allowed categories.
    
    Error Code: {error_code}
    Error Reason: {error_reason}
    Payment Method: {payment_method}
    """
    
    if not GEMINI_API_KEY:
        # Fallback mock for testing and buildathon without API keys
        if "timeout" in error_reason.lower() or "congestion" in error_code.lower():
            mock_class = "TRANSIENT_CONGESTION"
        elif "amount" in error_reason.lower() or "insufficient" in error_code.lower():
            mock_class = "LIQUIDITY_EXHAUSTION"
        else:
            mock_class = "HARD_DECLINE"
            
        return Diagnosis(
            classification=mock_class,
            confidence=0.95,
            reasoning="Mocked response due to missing GEMINI_API_KEY"
        )

    model = genai.GenerativeModel("gemini-1.5-pro")
    
    # Using response_schema to force JSON output matching our schema
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=diagnosis_schema,
            temperature=0.1
        )
    )
    
    try:
        # Pydantic validation guarantees type safety here
        data = json.loads(response.text)
        return Diagnosis(**data)
    except Exception as e:
        # Fallback for adversarial or failed LLM parsing
        return Diagnosis(
            classification="HARD_DECLINE",
            confidence=0.0,
            reasoning=f"Failed to parse LLM output: {str(e)}"
        )
