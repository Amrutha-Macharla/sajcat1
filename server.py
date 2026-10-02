#!/usr/bin/env python3
"""
Sri Amrutha Jewellers Product Catalogue Server
High-performance REST API and Static Web Server with SQLite
"""

import os
import sys
import json
import sqlite3
import base64
import uuid
import mimetypes
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
DB_PATH = os.path.join(BASE_DIR, 'catalogue.db')

os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

DEFAULT_CIPHER = {
    "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
    "6": "F", "7": "G", "8": "H", "9": "I", "0": "0"
}

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Rates table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rate REAL NOT NULL,
        unit TEXT DEFAULT 'per gram',
        color TEXT DEFAULT '#b45309',
        display_order INTEGER DEFAULT 0
    )
    """)
    
    # Categories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        icon_letter TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Products table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        category_id TEXT NOT NULL,
        category_name TEXT NOT NULL,
        metal_type TEXT NOT NULL,
        carats TEXT,
        item_wt REAL DEFAULT 0,
        net_wt REAL DEFAULT 0,
        stone_cost REAL DEFAULT 0,
        va_percent REAL DEFAULT 0,
        mc REAL DEFAULT 0,
        manual_mrp REAL DEFAULT 0,
        mrp REAL DEFAULT 0,
        price_code TEXT,
        breakdown_code TEXT,
        image_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(category_id) REFERENCES categories(id)
    )
    """)
    
    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)

    # Seed Default Rates if empty
    cursor.execute("SELECT COUNT(*) FROM rates")
    if cursor.fetchone()[0] == 0:
        rates_data = [
            ('gold_22k', 'Gold 22k', 14700.0, '₹/g', '#b45309', 1),
            ('gold_18k', 'Gold 18k', 12100.0, '₹/g', '#d97706', 2),
            ('silver', 'Silver', 253.0, '₹/g', '#475569', 3),
            ('sterling_925', 'Sterling (92.5)', 1500.0, '₹/g', '#7c3aed', 4),
            ('gold_coating', 'Gold Coating', 1200.0, '₹/g', '#ea580c', 5)
        ]
        cursor.executemany("INSERT INTO rates (id, name, rate, unit, color, display_order) VALUES (?, ?, ?, ?, ?, ?)", rates_data)

    # Seed Default Categories if empty
    cursor.execute("SELECT COUNT(*) FROM categories")
    if cursor.fetchone()[0] == 0:
        categories_data = [
            ('cat_gold_black_beads', 'Gold Black Beads', 'G'),
            ('cat_1_gram_gold_earrings', '1 Gram Gold Earrings', '1'),
            ('cat_18_ct_chains', '18 Ct Chains', '1'),
            ('cat_gold_mattilu', 'Gold Mattilu', 'G'),
            ('cat_gold_thalli_chains', 'Gold Thalli Chains', 'G'),
            ('cat_diamond_jewellery', 'Diamond Jewellery', 'D'),
            ('cat_silver_articles', 'Silver Articles', 'S')
        ]
        cursor.executemany("INSERT INTO categories (id, name, icon_letter) VALUES (?, ?, ?)", categories_data)



    # Settings: Cipher, Store Name, Admin Password, Firebase, WhatsApp
    cursor.execute("SELECT COUNT(*) FROM settings WHERE key = 'cipher'")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO settings (key, value) VALUES ('cipher', ?)", (json.dumps(DEFAULT_CIPHER),))
        cursor.execute("INSERT INTO settings (key, value) VALUES ('store_name', 'Sri Amrutha Jewellers')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('store_tagline', 'Exquisite Collections')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('admin_username', 'admin')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('firebase_url', 'https://saj-cat1-default-rtdb.asia-southeast1.firebasedatabase.app')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('whatsapp_number', '919492443916')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('cloudinary_name', 'do2kiuqp4')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('cloudinary_preset', 'ml_default')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('cloudinary_key', '')")

    conn.commit()
    conn.close()

def encode_codeword(num_val, cipher=None):
    if cipher is None:
        cipher = DEFAULT_CIPHER
    if num_val is None:
        return ""
    val_int = int(round(float(num_val)))
    s = str(val_int)
    return "".join(cipher.get(ch, ch) for ch in s)

def calculate_product_pricing(product_data, rates_map, cipher=None):
    """
    Formulas:
    1. Gold: ((Net Wt + VA%) * Gold Rate) + MC + Stone Cost -> ((Net Wt * (1 + VA/100)) * Gold Rate) + MC + Stone Cost
    2. Silver: ((Item Wt + VA%) * Silver Rate) + MC -> ((Item Wt * (1 + VA/100)) * Silver Rate) + MC
    3. Diamond: Manual MRP with weight
    """
    metal = product_data.get('metal_type', 'Gold').strip().lower()
    carats = product_data.get('carats', '22k').strip().lower()
    item_wt = float(product_data.get('item_wt') or 0)
    net_wt = float(product_data.get('net_wt') or 0)
    if net_wt == 0 and item_wt > 0 and metal == 'gold':
        net_wt = item_wt
    stone_cost = float(product_data.get('stone_cost') or 0)
    va_percent = float(product_data.get('va_percent') or 0)
    mc = float(product_data.get('mc') or 0)
    manual_mrp = float(product_data.get('manual_mrp') or 0)

    if metal == 'gold':
        if '18' in carats:
            rate = float(rates_map.get('gold_18k', 12100.0))
        elif 'coating' in carats or '1 gram' in carats:
            rate = float(rates_map.get('gold_coating', 1200.0))
        else:
            rate = float(rates_map.get('gold_22k', 14700.0))
        
        gold_value = (net_wt * (1.0 + (va_percent / 100.0))) * rate
        mrp = round(gold_value + mc + stone_cost)
    elif metal == 'silver':
        if '92.5' in carats or 'sterling' in carats:
            rate = float(rates_map.get('sterling_925', 1500.0))
        else:
            rate = float(rates_map.get('silver', 253.0))
        silver_value = (item_wt * (1.0 + (va_percent / 100.0))) * rate
        mrp = round(silver_value + mc)
    elif metal == 'diamond':
        mrp = round(manual_mrp)
    else:
        rate = float(rates_map.get('gold_22k', 14700.0))
        mrp = round((net_wt * (1.0 + (va_percent / 100.0)) * rate) + mc + stone_cost)

    price_code = encode_codeword(mrp, cipher)
    
    # Breakdown Code: VA% code | MC code
    va_code = encode_codeword(va_percent, cipher)
    mc_code = encode_codeword(mc, cipher)
    breakdown_code = f"{va_code} | {mc_code}" if (va_code or mc_code) else ""

    return mrp, price_code, breakdown_code

def get_current_rates_map(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT id, rate FROM rates")
    rows = cursor.fetchall()
    return {row['id']: float(row['rate']) for row in rows}

def recalculate_all_products(conn):
    rates_map = get_current_rates_map(conn)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM products")
    products = cursor.fetchall()
    for p in products:
        p_dict = dict(p)
        mrp, price_code, breakdown_code = calculate_product_pricing(p_dict, rates_map)
        cursor.execute(
            "UPDATE products SET mrp = ?, price_code = ?, breakdown_code = ? WHERE id = ?",
            (mrp, price_code, breakdown_code, p['id'])
        )
    conn.commit()


class CatalogueHTTPHandler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        # API Routes
        if path.startswith('/api/'):
            conn = get_db()
            cursor = conn.cursor()
            
            if path == '/api/rates':
                cursor.execute("SELECT * FROM rates ORDER BY display_order ASC")
                rates = [dict(row) for row in cursor.fetchall()]
                conn.close()
                return self.send_json({"success": True, "rates": rates})
            
            elif path == '/api/categories':
                cursor.execute("""
                SELECT c.*, COUNT(p.id) as product_count 
                FROM categories c 
                LEFT JOIN products p ON c.id = p.category_id 
                GROUP BY c.id 
                ORDER BY c.created_at ASC
                """)
                categories = [dict(row) for row in cursor.fetchall()]
                conn.close()
                return self.send_json({"success": True, "categories": categories})
                
            elif path == '/api/products':
                query_params = parse_qs(parsed.query)
                cat_id = query_params.get('category_id', [None])[0]
                search = query_params.get('search', [None])[0]
                
                sql = "SELECT * FROM products WHERE 1=1"
                params = []
                if cat_id:
                    sql += " AND category_id = ?"
                    params.append(cat_id)
                if search:
                    sql += " AND (code LIKE ? OR category_name LIKE ? OR notes LIKE ?)"
                    wildcard = f"%{search}%"
                    params.extend([wildcard, wildcard, wildcard])
                sql += " ORDER BY created_at DESC"
                
                cursor.execute(sql, params)
                products = [dict(row) for row in cursor.fetchall()]
                conn.close()
                return self.send_json({"success": True, "products": products})

            elif path.startswith('/api/products/'):
                prod_id = path.replace('/api/products/', '')
                cursor.execute("SELECT * FROM products WHERE id = ?", (prod_id,))
                prod = cursor.fetchone()
                conn.close()
                if prod:
                    return self.send_json({"success": True, "product": dict(prod)})
                return self.send_json({"success": False, "error": "Product not found"}, 404)

            elif path == '/api/settings':
                cursor.execute("SELECT key, value FROM settings")
                settings = {row['key']: row['value'] for row in cursor.fetchall()}
                conn.close()
                return self.send_json({"success": True, "settings": settings})

            conn.close()
            return self.send_json({"success": False, "error": "Endpoint not found"}, 404)

        # Uploaded files
        if path.startswith('/uploads/'):
            filename = os.path.basename(path)
            file_path = os.path.join(UPLOADS_DIR, filename)
            if os.path.exists(file_path):
                mime, _ = mimetypes.guess_type(file_path)
                self.send_response(200)
                self.send_header('Content-Type', mime or 'application/octet-stream')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_response(404)
                self.end_headers()
                return

        # Static files from public/
        clean_path = path.lstrip('/')
        if not clean_path:
            clean_path = 'index.html'
        
        file_path = os.path.join(PUBLIC_DIR, clean_path)
        if os.path.isfile(file_path):
            mime, _ = mimetypes.guess_type(file_path)
            self.send_response(200)
            self.send_header('Content-Type', mime or 'text/html')
            self.end_headers()
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
            return
        
        # Single Page App routing fallback: serve index.html
        index_file = os.path.join(PUBLIC_DIR, 'index.html')
        if os.path.isfile(index_file):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            with open(index_file, 'rb') as f:
                self.wfile.write(f.read())
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length)
        
        try:
            body = json.loads(body_bytes.decode('utf-8')) if body_bytes else {}
        except Exception:
            body = {}

        conn = get_db()
        cursor = conn.cursor()

        # Login
        if path == '/api/login':
            username = body.get('username', '')
            password = body.get('password', '')
            cursor.execute("SELECT value FROM settings WHERE key = 'admin_username'")
            db_user = cursor.fetchone()['value']
            cursor.execute("SELECT value FROM settings WHERE key = 'admin_password'")
            db_pass = cursor.fetchone()['value']
            conn.close()
            
            if username == db_user and password == db_pass:
                token = str(uuid.uuid4())
                return self.send_json({"success": True, "token": token, "username": username})
            else:
                return self.send_json({"success": False, "error": "Invalid username or password"}, 401)

        # Update Rates
        elif path == '/api/rates':
            rates_list = body.get('rates', [])
            for r in rates_list:
                cursor.execute(
                    "UPDATE rates SET rate = ? WHERE id = ?",
                    (float(r['rate']), r['id'])
                )
            conn.commit()
            recalculate_all_products(conn)
            conn.close()
            return self.send_json({"success": True, "message": "Rates updated and products recalculated"})

        # Add Category
        elif path == '/api/categories':
            name = body.get('name', '').strip()
            if not name:
                conn.close()
                return self.send_json({"success": False, "error": "Category name required"}, 400)
            
            cat_id = 'cat_' + str(uuid.uuid4())[:8]
            icon_letter = name[0].upper() if name else 'C'
            try:
                cursor.execute("INSERT INTO categories (id, name, icon_letter) VALUES (?, ?, ?)", (cat_id, name, icon_letter))
                conn.commit()
                conn.close()
                return self.send_json({"success": True, "category": {"id": cat_id, "name": name, "icon_letter": icon_letter}})
            except sqlite3.IntegrityError:
                conn.close()
                return self.send_json({"success": False, "error": "Category already exists"}, 400)

        # Add or Edit Product
        elif path == '/api/products':
            prod_id = body.get('id') or ('prod_' + str(uuid.uuid4())[:8])
            code = body.get('code', '').strip().upper()
            if not code:
                cursor.execute("SELECT COUNT(*) FROM products")
                count = cursor.fetchone()[0] + 1
                code = f"SAJ-{count:04d}"

            cat_id = body.get('category_id')
            cursor.execute("SELECT name FROM categories WHERE id = ?", (cat_id,))
            cat_row = cursor.fetchone()
            cat_name = cat_row['name'] if cat_row else 'General'

            rates_map = get_current_rates_map(conn)
            mrp, price_code, breakdown_code = calculate_product_pricing(body, rates_map)

            cursor.execute("SELECT id FROM products WHERE id = ?", (prod_id,))
            exists = cursor.fetchone()
            
            if exists:
                cursor.execute("""
                UPDATE products SET
                    code = ?, category_id = ?, category_name = ?, metal_type = ?, carats = ?,
                    item_wt = ?, net_wt = ?, stone_cost = ?, va_percent = ?, mc = ?,
                    manual_mrp = ?, mrp = ?, price_code = ?, breakdown_code = ?,
                    image_url = ?, notes = ?
                WHERE id = ?
                """, (
                    code, cat_id, cat_name, body.get('metal_type', 'Gold'), body.get('carats', '22k'),
                    float(body.get('item_wt') or 0), float(body.get('net_wt') or 0), float(body.get('stone_cost') or 0),
                    float(body.get('va_percent') or 0), float(body.get('mc') or 0), float(body.get('manual_mrp') or 0),
                    mrp, price_code, breakdown_code, body.get('image_url', ''), body.get('notes', ''),
                    prod_id
                ))
            else:
                cursor.execute("""
                INSERT INTO products (
                    id, code, category_id, category_name, metal_type, carats,
                    item_wt, net_wt, stone_cost, va_percent, mc, manual_mrp,
                    mrp, price_code, breakdown_code, image_url, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    prod_id, code, cat_id, cat_name, body.get('metal_type', 'Gold'), body.get('carats', '22k'),
                    float(body.get('item_wt') or 0), float(body.get('net_wt') or 0), float(body.get('stone_cost') or 0),
                    float(body.get('va_percent') or 0), float(body.get('mc') or 0), float(body.get('manual_mrp') or 0),
                    mrp, price_code, breakdown_code, body.get('image_url', ''), body.get('notes', '')
                ))

            conn.commit()
            conn.close()
            return self.send_json({"success": True, "id": prod_id, "code": code, "mrp": mrp, "price_code": price_code})

        # Image Upload (Base64 file upload)
        elif path == '/api/upload':
            image_data = body.get('image_data')
            filename = body.get('filename') or f"product_{uuid.uuid4().hex[:8]}.png"
            
            if not image_data:
                conn.close()
                return self.send_json({"success": False, "error": "No image data provided"}, 400)
            
            if ',' in image_data:
                header, encoded = image_data.split(',', 1)
            else:
                encoded = image_data

            file_bytes = base64.b64decode(encoded)
            file_path = os.path.join(UPLOADS_DIR, filename)
            with open(file_path, 'wb') as f:
                f.write(file_bytes)
            
            conn.close()
            return self.send_json({"success": True, "url": f"/uploads/{filename}"})

        # Update Settings / Cipher
        elif path == '/api/settings':
            for k, v in body.items():
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
            conn.commit()
            recalculate_all_products(conn)
            conn.close()
            return self.send_json({"success": True, "message": "Settings updated"})

        conn.close()
        return self.send_json({"success": False, "error": "Endpoint not found"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        conn = get_db()
        cursor = conn.cursor()

        if path.startswith('/api/categories/'):
            cat_id = path.replace('/api/categories/', '')
            cursor.execute("SELECT COUNT(*) FROM products WHERE category_id = ?", (cat_id,))
            if cursor.fetchone()[0] > 0:
                conn.close()
                return self.send_json({"success": False, "error": "Cannot delete category with active products"}, 400)
            cursor.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
            conn.commit()
            conn.close()
            return self.send_json({"success": True, "message": "Category deleted"})

        elif path.startswith('/api/products/'):
            prod_id = path.replace('/api/products/', '')
            cursor.execute("DELETE FROM products WHERE id = ?", (prod_id,))
            conn.commit()
            conn.close()
            return self.send_json({"success": True, "message": "Product deleted"})

        conn.close()
        return self.send_json({"success": False, "error": "Endpoint not found"}, 404)

def run_server(port=8000):
    init_db()
    server_address = ('', port)
    httpd = HTTPServer(server_address, CatalogueHTTPHandler)
    print(f"==================================================")
    print(f" Sri Amrutha Jewellers Catalogue Server Running!")
    print(f" URL: http://localhost:{port}")
    print(f" Admin Portal: http://localhost:{port}/admin")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    run_server(port)
