-- 1. Create the products table
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  price       NUMERIC(10, 2) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION notify_cache_invalidation()
RETURNS trigger AS $$
DECLARE
  payload JSON;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    payload := json_build_object('op', TG_OP, 'id', OLD.id);
  ELSE
    payload := json_build_object('op', TG_OP, 'id', NEW.id);
  END IF;

  PERFORM pg_notify('cache_invalidation', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach the trigger to the products table
CREATE OR REPLACE TRIGGER products_cache_invalidation_trigger
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidation();

-- 4. Seed demo data
INSERT INTO products (name, price) VALUES
  ('Widget A', 9.99),
  ('Widget B', 19.99),
  ('Widget C', 4.49);