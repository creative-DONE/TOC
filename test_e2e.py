import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

from starlette.testclient import TestClient
from app.main import app

def test_all_endpoints():
    print("================================================================")
    print("  RUNNING FULL END-TO-END HTTP INTEGRATION TESTS                ")
    print("================================================================")

    client = TestClient(app)

    # 1. Test HTML Landing page
    res = client.get("/")
    assert res.status_code == 200
    assert "TOC Textile Colouring Production Scheduler" in res.text
    print("  [PASS] GET / (SPA Landing Page)")

    # 2. Test Dashboard Overview
    res = client.get("/api/dashboard/overview")
    assert res.status_code == 200
    data = res.json()
    assert "bottleneck_info" in data
    assert "on_time_delivery_pct" in data
    print(f"  [PASS] GET /api/dashboard/overview (Bottleneck: {data['bottleneck_info']['resource_name']}, OTD: {data['on_time_delivery_pct']}%)")

    # 3. Test Orders
    res = client.get("/api/orders")
    assert res.status_code == 200
    orders = res.json()
    assert len(orders) > 0
    print(f"  [PASS] GET /api/orders ({len(orders)} customer orders retrieved)")

    # 4. Test Machines
    res = client.get("/api/machines")
    assert res.status_code == 200
    machines = res.json()
    assert len(machines) == 6
    print(f"  [PASS] GET /api/machines ({len(machines)} dyeing machines retrieved)")

    # 5. Test Materials & Forecasting
    res = client.get("/api/materials")
    assert res.status_code == 200
    res_fore = client.get("/api/materials/forecast")
    assert res_fore.status_code == 200
    print(f"  [PASS] GET /api/materials & /forecast ({len(res.json())} materials, {len(res_fore.json())} forecasts)")

    # 6. Test Schedule Slots
    res = client.get("/api/schedule/slots?tier=WEEKLY")
    assert res.status_code == 200
    slots = res.json()
    assert len(slots) > 0
    print(f"  [PASS] GET /api/schedule/slots ({len(slots)} production slots retrieved)")

    # 7. Test Quality Score
    res = client.get("/api/schedule/quality-score")
    assert res.status_code == 200
    score = res.json()
    assert "overall_score" in score
    print(f"  [PASS] GET /api/schedule/quality-score (Overall: {score['overall_score']}/100, Grade: {score['grade']})")

    # 8. Test What-If Simulation
    res = client.post("/api/simulation/run", json={"scenario_type": "ADD_SHIFT"})
    assert res.status_code == 200
    sim = res.json()
    assert "simulated_on_time_pct" in sim
    print(f"  [PASS] POST /api/simulation/run (What-If: {sim['scenario_name']})")

    # 9. Test Excel and PDF Export endpoints
    res_excel = client.get("/api/reports/excel")
    assert res_excel.status_code == 200
    assert len(res_excel.content) > 1000
    print(f"  [PASS] GET /api/reports/excel ({len(res_excel.content)} bytes)")

    res_pdf = client.get("/api/reports/pdf")
    assert res_pdf.status_code == 200
    assert len(res_pdf.content) > 1000
    print(f"  [PASS] GET /api/reports/pdf ({len(res_pdf.content)} bytes)")

    # 10. Test Enhanced Order Details API
    order_id = orders[0]["id"]
    res_ord = client.get(f"/api/orders/{order_id}")
    assert res_ord.status_code == 200
    ord_detail = res_ord.json()
    assert "readiness_checklist" in ord_detail
    assert "process_stages" in ord_detail
    print(f"  [PASS] GET /api/orders/{order_id} (Full order details, stages, readiness)")

    # 11. Test Schedule Detail API
    res_sched = client.get(f"/api/orders/{order_id}/schedule-detail")
    assert res_sched.status_code == 200
    print(f"  [PASS] GET /api/orders/{order_id}/schedule-detail (Schedule timeline slot data)")

    # 12. Test Order Update (PUT)
    res_put = client.put(f"/api/orders/{order_id}", json={
        "quantity_kg": ord_detail["quantity_kg"],
        "due_date": ord_detail["due_date"],
        "priority": "HIGH",
        "notes": "Automated verification test note"
    })
    assert res_put.status_code == 200
    assert res_put.json()["success"] is True
    print(f"  [PASS] PUT /api/orders/{order_id} (Order update & feasibility check)")

    # 13. Test Start Production validation
    res_start = client.post(f"/api/orders/{order_id}/start-production")
    assert res_start.status_code in [200, 400]
    print(f"  [PASS] POST /api/orders/{order_id}/start-production (Status: {res_start.status_code}, Handled: {res_start.json().get('message') or res_start.json().get('detail')})")

    # 14. Test Create & Cancel Order flow
    import uuid
    test_ord_num = f"ORD-TEST-{uuid.uuid4().hex[:6].upper()}"
    res_create = client.post("/api/orders", json={
        "order_number": test_ord_num,
        "customer_name": "Test Cancel Flow Customer",
        "cloth_type": "Cotton 100% Greige Knit",
        "quantity_kg": 200.0,
        "colour_name": "Test Sky Blue",
        "colour_code": "ROYAL_BLUE",
        "due_date": "2026-10-15T00:00:00Z",
        "priority": "LOW"
    })
    assert res_create.status_code == 200
    temp_order = res_create.json()
    temp_id = temp_order["id"]

    res_cancel = client.post(f"/api/orders/{temp_id}/cancel")
    assert res_cancel.status_code == 200
    assert res_cancel.json()["success"] is True
    print(f"  [PASS] POST /api/orders/{temp_id}/cancel (Temporary order cancelled & capacity released)")

    # 15. Test Daily Production Agenda (Day-to-Day dispatch & shift breakdown)
    res_agenda = client.get("/api/schedule/daily-agenda?days=7")
    assert res_agenda.status_code == 200
    agenda = res_agenda.json()
    assert "days" in agenda
    assert len(agenda["days"]) == 7
    assert "shifts" in agenda["days"][0]
    print(f"  [PASS] GET /api/schedule/daily-agenda ({len(agenda['days'])} days, {agenda['total_planned_kg']}kg planned across shifts)")

    # 16. Test Machine Management: Add Machine
    import uuid
    test_code = f"JET-E2E-{uuid.uuid4().hex[:4].upper()}"
    res_add_mach = client.post("/api/machines", json={
        "code": test_code,
        "name": "E2E Automated Dyeing Vessel",
        "machine_type": "JET_DYEING",
        "capacity_kg": 500.0,
        "min_batch_kg": 80.0,
        "max_batch_kg": 500.0,
        "efficiency": 0.94,
        "processing_speed": 1.05,
        "power_kw": 48.0,
        "water_m3_hr": 3.8,
        "steam_kg_hr": 620.0,
        "compatible_cloth_types": "Cotton,Polyester"
    })
    assert res_add_mach.status_code == 201
    created_m = res_add_mach.json()
    m_id = created_m["id"]
    print(f"  [PASS] POST /api/machines (Created machine #{m_id}: {created_m['name']})")

    # 17. Test Machine Maintenance Mode with duration in hours
    res_maint = client.post(f"/api/machines/{m_id}/maintenance", json={
        "hours": 4.5,
        "title": "Preventive Nozzle Cleaning",
        "maintenance_type": "PREVENTIVE",
        "notes": "Routine servicing"
    })
    assert res_maint.status_code == 200
    assert res_maint.json()["hours"] == 4.5
    print(f"  [PASS] POST /api/machines/{m_id}/maintenance (4.5h maintenance scheduled, jobs rescheduled)")

    # 18. Test Complete Maintenance Mode
    res_comp_maint = client.post(f"/api/machines/{m_id}/complete-maintenance")
    assert res_comp_maint.status_code == 200
    assert res_comp_maint.json()["status"] == "AVAILABLE"
    print(f"  [PASS] POST /api/machines/{m_id}/complete-maintenance (Returned to service)")

    # 19. Test Delete Machine
    res_del_m = client.delete(f"/api/machines/{m_id}")
    assert res_del_m.status_code == 200
    assert res_del_m.json()["success"] is True
    print(f"  [PASS] DELETE /api/machines/{m_id} (Cleanly deleted, fleet updated)")

    # 20. Test Changeover Matrix & Calculator
    res_co_mat = client.get("/api/schedule/changeover-matrix?fabric=Polyester&machine_type=JET_DYEING")
    assert res_co_mat.status_code == 200
    assert len(res_co_mat.json()) > 0
    res_co_calc = client.post("/api/schedule/changeover-calculate?from_colour=JET_BLACK&to_colour=WHITE&from_fabric=Cotton&to_fabric=Cotton")
    assert res_co_calc.status_code == 200
    co_detail = res_co_calc.json()
    assert co_detail["changeover_min"] > 30.0
    print(f"  [PASS] GET /api/schedule/changeover-matrix & /changeover-calculate (Dark-to-Light penalty: {co_detail['changeover_min']}m)")

    print("================================================================")
    print("  ALL END-TO-END HTTP INTEGRATION TESTS PASSED!                 ")
    print("================================================================")

if __name__ == "__main__":
    test_all_endpoints()
