-- Mwamba POS relational schema
-- The local MVP uses SQLite; these types and constraints map cleanly to PostgreSQL.

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    location TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    buying_price DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (buying_price >= 0),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gas_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,
    size_kg INTEGER NOT NULL CHECK (size_kg > 0),
    full_quantity INTEGER NOT NULL DEFAULT 0 CHECK (full_quantity >= 0),
    empty_quantity INTEGER NOT NULL DEFAULT 0 CHECK (empty_quantity >= 0),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    refill_price DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (refill_price >= 0),
    package_price DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (package_price >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 3 CHECK (reorder_level >= 0),
    UNIQUE (brand, size_kg)
);

CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id),
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    amount_paid DECIMAL(10, 2) NOT NULL CHECK (amount_paid >= 0),
    balance DECIMAL(10, 2) NOT NULL CHECK (balance >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('M-Pesa', 'Cash', 'Split / Hybrid')),
    status TEXT NOT NULL CHECK (status IN ('PAID', 'PARTIAL', 'CREDIT')),
    credit_sale BOOLEAN NOT NULL DEFAULT FALSE,
    mpesa_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (mpesa_amount >= 0),
    cash_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
    recorded_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER REFERENCES products(id),
    gas_id INTEGER REFERENCES gas_inventory(id),
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id),
    sale_id INTEGER REFERENCES sales(id),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('M-Pesa', 'Cash')),
    reference TEXT,
    notes TEXT,
    recorded_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    gas_id INTEGER REFERENCES gas_inventory(id),
    movement_type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_gas ON inventory_movements(gas_id);
