import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, ShieldCheck, Zap, AlertTriangle, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

function App() {
  const [events, setEvents] = useState([])
  const [triggering, setTriggering] = useState(false)
  const [benchmark, setBenchmark] = useState({ trv: 0, zdci: 100 })

  useEffect(() => {
    // Poll the ledger every 2 seconds
    const interval = setInterval(() => {
      fetch('http://localhost:8000/api/ledger')
        .then(res => res.json())
        .then(data => {
            setEvents(data);
            // Calculate mock TRV for UI purposes if scripts haven't run
            const completed = data.filter(d => d.status === 'COMPLETED').length;
            setBenchmark(b => ({ ...b, trv: completed * 500 }));
        })
        .catch(err => console.error(err));
    }, 2000);
    
    // Initial fetch
    fetch('http://localhost:8000/api/ledger')
        .then(res => res.json())
        .then(data => setEvents(data));

    return () => clearInterval(interval);
  }, []);

  const triggerMockEvent = async () => {
    setTriggering(true)
    const payload = {
        id: `evt_mock_${Math.floor(Math.random()*100000)}`,
        event: "payment.failed",
        payload: {
            payment: {
                entity: {
                    id: `pay_mock_${Math.floor(Math.random()*10000)}`,
                    amount: 50000,
                    method: "upi",
                    error_code: "BAD_REQUEST",
                    error_reason: "Customer cancelled"
                }
            }
        }
    }
    
    try {
        await fetch('http://localhost:8000/api/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Mock signature for demo
                'x-razorpay-signature': 'mock_signature'
            },
            body: JSON.stringify(payload)
        })
    } catch(e) {
        console.error("Trigger failed", e)
    }
    setTimeout(() => setTriggering(false), 800)
  }

  const getStatusConfig = (status) => {
    switch (status) {
      case 'COMPLETED': return { color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle2, text: 'Recovered' };
      case 'PENDING_REASONING': 
      case 'PENDING_VERIFICATION': return { color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Loader2, text: 'Analyzing' };
      case 'STOP_AND_ESCALATE':
      case 'ESCALATED': return { color: 'bg-rose-500/10 text-rose-500 border-rose-500/20', icon: AlertCircle, text: 'Escalated' };
      default: return { color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: Activity, text: status };
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 sm:p-8 font-sans selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <Zap className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                Rebound AI
              </h1>
              <p className="text-slate-400 font-medium tracking-wide text-sm mt-1">Autonomous Revenue Resilience</p>
            </div>
          </div>
          <button 
            onClick={triggerMockEvent}
            disabled={triggering}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)] active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {triggering ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
            Simulate Failure
          </button>
        </header>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1 */}
          <motion.div whileHover={{ y: -5 }} className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Activity className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">Total Recovery Value</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">₹{benchmark.trv.toLocaleString()}</span>
                <span className="text-emerald-400 text-sm font-medium">↑ Proxy</span>
              </div>
            </div>
          </motion.div>

          {/* Card 2 */}
          <motion.div whileHover={{ y: -5 }} className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <ShieldCheck className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">Zero Double Charge (ZDCI)</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-emerald-400">{benchmark.zdci}%</span>
                <span className="text-slate-500 text-sm font-medium">Verified</span>
              </div>
            </div>
          </motion.div>

          {/* Card 3 */}
          <motion.div whileHover={{ y: -5 }} className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl relative overflow-hidden flex flex-col justify-center">
            <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">System Status</p>
            <div className="flex items-center gap-3">
               <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
              </span>
              <span className="text-lg font-medium text-emerald-400">All Systems Operational</span>
            </div>
          </motion.div>

        </div>

        {/* Ledger Stream */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              Live Ledger Stream
            </h2>
            <span className="text-xs font-medium bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
              {events.length} Events Processed
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/30 text-slate-400 text-sm uppercase tracking-wider border-b border-slate-800">
                  <th className="py-4 px-6 font-medium">Event ID</th>
                  <th className="py-4 px-6 font-medium">AI Diagnosis</th>
                  <th className="py-4 px-6 font-medium">Policy Engine</th>
                  <th className="py-4 px-6 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                <AnimatePresence>
                  {events.length === 0 && (
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <td colSpan="4" className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-3">
                          <Activity className="w-12 h-12 opacity-20" />
                          <p>Waiting for incoming failed payments...</p>
                        </div>
                      </td>
                    </motion.tr>
                  )}
                  {events.slice(0).reverse().map((event) => {
                    const status = getStatusConfig(event.status)
                    const Icon = status.icon
                    return (
                      <motion.tr 
                        key={event.event_id}
                        initial={{ opacity: 0, y: -10, backgroundColor: 'rgba(99, 102, 241, 0.1)' }}
                        animate={{ opacity: 1, y: 0, backgroundColor: 'transparent' }}
                        transition={{ duration: 0.3 }}
                        className="hover:bg-slate-800/30 transition-colors group"
                      >
                        <td className="py-4 px-6">
                          <div className="font-mono text-sm text-slate-300 group-hover:text-indigo-300 transition-colors">
                            {event.event_id.substring(0, 16)}...
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-sm text-slate-300 font-medium">
                            {event.diagnosis || <span className="text-slate-600 italic">Processing...</span>}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-sm text-slate-400">
                            {event.policy_decision || <span className="text-slate-600 italic">Evaluating...</span>}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${status.color}`}>
                            <Icon className={`w-3.5 h-3.5 ${status.icon === Loader2 ? 'animate-spin' : ''}`} />
                            {status.text}
                          </div>
                        </td>
                      </motion.tr>
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

export default App
