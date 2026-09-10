import pytest
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.batch_splitter import evaluate_and_split_order_batches

def test_order_fits_without_split():
    batches = evaluate_and_split_order_batches(order_quantity_kg=450.0, machine_max_capacity_kg=500.0)
    assert len(batches) == 1
    assert batches[0]["quantity_kg"] == 450.0
    assert not batches[0]["is_split"]

def test_order_exceeds_capacity_splits_evenly():
    # 700 kg on a 500 kg max machine
    batches = evaluate_and_split_order_batches(order_quantity_kg=700.0, machine_max_capacity_kg=500.0)
    assert len(batches) == 2
    assert batches[0]["is_split"]
    # Total quantity preserved
    total_split = sum(b["quantity_kg"] for b in batches)
    assert total_split == 700.0
    # Both batches fit machine limit
    assert all(b["quantity_kg"] <= 500.0 for b in batches)
    assert batches[0]["quantity_kg"] == 350.0
    assert batches[1]["quantity_kg"] == 350.0

def test_large_order_multiple_batches():
    # 1200 kg on 500 kg max machine -> 3 batches of 400 kg each
    batches = evaluate_and_split_order_batches(order_quantity_kg=1200.0, machine_max_capacity_kg=500.0)
    assert len(batches) == 3
    assert sum(b["quantity_kg"] for b in batches) == 1200.0
    assert all(b["quantity_kg"] <= 500.0 for b in batches)
