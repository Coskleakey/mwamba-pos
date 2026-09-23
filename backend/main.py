from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
import hashlib
import hmac
import json
import os
import secrets
import sqlite3

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", BASE_DIR / "mwamba_pos.db"))
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-development-secret")

app = FastAPI(title="Mwamba POS API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SaleItem(BaseModel):
    product_id: int | None = None
    gas_id: int | None = None
    quantity: int = Field(gt=0)


class SaleCreate(BaseModel):
    customer_id: int | None = None
    items: list[SaleItem] = Field(min_length=1)
    payment_method: Literal["M-Pesa", "Cash", "Split / Hybrid"]
    amount_paid: float = Field(ge=0)
    mpesa_amount: float = Field(default=0, ge=0)
    cash_amount: float = Field(default=0, ge=0)
    mpesa_reference: str | None = None
    gas_sale_mode: Literal["exchange", "package"] | None = None
    returned_gas_id: int | None = None


class GasExchangeCreate(BaseModel):
    customer_id: int | None = None
    gas_id: int
    quantity: int = Field(gt=0)
    payment_method: Literal["M-Pesa", "Cash"]
    amount_paid: float = Field(ge=0)
    mpesa_reference: str | None = None


class PaymentCreate(BaseModel):
    customer_id: int
    amount: float = Field(gt=0)
    payment_method: Literal["M-Pesa", "Cash"]
    mpesa_reference: str | None = None
    notes: str | None = None


class CustomerCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=7, max_length=30)


class GasBrandCreate(BaseModel):
    brand: str = Field(min_length=2, max_length=60)
    size_kg: Literal[6, 13, 35, 50]
    refill_price: float = Field(ge=0)
    package_price: float = Field(ge=0)
    full_quantity: int = Field(ge=0)
    empty_quantity: int = Field(ge=0)


class GasDetailsUpdate(BaseModel):
    brand: str = Field(min_length=2, max_length=60)
    size_kg: Literal[6, 13, 35, 50]
    refill_price: float = Field(ge=0)
    package_price: float = Field(ge=0)
    full_quantity: int = Field(ge=0)
    empty_quantity: int = Field(ge=0)


class GasRestock(BaseModel):
    full_quantity: int = Field(ge=0)
    empty_quantity: int = Field(ge=0)


class LoginRequest(BaseModel):
    email: str
    password: str


class StaffCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str
    password: str = Field(min_length=8)


class StaffStatusUpdate(BaseModel):
    active: bool


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"{salt}${digest.hex()}"


def create_token(user: sqlite3.Row) -> str:
    role = "admin" if user["role"] in ("admin", "owner") else "cashier"
    payload = {"user_id": user["id"], "role": role, "exp": int(datetime.now(timezone.utc).timestamp()) + 43200}
    body = json.dumps(payload, separators=(",", ":")).encode().hex()
    signature = hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    try:
        body, signature = authorization.removeprefix("Bearer ").split(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        payload = json.loads(bytes.fromhex(body))
        if payload["exp"] < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError
    except (ValueError, KeyError, json.JSONDecodeError):
        raise HTTPException(401, "Session expired or invalid")
    with closing(get_connection()) as connection:
        user = connection.execute("SELECT id, full_name, email, role, active FROM users WHERE id = ?", (payload["user_id"],)).fetchone()
    if not user or not user["active"]:
        raise HTTPException(401, "User account is inactive")
    result = dict(user)
    result["role"] = "admin" if result["role"] in ("admin", "owner") else "cashier"
    return result


def owner_only(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Only the business owner can manage staff")
    return user


def row_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row else None


def init_db() -> None:
    with closing(get_connection()) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'staff',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT,
                location TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                sku TEXT NOT NULL UNIQUE,
                price REAL NOT NULL CHECK (price >= 0),
                buying_price REAL NOT NULL DEFAULT 0 CHECK (buying_price >= 0),
                stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
                reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS gas_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                brand TEXT NOT NULL,
                size_kg INTEGER NOT NULL CHECK (size_kg > 0),
                full_quantity INTEGER NOT NULL DEFAULT 0 CHECK (full_quantity >= 0),
                empty_quantity INTEGER NOT NULL DEFAULT 0 CHECK (empty_quantity >= 0),
                price REAL NOT NULL CHECK (price >= 0),
                refill_price REAL NOT NULL DEFAULT 0 CHECK (refill_price >= 0),
                package_price REAL NOT NULL DEFAULT 0 CHECK (package_price >= 0),
                reorder_level INTEGER NOT NULL DEFAULT 3,
                UNIQUE (brand, size_kg)
            );
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_number TEXT NOT NULL UNIQUE,
                customer_id INTEGER REFERENCES customers(id),
                total REAL NOT NULL CHECK (total >= 0),
                amount_paid REAL NOT NULL CHECK (amount_paid >= 0),
                balance REAL NOT NULL CHECK (balance >= 0),
                payment_method TEXT NOT NULL,
                status TEXT NOT NULL,
                credit_sale INTEGER NOT NULL DEFAULT 0,
                mpesa_amount REAL NOT NULL DEFAULT 0 CHECK (mpesa_amount >= 0),
                cash_amount REAL NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
                recorded_by_user_id INTEGER REFERENCES users(id),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sale_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER NOT NULL REFERENCES sales(id),
                product_id INTEGER REFERENCES products(id),
                gas_id INTEGER REFERENCES gas_inventory(id),
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                unit_price REAL NOT NULL CHECK (unit_price >= 0)
            );
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER REFERENCES customers(id),
                sale_id INTEGER REFERENCES sales(id),
                amount REAL NOT NULL CHECK (amount > 0),
                payment_method TEXT NOT NULL,
                reference TEXT,
                notes TEXT,
                recorded_by_user_id INTEGER REFERENCES users(id),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS inventory_movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER REFERENCES products(id),
                gas_id INTEGER REFERENCES gas_inventory(id),
                movement_type TEXT NOT NULL,
                quantity_change INTEGER NOT NULL,
                previous_quantity INTEGER NOT NULL,
                new_quantity INTEGER NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        user_columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)").fetchall()}
        if "role" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff'")
        if "active" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
        payment_columns = {row["name"] for row in connection.execute("PRAGMA table_info(payments)").fetchall()}
        if "recorded_by_user_id" not in payment_columns:
            connection.execute("ALTER TABLE payments ADD COLUMN recorded_by_user_id INTEGER REFERENCES users(id)")
        sale_columns = {row["name"] for row in connection.execute("PRAGMA table_info(sales)").fetchall()}
        if "credit_sale" not in sale_columns:
            connection.execute("ALTER TABLE sales ADD COLUMN credit_sale INTEGER NOT NULL DEFAULT 0")
            connection.execute("UPDATE sales SET credit_sale = 1 WHERE status IN ('PARTIAL', 'CREDIT') OR balance > 0")
        if "mpesa_amount" not in sale_columns:
            connection.execute("ALTER TABLE sales ADD COLUMN mpesa_amount REAL NOT NULL DEFAULT 0")
            connection.execute("UPDATE sales SET mpesa_amount = amount_paid WHERE payment_method = 'M-Pesa'")
        if "cash_amount" not in sale_columns:
            connection.execute("ALTER TABLE sales ADD COLUMN cash_amount REAL NOT NULL DEFAULT 0")
            connection.execute("UPDATE sales SET cash_amount = amount_paid WHERE payment_method = 'Cash'")
        if "recorded_by_user_id" not in sale_columns:
            connection.execute("ALTER TABLE sales ADD COLUMN recorded_by_user_id INTEGER REFERENCES users(id)")
        gas_columns = {row["name"] for row in connection.execute("PRAGMA table_info(gas_inventory)").fetchall()}
        if "refill_price" not in gas_columns:
            connection.execute("ALTER TABLE gas_inventory ADD COLUMN refill_price REAL NOT NULL DEFAULT 0")
            connection.execute("UPDATE gas_inventory SET refill_price = price WHERE refill_price = 0")
        if "package_price" not in gas_columns:
            connection.execute("ALTER TABLE gas_inventory ADD COLUMN package_price REAL NOT NULL DEFAULT 0")
            connection.execute("UPDATE gas_inventory SET package_price = price WHERE package_price = 0")
        seed_database(connection)
        connection.commit()


def seed_database(connection: sqlite3.Connection) -> None:
    if connection.execute("SELECT COUNT(*) FROM customers").fetchone()[0] == 0:
        connection.executemany(
            "INSERT INTO customers (full_name, phone, location) VALUES (?, ?, ?)",
            [("John Kamau", "0712 345 678", "Kasarani"), ("Mary Wanjiku", "0722 456 789", "Roysambu"), ("Peter Otieno", "0701 234 567", "Zimmerman")],
        )
    if connection.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        connection.executemany(
            "INSERT INTO products (name, category, sku, price, buying_price, stock_quantity, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [("Smart LED TV 43\"", "Electronics", "TV-43-001", 28500, 24000, 5, 2), ("Bluetooth Radio", "Electronics", "RAD-001", 2200, 1500, 10, 3), ("Fast Charger", "Accessories", "CHG-001", 850, 500, 20, 5), ("Extension Cable", "Accessories", "EXT-001", 1200, 750, 15, 4), ("LED Bulb 12W", "Lighting", "BLB-001", 250, 130, 30, 8), ("Portable Speaker", "Electronics", "SPK-001", 3500, 2400, 3, 2)],
        )
    if connection.execute("SELECT COUNT(*) FROM gas_inventory").fetchone()[0] == 0:
        connection.executemany(
            "INSERT INTO gas_inventory (brand, size_kg, full_quantity, empty_quantity, price, refill_price, package_price, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [("K-Gas", 6, 14, 5, 1650, 1650, 2350, 3), ("K-Gas", 13, 20, 7, 3000, 3000, 4200, 4), ("Pro Gas", 6, 12, 4, 1600, 1600, 2300, 3), ("Pro Gas", 13, 8, 3, 2900, 2900, 4100, 3), ("Total", 13, 10, 6, 3100, 3100, 4300, 3)],
        )
    if connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        connection.execute("INSERT INTO users (email, full_name, password_hash, role) VALUES (?, ?, ?, 'owner')", ("admin@example.com", "Shop Admin", password_hash("ChangeMe123!")))
    else:
        connection.execute("UPDATE users SET role = 'owner' WHERE email = 'admin@example.com'")


def status_for(total: float, paid: float) -> str:
    if paid >= total:
        return "PAID"
    return "PARTIAL" if paid > 0 else "CREDIT"


def receipt_number(connection: sqlite3.Connection) -> str:
    next_id = connection.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM sales").fetchone()[0]
    return f"MW-{datetime.now().strftime('%Y%m%d')}-{next_id:04d}"


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Mwamba POS API is running"}


@app.get("/health")
def health_check() -> dict[str, str]:
    init_db()
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict[str, str]:
    init_db()
    with closing(get_connection()) as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ? AND active = 1", (payload.email,)).fetchone()
        if not user:
            raise HTTPException(401, "Invalid email or password")
        salt, expected = user["password_hash"].split("$", 1)
        if password_hash(payload.password, salt).split("$", 1)[1] != expected:
            raise HTTPException(401, "Invalid email or password")
        return {"token": create_token(user), "user_name": user["full_name"], "role": "admin" if user["role"] in ("admin", "owner") else "cashier"}


@app.get("/api/auth/me")
def me(user: dict = Depends(current_user)) -> dict:
    return user


@app.get("/api/staff")
def staff(_: dict = Depends(owner_only)) -> list[dict]:
    init_db()
    with closing(get_connection()) as connection:
        rows = connection.execute("SELECT id, full_name, email, role, active, created_at FROM users ORDER BY role DESC, full_name").fetchall()
        return [row_dict(row) for row in rows]


@app.post("/api/staff")
def create_staff(payload: StaffCreate, _: dict = Depends(owner_only)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        try:
            cursor = connection.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'staff')", (payload.full_name, payload.email.lower(), password_hash(payload.password)))
            connection.commit()
            return {"id": cursor.lastrowid, "full_name": payload.full_name, "email": payload.email.lower(), "role": "staff", "active": 1}
        except sqlite3.IntegrityError:
            raise HTTPException(409, "A user with that email already exists")


@app.patch("/api/staff/{user_id}")
def update_staff_status(user_id: int, payload: StaffStatusUpdate, _: dict = Depends(owner_only)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        if not connection.execute("SELECT id FROM users WHERE id = ? AND role = 'staff'", (user_id,)).fetchone():
            raise HTTPException(404, "Staff account not found")
        connection.execute("UPDATE users SET active = ? WHERE id = ?", (int(payload.active), user_id))
        connection.commit()
        return {"id": user_id, "active": payload.active}


@app.get("/api/dashboard")
def dashboard(_: dict = Depends(current_user)) -> dict:
    init_db()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with closing(get_connection()) as connection:
        summary = connection.execute("SELECT COALESCE(SUM(total), 0) sales, COUNT(*) transactions, COALESCE(SUM(mpesa_amount), 0) mpesa, COALESCE(SUM(cash_amount), 0) cash, COALESCE(SUM(balance), 0) credit FROM sales WHERE date(created_at) = date(?)", (today,)).fetchone()
        stock = connection.execute("SELECT COUNT(*) products, COALESCE(SUM(CASE WHEN stock_quantity <= reorder_level THEN 1 ELSE 0 END), 0) low_stock FROM products WHERE active = 1").fetchone()
        gas = connection.execute("SELECT COALESCE(SUM(full_quantity), 0) full_cylinders, COALESCE(SUM(empty_quantity), 0) empty_cylinders FROM gas_inventory").fetchone()
        recent = connection.execute("SELECT s.*, COALESCE(c.full_name, 'Walk-in customer') customer FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ORDER BY s.id DESC LIMIT 6").fetchall()
        debts = connection.execute("SELECT c.id, c.full_name customer, c.phone, COALESCE(SUM(s.balance), 0) balance, COALESCE(SUM(s.total), 0) total_purchases, COALESCE(SUM(s.amount_paid), 0) paid FROM customers c JOIN sales s ON s.customer_id = c.id AND s.credit_sale = 1 GROUP BY c.id ORDER BY balance DESC, customer LIMIT 100").fetchall()
        days = [(datetime.now() - timedelta(days=index)).strftime("%Y-%m-%d") for index in range(6, -1, -1)]
        sales_trend = []
        for day in days:
            value = connection.execute("SELECT COALESCE(SUM(total), 0) FROM sales WHERE date(created_at) = date(?)", (day,)).fetchone()[0]
            sales_trend.append({"date": day[-5:], "value": value})
        debt_rows = []
        for debt in debts:
            item = row_dict(debt)
            item["status"] = "CLEARED" if item["balance"] == 0 else ("PARTIAL" if item["paid"] > 0 else "OUTSTANDING")
            debt_rows.append(item)
        return {"summary": row_dict(summary), "inventory": {**row_dict(stock), **row_dict(gas)}, "recent_sales": [row_dict(item) for item in recent], "debts": debt_rows, "sales_trend": sales_trend}


@app.get("/api/products")
def products(search: str = Query(""), _: dict = Depends(current_user)) -> list[dict]:
    init_db()
    with closing(get_connection()) as connection:
        rows = connection.execute("SELECT id, name, category, sku, price, buying_price, stock_quantity, reorder_level, 0 is_gas, NULL gas_id FROM products WHERE active = 1 AND (name LIKE ? OR category LIKE ? OR sku LIKE ?)", (f"%{search}%", f"%{search}%", f"%{search}%")).fetchall()
        gas_rows = connection.execute("SELECT id, brand || ' ' || size_kg || 'kg Gas' name, 'LPG Gas' category, 'GAS-' || id sku, refill_price price, refill_price buying_price, full_quantity stock_quantity, reorder_level, 1 is_gas, id gas_id FROM gas_inventory WHERE brand LIKE ? OR CAST(size_kg AS TEXT) LIKE ?", (f"%{search}%", f"%{search}%")).fetchall()
        return [row_dict(row) for row in rows] + [row_dict(row) for row in gas_rows]


@app.get("/api/gas")
def gas_inventory(_: dict = Depends(current_user)) -> list[dict]:
    init_db()
    with closing(get_connection()) as connection:
        return [row_dict(row) for row in connection.execute("SELECT * FROM gas_inventory ORDER BY brand, size_kg").fetchall()]


@app.post("/api/gas")
def create_gas_brand(payload: GasBrandCreate, _: dict = Depends(current_user)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        try:
            cursor = connection.execute("INSERT INTO gas_inventory (brand, size_kg, full_quantity, empty_quantity, price, refill_price, package_price, reorder_level) VALUES (?, ?, ?, ?, ?, ?, ?, 3)", (payload.brand.strip(), payload.size_kg, payload.full_quantity, payload.empty_quantity, payload.refill_price, payload.refill_price, payload.package_price))
            connection.commit()
            return row_dict(connection.execute("SELECT * FROM gas_inventory WHERE id = ?", (cursor.lastrowid,)).fetchone())
        except sqlite3.IntegrityError:
            raise HTTPException(409, "That gas brand and size already exists")


@app.patch("/api/gas/{gas_id}")
def update_gas_details(gas_id: int, payload: GasDetailsUpdate, _: dict = Depends(owner_only)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        try:
            connection.execute("UPDATE gas_inventory SET brand = ?, size_kg = ?, refill_price = ?, package_price = ?, price = ?, full_quantity = ?, empty_quantity = ? WHERE id = ?", (payload.brand.strip(), payload.size_kg, payload.refill_price, payload.package_price, payload.refill_price, payload.full_quantity, payload.empty_quantity, gas_id))
            if connection.total_changes == 0:
                raise HTTPException(404, "Gas cylinder type not found")
            connection.commit()
            return row_dict(connection.execute("SELECT * FROM gas_inventory WHERE id = ?", (gas_id,)).fetchone())
        except sqlite3.IntegrityError:
            raise HTTPException(409, "That gas brand and size already exists")


@app.post("/api/gas/{gas_id}/restock")
def restock_gas(gas_id: int, payload: GasRestock, user: dict = Depends(current_user)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        gas = connection.execute("SELECT * FROM gas_inventory WHERE id = ?", (gas_id,)).fetchone()
        if not gas:
            raise HTTPException(404, "Gas cylinder type not found")
        connection.execute("BEGIN")
        connection.execute("UPDATE gas_inventory SET full_quantity = full_quantity + ?, empty_quantity = empty_quantity + ? WHERE id = ?", (payload.full_quantity, payload.empty_quantity, gas_id))
        if payload.full_quantity:
            connection.execute("INSERT INTO inventory_movements (gas_id, movement_type, quantity_change, previous_quantity, new_quantity, notes) VALUES (?, 'GAS_RESTOCK_FULL', ?, ?, ?, ?)", (gas_id, payload.full_quantity, gas["full_quantity"], gas["full_quantity"] + payload.full_quantity, f"Restocked by user {user['id']}"))
        if payload.empty_quantity:
            connection.execute("INSERT INTO inventory_movements (gas_id, movement_type, quantity_change, previous_quantity, new_quantity, notes) VALUES (?, 'GAS_RESTOCK_EMPTY', ?, ?, ?, ?)", (gas_id, payload.empty_quantity, gas["empty_quantity"], gas["empty_quantity"] + payload.empty_quantity, f"Restocked by user {user['id']}"))
        connection.commit()
        return row_dict(connection.execute("SELECT * FROM gas_inventory WHERE id = ?", (gas_id,)).fetchone())


@app.get("/api/customers")
def customers(search: str = Query(""), _: dict = Depends(current_user)) -> list[dict]:
    init_db()
    with closing(get_connection()) as connection:
        rows = connection.execute("SELECT c.*, COALESCE(SUM(s.total), 0) total_purchases, COALESCE(SUM(s.balance), 0) outstanding_debt FROM customers c LEFT JOIN sales s ON s.customer_id = c.id WHERE c.full_name LIKE ? OR c.phone LIKE ? GROUP BY c.id ORDER BY c.full_name", (f"%{search}%", f"%{search}%")).fetchall()
        return [row_dict(row) for row in rows]


@app.post("/api/customers")
def create_customer(payload: CustomerCreate, _: dict = Depends(current_user)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        duplicate = connection.execute("SELECT id FROM customers WHERE phone = ?", (payload.phone.strip(),)).fetchone()
        if duplicate:
            raise HTTPException(409, "A customer with that phone number already exists")
        cursor = connection.execute("INSERT INTO customers (full_name, phone) VALUES (?, ?)", (payload.full_name.strip(), payload.phone.strip()))
        connection.commit()
        return {"id": cursor.lastrowid, "full_name": payload.full_name.strip(), "phone": payload.phone.strip(), "outstanding_debt": 0}


@app.get("/api/sales")
def sales(_: dict = Depends(current_user)) -> list[dict]:
    init_db()
    with closing(get_connection()) as connection:
        return [row_dict(row) for row in connection.execute("SELECT s.*, COALESCE(c.full_name, 'Walk-in customer') customer, COALESCE(u.full_name, 'Unknown user') recorded_by FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.recorded_by_user_id ORDER BY s.id DESC").fetchall()]


@app.get("/api/payments")
def payments(_: dict = Depends(current_user)) -> list[dict]:
    init_db()
    with closing(get_connection()) as connection:
        return [row_dict(row) for row in connection.execute("SELECT p.*, COALESCE(c.full_name, 'Walk-in customer') customer, COALESCE(u.full_name, 'Unknown user') recorded_by FROM payments p LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN users u ON u.id = p.recorded_by_user_id ORDER BY p.id DESC").fetchall()]


@app.post("/api/sales")
def create_sale(payload: SaleCreate, user: dict = Depends(current_user)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN")
            total = 0.0
            products_to_sell = []
            gas_to_sell = []
            for item in payload.items:
                if item.gas_id:
                    gas = connection.execute("SELECT * FROM gas_inventory WHERE id = ?", (item.gas_id,)).fetchone()
                    if not gas:
                        raise HTTPException(404, "Gas product not found")
                    if gas["full_quantity"] < item.quantity:
                        raise HTTPException(409, f"Only {gas['full_quantity']} full {gas['brand']} cylinders available")
                    gas_price = gas["refill_price"] if payload.gas_sale_mode != "package" else gas["package_price"]
                    total += gas_price * item.quantity
                    gas_to_sell.append((item, gas, gas_price))
                else:
                    product = connection.execute("SELECT * FROM products WHERE id = ? AND active = 1", (item.product_id,)).fetchone()
                    if not product:
                        raise HTTPException(404, "Product not found")
                    if product["stock_quantity"] < item.quantity:
                        raise HTTPException(409, f"Only {product['stock_quantity']} {product['name']} in stock")
                    total += product["price"] * item.quantity
                    products_to_sell.append((item, product))
            if payload.amount_paid > total:
                raise HTTPException(400, "Amount paid cannot exceed the sale total")
            if payload.payment_method == "M-Pesa" and payload.mpesa_amount == 0:
                payload.mpesa_amount = payload.amount_paid
            if payload.payment_method == "Cash" and payload.cash_amount == 0:
                payload.cash_amount = payload.amount_paid
            if round(payload.mpesa_amount + payload.cash_amount, 2) != round(payload.amount_paid, 2):
                raise HTTPException(400, "Payment breakdown must equal the amount paid")
            if payload.amount_paid < total and payload.customer_id is None:
                raise HTTPException(400, "Please select or add a specific customer to record a credit sale.")
            balance = round(total - payload.amount_paid, 2)
            status = status_for(total, payload.amount_paid)
            receipt = receipt_number(connection)
            cursor = connection.execute("INSERT INTO sales (receipt_number, customer_id, total, amount_paid, balance, payment_method, status, credit_sale, mpesa_amount, cash_amount, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (receipt, payload.customer_id, total, payload.amount_paid, balance, payload.payment_method, status, int(payload.amount_paid < total), payload.mpesa_amount, payload.cash_amount, user["id"]))
            sale_id = cursor.lastrowid
            for item, product in products_to_sell:
                previous = product["stock_quantity"]
                connection.execute("INSERT INTO sale_items (sale_id, product_id, item_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)", (sale_id, product["id"], product["name"], item.quantity, product["price"]))
                connection.execute("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?", (item.quantity, product["id"]))
                connection.execute("INSERT INTO inventory_movements (product_id, movement_type, quantity_change, previous_quantity, new_quantity, notes) VALUES (?, 'SALE', ?, ?, ?, ?)", (product["id"], -item.quantity, previous, previous - item.quantity, receipt))
            for item, gas, gas_price in gas_to_sell:
                previous_full = gas["full_quantity"]
                connection.execute("INSERT INTO sale_items (sale_id, gas_id, item_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)", (sale_id, gas["id"], f"{gas['brand']} {gas['size_kg']}kg Gas", item.quantity, gas_price))
                connection.execute("UPDATE gas_inventory SET full_quantity = full_quantity - ? WHERE id = ?", (item.quantity, gas["id"]))
                connection.execute("INSERT INTO inventory_movements (gas_id, movement_type, quantity_change, previous_quantity, new_quantity, notes) VALUES (?, 'GAS_SALE_FULL', ?, ?, ?, ?)", (gas["id"], -item.quantity, previous_full, previous_full - item.quantity, receipt))
                if payload.gas_sale_mode == "exchange":
                    returned_id = payload.returned_gas_id or gas["id"]
                    returned = connection.execute("SELECT * FROM gas_inventory WHERE id = ?", (returned_id,)).fetchone()
                    if not returned:
                        raise HTTPException(404, "Returned empty cylinder type not found")
                    connection.execute("UPDATE gas_inventory SET empty_quantity = empty_quantity + ? WHERE id = ?", (item.quantity, returned_id))
                    connection.execute("INSERT INTO inventory_movements (gas_id, movement_type, quantity_change, previous_quantity, new_quantity, notes) VALUES (?, 'GAS_RETURN_EMPTY', ?, ?, ?, ?)", (returned_id, item.quantity, returned["empty_quantity"], returned["empty_quantity"] + item.quantity, receipt))
            if payload.amount_paid > 0:
                connection.execute("INSERT INTO payments (customer_id, sale_id, amount, payment_method, reference, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", (payload.customer_id, sale_id, payload.amount_paid, payload.payment_method, payload.mpesa_reference, user["id"]))
            connection.commit()
            return {"id": sale_id, "receipt_number": receipt, "total": total, "amount_paid": payload.amount_paid, "balance": balance, "status": status}
        except HTTPException:
            connection.rollback()
            raise
        except sqlite3.Error as error:
            connection.rollback()
            raise HTTPException(500, f"Could not complete sale: {error}")


@app.post("/api/gas-exchanges")
def create_gas_exchange(payload: GasExchangeCreate, user: dict = Depends(current_user)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN")
            gas = connection.execute("SELECT * FROM gas_inventory WHERE id = ?", (payload.gas_id,)).fetchone()
            if not gas:
                raise HTTPException(404, "Gas product not found")
            if gas["full_quantity"] < payload.quantity:
                raise HTTPException(409, f"Only {gas['full_quantity']} full {gas['brand']} cylinders available")
            total = gas["price"] * payload.quantity
            if payload.amount_paid > total:
                raise HTTPException(400, "Amount paid cannot exceed the exchange total")
            balance = round(total - payload.amount_paid, 2)
            receipt = receipt_number(connection)
            status = status_for(total, payload.amount_paid)
            sale_id = connection.execute("INSERT INTO sales (receipt_number, customer_id, total, amount_paid, balance, payment_method, status, credit_sale, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (receipt, payload.customer_id, total, payload.amount_paid, balance, payload.payment_method, status, int(payload.amount_paid < total), user["id"])).lastrowid
            connection.execute("INSERT INTO sale_items (sale_id, gas_id, item_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)", (sale_id, gas["id"], f"{gas['brand']} {gas['size_kg']}kg gas (exchange)", payload.quantity, gas["price"]))
            connection.execute("UPDATE gas_inventory SET full_quantity = full_quantity - ?, empty_quantity = empty_quantity + ? WHERE id = ?", (payload.quantity, payload.quantity, gas["id"]))
            connection.execute("INSERT INTO inventory_movements (gas_id, movement_type, quantity_change, previous_quantity, new_quantity, notes) VALUES (?, 'GAS_EXCHANGE_FULL', ?, ?, ?, ?)", (gas["id"], -payload.quantity, gas["full_quantity"], gas["full_quantity"] - payload.quantity, receipt))
            connection.execute("INSERT INTO inventory_movements (gas_id, movement_type, quantity_change, previous_quantity, new_quantity, notes) VALUES (?, 'GAS_EXCHANGE_EMPTY', ?, ?, ?, ?)", (gas["id"], payload.quantity, gas["empty_quantity"], gas["empty_quantity"] + payload.quantity, receipt))
            if payload.amount_paid > 0:
                connection.execute("INSERT INTO payments (customer_id, sale_id, amount, payment_method, reference, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", (payload.customer_id, sale_id, payload.amount_paid, payload.payment_method, payload.mpesa_reference, user["id"]))
            connection.commit()
            return {"id": sale_id, "receipt_number": receipt, "total": total, "amount_paid": payload.amount_paid, "balance": balance, "status": status}
        except HTTPException:
            connection.rollback()
            raise


@app.post("/api/gas-sales")
def create_gas_sale(payload: GasExchangeCreate, user: dict = Depends(current_user)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN")
            gas = connection.execute("SELECT * FROM gas_inventory WHERE id = ?", (payload.gas_id,)).fetchone()
            if not gas:
                raise HTTPException(404, "Gas product not found")
            if gas["full_quantity"] < payload.quantity:
                raise HTTPException(409, f"Only {gas['full_quantity']} full {gas['brand']} cylinders available")
            total = gas["price"] * payload.quantity
            if payload.amount_paid > total:
                raise HTTPException(400, "Amount paid cannot exceed the sale total")
            balance = round(total - payload.amount_paid, 2)
            receipt = receipt_number(connection)
            status = status_for(total, payload.amount_paid)
            sale_id = connection.execute("INSERT INTO sales (receipt_number, customer_id, total, amount_paid, balance, payment_method, status, credit_sale, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (receipt, payload.customer_id, total, payload.amount_paid, balance, payload.payment_method, status, int(payload.amount_paid < total), user["id"])).lastrowid
            connection.execute("INSERT INTO sale_items (sale_id, gas_id, item_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)", (sale_id, gas["id"], f"{gas['brand']} {gas['size_kg']}kg gas (new cylinder)", payload.quantity, gas["price"]))
            connection.execute("UPDATE gas_inventory SET full_quantity = full_quantity - ? WHERE id = ?", (payload.quantity, gas["id"]))
            connection.execute("INSERT INTO inventory_movements (gas_id, movement_type, quantity_change, previous_quantity, new_quantity, notes) VALUES (?, 'GAS_SALE', ?, ?, ?, ?)", (gas["id"], -payload.quantity, gas["full_quantity"], gas["full_quantity"] - payload.quantity, receipt))
            if payload.amount_paid > 0:
                connection.execute("INSERT INTO payments (customer_id, sale_id, amount, payment_method, reference, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", (payload.customer_id, sale_id, payload.amount_paid, payload.payment_method, payload.mpesa_reference, user["id"]))
            connection.commit()
            return {"id": sale_id, "receipt_number": receipt, "total": total, "amount_paid": payload.amount_paid, "balance": balance, "status": status}
        except HTTPException:
            connection.rollback()
            raise


@app.post("/api/payments")
def create_payment(payload: PaymentCreate, user: dict = Depends(current_user)) -> dict:
    init_db()
    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN")
            outstanding = connection.execute("SELECT COALESCE(SUM(balance), 0) FROM sales WHERE customer_id = ?", (payload.customer_id,)).fetchone()[0]
            if payload.amount > outstanding:
                raise HTTPException(400, f"Payment cannot exceed outstanding balance of KSh {outstanding:,.0f}")
            payment_id = connection.execute("INSERT INTO payments (customer_id, amount, payment_method, reference, notes, recorded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)", (payload.customer_id, payload.amount, payload.payment_method, payload.mpesa_reference, payload.notes, user["id"])).lastrowid
            remaining = payload.amount
            for sale in connection.execute("SELECT id, balance FROM sales WHERE customer_id = ? AND balance > 0 ORDER BY id", (payload.customer_id,)).fetchall():
                applied = min(remaining, sale["balance"])
                if applied <= 0:
                    break
                updated_balance = round(sale["balance"] - applied, 2)
                connection.execute("UPDATE sales SET amount_paid = amount_paid + ?, balance = ?, status = ? WHERE id = ?", (applied, updated_balance, "PAID" if updated_balance == 0 else "PARTIAL", sale["id"]))
                remaining -= applied
            connection.commit()
            return {"id": payment_id, "amount": payload.amount, "remaining_balance": outstanding - payload.amount}
        except HTTPException:
            connection.rollback()
            raise
