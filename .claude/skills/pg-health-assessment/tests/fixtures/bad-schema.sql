-- Deliberately flawed schema for a DISPOSABLE local database (pgha_test_*). All data is generated and fake.

-- varchar(255) + timestamp without time zone
CREATE TABLE customers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email varchar(255) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

-- unindexed foreign key, real used for a price, unused non-unique index
CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers(id),
  status text,
  price real NOT NULL,
  placed_at timestamptz DEFAULT now()
);
CREATE INDEX idx_orders_status_unused ON orders (status);

-- duplicate index
CREATE INDEX idx_customers_email_a ON customers (email);
CREATE INDEX idx_customers_email_b ON customers (email);

-- no primary key
CREATE TABLE audit_log (
  event text,
  at timestamptz DEFAULT now()
);

-- random UUIDv4 primary key
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id bigint,
  data text
);

-- json (not jsonb) column with small payloads -> expected "watch"
CREATE TABLE legacy_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meta json
);
INSERT INTO legacy_events (meta) SELECT json_build_object('a', g, 'b', 'fake') FROM generate_series(1, 50) g;

-- bloated jsonb column -> expected "split": 60+ keys, depth 5, unbounded array of objects, payloads above 20 KB
CREATE TABLE documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body jsonb
);
INSERT INTO documents (body)
SELECT
  (SELECT jsonb_object_agg('key_' || k, 'fake-value-' || k) FROM generate_series(1, 60) k)
  || jsonb_build_object('nest', jsonb_build_object('a', jsonb_build_object('b', jsonb_build_object('c', jsonb_build_object('d', 'deep')))))
  || jsonb_build_object('items', (SELECT jsonb_agg(jsonb_build_object('n', i, 'label', 'fake-label-' || i, 'pad', md5(random()::text) || md5(random()::text) || md5(random()::text))) FROM generate_series(1, 400) i))
FROM generate_series(1, 100) r;

INSERT INTO customers (email) SELECT 'user' || g || '@example.invalid' FROM generate_series(1, 20) g;
INSERT INTO orders (customer_id, status, price) SELECT 1 + (g % 20), 'new', 9.99 FROM generate_series(1, 40) g;

ANALYZE;
