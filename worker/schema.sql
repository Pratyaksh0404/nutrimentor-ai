-- NutriMentor AI — D1 Schema + Seed
-- Run: wrangler d1 execute nutrimentor-db --file=schema.sql --remote

CREATE TABLE IF NOT EXISTS nutrients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  calories_per_100g REAL NOT NULL,
  season TEXT NOT NULL,
  scientific_name TEXT,
  image_url TEXT,
  ritu_note TEXT
);

CREATE TABLE IF NOT EXISTS item_nutrients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  nutrient_id INTEGER NOT NULL REFERENCES nutrients(id),
  amount_per_100g REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS rda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nutrient_name TEXT NOT NULL UNIQUE,
  daily_amount REAL NOT NULL,
  unit TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  age INTEGER,
  sex TEXT,
  height_cm REAL,
  weight_kg REAL,
  goal TEXT,
  activity_level TEXT,
  dietary_preference TEXT,
  allergies TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id),
  title TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  task_type TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meal_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES profiles(id),
  logged_date TEXT NOT NULL,
  item_id INTEGER REFERENCES items(id),
  amount_g REAL DEFAULT 100,
  meal_slot TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_item_nutrients_item ON item_nutrients(item_id);
CREATE INDEX IF NOT EXISTS idx_item_nutrients_nutrient ON item_nutrients(nutrient_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_meal_logs_profile_date ON meal_logs(profile_id, logged_date);

-- Nutrients
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Calcium', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Carbohydrates', 'g');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Fat', 'g');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Fiber', 'g');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Folate', 'ug');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Iron', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Magnesium', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Phosphorus', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Potassium', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Protein', 'g');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Sodium', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Sugar', 'g');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Vitamin A', 'ug');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Vitamin B6', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Vitamin C', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Vitamin D', 'ug');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Vitamin E', 'mg');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Vitamin K', 'ug');
INSERT OR IGNORE INTO nutrients (name, unit) VALUES ('Zinc', 'mg');

-- RDA values (ICMR-NIN 2020)
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Vitamin C', 65, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Iron', 17, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Calcium', 1000, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Potassium', 3500, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Fiber', 30, 'g');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Vitamin A', 900, 'ug');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Vitamin B6', 1.5, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Magnesium', 340, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Folate', 400, 'ug');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Vitamin E', 15, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Zinc', 12, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Phosphorus', 700, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Protein', 55, 'g');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Carbohydrates', 300, 'g');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Fat', 60, 'g');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Sodium', 2000, 'mg');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Vitamin D', 15, 'ug');
INSERT OR IGNORE INTO rda (nutrient_name, daily_amount, unit) VALUES ('Vitamin K', 120, 'ug');

-- Foods (57 items)
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Apple', 'fruit', 52, 'winter', 'Malus domestica', '/images/apple.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Orange', 'fruit', 47, 'winter', 'Citrus sinensis', '/images/orange.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Banana', 'fruit', 89, 'summer', 'Musa acuminata', '/images/banana.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Mango', 'fruit', 60, 'summer', 'Mangifera indica', '/images/mango.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Watermelon', 'fruit', 30, 'summer', 'Citrullus lanatus', '/images/watermelon.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Grape', 'fruit', 69, 'autumn', 'Vitis vinifera', '/images/grape.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Guava', 'fruit', 68, 'winter', 'Psidium guajava', '/images/guava.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Papaya', 'fruit', 43, 'summer', 'Carica papaya', '/images/papaya.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Pomegranate', 'fruit', 83, 'autumn', 'Punica granatum', '/images/pomegranate.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Litchi', 'fruit', 66, 'summer', 'Litchi chinensis', '/images/litchi.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Amla', 'fruit', 44, 'winter', 'Phyllanthus emblica', '/images/amla.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Pineapple', 'fruit', 50, 'summer', 'Ananas comosus', '/images/pineapple.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Pear', 'fruit', 57, 'autumn', 'Pyrus communis', '/images/pear.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Dates', 'fruit', 277, 'prewinter', 'Phoenix dactylifera', '/images/dates.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Jamun', 'fruit', 60, 'monsoon', 'Syzygium cumini', '/images/jamun.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Plum', 'fruit', 46, 'monsoon', 'Prunus domestica', '/images/plum.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Peach', 'fruit', 39, 'spring', 'Prunus persica', '/images/peach.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Strawberry', 'fruit', 32, 'spring', 'Fragaria ananassa', '/images/strawberry.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Spinach', 'vegetable', 23, 'winter', 'Spinacia oleracea', '/images/spinach.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Broccoli', 'vegetable', 34, 'winter', 'Brassica oleracea var. italica', '/images/broccoli.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Carrot', 'vegetable', 41, 'winter', 'Daucus carota', '/images/carrot.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Tomato', 'vegetable', 18, 'summer', 'Solanum lycopersicum', '/images/tomato.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Cucumber', 'vegetable', 15, 'summer', 'Cucumis sativus', '/images/cucumber.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Cabbage', 'vegetable', 25, 'winter', 'Brassica oleracea var. capitata', '/images/cabbage.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Cauliflower', 'vegetable', 25, 'winter', 'Brassica oleracea var. botrytis', '/images/cauliflower.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Beetroot', 'vegetable', 43, 'winter', 'Beta vulgaris', '/images/beetroot.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Bell Pepper', 'vegetable', 31, 'summer', 'Capsicum annuum', '/images/bell_pepper.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Onion', 'vegetable', 40, 'all', 'Allium cepa', '/images/onion.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Sweet Potato', 'vegetable', 86, 'winter', 'Ipomoea batatas', '/images/sweet_potato.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Pumpkin', 'vegetable', 26, 'autumn', 'Cucurbita pepo', '/images/pumpkin.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Bitter Gourd', 'vegetable', 17, 'monsoon', 'Momordica charantia', '/images/bitter_gourd.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Ridge Gourd', 'vegetable', 20, 'monsoon', 'Luffa acutangula', '/images/ridge_gourd.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Bottle Gourd', 'vegetable', 14, 'monsoon', 'Lagenaria siceraria', '/images/bottle_gourd.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Mustard Greens', 'vegetable', 26, 'prewinter', 'Brassica juncea', '/images/mustard_greens.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Fenugreek Leaves', 'vegetable', 49, 'prewinter', 'Trigonella foenum-graecum', '/images/fenugreek_leaves.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Green Peas', 'vegetable', 81, 'spring', 'Pisum sativum', '/images/green_peas.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Oats', 'grain', 389, 'winter', 'Avena sativa', '/images/oats.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Brown Rice', 'grain', 123, 'autumn', 'Oryza sativa', '/images/brown_rice.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Wheat', 'grain', 340, 'spring', 'Triticum aestivum', '/images/wheat.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Bajra', 'grain', 361, 'monsoon', 'Pennisetum glaucum', '/images/bajra.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Jowar', 'grain', 349, 'monsoon', 'Sorghum bicolor', '/images/jowar.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Lentils', 'legume', 116, 'winter', 'Lens culinaris', '/images/lentils.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Chickpeas', 'legume', 164, 'winter', 'Cicer arietinum', '/images/chickpeas.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Rajma', 'legume', 127, 'winter', 'Phaseolus vulgaris', '/images/rajma.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Moong Dal', 'legume', 105, 'monsoon', 'Vigna radiata', '/images/moong_dal.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Soybean', 'legume', 173, 'all', 'Glycine max', '/images/soybean.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Almonds', 'nut', 579, 'autumn', 'Prunus dulcis', '/images/almonds.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Walnuts', 'nut', 654, 'autumn', 'Juglans regia', '/images/walnuts.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Peanuts', 'nut', 567, 'prewinter', 'Arachis hypogaea', '/images/peanuts.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Sesame Seeds', 'nut', 573, 'prewinter', 'Sesamum indicum', '/images/sesame_seeds.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Milk', 'dairy', 61, 'all', 'Bos taurus milk', '/images/milk.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Curd', 'dairy', 98, 'all', 'Lactobacillus delbrueckii yogurt', '/images/curd.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Paneer', 'dairy', 265, 'all', 'Fresh Indian cheese', '/images/paneer.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Egg', 'protein', 155, 'all', 'Gallus gallus domesticus', '/images/egg.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Chicken Breast', 'protein', 165, 'all', 'Gallus gallus domesticus', '/images/chicken_breast.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Salmon', 'protein', 208, 'summer', 'Salmo salar', '/images/salmon.png', NULL);
INSERT OR IGNORE INTO items (name, category, calories_per_100g, season, scientific_name, image_url, ritu_note)
  VALUES ('Tofu', 'protein', 76, 'all', 'Glycine max curd', '/images/tofu.png', NULL);

-- Item nutrients (linked by name lookup)
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.6 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.4 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 107 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.04 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.8 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.4 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Apple' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 53.2 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 30 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 181 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.07 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 40 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.4 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11.8 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.4 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0 FROM items i, nutrients n WHERE i.name = 'Orange' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.7 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 358 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 27 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 22 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.15 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.6 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 22.8 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12.2 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.1 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Banana' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 36.4 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 54 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Vitamin E';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 43 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 168 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.09 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.6 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.7 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.8 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Mango' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.1 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 28 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 112 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.6 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.2 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.6 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Watermelon' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.2 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14.6 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 191 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.04 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 18.1 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15.5 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.7 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Grape' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 228.3 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 31 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 49 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 417 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 22 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 40 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 18 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.4 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14.3 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.9 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.0 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.6 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.26 FROM items i, nutrients n WHERE i.name = 'Guava' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 61.8 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 47 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 37 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 182 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 21 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.7 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.8 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.8 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.25 FROM items i, nutrients n WHERE i.name = 'Papaya' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.2 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16.4 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 38 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 236 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 36 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.0 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 18.7 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.7 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.2 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.7 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Pomegranate' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 71.5 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 171 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 31 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.3 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16.5 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15.2 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.8 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.31 FROM items i, nutrients n WHERE i.name = 'Litchi' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 600 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.2 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 50 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 27 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 198 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.4 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.2 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.0 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.6 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Amla' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 47.8 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 18 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 109 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.4 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.1 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.9 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.29 FROM items i, nutrients n WHERE i.name = 'Pineapple' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.3 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.4 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 116 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.1 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15.2 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.8 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.18 FROM items i, nutrients n WHERE i.name = 'Pear' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 696 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 54 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 62 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 64 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.7 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 74.97 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 63.4 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.8 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.165 FROM items i, nutrients n WHERE i.name = 'Dates' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14.3 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.19 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 19 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 79 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 17 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.6 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14.0 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12.0 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.23 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.72 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 26 FROM items i, nutrients n WHERE i.name = 'Jamun' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.5 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 17 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.4 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 157 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.4 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11.4 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.9 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.7 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.17 FROM items i, nutrients n WHERE i.name = 'Plum' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.6 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 190 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.5 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.5 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.4 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.25 FROM items i, nutrients n WHERE i.name = 'Peach' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 58.8 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 24 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 153 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 24 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.0 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.7 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.9 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.7 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.41 FROM items i, nutrients n WHERE i.name = 'Strawberry' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.7 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 469 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 28.1 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 483 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 194 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 99 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 79 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 558 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 49 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.2 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.9 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.6 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 79 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.53 FROM items i, nutrients n WHERE i.name = 'Spinach' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 89.2 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 101.6 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 63 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 47 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.73 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 21 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 316 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 66 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.6 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.8 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.6 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 33 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.41 FROM items i, nutrients n WHERE i.name = 'Broccoli' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 835 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.9 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.2 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 19 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 33 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 320 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 35 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.8 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.6 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.7 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 69 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.24 FROM items i, nutrients n WHERE i.name = 'Carrot' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.7 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 42 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.9 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.27 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 237 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 24 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.2 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.9 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.6 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.17 FROM items i, nutrients n WHERE i.name = 'Tomato' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.8 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16.4 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.28 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 147 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 24 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.65 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.6 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.7 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Cucumber' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 36.6 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 76 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 43 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 40 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.47 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 170 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 26 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.5 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.3 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.8 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.2 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 18 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.18 FROM items i, nutrients n WHERE i.name = 'Cabbage' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 48.2 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15.5 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 57 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 22 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.42 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 299 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 44 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.0 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.9 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.0 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.9 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 30 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.27 FROM items i, nutrients n WHERE i.name = 'Cauliflower' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 109 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.9 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.8 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 23 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 325 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 40 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.8 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.6 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.9 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.8 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 78 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.35 FROM items i, nutrients n WHERE i.name = 'Beetroot' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 127.7 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 157 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.291 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 46 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.43 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 211 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 26 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.1 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.0 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.0 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.2 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.25 FROM items i, nutrients n WHERE i.name = 'Bell Pepper' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.4 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.12 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 19 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 23 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.21 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 146 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 29 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.7 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.1 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.3 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.2 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.17 FROM items i, nutrients n WHERE i.name = 'Onion' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 961 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.4 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.29 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 30 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.61 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 25 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 337 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 47 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.0 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.6 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20.1 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.2 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 55 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Sweet Potato' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 426 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.0 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.06 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Vitamin E';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 21 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.8 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 340 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 44 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.0 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.5 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.8 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.32 FROM items i, nutrients n WHERE i.name = 'Pumpkin' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 84 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 68 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 72 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 19 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.43 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 17 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 296 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 31 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.8 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.0 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.7 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.8 FROM items i, nutrients n WHERE i.name = 'Bitter Gourd' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 18 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 139 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 29 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.3 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3 FROM items i, nutrients n WHERE i.name = 'Ridge Gourd' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 26 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.2 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 150 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.6 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.4 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Bottle Gourd' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 70 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 524 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 593 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 187 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 115 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.46 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 32 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 384 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 58 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.2 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.7 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.7 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.25 FROM items i, nutrients n WHERE i.name = 'Mustard Greens' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 220 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 297 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.93 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 395 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 37 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 458 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 51 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.1 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.4 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.0 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 67 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 57 FROM items i, nutrients n WHERE i.name = 'Fenugreek Leaves' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 40 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 24.8 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 65 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.47 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 25 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 33 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 244 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 108 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.1 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.4 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14.5 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.7 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.24 FROM items i, nutrients n WHERE i.name = 'Green Peas' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16.9 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.6 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.72 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 54 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 177 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 523 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 429 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.97 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.12 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 56 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 66.3 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.9 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.42 FROM items i, nutrients n WHERE i.name = 'Oats' AND n.name = 'Vitamin E';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.7 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.8 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.53 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 44 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 83 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 79 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.71 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 25.6 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.97 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5 FROM items i, nutrients n WHERE i.name = 'Brown Rice' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.7 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12.2 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.6 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 34 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 138 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 357 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 405 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.93 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 44 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 71.2 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.5 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Wheat' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11.6 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.2 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.0 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 42 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 137 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 296 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 307 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.1 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 67.5 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.0 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.9 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.38 FROM items i, nutrients n WHERE i.name = 'Bajra' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.4 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.3 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.1 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 28 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 165 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 287 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 350 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.67 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 72.6 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.3 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6 FROM items i, nutrients n WHERE i.name = 'Jowar' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.0 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.9 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.3 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 19 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 36 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 180 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 369 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.27 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 181 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20.1 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Lentils' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.9 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.6 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.9 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 49 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 48 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 168 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 291 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.53 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 172 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 27.4 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.6 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.14 FROM items i, nutrients n WHERE i.name = 'Chickpeas' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.7 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.4 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.94 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 50 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 45 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 142 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 405 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.07 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 130 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 22.8 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Rajma' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.0 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.6 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.8 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 27 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 48 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 99 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 266 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.84 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 159 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 19.2 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.4 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.0 FROM items i, nutrients n WHERE i.name = 'Moong Dal' AND n.name = 'Vitamin C';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16.6 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.0 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.14 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 145 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 65 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 245 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 515 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.99 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 165 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.9 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 9.0 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 47.3 FROM items i, nutrients n WHERE i.name = 'Soybean' AND n.name = 'Vitamin K';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 21.2 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12.5 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 25.6 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Vitamin E';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.71 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 264 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 270 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 481 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 733 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.12 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 50 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 21.6 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 49.9 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.14 FROM items i, nutrients n WHERE i.name = 'Almonds' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15.2 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 6.7 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.7 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Vitamin E';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.91 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 98 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 158 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 346 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 441 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.09 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 98 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.7 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 65.2 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2 FROM items i, nutrients n WHERE i.name = 'Walnuts' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 25.8 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.5 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.33 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Vitamin E';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.58 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 92 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 168 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 376 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 705 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.27 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 240 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 16.1 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 49.2 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 18 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.35 FROM items i, nutrients n WHERE i.name = 'Peanuts' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 17.7 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11.8 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 14.55 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 975 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 351 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 629 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 468 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7.75 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 97 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 23.5 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 49.7 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.25 FROM items i, nutrients n WHERE i.name = 'Sesame Seeds' AND n.name = 'Vitamin E';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.4 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 113 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.2 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Vitamin D';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.04 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.03 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 84 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 150 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.38 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.3 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.8 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.1 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 43 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5 FROM items i, nutrients n WHERE i.name = 'Milk' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11.0 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 121 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.6 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Vitamin D';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.06 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.05 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 11 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 135 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 155 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.52 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.0 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.6 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.2 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Sugar';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 46 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Curd' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 18.3 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 480 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 138 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 56 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.0 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20.8 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.2 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 23 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.5 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Vitamin D';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10 FROM items i, nutrients n WHERE i.name = 'Paneer' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.0 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 2.0 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Vitamin D';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 160 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Vitamin A';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.17 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.75 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 56 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 198 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 138 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.29 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.6 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.1 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 47 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 124 FROM items i, nutrients n WHERE i.name = 'Egg' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 31.0 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.9 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.04 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 29 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 220 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 256 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.0 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 3.6 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 74 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4 FROM items i, nutrients n WHERE i.name = 'Chicken Breast' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 20.0 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 10.0 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Vitamin D';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.94 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Vitamin B6';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.8 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 12 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 29 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 252 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 363 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.64 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 13.4 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 59 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 25 FROM items i, nutrients n WHERE i.name = 'Salmon' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 8.0 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Protein';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 350 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Calcium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 5.36 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Iron';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 30 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Magnesium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 97 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Phosphorus';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 121 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Potassium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.8 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Zinc';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 4.8 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Fat';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 1.9 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Carbohydrates';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.3 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Fiber';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 7 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Sodium';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 15 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Folate';
INSERT OR IGNORE INTO item_nutrients (item_id, nutrient_id, amount_per_100g) SELECT i.id, n.id, 0.1 FROM items i, nutrients n WHERE i.name = 'Tofu' AND n.name = 'Vitamin D';