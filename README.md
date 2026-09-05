# Rebound AI - Autonomous Revenue Resilience 🚀

Rebound AI is an intelligent payment recovery and dispute management pipeline built for the **Razorpay Buildathon 2026**. It aims to solve the "leaky bucket" problem where businesses lose substantial revenue due to transient payment network failures, user errors, and complex edge cases.

Unlike traditional retry mechanisms, Rebound AI combines the reasoning capabilities of **Google's Gemini LLMs** with a **Deterministic Policy Engine**, guaranteeing that every recovery attempt is both smart and strictly compliant with financial regulations (like preventing double-charging).

---

## 🧠 Core Philosophy & The Pipeline

The architecture is designed around the principle of **AI-Driven Diagnosis + Deterministic Execution**.

### The Flow:
1. **Webhook Ingestion:** Razorpay webhooks (`payment.failed`) hit our FastAPI endpoint. The system immediately verifies the HMAC signature.
2. **Concurrency Locking:** To prevent race conditions and duplicate retries, the event is locked in a PostgreSQL database using an asynchronous state machine (`PENDING_REASONING`).
3. **AI Diagnosis (Gemini 1.5 Flash):** The failed payment details (error code, reason, method, amount) are sent to the AI Diagnostic Agent. The LLM analyzes the failure and returns a structured diagnosis classification (e.g., `TRANSIENT_CONGESTION`, `HARD_DECLINE`, `USER_INTERVENTION_REQUIRED`).
4. **Policy Engine Evaluation:** The LLM's output is *never* blindly trusted to perform financial actions. It is piped into a strict Python Policy Engine. This engine enforces hard rules (e.g., maximum retry limits, regulatory cooldowns, unsupported payment methods). 
5. **Execution & Final State:** Based on the policy evaluation, the system transitions to a final state (e.g., `RECOVERED` if a retry succeeds, `STOP_AND_ESCALATE` if blocked, or `ABANDONED` if hopeless).
6. **Live Dashboard Update:** The React frontend polls the backend and visualizes the event stream and system metrics in real-time.

---

## 🛠️ Technology Stack

- **Backend:** `FastAPI`, `Python 3.13`
- **Database:** `PostgreSQL` (Async with `SQLAlchemy` & `asyncpg`)
- **AI Integration:** `google-generativeai` (Gemini 1.5 Flash/Pro)
- **Frontend:** `React.js`, `Vite`, `Tailwind CSS`, `Framer Motion` (for micro-animations)
- **Background Tasks:** `APScheduler` (for zombie lock cleanup)

---

## 🔒 Security & Resilience Features

- **Zero Double-Charge Guarantee:** Strict PostgreSQL row-level state locking ensures an event is never processed concurrently by two threads.
- **HMAC Verification:** Rejects unauthorized or spoofed webhooks instantly.
- **Fallback Mechanisms:** If the Gemini API key is missing, invalid, or the model throws a 500/404 error, the system gracefully degrades to a safe `HARD_DECLINE` status, ensuring the pipeline never crashes during a live incident.
- **Zombie Lock Sweeper:** A background cron job sweeps the database for "stuck" events (e.g., where the server crashed mid-processing) and gracefully escalates them to prevent perpetual locks.

---

## 💻 Setup & Installation

### 1. Database Setup
The application uses PostgreSQL. Ensure you have a local Postgres instance running.
```bash
# Create a local database named 'rebound'
createdb -U postgres rebound
```

### 2. Environment Configuration
Copy the template file to create your own configuration:
```bash
cp .env.example .env
```
Fill out `.env` with your actual keys:
- `DATABASE_URL`: Ensure this points to your Postgres database.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`: Your Razorpay Test Mode keys.
- `RAZORPAY_WEBHOOK_SECRET`: The secret you configured in your Razorpay Webhook dashboard.
- `GEMINI_API_KEY`: Your Google AI Studio API Key.

### 3. Backend Setup
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload
```

### 4. Frontend Setup
```bash
cd frontend
npm install

# Start the React Dashboard
npm run dev
```
Navigate to `http://localhost:5173` to see the live dashboard!

---

## 🧪 Testing & Validation Suite

Rebound AI includes a comprehensive testing suite to prove its resilience under extreme conditions.

**Note:** Ensure the backend is running before executing these scripts.

1. **Benchmark Test (Scale & LLM Consistency)**
   Generates 500 synthetic failed events and fires them into the system to measure throughput and LLM classification consistency.
   ```bash
   python scripts/generate_batch.py
   python scripts/run_benchmark.py
   ```

2. **Chaos Suite (Concurrency & Race Conditions)**
   Fires massive bursts of concurrent webhook requests for the *exact same* payment ID. This proves that our PostgreSQL locking mechanism works flawlessly and guarantees 100% Zero Double Charge Index (ZDCI).
   ```bash
   python tests/chaos_suite.py
   ```

---
*Built with ❤️ for Razorpay Buildathon 2026*
