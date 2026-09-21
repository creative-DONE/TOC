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
  const [dailyAgenda, setDailyAgenda] = useState(null);
  const [planningMatrix, setPlanningMatrix] = useState(null);
  const [agendaDays, setAgendaDays] = useState(7);

  // Load all data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [dashRes, schedRes, ordRes, machRes, matRes, foreRes, scoreRes, coRes, agendaRes, matrixRes] = await Promise.all([
        fetch('/api/dashboard/overview').then(r => r.json()),
        fetch(`/api/schedule/slots?tier=${selectedTier}`).then(r => r.json()),
        fetch('/api/orders').then(r => r.json()),
        fetch('/api/machines').then(r => r.json()),
        fetch('/api/materials').then(r => r.json()),
        fetch('/api/materials/forecast').then(r => r.json()),
        fetch('/api/schedule/quality-score').then(r => r.json()),
        fetch('/api/schedule/changeover-matrix').then(r => r.json()),
        fetch(`/api/schedule/daily-agenda?days=${agendaDays}`).then(r => r.json()),
        fetch(`/api/schedule/planning-matrix?days=${agendaDays}`).then(r => r.json())
      ]);

      setDashboard(dashRes);
      setSchedules(schedRes);
      setOrders(ordRes);
      setMachines(machRes);
      setMaterials(matRes);
      setForecasts(foreRes);
      setQualityScore(scoreRes);
      setChangeoverMatrix(coRes);
      setDailyAgenda(agendaRes);
      setPlanningMatrix(matrixRes);
    } catch (err) {
      console.error("Failed to load factory data", err);
    } finally {
      setLoading(false);
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 100);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedTier, agendaDays]);

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
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8FAFC] text-slate-900">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold tracking-wide">Initializing Intelligent TOC Production Scheduler...</h2>
        <p className="text-slate-400 text-sm mt-1">Analyzing machines, dyes, order readiness, and Drum bottlenecks</p>
      </div>
    );
  }

  if (!loading && !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8FAFC] text-slate-900 p-6 text-center">
        <div className="p-6 bg-rose-50 border border-rose-200 border border-rose-500/40 rounded-2xl max-w-md space-y-3">
          <i data-lucide="alert-triangle" className="w-10 h-10 text-rose-600 mx-auto"></i>
          <h2 className="text-lg font-bold text-slate-900">Failed to Connect to Factory API</h2>
          <p className="text-xs text-slate-600">Could not retrieve factory production data. Please ensure the backend server is running.</p>
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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
            <i data-lucide="layers" className="w-6 h-6 text-white"></i>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-bold text-lg text-slate-900 tracking-wide">PRIME TEXTILES</h1>
              <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-blue-600 border border-cyan-500/30">
                TOC DBR v2.0
              </span>
            </div>
            <p className="text-xs text-slate-400">Intelligent Drum-Buffer-Rope Textile Colouring Scheduler</p>
          </div>
        </div>

        {/* Active Drum Bottleneck Badge */}
        {dashboard && dashboard.bottleneck_info && (
          <div className="hidden lg:flex items-center gap-3 bg-amber-50 border border-amber-200 border border-amber-500/40 rounded-xl px-4 py-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></div>
            <div>
              <div className="text-[10px] uppercase font-bold text-amber-800/80 tracking-wider">Active TOC Drum</div>
              <div className="text-xs font-bold text-amber-200">{dashboard.bottleneck_info.resource_name} ({dashboard.bottleneck_info.utilization_pct}%)</div>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOptimize}
            disabled={optimizing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-md shadow-cyan-900/30 disabled:opacity-50"
          >
            <i data-lucide={optimizing ? "refresh-cw" : "zap"} className={`w-4 h-4 ${optimizing ? 'animate-spin' : ''}`}></i>
            <span>{optimizing ? "Optimizing..." : "Re-Optimize Schedule"}</span>
          </button>

          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer ${
              activeTab === 'calculator'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
            }`}
          >
            <i data-lucide="calculator" className={`w-4 h-4 ${activeTab === 'calculator' ? 'text-white' : 'text-blue-600'}`}></i>
            <span>Approx Time Calculator</span>
          </button>

          <a
            href="/api/reports/excel"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs text-xs font-medium transition-all"
            download
          >
            <i data-lucide="file-spreadsheet" className="w-4 h-4 text-emerald-600"></i>
            <span className="hidden sm:inline">Excel</span>
          </a>

          <a
            href="/api/reports/pdf"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs text-xs font-medium transition-all"
            download
          >
            <i data-lucide="file-text" className="w-4 h-4 text-rose-600"></i>
            <span className="hidden sm:inline">PDF</span>
          </a>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <nav className="bg-white/80 border-b border-slate-200 px-6 flex space-x-1 overflow-x-auto">
        {[
          { id: 'dashboard', label: 'TOC Command Center', icon: 'activity' },
          { id: 'agenda', label: 'Daily Production Agenda', icon: 'clipboard-list' },
          { id: 'calculator', label: 'Approx Time Calculator', icon: 'calculator' },
          { id: 'machines', label: 'Machines & Changeover Matrix', icon: 'cpu' },
          { id: 'disruptions', label: 'Disruption Event Simulator', icon: 'alert-triangle' },
          { id: 'whatif', label: 'What-If Scenario Sandbox', icon: 'git-branch' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
            }}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 bg-blue-50/70 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
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

        {activeTab === 'agenda' && (
          <AgendaView
            agenda={dailyAgenda}
            planningMatrix={planningMatrix}
            agendaDays={agendaDays}
            machines={machines}
            onChangeAgendaDays={(d) => setAgendaDays(d)}
            onSelectOrder={(ord) => setSelectedOrder(ord)}
            onSelectSlot={(slot) => setSelectedSlot(slot)}
            onRefresh={fetchData}
            showToast={showToast}
            onNavigateTab={(t) => setActiveTab(t)}
          />
        )}

        {activeTab === 'calculator' && (
          <ApproxTimeCalculatorView
            machines={machines}
            onRefresh={fetchData}
            showToast={showToast}
          />
        )}

        {activeTab === 'machines' && (
          <MachinesView
            machines={machines}
            changeoverMatrix={changeoverMatrix}
            onRefresh={fetchData}
            showToast={showToast}
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
            setActiveTab('agenda');
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
          { label: 'On-Time Delivery', value: `${dashboard.on_time_delivery_pct}%`, icon: 'clock', color: dashboard.on_time_delivery_pct >= 95 ? 'text-emerald-600' : 'text-rose-600', sub: `${dashboard.late_orders} Late Orders` },
          { label: 'Bottleneck Utilization', value: `${dashboard.bottleneck_utilization_pct}%`, icon: 'gauge', color: 'text-amber-700', sub: btn ? btn.resource_code : 'Active' },
          { label: 'Machine Utilization', value: `${dashboard.machine_utilization_pct}%`, icon: 'cpu', color: 'text-blue-600', sub: 'Fleet Average' },
          { label: 'Total Production', value: `${(dashboard.total_production_kg / 1000).toFixed(1)}k kg`, icon: 'package', color: 'text-blue-400', sub: `${dashboard.total_orders} Orders Planned` },
          { label: 'Schedule Stability', value: `${dashboard.schedule_stability_score}%`, icon: 'shield-check', color: 'text-indigo-400', sub: 'Low Nervousness' },
          { label: 'Total Operating Cost', value: `₹${(dashboard.total_operating_cost_inr / 1000).toFixed(0)}k`, icon: 'dollar-sign', color: 'text-emerald-600', sub: 'Power, Steam & Water' }
        ].map((kpi, i) => (
          <div key={i} className="glass-card p-4 flex flex-col justify-between border border-slate-200 hover:border-cyan-500/30 transition-all">
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
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-700 border border-amber-500/40 uppercase">
                THEORY OF CONSTRAINTS — ACTIVE DRUM
              </span>
              <span className="text-xs text-slate-400">Step 1 & 2: Identify & Exploit</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-wide">{btn.resource_name}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{btn.recommendation}</p>
          </div>

          <div className="flex items-center gap-6 bg-[#F8FAFC]/80 p-4 rounded-xl border border-slate-200">
            <div className="text-center">
              <div className="text-xs text-slate-400">Current Load</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{btn.workload_kg.toLocaleString()} kg</div>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="text-center">
              <div className="text-xs text-slate-400">Overload Hours</div>
              <div className="text-xl font-bold text-amber-700 mt-0.5">+{btn.overload_hours}h</div>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="text-center">
              <div className="text-xs text-slate-400">Buffer Status</div>
              <span className={`inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-bold ${
                btn.buffer_status === 'CRITICAL' ? 'bg-rose-500/20 text-rose-600 border border-rose-500/30' : 'bg-amber-500/20 text-amber-700 border border-amber-500/30'
              }`}>
                {btn.buffer_status} ({btn.buffer_penetration_pct}%)
              </span>
            </div>
          </div>
        </div>

        {/* 5 Focusing Steps Visual Stepper */}
        <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { step: '1. IDENTIFY', title: 'Find Constraint', desc: btn.resource_name, color: 'text-amber-700', active: true },
            { step: '2. EXPLOIT', title: 'Maximize Drum', desc: 'Zero idle time; sequence light-to-dark', color: 'text-blue-600', active: true },
            { step: '3. SUBORDINATE', title: 'Tie the Rope', desc: 'Pre-treatment throttled to 1500kg WIP', color: 'text-blue-400', active: true },
            { step: '4. ELEVATE', title: 'Increase Capacity', desc: 'Authorize 4h overtime if load >95%', color: 'text-purple-400', active: false },
            { step: '5. REPEAT', title: 'Dynamic Recalc', desc: 'Monitor next bottleneck emergence', color: 'text-emerald-600', active: true }
          ].map((s, i) => (
            <div key={i} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className={`text-[10px] font-bold uppercase ${s.color}`}>{s.step}</div>
              <div className="text-xs font-bold text-slate-700 mt-0.5">{s.title}</div>
              <div className="text-[11px] text-slate-400 mt-1 leading-snug">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Factory Utility Constraints */}
      <div className="glass-panel p-5 border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <i data-lucide="droplet" className="w-5 h-5 text-blue-600"></i>
            <h3 className="font-bold text-sm text-slate-900">Factory Utility & Resource Constraints</h3>
          </div>
          <span className="text-xs text-slate-400">Hourly Operating Caps</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'Water Treatment & Supply', current: 18.5, max: 25.0, unit: 'm³/hr', pct: 74, color: 'bg-cyan-500' },
            { name: 'Steam Boiler Output', current: 3100, max: 4000, unit: 'kg/hr', pct: 77.5, color: 'bg-amber-500' },
            { name: 'Substation Electricity', current: 480, max: 650, unit: 'kW', pct: 73.8, color: 'bg-blue-500' },
            { name: 'Effluent ETP Discharge', current: 16.2, max: 22.0, unit: 'm³/hr', pct: 73.6, color: 'bg-emerald-500' },
          ].map((u, i) => (
            <div key={i} className="p-3 bg-white/60 rounded-lg border border-slate-200">
              <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                <span>{u.name}</span>
                <span className="font-bold text-slate-900">{u.current} / {u.max} {u.unit}</span>
              </div>
              <div className="w-full h-2 bg-slate-50 rounded border border-slate-200-full overflow-hidden mt-2">
                <div className={`h-full ${u.color} rounded-full`} style={{ width: `${u.pct}%` }}></div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5">
                <span>Capacity load</span>
                <span className="font-semibold text-slate-600">{u.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
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
      <div className="glass-panel w-full max-w-2xl bg-white border border-cyan-500/50 shadow-2xl rounded-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-800">
        
        {/* ====================================================
            1. TOP NAVIGATION HEADER (Back Button + Title + Close Button)
           ==================================================== */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              if (subView !== 'overview') setSubView('overview');
              else onClose();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs hover:border-cyan-500/60 text-xs font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer"
            title={subView !== 'overview' ? "Back to Order Details" : "Back to Orders list"}
            aria-label={subView !== 'overview' ? "Back to Order Details" : "Back to Orders list"}
          >
            <i data-lucide="arrow-left" className="w-4 h-4 text-blue-600"></i>
            <span>{subView !== 'overview' ? "Back to Details" : "Back to Orders"}</span>
          </button>

          <div className="text-center">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Production Order Control</span>
            <div className="text-xs font-bold text-slate-900">{currentOrder.order_number}</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-900/50 text-slate-400 hover:text-rose-200 border border-slate-300 hover:border-rose-500/50 flex items-center justify-center transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500"
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
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <i data-lucide="edit-3" className="w-4 h-4 text-blue-600"></i>
                  <h3 className="text-sm font-bold text-slate-900">Edit Order: {currentOrder.order_number}</h3>
                </div>
                <span className="text-xs text-slate-400">Status: <strong>{currentOrder.status}</strong></span>
              </div>

              {isInProduction && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
                  <i data-lucide="lock" className="w-4 h-4 text-amber-700 shrink-0 mt-0.5"></i>
                  <div>
                    <strong>Locked Fields:</strong> Fabric, quantity, and dye shade cannot be modified because this batch is actively in production. You may only update priority and notes.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-slate-700 block mb-1 font-medium">Fabric Quantity (kg)</label>
                  <input
                    type="number"
                    disabled={isInProduction}
                    value={editForm.quantity_kg}
                    onChange={e => setEditForm({ ...editForm, quantity_kg: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-700 block mb-1 font-medium">Customer Due Date</label>
                  <input
                    type="date"
                    disabled={isInProduction}
                    value={editForm.due_date}
                    onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-700 block mb-1 font-medium">Cloth / Fabric Type</label>
                  <input
                    type="text"
                    disabled={isInProduction}
                    value={editForm.cloth_type}
                    onChange={e => setEditForm({ ...editForm, cloth_type: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-700 block mb-1 font-medium">Colour Name</label>
                  <input
                    type="text"
                    disabled={isInProduction}
                    value={editForm.colour_name}
                    onChange={e => setEditForm({ ...editForm, colour_name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-700 block mb-1 font-medium">Order Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="EMERGENCY" className="text-slate-900 bg-white">EMERGENCY (Top Priority)</option>
                    <option value="HIGH" className="text-slate-900 bg-white">HIGH Priority</option>
                    <option value="MEDIUM" className="text-slate-900 bg-white">MEDIUM Priority</option>
                    <option value="LOW" className="text-slate-900 bg-white">LOW Priority</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-700 block mb-1 font-medium">Notes / Special Instructions</label>
                  <input
                    type="text"
                    value={editForm.notes}
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="e.g. Export grade finish required"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSubView('overview')}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-600 text-xs font-semibold transition-all"
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
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <i data-lucide="calendar" className="w-4 h-4 text-blue-600"></i>
                  <h3 className="text-sm font-bold text-slate-900">Production Schedule: {currentOrder.order_number}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView('overview')}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <i data-lucide="arrow-left" className="w-3.5 h-3.5"></i>
                  <span>Back to Details</span>
                </button>
              </div>

              {scheduleData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase">Assigned Machine</div>
                      <div className="font-bold text-slate-900 mt-1">{scheduleData.machine_name || currentOrder.assigned_machine_name}</div>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase">Assigned Operator</div>
                      <div className="font-bold text-slate-900 mt-1">{scheduleData.operator_name || currentOrder.assigned_operator_name || "Master Dyer"}</div>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase">Planned Start</div>
                      <div className="font-bold text-blue-700 mt-1">
                        {scheduleData.planned_start ? new Date(scheduleData.planned_start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Unassigned"}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase">Planned End</div>
                      <div className="font-bold text-blue-700 mt-1">
                        {scheduleData.planned_end ? new Date(scheduleData.planned_end).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Unassigned"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase">Base Processing</div>
                      <div className="font-bold text-slate-900 mt-1">{(scheduleData.base_processing_min / 60).toFixed(1)} hours</div>
                      <div className="text-[10px] text-slate-500">{scheduleData.base_processing_min} min</div>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase">Changeover Time</div>
                      <div className="font-bold text-amber-700 mt-1">{scheduleData.changeover_min} min</div>
                      <div className="text-[10px] text-slate-500">Includes cleaning</div>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase">Estimated Cost</div>
                      <div className="font-bold text-emerald-600 mt-1">₹{scheduleData.operating_cost_inr.toFixed(0)}</div>
                      <div className="text-[10px] text-slate-500">Power & Water included</div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <i data-lucide="shield-check" className="w-4 h-4 text-blue-600"></i>
                      <span>Freeze Window: <strong className="text-slate-900 font-bold">{currentOrder.freeze_level || "FLEXIBLE"}</strong></span>
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
                <div className="p-6 text-center text-xs text-slate-400 bg-white/50 rounded-xl border border-slate-200">
                  <i data-lucide="clock" className="w-8 h-8 mx-auto text-slate-600 mb-2"></i>
                  <p>Order is currently in PENDING state and will be allocated a slot during the next optimization run.</p>
                </div>
              )}
            </div>
          )}

          {/* SUB-VIEW: PROCESS STAGES */}
          {subView === 'stages' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <i data-lucide="git-commit" className="w-4 h-4 text-blue-600"></i>
                  <h3 className="text-sm font-bold text-slate-900">10-Stage Textile Pipeline Progress</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView('overview')}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
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
                  <div key={i} className="flex items-center justify-between p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-600">
                        {st.sequence_order || i + 1}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900">{st.stage_name}</div>
                        <div className="text-[10px] text-slate-400">{st.assigned_resource} • {st.duration_minutes} min</div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      st.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-600' :
                      st.status === 'IN_PROGRESS' ? 'bg-cyan-500/20 text-blue-700 border border-cyan-500/40 animate-pulse' :
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shrink-0">
                    <i data-lucide="package" className="w-6 h-6"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="order-details-title" className="text-xl font-black text-slate-900 tracking-tight">{currentOrder.order_number}</h2>
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        currentOrder.priority === 'EMERGENCY' ? 'bg-rose-500/20 text-rose-700 border border-rose-500/40' :
                        currentOrder.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-800 border border-amber-500/40' :
                        'bg-slate-800 text-slate-600'
                      }`}>
                        {currentOrder.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">{currentOrder.customer_name} • {currentOrder.customer_priority_tier || "VIP Customer"}</p>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex flex-col sm:items-end">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      isInProduction ? 'bg-cyan-500/20 text-blue-700 border border-cyan-500/40 animate-pulse' :
                      currentOrder.status === 'READY' ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/40' :
                      currentOrder.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                      currentOrder.status === 'COMPLETED' ? 'bg-emerald-600 text-white' :
                      currentOrder.status === 'CANCELLED' ? 'bg-rose-950 text-rose-600 border border-rose-800' :
                      'bg-slate-800 text-slate-600'
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
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5">
                    <i data-lucide="layers" className="w-3.5 h-3.5 text-blue-600"></i>
                    <span>Fabric & Volume</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{currentOrder.quantity_kg} kg</div>
                  <div className="text-slate-600 truncate">{currentOrder.cloth_type}</div>
                </div>

                {/* Colour & Recipe */}
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5">
                    <i data-lucide="palette" className="w-3.5 h-3.5 text-amber-700"></i>
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
                    <span className="text-sm font-bold text-slate-900 truncate">{currentOrder.colour_name}</span>
                  </div>
                  <div className="text-slate-400 text-[11px]">{currentOrder.colour_code}</div>
                </div>

                {/* Due Date & Planning Slack */}
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5">
                    <i data-lucide="calendar" className="w-3.5 h-3.5 text-emerald-600"></i>
                    <span>Due Date</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{new Date(currentOrder.due_date).toLocaleDateString()}</div>
                  <div className="text-slate-400 text-[11px]">
                    {daysBeforeDue > 0 ? `Target in ${daysBeforeDue} days` : "Due today / overdue"}
                  </div>
                </div>
              </div>

              {/* ====================================================
                  4. SCHEDULING RATIONALE (Structured Bullet Points)
                 ==================================================== */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-blue-600 tracking-wider flex items-center gap-2">
                    <i data-lucide="sparkles" className="w-4 h-4"></i>
                    <span>Scheduling Rationale</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">AI Drum-Buffer-Rope Justification</span>
                </div>
                
                <div className="space-y-1.5 text-xs text-slate-700">
                  {structuredReasons.map((reason, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <i data-lucide="check" className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5"></i>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ====================================================
                  5. TOC / DBR STATUS (Bottleneck, Drum, Buffer, Rope, Utilization)
                 ==================================================== */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <h4 className="text-xs font-bold uppercase text-amber-700 tracking-wider flex items-center gap-2">
                    <i data-lucide="activity" className="w-4 h-4"></i>
                    <span>TOC / DBR System Status</span>
                  </h4>
                  <span className="text-[11px] font-bold text-slate-600">
                    Drum: <strong className="text-amber-800">{currentOrder.assigned_machine_name || "M2 – Jet Dyeing"}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-[10px] text-slate-400 uppercase">TOC Bottleneck</div>
                    <div className="font-bold text-slate-900 mt-0.5 truncate">
                      {currentOrder.assigned_machine_name ? currentOrder.assigned_machine_name.split(' ')[0] + ' ' + (currentOrder.assigned_machine_name.split(' ')[1] || '') : "M2 Jet"}
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-[10px] text-slate-400 uppercase">Buffer Status</div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                      currentOrder.buffer_penetration_pct > 66 ? 'bg-rose-500/20 text-rose-700' :
                      currentOrder.buffer_penetration_pct > 33 ? 'bg-amber-500/20 text-amber-800' :
                      'bg-emerald-500/20 text-emerald-700'
                    }`}>
                      {currentOrder.buffer_penetration_pct > 66 ? 'CRITICAL' : (currentOrder.buffer_penetration_pct > 33 ? 'WARNING' : 'SAFE')}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-[10px] text-slate-400 uppercase">Rope Status</div>
                    <div className="font-bold text-emerald-600 mt-0.5">RELEASED</div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-[10px] text-slate-400 uppercase">Drum Utilization</div>
                    <div className="font-bold text-amber-800 mt-0.5">91.4%</div>
                  </div>
                </div>
              </div>

              {/* Blocking Reasons Alert if Start Production is disabled */}
              {!isStartable && blockingReasons.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <i data-lucide="alert-circle" className="w-4 h-4 text-amber-700"></i>
                    <span>Cannot Start Production (Prerequisites Missing):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-[11px]">
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
                  className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs hover:border-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 transition-all focus:ring-2 focus:ring-slate-400 cursor-pointer"
                  title="Allows the user to modify order information"
                  aria-label="Edit Order"
                >
                  <i data-lucide="edit-3" className="w-3.5 h-3.5 text-blue-600"></i>
                  <span>Edit Order</span>
                </button>

                {/* 3. View Details / Stages */}
                <button
                  type="button"
                  onClick={() => setSubView('stages')}
                  className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs hover:border-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 transition-all focus:ring-2 focus:ring-slate-400 cursor-pointer"
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
                      : 'bg-slate-800 text-slate-500 border border-slate-300/50 cursor-not-allowed opacity-60'
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
                      : 'bg-slate-800 text-slate-500 border border-slate-300/50 cursor-not-allowed opacity-60'
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
            <div className="p-6 bg-white border border-emerald-500/50 rounded-2xl shadow-2xl max-w-md w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                  <i data-lucide="play" className="w-5 h-5"></i>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Confirm Production Start</h4>
                  <p className="text-xs text-slate-400">Order #{currentOrder.order_number}</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                All prerequisites have been verified. Are you ready to dispatch <strong>{currentOrder.quantity_kg} kg {currentOrder.cloth_type}</strong> to <strong>{currentOrder.assigned_machine_name || "the assigned dyeing vessel"}</strong>?
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStartConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-600 text-xs font-semibold"
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
            <div className="p-6 bg-white border border-rose-500/50 rounded-2xl shadow-2xl max-w-md w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-600 flex items-center justify-center">
                  <i data-lucide="alert-triangle" className="w-5 h-5"></i>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Confirm Order Cancellation</h4>
                  <p className="text-xs text-slate-400">Order #{currentOrder.order_number}</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to cancel this order? This will release reserved machine capacity and materials for other production orders.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-600 text-xs font-semibold"
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
        <div className="px-5 py-2.5 bg-white border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
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
      <form onSubmit={handleSubmit} className="glass-panel w-full max-w-md p-6 border border-cyan-500/40 shadow-2xl relative space-y-4 bg-white rounded-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">Create Customer Production Order</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer"
            title="Close modal (ESC)"
          >
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-700 block mb-1">Order Number</label>
            <input
              type="text"
              value={form.order_number}
              onChange={e => setForm({ ...form, order_number: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900"
              required
            />
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Customer Name</label>
            <input
              type="text"
              value={form.customer_name}
              onChange={e => setForm({ ...form, customer_name: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Quantity (kg)</label>
              <input
                type="number"
                value={form.quantity_kg}
                onChange={e => setForm({ ...form, quantity_kg: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900"
                required
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900"
              >
                <option value="EMERGENCY" className="text-slate-900 bg-white">EMERGENCY</option>
                <option value="HIGH" className="text-slate-900 bg-white">HIGH</option>
                <option value="MEDIUM" className="text-slate-900 bg-white">MEDIUM</option>
                <option value="LOW" className="text-slate-900 bg-white">LOW</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900"
              required
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-slate-800 text-slate-600 text-xs">
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

// =========================================================================
// 4B. INDUSTRIAL DAY-TO-DAY PRODUCTION AGENDA & EDITABLE DISPATCH TABLE
// =========================================================================

const COLOUR_HEX_MAP = {
  WHITE: '#ffffff',
  SKY_BLUE: '#38bdf8',
  GOLDEN_YELLOW: '#eab308',
  ROYAL_BLUE: '#2563eb',
  SCARLET_RED: '#dc2626',
  DEEP_NAVY: '#1e3a8a',
  JET_BLACK: '#0f172a',
  PASTEL_PINK: '#f472b6'
};

const COLOUR_OPTIONS = [
  { code: 'WHITE', name: 'Optical Bleached White' },
  { code: 'SKY_BLUE', name: 'Sky Blue Pastel' },
  { code: 'GOLDEN_YELLOW', name: 'Golden Yellow' },
  { code: 'ROYAL_BLUE', name: 'Vibrant Royal Blue' },
  { code: 'SCARLET_RED', name: 'Scarlet Red' },
  { code: 'DEEP_NAVY', name: 'Deep Navy Blue' },
  { code: 'JET_BLACK', name: 'Jet Black Reactive' },
  { code: 'PASTEL_PINK', name: 'Pastel Baby Pink' }
];

const OPERATOR_OPTIONS = [
  { id: 1, name: 'Rajesh Kumar (Master Dyer)' },
  { id: 2, name: 'Suresh Patel (Senior Operator)' },
  { id: 3, name: 'Amit Sharma (Dyeing Tech)' },
  { id: 4, name: 'Vikram Singh (Assistant Dyer)' }
];

// 1. Focused In-Table Edit Modal
function EditScheduleModal({ task, machines, onClose, onSave, loading }) {
  const initialDate = task.planned_start ? task.planned_start.split('T')[0] : new Date().toISOString().split('T')[0];
  const initialStartTime = task.start_time_str || (task.planned_start ? task.planned_start.split('T')[1].substring(0, 5) : '08:00');
  const initialEndTime = task.end_time_str || (task.planned_end ? task.planned_end.split('T')[1].substring(0, 5) : '12:30');

  const [form, setForm] = useState({
    slot_id: task.slot_id || task.id,
    date: initialDate,
    shift: task.shift || 'SHIFT_A',
    start_time: initialStartTime,
    end_time: initialEndTime,
    machine_id: task.machine_id,
    cloth_type: task.cloth_type || 'Cotton 100% Greige Knit',
    quantity_kg: task.quantity_kg || 500,
    colour_name: task.colour_name || 'Vibrant Royal Blue',
    colour_code: task.colour_code || 'ROYAL_BLUE',
    changeover_min: task.changeover_min || 0,
    operator_id: task.operator_id || 1,
    status: task.status || 'SCHEDULED'
  });

  const handleShiftChange = (shiftVal) => {
    let sTime = form.start_time;
    let eTime = form.end_time;
    if (shiftVal === 'SHIFT_A') { sTime = '06:00'; eTime = '10:30'; }
    else if (shiftVal === 'SHIFT_B') { sTime = '14:00'; eTime = '18:30'; }
    else if (shiftVal === 'SHIFT_C') { sTime = '22:00'; eTime = '02:30'; }
    setForm({ ...form, shift: shiftVal, start_time: sTime, end_time: eTime });
  };

  const handleColourChange = (cCode) => {
    const found = COLOUR_OPTIONS.find(c => c.code === cCode);
    setForm({
      ...form,
      colour_code: cCode,
      colour_name: found ? found.name : cCode
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const plannedStartIso = `${form.date}T${form.start_time}:00`;
    const plannedEndIso = `${form.date}T${form.end_time}:00`;

    onSave({
      ...form,
      planned_start: plannedStartIso,
      planned_end: plannedEndIso,
      quantity_kg: parseFloat(form.quantity_kg),
      changeover_min: parseFloat(form.changeover_min),
      machine_id: parseInt(form.machine_id),
      operator_id: parseInt(form.operator_id)
    });
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <form onSubmit={handleSubmit} className="glass-panel w-full max-w-xl p-6 border border-cyan-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-blue-600">
              <i data-lucide="edit-3" className="w-4 h-4"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Edit Scheduled Job: {task.order_number}</h3>
              <p className="text-[11px] text-slate-400">{task.customer_name} • Slot #{task.slot_id || task.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer"
          >
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        {/* Form Body */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          {/* Date */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Production Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
              required
            />
          </div>

          {/* Shift */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Factory Shift</label>
            <select
              value={form.shift}
              onChange={e => handleShiftChange(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
            >
              <option value="SHIFT_A" className="text-slate-900 bg-white">Shift A (Morning 06:00 - 14:00)</option>
              <option value="SHIFT_B" className="text-slate-900 bg-white">Shift B (Afternoon 14:00 - 22:00)</option>
              <option value="SHIFT_C" className="text-slate-900 bg-white">Shift C (Night 22:00 - 06:00)</option>
            </select>
          </div>

          {/* Start Time */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Planned Start Time</label>
            <input
              type="time"
              value={form.start_time}
              onChange={e => setForm({ ...form, start_time: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
              required
            />
          </div>

          {/* End Time */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Planned End Time</label>
            <input
              type="time"
              value={form.end_time}
              onChange={e => setForm({ ...form, end_time: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
              required
            />
          </div>

          {/* Machine Selection */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Assigned Vessel / Machine</label>
            <select
              value={form.machine_id}
              onChange={e => setForm({ ...form, machine_id: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
            >
              {(machines || []).map(m => (
                <option key={m.id} value={m.id} className="text-slate-900 bg-white">
                  {m.name} (Max {m.max_batch_kg}kg - {m.machine_type})
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Fabric Quantity (kg)</label>
            <input
              type="number"
              value={form.quantity_kg}
              onChange={e => setForm({ ...form, quantity_kg: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
              required
              min="10"
              max="2000"
            />
          </div>

          {/* Colour Shade */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Dye Shade / Colour</label>
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full border border-white/40 shrink-0 shadow"
                style={{ backgroundColor: COLOUR_HEX_MAP[form.colour_code] || '#38bdf8' }}
              ></span>
              <select
                value={form.colour_code}
                onChange={e => handleColourChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
              >
                {COLOUR_OPTIONS.map(c => (
                  <option key={c.code} value={c.code} className="text-slate-900 bg-white">{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Setup / Changeover */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Setup / Changeover (min)</label>
            <input
              type="number"
              value={form.changeover_min}
              onChange={e => setForm({ ...form, changeover_min: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
              min="0"
              max="180"
            />
          </div>

          {/* Operator */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Assigned Operator</label>
            <select
              value={form.operator_id}
              onChange={e => setForm({ ...form, operator_id: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
            >
              {OPERATOR_OPTIONS.map(op => (
                <option key={op.id} value={op.id} className="text-slate-900 bg-white">{op.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-slate-700 block mb-1 font-medium">Dispatch Status</label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-cyan-500"
            >
              <option value="SCHEDULED" className="text-slate-900 bg-white">SCHEDULED</option>
              <option value="IN_PROGRESS" className="text-slate-900 bg-white">IN_PROGRESS</option>
              <option value="COMPLETED" className="text-slate-900 bg-white">COMPLETED</option>
            </select>
          </div>
        </div>

        {/* Dynamic Reorganization Notice */}
        <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-[11px] text-cyan-200 flex items-start gap-2.5">
          <i data-lucide="zap" className="w-4 h-4 text-blue-600 shrink-0 mt-0.5"></i>
          <div>
            <strong>Dynamic TOC Reorganization:</strong> Saving will automatically cascade downstream jobs on the machine, recalculate colour changeovers from the sequence matrix, and update Drum buffers.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-600 text-xs font-semibold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white text-xs font-bold transition-all shadow-md shadow-cyan-900/40 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <i data-lucide="refresh-cw" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}></i>
            <span>Save & Reorganize Schedule</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// 2. Multi-Step Reorganizing Progress Modal
function ReorganizingProgressModal({ step, machineName }) {
  const steps = [
    { num: 1, title: 'Validating machine & operator constraints...', icon: 'shield-check' },
    { num: 2, title: 'Recalculating colour changeovers & setups...', icon: 'sparkles' },
    { num: 3, title: `Reorganizing downstream queue on ${machineName || 'vessel'}...`, icon: 'layers' },
    { num: 4, title: 'Synchronizing Drum-Buffer-Rope buffers...', icon: 'activity' },
    { num: 5, title: 'Schedule successfully re-optimized!', icon: 'check-circle-2' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-md p-6 border border-cyan-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-blue-600">
            <i data-lucide="refresh-cw" className="w-5 h-5 animate-spin"></i>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Dynamic Schedule Reorganization</h3>
            <p className="text-xs text-slate-400">TOC Drum-Buffer-Rope Real-Time Cascade</p>
          </div>
        </div>

        <div className="space-y-2.5 py-2">
          {steps.map(s => {
            const isCompleted = step > s.num;
            const isCurrent = step === s.num;
            return (
              <div
                key={s.num}
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                  isCompleted ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-700' :
                  isCurrent ? 'bg-blue-50 border border-blue-200 border-cyan-500 text-blue-700 shadow-md ring-1 ring-cyan-500/40' :
                  'bg-white/40 border-slate-200 text-slate-500'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isCompleted ? 'bg-emerald-500 text-black' :
                  isCurrent ? 'bg-cyan-500 text-black animate-pulse' :
                  'bg-slate-800 text-slate-500'
                }`}>
                  {isCompleted ? '✓' : s.num}
                </div>
                <span className="text-xs font-medium flex-1">{s.title}</span>
                {isCurrent && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>}
              </div>
            );
          })}
        </div>

        <div className="pt-2 text-[11px] text-center text-slate-500">
          Cascading downstream jobs to eliminate overlaps & protect Drum buffer
        </div>
      </div>
    </div>
  );
}

// 3. Locked Job Conflict Resolution Modal
function LockedConflictModal({ conflictData, onKeepLocked, onUnlockAndOptimize, onCancel }) {
  if (!conflictData) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-lg p-6 border border-amber-500/60 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center">
            <i data-lucide="lock" className="w-5 h-5"></i>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Conflict with Locked Production Job</h3>
            <p className="text-xs text-amber-800">Protected Freeze Window Constraint</p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 border border-amber-500/40 text-xs text-amber-200 leading-relaxed space-y-2">
          <p>
            The proposed schedule collides with <strong>{conflictData.locked_order}</strong> on <strong>{conflictData.machine_name}</strong>.
          </p>
          <div className="p-2 bg-slate-50 rounded border border-slate-200 font-mono text-[11px] text-amber-800">
            Locked Slot: {new Date(conflictData.locked_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(conflictData.locked_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Protected)
          </div>
          <p className="text-[11px] text-slate-600">
            Under TOC DBR rules, locked jobs represent committed shop floor dispatches and cannot be displaced automatically.
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={onUnlockAndOptimize}
            className="w-full p-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow cursor-pointer"
          >
            <i data-lucide="unlock" className="w-4 h-4"></i>
            <span>Unlock Conflicting Task and Re-Optimize Both</span>
          </button>

          <button
            type="button"
            onClick={onKeepLocked}
            className="w-full p-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <i data-lucide="clock" className="w-4 h-4 text-blue-600"></i>
            <span>Keep Locked Task & Choose Another Time/Machine</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full p-2 rounded-xl bg-transparent hover:bg-rose-50 border border-rose-200 text-slate-400 hover:text-rose-700 text-xs font-semibold transition-all text-center cursor-pointer"
          >
            Cancel Change
          </button>
        </div>
      </div>
    </div>
  );
}

// 4. "Schedule Re-Optimized: What Changed" Diff Modal
function ReorganizeDiffModal({ diff, onClose }) {
  if (!diff) return null;
  const shifted = diff.shifted_jobs || [];
  const bufferAlerts = diff.buffer_alerts || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-2xl max-h-[90vh] flex flex-col p-6 border border-cyan-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-blue-600">
              <i data-lucide="zap" className="w-4 h-4"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Schedule Re-Optimized: What Changed</h3>
              <p className="text-xs text-slate-400">Dynamic ripple effects across shop floor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer"
          >
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        {/* Impact KPI Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0 text-xs">
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Shifted Batches</div>
            <div className="text-base font-black text-blue-600 mt-0.5">{shifted.length}</div>
            <div className="text-[10px] text-slate-500">Downstream adjusted</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Changeover Delta</div>
            <div className={`text-base font-black mt-0.5 ${diff.changeover_delta_min > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
              {diff.changeover_delta_min > 0 ? `+${diff.changeover_delta_min}` : diff.changeover_delta_min} min
            </div>
            <div className="text-[10px] text-slate-500">{diff.changeover_delta_min > 0 ? 'Washing washout' : 'Setup saved'}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Drum Bottleneck</div>
            <div className="text-base font-black text-amber-800 mt-0.5">{diff.bottleneck_utilization_pct || 89.5}%</div>
            <div className="text-[10px] text-slate-500 truncate">{diff.bottleneck_resource || 'Vessel M2'}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Buffer Alerts</div>
            <div className={`text-base font-black mt-0.5 ${bufferAlerts.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {bufferAlerts.length}
            </div>
            <div className="text-[10px] text-slate-500">{bufferAlerts.length > 0 ? 'Penetration shift' : 'All safe'}</div>
          </div>
        </div>

        {/* Shifted Batches Detail List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          <div>
            <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <i data-lucide="layers" className="w-3.5 h-3.5 text-blue-600"></i>
              <span>Cascaded Downstream Jobs ({shifted.length})</span>
            </h4>
            {shifted.length === 0 ? (
              <div className="p-3 rounded-lg bg-white/50 border border-slate-200 text-slate-500 italic text-center">
                No downstream jobs required shifting; sufficient buffer gaps existed.
              </div>
            ) : (
              <div className="space-y-1.5">
                {shifted.map((sh, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{sh.order_number}</span>
                        <span className="text-[10px] font-normal text-slate-400">• {sh.machine_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {sh.old_start} → <strong className="text-blue-700">{sh.new_start}</strong>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      sh.delta_min > 0 ? 'bg-amber-500/20 text-amber-800 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/40'
                    }`}>
                      {sh.delta_min > 0 ? `+${sh.delta_min}m delayed` : `${sh.delta_min}m advanced`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Buffer Alerts List */}
          {bufferAlerts.length > 0 && (
            <div>
              <h4 className="font-bold text-rose-700 mb-2 flex items-center gap-1.5">
                <i data-lucide="alert-triangle" className="w-3.5 h-3.5 text-rose-600"></i>
                <span>Buffer Status Changes</span>
              </h4>
              <div className="space-y-1.5">
                {bufferAlerts.map((ba, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/40 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{ba.order_number}</span>
                      <span className="text-slate-400 text-[11px] ml-2">Penetration: {ba.penetration_pct}%</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-700 border border-rose-500/40">
                      {ba.old_status} → {ba.new_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow cursor-pointer"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// PRODUCTION PLANNING MATRIX MODALS & COMPONENT
// =========================================================================

// 1. Cell Action Modal (Move, Remove, Toggle Lock)
function MatrixCellActionModal({ data, machines, onClose, onMove, onRemove, onToggleLock, onSelectOrder, loading }) {
  if (!data) return null;
  const { order, machine, cell } = data;
  const [targetMachineId, setTargetMachineId] = React.useState(
    machines.find(m => m.id !== machine.id)?.id || machine.id
  );

  const selectedTarget = machines.find(m => m.id === Number(targetMachineId));
  const isOverCapacity = selectedTarget && (order.quantity_kg > selectedTarget.capacity_kg);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-md p-6 border border-cyan-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-blue-600">
              <i data-lucide="cpu" className="w-5 h-5"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Machine Allocation</h3>
              <p className="text-xs text-slate-400">{order.order_number} • {machine.code}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        {/* Order Details Preview */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Customer:</span>
            <span className="font-bold text-slate-900">{order.customer_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Fabric & Colour:</span>
            <span className="font-medium text-slate-700">{order.cloth_type} • {order.colour_name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Quantity:</span>
            <span className="font-bold text-blue-700">{order.quantity_kg?.toLocaleString()} kg</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Planned Schedule:</span>
            <span className="font-bold text-slate-900">{order.planned_day_label}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Freeze Window:</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              cell.is_locked ? 'bg-amber-500/20 text-amber-800 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/40'
            }`}>
              {cell.is_locked ? '🔒 LOCKED' : '🔓 FLEXIBLE'}
            </span>
          </div>
        </div>

        {/* Action 1: Move to another machine */}
        <div className="p-3 bg-white/60 rounded-xl border border-slate-200 space-y-2.5">
          <label className="block text-xs font-bold text-slate-600">
            Move Order to Another Machine:
          </label>
          <div className="flex gap-2">
            <select
              value={targetMachineId}
              onChange={e => setTargetMachineId(Number(e.target.value))}
              className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
            >
              {machines.map(m => (
                <option key={m.id} value={m.id} disabled={m.id === machine.id} className="text-slate-900 bg-white">
                  {m.code} — {m.name} (Cap: {m.capacity_kg}kg, Load: {m.current_load_kg}kg) {m.id === machine.id ? '(Current)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => onMove(targetMachineId)}
              disabled={loading || targetMachineId === machine.id}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow disabled:opacity-50 cursor-pointer"
            >
              Move
            </button>
          </div>
          {isOverCapacity && (
            <div className="p-2 rounded bg-amber-50 border border-amber-200 border border-amber-500/40 text-[11px] text-amber-800 flex items-center gap-1.5">
              <i data-lucide="alert-triangle" className="w-3.5 h-3.5 shrink-0"></i>
              <span>Capacity Notice: Order ({order.quantity_kg}kg) exceeds {selectedTarget?.code} limit ({selectedTarget?.capacity_kg}kg).</span>
            </div>
          )}
        </div>

        {/* Other Actions: Lock Toggle, Remove, Details */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onToggleLock}
            disabled={loading}
            className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              cell.is_locked
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-800 hover:bg-amber-500/30'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <i data-lucide={cell.is_locked ? "unlock" : "lock"} className="w-3.5 h-3.5"></i>
            <span>{cell.is_locked ? "Unlock Order" : "Lock Order"}</span>
          </button>

          <button
            onClick={onRemove}
            disabled={loading}
            className="p-2.5 rounded-xl bg-rose-950/30 hover:bg-rose-900/50 border border-rose-600/40 text-rose-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="trash-2" className="w-3.5 h-3.5"></i>
            <span>Unassign Vessel</span>
          </button>
        </div>

        <button
          onClick={() => { onClose(); onSelectOrder(order); }}
          className="w-full py-2 bg-slate-100 hover:bg-slate-700 text-slate-600 rounded-xl text-xs font-medium border border-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <i data-lucide="external-link" className="w-3.5 h-3.5 text-blue-600"></i>
          <span>View Full Order Details & Process Stages</span>
        </button>
      </div>
    </div>
  );
}

// 2. Assign Order Modal (Clicking unassigned cell)
function MatrixAssignModal({ data, onClose, onAssign, loading }) {
  if (!data) return null;
  const { order, machine } = data;
  const [plannedDay, setPlannedDay] = React.useState(order.planned_day || 1);
  const isOverCapacity = order.quantity_kg > machine.capacity_kg;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-md p-6 border border-cyan-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-blue-600">
              <i data-lucide="plus-circle" className="w-5 h-5"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Assign Order to Machine</h3>
              <p className="text-xs text-slate-400">{order.order_number} → {machine.code}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Machine:</span>
            <span className="font-bold text-slate-900">{machine.name} ({machine.code})</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Machine Max Capacity:</span>
            <span className="font-bold text-blue-700">{machine.capacity_kg} kg</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Order Batch Weight:</span>
            <span className="font-bold text-slate-900">{order.quantity_kg} kg</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Fabric & Colour:</span>
            <span className="font-medium text-slate-700">{order.cloth_type} • {order.colour_name}</span>
          </div>
        </div>

        {isOverCapacity && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 border border-amber-500/40 text-xs text-amber-800 flex items-center gap-2">
            <i data-lucide="alert-triangle" className="w-4 h-4 shrink-0 text-amber-700"></i>
            <div>
              <strong>Capacity Warning:</strong> Order ({order.quantity_kg}kg) exceeds {machine.code} nominal capacity ({machine.capacity_kg}kg). Multi-batch splitting will be evaluated.
            </div>
          </div>
        )}

        {/* Planned Day Selection */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-600">Target Planned Day:</label>
          <select
            value={plannedDay}
            onChange={e => setPlannedDay(Number(e.target.value))}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-1 focus:ring-cyan-500 cursor-pointer"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 21, 30].map(d => (
              <option key={d} value={d} className="text-slate-900 bg-white">
                Day {d} {d === 1 ? '(Today)' : (d === 2 ? '(Tomorrow)' : '')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-700 text-slate-600 text-xs font-bold transition-all border border-slate-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onAssign(plannedDay)}
            className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow cursor-pointer disabled:opacity-50"
          >
            {loading ? "Assigning..." : "Confirm & Re-Optimize"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 3. Edit Order Row Modal (Order #, Quantity, Planned Day, Fabric, Colour)
function MatrixEditRowModal({ order, onClose, onSave, loading }) {
  if (!order) return null;
  const initialDueDate = order.due_date ? order.due_date.split('T')[0] : new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0];
  const [form, setForm] = React.useState({
    order_number: order.order_number,
    quantity_kg: order.quantity_kg,
    due_date: initialDueDate,
    due_day: order.due_day || 7,
    planned_day: order.planned_day || 0,
    cloth_type: order.cloth_type,
    colour_name: order.colour_name,
    colour_code: order.colour_code
  });

  const handleDueDateChange = (val) => {
    if (!val) return;
    const dDate = new Date(val + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.max(1, Math.round((dDate - today) / 86400000) + 1);
    setForm(prev => ({ ...prev, due_date: val, due_day: diffDays }));
  };

  const handleDueDayChange = (dNum) => {
    const num = Number(dNum);
    const newD = new Date();
    newD.setDate(newD.getDate() + (num - 1));
    setForm(prev => ({ ...prev, due_day: num, due_date: newD.toISOString().split('T')[0] }));
  };

  const handleColourChange = (code) => {
    const opt = COLOUR_OPTIONS.find(c => c.code === code);
    setForm(prev => ({
      ...prev,
      colour_code: code,
      colour_name: opt ? opt.name : prev.colour_name
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-lg p-6 border border-cyan-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <i data-lucide="edit-3" className="w-5 h-5"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Edit Order & Due Date</h3>
              <p className="text-xs text-slate-400">Modify schedule matrix row parameters</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            onSave(form);
          }}
          className="space-y-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Order Number</label>
              <input
                type="text"
                value={form.order_number}
                onChange={e => setForm({ ...form, order_number: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Quantity (kg)</label>
              <input
                type="number"
                step="10"
                value={form.quantity_kg}
                onChange={e => setForm({ ...form, quantity_kg: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Due Date (Deadline)</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => handleDueDateChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Due Day (Relative)</label>
              <select
                value={form.due_day}
                onChange={e => handleDueDayChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500 cursor-pointer font-medium"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 21, 30].map(d => (
                  <option key={d} value={d} className="text-slate-900 bg-white">
                    Day {d} {d === 1 ? '(Today)' : (d === 2 ? '(Tomorrow)' : '')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Planned Day</label>
              <select
                value={form.planned_day}
                onChange={e => setForm({ ...form, planned_day: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500 cursor-pointer font-medium"
              >
                <option value={0} className="text-slate-900 bg-white">⚡ Auto-Calculate (By Capacity & Due Date)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 21, 30].map(d => (
                  <option key={d} value={d} className="text-slate-900 bg-white">
                    Day {d} {d === 1 ? '(Today)' : (d === 2 ? '(Tomorrow)' : '')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Fabric Type</label>
              <input
                type="text"
                value={form.cloth_type}
                onChange={e => setForm({ ...form, cloth_type: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 mb-1 font-medium">Target Colour</label>
            <div className="flex gap-2">
              <select
                value={form.colour_code}
                onChange={e => handleColourChange(e.target.value)}
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500 cursor-pointer"
              >
                {COLOUR_OPTIONS.map(c => (
                  <option key={c.code} value={c.code} className="text-slate-900 bg-white">{c.name} ({c.code})</option>
                ))}
              </select>
              <div
                className="w-9 h-9 rounded-lg border border-slate-300 shrink-0 shadow"
                style={{ backgroundColor: COLOUR_HEX_MAP[form.colour_code] || '#38bdf8' }}
              ></div>
            </div>
          </div>

          <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl text-[11px] text-blue-700">
            <i data-lucide="info" className="w-3.5 h-3.5 inline mr-1"></i>
            Saving will trigger automatic plant reorganization: re-evaluating vessel capacity, due-date urgency, sequencing colour changeovers, and updating Drum buffers.
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-700 text-slate-600 font-bold border border-slate-300 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow cursor-pointer disabled:opacity-50"
            >
              {loading ? "Re-Optimizing..." : "Save & Re-Optimize"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 4. Add New Order Modal
function MatrixAddOrderModal({ machines, onClose, onAdd, loading }) {
  const defaultDueDate = new Date();
  defaultDueDate.setDate(defaultDueDate.getDate() + 6);
  const defaultDueDateStr = defaultDueDate.toISOString().split('T')[0];

  const [form, setForm] = React.useState({
    order_number: `ORD-${Math.floor(100 + Math.random() * 900)}`,
    customer_name: 'Vardhman Textiles Ltd',
    cloth_type: 'Single Jersey 100% Cotton',
    colour_name: 'Vibrant Royal Blue',
    colour_code: 'ROYAL_BLUE',
    quantity_kg: 400,
    due_date: defaultDueDateStr,
    due_day: 7,
    customer_tier: 'TIER_2',
    planned_day: 0,
    machine_id: null,
    priority: 'MEDIUM'
  });

  const handleDueDateChange = (val) => {
    if (!val) return;
    const dDate = new Date(val + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.max(1, Math.round((dDate - today) / 86400000) + 1);
    setForm(prev => ({ ...prev, due_date: val, due_day: diffDays }));
  };

  const handleDueDayChange = (dNum) => {
    const num = Number(dNum);
    const newD = new Date();
    newD.setDate(newD.getDate() + (num - 1));
    setForm(prev => ({ ...prev, due_day: num, due_date: newD.toISOString().split('T')[0] }));
  };

  const handleColourChange = (code) => {
    const opt = COLOUR_OPTIONS.find(c => c.code === code);
    setForm(prev => ({
      ...prev,
      colour_code: code,
      colour_name: opt ? opt.name : prev.colour_name
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-lg p-6 border border-cyan-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <i data-lucide="plus" className="w-5 h-5"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Add Order to Planning Matrix</h3>
              <p className="text-xs text-slate-400">Insert new batch directly into factory schedule</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            onAdd(form);
          }}
          className="space-y-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Order Number</label>
              <input
                type="text"
                value={form.order_number}
                onChange={e => setForm({ ...form, order_number: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Customer</label>
              <input
                type="text"
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Batch Weight (kg)</label>
              <input
                type="number"
                step="10"
                value={form.quantity_kg}
                onChange={e => setForm({ ...form, quantity_kg: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Customer Priority / Tier</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500 cursor-pointer font-medium"
              >
                <option value="EMERGENCY" className="text-slate-900 bg-white">Tier 1 - VIP / Emergency (Top Urgency)</option>
                <option value="HIGH" className="text-slate-900 bg-white">Tier 1 - Commercial High</option>
                <option value="MEDIUM" className="text-slate-900 bg-white">Tier 2 - Commercial Standard</option>
                <option value="LOW" className="text-slate-900 bg-white">Tier 3 - Utility / Flexible</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Customer Due Date (Deadline)</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => handleDueDateChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Due Day (Relative)</label>
              <select
                value={form.due_day}
                onChange={e => handleDueDayChange(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500 cursor-pointer font-medium"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 21, 30].map(d => (
                  <option key={d} value={d} className="text-slate-900 bg-white">
                    Day {d} {d === 1 ? '(Today)' : (d === 2 ? '(Tomorrow)' : '')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Planned Day</label>
              <select
                value={form.planned_day}
                onChange={e => setForm({ ...form, planned_day: Number(e.target.value) })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500 cursor-pointer font-medium"
              >
                <option value={0} className="text-slate-900 bg-white">⚡ Auto-Calculate (By Capacity & Due Date)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 21, 30].map(d => (
                  <option key={d} value={d} className="text-slate-900 bg-white">
                    Day {d} {d === 1 ? '(Today)' : (d === 2 ? '(Tomorrow)' : '')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Fabric Type</label>
              <input
                type="text"
                value={form.cloth_type}
                onChange={e => setForm({ ...form, cloth_type: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Colour</label>
              <div className="flex gap-2">
                <select
                  value={form.colour_code}
                  onChange={e => handleColourChange(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                >
                  {COLOUR_OPTIONS.map(c => (
                    <option key={c.code} value={c.code} className="text-slate-900 bg-white">{c.name}</option>
                  ))}
                </select>
                <div
                  className="w-9 h-9 rounded-lg border border-slate-300 shrink-0 shadow"
                  style={{ backgroundColor: COLOUR_HEX_MAP[form.colour_code] || '#38bdf8' }}
                ></div>
              </div>
            </div>
            <div>
              <label className="block text-slate-700 mb-1 font-medium">Machine Allocation</label>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold flex items-center gap-2">
                <i data-lucide="cpu" className="w-4 h-4 text-blue-600"></i>
                <span>⚡ Automatic Selection (By Capacity &amp; Due Date)</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-700 text-slate-600 font-bold border border-slate-300 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow cursor-pointer disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add & Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 5. Delete Order Confirmation Modal
function MatrixDeleteConfirmModal({ order, onClose, onConfirm, loading }) {
  if (!order) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-sm p-6 border border-rose-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-600">
            <i data-lucide="trash-2" className="w-5 h-5"></i>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Delete Order</h3>
            <p className="text-xs text-slate-400">{order.order_number}</p>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Are you sure you want to delete order <strong>{order.order_number}</strong> ({order.quantity_kg}kg)? All assigned production slots will be removed, and downstream machine dispatches will be re-optimized.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-700 text-slate-600 text-xs font-bold border border-slate-300 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow cursor-pointer disabled:opacity-50"
          >
            {loading ? "Deleting..." : "Delete & Reorganize"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 6. Excel Import Orders Modal (.xlsx upload)
function ExcelImportModal({ onClose, onImportSuccess, showToast }) {
  const [file, setFile] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/orders/import-excel', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.detail || data.error || 'Failed to import Excel file.', 'error');
        setUploading(false);
        return;
      }
      setResult(data);
      showToast(data.message || 'Orders imported and scheduled successfully!', 'success');
      setTimeout(() => {
        onImportSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      showToast('Network error during Excel upload: ' + err.message, 'error');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-md p-6 border border-blue-500/50 shadow-2xl bg-white rounded-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <i data-lucide="file-spreadsheet" className="w-5 h-5"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Import Orders from Excel</h3>
              <p className="text-xs text-slate-400">Upload .xlsx production schedule template</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="p-5 border-2 border-dashed border-slate-300 rounded-xl text-center bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              required
            />
            <i data-lucide="upload-cloud" className="w-8 h-8 text-blue-600 mx-auto mb-2"></i>
            {file ? (
              <div>
                <p className="font-bold text-slate-900">{file.name}</p>
                <p className="text-[11px] text-slate-500 font-mono">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="font-bold text-slate-800">Select or drop Excel (.xlsx) file</p>
                <p className="text-[11px] text-slate-400 mt-1">Columns: Job number, Product ID, Customer level, Quantity, Colour, Due Date, Delivery time</p>
              </div>
            )}
          </div>

          {result && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <i data-lucide="check-circle" className="w-4 h-4 text-emerald-600 shrink-0"></i>
              <span>{result.message}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || uploading}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow cursor-pointer disabled:opacity-50"
            >
              {uploading ? "Importing & Optimizing..." : "Upload & Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// 5. PRODUCTION PLANNING MATRIX & DAILY AGENDA VIEW
// =========================================================================
function AgendaView({ agenda, planningMatrix, agendaDays, machines, onChangeAgendaDays, onSelectOrder, onSelectSlot, onRefresh, showToast, onNavigateTab }) {
  // Local states
  const [localMatrix, setLocalMatrix] = React.useState(planningMatrix || null);
  const [viewMode, setViewMode] = React.useState('matrix'); // 'matrix' (default Excel table) or 'timeline' (shift detail)
  const [matrixSearch, setMatrixSearch] = React.useState('');
  const [selectedDayIdx, setSelectedDayIdx] = React.useState(0);
  const [isGrouped, setIsGrouped] = React.useState(true);
  const [filterMachine, setFilterMachine] = React.useState('ALL');
  const [filterShift, setFilterShift] = React.useState('ALL');
  const [filterStatus, setFilterStatus] = React.useState('ALL');

  // Matrix Modals
  const [cellActionData, setCellActionData] = React.useState(null);
  const [assignModalData, setAssignModalData] = React.useState(null);
  const [editRowOrder, setEditRowOrder] = React.useState(null);
  const [addOrderOpen, setAddOrderOpen] = React.useState(false);
  const [deleteOrder, setDeleteOrder] = React.useState(null);
  const [excelImportOpen, setExcelImportOpen] = React.useState(false);

  // Column Sorting state (default: order_number ascending)
  const [sortField, setSortField] = React.useState('order_number');
  const [sortDirection, setSortDirection] = React.useState('asc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Reorganizing states
  const [reorganizingStep, setReorganizingStep] = React.useState(null);
  const [diffData, setDiffData] = React.useState(null);
  const [lockedConflict, setLockedConflict] = React.useState(null);
  const [pendingReq, setPendingReq] = React.useState(null);
  const [lockingOrderId, setLockingOrderId] = React.useState(null);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [reorganizeMsg, setReorganizeMsg] = React.useState(null);

  // Keep localMatrix in sync with planningMatrix prop
  React.useEffect(() => {
    if (planningMatrix) {
      setLocalMatrix(planningMatrix);
    }
  }, [planningMatrix]);

  // Fetch matrix data independently when needed
  const fetchMatrix = async () => {
    try {
      const res = await fetch(`/api/schedule/planning-matrix?days=${agendaDays}`);
      const data = await res.json();
      setLocalMatrix(data);
    } catch (err) {
      console.error("Failed to load planning matrix:", err);
    }
  };

  React.useEffect(() => {
    fetchMatrix();
  }, [agendaDays]);

  // Inline machine batch time editing in matrix header
  const [editingMatrixMachId, setEditingMatrixMachId] = React.useState(null);
  const [matrixBatchTimeValues, setMatrixBatchTimeValues] = React.useState({});
  const [savingMatrixMachId, setSavingMatrixMachId] = React.useState(null);
  const [savedSuccessMachId, setSavedSuccessMachId] = React.useState(null);

  const handleSaveMatrixBatchTime = async (m) => {
    const rawVal = matrixBatchTimeValues[m.id] !== undefined ? matrixBatchTimeValues[m.id] : m.processing_time_hours;
    const val = parseFloat(rawVal);
    if (isNaN(val) || val <= 0) {
      if (showToast) {
        showToast('Batch time must be greater than 0 hours.', 'error');
      } else {
        alert('Batch time must be greater than 0 hours.');
      }
      return;
    }

    setSavingMatrixMachId(m.id);
    try {
      const res = await fetch(`/api/machines/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...m,
          processing_time_hours: val,
          capacity_kg: m.capacity_kg || m.max_batch_kg
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update machine batch processing time');
      }
      const updated = await res.json();

      // Immediately update local matrix state for snappy UI
      setLocalMatrix(prev => {
        if (!prev) return prev;
        const newMachines = (prev.machines || []).map(mach =>
          mach.id === m.id ? { ...mach, processing_time_hours: val } : mach
        );
        return { ...prev, machines: newMachines };
      });

      setEditingMatrixMachId(null);
      setSavedSuccessMachId(m.id);
      setTimeout(() => {
        setSavedSuccessMachId(prevId => prevId === m.id ? null : prevId);
      }, 2500);

      if (showToast) {
        showToast(`✓ ${m.code} batch processing time updated to ${val} hr!`);
      }

      // Re-fetch all data and re-evaluate planning matrix
      if (onRefresh) onRefresh();
      fetchMatrix();
    } catch (err) {
      if (showToast) {
        showToast('Error saving batch time: ' + err.message, 'error');
      } else {
        alert('Error saving batch time: ' + err.message);
      }
    } finally {
      setSavingMatrixMachId(null);
    }
  };

  React.useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // Handle Matrix manual edit action with complete TOC DBR reorganization
  const handleMatrixAction = async (reqData, forceOverride = false, forceUnlockConflicts = false) => {
    setPendingReq(reqData);
    setActionLoading(true);
    setReorganizingStep(1);

    const t1 = setTimeout(() => setReorganizingStep(2), 200);
    const t2 = setTimeout(() => setReorganizingStep(3), 450);
    const t3 = setTimeout(() => setReorganizingStep(4), 700);

    try {
      const res = await fetch('/api/schedule/matrix/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...reqData,
          force_override: forceOverride,
          force_unlock_conflicts: forceUnlockConflicts
        })
      });
      const data = await res.json();

      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      if (data.conflict) {
        setReorganizingStep(null);
        setActionLoading(false);
        setLockedConflict({ ...data, pendingReq: reqData });
        return;
      }

      if (data.warning && !forceOverride) {
        setReorganizingStep(null);
        setActionLoading(false);
        if (window.confirm(`${data.warning}\n\nDo you wish to force override and proceed?`)) {
          handleMatrixAction(reqData, true, forceUnlockConflicts);
        }
        return;
      }

      if (!data.success) {
        setReorganizingStep(null);
        setActionLoading(false);
        alert(data.error || 'Failed to reorganize schedule.');
        return;
      }

      // Success step
      setReorganizingStep(5);
      setTimeout(async () => {
        setReorganizingStep(null);
        setActionLoading(false);
        setCellActionData(null);
        setAssignModalData(null);
        setEditRowOrder(null);
        setAddOrderOpen(false);
        setDeleteOrder(null);
        setLockedConflict(null);
        setPendingReq(null);
        setReorganizeMsg(data.message);
        if (data.diff) {
          setDiffData(data.diff);
        }
        await onRefresh();
        await fetchMatrix();
        showToast(data.message || 'Schedule re-optimized successfully!', 'success');
      }, 400);

    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      setReorganizingStep(null);
      setActionLoading(false);
      showToast('Error communicating with scheduler: ' + err.message, 'error');
    }
  };

  // Quick Lock/Unlock toggle for an order
  const handleToggleOrderLock = async (orderId) => {
    setLockingOrderId(orderId);
    try {
      await handleMatrixAction({ action: 'TOGGLE_LOCK', order_id: orderId });
    } finally {
      setLockingOrderId(null);
    }
  };

  // Planning Matrix data derived values
  const matrixMachines = localMatrix?.machines || machines || [];
  const matrixOrders = localMatrix?.orders || [];
  const activeConstraint = localMatrix?.active_constraint || null;
  const matrixSummary = localMatrix?.summary || {};

  // Filter and sort matrix orders
  const filteredMatrixOrders = React.useMemo(() => {
    let list = matrixOrders;
    if (matrixSearch.trim()) {
      const q = matrixSearch.toLowerCase();
      list = list.filter(o =>
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.cloth_type || '').toLowerCase().includes(q) ||
        (o.colour_name || '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      let valA, valB;
      if (sortField === 'order_number') {
        const numA = parseInt(String(a.order_number).replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.order_number).replace(/\D/g, ''), 10) || 0;
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      } else if (sortField === 'due_date') {
        valA = a.due_day !== undefined ? a.due_day : 999;
        valB = b.due_day !== undefined ? b.due_day : 999;
      } else if (sortField === 'planned_day') {
        valA = a.planned_day || 999;
        valB = b.planned_day || 999;
      } else if (sortField === 'quantity_kg') {
        valA = a.quantity_kg || 0;
        valB = b.quantity_kg || 0;
      } else {
        valA = a[sortField] || '';
        valB = b[sortField] || '';
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [matrixOrders, matrixSearch, sortField, sortDirection]);

  // Timeline mode tasks extraction (from agenda prop)
  const days = agenda?.days || [];
  const allFlatTasks = React.useMemo(() => {
    const list = [];
    days.forEach(d => {
      ['SHIFT_A', 'SHIFT_B', 'SHIFT_C'].forEach(sKey => {
        const shiftObj = d.shifts?.[sKey];
        (shiftObj?.tasks || []).forEach(t => {
          list.push({
            ...t,
            date: d.date,
            day_name: d.day_name,
            formatted_date: d.formatted_date,
            shift_key: sKey,
            shift_label: t.shift_label || shiftObj.name || sKey
          });
        });
      });
    });
    return list;
  }, [days]);

  const filteredTimelineTasks = React.useMemo(() => {
    return allFlatTasks.filter(t => {
      if (selectedDayIdx !== null && days[selectedDayIdx] && t.date !== days[selectedDayIdx].date) return false;
      if (filterMachine !== 'ALL' && String(t.machine_id) !== String(filterMachine)) return false;
      if (filterShift !== 'ALL' && t.shift_key !== filterShift && t.shift !== filterShift) return false;
      if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
      return true;
    });
  }, [allFlatTasks, selectedDayIdx, filterMachine, filterShift, filterStatus, days]);

  return (
    <div className="space-y-4">
      {/* 1. Re-Optimization Success Diff Notification Banner */}
      {reorganizeMsg && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 border border-cyan-500/50 shadow-lg flex items-center justify-between gap-3 text-xs text-cyan-200 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="p-1 rounded-full bg-cyan-500/20 text-blue-600">
              <i data-lucide="check-circle-2" className="w-4 h-4"></i>
            </span>
            <span className="font-semibold">{reorganizeMsg}</span>
          </div>
          <div className="flex items-center gap-2">
            {diffData && (
              <button
                onClick={() => setDiffData(diffData)}
                className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] transition-all cursor-pointer"
              >
                View Changes
              </button>
            )}
            <button
              onClick={() => setReorganizeMsg(null)}
              className="text-slate-600 hover:text-slate-900 p-1"
            >
              <i data-lucide="x" className="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      )}

      {/* 1B. Due Date Capacity Shortage Alert Banner */}
      {matrixSummary?.due_date_shortages_count > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-rose-900 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 shrink-0">
              <i data-lucide="alert-triangle" className="w-5 h-5"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                  DUE DATE CAPACITY SHORTAGE DETECTED
                </span>
                <span className="font-bold">
                  {matrixSummary.due_date_shortages_count} Order{matrixSummary.due_date_shortages_count > 1 ? 's' : ''} exceed available machine capacity before due date!
                </span>
              </div>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Eligible machines lack sufficient cumulative capacity before the customer deadline. Orders have been scheduled sequentially across subsequent production days to prevent daily capacity overloads.
              </p>
            </div>
          </div>
          {matrixSummary.late_orders_count > 0 && (
            <span className="px-2.5 py-1 rounded bg-rose-200 text-rose-900 font-bold text-[11px] shrink-0 border border-rose-300">
              {matrixSummary.late_orders_count} Late Order{matrixSummary.late_orders_count > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* 2. Active TOC Constraint (Drum) Banner - DYNAMICALLY CALCULATED */}
      {activeConstraint && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-[#0b1329] to-slate-900 border border-amber-500/50 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-700 shrink-0">
              <i data-lucide="zap" className="w-5 h-5 animate-pulse"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded border border-amber-500/40">
                  ACTIVE TOC DRUM CONSTRAINT
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {activeConstraint.resource_name} ({activeConstraint.resource_code})
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                Current Utilization: <strong className="text-amber-800">{activeConstraint.utilization_pct}%</strong> | Scheduled Workload: <strong className="text-slate-900 font-bold">{activeConstraint.current_load_kg} kg</strong> of {activeConstraint.capacity_kg} kg nominal
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 hidden lg:flex items-center gap-1.5">
            <i data-lucide="shield-check" className="w-3.5 h-3.5 text-blue-600"></i>
            <span>TOC 5 Focusing Steps Active • Re-evaluated dynamically on each edit</span>
          </div>
        </div>
      )}

      {/* 3. Dynamic KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-3.5 border border-slate-200 flex items-center gap-3 bg-white/90 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <i data-lucide="package" className="w-4 h-4"></i>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Planned Dyeing</div>
            <div className="text-sm font-bold text-slate-900">
              {(matrixSummary.planned_dyeing_kg || 0).toLocaleString()} kg
            </div>
          </div>
        </div>

        <div className="glass-card p-3.5 border border-slate-200 flex items-center gap-3 bg-white/90 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <i data-lucide="check-circle-2" className="w-4 h-4"></i>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Scheduled Batches</div>
            <div className="text-sm font-bold text-slate-900">
              {matrixSummary.total_batches || 0} batches
            </div>
          </div>
        </div>

        <div className="glass-card p-3.5 border border-slate-200 flex items-center gap-3 bg-white/90 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-400 shrink-0">
            <i data-lucide="sparkles" className="w-4 h-4"></i>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Changeovers / Setup</div>
            <div className="text-sm font-bold text-slate-900">
              {matrixSummary.total_changeover_min || 0} mins
            </div>
          </div>
        </div>

        <div className="glass-card p-3.5 border border-slate-200 flex items-center gap-3 bg-white/90 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 border border-amber-500/30 flex items-center justify-center text-amber-700 shrink-0">
            <i data-lucide="wrench" className="w-4 h-4"></i>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Maintenance Downtime</div>
            <div className="text-sm font-bold text-amber-800">
              {matrixSummary.maintenance_hours || 0} hrs
            </div>
          </div>
        </div>
      </div>

      {/* 3B. Compact Machine Load Summary */}
      <div className="glass-panel p-3.5 border border-slate-200 rounded-xl bg-white/80 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <i data-lucide="cpu" className="w-4 h-4 text-blue-600"></i>
            <span>Machine Fleet Load & Utilization Summary</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Real-Time DBR Capacity</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {(localMatrix?.machine_load_summary || []).map(m => (
            <div
              key={m.id}
              className={`p-2.5 rounded-lg border transition-all ${
                m.is_bottleneck
                  ? 'bg-amber-50 border border-amber-200 border-amber-500/60 ring-1 ring-amber-500/40'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">{m.code}</span>
                {m.is_bottleneck ? (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-800 border border-amber-500/50 uppercase animate-pulse">
                    Drum
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-medium">{m.utilization_pct}%</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 truncate" title={m.name}>{m.name}</div>
              <div className="flex items-center justify-between text-[10px] text-slate-600 mt-1 pt-1 border-t border-slate-200">
                <span>Cap: {m.capacity_kg}kg</span>
                <span className="font-semibold text-blue-700">{m.current_load_kg}kg</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3C. Sequential Day Schedule Summary with Machine Breakdown */}
      <div className="glass-panel p-3.5 border border-slate-200 rounded-xl bg-white/80 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
          <div className="flex items-center gap-1.5">
            <i data-lucide="calendar" className="w-4 h-4 text-blue-600"></i>
            <span>Daily Production Capacity & Machine Breakdown (Day 1 – Day {agendaDays})</span>
          </div>
          <span className="text-[10px] text-slate-400">Hard Daily Machine Capacities Enforced (Zero Overload)</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1.5 scrollbar-thin">
          {(localMatrix?.day_summary || []).map(ds => (
            <div
              key={ds.day}
              className="flex-shrink-0 p-3 rounded-xl bg-slate-50 border border-slate-200 min-w-[210px] flex flex-col justify-between space-y-2 shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-blue-600">{ds.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    ds.utilization_pct >= 100 ? 'bg-amber-500/20 text-amber-800 border border-amber-500/40' :
                    ds.utilization_pct > 0 ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/40' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {ds.utilization_pct}%
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-xs">
                  <span className="font-extrabold text-slate-900">{ds.total_kg.toLocaleString()} kg</span>
                  <span className="text-[10px] text-slate-400 font-medium">/ {(ds.factory_capacity_kg || 4800).toLocaleString()} kg</span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center justify-between mt-0.5">
                  <span>Rem: <strong className="text-slate-700">{(ds.remaining_kg || 0).toLocaleString()} kg</strong></span>
                  <span>{ds.active_jobs} batches</span>
                </div>
              </div>

              {/* Machine breakdown for this day */}
              {ds.machine_breakdown && ds.machine_breakdown.length > 0 && (
                <div className="pt-2 border-t border-slate-200/80 space-y-1">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Machine Daily Load</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {ds.machine_breakdown.map(mb => (
                      <div
                        key={mb.code}
                        className={`px-1.5 py-0.5 rounded border flex items-center justify-between ${
                          mb.load_kg > 0
                            ? (mb.utilization_pct >= 100 ? 'bg-amber-50 border border-amber-200 border-amber-600/50 text-amber-200' : 'bg-slate-50 border border-slate-200 border-slate-300 text-blue-700')
                            : 'bg-white/50 border-slate-200 text-slate-500'
                        }`}
                        title={`${mb.name}: ${mb.load_kg} / ${mb.capacity_kg} kg (${mb.utilization_pct}%)`}
                      >
                        <span className="font-bold">{mb.code}:</span>
                        <span>{mb.load_kg}/{mb.capacity_kg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 4. Action Toolbar & View Mode Switcher */}
      <div className="glass-panel p-3.5 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          {/* + Add Order Button */}
          <button
            onClick={() => setAddOrderOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow cursor-pointer shrink-0"
          >
            <i data-lucide="plus" className="w-3.5 h-3.5"></i>
            <span>Add Order</span>
          </button>

          {/* Approx Time Calculator Button */}
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('calculator')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-blue-700 font-bold text-xs border border-blue-300 shadow-xs cursor-pointer shrink-0"
              title="Estimate completion time and determine optimal vessel"
            >
              <i data-lucide="calculator" className="w-3.5 h-3.5 text-blue-600"></i>
              <span>Approx Time Calculator</span>
            </button>
          )}

          {/* Search Bar */}
          <div className="relative w-full">
            <i data-lucide="search" className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input
              type="text"
              placeholder="Search Order #, Customer, Fabric..."
              value={matrixSearch}
              onChange={e => setMatrixSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Horizon Selector */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => onChangeAgendaDays(7)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                agendaDays === 7 ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1 Week (7d)
            </button>
            <button
              onClick={() => onChangeAgendaDays(14)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                agendaDays === 14 ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2 Weeks (14d)
            </button>
            <button
              onClick={() => onChangeAgendaDays(30)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                agendaDays === 30 ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1 Month (30d)
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'matrix' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Excel-like Production Planning Matrix"
            >
              <i data-lucide="grid" className="w-3.5 h-3.5"></i>
              <span>Matrix View</span>
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'timeline' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Shift detail view (Shift A, B, C)"
            >
              <i data-lucide="list" className="w-3.5 h-3.5"></i>
              <span>Shift Details</span>
            </button>
          </div>

          {/* Excel Import Button */}
          <button
            onClick={() => setExcelImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs text-xs font-bold transition-all cursor-pointer"
            title="Import Orders from Excel (.xlsx)"
          >
            <i data-lucide="upload" className="w-3.5 h-3.5 text-emerald-700"></i>
            <span className="hidden sm:inline">Import Excel</span>
          </button>

          {/* Excel Export Button */}
          <a
            href="/api/reports/excel"
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs text-xs font-medium transition-all"
            title="Download Excel Production Planning Matrix"
          >
            <i data-lucide="file-spreadsheet" className="w-3.5 h-3.5 text-emerald-600"></i>
            <span className="hidden sm:inline">Export Matrix</span>
          </a>
        </div>
      </div>

      {/* 5A. PRIMARY VIEW: EXCEL-LIKE PRODUCTION PLANNING MATRIX */}
      {/* 5A. PRIMARY VIEW: EXCEL-LIKE PRODUCTION PLANNING MATRIX */}
      {viewMode === 'matrix' && (
        <div className="border border-slate-300/80 rounded-2xl bg-white overflow-hidden shadow-2xl">
          <div className="overflow-auto max-h-[720px] scrollbar-thin">
            <table className="w-full text-left border-collapse">
              <thead>
                {/* 1. Super Header */}
                <tr className="border-b border-slate-300/80 h-[44px]">
                  <th colSpan="5" className="sticky left-0 top-0 z-40 bg-[#F8FAFC] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-800 border-r border-slate-300/80 shadow-md min-w-[660px]">
                    ORDER INFORMATION
                  </th>
                  <th
                    colSpan={matrixMachines.length}
                    className="sticky top-0 z-30 bg-blue-50 border-b border-blue-200 px-4 py-2.5 text-center text-sm font-black uppercase tracking-wider text-blue-900"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <i data-lucide="cpu" className="w-4 h-4 text-blue-600"></i>
                      <span>WORK — DYNAMIC MACHINE ALLOCATION & TOC SEQUENCING</span>
                    </div>
                  </th>
                </tr>

                {/* 2. Sub-headers */}
                <tr className="border-b border-slate-300/80 bg-white text-xs h-[48px]">
                  {/* Sticky Col 1: Order Number */}
                  <th
                    onClick={() => handleSort('order_number')}
                    className="sticky left-0 top-[44px] z-40 bg-white px-3.5 py-3 font-extrabold text-slate-800 min-w-[155px] border-r border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors uppercase tracking-wide text-xs"
                    title="Sort by Job Number"
                  >
                    <div className="flex items-center justify-between">
                      <span>Order Number</span>
                      <span className="text-xs text-slate-400">
                        {sortField === 'order_number' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  {/* Sticky Col 2: Quantity */}
                  <th
                    onClick={() => handleSort('quantity_kg')}
                    className="sticky left-[155px] top-[44px] z-40 bg-white px-3 py-3 font-extrabold text-slate-800 text-right min-w-[100px] border-r border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors uppercase tracking-wide text-xs"
                    title="Sort by Quantity"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Qty (kg)</span>
                      <span className="text-xs text-slate-400">
                        {sortField === 'quantity_kg' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  {/* Sticky Col 3: Due Date */}
                  <th
                    onClick={() => handleSort('due_date')}
                    className="sticky left-[255px] top-[44px] z-40 bg-white px-3 py-3 font-extrabold text-slate-800 text-center min-w-[160px] border-r border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors uppercase tracking-wide text-xs"
                    title="Sort by Customer Due Date"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Due Date</span>
                      <span className="text-xs text-slate-400">
                        {sortField === 'due_date' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  {/* Sticky Col 4: Planned Day */}
                  <th
                    onClick={() => handleSort('planned_day')}
                    className="sticky left-[415px] top-[44px] z-40 bg-white px-3 py-3 font-extrabold text-slate-800 text-center min-w-[135px] border-r border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors uppercase tracking-wide text-xs"
                    title="Sort by Planned Production Day"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Planned Day</span>
                      <span className="text-xs text-slate-400">
                        {sortField === 'planned_day' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                  {/* Sticky Col 5: Action Controls */}
                  <th className="sticky left-[550px] top-[44px] z-40 bg-white px-2.5 py-3 font-extrabold text-slate-800 text-center min-w-[110px] border-r border-slate-300/80 shadow-lg uppercase tracking-wide text-xs">
                    Actions
                  </th>

                  {/* Dynamic Machine Headers */}
                  {matrixMachines.map(m => {
                    const isEditing = editingMatrixMachId === m.id;
                    const isSaved = savedSuccessMachId === m.id;
                    const isSaving = savingMatrixMachId === m.id;
                    const currentBatchTime = m.processing_time_hours !== undefined && m.processing_time_hours !== null ? m.processing_time_hours : 3;

                    return (
                      <th
                        key={m.id}
                        className={`top-[44px] z-20 px-3 py-2 text-center border-r border-slate-200 min-w-[155px] transition-colors ${
                          m.is_bottleneck ? 'bg-amber-50/90 border border-amber-200 ring-1 ring-inset ring-amber-500/40' : 'bg-white'
                        }`}
                      >
                        {/* 1. Machine Code */}
                        <div className="font-black text-slate-900 text-sm flex items-center justify-center gap-1">
                          <span>{m.code}</span>
                          {m.is_bottleneck && (
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" title="Active TOC Drum"></span>
                          )}
                        </div>

                        {/* 2. Cap: X kg/batch */}
                        <div className="text-xs text-slate-500 font-semibold mt-0.5">
                          Cap: {m.capacity_kg} kg/batch
                        </div>

                        {/* 3. Batch Time: Editable Inline */}
                        <div className="my-1">
                          {isEditing ? (
                            <div className="inline-flex items-center justify-center gap-1 bg-blue-50/90 p-1 rounded border border-blue-300 shadow-inner">
                              <span className="text-[11px] text-slate-600 font-medium whitespace-nowrap">Batch Time:</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                className="w-14 px-1 py-0.5 text-xs text-center border border-blue-500 rounded bg-white text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                                value={matrixBatchTimeValues[m.id] !== undefined ? matrixBatchTimeValues[m.id] : currentBatchTime}
                                onChange={(e) => setMatrixBatchTimeValues(prev => ({ ...prev, [m.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveMatrixBatchTime(m);
                                  if (e.key === 'Escape') setEditingMatrixMachId(null);
                                }}
                                autoFocus
                              />
                              <span className="text-[11px] text-slate-600 font-medium">hr</span>
                              <button
                                type="button"
                                onClick={() => handleSaveMatrixBatchTime(m)}
                                disabled={isSaving}
                                className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold shadow transition cursor-pointer"
                                title="Save batch time"
                              >
                                {isSaving ? "..." : "Save"}
                              </button>
                            </div>
                          ) : isSaved ? (
                            <div className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-bold animate-pulse">
                              <span>✓ Saved</span>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingMatrixMachId(m.id);
                                setMatrixBatchTimeValues(prev => ({
                                  ...prev,
                                  [m.id]: currentBatchTime
                                }));
                              }}
                              className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-xs text-slate-600 font-semibold hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 cursor-pointer transition group"
                              title="Click to edit batch processing time"
                            >
                              <span>Batch Time: {currentBatchTime} hr</span>
                              <span className="text-[10px] text-blue-500 opacity-60 group-hover:opacity-100">✎</span>
                            </div>
                          )}
                        </div>

                        {/* 4. Load: X kg */}
                        <div className="text-xs text-slate-500 font-semibold">
                          Load: {m.current_load_kg} kg
                        </div>

                        {/* 5. DRUM badge / Utilization */}
                        <div className="mt-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black inline-block ${
                            m.is_bottleneck
                              ? 'bg-amber-500/30 text-amber-900 border border-amber-500/50 animate-pulse'
                              : m.utilization_pct > 75
                              ? 'bg-blue-500/20 text-blue-800 border border-blue-500/30'
                              : 'bg-emerald-500/20 text-emerald-800 border border-emerald-500/30'
                          }`}>
                            {m.is_bottleneck ? `DRUM ${m.utilization_pct}%` : `${m.utilization_pct}%`}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredMatrixOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5 + matrixMachines.length} className="p-8 text-center text-slate-500 text-sm italic">
                      No production orders found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredMatrixOrders.map((o, rIdx) => {
                    return (
                      <tr key={o.order_id || rIdx} className="hover:bg-blue-50/40 transition-colors group">
                        {/* Sticky Col 1: Order Number */}
                        <td className="sticky left-0 z-20 bg-white group-hover:bg-[#f1f5f9] px-3.5 py-3 border-r border-slate-200 whitespace-nowrap min-w-[155px]">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                              style={{ backgroundColor: COLOUR_HEX_MAP[o.colour_code] || '#38bdf8' }}
                              title={o.colour_name}
                            ></span>
                            <button
                              onClick={() => onSelectOrder({ id: o.order_id, order_number: o.order_number })}
                              className="font-mono text-sm font-black text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer"
                              title="Click to view full order stages and readiness"
                            >
                              <span>{o.order_number}</span>
                              <i data-lucide="external-link" className="w-3.5 h-3.5 opacity-70"></i>
                            </button>
                          </div>
                          <div className="text-xs text-slate-600 font-semibold truncate max-w-[150px] mt-0.5" title={o.cloth_type}>
                            {o.cloth_type}
                          </div>
                          {o.customer_name && (
                            <div className="text-[11px] text-slate-500 font-medium truncate max-w-[150px]" title={o.customer_name}>
                              {o.customer_name}
                            </div>
                          )}
                        </td>

                        {/* Sticky Col 2: Quantity */}
                        <td className="sticky left-[155px] z-20 bg-white group-hover:bg-[#f1f5f9] px-3 py-3 border-r border-slate-200 text-right whitespace-nowrap text-sm font-black text-slate-900 min-w-[100px]">
                          {o.quantity_kg?.toLocaleString()} kg
                        </td>

                        {/* Sticky Col 3: Due Date */}
                        <td className="sticky left-[255px] z-20 bg-white group-hover:bg-[#f1f5f9] px-3 py-3 border-r border-slate-200 text-center whitespace-nowrap min-w-[160px]">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <span className="text-sm font-black font-mono">{o.due_day_label || 'Day 7'}</span>
                              <span className="text-xs text-slate-600 font-medium">({o.due_date_formatted || '-'})</span>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-wide uppercase ${
                              o.is_late || o.due_status === 'LATE'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : (o.due_status === 'DUE_TODAY'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300')
                            }`}>
                              {o.due_status_label || 'ON TIME'}
                            </span>
                          </div>
                        </td>

                        {/* Sticky Col 4: Planned Day */}
                        <td className="sticky left-[415px] z-20 bg-white group-hover:bg-[#f1f5f9] px-3 py-3 border-r border-slate-200 text-center whitespace-nowrap min-w-[135px]">
                          <span className={`px-3 py-1 rounded-full text-xs font-black ${
                            o.planned_day === 1 ? 'bg-cyan-100 text-cyan-900 border border-cyan-300' :
                            o.planned_day === 2 ? 'bg-blue-100 text-blue-900 border border-blue-300' :
                            'bg-slate-100 text-slate-800 border border-slate-300'
                          }`}>
                            {o.planned_day_label}
                          </span>
                        </td>

                        {/* Sticky Col 5: Action Controls */}
                        <td className="sticky left-[550px] z-20 bg-white group-hover:bg-[#f1f5f9] px-2.5 py-3 border-r border-slate-300/80 shadow-lg text-center whitespace-nowrap min-w-[110px]">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Toggle Lock Button */}
                            <button
                              onClick={() => handleToggleOrderLock(o.order_id)}
                              disabled={lockingOrderId === o.order_id}
                              className={`p-2 rounded-lg border transition-all cursor-pointer ${
                                o.is_locked
                                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-emerald-700 hover:border-emerald-400'
                              }`}
                              title={o.is_locked ? "Order is LOCKED. Click to unlock." : "Order is FLEXIBLE. Click to lock."}
                            >
                              <i data-lucide={o.is_locked ? "lock" : "unlock"} className={`w-4 h-4 ${lockingOrderId === o.order_id ? 'animate-spin' : ''}`}></i>
                            </button>

                            {/* Edit Row Button */}
                            <button
                              onClick={() => setEditRowOrder(o)}
                              className="p-2 rounded-lg bg-slate-100 hover:bg-cyan-600 text-slate-700 hover:text-white border border-slate-300 transition-all cursor-pointer"
                              title="Edit order quantity, due date, or planned day"
                            >
                              <i data-lucide="edit-3" className="w-4 h-4"></i>
                            </button>

                            {/* Delete Order Button */}
                            <button
                              onClick={() => setDeleteOrder(o)}
                              className="p-2 rounded-lg bg-slate-100 hover:bg-rose-600 text-slate-600 hover:text-white border border-slate-300 transition-all cursor-pointer"
                              title="Delete order"
                            >
                              <i data-lucide="trash-2" className="w-4 h-4"></i>
                            </button>
                          </div>
                        </td>

                        {/* Dynamic Machine Work Cells */}
                        {matrixMachines.map(m => {
                          const cell = o.machine_cells?.[String(m.id)];
                          const isAssigned = cell && cell.assigned;

                          return (
                            <td
                              key={m.id}
                              className={`p-2.5 text-center border-r border-slate-200 transition-colors ${
                                isAssigned
                                  ? (cell.is_locked ? 'bg-amber-50/60 hover:bg-amber-100/60' : 'bg-blue-50/60 hover:bg-blue-100/60')
                                  : 'hover:bg-blue-50/40'
                              }`}
                            >
                              {isAssigned ? (
                                <button
                                  onClick={() => setCellActionData({ order: o, machine: m, cell })}
                                  className={`matrix-cell-btn w-full py-2 px-2 rounded-lg font-mono text-sm font-bold transition-all flex flex-col items-center justify-center cursor-pointer shadow-sm border ${
                                    cell.is_locked
                                      ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                                      : 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100'
                                  }`}
                                  title={`Assigned to ${m.code}. Click to Move, Remove, or Lock.`}
                                >
                                  {/* Line 1: Order Number with Color Dot and Lock */}
                                  <div className="order-number flex items-center justify-center gap-1.5 w-full">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: COLOUR_HEX_MAP[o.colour_code] || '#38bdf8' }}
                                      title={o.colour_name || o.colour_code || 'Color'}
                                    ></span>
                                    <span className="font-extrabold tracking-tight">
                                      {(() => {
                                        const rawNum = String(o.raw_order_number || o.order_number || cell.order_label || o.short_order_number || o.id || '');
                                        if (rawNum.startsWith('ORD-')) return rawNum.split(' ')[0];
                                        if (/^\d+$/.test(rawNum)) return `ORD-${rawNum}`;
                                        return rawNum;
                                      })()}
                                    </span>
                                    {cell.is_locked && (
                                      <span className="text-xs inline-flex items-center text-amber-700 shrink-0 ml-0.5" title="Locked Order">
                                        🔒
                                      </span>
                                    )}
                                    {cell.warning && (
                                      <i data-lucide="alert-triangle" className="w-3.5 h-3.5 text-amber-700 shrink-0" title={cell.warning}></i>
                                    )}
                                  </div>

                                  {/* Line 2: Quantity in kg as separate UI element */}
                                  <div className="order-quantity text-xs text-slate-700 font-extrabold tracking-tight mt-1 w-full text-center">
                                    {Number(cell.quantity_kg !== undefined && cell.quantity_kg !== null ? cell.quantity_kg : o.quantity_kg)?.toLocaleString()} kg
                                  </div>
                                </button>
                              ) : (
                                <button
                                  onClick={() => setAssignModalData({ order: o, machine: m })}
                                  className="w-full py-2 px-1 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-cyan-950/30 text-xs font-bold transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 cursor-pointer"
                                  title={`Click to assign order ${o.order_number} to ${m.code}`}
                                >
                                  <i data-lucide="plus" className="w-3.5 h-3.5"></i>
                                  <span>Assign</span>
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5B. SECONDARY VIEW: DETAILED SHIFT TIMELINE (SHIFT A, B, C) */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          {/* Day Navigator */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {days.map((d, idx) => (
              <button
                key={d.date}
                onClick={() => setSelectedDayIdx(idx)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl border text-left transition-all min-w-[125px] cursor-pointer ${
                  selectedDayIdx === idx
                    ? 'bg-cyan-950/50 border-cyan-500 shadow-lg ring-1 ring-cyan-500 text-white'
                    : 'bg-white/80 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="text-[10px] uppercase font-bold text-blue-600">{d.rel_label}</div>
                <div className="text-xs font-bold">{d.formatted_date.split(',')[0]}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{d.jobs_count} batches • {d.total_kg} kg</div>
              </button>
            ))}
          </div>

          {/* Timeline Table */}
          <div className="glass-panel border border-slate-200 rounded-2xl overflow-hidden shadow-2xl bg-white">
            <div className="overflow-x-auto max-h-[600px] scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] font-bold text-slate-400 uppercase">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-2">Day</th>
                    <th className="py-2.5 px-2">Shift</th>
                    <th className="py-2.5 px-2">Start</th>
                    <th className="py-2.5 px-2">End</th>
                    <th className="py-2.5 px-3">Machine</th>
                    <th className="py-2.5 px-3">Order #</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Fabric</th>
                    <th className="py-2.5 px-2 text-right">Qty</th>
                    <th className="py-2.5 px-3">Colour</th>
                    <th className="py-2.5 px-2 text-center">Changeover</th>
                    <th className="py-2.5 px-3">Operator</th>
                    <th className="py-2.5 px-2 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTimelineTasks.map((t, idx) => (
                    <ScheduleTableRow
                      key={t.id || idx}
                      task={t}
                      onEdit={() => handleMatrixAction({ action: 'UPDATE_ROW', order_id: t.order_id })}
                      onToggleLock={() => handleToggleOrderLock(t.order_id)}
                      onSelectOrder={() => onSelectOrder({ id: t.order_id, order_number: t.order_number })}
                      isLocking={lockingOrderId === t.order_id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODALS FOR PLANNING MATRIX EDITING */}

      {/* A. Cell Action Modal */}
      {cellActionData && (
        <MatrixCellActionModal
          data={cellActionData}
          machines={matrixMachines}
          onClose={() => setCellActionData(null)}
          onMove={(targetMachId) => {
            handleMatrixAction({
              action: 'MOVE',
              order_id: cellActionData.order.order_id,
              machine_id: cellActionData.machine.id,
              target_machine_id: targetMachId
            });
          }}
          onRemove={() => {
            handleMatrixAction({
              action: 'REMOVE',
              order_id: cellActionData.order.order_id,
              machine_id: cellActionData.machine.id
            });
          }}
          onToggleLock={() => handleToggleOrderLock(cellActionData.order.order_id)}
          onSelectOrder={onSelectOrder}
          loading={actionLoading}
        />
      )}

      {/* B. Assign Order Modal */}
      {assignModalData && (
        <MatrixAssignModal
          data={assignModalData}
          onClose={() => setAssignModalData(null)}
          onAssign={(day) => {
            handleMatrixAction({
              action: 'ASSIGN',
              order_id: assignModalData.order.order_id,
              target_machine_id: assignModalData.machine.id,
              planned_day: day
            });
          }}
          loading={actionLoading}
        />
      )}

      {/* C. Edit Order Row Modal */}
      {editRowOrder && (
        <MatrixEditRowModal
          order={editRowOrder}
          onClose={() => setEditRowOrder(null)}
          onSave={(formVals) => {
            handleMatrixAction({
              action: 'UPDATE_ROW',
              order_id: editRowOrder.order_id,
              ...formVals
            });
          }}
          loading={actionLoading}
        />
      )}

      {/* D. Add Order Modal */}
      {addOrderOpen && (
        <MatrixAddOrderModal
          machines={matrixMachines}
          onClose={() => setAddOrderOpen(false)}
          onAdd={(formVals) => {
            handleMatrixAction({
              action: 'ADD_ORDER',
              ...formVals
            });
          }}
          loading={actionLoading}
        />
      )}

      {/* E. Delete Order Confirmation Modal */}
      {deleteOrder && (
        <MatrixDeleteConfirmModal
          order={deleteOrder}
          onClose={() => setDeleteOrder(null)}
          onConfirm={() => {
            handleMatrixAction({
              action: 'DELETE_ORDER',
              order_id: deleteOrder.order_id
            });
          }}
          loading={actionLoading}
        />
      )}

      {/* E2. Excel Import Modal */}
      {excelImportOpen && (
        <ExcelImportModal
          onClose={() => setExcelImportOpen(false)}
          onImportSuccess={async () => {
            await onRefresh();
            await fetchMatrix();
          }}
          showToast={showToast}
        />
      )}

      {/* F. Reorganizing Multi-Step Progress Overlay */}
      {reorganizingStep !== null && (
        <ReorganizingProgressModal
          step={reorganizingStep}
          machineName={pendingReq?.target_machine_id ? matrixMachines.find(m => m.id === pendingReq.target_machine_id)?.name : "Vessel Fleet"}
        />
      )}

      {/* G. Locked Conflict Modal */}
      {lockedConflict && (
        <LockedConflictModal
          conflictData={lockedConflict}
          onKeepLocked={() => setLockedConflict(null)}
          onUnlockAndOptimize={() => {
            const req = lockedConflict.pendingReq;
            setLockedConflict(null);
            if (req) {
              handleMatrixAction(req, false, true);
            }
          }}
          onCancel={() => {
            setLockedConflict(null);
            setPendingReq(null);
          }}
        />
      )}

      {/* H. Reorganize Diff Modal */}
      {diffData && (
        <ReorganizeDiffModal
          diff={diffData}
          onClose={() => setDiffData(null)}
        />
      )}
    </div>
  );
}


// 6. Individual Table Row Component
function ScheduleTableRow({ task, onEdit, onToggleLock, onSelectOrder, isLocking }) {
  if (task.type === 'MAINTENANCE') {
    return (
      <tr className="bg-amber-950/20 hover:bg-amber-950/30 border-b border-amber-500/30 text-amber-200 transition-colors">
        <td className="py-3 px-3 whitespace-nowrap text-amber-800 font-bold">{task.date || '-'}</td>
        <td className="py-3 px-2 whitespace-nowrap text-amber-800/80">{task.day_name || '-'}</td>
        <td className="py-3 px-2 whitespace-nowrap">
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/30 text-amber-800 border border-amber-500/50">
            {task.shift_key === 'SHIFT_A' ? 'Shift A' : (task.shift_key === 'SHIFT_B' ? 'Shift B' : 'Shift C')}
          </span>
        </td>
        <td className="py-3 px-2 whitespace-nowrap font-bold text-amber-800">{task.start_time_str}</td>
        <td className="py-3 px-2 whitespace-nowrap text-amber-200">{task.end_time_str}</td>
        <td className="py-3 px-3 whitespace-nowrap font-semibold text-slate-900">{task.machine_name}</td>
        <td colSpan="5" className="py-3 px-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-amber-500/30 text-amber-800 shrink-0">
              <i data-lucide="wrench" className="w-3.5 h-3.5"></i>
            </span>
            <div>
              <div className="font-bold text-slate-900 text-xs">{task.title}</div>
              {task.notes && <div className="text-[10px] text-amber-800/80 italic">{task.notes}</div>}
            </div>
          </div>
        </td>
        <td className="py-3 px-2 text-center whitespace-nowrap text-amber-700 font-mono text-[11px]">-</td>
        <td className="py-3 px-3 whitespace-nowrap text-[11px] text-amber-800">Engineering Team</td>
        <td className="py-3 px-2 text-center whitespace-nowrap">
          <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/30 text-amber-800 border border-amber-500/50 uppercase">
            MAINTENANCE
          </span>
        </td>
        <td className="py-3 px-3 text-center whitespace-nowrap">
          <span className="text-[10px] text-amber-700 font-bold">
            {task.duration_hours}h duration
          </span>
        </td>
      </tr>
    );
  }

  // Production Job Row
  return (
    <tr className="hover:bg-blue-50/40 transition-colors border-b border-slate-200 group">
      {/* Date */}
      <td className="py-3 px-3 whitespace-nowrap text-slate-900 font-medium">
        {task.date ? task.date : '-'}
      </td>

      {/* Day */}
      <td className="py-3 px-2 whitespace-nowrap text-slate-400">
        {task.day_name ? task.day_name.substring(0, 3) : '-'}
      </td>

      {/* Shift */}
      <td className="py-3 px-2 whitespace-nowrap">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
          task.shift_key === 'SHIFT_A' || task.shift === 'SHIFT_A' ? 'bg-cyan-500/20 text-blue-700 border border-cyan-500/40' :
          task.shift_key === 'SHIFT_B' || task.shift === 'SHIFT_B' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
          'bg-purple-500/20 text-purple-300 border border-purple-500/40'
        }`}>
          {task.shift_key === 'SHIFT_A' || task.shift === 'SHIFT_A' ? 'Shift A' :
           task.shift_key === 'SHIFT_B' || task.shift === 'SHIFT_B' ? 'Shift B' : 'Shift C'}
        </span>
      </td>

      {/* Start Time */}
      <td className="py-3 px-2 whitespace-nowrap font-bold text-blue-700">
        {task.start_time_str}
      </td>

      {/* End Time */}
      <td className="py-3 px-2 whitespace-nowrap text-slate-600">
        {task.end_time_str}
      </td>

      {/* Machine */}
      <td className="py-3 px-3 whitespace-nowrap">
        <span className="px-2 py-1 rounded bg-white border border-slate-300/80 text-slate-900 font-semibold text-[11px]">
          {task.machine_name}
        </span>
      </td>

      {/* Order ID */}
      <td className="py-3 px-3 whitespace-nowrap">
        <button
          onClick={onSelectOrder}
          className="font-mono text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
          title="Open Order Details"
        >
          <span>{task.order_number}</span>
          <i data-lucide="external-link" className="w-3 h-3 opacity-60"></i>
        </button>
      </td>

      {/* Customer */}
      <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-medium">
        <span className="truncate block max-w-[130px]" title={task.customer_name}>
          {task.customer_name}
        </span>
      </td>

      {/* Fabric / Product */}
      <td className="py-3 px-3 whitespace-nowrap text-slate-600">
        <span className="truncate block max-w-[140px]" title={task.cloth_type}>
          {task.cloth_type}
        </span>
      </td>

      {/* Quantity (kg) */}
      <td className="py-3 px-2 whitespace-nowrap text-right font-bold text-slate-900">
        {task.quantity_kg ? `${task.quantity_kg.toLocaleString()} kg` : '-'}
      </td>

      {/* Colour */}
      <td className="py-3 px-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span
            className="w-3.5 h-3.5 rounded-full border border-white/40 shrink-0 shadow-sm"
            style={{ backgroundColor: COLOUR_HEX_MAP[task.colour_code] || '#38bdf8' }}
          ></span>
          <span className="truncate max-w-[110px] text-slate-700" title={task.colour_name}>
            {task.colour_name}
          </span>
        </div>
      </td>

      {/* Setup / Changeover */}
      <td className="py-3 px-2 whitespace-nowrap text-center">
        {task.changeover_min > 0 ? (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-800 border border-amber-500/40 inline-flex items-center gap-1"
            title={`${task.cleaning_min || 0}m wash & setup`}
          >
            <i data-lucide="sparkles" className="w-2.5 h-2.5"></i>
            <span>{task.changeover_min}m</span>
          </span>
        ) : (
          <span className="text-[10px] text-slate-500">0 min</span>
        )}
      </td>

      {/* Operator */}
      <td className="py-3 px-3 whitespace-nowrap text-slate-600">
        <span className="truncate max-w-[110px] block" title={task.operator_name}>
          {task.operator_name || "Rajesh Kumar"}
        </span>
      </td>

      {/* Status */}
      <td className="py-3 px-2 whitespace-nowrap text-center">
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
          task.status === 'IN_PROGRESS' ? 'bg-amber-500/20 text-amber-800 border border-amber-500/40 animate-pulse' :
          task.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/40' :
          'bg-cyan-500/20 text-blue-700 border border-cyan-500/40'
        }`}>
          {task.status}
        </span>
      </td>

      {/* Actions */}
      <td className="py-3 px-3 whitespace-nowrap text-center">
        <div className="flex items-center justify-center gap-1">
          {/* 1. Edit Button */}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-cyan-600 text-slate-700 hover:text-slate-900 border border-slate-300 transition-all cursor-pointer"
            title="Edit scheduled job parameters"
          >
            <i data-lucide="edit-3" className="w-3.5 h-3.5"></i>
          </button>

          {/* 2. Lock / Unlock Toggle */}
          <button
            onClick={onToggleLock}
            disabled={isLocking}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              task.is_locked
                ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                : 'bg-slate-800 border-slate-300 text-slate-400 hover:text-emerald-700 hover:border-emerald-500/50'
            }`}
            title={task.is_locked ? "Job is LOCKED. Click to unlock." : "Job is FLEXIBLE. Click to lock."}
          >
            <i data-lucide={task.is_locked ? "lock" : "unlock"} className={`w-3.5 h-3.5 ${isLocking ? 'animate-spin' : ''}`}></i>
          </button>

          {/* 3. Details Button */}
          <button
            onClick={onSelectOrder}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-700 hover:text-slate-900 border border-slate-300 transition-all cursor-pointer"
            title="View Order Details"
          >
            <i data-lucide="eye" className="w-3.5 h-3.5 text-blue-600"></i>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// APPROXIMATE TIME CALCULATOR FOR NEW ORDER VIEW
// ============================================================================
function ApproxTimeCalculatorView({ showToast, machines = [], onRefresh }) {
  const [quantity, setQuantity] = useState(1000);
  const [selectedColour, setSelectedColour] = useState('ROYAL_BLUE');
  const [fleetMachines, setFleetMachines] = useState(machines || []);
  const [editingParams, setEditingParams] = useState({});
  const [savingMachineId, setSavingMachineId] = useState(null);

  useEffect(() => {
    if (machines && machines.length > 0) {
      setFleetMachines(machines);
    } else {
      fetch('/api/machines')
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setFleetMachines(data); })
        .catch(err => console.error("Error loading machines:", err));
    }
  }, [machines]);

  const handleParamChange = (machId, field, val) => {
    setEditingParams(prev => ({
      ...prev,
      [machId]: {
        ...(prev[machId] || {}),
        [field]: val
      }
    }));
  };

  const handleSaveMachineTimes = async (mach) => {
    const p = editingParams[mach.id] || {};
    const proc = parseFloat(p.processing_time_hours !== undefined ? p.processing_time_hours : mach.processing_time_hours) || 3.0;
    const loading = parseFloat(p.loading_time_hours !== undefined ? p.loading_time_hours : (mach.loading_time_hours || 0.5)) || 0.5;
    const unloading = parseFloat(p.unloading_time_hours !== undefined ? p.unloading_time_hours : (mach.unloading_time_hours || 0.5)) || 0.5;
    const cleaning = parseFloat(p.cleaning_time_hours !== undefined ? p.cleaning_time_hours : (mach.cleaning_time_hours || 1.0)) || 1.0;

    if (proc <= 0 || loading < 0 || unloading < 0 || cleaning < 0) {
      if (showToast) showToast('Please enter valid positive production time parameters.', 'error');
      return;
    }

    setSavingMachineId(mach.id);
    try {
      const res = await fetch(`/api/machines/${mach.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...mach,
          processing_time_hours: proc,
          loading_time_hours: loading,
          unloading_time_hours: unloading,
          cleaning_time_hours: cleaning,
          capacity_kg: mach.capacity_kg || mach.max_batch_kg
        })
      });
      if (!res.ok) throw new Error('Failed to update machine parameters');
      const updated = await res.json();
      setFleetMachines(prev => prev.map(m => m.id === mach.id ? updated : m));
      setEditingParams(prev => {
        const next = { ...prev };
        delete next[mach.id];
        return next;
      });
      if (showToast) showToast(`✓ ${mach.code} (${mach.name}) time parameters updated!`);
      if (onRefresh) onRefresh();
      // Re-trigger calculation if user already calculated
      if (result) {
        handleCalculate();
      }
    } catch (err) {
      if (showToast) showToast('Error saving parameters: ' + err.message, 'error');
    } finally {
      setSavingMachineId(null);
    }
  };

  // Initialize due date to today + 7 days
  const defaultDueDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, []);
  const [dueDate, setDueDate] = useState(defaultDueDate);

  const [colours, setColours] = useState([
    { code: 'WHITE', name: 'Bleached Optical White', hex_code: '#FFFFFF', shade_depth: 'LIGHT' },
    { code: 'PASTEL_PINK', name: 'Pastel Rose Pink', hex_code: '#FFB6C1', shade_depth: 'LIGHT' },
    { code: 'SKY_BLUE', name: 'Sky Aqua Blue', hex_code: '#87CEEB', shade_depth: 'LIGHT' },
    { code: 'GOLDEN_YELLOW', name: 'Golden Sun Yellow', hex_code: '#FFD700', shade_depth: 'MEDIUM' },
    { code: 'ROYAL_BLUE', name: 'Vibrant Royal Blue', hex_code: '#4169E1', shade_depth: 'MEDIUM' },
    { code: 'SCARLET_RED', name: 'Scarlet Crimson Red', hex_code: '#FF2400', shade_depth: 'MEDIUM' },
    { code: 'EMERALD_GREEN', name: 'Emerald Olive Green', hex_code: '#2E8B57', shade_depth: 'MEDIUM' },
    { code: 'DEEP_NAVY', name: 'Deep Midnight Navy', hex_code: '#000080', shade_depth: 'DARK' },
    { code: 'JET_BLACK', name: 'Intense Jet Black', hex_code: '#111111', shade_depth: 'DARK' }
  ]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    fetch('/api/schedule/available-colours')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setColours(data);
        }
      })
      .catch(err => console.error("Error fetching colours:", err));
  }, []);

  useEffect(() => {
    if (window.lucide) window.lucide.createIcons();
  }, [result, loading]);

  const handleCalculate = async () => {
    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      if (showToast) showToast('Order Quantity must be greater than 0 kg.', 'error');
      return;
    }
    if (!dueDate) {
      if (showToast) showToast('Please select a required due date.', 'error');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const dueDateIso = new Date(dueDate + 'T23:59:59').toISOString();
      const res = await fetch('/api/schedule/approx-time-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity_kg: qtyNum,
          colour_code: selectedColour,
          due_date: dueDateIso,
          cloth_type: 'Cotton'
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to calculate completion time.');
      }

      const data = await res.json();
      setResult(data);
      if (showToast) showToast('Calculation complete! Recommended machine identified.');
    } catch (err) {
      setErrorMsg(err.message);
      if (showToast) showToast('Calculator error: ' + err.message, 'error');
    } finally {
      setLoading(false);
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
    }
  };

  const formatDateTime = (isoStr) => {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) + ', ' + d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '--';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const rec = result ? result.recommended_machine : null;
  const currentColourObj = colours.find(c => c.code === selectedColour) || colours[0];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* 1. Page Title & Subtitle */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
            <i data-lucide="calculator" className="w-6 h-6"></i>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Approximate Time Calculator for New Order
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Enter order details to estimate completion time and automatically determine the most suitable machine.
            </p>
          </div>
        </div>
      </div>

      {/* Machine Fleet Real Production Time Parameters (Configurable & Modifiable) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <i data-lucide="clock" className="w-4 h-4 text-blue-600"></i>
              <span>Machine Real Production Time Parameters (Configurable)</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
              Manually enter Loading, Processing, Unloading, and Cleaning times for each machine. Modifying any value recalculates schedule estimates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Shift: 8.0 hrs/day (08:00 - 16:00)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fleetMachines.map(m => {
            const p = editingParams[m.id] || {};
            const curProc = p.processing_time_hours !== undefined ? p.processing_time_hours : (m.processing_time_hours || 3.0);
            const curLoad = p.loading_time_hours !== undefined ? p.loading_time_hours : (m.loading_time_hours || 0.5);
            const curUnload = p.unloading_time_hours !== undefined ? p.unloading_time_hours : (m.unloading_time_hours || 0.5);
            const curClean = p.cleaning_time_hours !== undefined ? p.cleaning_time_hours : (m.cleaning_time_hours || 1.0);

            const isDirty = (
              (p.processing_time_hours !== undefined && parseFloat(p.processing_time_hours) !== (m.processing_time_hours || 3.0)) ||
              (p.loading_time_hours !== undefined && parseFloat(p.loading_time_hours) !== (m.loading_time_hours || 0.5)) ||
              (p.unloading_time_hours !== undefined && parseFloat(p.unloading_time_hours) !== (m.unloading_time_hours || 0.5)) ||
              (p.cleaning_time_hours !== undefined && parseFloat(p.cleaning_time_hours) !== (m.cleaning_time_hours || 1.0))
            );
            const isSaving = savingMachineId === m.id;

            return (
              <div
                key={m.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isDirty ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-black text-xs text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-xs">
                    {m.code}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">
                    Cap: <strong className="text-slate-800">{m.capacity_kg || m.max_batch_kg} kg</strong>
                  </span>
                </div>

                <div className="text-xs font-bold text-slate-800 truncate mb-2" title={m.name}>
                  {m.name}
                </div>

                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 block">Batch (Proc) Time</label>
                      <div className="relative flex items-center mt-0.5">
                        <input
                          type="number" step="0.1" min="0.1"
                          value={curProc}
                          onChange={e => handleParamChange(m.id, 'processing_time_hours', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-bold text-blue-700"
                        />
                        <span className="text-[9px] text-slate-400 ml-1">h</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 block">Loading Time</label>
                      <div className="relative flex items-center mt-0.5">
                        <input
                          type="number" step="0.1" min="0.0"
                          value={curLoad}
                          onChange={e => handleParamChange(m.id, 'loading_time_hours', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-bold text-slate-700"
                        />
                        <span className="text-[9px] text-slate-400 ml-1">h</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 block">Unloading Time</label>
                      <div className="relative flex items-center mt-0.5">
                        <input
                          type="number" step="0.1" min="0.0"
                          value={curUnload}
                          onChange={e => handleParamChange(m.id, 'unloading_time_hours', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-bold text-slate-700"
                        />
                        <span className="text-[9px] text-slate-400 ml-1">h</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-slate-500 block">Cleaning Time</label>
                      <div className="relative flex items-center mt-0.5">
                        <input
                          type="number" step="0.1" min="0.0"
                          value={curClean}
                          onChange={e => handleParamChange(m.id, 'cleaning_time_hours', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-bold text-slate-700"
                        />
                        <span className="text-[9px] text-slate-400 ml-1">h</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => handleSaveMachineTimes(m)}
                      disabled={!isDirty || isSaving}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                        isDirty
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-95'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                      }`}
                      title="Save production time parameters"
                    >
                      <i data-lucide={isSaving ? "refresh-cw" : "check"} className={`w-3 h-3 ${isSaving ? 'animate-spin' : ''}`}></i>
                      <span>{isSaving ? 'Saving' : 'Save'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. User Inputs Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <i data-lucide="sliders" className="w-3.5 h-3.5 text-blue-600"></i>
            <span>Order Parameters</span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            System automatically selects the optimal machine based on capacity &amp; schedule
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Input A: Order Quantity */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Order Quantity
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="10"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="1000"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-3 focus:ring-blue-100 transition-all"
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-500 pointer-events-none">
                kg
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Must be greater than 0 kg</p>
          </div>

          {/* Input B: Color */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Color
            </label>
            <div className="relative">
              <select
                value={selectedColour}
                onChange={e => setSelectedColour(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-3 focus:ring-blue-100 transition-all"
              >
                {colours.map(c => (
                  <option key={c.code} value={c.code} className="text-slate-900 bg-white font-medium">
                    {c.name} ({c.code.replace('_', ' ')})
                  </option>
                ))}
              </select>
              <div
                className="w-4 h-4 rounded-full border border-slate-300 absolute left-3 top-3"
                style={{ backgroundColor: currentColourObj ? currentColourObj.hex_code : '#3b82f6' }}
              ></div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Affects sequence changeover &amp; cleaning time</p>
          </div>

          {/* Input C: Required Due Date */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Required Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-3 focus:ring-blue-100 transition-all"
            />
            <p className="text-[10px] text-slate-400 mt-1">Target delivery deadline</p>
          </div>
        </div>

        {/* 3. Main Button */}
        <div className="pt-3 flex justify-center">
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 hover:shadow-lg active:scale-[0.99] cursor-pointer"
          >
            <i data-lucide={loading ? "refresh-cw" : "calculator"} className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}></i>
            <span>{loading ? "Analyzing Factory Capacities & Schedules..." : "Calculate Approximate Completion Time"}</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
            <i data-lucide="alert-circle" className="w-4 h-4"></i>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 4. Result Card */}
      {result && rec && (
        <div className="space-y-6">
          {/* Main Prominent Result Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Approximate Order Completion</h2>
                <p className="text-xs text-slate-400 font-medium">Evaluated against active fleet, current queues, and TOC constraints</p>
              </div>

              {/* Order Chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                  {result.order_quantity_kg} kg
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border border-slate-400" style={{ backgroundColor: result.colour_hex || '#3b82f6' }}></span>
                  <span>{result.colour_name}</span>
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  Due: {formatDate(result.due_date)}
                </span>
              </div>
            </div>

            {/* Recommended Machine Banner */}
            <div className="p-5 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50/50 to-slate-50 border border-blue-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-blue-700">
                  Recommended Machine
                </div>
                <div className="text-lg font-black text-slate-900 mt-0.5 flex items-center gap-2">
                  <span>{rec.machine_name}</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-mono font-black bg-blue-600 text-white">
                    {rec.machine_code}
                  </span>
                </div>
                <div className="text-xs text-slate-600 font-semibold mt-1">
                  Type: {rec.machine_type} • Cap: <strong className="text-slate-900">{rec.daily_capacity_kg} kg/batch</strong> • Proc Time: <strong className="text-blue-700">{rec.processing_time_per_batch_hours} hrs/batch</strong> • Work Shift: <strong className="text-emerald-700">{rec.working_hours_per_day} hrs/day</strong>
                </div>
              </div>

              {/* Due Date Status Badge */}
              <div>
                {rec.is_on_time ? (
                  <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black flex items-center gap-2 shadow-xs">
                    <i data-lucide="check-circle" className="w-4 h-4 text-emerald-600"></i>
                    <span>✓ Expected to complete before due date ({rec.slack_hours}h safety buffer)</span>
                  </div>
                ) : (
                  <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-black flex items-center gap-2 shadow-xs">
                    <i data-lucide="alert-triangle" className="w-4 h-4 text-rose-600"></i>
                    <span>⚠️ Due Date Risk: Expected to complete {rec.delay_hours}h after required deadline</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3 Metrics Cards: Start, Completion, Duration */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Estimated Start</div>
                <div className="text-sm font-black text-slate-900 mt-1">
                  {formatDateTime(rec.estimated_start)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  After shift opening &amp; preceding queue
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Estimated Completion</div>
                <div className="text-sm font-black text-blue-700 mt-1">
                  {formatDateTime(rec.estimated_completion)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Final batch completion &amp; inspection
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Estimated Production Time</div>
                <div className="text-sm font-black text-slate-900 mt-1">
                  {rec.total_processing_hours || rec.production_hours} hours
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                  <div>{rec.batches_count} batch{rec.batches_count > 1 ? 'es' : ''} • Cap: {rec.daily_capacity_kg} kg/batch</div>
                  <div className="text-[10px] text-slate-600 font-medium">
                    Load: {rec.loading_time_hours || 0.5}h | Proc: {rec.processing_time_per_batch_hours}h | Unload: {rec.unloading_time_hours || 0.5}h | Clean: {rec.cleaning_time_hours || 0.0}h
                  </div>
                </div>
              </div>
            </div>

            {/* Why This Machine Card */}
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1.5">
              <div className="text-xs font-black uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                <i data-lucide="info" className="w-3.5 h-3.5 text-blue-600"></i>
                <span>Why this machine?</span>
              </div>
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                {result.why_recommended}
              </p>
            </div>

            {/* Due Date Risk Alert Panel (if no machine meets due date or recommended is late) */}
            {(!result.is_any_machine_on_time || !rec.is_on_time) && (
              <div className="p-5 rounded-xl bg-rose-50 border border-rose-300 space-y-3">
                <div className="flex items-center gap-2 text-rose-900 font-black text-sm">
                  <i data-lucide="alert-octagon" className="w-5 h-5 text-rose-600"></i>
                  <span>Due Date Risk Notice</span>
                </div>
                <p className="text-xs text-rose-800 font-semibold leading-relaxed">
                  {result.due_date_risk_warning || `No machine can meet the deadline. Expected delay: ${rec.delay_hours} hours.`}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="bg-white/80 p-3 rounded-lg border border-rose-200">
                    <div className="text-[10px] font-bold uppercase text-slate-500">Earliest Possible Completion</div>
                    <div className="text-xs font-black text-slate-900 mt-0.5">
                      {formatDateTime(result.earliest_completion || rec.estimated_completion)}
                    </div>
                  </div>
                  <div className="bg-white/80 p-3 rounded-lg border border-rose-200">
                    <div className="text-[10px] font-bold uppercase text-slate-500">Required Due Date</div>
                    <div className="text-xs font-black text-slate-900 mt-0.5">
                      {formatDate(result.due_date)}
                    </div>
                  </div>
                  <div className="bg-white/80 p-3 rounded-lg border border-rose-200">
                    <div className="text-[10px] font-bold uppercase text-rose-600">Estimated Delay</div>
                    <div className="text-xs font-black text-rose-700 mt-0.5">
                      {rec.delay_hours} hours
                    </div>
                  </div>
                </div>

                {result.risk_factors && result.risk_factors.length > 0 && (
                  <div className="pt-2 border-t border-rose-200">
                    <div className="text-[11px] font-bold text-rose-900 mb-1.5">Identified Scheduling Constraints:</div>
                    <ul className="space-y-1">
                      {result.risk_factors.map((rf, idx) => (
                        <li key={idx} className="text-xs text-rose-800 flex items-start gap-1.5">
                          <span className="text-rose-500 font-bold">•</span>
                          <span>{rf}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Alternative Machines Comparison Table */}
          {result.alternative_machines && result.alternative_machines.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Alternative Machine Comparison</h3>
                  <p className="text-xs text-slate-400 font-medium">Transparent evaluation across other operational vessels in the plant</p>
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  {result.alternative_machines.length} alternative vessels
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Machine</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Capacity</th>
                      <th className="py-3 px-4 text-center">Batches &amp; Processing</th>
                      <th className="py-3 px-4 text-center">Changeover</th>
                      <th className="py-3 px-4">Estimated Completion</th>
                      <th className="py-3 px-4 text-center">Due Date Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {result.alternative_machines.map((alt, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{alt.machine_name}</div>
                          <div className="text-[10px] font-mono text-slate-400 font-semibold">{alt.machine_code}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {alt.machine_type}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {alt.daily_capacity_kg} kg
                        </td>
                        <td className="py-3 px-4 text-center">
                          {alt.is_suitable ? (
                            <div>
                              <span className="font-bold text-slate-900">{alt.batches_count} batch{alt.batches_count > 1 ? 'es' : ''}</span>
                              <div className="text-[10px] text-blue-700 font-semibold">{alt.processing_time_per_batch_hours}h/batch ({alt.total_processing_hours}h)</div>
                            </div>
                          ) : '--'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {alt.changeover_min !== null ? (
                            <div>
                              <span className="font-bold text-slate-800">{alt.changeover_min} min</span>
                              <div className="text-[10px] text-slate-400">from {alt.preceding_colour || 'prev'}</div>
                            </div>
                          ) : '--'}
                        </td>
                        <td className="py-3 px-4">
                          {alt.estimated_completion ? (
                            <div>
                              <div className="font-bold text-slate-900">{formatDateTime(alt.estimated_completion)}</div>
                              <div className="text-[10px] text-slate-400 font-medium">{alt.total_processing_hours || alt.production_hours}h total on {alt.working_hours_per_day}h shift</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">{alt.unsuitability_reason || 'Not suitable'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {!alt.is_suitable ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              Incompatible
                            </span>
                          ) : alt.is_on_time ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-300 inline-flex items-center gap-1">
                              <span>✓</span> On Time
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-300 inline-flex items-center gap-1">
                              <span>❌</span> Late (+{alt.delay_hours}h)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 5. MACHINES & CHANGEOVER MATRIX COMPONENT
function MachinesView({ machines, changeoverMatrix, onRefresh, showToast }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [maintainingMachine, setMaintainingMachine] = useState(null);
  const [deletingMachine, setDeletingMachine] = useState(null);
  const [quickBatchTimes, setQuickBatchTimes] = useState({});
  const [savingMachId, setSavingMachId] = useState(null);

  const handleQuickTimeChange = (machId, val) => {
    setQuickBatchTimes(prev => ({ ...prev, [machId]: val }));
  };

  const handleQuickSaveBatchTime = async (m) => {
    const val = parseFloat(quickBatchTimes[m.id]);
    if (isNaN(val) || val <= 0) {
      if (showToast) showToast('Please enter a valid positive batch processing time in hours.', 'error');
      return;
    }
    setSavingMachId(m.id);
    try {
      const res = await fetch(`/api/machines/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...m,
          processing_time_hours: val,
          capacity_kg: m.capacity_kg || m.max_batch_kg
        })
      });
      if (!res.ok) throw new Error('Failed to update machine batch time');
      if (showToast) showToast(`✓ ${m.code} (${m.name}) batch time updated to ${val} hrs/batch!`);
      setQuickBatchTimes(prev => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast('Error saving batch time: ' + err.message, 'error');
    } finally {
      setSavingMachId(null);
    }
  };

  // Changeover matrix filtering & testing
  const [selectedFabric, setSelectedFabric] = useState('Cotton');
  const [selectedMachType, setSelectedMachType] = useState('JET_DYEING');
  const [matrixData, setMatrixData] = useState(changeoverMatrix);
  const [loadingMatrix, setLoadingMatrix] = useState(false);

  // Ad-hoc transition test
  const [testFromColour, setTestFromColour] = useState('JET_BLACK');
  const [testToColour, setTestToColour] = useState('WHITE');
  const [testResult, setTestResult] = useState(null);
  const [calculatingTest, setCalculatingTest] = useState(false);

  // Reload changeover matrix on fabric / machine type filter
  const reloadMatrix = async (fab, mType) => {
    setLoadingMatrix(true);
    try {
      const res = await fetch(`/api/schedule/changeover-matrix?fabric=${encodeURIComponent(fab)}&machine_type=${encodeURIComponent(mType)}`);
      const data = await res.json();
      setMatrixData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMatrix(false);
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
    }
  };

  const handleCalculateTest = async () => {
    setCalculatingTest(true);
    try {
      const res = await fetch(`/api/schedule/changeover-calculate?from_colour=${testFromColour}&to_colour=${testToColour}&from_fabric=${selectedFabric}&to_fabric=${selectedFabric}&machine_type=${selectedMachType}`, {
        method: 'POST'
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      if (showToast) showToast('Calculator error: ' + e.message, 'error');
    } finally {
      setCalculatingTest(false);
    }
  };

  const handleCompleteMaintenance = async (machId) => {
    try {
      const res = await fetch(`/api/machines/${machId}/complete-maintenance`, { method: 'POST' });
      const data = await res.json();
      if (showToast) showToast(data.message || 'Machine returned to active service!');
      if (onRefresh) onRefresh();
    } catch (e) {
      if (showToast) showToast('Failed to complete maintenance: ' + e.message, 'error');
    }
  };

  const totalMachines = machines.length;
  const inMaintenance = machines.filter(m => m.status === 'MAINTENANCE' || m.active_maintenance).length;
  const available = machines.filter(m => m.status === 'AVAILABLE').length;

  return (
    <div className="space-y-6">
      {/* Fleet Overview Header */}
      <div className="glass-panel p-5 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-900 tracking-wide">Dyeing Vessel Fleet & Maintenance Management</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-blue-700 border border-cyan-500/40">
              Fleet Control
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage vessel capacities, add new units, configure maintenance downtime with auto-rescheduling, and optimize changeovers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-400">Total: <strong className="text-slate-900 font-bold">{totalMachines}</strong></span>
            <span className="text-emerald-600">Available: <strong>{available}</strong></span>
            <span className="text-amber-700">In Maint: <strong>{inMaintenance}</strong></span>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all shadow-md shadow-cyan-900/30"
          >
            <i data-lucide="plus-circle" className="w-4 h-4"></i>
            <span>Add New Machine</span>
          </button>
        </div>
      </div>

      {/* Machine Fleet Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map(m => {
          const isMaint = m.status === 'MAINTENANCE' || !!m.active_maintenance;
          const maint = m.active_maintenance;
          return (
            <div
              key={m.id}
              className={`p-4 rounded-xl border flex flex-col justify-between transition-all shadow-lg ${
                isMaint
                  ? 'bg-amber-950/20 border-amber-500/60 shadow-amber-950/30'
                  : 'bg-[#F8FAFC] border-slate-200/70 hover:border-slate-600'
              }`}
            >
              <div>
                {/* Header: Code + Status Badge */}
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{m.code}</span>
                  {isMaint ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/25 text-amber-800 border border-amber-500/50 flex items-center gap-1">
                      <i data-lucide="wrench" className="w-2.5 h-2.5 text-amber-700"></i>
                      <span>IN MAINTENANCE ({maint?.remaining_hours || 4}h)</span>
                    </span>
                  ) : m.status === 'RUNNING' ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                      RUNNING
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-700 border border-emerald-500/40 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>AVAILABLE</span>
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-slate-900">{m.name}</h4>
                <div className="text-[11px] text-blue-600 font-medium mt-0.5">
                  {m.machine_type.replace('_', ' ')} • ID: <strong className="text-slate-800 font-mono">{m.code}</strong>
                </div>

                {/* Key Machine Parameters: Capacity, Processing Time (Modifiable), Working Hours */}
                <div className="mt-2.5 p-2 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-3 gap-1 text-center text-xs">
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Capacity</div>
                    <div className="font-black text-slate-900 text-xs mt-1">{m.capacity_kg || m.max_batch_kg} <span className="text-[9px] font-normal text-slate-500">kg</span></div>
                  </div>
                  <div className="border-x border-slate-200 px-0.5">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Batch Time</div>
                    <div className="flex items-center justify-center gap-0.5 mt-0.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={quickBatchTimes[m.id] !== undefined ? quickBatchTimes[m.id] : (m.processing_time_hours || 3.0)}
                        onChange={e => handleQuickTimeChange(m.id, e.target.value)}
                        className="w-11 text-center font-black text-blue-700 text-xs bg-white border border-slate-300 rounded px-0.5 py-0.5 focus:border-blue-600 focus:ring-1 focus:ring-blue-200"
                        title="Edit Batch Processing Time (hours/batch)"
                      />
                      <span className="text-[9px] font-bold text-slate-400">h</span>
                      {quickBatchTimes[m.id] !== undefined && parseFloat(quickBatchTimes[m.id]) !== (m.processing_time_hours || 3.0) && (
                        <button
                          onClick={() => handleQuickSaveBatchTime(m)}
                          disabled={savingMachId === m.id}
                          className="px-1 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold shadow transition-all cursor-pointer"
                          title="Save Batch Time"
                        >
                          {savingMachId === m.id ? '..' : '✓'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Work Shift</div>
                    <div className="font-black text-emerald-700 text-xs mt-1">{m.working_hours_per_day || 8.0} <span className="text-[9px] font-normal text-slate-500">h/day</span></div>
                  </div>
                </div>

                {/* Specs List */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-400">
                  <div>Efficiency: <strong className="text-slate-700">{(m.efficiency * 100).toFixed(0)}%</strong></div>
                  <div>Speed: <strong className="text-slate-700">{m.processing_speed}x</strong></div>
                  <div>Power: <strong className="text-slate-600">{m.power_kw} kW</strong></div>
                  <div>Steam: <strong className="text-slate-600">{m.steam_kg_hr} kg/h</strong></div>
                  <div className="col-span-2 truncate">
                    Fabrics: <span className="text-slate-600">{m.compatible_cloth_types || 'All Fabrics'}</span>
                  </div>
                </div>

                {/* Maintenance Detail if active */}
                {isMaint && maint && (
                  <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 border border-amber-500/40 text-[11px] text-amber-200">
                    <div className="font-bold flex items-center gap-1 text-amber-800">
                      <i data-lucide="alert-circle" className="w-3 h-3"></i>
                      <span>{maint.title}</span>
                    </div>
                    <div className="text-[10px] text-amber-800/80 mt-0.5">
                      Ends: {new Date(maint.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({maint.remaining_hours} hrs left)
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                {isMaint ? (
                  <button
                    onClick={() => handleCompleteMaintenance(m.id)}
                    className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow"
                  >
                    <i data-lucide="check" className="w-3.5 h-3.5"></i>
                    <span>Return to Service</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setMaintainingMachine(m)}
                    className="flex-1 py-1.5 px-2 bg-amber-600/30 hover:bg-amber-600 hover:text-white text-amber-800 border border-amber-500/40 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                  >
                    <i data-lucide="wrench" className="w-3.5 h-3.5"></i>
                    <span>Maintenance</span>
                  </button>
                )}

                <button
                  onClick={() => setEditingMachine(m)}
                  className="p-1.5 bg-slate-100 hover:bg-slate-700 text-slate-600 rounded-lg transition-all border border-slate-300"
                  title="Edit Machine Specifications"
                >
                  <i data-lucide="edit-3" className="w-3.5 h-3.5"></i>
                </button>

                <button
                  onClick={() => setDeletingMachine(m)}
                  className="p-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-900 text-rose-700 rounded-lg transition-all border border-rose-800/50"
                  title="Remove Machine from Fleet"
                >
                  <i data-lucide="trash-2" className="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Multi-Dimensional Colour Changeover Heatmap & Calculator */}
      <div className="glass-panel p-5 border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Sequence-Dependent Changeover Matrix & Penalty Inspector</h3>
            <p className="text-xs text-slate-400">Shows changeover cleaning time (min), water usage (L), and caustic chemical stripping costs</p>
          </div>

          {/* Filter selectors */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Fabric:</span>
              <select
                value={selectedFabric}
                onChange={e => {
                  setSelectedFabric(e.target.value);
                  reloadMatrix(e.target.value, selectedMachType);
                }}
                className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900"
              >
                <option value="Cotton" className="text-slate-900 bg-white">Cotton</option>
                <option value="Polyester" className="text-slate-900 bg-white">Polyester</option>
                <option value="Poly-Cotton Blend" className="text-slate-900 bg-white">Poly-Cotton Blend</option>
                <option value="Rayon Viscose" className="text-slate-900 bg-white">Rayon Viscose</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Vessel:</span>
              <select
                value={selectedMachType}
                onChange={e => {
                  setSelectedMachType(e.target.value);
                  reloadMatrix(selectedFabric, e.target.value);
                }}
                className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-900"
              >
                <option value="JET_DYEING" className="text-slate-900 bg-white">Jet Dyeing</option>
                <option value="SOFT_FLOW" className="text-slate-900 bg-white">Soft Flow</option>
                <option value="JIGGER" className="text-slate-900 bg-white">Jigger Dyeing</option>
                <option value="WINCH" className="text-slate-900 bg-white">Winch Vessel</option>
              </select>
            </div>
          </div>
        </div>

        {/* Changeover Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs text-slate-600">
            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
              <tr>
                <th className="py-2.5 px-3 text-left">From \ To</th>
                {(matrixData || []).map((r, i) => (
                  <th key={i} className="py-2.5 px-3">{r.from_colour}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
              {(matrixData || []).map((row, i) => (
                <tr key={i} className="hover:bg-blue-50/40">
                  <td className="py-2.5 px-3 text-left font-bold font-sans text-slate-700">{row.from_colour}</td>
                  {Object.entries(row.transitions || {}).map(([toCol, data], j) => {
                    const dur = data.changeover_min;
                    const isSevere = dur > 45;
                    const isMinimal = dur <= 10;
                    return (
                      <td key={j} className={`py-2 px-3 ${
                        isSevere ? 'bg-rose-50 text-rose-800 border border-rose-200 font-bold' :
                        isMinimal ? 'bg-emerald-950/30 text-emerald-700' : 'text-slate-600'
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

        {/* Ad-Hoc Changeover Transition Calculator Sandbox */}
        <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <i data-lucide="sparkles" className="w-3.5 h-3.5 text-blue-600"></i>
              <span>Ad-Hoc Changeover Transition Impact Calculator</span>
            </span>
            <span className="text-[11px] text-slate-400">Test penalty between any two consecutive dye shades</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-[10px] text-slate-700 block mb-1">Preceding Colour (From)</label>
              <select
                value={testFromColour}
                onChange={e => setTestFromColour(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900"
              >
                {['WHITE', 'SKY_BLUE', 'GOLDEN_YELLOW', 'ROYAL_BLUE', 'SCARLET_RED', 'DEEP_NAVY', 'JET_BLACK'].map(c => (
                  <option key={c} value={c} className="text-slate-900 bg-white">{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-700 block mb-1">Succeeding Colour (To)</label>
              <select
                value={testToColour}
                onChange={e => setTestToColour(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900"
              >
                {['WHITE', 'SKY_BLUE', 'GOLDEN_YELLOW', 'ROYAL_BLUE', 'SCARLET_RED', 'DEEP_NAVY', 'JET_BLACK'].map(c => (
                  <option key={c} value={c} className="text-slate-900 bg-white">{c}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCalculateTest}
              disabled={calculatingTest}
              className="py-1.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded transition-all flex items-center justify-center gap-1.5 shadow"
            >
              <i data-lucide="calculator" className="w-3.5 h-3.5"></i>
              <span>Calculate Impact</span>
            </button>

            {testResult && (
              <div className="p-2 rounded bg-[#F8FAFC] border border-cyan-500/40 text-[11px] space-y-0.5 text-slate-600">
                <div>Time: <strong className="text-blue-700">{testResult.changeover_min} min</strong> ({testResult.cleaning_min}m wash)</div>
                <div>Water: <strong className="text-slate-700">{testResult.water_litres} L</strong> • Cost: <strong className="text-emerald-600">₹{testResult.chemical_cost_inr}</strong></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddMachineModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            if (onRefresh) onRefresh();
            if (showToast) showToast('New machine successfully added to factory fleet!');
          }}
          showToast={showToast}
        />
      )}

      {editingMachine && (
        <EditMachineModal
          machine={editingMachine}
          onClose={() => setEditingMachine(null)}
          onSuccess={() => {
            setEditingMachine(null);
            if (onRefresh) onRefresh();
            if (showToast) showToast(`Machine ${editingMachine.name} updated successfully!`);
          }}
          showToast={showToast}
        />
      )}

      {maintainingMachine && (
        <ScheduleMaintenanceModal
          machine={maintainingMachine}
          onClose={() => setMaintainingMachine(null)}
          onSuccess={(res) => {
            setMaintainingMachine(null);
            if (onRefresh) onRefresh();
            if (showToast) showToast(res.summary || `Maintenance scheduled for ${maintainingMachine.name}!`);
          }}
          showToast={showToast}
        />
      )}

      {deletingMachine && (
        <DeleteMachineModal
          machine={deletingMachine}
          onClose={() => setDeletingMachine(null)}
          onSuccess={(msg) => {
            setDeletingMachine(null);
            if (onRefresh) onRefresh();
            if (showToast) showToast(msg);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// 5A. ADD MACHINE MODAL
function AddMachineModal({ onClose, onSuccess, showToast }) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    machine_type: 'JET_DYEING',
    capacity_kg: 600,
    min_batch_kg: 100,
    max_batch_kg: 600,
    processing_time_hours: 3.0,
    loading_time_hours: 0.5,
    unloading_time_hours: 0.5,
    cleaning_time_hours: 1.0,
    working_hours_per_day: 8.0,
    processing_speed: 1.0,
    efficiency: 0.92,
    power_kw: 50,
    water_m3_hr: 4.0,
    steam_kg_hr: 650,
    compatible_cloth_types: 'Cotton,Polyester,Poly-Cotton Blend'
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create machine');
      }
      onSuccess();
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel p-6 max-w-lg w-full border border-slate-200/80 space-y-4 shadow-2xl">
        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="plus-circle" className="w-4 h-4 text-blue-600"></i>
            <span>Add New Dyeing Machine</span>
          </h3>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900 text-xs">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Machine Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Jet Dyeing Machine M7"
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Machine Code (Optional)</label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="Auto-generated if blank"
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Machine Type</label>
              <select
                value={form.machine_type}
                onChange={e => setForm({ ...form, machine_type: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              >
                <option value="JET_DYEING" className="text-slate-900 bg-white">Jet Dyeing Machine</option>
                <option value="SOFT_FLOW" className="text-slate-900 bg-white">Soft Flow Vessel</option>
                <option value="JIGGER" className="text-slate-900 bg-white">Jigger Dyeing Machine</option>
                <option value="WINCH" className="text-slate-900 bg-white">Winch Dyeing Vessel</option>
              </select>
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Max Batch Capacity (kg) *</label>
              <input
                type="number"
                required
                value={form.max_batch_kg}
                onChange={e => setForm({ ...form, max_batch_kg: parseFloat(e.target.value) || 0, capacity_kg: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Processing Time per Batch (hours) *</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={form.processing_time_hours}
                onChange={e => setForm({ ...form, processing_time_hours: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Working Hours (hours/day) *</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="24"
                required
                value={form.working_hours_per_day}
                onChange={e => setForm({ ...form, working_hours_per_day: parseFloat(e.target.value) || 8.0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Loading Time (hr) *</label>
              <input
                type="number"
                step="0.1"
                min="0.0"
                required
                value={form.loading_time_hours}
                onChange={e => setForm({ ...form, loading_time_hours: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Unloading Time (hr) *</label>
              <input
                type="number"
                step="0.1"
                min="0.0"
                required
                value={form.unloading_time_hours}
                onChange={e => setForm({ ...form, unloading_time_hours: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Cleaning Time (hr) *</label>
              <input
                type="number"
                step="0.1"
                min="0.0"
                required
                value={form.cleaning_time_hours}
                onChange={e => setForm({ ...form, cleaning_time_hours: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Min Batch (kg)</label>
              <input
                type="number"
                value={form.min_batch_kg}
                onChange={e => setForm({ ...form, min_batch_kg: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Efficiency (0.8-1.0)</label>
              <input
                type="number"
                step="0.01"
                value={form.efficiency}
                onChange={e => setForm({ ...form, efficiency: parseFloat(e.target.value) || 0.9 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Speed Factor</label>
              <input
                type="number"
                step="0.05"
                value={form.processing_speed}
                onChange={e => setForm({ ...form, processing_speed: parseFloat(e.target.value) || 1.0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Power (kW)</label>
              <input
                type="number"
                value={form.power_kw}
                onChange={e => setForm({ ...form, power_kw: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Water (m³/h)</label>
              <input
                type="number"
                step="0.1"
                value={form.water_m3_hr}
                onChange={e => setForm({ ...form, water_m3_hr: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Steam (kg/h)</label>
              <input
                type="number"
                value={form.steam_kg_hr}
                onChange={e => setForm({ ...form, steam_kg_hr: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Compatible Fabrics (comma-separated)</label>
            <input
              type="text"
              value={form.compatible_cloth_types}
              onChange={e => setForm({ ...form, compatible_cloth_types: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-slate-800 text-slate-600 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Machine to Fleet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 5B. EDIT MACHINE MODAL
function EditMachineModal({ machine, onClose, onSuccess, showToast }) {
  const [form, setForm] = useState({
    name: machine.name,
    machine_type: machine.machine_type,
    max_batch_kg: machine.max_batch_kg,
    min_batch_kg: machine.min_batch_kg,
    processing_time_hours: machine.processing_time_hours || 3.0,
    loading_time_hours: machine.loading_time_hours !== undefined ? machine.loading_time_hours : 0.5,
    unloading_time_hours: machine.unloading_time_hours !== undefined ? machine.unloading_time_hours : 0.5,
    cleaning_time_hours: machine.cleaning_time_hours !== undefined ? machine.cleaning_time_hours : 1.0,
    working_hours_per_day: machine.working_hours_per_day || 8.0,
    efficiency: machine.efficiency,
    processing_speed: machine.processing_speed,
    power_kw: machine.power_kw,
    water_m3_hr: machine.water_m3_hr,
    steam_kg_hr: machine.steam_kg_hr,
    compatible_cloth_types: machine.compatible_cloth_types || 'Cotton,Polyester'
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/machines/${machine.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          capacity_kg: form.max_batch_kg,
          processing_time_hours: form.processing_time_hours,
          loading_time_hours: form.loading_time_hours,
          unloading_time_hours: form.unloading_time_hours,
          cleaning_time_hours: form.cleaning_time_hours,
          working_hours_per_day: form.working_hours_per_day
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update machine');
      }
      onSuccess();
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel p-6 max-w-lg w-full border border-slate-200/80 space-y-4 shadow-2xl">
        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="edit-3" className="w-4 h-4 text-blue-600"></i>
            <span>Edit Machine: {machine.code}</span>
          </h3>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900 text-xs">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="text-slate-700 block mb-1">Machine Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Max Batch Capacity (kg)</label>
              <input
                type="number"
                required
                value={form.max_batch_kg}
                onChange={e => setForm({ ...form, max_batch_kg: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Min Batch (kg)</label>
              <input
                type="number"
                value={form.min_batch_kg}
                onChange={e => setForm({ ...form, min_batch_kg: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Processing Time per Batch (hours) *</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={form.processing_time_hours}
                onChange={e => setForm({ ...form, processing_time_hours: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Working Hours (hours/day) *</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="24"
                required
                value={form.working_hours_per_day}
                onChange={e => setForm({ ...form, working_hours_per_day: parseFloat(e.target.value) || 8.0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Loading Time (hr) *</label>
              <input
                type="number"
                step="0.1"
                min="0.0"
                required
                value={form.loading_time_hours}
                onChange={e => setForm({ ...form, loading_time_hours: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Unloading Time (hr) *</label>
              <input
                type="number"
                step="0.1"
                min="0.0"
                required
                value={form.unloading_time_hours}
                onChange={e => setForm({ ...form, unloading_time_hours: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1 font-semibold">Cleaning Time (hr) *</label>
              <input
                type="number"
                step="0.1"
                min="0.0"
                required
                value={form.cleaning_time_hours}
                onChange={e => setForm({ ...form, cleaning_time_hours: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Efficiency (0.80 - 1.00)</label>
              <input
                type="number"
                step="0.01"
                value={form.efficiency}
                onChange={e => setForm({ ...form, efficiency: parseFloat(e.target.value) || 0.9 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Processing Speed Factor</label>
              <input
                type="number"
                step="0.05"
                value={form.processing_speed}
                onChange={e => setForm({ ...form, processing_speed: parseFloat(e.target.value) || 1.0 })}
                className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Compatible Fabrics (comma-separated)</label>
            <input
              type="text"
              value={form.compatible_cloth_types}
              onChange={e => setForm({ ...form, compatible_cloth_types: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-slate-800 text-slate-600 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 5C. SCHEDULE MAINTENANCE MODAL (Prompts for duration in hours)
function ScheduleMaintenanceModal({ machine, onClose, onSuccess, showToast }) {
  const [hours, setHours] = useState(6.0);
  const [title, setTitle] = useState('Scheduled Preventive Maintenance & Descaling');
  const [maintType, setMaintType] = useState('PREVENTIVE');
  const [notes, setNotes] = useState('Inspect seals, pump impellers, and heat exchanger pipes.');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/machines/${machine.id}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hours: parseFloat(hours) || 4.0,
          title,
          maintenance_type: maintType,
          notes
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to schedule maintenance');
      }
      const data = await res.json();
      onSuccess(data);
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel p-6 max-w-md w-full border border-amber-500/50 space-y-4 shadow-2xl">
        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
          <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2">
            <i data-lucide="wrench" className="w-4 h-4 text-amber-700"></i>
            <span>Set Machine Maintenance Mode</span>
          </h3>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900 text-xs">✕</button>
        </div>

        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200">
          Target Machine: <strong>{machine.name} ({machine.code})</strong>
          <p className="text-[10px] text-amber-800/80 mt-1">
            Setting maintenance mode will reserve this vessel and <strong>automatically reschedule colliding jobs</strong> around the downtime.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="text-slate-600 font-bold block mb-1">
              Maintenance Duration (How many hours?) *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="720"
                required
                value={hours}
                onChange={e => setHours(e.target.value)}
                className="w-full bg-white border border-amber-500/50 rounded px-3 py-2 text-slate-900 font-mono font-bold text-sm"
              />
              <span className="text-slate-400 text-xs">hours</span>
            </div>
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Maintenance Title / Reason</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
            />
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Maintenance Category</label>
            <select
              value={maintType}
              onChange={e => setMaintType(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
            >
              <option value="PREVENTIVE" className="text-slate-900 bg-white">Preventive Maintenance (Routine)</option>
              <option value="EMERGENCY" className="text-slate-900 bg-white">Urgent Mechanical Repair</option>
              <option value="OVERHAUL" className="text-slate-900 bg-white">Deep Cleaning & Acid Boil-Out Overhaul</option>
            </select>
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Maintenance Notes & Instructions</label>
            <textarea
              rows="2"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900"
            ></textarea>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-slate-800 text-slate-600 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-900/40 disabled:opacity-50 flex items-center gap-1.5"
            >
              <i data-lucide="wrench" className="w-3.5 h-3.5"></i>
              <span>{submitting ? 'Rescheduling...' : 'Apply Maintenance & Reschedule'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 5D. DELETE MACHINE CONFIRMATION MODAL
function DeleteMachineModal({ machine, onClose, onSuccess, showToast }) {
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/machines/${machine.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to delete machine');
      }
      const data = await res.json();
      onSuccess(data.message);
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel p-6 max-w-md w-full border border-rose-500/50 space-y-4 shadow-2xl">
        <div className="flex items-center gap-3 text-rose-600">
          <i data-lucide="alert-triangle" className="w-6 h-6"></i>
          <h3 className="text-sm font-bold text-slate-900">Remove Dyeing Machine</h3>
        </div>

        <p className="text-xs text-slate-600">
          Are you sure you want to remove <strong className="text-slate-900 font-bold">{machine.name} ({machine.code})</strong> from the factory fleet?
        </p>

        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-700">
          Any production orders currently scheduled on this machine will be <strong>automatically reassigned</strong> across remaining available machines by the TOC scheduler.
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded bg-slate-800 text-slate-600 text-xs">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={submitting}
            className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow disabled:opacity-50"
          >
            {submitting ? 'Removing...' : 'Confirm Remove Machine'}
          </button>
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
      <div className="glass-panel p-5 border border-slate-200 space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Material Requirement Planning (MRP) & Inventory Forecasting</h3>
            <p className="text-xs text-slate-400">Calculates: Required = Planned Production + Safety Stock − Available Inventory</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-200 font-medium">
              {forecasts.map((f, i) => (
                <tr key={i} className="hover:bg-blue-50/40">
                  <td className="py-3 px-4 font-bold text-slate-900">{f.material_name}</td>
                  <td className="py-3 px-4">{f.available_stock} {f.unit}</td>
                  <td className="py-3 px-4 text-slate-400">{f.safety_stock} {f.unit}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{f.planned_requirement} {f.unit}</td>
                  <td className="py-3 px-4 font-bold text-rose-600">{f.projected_shortage > 0 ? `${f.projected_shortage} ${f.unit}` : '0'}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      f.status === 'HEALTHY' ? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30' :
                      'bg-rose-500/20 text-rose-600 border border-rose-500/30'
                    }`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-blue-600 font-bold">{f.suggested_reorder_qty > 0 ? `${f.suggested_reorder_qty} ${f.unit}` : 'None needed'}</td>
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
          <h2 className="text-lg font-bold text-slate-900">Dynamic Shop Floor Disruption Simulator</h2>
          <p className="text-xs text-slate-400">Trigger unexpected equipment failures and observe real-time schedule repair & constraint migration</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs text-slate-700 block mb-1">Target Machine to Fail</label>
            <select
              value={selectedMachine}
              onChange={e => setSelectedMachine(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
            >
              {machines.map(m => (
                <option key={m.id} value={m.id} className="text-slate-900 bg-white">{m.name} ({m.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-700 block mb-1">Failure Duration (Hours)</label>
            <input
              type="number"
              value={breakdownHours}
              onChange={e => setBreakdownHours(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
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
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-rose-500/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-rose-700">Rescheduling Ripple Effect Summary</span>
              <span className="text-[10px] text-slate-400">Completed in 42ms</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-400 text-[10px]">Affected Jobs</div>
                <div className="font-bold text-slate-900 mt-0.5">{breakdownImpact.affected_count}</div>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-400 text-[10px]">Rerouted Alternate</div>
                <div className="font-bold text-emerald-600 mt-0.5">{breakdownImpact.reassigned_orders.length}</div>
              </div>
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <div className="text-slate-400 text-[10px]">Late Delivery Risk</div>
                <div className="font-bold text-rose-600 mt-0.5">{breakdownImpact.delayed_orders.length}</div>
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
          <h2 className="text-lg font-bold text-slate-900">What-If Strategic Scenario Sandbox</h2>
          <p className="text-xs text-slate-400">Run isolated simulations to explore capacity changes without altering live factory production</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <select
            value={scenarioType}
            onChange={e => setScenarioType(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 flex-1"
          >
            <option value="ADD_SHIFT" className="text-slate-900 bg-white">What if we authorize a 3rd night shift (22:00–06:00)?</option>
            <option value="BREAKDOWN" className="text-slate-900 bg-white">What if Jet Dyeing M2 fails for 48 hours?</option>
            <option value="MATERIAL_DELAY" className="text-slate-900 bg-white">What if critical Reactive Blue dye arrives 3 days late?</option>
            <option value="RUSH_ORDER" className="text-slate-900 bg-white">What if a VIP Emergency Order (1,200 kg Navy) arrives today?</option>
            <option value="TIME_INFLATION" className="text-slate-900 bg-white">What if boiler steam drops, expanding dye times by +15%?</option>
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
          <div className="mt-6 p-5 rounded-xl bg-slate-50 border border-purple-500/40 space-y-4">
            <h3 className="font-bold text-sm text-purple-300">{result.scenario_name}</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase">On-Time Delivery Diff</div>
                <div className="text-lg font-black text-slate-900 mt-1">
                  {result.baseline_on_time_pct}% → <span className={result.simulated_on_time_pct >= result.baseline_on_time_pct ? 'text-emerald-600' : 'text-rose-600'}>{result.simulated_on_time_pct}%</span>
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase">Cost Impact</div>
                <div className="text-lg font-black text-amber-700 mt-1">+₹{result.cost_difference_inr.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-400 uppercase">Delayed Orders</div>
                <div className="text-lg font-black text-slate-700 mt-1">{result.delayed_orders_count}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
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

// Render React Root
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);