import pytest
from unittest.mock import patch, MagicMock
from app.diagnostic_agent import diagnose_failure, Diagnosis
import json

@pytest.mark.asyncio
async def test_diagnose_failure_success():
    with patch("app.diagnostic_agent.genai.GenerativeModel.generate_content") as mock_generate:
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "classification": "TRANSIENT_CONGESTION",
            "confidence": 0.95,
            "reasoning": "Standard timeout error"
        })
        mock_generate.return_value = mock_response

        result = await diagnose_failure("BAD_REQUEST", "Timeout occurred", "upi")
        assert isinstance(result, Diagnosis)
        assert result.classification == "TRANSIENT_CONGESTION"
        assert result.confidence == 0.95

@pytest.mark.asyncio
async def test_diagnose_failure_fallback_on_error():
    with patch("app.diagnostic_agent.genai.GenerativeModel.generate_content") as mock_generate:
        mock_generate.side_effect = Exception("API down")

        result = await diagnose_failure("UNKNOWN", "Weird error", "card")
        assert isinstance(result, Diagnosis)
        assert result.classification == "HARD_DECLINE"
        assert result.confidence == 0.0
        assert "API down" in result.reasoning
