"""
Loader for the seeded dataset's reference distributions.

The district and crime-type mixes that shape the demo dataset used to be magic
numbers inline in the seeder, with a comment claiming they were
"population-weighted" when nothing derived them. They now live in
data/reference/karnataka_crime_reference.json where each block carries an
explicit `_basis` and `_source`, so the provenance of every number is auditable
and recalibrating against published statistics is a data edit, not a code change.

Design notes:
  - Weights are RELATIVE. Callers get them aligned to the key order they ask for,
    so the seeder stays in control of which districts/types exist.
  - A missing or malformed file must never break seeding, so every failure path
    falls back to the built-in defaults and says so via `loaded_from`.
  - No third-party dependencies: this has to work on the slim cloud build.
"""
from __future__ import annotations

import json
import os
from typing import Dict, List, Tuple

# Fallback weights, used only when the reference file is missing or unreadable.
# These are the values the seeder used historically, kept so behaviour is
# unchanged if the file goes away. They are ILLUSTRATIVE, not sourced.
_FALLBACK_DISTRICTS: Dict[str, float] = {
    "Bengaluru Urban": 22, "Bengaluru Rural": 8, "Mysuru": 13, "Belagavi": 11,
    "Kalaburagi": 10, "Mangaluru": 11, "Hubli": 12, "Dharwad": 7,
    "Tumakuru": 9, "Raichur": 9,
}
_FALLBACK_CRIME_TYPES: Dict[str, float] = {
    "Theft": 30, "Murder": 4, "Snatching": 8, "Robbery": 7, "Assault": 12,
    "Burglary": 12, "Rioting": 6, "Cheating": 11, "Forgery": 6,
    "Counterfeiting": 4,
}

_REFERENCE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "reference", "karnataka_crime_reference.json",
)


def _read_reference() -> Tuple[dict, str]:
    """Return (parsed reference, description of where it came from)."""
    try:
        with open(_REFERENCE_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh), _REFERENCE_PATH
    except FileNotFoundError:
        return {}, "built-in defaults (reference file not found)"
    except (json.JSONDecodeError, OSError) as exc:
        # Malformed reference data is a config error worth surfacing, but it must
        # not stop the seeder from producing a usable dataset.
        print(f"  WARNING: could not read {_REFERENCE_PATH} ({exc}); "
              f"falling back to built-in weights.")
        return {}, "built-in defaults (reference file unreadable)"


def _extract(block: dict, fallback: Dict[str, float]) -> Tuple[Dict[str, float], bool]:
    """
    Pull a {name: weight} mapping out of a reference block, validating it.

    Returns (weights, used_fallback) so callers can report provenance truthfully:
    a readable file with an unusable block still means the numbers in play are
    the built-in defaults, and saying otherwise would defeat the point.
    """
    values = block.get("values") if isinstance(block, dict) else None
    if not isinstance(values, dict) or not values:
        return dict(fallback), True
    clean: Dict[str, float] = {}
    for name, weight in values.items():
        # Skip commentary keys and anything non-numeric or non-positive.
        if name.startswith("_"):
            continue
        try:
            w = float(weight)
        except (TypeError, ValueError):
            continue
        if w > 0:
            clean[name] = w
    if not clean:
        return dict(fallback), True
    return clean, False


class CrimeReference:
    """Reference distributions plus the provenance needed to describe them."""

    def __init__(self) -> None:
        raw, origin = _read_reference()
        self.provenance: dict = raw.get("_provenance", {}) if raw else {}
        self.district_weights, d_fell_back = _extract(
            raw.get("district_weights", {}), _FALLBACK_DISTRICTS)
        self.crime_type_weights, c_fell_back = _extract(
            raw.get("crime_type_shares", {}), _FALLBACK_CRIME_TYPES)

        if d_fell_back and c_fell_back:
            # Nothing usable came out of the file, whether or not it parsed.
            self.loaded_from = origin if not raw else \
                "built-in defaults (reference file had no usable weights)"
        elif d_fell_back or c_fell_back:
            which = "district" if d_fell_back else "crime-type"
            self.loaded_from = (f"{origin} (partial: {which} weights fell back "
                                f"to built-in defaults)")
        else:
            self.loaded_from = origin

    @property
    def calibrated(self) -> bool:
        """True only when the file explicitly claims real sourced figures."""
        return bool(self.provenance.get("calibrated", False))

    def weights_for(self, kind: str, keys: List[str]) -> List[float]:
        """
        Weights aligned to `keys`, for direct use with random.choices().

        Any key absent from the reference gets the mean of the known weights, so
        adding a district to the seeder cannot silently drop it to zero
        probability (which would make it invisible in every analytic).
        """
        table = self.district_weights if kind == "district" else self.crime_type_weights
        known = [table[k] for k in keys if k in table]
        default = (sum(known) / len(known)) if known else 1.0
        return [float(table.get(k, default)) for k in keys]

    def missing_from_reference(self, kind: str, keys: List[str]) -> List[str]:
        """Keys the caller uses that the reference file says nothing about."""
        table = self.district_weights if kind == "district" else self.crime_type_weights
        return [k for k in keys if k not in table]

    def describe(self) -> str:
        """One-line summary for seeder output, so runs are self-documenting."""
        state = "CALIBRATED to published figures" if self.calibrated \
            else "ILLUSTRATIVE (not sourced)"
        origin = self.loaded_from
        if origin.endswith(".json"):
            origin = os.path.basename(origin)
        return (f"reference distributions: {state} · "
                f"{len(self.district_weights)} districts, "
                f"{len(self.crime_type_weights)} crime types · "
                f"source: {origin}")


# Module-level singleton: the file is small and read once per process.
reference = CrimeReference()
