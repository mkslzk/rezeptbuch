#!/usr/bin/env python3
"""
Baut server/src/data/off.db aus dem Open-Food-Facts-JSONL-Dump neu.

Warum: die alte off.db (Mai 2026) hat keine `ingredients_analysis_tags` — Vegan/Vegetarisch
musste mühsam über die API nachgeladen werden (Rate-Limit 429). Der Dump enthält die Tags
für jedes Produkt, also schreiben wir sie direkt mit.

Nutzung:
    curl -sL https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz \\
        | python3 scripts/build-off-db.py -

    # oder aus einer lokalen Datei:
    python3 scripts/build-off-db.py /pfad/products.jsonl.gz

Filter: nur Produkte mit Deutschland-Bezug (countries_tags/countries enthalten Germany/Deutschland).
Ausgabe: off.db.new → nach Erfolg atomar auf off.db umbenannt (alte DB bleibt bis dahin nutzbar).
"""

import gzip
import io
import json
import os
import sqlite3
import sys
import time

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data')
TARGET = os.path.join(DATA_DIR, 'off.db')
TMP = os.path.join(DATA_DIR, 'off.db.new')

SCHEMA = """
CREATE TABLE products (
  code TEXT PRIMARY KEY,
  product_name TEXT,
  product_name_de TEXT,
  brands TEXT,
  brands_normalized TEXT,
  categories TEXT,
  categories_en TEXT,
  purchase_places TEXT,
  countries TEXT,
  quantity TEXT,
  serving_size TEXT,
  image_small_url TEXT,
  nutriscore_grade TEXT,
  nova_group INTEGER,
  energy_kcal_100g REAL,
  fat_100g REAL,
  proteins_100g REAL,
  carbohydrates_100g REAL,
  sugars_100g REAL,
  is_german INTEGER DEFAULT 0,
  ingredients_analysis_tags TEXT,
  categories_tags TEXT,
  labels_tags TEXT,
  vegan INTEGER DEFAULT 0,
  vegetarian INTEGER DEFAULT 0,
  non_vegan INTEGER DEFAULT 0
);
"""

COLS = [
    'code', 'product_name', 'product_name_de', 'brands', 'brands_normalized',
    'categories', 'categories_en', 'purchase_places', 'countries', 'quantity',
    'serving_size', 'image_small_url', 'nutriscore_grade', 'nova_group',
    'energy_kcal_100g', 'fat_100g', 'proteins_100g', 'carbohydrates_100g', 'sugars_100g',
    'is_german', 'ingredients_analysis_tags', 'categories_tags', 'labels_tags',
    'vegan', 'vegetarian', 'non_vegan',
]
INSERT = f"INSERT OR REPLACE INTO products ({','.join(COLS)}) VALUES ({','.join('?' * len(COLS))})"


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def as_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def is_german(raw, p):
    """Deutschland-Bezug: Tags sind verlässlicher als der Freitext."""
    tags = p.get('countries_tags') or []
    if any(t in ('en:germany', 'en:deutschland') for t in tags):
        return True
    text = (p.get('countries') or '') + ' ' + (p.get('purchase_places') or '')
    low = text.lower()
    return 'germany' in low or 'deutschland' in low


def row_from(p):
    tags = p.get('ingredients_analysis_tags') or []
    if not isinstance(tags, list):
        tags = []
    return (
        p.get('code'),
        p.get('product_name') or None,
        p.get('product_name_de') or None,
        p.get('brands') or None,
        (p.get('brands') or '').lower().replace(',', ' ').replace('  ', ' ').strip() or None,
        p.get('categories') or None,
        p.get('categories_en') or None,
        p.get('purchase_places') or None,
        p.get('countries') or None,
        p.get('quantity') or None,
        p.get('serving_size') or None,
        p.get('image_small_url') or None,
        p.get('nutriscore_grade') or None,
        as_int(p.get('nova_group')),
        num(p.get('energy-kcal_100g')),
        num(p.get('fat_100g')),
        num(p.get('proteins_100g')),
        num(p.get('carbohydrates_100g')),
        num(p.get('sugars_100g')),
        1,
        ','.join(tags) or None,
        ','.join(p.get('categories_tags') or []) or None,
        ','.join(p.get('labels_tags') or []) or None,
        1 if 'en:vegan' in tags else 0,
        1 if 'en:vegetarian' in tags else 0,
        1 if 'en:non-vegan' in tags else 0,
    )


def open_stream(arg):
    if arg == '-':
        return gzip.GzipFile(fileobj=sys.stdin.buffer)
    if arg.endswith('.gz'):
        return gzip.open(arg, 'rb')
    return open(arg, 'rb')


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '-'
    if os.path.exists(TMP):
        os.unlink(TMP)

    con = sqlite3.connect(TMP)
    con.executescript('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA cache_size=-200000;')
    con.executescript(SCHEMA)

    t0 = time.time()
    lines = 0
    kept = 0
    batch = []
    vegan = 0
    vegetarian = 0

    stream = open_stream(src)
    try:
        for raw in stream:
            lines += 1
            # Vorfilter auf Byte-Ebene: nur Zeilen mit Deutschland-Bezug parsen (schnell)
            if b'germany' not in raw and b'Germany' not in raw and b'Deutschland' not in raw:
                if lines % 500000 == 0:
                    print(f"  {lines:,} Zeilen gelesen, {kept:,} DE-Produkte ({time.time()-t0:.0f}s)", flush=True)
                continue
            try:
                p = json.loads(raw)
            except Exception:
                continue
            if not p.get('code') or not is_german(raw, p):
                continue
            batch.append(row_from(p))
            kept += 1
            if batch[-1][23]:
                vegan += 1
            if batch[-1][24]:
                vegetarian += 1
            if len(batch) >= 5000:
                con.executemany(INSERT, batch)
                con.commit()
                batch.clear()
                print(f"  {lines:,} Zeilen, {kept:,} DE-Produkte gespeichert "
                      f"(vegan {vegan:,}, vegetarisch {vegetarian:,}, {time.time()-t0:.0f}s)", flush=True)
    except (EOFError, OSError, gzip.BadGzipFile) as e:
        print(f"  ⚠️ Stream endete vorzeitig: {e}", flush=True)

    if batch:
        con.executemany(INSERT, batch)
    con.commit()

    print(f"Baue Index ({kept:,} Produkte) …", flush=True)
    con.executescript("""
      CREATE INDEX idx_products_name ON products(product_name);
      CREATE INDEX idx_products_de ON products(product_name_de);
      CREATE VIRTUAL TABLE products_fts USING fts5(
        product_name, product_name_de, brands, content='products', content_rowid='rowid'
      );
      INSERT INTO products_fts(products_fts) VALUES('rebuild');
    """)
    con.commit()
    con.close()

    # Sicherung: ein abgebrochener Testlauf darf die produktive DB nicht ersetzen
    if kept < 50000:
        print(f"⚠️ Nur {kept:,} Produkte — zu wenig für einen Voll-Export. "
              f"off.db bleibt unverändert, Ergebnis liegt in {TMP}", flush=True)
        sys.exit(2)

    os.replace(TMP, TARGET)
    print(f"✅ Fertig: {kept:,} Produkte, {vegan:,} vegan, {vegetarian:,} vegetarisch — "
          f"{os.path.getsize(TARGET)/1e6:.0f} MB in {time.time()-t0:.0f}s", flush=True)


if __name__ == '__main__':
    main()
