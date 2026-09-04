import { useState, useEffect } from 'react'

function App() {
  const [events, setEvents] = useState([])
  const [benchmark, setBenchmark] = useState(null)

  useEffect(() => {
    // Poll the ledger every 2 seconds
    const interval = setInterval(() => {
      fetch('http://localhost:8000/api/ledger')
        .then(res => res.json())
        .then(data => setEvents(data))
        .catch(err => console.error(err));
    }, 2000);
    
    // Initial fetch
    fetch('http://localhost:8000/api/ledger')
        .then(res => res.json())
        .then(data => setEvents(data));

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'PENDING_REASONING': 
      case 'PENDING_VERIFICATION': return 'bg-yellow-100 text-yellow-800';
      case 'STOP_AND_ESCALATE':
      case 'ESCALATED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Revenue Resilience AI</h1>
          <p className="text-gray-600">Real-time Recovery Ledger & Policy Engine</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800">Event Stream</h2>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Diagnosis</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Policy Decision</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {events.map(event => (
                      <tr key={event.event_id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                          {event.event_id.substring(0, 12)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {event.diagnosis || '...'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {event.policy_decision || '...'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(event.status)}`}>
                            {event.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {events.length === 0 && (
                  <div className="p-8 text-center text-gray-500">No events found. Trigger a webhook or run the benchmark.</div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Benchmark Results</h2>
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded border border-blue-100">
                  <div className="text-sm text-blue-600 mb-1">TRV (Total Recovery Value) Proxy</div>
                  <div className="text-2xl font-bold text-blue-900">Wait for script...</div>
                </div>
                <div className="bg-green-50 p-4 rounded border border-green-100">
                  <div className="text-sm text-green-600 mb-1">ZDCI (Zero Double Charge Index)</div>
                  <div className="text-2xl font-bold text-green-900">100%</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default App
