import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'rezeptbuch.db');

export let db;

export function initDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      ingredients TEXT,
      steps TEXT,
      category TEXT,
      tags TEXT,
      image_url TEXT,
      servings INTEGER,
      prep_time INTEGER,
      cook_time INTEGER,
      source_url TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title);
    CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);

    CREATE TABLE IF NOT EXISTS meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meal_plan_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_plan_id INTEGER REFERENCES meal_plans(id) ON DELETE CASCADE,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      day_of_week INTEGER,
      meal_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shopping_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_plan_id INTEGER REFERENCES meal_plans(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shopping_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopping_list_id INTEGER REFERENCES shopping_lists(id) ON DELETE CASCADE,
      item TEXT NOT NULL,
      amount TEXT,
      unit TEXT,
      category TEXT,
      store TEXT,
      checked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add off_* columns to shopping_items (for OFF product linking)
  for (const col of ['off_product_name', 'off_product_code', 'off_brand', 'off_quantity']) {
    try {
      db.exec(`ALTER TABLE shopping_items ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Add is_favorite column if it doesn't exist (for existing databases)
  try {
    db.exec("ALTER TABLE recipes ADD COLUMN is_favorite INTEGER DEFAULT 0");
  } catch (e) {
    // Column already exists, ignore
  }

  // Seed test data if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM recipes').get();
  if (count.c === 0) {
    seedTestData();
  }

  console.log('📦 Database initialized at', dbPath);
}

function seedTestData() {
  const recipes = [
    {
      title: 'Schnitzel Wiener Art',
      description: 'Knuspriges Wiener Schnitzel vom Kalb, so wie es sein muss.',
      ingredients: JSON.stringify([
        { item: 'Kalbsschnitzel', amount: '4', unit: 'Stk', category: 'meat' },
        { item: 'Mehl', amount: '100', unit: 'g', category: 'pantry' },
        { item: 'Eier', amount: '2', unit: 'Stk', category: 'dairy' },
        { item: 'Semmelbrösel', amount: '150', unit: 'g', category: 'pantry' },
        { item: 'Butterschmalz', amount: '4', unit: 'EL', category: 'dairy' },
        { item: 'Zitrone', amount: '1', unit: 'Stk', category: 'produce' },
        { item: 'Salz, Pfeffer', amount: '1', unit: 'Prise', category: 'pantry' }
      ]),
      steps: JSON.stringify([
        'Schnitzel zwischen Folie dünn klopfen, salzen und pfeffern.',
        'Mehl, verquirltes Ei und Semmelbrösel vorbereiten.',
        'Schnitzel erst in Mehl, dann Ei, dann Brösel wenden.',
        'In Butterschmalz bei mittlerer Hitze goldbraun braten (ca. 3 Min. pro Seite).',
        'Mit Zitronenspalten servieren.'
      ]),
      category: 'hauptgericht',
      tags: JSON.stringify(['deutsch', 'klassisch', 'fleisch']),
      image_url: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=800',
      servings: 4,
      prep_time: 15,
      cook_time: 15,
      source_url: null
    },
    {
      title: 'Sächsische Quarkkeulchen',
      description: 'Traditionelles ostdeutsches Gericht aus Quark-Kartoffel-Teig mit Zimt und Zucker.',
      ingredients: JSON.stringify([
        { item: 'Kartoffeln (mehlig)', amount: '500', unit: 'g', category: 'produce' },
        { item: 'Quark (20%)', amount: '250', unit: 'g', category: 'dairy' },
        { item: 'Mehl', amount: '100', unit: 'g', category: 'pantry' },
        { item: 'Ei', amount: '1', unit: 'Stk', category: 'dairy' },
        { item: 'Zucker', amount: '2', unit: 'EL', category: 'pantry' },
        { item: 'Zimt', amount: '1', unit: 'TL', category: 'pantry' },
        { item: 'Rosinen', amount: '50', unit: 'g', category: 'pantry' },
        { item: 'Butter', amount: '30', unit: 'g', category: 'dairy' }
      ]),
      steps: JSON.stringify([
        'Kartoffeln schälen, kochen und stampfen.',
        'Quark, Mehl, Ei und Zucker unterheben.',
        'Teig zu fingerdicken Rollen formen, in Zimtzucker wenden.',
        'In Butter von beiden Seiten goldbraun braten.',
        'Mit Apfelmus oder Sahne servieren.'
      ]),
      category: 'hauptgericht',
      tags: JSON.stringify(['deutsch', 'traditionell', 'vegetarisch']),
      image_url: 'https://images.unsplash.com/photo-1506073881647-7e1b440aeb9b?w=800',
      servings: 4,
      prep_time: 20,
      cook_time: 30,
      source_url: null
    },
    {
      title: 'Rotes Meer (Bunter Heringssalat)',
      description: 'Beliebter Heringssalat für Silvester und Feiertage.',
      ingredients: JSON.stringify([
        { item: 'Matjesfilets', amount: '400', unit: 'g', category: 'meat' },
        { item: 'Rote Bete (gekocht)', amount: '300', unit: 'g', category: 'produce' },
        { item: 'Gurken', amount: '2', unit: 'Stk', category: 'produce' },
        { item: 'Zwiebeln', amount: '1', unit: 'Stk', category: 'produce' },
        { item: 'Äpfel', amount: '2', unit: 'Stk', category: 'produce' },
        { item: 'Sahne', amount: '200', unit: 'ml', category: 'dairy' },
        { item: 'Mayonnaise', amount: '3', unit: 'EL', category: 'pantry' },
        { item: 'Essig, Zucker', amount: '2', unit: 'EL', category: 'pantry' }
      ]),
      steps: JSON.stringify([
        'Matjes, Rote Bete, Gurken, Zwiebeln und Äpfel in kleine Würfel schneiden.',
        'Alles vermengen.',
        'Sahne mit Mayonnaise, Essig und Zucker verrühren.',
        'Soße unterheben und 24 Stunden durchziehen lassen.'
      ]),
      category: 'salat',
      tags: JSON.stringify(['festlich', 'fisch', 'silvester']),
      image_url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800',
      servings: 6,
      prep_time: 30,
      cook_time: 0,
      source_url: null
    },
    {
      title: 'Königsberger Klopse',
      description: 'Klassische Fleischbällchen in Kapernsoße, stammt aus dem 19. Jahrhundert.',
      ingredients: JSON.stringify([
        { item: 'Hackfleisch (gemischt)', amount: '500', unit: 'g', category: 'meat' },
        { item: 'Zwiebeln', amount: '1', unit: 'Stk', category: 'produce' },
        { item: 'Brötchen (alt)', amount: '1', unit: 'Stk', category: 'bakery' },
        { item: 'Milch', amount: '100', unit: 'ml', category: 'dairy' },
        { item: 'Ei', amount: '1', unit: 'Stk', category: 'dairy' },
        { item: 'Mehl', amount: '40', unit: 'g', category: 'pantry' },
        { item: 'Butter', amount: '40', unit: 'g', category: 'dairy' },
        { item: 'Brühe', amount: '300', unit: 'ml', category: 'pantry' },
        { item: 'Sahne', amount: '100', unit: 'ml', category: 'dairy' },
        { item: 'Kapern', amount: '2', unit: 'EL', category: 'pantry' },
        { item: 'Zitronensaft', amount: '1', unit: 'EL', category: 'produce' }
      ]),
      steps: JSON.stringify([
        'Brötchen in Milch einweichen.',
        'Hack mit ausgedrücktem Brötchen, Ei, Salz und Pfeffer verkneten.',
        'Klößchen formen und in Salzwasser 15 Min. ziehen lassen.',
        'Soße: Butter und Mehl anschwitzen, Brühe und Sahne angießen, 10 Min. köcheln.',
        'Kapern und Zitronensaft zur Soße geben, Klößchen dazu und erwärmen.'
      ]),
      category: 'hauptgericht',
      tags: JSON.stringify(['deutsch', 'klassisch', 'fleisch']),
      image_url: 'https://images.unsplash.com/photo-1574653853027-5382a3d23a15?w=800',
      servings: 4,
      prep_time: 25,
      cook_time: 30,
      source_url: null
    },
    {
      title: 'Apfelstrudel',
      description: 'Wiener Apfelstrudel mit Vanillesoße – ein klassisches Mehlspeis.',
      ingredients: JSON.stringify([
        { item: 'Strudelteig', amount: '1', unit: 'Rolle', category: 'pantry' },
        { item: 'Äpfel (säuerlich)', amount: '1', unit: 'kg', category: 'produce' },
        { item: 'Zucker', amount: '120', unit: 'g', category: 'pantry' },
        { item: 'Rosinen', amount: '50', unit: 'g', category: 'pantry' },
        { item: 'Rum', amount: '2', unit: 'EL', category: 'pantry' },
        { item: 'Zimt', amount: '1', unit: 'TL', category: 'pantry' },
        { item: 'Semmelbrösel', amount: '3', unit: 'EL', category: 'pantry' },
        { item: 'Butter', amount: '50', unit: 'g', category: 'dairy' },
        { item: 'Puderzucker', amount: '2', unit: 'EL', category: 'pantry' }
      ]),
      steps: JSON.stringify([
        'Äpfel schälen, entkernen und in dünne Spalten schneiden.',
        'Mit Zucker, Rum, Zimt und Rosinen mischen.',
        'Semmelbrösel in Butter goldbraun rösten.',
        'Strudelteig auslegen, Brösel, dann Äpfel darauf verteilen, einrollen.',
        'Bei 180°C Umluft 40 Min. backen, mit Puderzucker bestäuben.'
      ]),
      category: 'dessert',
      tags: JSON.stringify(['österreich', 'dessert', 'backen']),
      image_url: 'https://images.unsplash.com/photo-1568571780762-4c1df3e4ba90?w=800',
      servings: 8,
      prep_time: 30,
      cook_time: 40,
      source_url: null
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO recipes (title, description, ingredients, steps, category, tags, image_url, servings, prep_time, cook_time, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of recipes) {
    stmt.run(r.title, r.description, r.ingredients, r.steps, r.category, r.tags, r.image_url, r.servings, r.prep_time, r.cook_time, r.source_url);
  }

  console.log('🌿 Seeded 5 test recipes');
}