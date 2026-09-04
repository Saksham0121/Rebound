# Revenue Resilience AI — Full Build Plan & Technical Guide
### Razorpay Buildathon 2026 — Track 03: AI Revenue Recovery

---

## 0. How to use this document

This is a complete, feature-by-feature engineering guide: what to build, in what order, with what tech stack, how data flows through the system, and how to keep it secure. It's written so you (or anyone on your team) can pick up any single section and start building without needing the rest of the context.

**Recommended build order:** follow the Roadmap (Section 2) top to bottom. Each feature section (Section 4 onward) is self-contained but assumes the previous phase exists.

---

## 1. Tech Stack (final decision, with reasoning)

| Layer | Choice | Why |
|---|---|---|
| Backend framework | **FastAPI** (Python 3.11+) | Async-native (important for webhook ingestion under load), auto-generates OpenAPI docs for judges to poke at, native Pydantic integration for strict schema validation |
| Database | **PostgreSQL** (or SQLite if solo/offline dev) | Needs real ACID transactions + `UNIQUE` constraints for the WAL idempotency store. SQLite is fine for local demo; Postgres if deploying |
| ORM / DB access | **SQLAlchemy 2.0 (async)** + **Alembic** for migrations | Explicit control over transaction isolation levels, which you need for the idempotency guarantees |
| Schema validation | **Pydantic v2** | Enforces the "LLM output must be typed, not freeform text" boundary — this is your core safety story |
| LLM provider | **Anthropic Claude API** (or OpenAI) via structured output / tool-use mode | Use **tool calling / forced JSON schema**, never free-text parsing, for the diagnostic head |
| Task queue | **Celery + Redis**, or **APScheduler** if scope is tight | For delayed retries (temporal resequencing, liquidity-aware delay) — you need real scheduled jobs, not `time.sleep()` |
| Payments integration | **Razorpay Python SDK** + Razorpay **Test Mode** keys | Sandbox supports subscriptions, payment links, webhooks — enough for a live demo |
| Webhook security | **HMAC SHA-256** verification (`razorpay.utility` or manual `hmac.compare_digest`) | Non-negotiable — see Security section |
| Frontend/dashboard | **React + Tailwind** (Vite), or plain HTML+HTMX if time is short | Live ledger view, benchmark numbers, event stream |
| Realtime updates to dashboard | **WebSocket** (FastAPI native) or simple polling | Polling is fine and far less risky under demo-day time pressure |
| Testing | **pytest** + **pytest-asyncio** + `threading`/`asyncio.gather` for concurrency tests | Needed for the chaos suite (concurrent storm test) |
| Deployment (optional) | **Railway / Render / Fly.io** for a live URL, Docker for reproducibility | Not essential — localhost demo is fine, but a live URL impresses judges |
| Secrets management | `.env` + `python-dotenv`, **never committed** | See Security section |
| Observability | Simple structured logging (`structlog`) + a `recovery_ledger` table doubling as your audit trail | The audit trail IS a feature the track explicitly asks for — don't bolt it on as an afterthought |

**Why not Node/Express?** Nothing wrong with it, but Python gives you Pydantic (critical for the LLM-boundary story) and the Razorpay Python SDK is mature. Pick what your team knows fastest — speed matters more than the "ideal" stack in a buildathon.

---

## 2. Full Roadmap (dependency-ordered)

```
Day 1 AM   → Repo skeleton + WAL Idempotency Store + concurrency test
Day 1 PM   → Deterministic Policy Engine + unit tests per rule
Day 1 Eve  → Diagnostic LLM Agent (typed, read-only)
Day 2 AM   → Bounded Action Dispatcher + Razorpay sandbox integration
Day 2 Mid  → Evaluation harness + synthetic 500-scenario batch
Day 2 PM   → Dashboard (event stream, ledger, live benchmark numbers)
Day 2 Eve  → Chaos suite (concurrent storm, zombie lock, 504 timeout)
Day 3 AM   → Security hardening pass + README + pitch deck
Day 3      → Rehearse live demo script + panel defense answers
```

Treat everything past Phase 6 (dashboard) as optional stretch — a working ledger + policy engine + one live Razorpay sandbox call is already a stronger demo than most teams will bring.

---

## 3. High-Level System Flow

```
                     ┌─────────────────────────┐
  Razorpay Webhook →  │ 1. HMAC Verification    │
  (payment.failed,    │    (reject if invalid)  │
   subscription.halted)└──────────┬──────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │ 2. WAL Idempotency Lock │
                     │  INSERT event_id (PK)   │
                     │  duplicate? → return    │
                     │  cached state, STOP     │
                     └──────────┬──────────────┘
                                ▼ (new event only)
                     ┌─────────────────────────┐
                     │ 3. Diagnostic LLM Agent │
                     │  input: error_code, etc │
                     │  output: typed enum      │
                     │  NO execution authority  │
                     └──────────┬──────────────┘
                                ▼
                     ┌─────────────────────────┐
                     │ 4. Deterministic Policy │
                     │    Engine (gatekeeper)  │
                     │  - economic floor?      │
                     │  - retry quota left?    │
                     │  - RBI 24h window OK?   │
                     │  - AFA required?        │
                     └──────────┬──────────────┘
                        approve │  reject → STOP_AND_ESCALATE
                                ▼
                     ┌─────────────────────────┐
                     │ 5. Bounded Dispatcher   │
                     │  calls Razorpay SDK     │
                     │  (retry / payment link  │
                     │   / AFA challenge link) │
                     └──────────┬──────────────┘
                                ▼
                     ┌─────────────────────────┐
                     │ Ledger updated → status │
                     │ COMPLETED / PENDING_VER │
                     │ Dashboard reflects live │
                     └─────────────────────────┘
```

**The one rule that matters most:** arrows only point one direction. The LLM (step 3) never talks to step 5 directly. Every path from "diagnosis" to "money movement" passes through step 4. If a judge asks "what if the LLM hallucinates," your answer is "it physically cannot dispatch anything — it can only label."

---

## 4. Feature-by-Feature Build Guide

### 4.1 WAL Idempotency Store

**What it does:** Guarantees that no payment event is ever processed twice, even under concurrent webhook delivery or retries.

**How to build it:**
1. Table `recovery_ledger`:
   ```sql
   CREATE TABLE recovery_ledger (
     event_id TEXT PRIMARY KEY,
     payment_id TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'PENDING_REASONING',
     diagnosis TEXT,
     policy_decision TEXT,
     dispatch_result TEXT,
     lock_heartbeat TIMESTAMP DEFAULT now(),
     created_at TIMESTAMP DEFAULT now(),
     updated_at TIMESTAMP DEFAULT now()
   );
   ```
2. On webhook receipt, attempt `INSERT ... ON CONFLICT (event_id) DO NOTHING`. If zero rows affected → event already seen → fetch and return the cached row's `status`/`dispatch_result` instead of re-processing.
3. Wrap the insert + downstream state transitions in a single DB transaction per event where possible; use `SELECT ... FOR UPDATE` if you need to lock a row across multiple steps (e.g., while waiting on the LLM call).
4. **Zombie lock sweeper:** a background job (APScheduler, runs every 30s) that finds rows stuck in `PENDING_REASONING` with `lock_heartbeat` older than 120 seconds and flips them to `STOP_AND_ESCALATE`. This is what makes your "LLM hangs mid-inference" chaos test pass.

**Tech:** PostgreSQL/SQLite + SQLAlchemy. Use the database's native unique constraint — do not implement idempotency in application code with a `SELECT` then `INSERT` (classic race condition; the constraint must do the work).

**Test to prove it:** 50 threads/async tasks fire the identical `event_id` simultaneously. Assert exactly 1 row exists, exactly 1 downstream dispatch call was made (mock the Razorpay client and count invocations).

---

### 4.2 Deterministic Policy Engine

**What it does:** The single gatekeeper between "the LLM thinks this is X" and "money moves." Pure functions, no LLM calls, no randomness.

**How to build it:**
- A plain Python module, e.g. `policy_engine.py`, with one function per invariant:
  ```python
  def check_economic_floor(amount_inr: int) -> bool:
      return amount_inr >= 100

  def check_network_quota(payment_method: str, retries_used: int) -> bool:
      limit = 3 if payment_method == "upi" else 15
      return retries_used < limit

  def check_rbi_notice_window(last_notice_sent_at: datetime) -> bool:
      return datetime.utcnow() - last_notice_sent_at >= timedelta(hours=24)

  def requires_afa(amount_inr: int) -> bool:
      return amount_inr > 15000
  ```
- A top-level `evaluate(diagnosis, context) -> PolicyDecision` function that runs all relevant checks and returns a typed decision object (`APPROVE_RETRY`, `APPROVE_RESCUE_LINK`, `REQUIRE_AFA`, `REJECT_QUOTA_EXCEEDED`, `STOP_AND_ESCALATE`).
- Keep every threshold (₹100 floor, ₹15,000 AFA cap, 15/30-day and 10/24h network limits, 24h RBI notice) as **named constants at the top of the file**, not magic numbers — judges will ask you to point at the RBI rule, and you want to point at one line.

**Tech:** Pure Python, no external dependencies needed. `pytest` for unit tests — one test per invariant, plus edge cases (exactly ₹15,000, exactly at the retry limit).

**Why this is the most important file in the repo:** this is your entire pitch's credibility. Spend disproportionate time making sure every branch has a test and every constant is traceable to a real rule you can cite.

---

### 4.3 Diagnostic LLM Agent (advisory, read-only)

**What it does:** Classifies a failure event into one of five typed categories. Cannot call any API that mutates payment state.

**How to build it:**
1. Define the Pydantic schema:
   ```python
   class Diagnosis(BaseModel):
       classification: Literal[
           "TRANSIENT_CONGESTION", "LIQUIDITY_EXHAUSTION",
           "MANDATE_DEGRADED", "HARD_DECLINE", "DISPUTED_CHARGE"
       ]
       confidence: float
       reasoning: str  # short, for audit trail — not used for decisions
   ```
2. Call the LLM with **forced structured output** (Claude tool-use with a matching input schema, or OpenAI's `response_format=json_schema`). Never regex-parse free text.
3. Give it only the fields it needs: `error_code`, `error_source`, `error_reason`, `error_step`, maybe `time_of_day` and `payment_method`. Do not give it API credentials, account balances, or anything beyond the diagnostic inputs.
4. **Architecturally enforce the boundary**: put this agent in its own module/process with no import of `razorpay_client.py`. If someone tries to call the Razorpay SDK from inside the agent file, that's a code smell your own linter/review should catch. Bonus points if you can show this separation in your architecture diagram and in your actual file structure during the demo.

**Tech:** Anthropic or OpenAI SDK, Pydantic v2, a handful of curated example failure strings for testing (write 30–50 by hand based on real UPI/card decline codes — U30, ZK, Z9 — since you won't have live merchant telemetry).

**Test to prove it:** feed it ambiguous/adversarial inputs (garbled error strings, prompt-injection-style text embedded in `error_reason`) and assert it still returns a valid typed enum or a safe fallback — never freeform text, never an unhandled exception that could leave a ledger row stuck.

---

### 4.4 Bounded Action Dispatcher (Razorpay Integration)

**What it does:** The only component allowed to call Razorpay's mutating endpoints, and only after Policy Engine approval.

**How to build it:**
1. Get Razorpay **test mode** API keys from the dashboard (Settings → API Keys). Test mode gives you fake money, real API shapes.
2. Implement three dispatch actions, each gated by a matching `PolicyDecision`:
   - `retry_subscription_charge(subscription_id)` → `POST /v1/subscriptions/{id}/retry` — only if `APPROVE_RETRY`
   - `create_rescue_payment_link(amount, customer)` → `POST /v1/payment_links` — only if `APPROVE_RESCUE_LINK`
   - `create_afa_challenge_link(amount, customer)` → payment link with `authentication` flags set — only if `REQUIRE_AFA`
3. Wrap every dispatch call with an idempotency key of your own (`event_id`) passed as a note/reference field where Razorpay's API allows it, so even a duplicate dispatch attempt (e.g., after a timeout retry on your side) is traceable back to the same event.
4. On HTTP 504/timeout from Razorpay: set ledger status to `PENDING_VERIFICATION`, then poll the resource's status endpoint before ever attempting to recreate it. Never blindly retry a POST that creates a resource.

**Tech:** `razorpay` Python SDK, `httpx` if you need custom timeout/retry handling the SDK doesn't expose.

**Test to prove it:** mock a 504 from Razorpay mid-payment-link-creation, assert the engine queries status instead of re-POSTing, and assert no duplicate payment link is created.

---

### 4.5 Predictive Temporal Resequencer & Liquidity-Aware Delay (stretch feature)

**What it does:** Instead of retrying at T+1/T+2/T+3 blindly, reschedules retries to better time windows.

**How to build it (realistically, without real bank telemetry):**
- Be honest in your pitch: you won't have live core-banking-switch telemetry as an outside participant. Simulate it with a lookup table of historical success-rate-by-hour (you can hardcode a plausible curve: lower 7–10 PM IST, higher 10 AM–1 PM) and schedule retries against that curve.
- For liquidity-aware delay: a simple rule — if `LIQUIDITY_EXHAUSTION` diagnosis, delay retry to the next of {1st, 5th, last working day of month}, computed with a basic calendar function (skip weekends).
- Use **APScheduler** or **Celery beat** to actually schedule the delayed job — don't fake this with a `sleep()`. A real scheduled job you can show firing later is much more convincing live.

**Tech:** APScheduler (simplest) or Celery + Redis (more "production" looking but more setup risk — pick based on your team's comfort under time pressure).

---

### 4.6 Evaluation Harness (TRV / NRE / ZDCI)

**What it does:** Produces the benchmark table — this is literally "the bar" the track description asks for.

**How to build it:**
1. Write a generator script that produces ~500 synthetic failure events with realistic field distributions (mix of UPI/card, mix of error codes, random amounts skewed toward typical subscription price points, random timestamps).
2. Run three pipelines over the same batch:
   - **Naive baseline**: fixed T+1/T+2/T+3 retry, no policy engine.
   - **Human-dunning simulation**: a slower, lower-success-rate stub function (parameterize its success rate/delay from published churn-recovery benchmarks you can cite, or clearly label it as an illustrative assumption).
   - **Your engine**: full pipeline.
3. Compute the three formulas from the doc (TRV, NRE, ZDCI) directly from the ledger rows each run produces — not typed in by hand.
4. Output a markdown/JSON report + feed the same numbers into the dashboard.

**Tech:** plain Python script (`pandas` optional for aggregation), output to CSV/JSON that the dashboard reads.

**Be ready to say out loud:** "this is a synthetic benchmark on generated data, methodology is in `generate_batch.py`, here's the script live" — pre-empting the "are these numbers real" question is a credibility win, not a weakness to hide.

---

### 4.7 Dashboard

**What it does:** Lets judges *see* the pipeline working instead of reading logs.

**How to build it:**
- Simplest viable version: a single-page app polling `GET /api/ledger` every 2 seconds, rendering a table of recent events with live status badges (color-coded: green=COMPLETED, yellow=PENDING, red=ESCALATED).
- A second panel showing the benchmark numbers (TRV, NRE, ZDCI, recovery rate) pulled from your evaluation harness output.
- A "fire test event" button that POSTs a synthetic webhook to your own ingestion endpoint — lets you trigger the demo live without needing a terminal.

**Tech:** React + Tailwind (Vite) if you have frontend bandwidth; otherwise a single HTML file with HTMX or vanilla `fetch` polling is genuinely fine for a buildathon demo.

---

### 4.8 Chaos / Adversarial Test Suite

**What it does:** Proves the safety claims instead of just asserting them in a doc.

**Tests to actually implement:**
1. **Concurrent storm** — described in 4.1.
2. **Zombie lock sweeper** — described in 4.1.
3. **Gateway 504 emulation** — described in 4.4.
4. **Regulatory breach injection** — POST a ₹24,000 auto-debit event, assert the Policy Engine rejects it and an AFA link path is triggered instead of a hard decline.

Run all four live if you can, or record a short terminal screen-capture as backup in case live demo networking fails (very common failure mode at buildathons — always have a recorded fallback).

---

## 5. Security Guide (build this in, don't bolt it on)

| Concern | What to do |
|---|---|
| **Webhook authenticity** | Verify every incoming webhook's HMAC SHA-256 signature against your Razorpay webhook secret before touching the payload. Use `hmac.compare_digest`, never `==`, to avoid timing attacks. Reject anything that fails verification with a 400 and log it — don't silently drop it. |
| **Secrets** | All API keys (Razorpay, LLM provider) go in `.env`, loaded via `python-dotenv`. Add `.env` to `.gitignore` **before your first commit**. Never hardcode keys in code you might paste into a slide or push to a public repo. |
| **LLM never gets credentials** | The diagnostic agent's prompt/context must never include API keys, full card numbers, or customer PII beyond what's needed to classify the failure. Pass masked/tokenized identifiers only. |
| **LLM never gets execution tools** | Architecturally: the agent process/module should have no network access to Razorpay's mutating endpoints — enforce this in code structure, and mention it explicitly as a design decision when defending the build. |
| **Idempotency at the DB layer, not app layer** | As in 4.1 — the uniqueness guarantee must come from a database constraint, not an if-check in Python, or a race condition defeats your whole "zero double charge" claim. |
| **Least-privilege API keys** | Use Razorpay test-mode keys scoped only to what you need; don't reuse a personal/production key for the demo. |
| **Rate limiting on your own webhook endpoint** | Add basic rate limiting (e.g., `slowapi` for FastAPI) so a malicious or misbehaving sender can't flood your ledger — good practice to mention even if you don't fully implement it. |
| **Audit trail immutability** | Treat `recovery_ledger` rows as append-mostly: update status fields, but keep a separate `ledger_events` append-only log table if you want a true audit trail a judge could ask to see. |
| **PII handling** | Mask customer phone numbers/emails in logs and in the dashboard (show last 4 digits only). This is a small touch that signals production-mindedness. |
| **Dependency hygiene** | Pin versions in `requirements.txt`, run `pip-audit` once before submission if time allows — cheap way to avoid an embarrassing known-CVE dependency in a security-adjacent pitch. |

---

## 6. Proof Plan — What to Actually Demonstrate Live

Judges remember what moves on screen. Structure your live demo as a script, in this order:

1. **Fire a normal failure webhook** → show it flow through diagnosis → policy → dispatch → ledger status updates live on dashboard.
2. **Fire the exact same webhook again (duplicate)** → show it gets rejected at the WAL layer, no second Razorpay call is made (show your mock/log counter).
3. **Fire an over-limit auto-debit (₹24,000)** → show the Policy Engine blocking the auto-debit and generating an AFA challenge link instead of a hard decline.
4. **Kill/hang the LLM call mid-request** (simulate with a deliberate delay) → show the zombie-lock sweeper catch it after ~120s and mark it `STOP_AND_ESCALATE` without corrupting the ledger.
5. **Run the evaluation script live** → show TRV/NRE/ZDCI numbers being computed from the ledger in front of them, not pasted from a slide.
6. **Close with the architecture diagram** (Section 3) and the one-line thesis: *"the LLM only labels, the policy engine only gates, the database only allows one write per event — that's what makes zero-double-charge a guarantee, not a hope."*

If your live environment risks failing on stage (flaky wifi, sandbox rate limits), record a 90-second screen capture of steps 1–5 as backup and say so upfront if you switch to it — judges respect honesty about demo risk far more than a silent cut to slides.

---

## 7. What to Explicitly Scope Out (and say so)

Be upfront in your pitch about what's roadmap vs. built:
- Hinglish WhatsApp/voice PTP negotiation agent — complex NLU + telephony integration, likely out of scope for the timebox. Mention as future work.
- Real bank-switch telemetry for the temporal resequencer — you're simulating with a plausible success-rate curve, not live data.
- Checkout drop-off recovery — a track example direction not covered by this build; either fold in a lightweight version or acknowledge it as unaddressed.

Judges trust teams more when the "not built yet" list is explicit and confident, not hidden.
