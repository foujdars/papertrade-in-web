"""Regression checks for dated Screener columns and standalone fallback."""
import importlib.util
import pathlib
import unittest
import urllib.error
from unittest.mock import patch

module_spec = importlib.util.spec_from_file_location("collector", pathlib.Path(__file__).resolve().parents[1] / "scripts/collect-research.py")
collector = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(collector)
HTML = b'''<ul id="top-ratios"><li><span class="name">Stock P/E</span><span class="number">20</span></li><li><span class="name">ROE</span><span class="number">15</span></li></ul>
<a title="Sector">Industrials</a><table class="ranges-table"><tr><th>Compounded Sales Growth</th></tr><tr><td>TTM</td><td>12%</td></tr></table>
<section id="profit-loss"><table class="data-table"><thead><tr><th></th><th data-date-key="2026-03-31">Mar 2026</th><th data-date-key="TTM">TTM</th></tr></thead><tbody><tr><td>Sales +</td><td>1,000</td><td>9,999</td></tr><tr><td>Net Profit +</td><td>100</td><td>1</td></tr></tbody></table></section>
<section id="balance-sheet"><table class="data-table"><thead><tr><th></th><th data-date-key="2026-03-31">Mar 2026</th></tr></thead><tbody><tr><td>Equity Capital</td><td>50</td></tr><tr><td>Reserves</td><td>150</td></tr><tr><td>Borrowings +</td><td>100</td></tr></tbody></table></section>'''

class CollectorTests(unittest.TestCase):
    def test_annual_column_excludes_ttm_and_preserves_missing_ratios(self):
        with patch.object(collector, "get_public", return_value=HTML):
            result = collector.screener_fundamentals("TEST")
        self.assertEqual(result["profitMargin"], 10)
        self.assertEqual(result["debtEquity"], .5)
        self.assertEqual(result["revenueGrowth"], 12)
        self.assertIsNone(result["currentRatio"])
        self.assertEqual(result["financialPeriod"], 1774915200000)

    def test_standalone_fallback_retains_source_url(self):
        unavailable = urllib.error.HTTPError("test", 404, "Not found", {}, None)
        with patch.object(collector, "get_public", side_effect=[unavailable, HTML]):
            self.assertTrue(collector.screener_fundamentals("TEST")["sourceUrl"].endswith("/TEST/"))
        with patch.object(collector, "get_public", return_value=b"<html></html>"):
            with self.assertRaises(ValueError):
                collector.screener_fundamentals("TEST")

if __name__ == "__main__":
    unittest.main()
