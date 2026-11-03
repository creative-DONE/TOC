const { useState, useEffect, useMemo, useRef } = React;

// Color palette generator for pastel blocks in Gantt
const PALETTE = [
  { bg: "#E0E7FF", text: "#3730A3", border: "#C7D2FE" },
  { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  { bg: "#DCFCE7", text: "#166534", border: "#BBF7D0" },
  { bg: "#FCE7F3", text: "#9D174D", border: "#FBCFE8" },
  { bg: "#EDE9FE", text: "#5B21B6", border: "#DDD6FE" },
  { bg: "#CCFBF1", text: "#115E59", border: "#99F6E4" },
  { bg: "#FFEDD5", text: "#9A3412", border: "#FED7AA" },
  { bg: "#F3E8FF", text: "#6B21A8", border: "#E9D5FF" },
  { bg: "#E0F2FE", text: "#075985", border: "#BAE6FD" },
  { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
];

function getOrderColor(orderNo) {
  if (!orderNo) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < orderNo.length; i++) {
    hash = orderNo.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("planning");
  const [notification, setNotification] = useState(null);

  // Filters & Search
  const [orderSearch, setOrderSearch] = useState("");
  const [appliedOrderSearch, setAppliedOrderSearch] = useState("");
  const [orderPage, setOrderPage] = useState(1);

  const [summaryPage, setSummaryPage] = useState(1);

  const [batchOrderSearch, setBatchOrderSearch] = useState("");
  const [appliedBatchOrderSearch, setAppliedBatchOrderSearch] = useState("");
  const [batchVesselFilter, setBatchVesselFilter] = useState("All vessels");
  const [batchPage, setBatchPage] = useState(1);

  // Gantt state
  const [ganttSearch, setGanttSearch] = useState("");
  const [highlightedOrder, setHighlightedOrder] = useState(null);
  const [colourBy, setColourBy] = useState("Order");
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [hoveredBatch, setHoveredBatch] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Modals
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [showAddVessel, setShowAddVessel] = useState(false);
  const [showAddDowntime, setShowAddDowntime] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingVessel, setEditingVessel] = useState(null);

  // Inline editing state for vessels
  const [editingMinCaps, setEditingMinCaps] = useState({});
  const [editingMaxCaps, setEditingMaxCaps] = useState({});
  const [savingVesselId, setSavingVesselId] = useState(null);
  const [showAllVessels, setShowAllVessels] = useState(false);

  // Form Controls
  const [vesselsFreeFrom, setVesselsFreeFrom] = useState("2026-10-28T00:00");
  const [safetyBufferHrs, setSafetyBufferHrs] = useState(4);
  const [overdueNewDueDays, setOverdueNewDueDays] = useState(0);
  const [scheduleShown, setScheduleShown] = useState("Optimised (fewest batches)");

  const showToast = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/vessel-planning/state");
      const json = await res.json();
      setData(json);
      if (json.config) {
        setVesselsFreeFrom(json.config.vessels_free_from || "2026-10-28T00:00");
        setSafetyBufferHrs(json.config.safety_buffer_hrs || 4);
        setOverdueNewDueDays(json.config.overdue_new_due_days || 0);
        setScheduleShown(json.config.schedule_shown || "Optimised (fewest batches)");
      }
    } catch (err) {
      console.error("Failed to load vessel planning data:", err);
      showToast("Error loading planning data: " + err.message, "error");
    } finally {
      setLoading(false);
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 100);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMinCapChange = (vesselId, val) => {
    setEditingMinCaps(prev => ({ ...prev, [vesselId]: val }));
  };

  const handleMaxCapChange = (vesselId, val) => {
    setEditingMaxCaps(prev => ({ ...prev, [vesselId]: val }));
  };

  const handleSaveMinCap = async (vessel) => {
    const rawVal = editingMinCaps[vessel.id];
    if (rawVal === undefined) return;
    const val = parseFloat(rawVal);
    if (isNaN(val) || val < 0) {
      showToast("Please enter a valid minimum capacity (>= 0 kg)", "error");
      setEditingMinCaps(prev => {
        const next = { ...prev };
        delete next[vessel.id];
        return next;
      });
      return;
    }
    if (val === Number(vessel.min_cap)) {
      setEditingMinCaps(prev => {
        const next = { ...prev };
        delete next[vessel.id];
        return next;
      });
      return;
    }

    setSavingVesselId(vessel.id);
    try {
      const res = await fetch(`/api/vessel-planning/vessel/${vessel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ min_cap: val })
      });
      if (!res.ok) throw new Error("Failed to update min capacity");
      
      setData(prev => {
        if (!prev) return prev;
        const updatedVessels = (prev.vessels || []).map(v => v.id === vessel.id ? { ...v, min_cap: val } : v);
        const updatedBatches = (prev.batches || []).map(b => b.vessel === vessel.code ? { ...b, min_cap: val } : b);
        return { ...prev, vessels: updatedVessels, batches: updatedBatches };
      });

      setEditingMinCaps(prev => {
        const next = { ...prev };
        delete next[vessel.id];
        return next;
      });
      showToast(`✓ Vessel ${vessel.code} min capacity updated to ${val} kg!`);
    } catch (err) {
      showToast("Error updating min capacity: " + err.message, "error");
    } finally {
      setSavingVesselId(null);
    }
  };

  const handleSaveMaxCap = async (vessel) => {
    const rawVal = editingMaxCaps[vessel.id];
    if (rawVal === undefined) return;
    const val = parseFloat(rawVal);
    if (isNaN(val) || val <= 0) {
      showToast("Please enter a valid positive maximum capacity (> 0 kg)", "error");
      setEditingMaxCaps(prev => {
        const next = { ...prev };
        delete next[vessel.id];
        return next;
      });
      return;
    }
    if (val === Number(vessel.max_cap)) {
      setEditingMaxCaps(prev => {
        const next = { ...prev };
        delete next[vessel.id];
        return next;
      });
      return;
    }

    setSavingVesselId(vessel.id);
    try {
      const res = await fetch(`/api/vessel-planning/vessel/${vessel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_cap: val })
      });
      if (!res.ok) throw new Error("Failed to update max capacity");
      
      setData(prev => {
        if (!prev) return prev;
        const updatedVessels = (prev.vessels || []).map(v => v.id === vessel.id ? { ...v, max_cap: val } : v);
        const updatedBatches = (prev.batches || []).map(b => {
          if (b.vessel === vessel.code) {
            const fillPct = Math.min(100, Math.round(((b.batch_kg || 0) / val) * 100));
            return { ...b, max_cap: val, fill_pct: fillPct };
          }
          return b;
        });
        return { ...prev, vessels: updatedVessels, batches: updatedBatches };
      });

      setEditingMaxCaps(prev => {
        const next = { ...prev };
        delete next[vessel.id];
        return next;
      });
      showToast(`✓ Vessel ${vessel.code} max capacity updated to ${val} kg!`);
    } catch (err) {
      showToast("Error updating max capacity: " + err.message, "error");
    } finally {
      setSavingVesselId(null);
    }
  };

  const handleBuildSchedule = async () => {
    try {
      const res = await fetch("/api/vessel-planning/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessels_free_from: vesselsFreeFrom,
          safety_buffer_hrs: Number(safetyBufferHrs),
          overdue_new_due_days: Number(overdueNewDueDays),
          schedule_shown: scheduleShown
        })
      });
      const resJson = await res.json();
      showToast(resJson.message || "Schedule built successfully!");
      await fetchData();
    } catch (err) {
      showToast("Build schedule failed: " + err.message, "error");
    }
  };

  const handleSavePlan = async () => {
    try {
      const res = await fetch("/api/vessel-planning/save", { method: "POST" });
      const resJson = await res.json();
      showToast(resJson.message || "Plan fixed and saved!");
      await fetchData();
    } catch (err) {
      showToast("Failed to save plan: " + err.message, "error");
    }
  };

  const handleReset = async () => {
    try {
      const res = await fetch("/api/vessel-planning/reset", { method: "POST" });
      const resJson = await res.json();
      showToast(resJson.message || "Reset to defaults");
      await fetchData();
    } catch (err) {
      showToast("Reset failed: " + err.message, "error");
    }
  };

  // Filtered orders for Orders table
  const filteredOrders = useMemo(() => {
    if (!data || !data.orders) return [];
    if (!appliedOrderSearch.trim()) return data.orders;
    const term = appliedOrderSearch.toLowerCase();
    return data.orders.filter(o =>
      (o.order_no && o.order_no.toLowerCase().includes(term)) ||
      (o.shade && o.shade.toLowerCase().includes(term))
    );
  }, [data, appliedOrderSearch]);

  // Paginated orders (10 per page)
  const ordersPerPage = 10;
  const totalOrderPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));
  const currentOrdersPageData = useMemo(() => {
    const start = (orderPage - 1) * ordersPerPage;
    return filteredOrders.slice(start, start + ordersPerPage);
  }, [filteredOrders, orderPage]);

  // Paginated order summary (10 per page)
  const totalSummaryPages = Math.max(1, Math.ceil((data?.orders?.length || 0) / ordersPerPage));
  const currentSummaryPageData = useMemo(() => {
    if (!data || !data.orders) return [];
    const start = (summaryPage - 1) * ordersPerPage;
    return data.orders.slice(start, start + ordersPerPage);
  }, [data, summaryPage]);

  // Filtered batches for Batch Schedule table
  const filteredBatches = useMemo(() => {
    if (!data || !data.batches) return [];
    let list = data.batches;
    if (activeTab === "fixed") {
      list = list.filter(b => b.is_fixed);
    }
    if (batchVesselFilter && batchVesselFilter !== "All vessels") {
      list = list.filter(b => b.vessel === batchVesselFilter);
    }
    if (appliedBatchOrderSearch.trim()) {
      const term = appliedBatchOrderSearch.toLowerCase();
      list = list.filter(b =>
        (b.order && b.order.toLowerCase().includes(term)) ||
        (b.shade && b.shade.toLowerCase().includes(term))
      );
    }
    return list;
  }, [data, activeTab, batchVesselFilter, appliedBatchOrderSearch]);

  const batchesPerPage = 10;
  const totalBatchPages = Math.max(1, Math.ceil(filteredBatches.length / batchesPerPage));
  const currentBatchPageData = useMemo(() => {
    const start = (batchPage - 1) * batchesPerPage;
    return filteredBatches.slice(start, start + batchesPerPage);
  }, [filteredBatches, batchPage]);

  // Gantt hours ticks Wed 28 Oct: 00:00, 02:00, ... 22:00 (24 hours total)
  const timeTicks = [
    "00:00", "02:00", "04:00", "06:00", "08:00", "10:00",
    "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"
  ];
  const totalTimelineMinutes = 24 * 60; // 1440 mins
  const timelinePixelWidth = Math.round(1440 * (zoomLevel || 1.0));

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white text-slate-800">
        <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <h2 className="text-base font-semibold text-slate-800">Loading Prime AI - Vessel Planning...</h2>
      </div>
    );
  }

  const kpis = data?.kpis || {
    orders_to_dye: 101,
    batches: 269,
    total_to_dye_kg: "103,202",
    orders_late: 101,
    already_overdue: 101,
    avg_vessel_fill: "59%"
  };

  const fixedCount = data?.config?.fixed_plan_count || 0;

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans pb-16">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded shadow-lg text-xs font-semibold flex items-center gap-2 border ${
          notification.type === "error"
            ? "bg-rose-50 border-rose-300 text-rose-700"
            : "bg-emerald-50 border-emerald-300 text-emerald-800"
        }`}>
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-3">
        {/* Top Header Row matching screenshot */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200">
          <div>
            <div className="text-slate-400 font-semibold text-sm tracking-tight">Prime ERP</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-blue-600 text-xs font-medium cursor-pointer hover:underline">
                Vessel Planning
              </span>
              <span className="text-slate-300 text-xs">|</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
              Vessel Planning
            </h1>
          </div>

          <div className="text-right mt-2 sm:mt-0 text-[11px] text-slate-400 space-y-0.5">
            <div>Welcome <span className="font-medium text-slate-600">Administrator</span></div>
            <div>Logged at : 28/10/2026 15:42</div>
            <div className="font-semibold text-slate-500">Prime AI</div>
            <div className="pt-1">
              <button
                onClick={handleSavePlan}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium shadow-xs transition-colors"
                title="Click Save at the top of the page to fix proposed batches"
              >
                Save Plan
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation: Planning / Fixed plan */}
        <div className="flex items-center gap-6 mt-3 border-b border-slate-200 text-sm">
          <button
            onClick={() => setActiveTab("planning")}
            className={`pb-2.5 font-medium transition-all relative ${
              activeTab === "planning"
                ? "text-blue-600 font-bold border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Planning
          </button>
          <button
            onClick={() => setActiveTab("fixed")}
            className={`pb-2.5 font-medium transition-all flex items-center gap-1.5 relative ${
              activeTab === "fixed"
                ? "text-blue-600 font-bold border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Fixed plan</span>
            <span className="text-xs text-slate-500 font-semibold">{fixedCount}</span>
          </button>
        </div>

        {/* Proposed Plan Banner */}
        <div className="plan-banner mt-3 flex items-center justify-between">
          <div>
            Proposed plan: <span className="font-semibold">269 new batch(es)</span> for <span className="font-semibold">101 order(s)</span>. Click Save at the top of the page to fix it. Fixed batches are locked: orders that arrive later are planned around them, new batches can be added anytime.
          </div>
        </div>

        {/* Form Controls Row */}
        <div className="mt-4 p-4 border border-slate-200 rounded bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                VESSELS FREE FROM
              </label>
              <input
                type="text"
                value={vesselsFreeFrom}
                onChange={e => setVesselsFreeFrom(e.target.value)}
                className="w-full text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                SAFETY BUFFER (HRS)
              </label>
              <input
                type="number"
                value={safetyBufferHrs}
                onChange={e => setSafetyBufferHrs(e.target.value)}
                className="w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                OVERDUE ORDERS: NEW DUE DATE (DAYS FROM START)
              </label>
              <input
                type="number"
                value={overdueNewDueDays}
                onChange={e => setOverdueNewDueDays(e.target.value)}
                className="w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                SCHEDULE SHOWN
              </label>
              <select
                value={scheduleShown}
                onChange={e => setScheduleShown(e.target.value)}
                className="w-full text-xs"
              >
                <option value="Optimised (fewest batches)">Optimised (fewest batches)</option>
                <option value="Basic (earliest due date)">Basic (earliest due date)</option>
                <option value="Minimise changeover">Minimise changeover</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end items-center gap-2 mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={handleReset}
              className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleBuildSchedule}
              className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded shadow-2xs transition-colors"
            >
              Build Schedule
            </button>
          </div>
        </div>

        {/* SECTION 1: Orders Table */}
        <div className="mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Orders</h2>
              <span className="text-blue-600 text-xs font-medium">
                {filteredOrders.length} orders
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Filter by order no or shade"
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setAppliedOrderSearch(orderSearch); }}
                className="text-xs py-1 px-2.5 w-48 sm:w-56"
              />
              <button
                onClick={() => { setAppliedOrderSearch(orderSearch); setOrderPage(1); }}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Filter
              </button>
              <button
                onClick={() => { setOrderSearch(""); setAppliedOrderSearch(""); setOrderPage(1); }}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Clear
              </button>

              <div className="h-4 w-[1px] bg-slate-300 mx-1 hidden sm:block"></div>

              <button
                onClick={() => setShowAddOrder(true)}
                className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Add order
              </button>
              <button
                onClick={fetchData}
                className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Reload from ERP
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>ORDER NO</th>
                  <th>SHADE</th>
                  <th className="num-col">ORDER QTY (KG)</th>
                  <th className="num-col">AVAILABLE STOCK (KG)</th>
                  <th className="num-col">MINS / BATCH</th>
                  <th>DUE DATE</th>
                  <th className="num-col">PRIORITY</th>
                  <th className="num-col">WASH MINS AFTER SHADE</th>
                  <th className="w-16 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {currentOrdersPageData.map((ord, idx) => (
                  <tr key={ord.id}>
                    <td className="text-slate-400">{(orderPage - 1) * ordersPerPage + idx + 1}</td>
                    <td className="font-semibold text-slate-800">{ord.order_no}</td>
                    <td className="text-slate-600">{ord.shade}</td>
                    <td className="num-col font-medium">{ord.order_qty}</td>
                    <td className="num-col text-slate-600">{ord.stock_qty}</td>
                    <td className="num-col text-slate-600">{ord.mins_per_batch}</td>
                    <td className="text-slate-600">{ord.due_date}</td>
                    <td className="num-col text-slate-600">{ord.priority}</td>
                    <td className="num-col text-slate-600">{ord.wash_mins}</td>
                    <td className="text-center">
                      <button
                        onClick={() => setEditingOrder(ord)}
                        className="px-2.5 py-0.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100 border border-blue-200 rounded transition-colors cursor-pointer"
                        title={`Edit order ${ord.order_no}`}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Orders Pagination */}
          <div className="flex items-center justify-center gap-1 mt-2.5">
            {Array.from({ length: Math.min(10, totalOrderPages) }).map((_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setOrderPage(p)}
                  className={`pagination-btn ${orderPage === p ? "active" : ""}`}
                >
                  {p}
                </button>
              );
            })}
            {totalOrderPages > 10 && (
              <button
                onClick={() => setOrderPage(p => Math.min(totalOrderPages, p + 1))}
                className="pagination-btn"
              >
                &gt;
              </button>
            )}
          </div>
        </div>

        {/* SECTION 2: Vessels Table */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Vessels</h2>
              <span className="text-blue-600 text-xs font-medium">
                {data?.vessels?.length || 20} vessels
              </span>
              {(data?.vessels?.length || 0) > 7 && (
                <button
                  onClick={() => setShowAllVessels(prev => !prev)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium underline ml-2 cursor-pointer"
                >
                  {showAllVessels ? "Show fewer (7)" : `View all (${data.vessels.length})`}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddVessel(true)}
                className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Add vessel
              </button>
              <button
                onClick={fetchData}
                className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Reload from ERP
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>VESSEL NO</th>
                  <th className="num-col">MIN CAPACITY (KG)</th>
                  <th className="num-col">MAX CAPACITY (KG)</th>
                  <th className="w-16 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {(showAllVessels ? (data?.vessels || []) : (data?.vessels || []).slice(0, 7)).map((v, idx) => {
                  const currentMinVal = editingMinCaps[v.id] !== undefined ? editingMinCaps[v.id] : (v.min_cap ?? 0);
                  const isMinChanged = editingMinCaps[v.id] !== undefined && Number(editingMinCaps[v.id]) !== Number(v.min_cap);
                  const currentMaxVal = editingMaxCaps[v.id] !== undefined ? editingMaxCaps[v.id] : (v.max_cap ?? 0);
                  const isMaxChanged = editingMaxCaps[v.id] !== undefined && Number(editingMaxCaps[v.id]) !== Number(v.max_cap);

                  return (
                    <tr key={v.id}>
                      <td className="text-slate-400">{idx + 1}</td>
                      <td className="font-semibold text-slate-800">{v.code}</td>
                      <td className="num-col">
                        <div className="inline-flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={currentMinVal}
                            onChange={e => handleMinCapChange(v.id, e.target.value)}
                            onBlur={() => handleSaveMinCap(v)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveMinCap(v); }}
                            className="w-20 text-right px-2 py-0.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded focus:border-blue-600 focus:ring-1 focus:ring-blue-200 shadow-2xs"
                            title="Modify Minimum Capacity manually (Press Enter or click away to save)"
                          />
                          {isMinChanged && (
                            <button
                              onClick={() => handleSaveMinCap(v)}
                              disabled={savingVesselId === v.id}
                              className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold shadow-xs cursor-pointer"
                              title="Save Minimum Capacity"
                            >
                              {savingVesselId === v.id ? '...' : '✓'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="num-col font-medium">
                        <div className="inline-flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={currentMaxVal}
                            onChange={e => handleMaxCapChange(v.id, e.target.value)}
                            onBlur={() => handleSaveMaxCap(v)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveMaxCap(v); }}
                            className="w-20 text-right px-2 py-0.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded focus:border-blue-600 focus:ring-1 focus:ring-blue-200 shadow-2xs"
                            title="Modify Maximum Capacity manually (Press Enter or click away to save)"
                          />
                          {isMaxChanged && (
                            <button
                              onClick={() => handleSaveMaxCap(v)}
                              disabled={savingVesselId === v.id}
                              className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold shadow-xs cursor-pointer"
                              title="Save Maximum Capacity"
                            >
                              {savingVesselId === v.id ? '...' : '✓'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="text-center">
                        <button
                          onClick={() => setEditingVessel(v)}
                          className="px-2.5 py-0.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100 border border-blue-200 rounded transition-colors cursor-pointer"
                          title={`Edit vessel ${v.code}`}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 3: Breakdowns and Holidays */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-slate-900">Breakdowns and holidays</h2>
            <button
              onClick={() => setShowAddDowntime(true)}
              className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
            >
              Add downtime
            </button>
          </div>

          <div className="border border-slate-200 rounded p-6 text-center bg-white">
            {(!data?.breakdowns || data.breakdowns.length === 0) ? (
              <div>
                <p className="text-xs text-slate-600 font-medium">No breakdowns or holidays entered</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Leave the vessel no blank for a production holiday that applies to every vessel.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>VESSEL</th>
                      <th>START TIME</th>
                      <th>END TIME</th>
                      <th>REASON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakdowns.map(b => (
                      <tr key={b.id}>
                        <td>{b.vessel}</td>
                        <td>{b.start_time}</td>
                        <td>{b.end_time}</td>
                        <td>{b.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Repeat Proposed Plan Banner */}
        <div className="plan-banner mt-6">
          Proposed plan: <span className="font-semibold">269 new batch(es)</span> for <span className="font-semibold">101 order(s)</span>. Click Save at the top of the page to fix it. Fixed batches are locked: orders that arrive later are planned around them, new batches can be added anytime.
        </div>

        {/* SECTION 4: 6 Stat KPI Cards matching Page 1 bottom */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <div className="kpi-card kpi-card-blue">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{kpis.orders_to_dye}</div>
            <div className="text-xs text-slate-500 mt-0.5">Orders to dye</div>
          </div>

          <div className="kpi-card kpi-card-blue">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{kpis.batches}</div>
            <div className="text-xs text-slate-500 mt-0.5">Batches</div>
          </div>

          <div className="kpi-card kpi-card-blue">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{kpis.total_to_dye_kg}</div>
            <div className="text-xs text-slate-500 mt-0.5">Total to dye (kg)</div>
          </div>

          <div className="kpi-card kpi-card-red">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{kpis.orders_late}</div>
            <div className="text-xs text-slate-500 mt-0.5">Orders late</div>
          </div>

          <div className="kpi-card kpi-card-amber">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{kpis.already_overdue}</div>
            <div className="text-xs text-slate-500 mt-0.5">Already overdue at start</div>
          </div>

          <div className="kpi-card kpi-card-blue">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{kpis.avg_vessel_fill}</div>
            <div className="text-xs text-slate-500 mt-0.5">Average vessel fill</div>
          </div>
        </div>

        {/* SECTION 5: Gantt Chart (Page 2) */}
        <div className="mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">Gantt chart</h2>
              <p className="text-xs text-slate-500">
                269 batches ({fixedCount} fixed) on 20 vessels, 27 h
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center border border-slate-300 rounded overflow-hidden">
                <button
                  onClick={() => setZoomLevel(z => Math.min(2.0, z + 0.2))}
                  className="px-2 py-0.5 bg-white hover:bg-slate-50 text-xs border-r border-slate-300"
                  title="Zoom In"
                >
                  +
                </button>
                <button
                  onClick={() => setZoomLevel(z => Math.max(0.6, z - 0.2))}
                  className="px-2 py-0.5 bg-white hover:bg-slate-50 text-xs border-r border-slate-300"
                  title="Zoom Out"
                >
                  -
                </button>
                <button
                  onClick={() => setZoomLevel(1.0)}
                  className="px-2.5 py-0.5 bg-white hover:bg-slate-50 text-xs border-r border-slate-300"
                >
                  Fit
                </button>
                <button
                  onClick={() => setZoomLevel(1.0)}
                  className="px-2.5 py-0.5 bg-white hover:bg-slate-50 text-xs"
                >
                  1 day
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>Colour by</span>
                <select
                  value={colourBy}
                  onChange={e => setColourBy(e.target.value)}
                  className="text-xs py-0.5 px-2"
                >
                  <option value="Order">Order</option>
                  <option value="Shade">Shade</option>
                  <option value="Vessel">Vessel</option>
                </select>
              </div>

              <input
                type="text"
                placeholder="Find order or shade"
                value={ganttSearch}
                onChange={e => setGanttSearch(e.target.value)}
                className="text-xs py-1 px-2.5 w-44"
              />
              <button
                onClick={() => { setGanttSearch(""); setHighlightedOrder(null); }}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Gantt Timeline View */}
          <div className="gantt-container rounded border border-slate-200">
            {/* Header Row: Vessel title & Time ticks */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
              <div className="w-[140px] min-w-[140px] p-2 border-r border-slate-200 sticky left-0 bg-slate-50 z-20">
                VESSEL
              </div>
              <div
                className="flex flex-col relative"
                style={{ width: `${timelinePixelWidth}px`, minWidth: `${timelinePixelWidth}px` }}
              >
                <div className="px-2 py-1 text-slate-500 font-bold border-b border-slate-200">
                  Wed 28 Oct
                </div>
                <div className="flex">
                  {timeTicks.map((tick, i) => (
                    <div
                      key={tick}
                      style={{ width: `${timelinePixelWidth / timeTicks.length}px` }}
                      className="px-1.5 py-1 border-r border-slate-200 text-slate-400 font-mono text-[10px]"
                    >
                      {tick}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Vessel Rows */}
            <div className="divide-y divide-slate-100">
              {(data?.vessels || []).map(v => {
                const vesselBatches = (data?.batches || []).filter(b => b.vessel === v.code);
                return (
                  <div key={v.code} className="gantt-row">
                    {/* Left Vessel Header Cell */}
                    <div className="gantt-vessel-cell">
                      <div>
                        <div className="font-bold text-slate-800">{v.code}</div>
                        <div className="text-[10px] text-slate-400">{v.min_cap} - {v.max_cap} kg</div>
                      </div>
                      <div className="text-[11px] font-medium text-slate-500">
                        {v.fill_pct}%
                      </div>
                    </div>

                    {/* Timeline Area with Batches */}
                    <div
                      className="gantt-timeline-area"
                      style={{ width: `${timelinePixelWidth}px`, minWidth: `${timelinePixelWidth}px` }}
                    >
                      {/* Vertical Gridlines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {timeTicks.map(t => (
                          <div
                            key={t}
                            style={{ width: `${timelinePixelWidth / timeTicks.length}px` }}
                            className="border-r border-slate-100 h-full"
                          />
                        ))}
                      </div>

                      {/* Batches on this vessel */}
                      {vesselBatches.map(b => {
                        const leftPercent = (b.start_minutes / totalTimelineMinutes) * 100;
                        const widthPercent = Math.max(1.5, (b.duration_minutes / totalTimelineMinutes) * 100);
                        const colors = getOrderColor(b.order);

                        const isSearchMatch = ganttSearch.trim() && (
                          (b.order && b.order.toLowerCase().includes(ganttSearch.toLowerCase())) ||
                          (b.shade && b.shade.toLowerCase().includes(ganttSearch.toLowerCase()))
                        );

                        const isHighlighted = highlightedOrder && b.order === highlightedOrder;

                        return (
                          <div
                            key={b.id}
                            onClick={() => setHighlightedOrder(b.order === highlightedOrder ? null : b.order)}
                            onDoubleClick={() => setSelectedBatch(b)}
                            onMouseEnter={e => {
                              const rect = e.target.getBoundingClientRect();
                              setTooltipPos({ x: rect.left, y: rect.bottom + 6 });
                              setHoveredBatch(b);
                            }}
                            onMouseLeave={() => setHoveredBatch(null)}
                            style={{
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                              backgroundColor: colors.bg,
                              color: colors.text,
                              borderColor: colors.border
                            }}
                            className={`gantt-batch-block border ${
                              isHighlighted ? "gantt-batch-highlighted ring-2 ring-blue-600" : ""
                            } ${isSearchMatch ? "ring-2 ring-amber-500 font-bold" : ""} ${
                              b.is_fixed ? "gantt-batch-locked" : ""
                            }`}
                          >
                            <span className="truncate">
                              {b.order} {b.batch_kg}kg
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Floating Tooltip */}
          {hoveredBatch && (
            <div
              className="batch-tooltip"
              style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }}
            >
              <div className="font-bold text-white text-xs">{hoveredBatch.order}</div>
              <div className="text-slate-300 text-[10px]">{hoveredBatch.shade}</div>
              <div className="mt-1 pt-1 border-t border-slate-700 grid grid-cols-2 gap-x-2 text-[10px]">
                <div>Batch: <span className="text-white font-medium">#{hoveredBatch.batch_no}</span></div>
                <div>Weight: <span className="text-white font-medium">{hoveredBatch.batch_kg} kg</span></div>
                <div>Vessel: <span className="text-white font-medium">{hoveredBatch.vessel}</span></div>
                <div>Fill: <span className="text-white font-medium">{hoveredBatch.fill_pct}%</span></div>
                <div>Start: <span className="text-white font-medium">{hoveredBatch.start}</span></div>
                <div>End: <span className="text-white font-medium">{hoveredBatch.end}</span></div>
              </div>
            </div>
          )}

          {/* Gantt Legend matching screenshot */}
          <div className="mt-3 text-xs text-slate-500 space-y-1.5 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-indigo-100 border border-indigo-300"></span>
                <span>Each order has its own colour (colours repeat)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-100 border border-slate-500"></span>
                <span>Fixed plan (locked)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="border-b-2 border-amber-500 px-1 font-mono text-[10px]">-</span>
                <span>Amber underline = not a preferred vessel</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 border border-dashed border-slate-400"></span>
                <span>Dashed outline = below the vessel minimum</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs ring-2 ring-amber-400"></span>
                <span>Amber ring = moved by hand</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-slate-200"></span>
                <span>Holiday</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Hover a batch for details: Click a batch to highlight every batch of that order. Type in the box to find an order or shade. Drag a batch to another vessel, day or time; the rest of the plan is rescheduled around it. Fixed plan batches cannot be moved.
            </p>
          </div>
        </div>

        {/* SECTION 6: Order Summary Table (Page 2) */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Order summary</h2>
              <span className="text-blue-600 text-xs font-medium">
                {data?.orders?.length || 102} orders
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>ORDER</th>
                  <th className="num-col">PRIORITY</th>
                  <th>SHADE</th>
                  <th className="num-col">ORDER KG</th>
                  <th className="num-col">STOCK KG</th>
                  <th className="num-col">ALREADY FIXED KG</th>
                  <th className="num-col">TO DYE KG</th>
                  <th className="num-col">BATCHES</th>
                  <th>COMPLETES</th>
                </tr>
              </thead>
              <tbody>
                {currentSummaryPageData.map(ord => (
                  <tr key={ord.id}>
                    <td className="font-semibold text-slate-800">{ord.order_no}</td>
                    <td className="num-col text-slate-600">{ord.priority}</td>
                    <td className="text-slate-600">{ord.shade}</td>
                    <td className="num-col font-medium">{ord.order_qty}</td>
                    <td className="num-col text-slate-600">{ord.stock_qty}</td>
                    <td className="num-col text-slate-600">{ord.already_fixed_kg || 0}</td>
                    <td className="num-col font-medium">{ord.to_dye_kg}</td>
                    <td className="num-col text-slate-600">{ord.batches_count || 1}</td>
                    <td className="text-slate-600">{ord.completes || "28-Oct 23:59"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Order Summary Pagination */}
          <div className="flex items-center justify-center gap-1 mt-2.5">
            {Array.from({ length: Math.min(10, totalSummaryPages) }).map((_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setSummaryPage(p)}
                  className={`pagination-btn ${summaryPage === p ? "active" : ""}`}
                >
                  {p}
                </button>
              );
            })}
            {totalSummaryPages > 10 && (
              <button
                onClick={() => setSummaryPage(p => Math.min(totalSummaryPages, p + 1))}
                className="pagination-btn"
              >
                &gt;
              </button>
            )}
          </div>
        </div>

        {/* SECTION 7: Batch Schedule Table (Page 2 & 3) */}
        <div className="mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Batch schedule</h2>
              <span className="text-blue-600 text-xs font-medium">
                {filteredBatches.length} batches
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Filter by order no"
                value={batchOrderSearch}
                onChange={e => setBatchOrderSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setAppliedBatchOrderSearch(batchOrderSearch); }}
                className="text-xs py-1 px-2.5 w-44"
              />
              <select
                value={batchVesselFilter}
                onChange={e => { setBatchVesselFilter(e.target.value); setBatchPage(1); }}
                className="text-xs py-1 px-2"
              >
                <option value="All vessels">All vessels</option>
                {(data?.vessels || []).map(v => (
                  <option key={v.code} value={v.code}>{v.code}</option>
                ))}
              </select>
              <button
                onClick={() => { setAppliedBatchOrderSearch(batchOrderSearch); setBatchPage(1); }}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Filter
              </button>
              <button
                onClick={() => {
                  setBatchOrderSearch("");
                  setAppliedBatchOrderSearch("");
                  setBatchVesselFilter("All vessels");
                  setBatchPage(1);
                }}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs rounded"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>ORDER</th>
                  <th>SHADE</th>
                  <th className="num-col">BATCH</th>
                  <th>PLAN</th>
                  <th>VESSEL</th>
                  <th className="num-col">MIN CAP</th>
                  <th className="num-col">MAX CAP</th>
                  <th className="num-col">BATCH KG</th>
                  <th className="num-col">FILL</th>
                  <th>WASH BEFORE</th>
                  <th>START</th>
                </tr>
              </thead>
              <tbody>
                {currentBatchPageData.map(b => (
                  <tr key={b.id} className="cursor-pointer" onClick={() => setSelectedBatch(b)}>
                    <td className="font-semibold text-slate-800">{b.order}</td>
                    <td className="text-slate-600">{b.shade}</td>
                    <td className="num-col text-slate-600">{b.batch_no}</td>
                    <td className="text-slate-600">{b.plan}</td>
                    <td className="font-semibold text-slate-800">{b.vessel}</td>
                    <td className="num-col text-slate-600">{b.min_cap}</td>
                    <td className="num-col text-slate-600">{b.max_cap}</td>
                    <td className="num-col font-medium">{b.batch_kg}</td>
                    <td className="num-col text-slate-600">{b.fill_pct}%</td>
                    <td className="text-slate-600">{b.wash_before || "-"}</td>
                    <td className="text-slate-600 font-mono text-[11px]">{b.start}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Batch Schedule Pagination */}
          <div className="flex items-center justify-center gap-1 mt-2.5">
            {Array.from({ length: Math.min(10, totalBatchPages) }).map((_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setBatchPage(p)}
                  className={`pagination-btn ${batchPage === p ? "active" : ""}`}
                >
                  {p}
                </button>
              );
            })}
            {totalBatchPages > 10 && (
              <button
                onClick={() => setBatchPage(p => Math.min(totalBatchPages, p + 1))}
                className="pagination-btn"
              >
                &gt;
              </button>
            )}
          </div>
        </div>

        {/* SECTION 8: Schedule Effectiveness Table (Page 3) */}
        <div className="mt-10">
          <h2 className="text-base font-bold text-slate-900 mb-2">Schedule effectiveness</h2>

          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>MEASURE</th>
                  <th className="num-col">BASIC</th>
                  <th className="num-col">OPTIMISED</th>
                  <th>WHAT IT TELLS YOU</th>
                </tr>
              </thead>
              <tbody>
                {(data?.schedule_effectiveness || []).map((row, idx) => (
                  <tr key={idx}>
                    <td className="font-medium text-slate-800">{row.measure}</td>
                    <td className="num-col text-slate-600 font-mono">{row.basic}</td>
                    <td className="num-col text-slate-900 font-bold font-mono">{row.optimised}</td>
                    <td className="text-slate-500 text-xs">{row.what_it_tells_you}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-400 mt-2">
            Green marks the better value. The optimised schedule is shown below.
          </p>
        </div>

        {/* Footer URL matching screenshot */}
        <div className="mt-12 pt-4 border-t border-slate-200 text-slate-400 text-[11px] font-mono flex items-center justify-between">
          <span>localhost:58272/AIT/Transactions/FT_vessel_planning.aspx?timestamp=1793182352501</span>
          <span>1/3 &bull; 2/3 &bull; 3/3</span>
        </div>
      </div>

      {/* Modal: Add Order */}
      {showAddOrder && (
        <AddOrderModal
          onClose={() => setShowAddOrder(false)}
          onSuccess={() => { setShowAddOrder(false); fetchData(); showToast("Order added successfully!"); }}
        />
      )}

      {/* Modal: Add Vessel */}
      {showAddVessel && (
        <AddVesselModal
          onClose={() => setShowAddVessel(false)}
          onSuccess={() => { setShowAddVessel(false); fetchData(); showToast("Vessel added successfully!"); }}
        />
      )}

      {/* Modal: Add Downtime */}
      {showAddDowntime && (
        <AddDowntimeModal
          vessels={data?.vessels || []}
          onClose={() => setShowAddDowntime(false)}
          onSuccess={() => { setShowAddDowntime(false); fetchData(); showToast("Downtime registered!"); }}
        />
      )}

      {/* Modal: Batch Detail / Move */}
      {selectedBatch && (
        <BatchDetailModal
          batch={selectedBatch}
          vessels={data?.vessels || []}
          onClose={() => setSelectedBatch(null)}
          onMoveSuccess={() => { setSelectedBatch(null); fetchData(); showToast("Batch moved successfully!"); }}
        />
      )}

      {/* Modal: Edit Order */}
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSuccess={(msg) => { setEditingOrder(null); fetchData(); showToast(msg || "Order updated successfully!"); }}
          onDelete={(msg) => { setEditingOrder(null); fetchData(); showToast(msg || "Order deleted.", "info"); }}
        />
      )}

      {/* Modal: Edit Vessel */}
      {editingVessel && (
        <EditVesselModal
          vessel={editingVessel}
          onClose={() => setEditingVessel(null)}
          onSuccess={(msg) => { setEditingVessel(null); fetchData(); showToast(msg || "Vessel updated successfully!"); }}
          onDelete={(msg) => { setEditingVessel(null); fetchData(); showToast(msg || "Vessel deleted.", "info"); }}
        />
      )}
    </div>
  );
}

// Add Order Modal
function AddOrderModal({ onClose, onSuccess }) {
  const [orderNo, setOrderNo] = useState("");
  const [shade, setShade] = useState("");
  const [orderQty, setOrderQty] = useState(100);
  const [stockQty, setStockQty] = useState(0);
  const [minsPerBatch, setMinsPerBatch] = useState(60);
  const [dueDate, setDueDate] = useState("28/10/2026");
  const [priority, setPriority] = useState(2);
  const [washMins, setWashMins] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderNo.trim() || !shade.trim()) return;
    try {
      setSubmitting(true);
      await fetch("/api/vessel-planning/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_no: orderNo,
          shade,
          order_qty: Number(orderQty),
          stock_qty: Number(stockQty),
          mins_per_batch: Number(minsPerBatch),
          due_date: dueDate,
          priority: Number(priority),
          wash_mins: Number(washMins)
        })
      });
      onSuccess();
    } catch (err) {
      alert("Failed to create order: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-800">Add Customer Order</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Order No</label>
            <input
              type="text"
              required
              placeholder="e.g. 26INH29900"
              value={orderNo}
              onChange={e => setOrderNo(e.target.value)}
              className="w-full uppercase font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Shade / Colour</label>
            <input
              type="text"
              required
              placeholder="e.g. NAVY EXTRA DARK"
              value={shade}
              onChange={e => setShade(e.target.value)}
              className="w-full uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Order Qty (kg)</label>
              <input
                type="number"
                step="0.01"
                required
                value={orderQty}
                onChange={e => setOrderQty(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Available Stock (kg)</label>
              <input
                type="number"
                step="0.01"
                value={stockQty}
                onChange={e => setStockQty(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Mins / Batch</label>
              <input
                type="number"
                value={minsPerBatch}
                onChange={e => setMinsPerBatch(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Wash Mins</label>
              <input
                type="number"
                value={washMins}
                onChange={e => setWashMins(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Due Date</label>
              <input
                type="text"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full"
              >
                <option value={1}>1 (Urgent)</option>
                <option value={2}>2 (Standard)</option>
                <option value={3}>3 (Flexible)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-xs"
            >
              {submitting ? "Saving..." : "Create Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit Order Modal
function EditOrderModal({ order, onClose, onSuccess, onDelete }) {
  const [orderNo, setOrderNo] = useState(order.order_no || "");
  const [shade, setShade] = useState(order.shade || "");
  const [orderQty, setOrderQty] = useState(order.order_qty || 100);
  const [stockQty, setStockQty] = useState(order.stock_qty || 0);
  const [minsPerBatch, setMinsPerBatch] = useState(order.mins_per_batch || 60);
  const [dueDate, setDueDate] = useState(order.due_date || "28/10/2026");
  const [priority, setPriority] = useState(order.priority || 2);
  const [washMins, setWashMins] = useState(order.wash_mins || 30);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderNo.trim() || !shade.trim()) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/vessel-planning/order/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_no: orderNo,
          shade,
          order_qty: Number(orderQty),
          stock_qty: Number(stockQty),
          mins_per_batch: Number(minsPerBatch),
          due_date: dueDate,
          priority: Number(priority),
          wash_mins: Number(washMins)
        })
      });
      if (!res.ok) throw new Error("Failed to update order");
      onSuccess(`✓ Order ${orderNo} updated successfully!`);
    } catch (err) {
      alert("Failed to update order: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete order ${order.order_no}?`)) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/vessel-planning/order/${order.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete order");
      onDelete(`Order ${order.order_no} deleted successfully.`);
    } catch (err) {
      alert("Failed to delete order: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Edit Customer Order</h3>
            <span className="text-[11px] text-slate-400 font-mono">ID: #{order.id} • {order.order_no}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Order No</label>
            <input
              type="text"
              required
              value={orderNo}
              onChange={e => setOrderNo(e.target.value)}
              className="w-full uppercase font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Shade / Colour</label>
            <input
              type="text"
              required
              value={shade}
              onChange={e => setShade(e.target.value)}
              className="w-full uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Order Qty (kg)</label>
              <input
                type="number"
                step="0.01"
                required
                value={orderQty}
                onChange={e => setOrderQty(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Available Stock (kg)</label>
              <input
                type="number"
                step="0.01"
                value={stockQty}
                onChange={e => setStockQty(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Mins / Batch</label>
              <input
                type="number"
                value={minsPerBatch}
                onChange={e => setMinsPerBatch(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Wash Mins</label>
              <input
                type="number"
                value={washMins}
                onChange={e => setWashMins(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Due Date</label>
              <input
                type="text"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full"
              >
                <option value={1}>1 (Urgent)</option>
                <option value={2}>2 (Standard)</option>
                <option value={3}>3 (Flexible)</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50 text-xs font-medium cursor-pointer"
            >
              {deleting ? "Deleting..." : "Delete Order"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-xs"
              >
                {submitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Add Vessel Modal
function AddVesselModal({ onClose, onSuccess }) {
  const [code, setCode] = useState("");
  const [minCap, setMinCap] = useState(0);
  const [maxCap, setMaxCap] = useState(500);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      setSubmitting(true);
      await fetch("/api/vessel-planning/vessel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          min_cap: Number(minCap),
          max_cap: Number(maxCap)
        })
      });
      onSuccess();
    } catch (err) {
      alert("Failed to create vessel: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-sm w-full p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-800">Add Production Vessel</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Vessel No / Code</label>
            <input
              type="text"
              required
              placeholder="e.g. B14"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full uppercase font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Min Capacity (kg)</label>
            <input
              type="number"
              value={minCap}
              onChange={e => setMinCap(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Max Capacity (kg)</label>
            <input
              type="number"
              required
              value={maxCap}
              onChange={e => setMaxCap(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-xs"
            >
              {submitting ? "Saving..." : "Add Vessel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit Vessel Modal
function EditVesselModal({ vessel, onClose, onSuccess, onDelete }) {
  const [code, setCode] = useState(vessel.code || "");
  const [minCap, setMinCap] = useState(vessel.min_cap !== undefined ? vessel.min_cap : 0);
  const [maxCap, setMaxCap] = useState(vessel.max_cap || 500);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/vessel-planning/vessel/${vessel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          min_cap: Number(minCap),
          max_cap: Number(maxCap)
        })
      });
      if (!res.ok) throw new Error("Failed to update vessel");
      onSuccess(`✓ Vessel ${code} updated successfully!`);
    } catch (err) {
      alert("Failed to update vessel: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete vessel ${vessel.code}?`)) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/vessel-planning/vessel/${vessel.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete vessel");
      onDelete(`Vessel ${vessel.code} deleted successfully.`);
    } catch (err) {
      alert("Failed to delete vessel: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-sm w-full p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Edit Production Vessel</h3>
            <span className="text-[11px] text-slate-400 font-mono">ID: #{vessel.id} • {vessel.code}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Vessel No / Code</label>
            <input
              type="text"
              required
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full uppercase font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Min Capacity (kg) - Modifiable</label>
            <input
              type="number"
              min="0"
              value={minCap}
              onChange={e => setMinCap(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Max Capacity (kg)</label>
            <input
              type="number"
              min="1"
              required
              value={maxCap}
              onChange={e => setMaxCap(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50 text-xs font-medium cursor-pointer"
            >
              {deleting ? "Deleting..." : "Delete Vessel"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-xs"
              >
                {submitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Add Downtime Modal
function AddDowntimeModal({ vessels, onClose, onSuccess }) {
  const [vessel, setVessel] = useState("");
  const [startTime, setStartTime] = useState("2026-10-28T08:00");
  const [endTime, setEndTime] = useState("2026-10-28T12:00");
  const [reason, setReason] = useState("Preventive Maintenance");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await fetch("/api/vessel-planning/downtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel,
          start_time: startTime,
          end_time: endTime,
          reason
        })
      });
      onSuccess();
    } catch (err) {
      alert("Failed to add downtime: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-sm w-full p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-800">Add Breakdown / Downtime</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">
              Vessel (Leave blank for factory-wide)
            </label>
            <select
              value={vessel}
              onChange={e => setVessel(e.target.value)}
              className="w-full"
            >
              <option value="">-- All Vessels (Factory Holiday) --</option>
              {vessels.map(v => (
                <option key={v.code} value={v.code}>{v.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Start Time</label>
            <input
              type="text"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">End Time</label>
            <input
              type="text"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-xs"
            >
              {submitting ? "Saving..." : "Add Downtime"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Batch Details & Move Modal
function BatchDetailModal({ batch, vessels, onClose, onMoveSuccess }) {
  const [targetVessel, setTargetVessel] = useState(batch.vessel);
  const [startMin, setStartMin] = useState(batch.start_minutes || 0);
  const [moving, setMoving] = useState(false);

  const handleMove = async () => {
    try {
      setMoving(true);
      await fetch("/api/vessel-planning/move-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: batch.id,
          target_vessel: targetVessel,
          target_start_min: Number(startMin)
        })
      });
      onMoveSuccess();
    } catch (err) {
      alert("Failed to move batch: " + err.message);
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full p-5 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Batch Details: #{batch.batch_no}</h3>
            <span className="text-[11px] text-slate-500">{batch.order}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">&times;</button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded border border-slate-100">
          <div>
            <span className="text-slate-400 block text-[10px]">Shade</span>
            <span className="font-semibold text-slate-800">{batch.shade}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Weight</span>
            <span className="font-semibold text-slate-800">{batch.batch_kg} kg</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Vessel Fill</span>
            <span className="font-semibold text-slate-800">{batch.fill_pct}%</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Current Plan</span>
            <span className="font-semibold text-slate-800">{batch.plan}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Start Time</span>
            <span className="font-mono text-slate-800">{batch.start}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">End Time</span>
            <span className="font-mono text-slate-800">{batch.end}</span>
          </div>
        </div>

        {!batch.is_fixed && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <h4 className="font-bold text-slate-700 mb-2">Reschedule / Move Batch</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Target Vessel</label>
                <select
                  value={targetVessel}
                  onChange={e => setTargetVessel(e.target.value)}
                  className="w-full"
                >
                  {vessels.map(v => (
                    <option key={v.code} value={v.code}>{v.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Start Min from 00:00</label>
                <input
                  type="number"
                  step="15"
                  value={startMin}
                  onChange={e => setStartMin(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-slate-600"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleMove}
                disabled={moving}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-xs"
              >
                {moving ? "Moving..." : "Save Move"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Render root
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
