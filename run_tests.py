import sys
from pathlib import Path
import traceback

backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal
from backend.tests.test_toc_engine import test_identify_system_bottleneck, test_five_focusing_steps
from backend.tests.test_changeover import test_same_colour_changeover, test_light_to_dark_vs_dark_to_light, test_fabric_penalty
from backend.tests.test_batch_splitter import test_order_fits_without_split, test_order_exceeds_capacity_splits_evenly, test_large_order_multiple_batches
from backend.tests.test_readiness import test_order_readiness_evaluation, test_smart_ready_swap
from backend.tests.test_rush_insertion import test_rush_order_insertion_evaluation
from backend.tests.test_rescheduling import test_machine_breakdown_dynamic_rescheduling
from backend.tests.test_reports import test_excel_and_pdf_generation
from backend.tests.test_machine_management import test_machine_crud_and_maintenance

def run_all():
    db = SessionLocal()
    tests = [
        ("TOC Bottleneck Identification", lambda: test_identify_system_bottleneck(db)),
        ("TOC 5 Focusing Steps", test_five_focusing_steps),
        ("Same Colour Changeover", test_same_colour_changeover),
        ("Light-to-Dark vs Dark-to-Light Changeover", test_light_to_dark_vs_dark_to_light),
        ("Fabric Penalty in Changeover", test_fabric_penalty),
        ("Order Fits Single Batch", test_order_fits_without_split),
        ("Oversized Order Splits Evenly", test_order_exceeds_capacity_splits_evenly),
        ("Multi-Batch Splitting", test_large_order_multiple_batches),
        ("Order 5-Point Readiness Checklist", lambda: test_order_readiness_evaluation(db)),
        ("Smart Ready Order Swap", lambda: test_smart_ready_swap(db)),
        ("Smart Rush Order Insertion Minimal Damage", lambda: test_rush_order_insertion_evaluation(db)),
        ("Dynamic Machine Breakdown Rescheduling", lambda: test_machine_breakdown_dynamic_rescheduling(db)),
        ("Machine CRUD & Dynamic Maintenance Rescheduling", lambda: test_machine_crud_and_maintenance(db)),
        ("Excel & PDF Production Report Generation", lambda: test_excel_and_pdf_generation(db)),
    ]

    print("================================================================")
    print("  RUNNING TOC TEXTILE SCHEDULER COMPREHENSIVE TEST SUITE        ")
    print("================================================================")

    passed = 0
    failed = 0
    for name, test_fn in tests:
        try:
            test_fn()
            print(f"  [PASS] {name}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")
            traceback.print_exc()
            failed += 1

    db.close()
    print("================================================================")
    print(f"  TEST SUMMARY: {passed} Passed, {failed} Failed out of {len(tests)} tests")
    print("================================================================")
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_all()
