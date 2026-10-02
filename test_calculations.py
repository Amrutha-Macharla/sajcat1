#!/usr/bin/env python3
"""
Unit tests for Sri Amrutha Jewellers Calculation & Codeword Cipher Engine
"""
import unittest
from server import calculate_product_pricing, encode_codeword, DEFAULT_CIPHER

class TestJewelleryPricing(unittest.TestCase):
    def setUp(self):
        self.rates = {
            'gold_22k': 14700.0,
            'gold_18k': 12100.0,
            'silver': 253.0,
            'sterling_925': 1500.0,
            'gold_coating': 1200.0
        }

    def test_gold_product_1(self):
        # AJ-0001 from screenshot: Net 1.73g, VA 20%, MC 550 -> MRP 31067 -> CA0FG
        prod = {
            'metal_type': 'Gold',
            'carats': '22k',
            'item_wt': 2.07,
            'net_wt': 1.73,
            'stone_cost': 0,
            'va_percent': 20,
            'mc': 550
        }
        mrp, price_code, breakdown_code = calculate_product_pricing(prod, self.rates)
        self.assertEqual(mrp, 31067)
        self.assertEqual(price_code, 'CA0FG')
        self.assertEqual(breakdown_code, 'B0 | EE0')

    def test_gold_product_2(self):
        # AJ-0002 from screenshot: Net 2.06g, VA 20%, MC 600 -> MRP 36938 -> CFICH
        prod = {
            'metal_type': 'Gold',
            'carats': '22k',
            'item_wt': 2.30,
            'net_wt': 2.06,
            'stone_cost': 0,
            'va_percent': 20,
            'mc': 600
        }
        mrp, price_code, breakdown_code = calculate_product_pricing(prod, self.rates)
        self.assertEqual(mrp, 36938)
        self.assertEqual(price_code, 'CFICH')

    def test_gold_product_3(self):
        # AJ-0003 from screenshot: Net 2.96g, VA 18%, MC 600, Stone 680 -> MRP 52624 -> EBFBD
        prod = {
            'metal_type': 'Gold',
            'carats': '22k',
            'item_wt': 3.00,
            'net_wt': 2.96,
            'stone_cost': 680,
            'va_percent': 18,
            'mc': 600
        }
        mrp, price_code, breakdown_code = calculate_product_pricing(prod, self.rates)
        self.assertEqual(mrp, 52624)
        self.assertEqual(price_code, 'EBFBD')

    def test_silver_product(self):
        # Silver: ((Item Wt + VA%) * Silver Rate) + MC
        prod = {
            'metal_type': 'Silver',
            'carats': 'Silver',
            'item_wt': 10.0,
            'va_percent': 10.0,
            'mc': 200.0
        }
        # (10 * 1.10 * 253) + 200 = 2783 + 200 = 2983
        mrp, price_code, _ = calculate_product_pricing(prod, self.rates)
        self.assertEqual(mrp, 2983)
        self.assertEqual(price_code, 'BIHC')

    def test_diamond_product(self):
        # Diamond: Manual MRP with weight
        prod = {
            'metal_type': 'Diamond',
            'item_wt': 3.5,
            'manual_mrp': 75420
        }
        mrp, price_code, _ = calculate_product_pricing(prod, self.rates)
        self.assertEqual(mrp, 75420)
        self.assertEqual(price_code, 'GEDB0')

if __name__ == '__main__':
    unittest.main()
