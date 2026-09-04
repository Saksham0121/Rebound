# Revenue Resilience AI - Razorpay Buildathon 2026

An AI-powered payment recovery system with absolute deterministic guarantees.

## Architecture

- **Backend**: FastAPI + PostgreSQL
- **AI**: Gemini 1.5 Pro (Strict Structured Output)
- **Policy Engine**: Pure Python Deterministic Evaluator
- **Frontend**: React + Vite + Tailwind

## Getting Started

### 1. Database Setup
Ensure you have PostgreSQL running locally:
```bash
# It expects a DB named 'rebound' on localhost:5432 with user 'postgres' and pass 'postgres'
# Create it if it doesn't exist:
createdb -U postgres rebound
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your Gemini and Razorpay API keys.

### 3. Backend Setup
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 5. Running the Benchmark & Chaos Suite
Run these in a separate terminal while the backend is running:
```bash
# Generate 500 synthetic failed events
python scripts/generate_batch.py

# Run the benchmark against the LLM + Policy Engine
python scripts/run_benchmark.py

# Run the chaos suite (concurrent storm and regulatory limit tests)
python tests/chaos_suite.py
```
