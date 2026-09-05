import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, ShieldCheck, Zap, AlertTriangle, CheckCircle2,
  AlertCircle, Loader2, ChevronDown, ChevronRight,
  TrendingUp, Clock, XCircle, RefreshCw
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart,
  Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'

/* ─── Constants ──────────────────────────────────────────────────────────── */
const DIAGNOSIS_META = {
  TRANSIENT_CONGESTION:  { color: '#6366f1', bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/30', label: 'Transient Congestion',  desc: 'Temporary network or gateway overload. Safe to retry immediately.' },
  LIQUIDITY_EXHAUSTION:  { color: '#f59e0b', bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',  label: 'Liquidity Exhaustion',  desc: 'Insufficient funds. Retry will fail — send rescue payment link.' },
  MANDATE_DEGRADED:      { color: '#8b5cf6', bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/30', label: 'Mandate Degraded',      desc: 'Recurring mandate revoked or expired. Re-registration required.' },
  HARD_DECLINE:          { color: '#ef4444', bg: 'bg-rose-500/10',    text: 'text-rose-400',    border: 'border-rose-500/30',   label: 'Hard Decline',          desc: 'Permanent issuer block. No automated recovery possible.' },
  DISPUTED_CHARGE:       { color: '#f97316', bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30', label: 'Disputed Charge',       desc: 'Fraud or chargeback risk detected. Immediate human escalation.' },
}

const POLICY_META = {
  APPROVE_RETRY:            { color: '#10b981', label: 'Auto-Retry',       desc: 'System will automatically re-attempt the charge.' },
  APPROVE_RESCUE_LINK:      { color: '#6366f1', label: 'Rescue Link',      desc: 'A payment recovery link was sent to the customer.' },
  REQUIRE_AFA:              { color: '#8b5cf6', label: 'AFA Required',     desc: 'Transaction needs Additional Factor of Authentication.' },
  REJECT_QUOTA_EXCEEDED:    { color: '#ef4444', label: 'Quota Exceeded',   desc: 'Max retry attempts reached. No further retries allowed.' },
  STOP_AND_ESCALATE:        { color: '#f97316', label: 'Escalated',        desc: 'Blocked by policy engine. Requires human review.' },
  SCHEDULE_NOTICE_AND_WAIT: { color: '#f59e0b', label: 'Waiting Notice',   desc: 'RBI 24h pre-debit notice window not yet elapsed.' },
}

const STATUS_META = {
  COMPLETED:            { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: CheckCircle2, label: 'Recovered' },
  PENDING_REASONING:    { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',       icon: Loader2,      label: 'Analyzing' },
  PENDING_VERIFICATION: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',       icon: Clock,        label: 'Pending' },
  ESCALATED:            { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30',          icon: AlertCircle,  label: 'Escalated' },
  STOP_AND_ESCALATE:    { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30',          icon: AlertCircle,  label: 'Escalated' },
}

const SCENARIOS = [
  { method: 'upi',        amount: 4990000, error_code: 'GATEWAY_ERROR',        error_reason: 'Payment gateway timeout' },
  { method: 'upi',        amount: 7500000, error_code: 'NETWORK_ERROR',        error_reason: 'Network congestion, retry recommended' },
  { method: 'upi',        amount: 1200000, error_code: 'INSUFFICIENT_BALANCE', error_reason: 'Low account balance' },
  { method: 'upi',        amount:  500000, error_code: 'GATEWAY_TIMEOUT',      error_reason: 'Transient gateway failure' },
  { method: 'card',       amount: 2200000, error_code: 'SUSPECTED_FRAUD',      error_reason: 'Unauthorized transaction suspected' },
  { method: 'card',       amount:  800000, error_code: 'BANK_ERROR',           error_reason: 'Insufficient funds in account' },
  { method: 'emandate',   amount: 8990000, error_code: 'MANDATE_REVOKED',      error_reason: 'Autopay mandate revoked by customer' },
  { method: 'upi',        amount: 6000000, error_code: 'INSUFFICIENT_BALANCE', error_reason: 'Account balance too low for this transaction' },
  { method: 'card',       amount: 3400000, error_code: 'GATEWAY_ERROR',        error_reason: 'Issuer bank gateway down, retry in 60s' },
  { method: 'netbanking', amount:  950000, error_code: 'NETWORK_ERROR',        error_reason: 'Bank network congestion' },
]

/* ─── Custom Tooltip ─────────────────────────────────────────────────────── */
function PieTooltipContent({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-white font-semibold">{d.name}</p>
      <p className="text-slate-300">{d.value} event{d.value !== 1 ? 's' : ''}</p>
    </div>
  )
}

/* ─── App Component ──────────────────────────────────────────────────────── */
export default function App() {
  const [events, setEvents] = useState([])
  const [triggering, setTriggering] = useState(false)
  const [expandedRow, setExpandedRow] = useState(null)

  useEffect(() => {
    const fetchLedger = () =>
      fetch('http://localhost:8000/api/ledger')
        .then(r => r.json())
        .then(setEvents)
        .catch(() => {})
    fetchLedger()
    const id = setInterval(fetchLedger, 2000)
    return () => clearInterval(id)
  }, [])

  /* derived stats */
  const stats = useMemo(() => {
    const completed = events.filter(e => e.status === 'COMPLETED').length
    const escalated = events.filter(e => ['ESCALATED', 'STOP_AND_ESCALATE'].includes(e.status)).length
    const pending   = events.filter(e => ['PENDING_REASONING', 'PENDING_VERIFICATION'].includes(e.status)).length
    return { completed, escalated, pending, total: events.length, trv: completed * 500 }
  }, [events])

  const diagnosisPie = useMemo(() => {
    const c = {}
    events.forEach(e => { if (e.diagnosis) c[e.diagnosis] = (c[e.diagnosis] || 0) + 1 })
    return Object.entries(c).map(([k, v]) => ({ name: DIAGNOSIS_META[k]?.label || k, value: v, fill: DIAGNOSIS_META[k]?.color || '#64748b' }))
  }, [events])

  const policyBar = useMemo(() => {
    const c = {}
    events.forEach(e => { if (e.policy_decision) c[e.policy_decision] = (c[e.policy_decision] || 0) + 1 })
    return Object.entries(c).map(([k, v]) => ({ name: POLICY_META[k]?.label || k, count: v, fill: POLICY_META[k]?.color || '#64748b' }))
  }, [events])

  /* trigger */
  const triggerMockEvent = async () => {
    setTriggering(true)
    const s = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]
    try {
      await fetch('http://localhost:8000/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'mock_signature' },
        body: JSON.stringify({
          id: `evt_mock_${Math.floor(Math.random() * 10000000)}`,
          event: 'payment.failed',
          payload: { payment: { entity: { id: `pay_mock_${Math.floor(Math.random() * 10000)}`, amount: s.amount, method: s.method, error_code: s.error_code, error_reason: s.error_reason } } },
        }),
      })
    } catch (err) { console.error(err) }
    setTimeout(() => setTriggering(false), 800)
  }

  /* ─── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <Zap className="w-7 h-7 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Rebound AI</h1>
              <p className="text-slate-500 text-xs tracking-widest uppercase">Autonomous Revenue Resilience</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative rounded-full h-2 w-2 bg-emerald-500" /></span>
              Live
            </span>
            <button onClick={triggerMockEvent} disabled={triggering}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-[0_0_20px_-5px_rgba(99,102,241,0.6)] active:scale-95 disabled:opacity-60">
              {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Simulate Failure
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── KPI Row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Recovery Value',     value: `₹${stats.trv.toLocaleString()}`, sub: `${stats.completed} recovered`, color: 'text-emerald-400', Icon: TrendingUp },
            { label: 'Events Processed',   value: stats.total,                      sub: 'total in ledger',              color: 'text-indigo-400',  Icon: Activity },
            { label: 'Escalated',          value: stats.escalated,                  sub: 'need human review',            color: 'text-rose-400',    Icon: AlertCircle },
            { label: 'Zero Double Charge', value: '100%',                           sub: 'ZDCI via WAL lock',            color: 'text-cyan-400',    Icon: ShieldCheck },
          ].map(({ label, value, sub, color, Icon }) => (
            <motion.div key={label} whileHover={{ y: -3 }} className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-2 right-2 opacity-[0.07]"><Icon className="w-20 h-20" /></div>
              <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-1">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
              <p className="text-slate-600 text-xs mt-1">{sub}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Charts ─────────────────────────────────────────────────────── */}
        {events.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie chart - diagnosis distribution */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                AI Diagnosis Distribution
              </h3>
              <div className="flex items-center gap-6">
                <div style={{ width: '50%', height: 180 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={diagnosisPie} cx="50%" cy="50%" innerRadius={45} outerRadius={78} dataKey="value" paddingAngle={3} stroke="none">
                        {diagnosisPie.map((entry, i) => <Cell key={i} fill={entry.fill} opacity={0.85} />)}
                      </Pie>
                      <Tooltip content={<PieTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {diagnosisPie.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.fill }} />
                        <span className="text-slate-400">{d.name}</span>
                      </div>
                      <span className="font-bold text-white">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bar chart - policy decisions */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                Policy Engine Decisions
              </h3>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={policyBar} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {policyBar.map((d, i) => <Cell key={i} fill={d.fill} opacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── Policy Legend ───────────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Policy Decision Reference</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(POLICY_META).map(([key, m]) => (
              <div key={key} className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <span className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: m.color }} />
                <div>
                  <p className="text-xs font-semibold text-white">{m.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Live Ledger ─────────────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" /> Live Ledger Stream
            </h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
              {events.length} Events &middot; Click a row to expand
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-800/40 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-800">
                  <th className="py-3 px-4 w-8" />
                  <th className="py-3 px-4 font-medium">Event ID</th>
                  <th className="py-3 px-4 font-medium">AI Diagnosis</th>
                  <th className="py-3 px-4 font-medium">Policy Decision</th>
                  <th className="py-3 px-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {events.length === 0 && (
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <td colSpan={5} className="py-16 text-center text-slate-600">
                        <div className="flex flex-col items-center gap-3">
                          <Activity className="w-10 h-10 opacity-20" />
                          <p className="text-sm">Waiting for incoming failed payments...</p>
                          <p className="text-xs">Click "Simulate Failure" to test the pipeline</p>
                        </div>
                      </td>
                    </motion.tr>
                  )}
                  {[...events].reverse().map(event => {
                    const diag = DIAGNOSIS_META[event.diagnosis]
                    const sm = STATUS_META[event.status] || STATUS_META.ESCALATED
                    const SIcon = sm.icon
                    const open = expandedRow === event.event_id

                    return (
                      <React.Fragment key={event.event_id}>
                        <motion.tr
                          initial={{ opacity: 0, backgroundColor: 'rgba(99,102,241,0.1)' }}
                          animate={{ opacity: 1, backgroundColor: 'transparent' }}
                          transition={{ duration: 0.4 }}
                          onClick={() => setExpandedRow(open ? null : event.event_id)}
                          className="border-b border-slate-800/50 hover:bg-slate-800/40 cursor-pointer transition-colors group"
                        >
                          <td className="py-3.5 px-4 text-slate-600 group-hover:text-slate-400">
                            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-400 group-hover:text-indigo-300 transition-colors">
                            {event.event_id.substring(0, 18)}…
                          </td>
                          <td className="py-3.5 px-4">
                            {diag ? (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${diag.bg} ${diag.text} ${diag.border}`}>
                                {diag.label}
                              </span>
                            ) : <span className="text-slate-600 text-xs italic">Analyzing…</span>}
                          </td>
                          <td className="py-3.5 px-4">
                            {event.policy_decision ? (
                              <span className="text-xs font-medium" style={{ color: POLICY_META[event.policy_decision]?.color || '#94a3b8' }}>
                                {POLICY_META[event.policy_decision]?.label || event.policy_decision}
                              </span>
                            ) : <span className="text-slate-600 text-xs italic">Evaluating…</span>}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${sm.cls}`}>
                              <SIcon className={`w-3 h-3 ${event.status === 'PENDING_REASONING' ? 'animate-spin' : ''}`} />
                              {sm.label}
                            </span>
                          </td>
                        </motion.tr>

                        {/* Expanded detail */}
                        <AnimatePresence>
                          {open && (
                            <motion.tr
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="border-b border-slate-800/50 bg-slate-950/60"
                            >
                              <td colSpan={5} className="px-8 py-5">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {/* Classification */}
                                  <div className={`p-4 rounded-xl border ${diag?.border || 'border-slate-700'} ${diag?.bg || 'bg-slate-800/30'}`}>
                                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${diag?.text || 'text-slate-400'}`}>AI Classification</p>
                                    <p className="text-white font-semibold text-sm">{diag?.label || event.diagnosis || '—'}</p>
                                    <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{diag?.desc || ''}</p>
                                  </div>

                                  {/* Policy */}
                                  {event.policy_decision && (() => {
                                    const pm = POLICY_META[event.policy_decision]
                                    return pm ? (
                                      <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/30">
                                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 text-slate-500">Policy Decision</p>
                                        <p className="font-semibold text-sm" style={{ color: pm.color }}>{pm.label}</p>
                                        <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{pm.desc}</p>
                                      </div>
                                    ) : null
                                  })()}

                                  {/* Reasoning */}
                                  <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
                                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 text-indigo-400">AI Reasoning</p>
                                    <p className="text-xs text-slate-300 leading-relaxed">
                                      {event.reasoning || <span className="text-slate-600 italic">Processing…</span>}
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
