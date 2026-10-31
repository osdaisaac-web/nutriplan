CREATE TABLE IF NOT EXISTS push_subscriptions (
 endpoint TEXT PRIMARY KEY, subscription_json TEXT NOT NULL,
 meals_enabled INTEGER NOT NULL DEFAULT 1, photos_enabled INTEGER NOT NULL DEFAULT 1,
 motivation_enabled INTEGER NOT NULL DEFAULT 1, motivation_hour INTEGER NOT NULL DEFAULT 8,
 motivation_minute INTEGER NOT NULL DEFAULT 30, timezone TEXT NOT NULL DEFAULT 'America/Bogota',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meal_plans (
 endpoint TEXT NOT NULL, local_date TEXT NOT NULL, meal_key TEXT NOT NULL,
 title TEXT NOT NULL, protein TEXT NOT NULL, carbohydrate TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(endpoint,local_date,meal_key)
);
CREATE TABLE IF NOT EXISTS meal_photo_logs (
 endpoint TEXT NOT NULL, local_date TEXT NOT NULL, meal_key TEXT NOT NULL,
 title TEXT NOT NULL, protein TEXT NOT NULL, carbohydrate TEXT NOT NULL, completed_at TEXT NOT NULL,
 PRIMARY KEY(endpoint,local_date,meal_key)
);
CREATE TABLE IF NOT EXISTS push_deliveries (
 endpoint TEXT NOT NULL, delivery_key TEXT NOT NULL, delivered_at TEXT NOT NULL,
 PRIMARY KEY(endpoint,delivery_key)
);
CREATE INDEX IF NOT EXISTS idx_meal_plans_date ON meal_plans(local_date);
CREATE INDEX IF NOT EXISTS idx_meal_photo_logs_date ON meal_photo_logs(local_date);
