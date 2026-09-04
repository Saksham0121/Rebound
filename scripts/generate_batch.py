import json
import random
import uuid
from datetime import datetime, timedelta

def generate_batch(count: int = 500, filename: str = "synthetic_batch.json"):
    events = []
    error_codes = ["BAD_REQUEST", "GATEWAY_TIMEOUT", "INSUFFICIENT_FUNDS", "DECLINED", "FRAUD_SUSPECTED"]
    methods = ["upi", "card"]
    
    for _ in range(count):
        amount = random.randint(50, 25000)
        events.append({
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "event": "payment.failed",
            "payload": {
                "payment": {
                    "entity": {
                        "id": f"pay_{uuid.uuid4().hex[:12]}",
                        "amount": amount * 100, # in paise
                        "method": random.choice(methods),
                        "error_code": random.choice(error_codes),
                        "error_reason": "Simulated failure"
                    }
                }
            },
            "created_at": int(datetime.utcnow().timestamp())
        })
        
    with open(filename, 'w') as f:
        json.dump(events, f, indent=2)
        
    print(f"Generated {count} synthetic events in {filename}")

if __name__ == "__main__":
    generate_batch()
