#!/usr/bin/env python3
"""
Google Trends Bridge — Called from Node.js via child_process.

Input (stdin): JSON array of keyword groups, e.g.:
  [["python", "javascript"], ["react", "vue"]]

Output (stdout): JSON array of results, e.g.:
  [{
    "keywords": ["python", "javascript"],
    "dataPoints": 53,
    "values": {
      "python": [52, 53, 51, ...],
      "javascript": [78, 77, 76, ...]
    },
    "trendDirection": {
      "python": 0.02,
      "javascript": -0.03
    },
    "avgInterest": {
      "python": 53.2,
      "javascript": 76.8
    }
  }]

Usage:
  echo '[["python","javascript"]]' | python3 scripts/trends.py --timeframe 'today 12-m' --geo '' --property youtube

Options:
  --timeframe   Google Trends timeframe (default: "today 12-m")
  --geo         Geographic region, ISO-3166-2 (default: "" = worldwide)
  --property    Google property: "" (web), "youtube", "news", "images", "froogle" (default: "youtube")
"""

import sys
import json
import argparse
import time

# Monkey-patch urllib3 for pytrends compatibility with urllib3 >= 2.0
from urllib3.util import Retry as _Retry
_original_init = _Retry.__init__

def _patched_init(self, *args, **kwargs):
    if "method_whitelist" in kwargs:
        kwargs["allowed_methods"] = kwargs.pop("method_whitelist")
    return _original_init(self, *args, **kwargs)

_Retry.__init__ = _patched_init

from pytrends.request import TrendReq


def compute_trend_direction(values: list) -> float:
    """Simple trend direction: first half vs second half average difference.
    Returns -1.0 (strong decline) to +1.0 (strong growth)."""
    if len(values) < 4:
        return 0.0

    mid = len(values) // 2
    first_half = sum(values[:mid]) / mid
    second_half = sum(values[mid:]) / mid

    if first_half == 0:
        return 1.0 if second_half > 0 else 0.0

    change = (second_half - first_half) / first_half
    return max(-1.0, min(1.0, change * 10))


def fetch_trends(keywords: list[str], timeframe: str, geo: str, prop: str) -> dict | None:
    """Fetch Google Trends data for up to 5 keywords."""
    try:
        pytrends = TrendReq(hl="en-US", tz=360, retries=2, backoff_factor=0.5)
        time.sleep(0.5)  # Rate limit courtesy

        pytrends.build_payload(
            kw_list=keywords[:5],
            timeframe=timeframe,
            geo=geo,
            gprop=prop,
        )

        data = pytrends.interest_over_time()

        if data is None or data.empty:
            return None

        # Extract per-keyword values
        values = {}
        avg_interest = {}
        trend_direction = {}

        for kw in keywords:
            if kw in data.columns:
                vals = [int(v) for v in data[kw].values]
                values[kw] = vals
                avg_interest[kw] = round(sum(vals) / len(vals), 1)
                trend_direction[kw] = round(compute_trend_direction(vals), 2)
            else:
                values[kw] = []
                avg_interest[kw] = 0
                trend_direction[kw] = 0

        return {
            "keywords": keywords,
            "dataPoints": len(data),
            "values": values,
            "trendDirection": trend_direction,
            "avgInterest": avg_interest,
        }

    except Exception as e:
        return {
            "keywords": keywords,
            "error": str(e),
            "dataPoints": 0,
            "values": {kw: [] for kw in keywords},
            "trendDirection": {kw: 0 for kw in keywords},
            "avgInterest": {kw: 0 for kw in keywords},
        }


def main():
    parser = argparse.ArgumentParser(description="Google Trends bridge for CreatorForge")
    parser.add_argument("--timeframe", default="today 12-m", help="Trends timeframe")
    parser.add_argument("--geo", default="", help="Geographic region (ISO-3166-2)")
    parser.add_argument("--property", default="youtube", help="Google property")
    args = parser.parse_args()

    # Read keyword groups from stdin
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"error": "No input"}))
        sys.exit(1)

    try:
        groups = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    if not isinstance(groups, list):
        groups = [groups]

    results = []
    for group in groups:
        if not isinstance(group, list):
            group = [group]

        result = fetch_trends(group, args.timeframe, args.geo, args.property)
        if result:
            results.append(result)

        # Rate limit between groups
        if len(groups) > 1:
            time.sleep(1)

    print(json.dumps(results))


if __name__ == "__main__":
    main()
