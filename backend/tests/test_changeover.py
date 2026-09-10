import pytest
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.changeover import calculate_changeover_penalty, optimize_order_sequence_for_machine

def test_same_colour_changeover():
    pen = calculate_changeover_penalty("Cotton", "WHITE", "Cotton", "WHITE")
    assert pen["changeover_min"] <= 10.0
    assert pen["water_litres"] <= 500.0

def test_light_to_dark_vs_dark_to_light():
    # Light to Dark (White -> Jet Black)
    pen_light_to_dark = calculate_changeover_penalty("Cotton", "WHITE", "Cotton", "JET_BLACK")
    
    # Dark to Light (Jet Black -> White)
    pen_dark_to_light = calculate_changeover_penalty("Cotton", "JET_BLACK", "Cotton", "WHITE")

    # Dark to light must be much higher because of caustic stripping
    assert pen_dark_to_light["changeover_min"] > pen_light_to_dark["changeover_min"]
    assert pen_dark_to_light["water_litres"] > pen_light_to_dark["water_litres"]
    assert pen_dark_to_light["chemical_cost_inr"] > pen_light_to_dark["chemical_cost_inr"]

def test_fabric_penalty():
    # Cotton to Cotton
    pen_same_fab = calculate_changeover_penalty("Cotton", "WHITE", "Cotton", "ROYAL_BLUE")
    # Polyester to Cotton (requires boil-out)
    pen_diff_fab = calculate_changeover_penalty("Polyester", "WHITE", "Cotton", "ROYAL_BLUE")
    
    assert pen_diff_fab["changeover_min"] > pen_same_fab["changeover_min"]
