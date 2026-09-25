# Mwamba POS

A focused point-of-sale and stock management MVP for a Kenyan retail shop selling LPG cylinders, electronics, and accessories. The product is built around the daily workflows that matter: M-Pesa and cash sales, gas exchanges, stock visibility, receipts, and customer madeni.

## What is implemented

- Responsive business dashboard with sales, payment, inventory, and debt summaries
- Electronics and physical-product inventory with low-stock states
- Full and empty gas cylinder tracking by brand and size
- Gas exchange workflow: full -1, empty +1, with impossible-state protection
- Direct new-cylinder gas sale workflow through `POST /api/gas-sales`
- M-Pesa and cash payments recorded manually, ready for future Daraja integration
- Paid, partial, and credit sales with customer debt balances
- Debt repayments applied to the oldest outstanding sale
- Inventory movement audit records for products and gas
- Seed data for customers, gas, electronics, and demo user
- CORS and environment-based API URL configuration
- Owner login with signed sessions and protected business routes
- Owner-only **Settings** view: shop profile plus password change for any signed-in account
- Owner-only sales staff accounts with activate/deactivate controls
- Payment history showing customer, amount, method, reference, and recording staff member
- Sale and payment audit attribution for remote accountability
- Focused backend tests for seed data, overselling, and gas exchange

## Project structure

```text
backend/
  main.py              FastAPI app, schema bootstrap, seed data, business API
  test_main.py         API business workflow tests
  requirements.txt
 database/
  schema.sql           Relational schema and indexes
 frontend/
  src/App.tsx          Responsive application workspace and quick actions
  src/index.css        Visual system and responsive styles
  src/vite-env.d.ts    Vite environment types
```

## Accounts and access

- Email: `admin@example.com`
- Password: `ChangeMe123!`

This is for development demonstration only. Change the seeded owner password from **Settings** before production use.

The owner signs in first and uses **Staff** in the sidebar to create sales accounts. Staff can record sales, gas exchanges, and partial debt payments, but cannot create or deactivate accounts. Every sale and payment stores the authenticated staff member who recorded it.

## Local development

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API creates `mwamba_pos.db` in the project root and seeds the demo workspace on first start.

Run tests from the repository root:

```powershell
python -m pytest backend\test_main.py
```

Useful API routes:

- `GET /health`
- `GET /api/dashboard`
- `GET /api/products`
- `GET /api/gas`
- `GET /api/customers`
- `GET /api/sales`
- `POST /api/sales`
- `POST /api/gas-exchanges`
- `POST /api/gas-sales`
- `POST /api/payments`
- `POST /api/auth/password`

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Set `frontend/.env` as needed:

```env
VITE_API_URL=http://localhost:8000
```

The production frontend must set `VITE_API_URL` to the deployed API URL; it must never rely on the local fallback.

## Deployment shape

The app is designed for a free-tier split deployment:

Vercel is the recommended frontend host for this Vite app. It provides straightforward previews, HTTPS, and `VITE_API_URL` environment variables. Use Render for the FastAPI service, with Supabase or Neon PostgreSQL for durable hosted data.

1. Import the repository into Vercel, set the project root to `frontend`, build with `npm run build`, output `dist`, and set `VITE_API_URL` to the public API URL.
2. Deploy `backend` to Render with build command `pip install -r requirements.txt` and start command `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Set backend `CORS_ORIGINS` to the exact Vercel domain and `SECRET_KEY` to a long random value.
4. Do not use the local SQLite file for a production remote shop. Render's free ephemeral filesystem can lose it on restart. Migrate the database connection to PostgreSQL on Supabase/Neon before going live, or use a paid persistent disk. `render.yaml` is included as a reference deployment shape, but its SQLite disk is not the free-tier recommendation.

SQLite is deliberately used for the local MVP so it starts with no paid service or external API. For a remotely hosted production instance, use PostgreSQL on a provider such as Supabase or Neon and migrate the connection/transaction layer; the documented `database/schema.sql` contains the relational model and indexes to carry forward.

## Environment variables

Backend `.env` example:

```env
DATABASE_PATH=./mwamba_pos.db
CORS_ORIGINS=http://localhost:5173
SECRET_KEY=replace-with-a-long-random-production-secret
```

Root `.env.example` and `frontend/.env.example` are included in the repository. Never commit real secrets or production credentials.

## Intentional future work

- PostgreSQL adapter and migrations for hosted persistence
- Forgotten-password recovery (self-service rotation is implemented; an owner cannot yet reset a staff password)
- Receipt detail endpoint and browser print view
- Product/customer create and edit screens
- Inventory adjustments and movement history UI
- Full reports export and configurable business settings
- Daraja integration behind a provider interface
- Role-based authorization is implemented for owner/staff; finer-grained permissions remain future work
