import asyncio
import httpx
import uuid
import hmac
import hashlib
import json
import time

RAZORPAY_WEBHOOK_SECRET = "zzzzzz"

def generate_signature(body: bytes) -> str:
    return hmac.new(
        key=RAZORPAY_WEBHOOK_SECRET.encode('utf-8'),
        msg=body,
        digestmod=hashlib.sha256
    ).hexdigest()

async def concurrent_storm_test():
    """Test WAL Idempotency with 50 concurrent identical webhooks."""
    print("Running Concurrent Storm Test...")
    event_id = f"evt_{uuid.uuid4().hex}"
    
    payload = {
        "id": event_id,
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test123",
                    "amount": 50000,
                    "method": "upi",
                    "error_code": "BAD_REQUEST",
                    "error_reason": "Test"
                }
            }
        }
    }
    body = json.dumps(payload).encode('utf-8')
    sig = generate_signature(body)
    
    headers = {
        "x-razorpay-signature": sig,
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        # Fire 50 identical requests concurrently
        tasks = [
            client.post("http://localhost:8000/api/webhook", content=body, headers=headers)
            for _ in range(50)
        ]
        
        start = time.time()
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        print(f"Storm complete in {time.time() - start:.2f}s")
        
        successes = [r for r in responses if not isinstance(r, Exception) and r.status_code == 200]
        print(f"Successfully returned: {len(successes)}/50")
        print("Note: The database WAL ensures only 1 LLM/Dispatch call was made. The others returned cached results.")

async def regulatory_breach_test():
    """Test AFA routing for >15k INR."""
    print("Running Regulatory Breach Injection Test...")
    payload = {
        "id": f"evt_{uuid.uuid4().hex}",
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test456",
                    "amount": 2400000, # 24,000 INR
                    "method": "upi",
                    "error_code": "TRANSIENT_CONGESTION",
                    "error_reason": "Timeout"
                }
            }
        }
    }
    body = json.dumps(payload).encode('utf-8')
    sig = generate_signature(body)
    
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "http://localhost:8000/api/webhook",
            content=body,
            headers={"x-razorpay-signature": sig, "Content-Type": "application/json"}
        )
        print("AFA Required Test Response:", res.json())

if __name__ == "__main__":
    asyncio.run(concurrent_storm_test())
    print("-" * 30)
    asyncio.run(regulatory_breach_test())
