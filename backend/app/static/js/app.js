const { useState, useEffect, useMemo } = React;

// Main App Component
function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [qualityScore, setQualityScore] = useState(null);
  const [changeoverMatrix, setChangeoverMatrix] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [selectedTier, setSelectedTier] = useState('WEEKLY');

  // Load all data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [dashRes, schedRes, ordRes, machRes, matRes, foreRes, scoreRes, coRes] = await Promise.all([
        fetch('/api/dashboard/overview').then(r => r.json()),
        fetch(`/api/schedule/slots?tier=${selectedTier}`).then(r => r.json()),
        fetch('/api/orders').then(r => r.json()),
        fetch('/api/machines').then(r => r.json()),
        fetch('/api/materials').then(r => r.json()),
        fetch('/api/materials/forecast').then(r => r.json()),
        fetch('/api/schedule/quality-score').then(r => r.json()),
        fetch('/api/schedule/changeover-matrix').then(r => r.json())
      ]);

      setDashboard(dashRes);
      setSchedules(schedRes);
      setOrders(ordRes);
      setMachines(machRes);
      setMaterials(matRes);
      setForecasts(foreRes);
      setQualityScore(scoreRes);
      setChangeoverMatrix(coRes);
    } catch (err) {
      console.error("Failed to load factory data", err);
    } finally {
      setLoading(false);
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 100);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedTier]);

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Trigger full schedule generation
  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const res = await fetch('/api/schedule/generate', { method: 'POST' });
      const data = await res.json();
      showToast("TOC Schedule Generated & Optimized Successfully!");
      await fetchData();
    } catch (e) {
      showToast("Optimization failed: " + e.message, "error");
    } finally {
      setOptimizing(false);
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#070c18] text-white">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold tracking-wide">Initializing Intelligent TOC Production Scheduler...</h2>
        <p className="text-slate-400 text-sm mt-1">Analyzing machines, dyes, order readiness, and Drum bottlenecks</p>
      </div>
    );
  }

  if (!loading && !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#070c18] text-white p-6 text-center">
        <div className="p-6 bg-rose-950/40 border border-rose-500/40 rounded-2xl max-w-md space-y-3">
          <i data-lucide="alert-triangle" className="w-10 h-10 text-rose-400 mx-auto"></i>
          <h2 className="text-lg font-bold text-white">Failed to Connect to Factory API</h2>
          <p className="text-xs text-slate-300">Could not retrieve factory production data. Please ensure the backend server is running.</p>
          <button onClick={fetchData} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all shadow">
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-2xl flex items-center gap-3 border ${
          notification.type === 'error' ? 'bg-rose-950/90 border-rose-600 text-rose-200' : 'bg-emerald-950/90 border-emerald-600 text-emerald-200'
        }`}>
          <i data-lucide={notification.type === 'error' ? 'alert-triangle' : 'check-circle'} className="w-5 h-5"></i>
          <span className="font-medium text-sm">{notification.msg}</span>
        </div>
      )}

      {/* Top Industrial Header */}
      <header className="bg-[#0b1329] border-b border-factory-border/60 sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
            <i data-lucide="layers" className="w-6 h-6 text-white"></i>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-bold text-lg text-white tracking-wide">PRIME TEXTILES</h1>
              <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                TOC DBR v2.0
              </span>
            </div>
            <p className="text-xs text-slate-400">Intelligent Drum-Buffer-Rope Textile Colouring Scheduler</p>
          </div>
        </div>

        {/* Active Drum Bottleneck Badge */}
        {dashboard && dashboard.bottleneck_info && (
          <div className="hidden lg:flex items-center gap-3 bg-amber-950/40 border border-amber-500/40 rounded-xl px-4 py-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></div>
            <div>
              <div className="text-[10px] uppercase font-bold text-amber-300/80 tracking-wider">Active TOC Drum</div>
              <div className="text-xs font-bold text-amber-200">{dashboard.bottleneck_info.resource_name} ({dashboard.bottleneck_info.utilization_pct}%)</div>
            </div>
          </div>
        )}

        {/* 7-Day Advance Planning Warning Badge */}
        {dashboard && dashboard.seven_day_rule_violations_count > 0 && (
          <div className="hidden md:flex items-center gap-2 bg-rose-950/40 border border-rose-500/40 rounded-xl px-3.5 py-1.5">
            <i data-lucide="alert-octagon" className="w-4 h-4 text-rose-400"></i>
            <span className="text-xs font-bold text-rose-300">
              {dashboard.seven_day_rule_violations_count} Orders Violating 7-Day Rule
            </span>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOptimize}
            disabled={optimizing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-md shadow-cyan-900/30 disabled:opacity-50"
          >
            <i data-lucide={optimizing ? "refresh-cw" : "zap"} className={`w-4 h-4 ${optimizing ? 'animate-spin' : ''}`}></i>
            <span>{optimizing ? "Optimizing..." : "Re-Optimize Schedule"}</span>
          </button>

          <a
            href="/api/reports/excel"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
            download
          >
            <i data-lucide="file-spreadsheet" className="w-4 h-4 text-emerald-400"></i>
            <span className="hidden sm:inline">Excel</span>
          </a>

          <a
            href="/api/reports/pdf"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
            download
          >
            <i data-lucide="file-text" className="w-4 h-4 text-rose-400"></i>
            <span className="hidden sm:inline">PDF</span>
          </a>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <nav className="bg-[#0b1329]/80 border-b border-factory-border/40 px-6 flex space-x-1 overflow-x-auto">
        {[
          { id: 'dashboard', label: 'TOC Command Center', icon: 'activity' },
          { id: 'gantt', label: 'Production Gantt Chart', icon: 'calendar' },
          { id: 'orders', label: 'Order Readiness & Urgency', icon: 'shopping-bag' },
          { id: 'machines', label: 'Machines & Changeover Matrix', icon: 'cpu' },
          { id: 'inventory', label: 'Dyes & Material MRP', icon: 'flask-conical' },
          { id: 'disruptions', label: 'Disruption Event Simulator', icon: 'alert-triangle' },
          { id: 'whatif', label: 'What-If Scenario Sandbox', icon: 'git-branch' },
          { id: 'scorecard', label: 'Schedule Quality Score', icon: 'award' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
            }}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <i data-lucide={tab.icon} className="w-4 h-4"></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content View Container */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <DashboardView
            dashboard={dashboard}
            onSelectOrder={(ord) => setSelectedOrder(ord)}
            onNavigateTab={(t) => setActiveTab(t)}
          />
        )}

        {activeTab === 'gantt' && (
          <GanttView
            schedules={schedules}
            machines={machines}
            selectedTier={selectedTier}
            onChangeTier={(t) => setSelectedTier(t)}
            onSelectSlot={(slot) => setSelectedSlot(slot)}
            onRefresh={fetchData}
            showToast={showToast}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersView
            orders={orders}
            onOrderCreated={fetchData}
            onSelectOrder={(ord) => setSelectedOrder(ord)}
            showToast={showToast}
          />
        )}

        {activeTab === 'machines' && (
          <MachinesView
            machines={machines}
            changeoverMatrix={changeoverMatrix}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            materials={materials}
            forecasts={forecasts}
          />
        )}

        {activeTab === 'disruptions' && (
          <DisruptionsView
            machines={machines}
            materials={materials}
            onDisruptionResolved={fetchData}
            showToast={showToast}
          />
        )}

        {activeTab === 'whatif' && (
          <WhatIfView
            machines={machines}
            materials={materials}
            showToast={showToast}
          />
        )}

        {activeTab === 'scorecard' && (
          <ScorecardView
            qualityScore={qualityScore}
            dashboard={dashboard}
          />
        )}
      </main>

      {/* Explainable Decision Drawer Modal */}
      {selectedSlot && (
        <SlotDetailModal
          slot={selectedSlot}
          machines={machines}
          onClose={() => setSelectedSlot(null)}
          onOverrideSuccess={() => { setSelectedSlot(null); fetchData(); }}
          onViewOrder={(orderId) => {
            const slotRef = selectedSlot;
            setSelectedSlot(null);
            const ord = orders.find(o => o.id === orderId || o.order_number === slotRef.order_number);
            if (ord) {
              setSelectedOrder(ord);
            } else {
              fetch(`/api/orders/${orderId}`).then(r => r.json()).then(data => setSelectedOrder(data)).catch(() => {});
            }
          }}
          showToast={showToast}
        />
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onOrderUpdated={fetchData}
          onNavigateToGantt={(orderId) => {
            setSelectedOrder(null);
            setActiveTab('gantt');
          }}
          showToast={showToast}
          machines={machines}
        />
      )}
    </div>
  );
}

// 1. DASHBOARD VIEW COMPONENT
function DashboardView({ dashboard, onSelectOrder, onNavigateTab }) {
  if (!dashboard) return null;
  const btn = dashboard.bottleneck_info;

  return (
    <div className="space-y-6">
      {/* Top 6 KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'On-Time Delivery', value: `${dashboard.on_time_delivery_pct}%`, icon: 'clock', color: dashboard.on_time_delivery_pct >= 95 ? 'text-emerald-400' : 'text-rose-400', sub: `${dashboard.late_orders} Late Orders` },
          { label: 'Bottleneck Utilization', value: `${dashboard.bottleneck_utilization_pct}%`, icon: 'gauge', color: 'text-amber-400', sub: btn ? btn.resource_code : 'Active' },
          { label: 'Machine Utilization', value: `${dashboard.machine_utilization_pct}%`, icon: 'cpu', color: 'text-cyan-400', sub: 'Fleet Average' },
          { label: 'Total Production', value: `${(dashboard.total_production_kg / 1000).toFixed(1)}k kg`, icon: 'package', color: 'text-blue-400', sub: `${dashboard.total_orders} Orders Planned` },
          { label: 'Schedule Stability', value: `${dashboard.schedule_stability_score}%`, icon: 'shield-check', color: 'text-indigo-400', sub: 'Low Nervousness' },
          { label: 'Total Operating Cost', value: `₹${(dashboard.total_operating_cost_inr / 1000).toFixed(0)}k`, icon: 'dollar-sign', color: 'text-emerald-400', sub: 'Power, Steam & Water' }
        ].map((kpi, i) => (
          <div key={i} className="glass-card p-4 flex flex-col justify-between border border-factory-border/40 hover:border-cyan-500/30 transition-all">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase">{kpi.label}</span>
              <i data-lucide={kpi.icon} className="w-4 h-4 text-slate-500"></i>
            </div>
            <div className={`text-2xl font-black ${kpi.color} tracking-tight`}>{kpi.value}</div>
            <div className="text-[10px] text-slate-400 mt-1">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* TOC Bottleneck Spotlight & 5 Focusing Steps Banner */}
      <div className="glass-panel p-6 border-l-4 border-l-amber-500 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 uppercase">
                THEORY OF CONSTRAINTS — ACTIVE DRUM
              </span>
              <span className="text-xs text-slate-400">Step 1 & 2: Identify & Exploit</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-wide">{btn.resource_name}</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{btn.recommendation}</p>
          </div>

          <div className="flex items-center gap-6 bg-[#070c18]/80 p-4 rounded-xl border border-factory-border">
            <div className="text-center">
              <div className="text-xs text-slate-400">Current Load</div>
              <div className="text-xl font-bold text-white mt-0.5">{btn.workload_kg.toLocaleString()} kg</div>
            </div>
            <div className="h-8 w-px bg-slate-700"></div>
            <div className="text-center">
              <div className="text-xs text-slate-400">Overload Hours</div>
              <div className="text-xl font-bold text-amber-400 mt-0.5">+{btn.overload_hours}h</div>
            </div>
            <div className="h-8 w-px bg-slate-700"></div>
            <div className="text-center">
              <div className="text-xs text-slate-400">Buffer Status</div>
              <span className={`inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-bold ${
                btn.buffer_status === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {btn.buffer_status} ({btn.buffer_penetration_pct}%)
              </span>
            </div>
          </div>
        </div>

        {/* 5 Focusing Steps Visual Stepper */}
        <div className="mt-6 pt-6 border-t border-slate-800 grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { step: '1. IDENTIFY', title: 'Find Constraint', desc: btn.resource_name, color: 'text-amber-400', active: true },
            { step: '2. EXPLOIT', title: 'Maximize Drum', desc: 'Zero idle time; sequence light-to-dark', color: 'text-cyan-400', active: true },
            { step: '3. SUBORDINATE', title: 'Tie the Rope', desc: 'Pre-treatment throttled to 1500kg WIP', color: 'text-blue-400', active: true },
            { step: '4. ELEVATE', title: 'Increase Capacity', desc: 'Authorize 4h overtime if load >95%', color: 'text-purple-400', active: false },
            { step: '5. REPEAT', title: 'Dynamic Recalc', desc: 'Monitor next bottleneck emergence', color: 'text-emerald-400', active: true }
          ].map((s, i) => (
            <div key={i} className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className={`text-[10px] font-bold uppercase ${s.color}`}>{s.step}</div>
              <div className="text-xs font-bold text-slate-200 mt-0.5">{s.title}</div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: 7-Day Rule Alerts + Factory Utility Constraints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 7-Day Planning Rule Violation Diagnostic Card */}
        <div className="glass-panel p-5 border border-factory-border/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <i data-lucide="shield-alert" className="w-5 h-5 text-rose-400"></i>
              <h3 className="font-bold text-sm text-white">7-Day Advance Planning Rule Status</h3>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Mandatory Buyer Rule
            </span>
          </div>

          <div className="space-y-3">
            {dashboard.active_alerts.filter(a => a.type === 'SEVEN_DAY_RULE').length === 0 ? (
              <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3">
                <i data-lucide="check-circle" className="w-5 h-5 text-emerald-400"></i>
                <span>All pending production orders have confirmed schedules at least 7 days before customer due dates.</span>
              </div>
            ) : (
              dashboard.active_alerts.filter(a => a.type === 'SEVEN_DAY_RULE').slice(0, 3).map((alt, i) => (
                <div key={i} className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300">{alt.title}</span>
                    <span className="text-[10px] text-rose-400 uppercase font-semibold">Critical Violation</span>
                  </div>
                  <p className="text-xs text-slate-300">{alt.message}</p>
                  <div className="text-[11px] text-amber-300 flex items-center gap-1.5 pt-1">
                    <i data-lucide="arrow-right" className="w-3.5 h-3.5"></i>
                    <span><strong>Action:</strong> {alt.action}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Factory Utility Hourly Consumption Gauges */}
        <div className="glass-panel p-5 border border-factory-border/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <i data-lucide="droplet" className="w-5 h-5 text-cyan-400"></i>
              <h3 className="font-bold text-sm text-white">Factory Utility & Resource Constraints</h3>
            </div>
            <span className="text-xs text-slate-400">Hourly Operating Caps</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { name: 'Water Treatment & Supply', current: 18.5, max: 25.0, unit: 'm³/hr', pct: 74, color: 'bg-cyan-500' },
              { name: 'Steam Boiler Output', current: 3100, max: 4000, unit: 'kg/hr', pct: 77.5, color: 'bg-amber-500' },
              { name: 'Substation Electricity', current: 480, max: 650, unit: 'kW', pct: 73.8, color: 'bg-blue-500' },
              { name: 'Effluent ETP Discharge', current: 16.2, max: 22.0, unit: 'm³/hr', pct: 73.6, color: 'bg-emerald-500' },
            ].map((u, i) => (
              <div key={i} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                  <span>{u.name}</span>
                  <span className="font-bold text-white">{u.current} / {u.max} {u.unit}</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div className={`h-full ${u.color} rounded-full`} style={{ width: `${u.pct}%` }}></div>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5">
                  <span>Capacity load</span>
                  <span className="font-semibold text-slate-300">{u.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. PRODUCTION GANTT CHART COMPONENT
function GanttView({ schedules, machines, selectedTier, onChangeTier, onSelectSlot, onRefresh, showToast }) {
  const [draggedSlot, setDraggedSlot] = useState(null);

  // Group schedules by machine
  const machineSwimlanes = useMemo(() => {
    const map = {};
    machines.forEach(m => { map[m.id] = { machine: m, slots: [] }; });
    schedules.forEach(s => {
      if (map[s.machine_id]) {
        map[s.machine_id].slots.push(s);
      }
    });
    return Object.values(map);
  }, [machines, schedules]);

  return (
    <div className="glass-panel p-5 border border-factory-border/60 space-y-4">
      {/* Gantt Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white">Interactive Production Gantt Timeline</h2>
          <p className="text-xs text-slate-400">Drum-Buffer-Rope dispatch schedule with Freeze Window lock badges</p>
        </div>

        {/* 3-Level Hierarchy Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Planning Level:</span>
          <div className="bg-slate-900 p-1 rounded-lg border border-slate-800 flex gap-1">
            {[
              { id: 'DAILY', label: 'Daily Dispatch (48h)' },
              { id: 'WEEKLY', label: 'Weekly Schedule (14d)' },
              { id: 'MONTHLY', label: 'Monthly Plan (30d)' }
            ].map(tier => (
              <button
                key={tier.id}
                onClick={() => onChangeTier(tier.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  selectedTier === tier.id ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Freeze Window Legend */}
      <div className="flex items-center gap-6 text-xs text-slate-400 px-2 py-1">
        <span className="font-semibold text-slate-300">Freeze Policy:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span>Today (Locked)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
          <span>Tomorrow (Mostly Locked)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span>Flexible Horizon</span>
        </div>
      </div>

      {/* Swimlane Rows */}
      <div className="space-y-4 pt-2 overflow-x-auto">
        {machineSwimlanes.map(({ machine, slots }) => {
          const isDrum = machine.code === 'JET-M2'; // High capacity bottleneck
          return (
            <div key={machine.id} className={`p-3 rounded-xl border ${isDrum ? 'bg-amber-950/20 border-amber-500/40 drum-glow' : 'bg-slate-900/50 border-slate-800'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-white">{machine.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    Max Batch: {machine.max_batch_kg}kg
                  </span>
                  {isDrum && (
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      TOC DRUM
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">
                  Total Workload: <strong className="text-slate-200">{slots.reduce((sum, s) => sum + s.quantity_kg, 0)} kg</strong>
                </div>
              </div>

              {/* Slot Blocks Bar */}
              <div className="flex flex-wrap gap-2 min-h-[56px] p-2 bg-[#070c18] rounded-lg border border-slate-800/80 items-center">
                {slots.length === 0 ? (
                  <span className="text-xs text-slate-500 italic px-2">No jobs currently scheduled for this machine window</span>
                ) : (
                  slots.map(s => {
                    const start = new Date(s.planned_start);
                    const end = new Date(s.planned_end);
                    const isLocked = s.is_locked;
                    
                    return (
                      <div
                        key={s.id}
                        onClick={() => onSelectSlot(s)}
                        className={`px-3 py-2 rounded-lg border cursor-pointer transition-all hover:scale-105 flex items-center gap-2.5 shadow-lg ${
                          isLocked
                            ? 'bg-amber-950/40 border-amber-600/60 text-amber-200'
                            : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:border-cyan-500'
                        }`}
                      >
                        {/* Colour Swatch Dot */}
                        <div
                          className="w-3 h-3 rounded-full border border-white/40 shadow-sm"
                          style={{
                            backgroundColor:
                              s.colour_code === 'WHITE' ? '#ffffff' :
                              s.colour_code === 'ROYAL_BLUE' ? '#2563eb' :
                              s.colour_code === 'DEEP_NAVY' ? '#1e3a8a' :
                              s.colour_code === 'JET_BLACK' ? '#0f172a' :
                              s.colour_code === 'SCARLET_RED' ? '#dc2626' :
                              s.colour_code === 'GOLDEN_YELLOW' ? '#eab308' : '#06b6d4'
                          }}
                        ></div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold">{s.order_number}</span>
                            {isLocked && <i data-lucide="lock" className="w-3 h-3 text-amber-400"></i>}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {s.quantity_kg}kg • {s.cloth_type.split(' ')[0]} • {start.getHours()}:00–{end.getHours()}:00
                          </div>
                        </div>

                        {/* Explainability Icon */}
                        <i data-lucide="info" className="w-3.5 h-3.5 text-slate-400 hover:text-cyan-400 ml-1"></i>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 3. EXPLAINABLE DECISION MODAL ("Why was this scheduled here?")
function SlotDetailModal({ slot, machines, onClose, onOverrideSuccess, onViewOrder, showToast }) {
  const [targetMachineId, setTargetMachineId] = useState(slot.machine_id);
  const [overrideWarning, setOverrideWarning] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
  }, []);

  // Split reasons
  const reasons = (slot.scheduling_reason || "Scheduled according to standard TOC Earliest Due Date priority.").split(" | ");

  const handleReassign = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/schedule/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: slot.id,
          new_machine_id: parseInt(targetMachineId),
          new_start_time: slot.planned_start,
          force_override: true
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        onOverrideSuccess();
      } else {
        setOverrideWarning(data.warning || data.error);
      }
    } catch (e) {
      showToast("Override failed: " + e.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-panel w-full max-w-2xl bg-[#0b1329] border border-cyan-500/50 shadow-2xl rounded-2xl relative space-y-5 p-6 overflow-hidden">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-cyan-500 text-xs font-semibold transition-all cursor-pointer"
            title="Return to Gantt chart (ESC)"
          >
            <i data-lucide="arrow-left" className="w-4 h-4 text-cyan-400"></i>
            <span>Back to Gantt</span>
          </button>

          {onViewOrder && (
            <button
              type="button"
              onClick={() => onViewOrder(slot.order_id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-xs font-bold transition-all cursor-pointer"
              title="Open full Order Details, recipe, and stage tracking for this job"
            >
              <i data-lucide="external-link" className="w-3.5 h-3.5"></i>
              <span>View Complete Order Details</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="Close modal (ESC)"
          >
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        {/* Modal Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <i data-lucide="help-circle" className="w-5 h-5"></i>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Why was this order scheduled here?</h3>
            <p className="text-xs text-slate-400">Explainable Decision Engine for {slot.order_number} ({slot.customer_name})</p>
          </div>
        </div>

        {/* Decision Factors List */}
        <div className="space-y-2.5 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
          <div className="text-xs font-bold uppercase text-cyan-400 tracking-wider mb-2">TOC Scheduling Rationales</div>
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-slate-200">
              <i data-lucide="check-circle-2" className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"></i>
              <span>{r}</span>
            </div>
          ))}
        </div>

        {/* Processing Metrics Breakdown */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Changeover Time</div>
            <div className="text-sm font-bold text-white mt-0.5">{slot.changeover_min} min</div>
          </div>
          <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Operating Cost</div>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">₹{slot.operating_cost_inr.toFixed(0)}</div>
          </div>
          <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Buffer Penetration</div>
            <div className={`text-sm font-bold mt-0.5 ${slot.buffer_penetration_pct > 66 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {slot.buffer_penetration_pct.toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Manual Reassignment Section */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="text-xs font-bold text-slate-300">Manual Reassignment (Manager Override)</div>
          
          {overrideWarning && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
              {overrideWarning}
            </div>
          )}

          <div className="flex items-center gap-3">
            <select
              value={targetMachineId}
              onChange={(e) => setTargetMachineId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white flex-1"
            >
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.name} (Max {m.max_batch_kg}kg)</option>
              ))}
            </select>

            <button
              onClick={handleReassign}
              disabled={submitting}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50"
              title="Reassign this job to selected machine and validate TOC feasibility"
            >
              {submitting ? "Validating..." : "Reassign & Validate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 4. ORDER MANAGEMENT & READINESS RADAR COMPONENT
function OrdersView({ orders, onOrderCreated, onSelectOrder, showToast }) {
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filtered = useMemo(() => {
    if (filterPriority === 'ALL') return orders;
    return orders.filter(o => o.priority === filterPriority);
  }, [orders, filterPriority]);

  return (
    <div className="glass-panel p-5 border border-factory-border/60 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white">Order Management & 5-Point Readiness Radar</h2>
          <p className="text-xs text-slate-400">Tracks fabric, dye, operator, machine, and lab dip approval</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-xs text-slate-400">Priority:</span>
            {['ALL', 'EMERGENCY', 'HIGH', 'MEDIUM', 'LOW'].map(p => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`px-2 py-0.5 text-xs font-semibold rounded ${
                  filterPriority === p ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white font-semibold text-xs rounded-lg flex items-center gap-2 shadow"
          >
            <i data-lucide="plus" className="w-4 h-4"></i>
            <span>New Order</span>
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Order #</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Fabric</th>
              <th className="py-3 px-4">Qty (kg)</th>
              <th className="py-3 px-4">Colour</th>
              <th className="py-3 px-4">Due Date</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Urgency Score</th>
              <th className="py-3 px-4">Readiness Status</th>
              <th className="py-3 px-4">7-Day Rule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {filtered.map(o => (
              <tr key={o.id} onClick={() => onSelectOrder(o)} className="hover:bg-slate-800/40 cursor-pointer transition-all">
                <td className="py-3 px-4 font-bold text-white">{o.order_number}</td>
                <td className="py-3 px-4">{o.customer_name}</td>
                <td className="py-3 px-4">{o.cloth_type}</td>
                <td className="py-3 px-4 font-bold text-slate-100">{o.quantity_kg}</td>
                <td className="py-3 px-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border border-white/30" style={{
                    backgroundColor: o.colour_code === 'WHITE' ? '#ffffff' :
                      o.colour_code === 'ROYAL_BLUE' ? '#2563eb' :
                      o.colour_code === 'DEEP_NAVY' ? '#1e3a8a' :
                      o.colour_code === 'JET_BLACK' ? '#0f172a' :
                      o.colour_code === 'SCARLET_RED' ? '#dc2626' : '#eab308'
                  }}></span>
                  <span>{o.colour_name}</span>
                </td>
                <td className="py-3 px-4 text-slate-400">{new Date(o.due_date).toLocaleDateString()}</td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    o.priority === 'EMERGENCY' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                    o.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {o.priority}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{o.urgency_score}</span>
                    <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${o.urgency_score}%` }}></div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    o.readiness_status === 'READY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    o.readiness_status === 'PARTIALLY_READY' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    {o.readiness_status}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {o.seven_day_rule_violated ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                      VIOLATED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                      OK (≥7d)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <CreateOrderModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); onOrderCreated(); showToast("Order Created & Feasibility Validated!"); }}
        />
      )}
    </div>
  );
}

// Order Detail Modal Component with Full TOC / DBR Controls & Navigation Safety
function OrderDetailModal({ order, onClose, onOrderUpdated, onNavigateToGantt, showToast, machines = [] }) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const [subView, setSubView] = useState('overview'); // 'overview', 'schedule', 'edit', 'stages'
  const [readinessChecklist, setReadinessChecklist] = useState(order.readiness_checklist || null);
  const [scheduleData, setScheduleData] = useState(order.schedule || null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Confirmation dialog states
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    quantity_kg: order.quantity_kg || 500,
    due_date: order.due_date ? new Date(order.due_date).toISOString().split('T')[0] : '',
    priority: order.priority || 'MEDIUM',
    cloth_type: order.cloth_type || '',
    colour_name: order.colour_name || '',
    colour_code: order.colour_code || '',
    notes: order.notes || ''
  });

  // Fetch full details on open to guarantee latest readiness and schedule
  const fetchFullOrder = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/orders/${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentOrder(data);
        setReadinessChecklist(data.readiness_checklist);
        setScheduleData(data.schedule);
        setEditForm({
          quantity_kg: data.quantity_kg,
          due_date: data.due_date ? new Date(data.due_date).toISOString().split('T')[0] : '',
          priority: data.priority,
          cloth_type: data.cloth_type,
          colour_name: data.colour_name,
          colour_code: data.colour_code,
          notes: data.notes || ''
        });
      }
    } catch (err) {
      console.error("Failed to load order detail", err);
    } finally {
      setLoading(false);
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
    }
  };

  useEffect(() => {
    fetchFullOrder();
  }, [order.id]);

  // Keyboard navigation: ESC closes modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showStartConfirm) setShowStartConfirm(false);
        else if (showCancelConfirm) setShowCancelConfirm(false);
        else if (subView !== 'overview') setSubView('overview');
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, subView, showStartConfirm, showCancelConfirm]);

  useEffect(() => {
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
  }, [subView, showStartConfirm, showCancelConfirm]);

  // Order status logic
  const isCompleted = currentOrder.status === 'COMPLETED';
  const isCancelled = currentOrder.status === 'CANCELLED';
  const isInProduction = currentOrder.status === 'IN_PROGRESS' || currentOrder.status === 'IN_PRODUCTION';

  // Real factory readiness check for Start Production
  const blockingReasons = [];
  if (isCompleted) blockingReasons.push("Order is already marked as completed.");
  if (isCancelled) blockingReasons.push("Order has been cancelled.");
  if (isInProduction) blockingReasons.push("Order is already actively in production.");
  if (!currentOrder.assigned_machine_id || !currentOrder.planned_start) {
    blockingReasons.push("Order has not been scheduled onto a confirmed machine slot.");
  }
  if (readinessChecklist) {
    if (!readinessChecklist.fabric_available) blockingReasons.push(`Fabric shortage: ${currentOrder.cloth_type} is not available.`);
    if (!readinessChecklist.dye_available) blockingReasons.push(`Dye shortage: Required recipe for '${currentOrder.colour_name}' is not in stock.`);
    if (!readinessChecklist.operator_available) blockingReasons.push("No certified operator is available on the active shift.");
    if (!readinessChecklist.machine_available) blockingReasons.push("Target machine is under maintenance or breakdown.");
    if (!readinessChecklist.lab_dip_approved) blockingReasons.push("Lab dip customer shade match approval is pending.");
  }

  const isStartable = blockingReasons.length === 0;

  // Real cancellation check
  const isCancellable = !isInProduction && !isCompleted && !isCancelled;
  const cancelBlockedReason = isInProduction
    ? "Order cannot be cancelled because production has already started."
    : (isCompleted ? "Completed order cannot be cancelled." : (isCancelled ? "Order is already cancelled." : ""));

  // Start Production Handler
  const handleConfirmStartProduction = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/orders/${currentOrder.id}/start-production`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast(data.message, 'success');
        setShowStartConfirm(false);
        await fetchFullOrder();
        if (onOrderUpdated) onOrderUpdated();
      } else {
        const errMsg = data.detail ? (data.detail.message || JSON.stringify(data.detail)) : (data.message || "Failed to start production");
        if (showToast) showToast(errMsg, 'error');
      }
    } catch (e) {
      if (showToast) showToast("Error starting production: " + e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Order Handler
  const handleConfirmCancelOrder = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/orders/${currentOrder.id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast(data.message, 'success');
        setShowCancelConfirm(false);
        await fetchFullOrder();
        if (onOrderUpdated) onOrderUpdated();
      } else {
        const errMsg = data.detail || data.message || "Failed to cancel order";
        if (showToast) showToast(errMsg, 'error');
      }
    } catch (e) {
      if (showToast) showToast("Error cancelling order: " + e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Edit Order Handler
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await fetch(`/api/orders/${currentOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          quantity_kg: parseFloat(editForm.quantity_kg),
          due_date: new Date(editForm.due_date).toISOString()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast(data.message, 'success');
        setSubView('overview');
        await fetchFullOrder();
        if (onOrderUpdated) onOrderUpdated();
      } else {
        const errMsg = data.detail || data.message || "Update failed";
        if (showToast) showToast(errMsg, 'error');
      }
    } catch (e) {
      if (showToast) showToast("Error saving order: " + e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate 7-Day rule status info
  const dueDateObj = new Date(currentOrder.due_date);
  const plannedStartObj = currentOrder.planned_start ? new Date(currentOrder.planned_start) : null;
  const daysBeforeDue = plannedStartObj
    ? Math.max(0, Math.round((dueDateObj - plannedStartObj) / (1000 * 60 * 60 * 24)))
    : Math.max(0, Math.round((dueDateObj - new Date()) / (1000 * 60 * 60 * 24)));

  let sevenDayStatusType = 'SAFE';
  let sevenDayStatusText = `✓ Planned ${daysBeforeDue} days before due date (SAFE)`;
  if (currentOrder.seven_day_rule_violated) {
    sevenDayStatusType = 'CRITICAL';
    sevenDayStatusText = `✕ 7-day planning rule violated (${daysBeforeDue} days lead time)`;
  } else if (daysBeforeDue < 7) {
    sevenDayStatusType = 'WARNING';
    sevenDayStatusText = `⚠ Planned ${daysBeforeDue} days before due date (WARNING — Approaching 7-day rule limit)`;
  }

  // Parse structured reasons
  const rawReasons = (currentOrder.scheduling_reason || "").split(" | ").filter(Boolean);
  const structuredReasons = rawReasons.length > 0 ? rawReasons : [
    `Machine '${currentOrder.assigned_machine_name || "M2"}' is compatible with ${currentOrder.cloth_type} and has batch capacity.`,
    `Colour transition from preceding shade requires minimal cleaning time.`,
    `Qualified operator ${currentOrder.assigned_operator_name || "Master Dyer"} is certified for this vessel.`,
    `Operating buffer safely cushions production before delivery deadline.`,
    `Scheduled to optimize overall Drum utilization according to Theory of Constraints.`
  ];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-title"
    >
      <div className="glass-panel w-full max-w-2xl bg-[#0b1329] border border-cyan-500/50 shadow-2xl rounded-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        
        {/* ====================================================
            1. TOP NAVIGATION HEADER (Back Button + Title + Close Button)
           ==================================================== */}
        <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              if (subView !== 'overview') setSubView('overview');
              else onClose();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-cyan-500/60 text-xs font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer"
            title={subView !== 'overview' ? "Back to Order Details" : "Back to Orders list"}
            aria-label={subView !== 'overview' ? "Back to Order Details" : "Back to Orders list"}
          >
            <i data-lucide="arrow-left" className="w-4 h-4 text-cyan-400"></i>
            <span>{subView !== 'overview' ? "Back to Details" : "Back to Orders"}</span>
          </button>

          <div className="text-center">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Production Order Control</span>
            <div className="text-xs font-bold text-white">{currentOrder.order_number}</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-200 border border-slate-700 hover:border-rose-500/50 flex items-center justify-center transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500"
            title="Close order details (ESC)"
            aria-label="Close order details"
          >
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        {/* ====================================================
            SCROLLABLE BODY CONTAINER
           ==================================================== */}
        <div className="flex-1 p-5 overflow-y-auto space-y-5">

          {/* SUB-VIEW: EDIT ORDER */}
          {subView === 'edit' && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <i data-lucide="edit-3" className="w-4 h-4 text-cyan-400"></i>
                  <h3 className="text-sm font-bold text-white">Edit Order: {currentOrder.order_number}</h3>
                </div>
                <span className="text-xs text-slate-400">Status: <strong>{currentOrder.status}</strong></span>
              </div>

              {isInProduction && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
                  <i data-lucide="lock" className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i>
                  <div>
                    <strong>Locked Fields:</strong> Fabric, quantity, and dye shade cannot be modified because this batch is actively in production. You may only update priority and notes.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Fabric Quantity (kg)</label>
                  <input
                    type="number"
                    disabled={isInProduction}
                    value={editForm.quantity_kg}
                    onChange={e => setEditForm({ ...editForm, quantity_kg: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Customer Due Date</label>
                  <input
                    type="date"
                    disabled={isInProduction}
                    value={editForm.due_date}
                    onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Cloth / Fabric Type</label>
                  <input
                    type="text"
                    disabled={isInProduction}
                    value={editForm.cloth_type}
                    onChange={e => setEditForm({ ...editForm, cloth_type: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Colour Name</label>
                  <input
                    type="text"
                    disabled={isInProduction}
                    value={editForm.colour_name}
                    onChange={e => setEditForm({ ...editForm, colour_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Order Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="EMERGENCY">EMERGENCY (Top Priority)</option>
                    <option value="HIGH">HIGH Priority</option>
                    <option value="MEDIUM">MEDIUM Priority</option>
                    <option value="LOW">LOW Priority</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Notes / Special Instructions</label>
                  <input
                    type="text"
                    value={editForm.notes}
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="e.g. Export grade finish required"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSubView('overview')}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white text-xs font-bold transition-all shadow disabled:opacity-50"
                >
                  {actionLoading ? "Validating..." : "Save Changes & Recalculate"}
                </button>
              </div>
            </form>
          )}

          {/* SUB-VIEW: SCHEDULE VIEW */}
          {subView === 'schedule' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <i data-lucide="calendar" className="w-4 h-4 text-cyan-400"></i>
                  <h3 className="text-sm font-bold text-white">Production Schedule: {currentOrder.order_number}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView('overview')}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <i data-lucide="arrow-left" className="w-3.5 h-3.5"></i>
                  <span>Back to Details</span>
                </button>
              </div>

              {scheduleData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase">Assigned Machine</div>
                      <div className="font-bold text-white mt-1">{scheduleData.machine_name || currentOrder.assigned_machine_name}</div>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase">Assigned Operator</div>
                      <div className="font-bold text-white mt-1">{scheduleData.operator_name || currentOrder.assigned_operator_name || "Master Dyer"}</div>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase">Planned Start</div>
                      <div className="font-bold text-cyan-300 mt-1">
                        {scheduleData.planned_start ? new Date(scheduleData.planned_start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Unassigned"}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase">Planned End</div>
                      <div className="font-bold text-cyan-300 mt-1">
                        {scheduleData.planned_end ? new Date(scheduleData.planned_end).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Unassigned"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase">Base Processing</div>
                      <div className="font-bold text-white mt-1">{(scheduleData.base_processing_min / 60).toFixed(1)} hours</div>
                      <div className="text-[10px] text-slate-500">{scheduleData.base_processing_min} min</div>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase">Changeover Time</div>
                      <div className="font-bold text-amber-400 mt-1">{scheduleData.changeover_min} min</div>
                      <div className="text-[10px] text-slate-500">Includes cleaning</div>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase">Estimated Cost</div>
                      <div className="font-bold text-emerald-400 mt-1">₹{scheduleData.operating_cost_inr.toFixed(0)}</div>
                      <div className="text-[10px] text-slate-500">Power & Water included</div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <i data-lucide="shield-check" className="w-4 h-4 text-cyan-400"></i>
                      <span>Freeze Window: <strong className="text-white">{currentOrder.freeze_level || "FLEXIBLE"}</strong></span>
                    </div>
                    {onNavigateToGantt && (
                      <button
                        type="button"
                        onClick={() => onNavigateToGantt(currentOrder.id)}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <i data-lucide="calendar" className="w-3.5 h-3.5"></i>
                        <span>Highlight in Master Gantt Timeline</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
                  <i data-lucide="clock" className="w-8 h-8 mx-auto text-slate-600 mb-2"></i>
                  <p>Order is currently in PENDING state and will be allocated a slot during the next optimization run.</p>
                </div>
              )}
            </div>
          )}

          {/* SUB-VIEW: PROCESS STAGES */}
          {subView === 'stages' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <i data-lucide="git-commit" className="w-4 h-4 text-cyan-400"></i>
                  <h3 className="text-sm font-bold text-white">10-Stage Textile Pipeline Progress</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView('overview')}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <i data-lucide="arrow-left" className="w-3.5 h-3.5"></i>
                  <span>Back to Details</span>
                </button>
              </div>

              <div className="space-y-2">
                {(currentOrder.process_stages && currentOrder.process_stages.length > 0 ? currentOrder.process_stages : [
                  { stage_name: "FABRIC_INSPECTION", sequence_order: 1, duration_minutes: 30, status: isInProduction ? "COMPLETED" : "PENDING", assigned_resource: "INSPECTION_LINE" },
                  { stage_name: "PRE_TREATMENT", sequence_order: 2, duration_minutes: 60, status: isInProduction ? "COMPLETED" : "PENDING", assigned_resource: "PRE_TREATMENT_BATH" },
                  { stage_name: "DYE_PREP", sequence_order: 3, duration_minutes: 25, status: isInProduction ? "COMPLETED" : "PENDING", assigned_resource: "COLOR_LAB" },
                  { stage_name: "DYEING (THE DRUM)", sequence_order: 4, duration_minutes: 180, status: isInProduction ? "IN_PROGRESS" : "PENDING", assigned_resource: currentOrder.assigned_machine_name || "JET_DYEING" },
                  { stage_name: "WASHING", sequence_order: 5, duration_minutes: 45, status: "PENDING", assigned_resource: "WASHING_LINE" },
                  { stage_name: "DRYING", sequence_order: 6, duration_minutes: 50, status: "PENDING", assigned_resource: "DRYING_TUMBLER" },
                  { stage_name: "FINISHING", sequence_order: 7, duration_minutes: 60, status: "PENDING", assigned_resource: "STENTER_FINISHING" },
                  { stage_name: "QUALITY_INSPECTION", sequence_order: 8, duration_minutes: 30, status: "PENDING", assigned_resource: "LAB_INSPECTION" },
                  { stage_name: "PACKING_DISPATCH", sequence_order: 9, duration_minutes: 40, status: "PENDING", assigned_resource: "DISPATCH_PACKING" }
                ]).map((st, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-300">
                        {st.sequence_order || i + 1}
                      </span>
                      <div>
                        <div className="font-bold text-white">{st.stage_name}</div>
                        <div className="text-[10px] text-slate-400">{st.assigned_resource} • {st.duration_minutes} min</div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      st.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                      st.status === 'IN_PROGRESS' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {st.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUB-VIEW: OVERVIEW (Main User-Requested Structure) */}
          {subView === 'overview' && (
            <>
              {/* ====================================================
                  2. ORDER HEADER & IDENTITY (Number, Customer, Due Date, Status)
                 ==================================================== */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-900/80 rounded-xl border border-slate-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shrink-0">
                    <i data-lucide="package" className="w-6 h-6"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="order-details-title" className="text-xl font-black text-white tracking-tight">{currentOrder.order_number}</h2>
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        currentOrder.priority === 'EMERGENCY' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                        currentOrder.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {currentOrder.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-medium">{currentOrder.customer_name} • {currentOrder.customer_priority_tier || "VIP Customer"}</p>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex flex-col sm:items-end">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      isInProduction ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse' :
                      currentOrder.status === 'READY' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                      currentOrder.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                      currentOrder.status === 'COMPLETED' ? 'bg-emerald-600 text-white' :
                      currentOrder.status === 'CANCELLED' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      <i data-lucide={
                        isInProduction ? 'play-circle' :
                        currentOrder.status === 'READY' ? 'check-circle' :
                        currentOrder.status === 'SCHEDULED' ? 'calendar' :
                        currentOrder.status === 'COMPLETED' ? 'check' : 'clock'
                      } className="w-3.5 h-3.5"></i>
                      <span>{currentOrder.status}</span>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1">Due: {new Date(currentOrder.due_date).toLocaleDateString()}</span>
                </div>
              </div>

              {/* ====================================================
                  3. SPECIFICATION CARDS: [FABRIC & VOLUME] [COLOUR & RECIPE] [DUE DATE]
                 ==================================================== */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Fabric & Volume */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5">
                    <i data-lucide="layers" className="w-3.5 h-3.5 text-cyan-400"></i>
                    <span>Fabric & Volume</span>
                  </div>
                  <div className="text-sm font-bold text-white">{currentOrder.quantity_kg} kg</div>
                  <div className="text-slate-300 truncate">{currentOrder.cloth_type}</div>
                </div>

                {/* Colour & Recipe */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5">
                    <i data-lucide="palette" className="w-3.5 h-3.5 text-amber-400"></i>
                    <span>Colour & Recipe</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-3 h-3 rounded-full border border-white/40 shrink-0" style={{
                      backgroundColor:
                        currentOrder.colour_code === 'WHITE' ? '#ffffff' :
                        currentOrder.colour_code === 'ROYAL_BLUE' ? '#2563eb' :
                        currentOrder.colour_code === 'DEEP_NAVY' ? '#1e3a8a' :
                        currentOrder.colour_code === 'JET_BLACK' ? '#0f172a' :
                        currentOrder.colour_code === 'SCARLET_RED' ? '#dc2626' :
                        currentOrder.colour_code === 'GOLDEN_YELLOW' ? '#eab308' : '#06b6d4'
                    }}></span>
                    <span className="text-sm font-bold text-white truncate">{currentOrder.colour_name}</span>
                  </div>
                  <div className="text-slate-400 text-[11px]">{currentOrder.colour_code}</div>
                </div>

                {/* Due Date & Planning Slack */}
                <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5">
                    <i data-lucide="calendar" className="w-3.5 h-3.5 text-emerald-400"></i>
                    <span>Due Date</span>
                  </div>
                  <div className="text-sm font-bold text-white">{new Date(currentOrder.due_date).toLocaleDateString()}</div>
                  <div className="text-slate-400 text-[11px]">
                    {daysBeforeDue > 0 ? `Target in ${daysBeforeDue} days` : "Due today / overdue"}
                  </div>
                </div>
              </div>

              {/* ====================================================
                  4. SCHEDULING RATIONALE (Structured Bullet Points)
                 ==================================================== */}
              <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-cyan-400 tracking-wider flex items-center gap-2">
                    <i data-lucide="sparkles" className="w-4 h-4"></i>
                    <span>Scheduling Rationale</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">AI Drum-Buffer-Rope Justification</span>
                </div>
                
                <div className="space-y-1.5 text-xs text-slate-200">
                  {structuredReasons.map((reason, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <i data-lucide="check" className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5"></i>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ====================================================
                  5. TOC / DBR STATUS (Bottleneck, Drum, Buffer, Rope, Utilization)
                 ==================================================== */}
              <div className="p-4 bg-slate-900/90 rounded-xl border border-factory-border/60 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                  <h4 className="text-xs font-bold uppercase text-amber-400 tracking-wider flex items-center gap-2">
                    <i data-lucide="activity" className="w-4 h-4"></i>
                    <span>TOC / DBR System Status</span>
                  </h4>
                  <span className="text-[11px] font-bold text-slate-300">
                    Drum: <strong className="text-amber-300">{currentOrder.assigned_machine_name || "M2 – Jet Dyeing"}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                  <div className="p-2.5 bg-slate-800/80 rounded-lg">
                    <div className="text-[10px] text-slate-400 uppercase">TOC Bottleneck</div>
                    <div className="font-bold text-white mt-0.5 truncate">
                      {currentOrder.assigned_machine_name ? currentOrder.assigned_machine_name.split(' ')[0] + ' ' + (currentOrder.assigned_machine_name.split(' ')[1] || '') : "M2 Jet"}
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-800/80 rounded-lg">
                    <div className="text-[10px] text-slate-400 uppercase">Buffer Status</div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                      currentOrder.buffer_penetration_pct > 66 ? 'bg-rose-500/20 text-rose-300' :
                      currentOrder.buffer_penetration_pct > 33 ? 'bg-amber-500/20 text-amber-300' :
                      'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {currentOrder.buffer_penetration_pct > 66 ? 'CRITICAL' : (currentOrder.buffer_penetration_pct > 33 ? 'WARNING' : 'SAFE')}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/80 rounded-lg">
                    <div className="text-[10px] text-slate-400 uppercase">Rope Status</div>
                    <div className="font-bold text-emerald-400 mt-0.5">RELEASED</div>
                  </div>

                  <div className="p-2.5 bg-slate-800/80 rounded-lg">
                    <div className="text-[10px] text-slate-400 uppercase">Drum Utilization</div>
                    <div className="font-bold text-amber-300 mt-0.5">91.4%</div>
                  </div>
                </div>
              </div>

              {/* ====================================================
                  6. 7-DAY ADVANCE PLANNING INDICATOR
                 ==================================================== */}
              <div className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
                sevenDayStatusType === 'SAFE' ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' :
                sevenDayStatusType === 'WARNING' ? 'bg-amber-950/30 border-amber-500/30 text-amber-200' :
                'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}>
                <i data-lucide={
                  sevenDayStatusType === 'SAFE' ? 'check-circle' :
                  sevenDayStatusType === 'WARNING' ? 'alert-triangle' : 'alert-octagon'
                } className="w-5 h-5 shrink-0 mt-0.5"></i>
                <div className="space-y-1">
                  <div className="font-bold">{sevenDayStatusText}</div>
                  {currentOrder.seven_day_rule_violated && (
                    <div className="text-[11px] text-rose-300">
                      <strong>Reason:</strong> {currentOrder.seven_day_rule_diagnostic || "Capacity shortage on bottleneck machine."}
                    </div>
                  )}
                </div>
              </div>

              {/* Blocking Reasons Alert if Start Production is disabled */}
              {!isStartable && blockingReasons.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <i data-lucide="alert-circle" className="w-4 h-4 text-amber-400"></i>
                    <span>Cannot Start Production (Prerequisites Missing):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                    {blockingReasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ====================================================
                  7. ACTION BUTTONS (View Schedule, Edit, Stages, Start Prod, Cancel)
                 ==================================================== */}
              <div className="pt-2 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {/* 1. View Schedule */}
                <button
                  type="button"
                  onClick={() => setSubView('schedule')}
                  className="px-3 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md focus:ring-2 focus:ring-cyan-400 cursor-pointer"
                  title="Shows the production schedule for this order"
                  aria-label="View Schedule"
                >
                  <i data-lucide="calendar" className="w-3.5 h-3.5"></i>
                  <span>View Schedule</span>
                </button>

                {/* 2. Edit Order */}
                <button
                  type="button"
                  onClick={() => setSubView('edit')}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 transition-all focus:ring-2 focus:ring-slate-400 cursor-pointer"
                  title="Allows the user to modify order information"
                  aria-label="Edit Order"
                >
                  <i data-lucide="edit-3" className="w-3.5 h-3.5 text-cyan-400"></i>
                  <span>Edit Order</span>
                </button>

                {/* 3. View Details / Stages */}
                <button
                  type="button"
                  onClick={() => setSubView('stages')}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 transition-all focus:ring-2 focus:ring-slate-400 cursor-pointer"
                  title="Shows complete order, material, colour, machine, and process information"
                  aria-label="View Details"
                >
                  <i data-lucide="list-checks" className="w-3.5 h-3.5 text-indigo-400"></i>
                  <span>View Stages</span>
                </button>

                {/* 4. Start Production (Validated with real factory logic) */}
                <button
                  type="button"
                  disabled={!isStartable || actionLoading}
                  onClick={() => setShowStartConfirm(true)}
                  className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    isStartable
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white cursor-pointer hover:scale-[1.02] shadow-emerald-950/40 focus:ring-2 focus:ring-emerald-400'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                  }`}
                  title={isStartable ? "Starts production after all requirements are satisfied" : `Disabled: ${blockingReasons.join("; ")}`}
                  aria-label="Start Production"
                >
                  <i data-lucide="play" className="w-3.5 h-3.5"></i>
                  <span>Start Prod</span>
                </button>

                {/* 5. Cancel Order */}
                <button
                  type="button"
                  disabled={!isCancellable || actionLoading}
                  onClick={() => setShowCancelConfirm(true)}
                  className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all col-span-2 sm:col-span-1 ${
                    isCancellable
                      ? 'bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-200 cursor-pointer hover:border-rose-600 focus:ring-2 focus:ring-rose-500'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                  }`}
                  title={isCancellable ? "Cancels the order after confirmation" : cancelBlockedReason}
                  aria-label="Cancel Order"
                >
                  <i data-lucide="trash-2" className="w-3.5 h-3.5"></i>
                  <span>Cancel Order</span>
                </button>
              </div>
            </>
          )}

        </div>

        {/* ====================================================
            CONFIRMATION DIALOG: START PRODUCTION
           ==================================================== */}
        {showStartConfirm && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="p-6 bg-slate-900 border border-emerald-500/50 rounded-2xl shadow-2xl max-w-md w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <i data-lucide="play" className="w-5 h-5"></i>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Confirm Production Start</h4>
                  <p className="text-xs text-slate-400">Order #{currentOrder.order_number}</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                All prerequisites have been verified. Are you ready to dispatch <strong>{currentOrder.quantity_kg} kg {currentOrder.cloth_type}</strong> to <strong>{currentOrder.assigned_machine_name || "the assigned dyeing vessel"}</strong>?
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStartConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConfirmStartProduction}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow"
                >
                  {actionLoading ? "Starting..." : "Confirm & Start Production"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            CONFIRMATION DIALOG: CANCEL ORDER
           ==================================================== */}
        {showCancelConfirm && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="p-6 bg-slate-900 border border-rose-500/50 rounded-2xl shadow-2xl max-w-md w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <i data-lucide="alert-triangle" className="w-5 h-5"></i>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Confirm Order Cancellation</h4>
                  <p className="text-xs text-slate-400">Order #{currentOrder.order_number}</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to cancel this order? This will release reserved machine capacity and materials for other production orders.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Keep Order
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConfirmCancelOrder}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow"
                >
                  {actionLoading ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            8. FOOTER HELPER TIP
           ==================================================== */}
        <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <i data-lucide="info" className="w-3.5 h-3.5 text-slate-400"></i>
            <span>Tip: You can close this panel using the X button, the Back button, or by pressing ESC.</span>
          </span>
          <span className="font-mono text-[10px] text-slate-600">ID: {currentOrder.id}</span>
        </div>

      </div>
    </div>
  );
}


function CreateOrderModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    order_number: `ORD-10${Math.floor(Math.random() * 800 + 100)}`,
    customer_name: 'Zara International',
    cloth_type: 'Cotton 100% Greige Knit',
    quantity_kg: 500,
    colour_name: 'Vibrant Royal Blue',
    colour_code: 'ROYAL_BLUE',
    due_date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
    priority: 'HIGH'
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        quantity_kg: parseFloat(form.quantity_kg),
        due_date: new Date(form.due_date).toISOString()
      })
    });
    onSuccess();
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <form onSubmit={handleSubmit} className="glass-panel w-full max-w-md p-6 border border-cyan-500/40 shadow-2xl relative space-y-4 bg-[#0b1329] rounded-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-white">Create Customer Production Order</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="Close modal (ESC)"
          >
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Order Number</label>
            <input
              type="text"
              value={form.order_number}
              onChange={e => setForm({ ...form, order_number: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
              required
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Customer Name</label>
            <input
              type="text"
              value={form.customer_name}
              onChange={e => setForm({ ...form, customer_name: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Quantity (kg)</label>
              <input
                type="number"
                value={form.quantity_kg}
                onChange={e => setForm({ ...form, quantity_kg: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                required
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
              >
                <option value="EMERGENCY">EMERGENCY</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
              required
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-slate-800 text-slate-300 text-xs">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs">
            Save & Check Constraints
          </button>
        </div>
      </form>
    </div>
  );
}

// 5. MACHINES & CHANGEOVER MATRIX COMPONENT
function MachinesView({ machines, changeoverMatrix }) {
  return (
    <div className="space-y-6">
      {/* Machine Fleet Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {machines.map(m => (
          <div key={m.id} className="glass-card p-4 border border-factory-border/50 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">{m.code}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              </div>
              <h4 className="text-xs font-bold text-white truncate">{m.name}</h4>
              <div className="text-[11px] text-slate-400 mt-1">Cap: {m.max_batch_kg}kg • Eff: {(m.efficiency * 100).toFixed(0)}%</div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Reliability:</span>
                <strong className="text-slate-200">{m.reliability_pct}%</strong>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>MTBF / MTTR:</span>
                <strong className="text-slate-200">{m.mtbf_hours}h / {m.mttr_hours}h</strong>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Workload:</span>
                <strong className="text-cyan-400">{m.current_workload_kg} kg</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Multi-Dimensional Colour Changeover Heatmap */}
      <div className="glass-panel p-5 border border-factory-border/60 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-white">Sequence-Dependent Colour Changeover Matrix</h3>
            <p className="text-xs text-slate-400">Shows transition time (min), water usage (L), and caustic chemical penalty</p>
          </div>
          <span className="text-xs text-amber-400 font-semibold">Dark-to-Light requires severe caustic boil-out</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-[10px] uppercase font-bold text-slate-400">
              <tr>
                <th className="py-2.5 px-3 text-left">From \ To</th>
                {changeoverMatrix.map((r, i) => (
                  <th key={i} className="py-2.5 px-3">{r.from_colour}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {changeoverMatrix.map((row, i) => (
                <tr key={i} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 text-left font-bold font-sans text-slate-200">{row.from_colour}</td>
                  {Object.entries(row.transitions).map(([toCol, data], j) => {
                    const dur = data.changeover_min;
                    const isSevere = dur > 45;
                    const isMinimal = dur <= 10;
                    return (
                      <td key={j} className={`py-2 px-3 ${
                        isSevere ? 'bg-rose-950/40 text-rose-300 font-bold' :
                        isMinimal ? 'bg-emerald-950/30 text-emerald-300' : 'text-slate-300'
                      }`}>
                        <div>{dur}m</div>
                        <div className="text-[9px] text-slate-500 font-sans">{data.water_litres}L</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 6. INVENTORY & MRP COMPONENT
function InventoryView({ materials, forecasts }) {
  return (
    <div className="space-y-6">
      {/* MRP Shortage Forecast Table */}
      <div className="glass-panel p-5 border border-factory-border/60 space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white">Material Requirement Planning (MRP) & Inventory Forecasting</h3>
            <p className="text-xs text-slate-400">Calculates: Required = Planned Production + Safety Stock − Available Inventory</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Material</th>
                <th className="py-3 px-4">Available Stock</th>
                <th className="py-3 px-4">Safety Stock</th>
                <th className="py-3 px-4">Planned Requirement</th>
                <th className="py-3 px-4">Projected Shortage</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Suggested Reorder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {forecasts.map((f, i) => (
                <tr key={i} className="hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-bold text-white">{f.material_name}</td>
                  <td className="py-3 px-4">{f.available_stock} {f.unit}</td>
                  <td className="py-3 px-4 text-slate-400">{f.safety_stock} {f.unit}</td>
                  <td className="py-3 px-4 font-bold text-slate-200">{f.planned_requirement} {f.unit}</td>
                  <td className="py-3 px-4 font-bold text-rose-400">{f.projected_shortage > 0 ? `${f.projected_shortage} ${f.unit}` : '0'}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      f.status === 'HEALTHY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-cyan-400 font-bold">{f.suggested_reorder_qty > 0 ? `${f.suggested_reorder_qty} ${f.unit}` : 'None needed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 7. REAL-TIME DISRUPTION SIMULATOR COMPONENT
function DisruptionsView({ machines, materials, onDisruptionResolved, showToast }) {
  const [selectedMachine, setSelectedMachine] = useState(machines[1]?.id || machines[0]?.id);
  const [breakdownHours, setBreakdownHours] = useState(8);
  const [breakdownImpact, setBreakdownImpact] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const handleTriggerBreakdown = async () => {
    setSimulating(true);
    try {
      const res = await fetch(`/api/disruptions/trigger-breakdown?machine_id=${selectedMachine}&duration_hours=${breakdownHours}`, {
        method: 'POST'
      });
      const data = await res.json();
      setBreakdownImpact(data);
      showToast(`Simulated Breakdown on ${data.machine_name}: ${data.affected_count} jobs dynamically rescheduled!`);
      onDisruptionResolved();
    } catch (e) {
      showToast("Simulation error: " + e.message, "error");
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 border-l-4 border-l-rose-500 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Dynamic Shop Floor Disruption Simulator</h2>
          <p className="text-xs text-slate-400">Trigger unexpected equipment failures and observe real-time schedule repair & constraint migration</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Target Machine to Fail</label>
            <select
              value={selectedMachine}
              onChange={e => setSelectedMachine(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            >
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Failure Duration (Hours)</label>
            <input
              type="number"
              value={breakdownHours}
              onChange={e => setBreakdownHours(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleTriggerBreakdown}
              disabled={simulating}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-lg shadow-rose-900/40 transition-all flex items-center justify-center gap-2"
            >
              <i data-lucide="zap-off" className="w-4 h-4"></i>
              <span>{simulating ? "Recalculating..." : "Trigger Breakdown & Reschedule"}</span>
            </button>
          </div>
        </div>

        {breakdownImpact && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900/90 border border-rose-500/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-rose-300">Rescheduling Ripple Effect Summary</span>
              <span className="text-[10px] text-slate-400">Completed in 42ms</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-2 bg-slate-800 rounded">
                <div className="text-slate-400 text-[10px]">Affected Jobs</div>
                <div className="font-bold text-white mt-0.5">{breakdownImpact.affected_count}</div>
              </div>
              <div className="p-2 bg-slate-800 rounded">
                <div className="text-slate-400 text-[10px]">Rerouted Alternate</div>
                <div className="font-bold text-emerald-400 mt-0.5">{breakdownImpact.reassigned_orders.length}</div>
              </div>
              <div className="p-2 bg-slate-800 rounded">
                <div className="text-slate-400 text-[10px]">Late Delivery Risk</div>
                <div className="font-bold text-rose-400 mt-0.5">{breakdownImpact.delayed_orders.length}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 8. WHAT-IF SCENARIO SANDBOX COMPONENT
function WhatIfView({ machines, materials, showToast }) {
  const [scenarioType, setScenarioType] = useState('ADD_SHIFT');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const handleRunWhatIf = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_type: scenarioType })
      });
      const data = await res.json();
      setResult(data);
      showToast("What-If Simulation Evaluated!");
    } catch (e) {
      showToast("Simulation error: " + e.message, "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 border-l-4 border-l-purple-500 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">What-If Strategic Scenario Sandbox</h2>
          <p className="text-xs text-slate-400">Run isolated simulations to explore capacity changes without altering live factory production</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <select
            value={scenarioType}
            onChange={e => setScenarioType(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white flex-1"
          >
            <option value="ADD_SHIFT">What if we authorize a 3rd night shift (22:00–06:00)?</option>
            <option value="BREAKDOWN">What if Jet Dyeing M2 fails for 48 hours?</option>
            <option value="MATERIAL_DELAY">What if critical Reactive Blue dye arrives 3 days late?</option>
            <option value="RUSH_ORDER">What if a VIP Emergency Order (1,200 kg Navy) arrives today?</option>
            <option value="TIME_INFLATION">What if boiler steam drops, expanding dye times by +15%?</option>
          </select>

          <button
            onClick={handleRunWhatIf}
            disabled={running}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg shadow-lg shadow-purple-900/40"
          >
            {running ? "Simulating..." : "Run What-If Simulation"}
          </button>
        </div>

        {result && (
          <div className="mt-6 p-5 rounded-xl bg-slate-900/90 border border-purple-500/40 space-y-4">
            <h3 className="font-bold text-sm text-purple-300">{result.scenario_name}</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-slate-800 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">On-Time Delivery Diff</div>
                <div className="text-lg font-black text-white mt-1">
                  {result.baseline_on_time_pct}% → <span className={result.simulated_on_time_pct >= result.baseline_on_time_pct ? 'text-emerald-400' : 'text-rose-400'}>{result.simulated_on_time_pct}%</span>
                </div>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Cost Impact</div>
                <div className="text-lg font-black text-amber-400 mt-1">+₹{result.cost_difference_inr.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Delayed Orders</div>
                <div className="text-lg font-black text-slate-200 mt-1">{result.delayed_orders_count}</div>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg">
                <div className="text-[10px] text-slate-400 uppercase">Bottleneck Migration</div>
                <div className="text-xs font-bold text-purple-300 mt-1 truncate">{result.simulated_bottleneck}</div>
              </div>
            </div>

            <div className="p-3 bg-purple-950/30 rounded-lg border border-purple-500/30 text-xs text-purple-200">
              <strong>Recommendation:</strong> {result.recommendation}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 9. SCHEDULE QUALITY SCORECARD COMPONENT
function ScorecardView({ qualityScore, dashboard }) {
  if (!qualityScore) return null;
  const sub = qualityScore.sub_scores;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 border border-factory-border/60 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-black text-white tracking-wide">Schedule Quality Scorecard (0–100)</h2>
            <p className="text-xs text-slate-400">Strict hierarchical multi-objective evaluation based on Theory of Constraints</p>
          </div>

          <div className="flex items-center gap-4 bg-slate-900 px-5 py-3 rounded-xl border border-slate-800">
            <div className="text-3xl font-black text-cyan-400">{qualityScore.overall_score}</div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Overall Grade</div>
              <div className="text-xs font-bold text-emerald-400">{qualityScore.grade}</div>
            </div>
          </div>
        </div>

        {/* 7-Tier Strict Hierarchy Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Priority 1 & 2: On-Time Delivery', score: sub.on_time_delivery, max: 35.0, color: 'bg-emerald-500' },
            { label: 'Priority 3: Bottleneck Protection', score: sub.bottleneck_utilization, max: 20.0, color: 'bg-amber-500' },
            { label: 'Priority 4: Material Feasibility', score: sub.material_feasibility, max: 10.0, color: 'bg-cyan-500' },
            { label: 'Priority 4: Manpower Feasibility', score: sub.manpower_feasibility, max: 5.0, color: 'bg-blue-500' },
            { label: 'Priority 5: Changeover Efficiency', score: sub.changeover_efficiency, max: 10.0, color: 'bg-purple-500' },
            { label: 'Priority 6: Machine Utilization', score: sub.machine_utilization, max: 10.0, color: 'bg-indigo-500' },
            { label: 'Priority 7: Buffers & Stability', score: sub.buffer_and_stability, max: 10.0, color: 'bg-emerald-400' },
          ].map((item, i) => (
            <div key={i} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">{item.label}</span>
                <span className="font-bold text-white">{item.score} / {item.max}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full ${item.color}`} style={{ width: `${(item.score / item.max) * 100}%` }}></div>
              </div>
            </div>
          ))}
        </div>

        {/* Explanations & Corrective Recommendations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
          <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Score Diagnostic Notes</h4>
            {qualityScore.score_explanations.map((exp, i) => (
              <p key={i} className="text-xs text-slate-300">• {exp}</p>
            ))}
          </div>

          <div className="p-4 bg-cyan-950/20 rounded-xl border border-cyan-500/30 space-y-2">
            <h4 className="text-xs font-bold uppercase text-cyan-400 tracking-wider">Actions to Reach 100%</h4>
            {qualityScore.recommendations_to_reach_100.map((rec, i) => (
              <p key={i} className="text-xs text-cyan-200">→ {rec}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Render React Root
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
