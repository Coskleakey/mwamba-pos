from fastapi.testclient import TestClient

from main import app


def owner_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "ChangeMe123!"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_seeded_workspace_is_available() -> None:
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        headers = owner_headers(client)
        assert len(client.get("/api/products", headers=headers).json()) >= 6
        assert len(client.get("/api/gas", headers=headers).json()) >= 5
        assert len(client.get("/api/customers", headers=headers).json()) >= 3


def test_overselling_is_rejected() -> None:
    with TestClient(app) as client:
        headers = owner_headers(client)
        product = next(
            item
            for item in client.get("/api/products", headers=headers).json()
            if item["stock_quantity"] > 0
        )
        response = client.post(
            "/api/sales",
            headers=headers,
            json={
                "items": [{"product_id": product["id"], "quantity": 999999}],
                "payment_method": "Cash",
                "amount_paid": 0,
            },
        )
        assert response.status_code == 409


def test_gas_exchange_updates_both_cylinder_states() -> None:
    with TestClient(app) as client:
        headers = owner_headers(client)
        gas_before = client.get("/api/gas", headers=headers).json()[1]
        response = client.post(
            "/api/gas-exchanges",
            headers=headers,
            json={
                "gas_id": gas_before["id"],
                "quantity": 1,
                "payment_method": "M-Pesa",
                "amount_paid": gas_before["price"],
            },
        )
        assert response.status_code == 200
        gas_after = next(item for item in client.get("/api/gas", headers=headers).json() if item["id"] == gas_before["id"])
        assert gas_after["full_quantity"] == gas_before["full_quantity"] - 1
        assert gas_after["empty_quantity"] == gas_before["empty_quantity"] + 1


def test_business_routes_require_authentication() -> None:
    with TestClient(app) as client:
        assert client.get("/api/products").status_code == 401


def test_owner_can_create_staff_account() -> None:
    with TestClient(app) as client:
        headers = owner_headers(client)
        response = client.post("/api/staff", headers=headers, json={"full_name": "Test Seller", "email": "seller-test@example.com", "password": "SellerPass123!"})
        assert response.status_code in (200, 409)
        staff = client.get("/api/staff", headers=headers)
        assert staff.status_code == 200
        assert any(member["email"] == "seller-test@example.com" for member in staff.json())


def test_credit_sale_requires_a_named_customer() -> None:
    with TestClient(app) as client:
        headers = owner_headers(client)
        product = next(
            item
            for item in client.get("/api/products", headers=headers).json()
            if item["stock_quantity"] > 0
        )
        anonymous = client.post(
            "/api/sales",
            headers=headers,
            json={"items": [{"product_id": product["id"], "quantity": 1}], "payment_method": "Cash", "amount_paid": product["price"] - 1},
        )
        assert anonymous.status_code == 400
        assert "specific customer" in anonymous.json()["detail"]

        named = client.post(
            "/api/sales",
            headers=headers,
            json={"customer_id": 1, "items": [{"product_id": product["id"], "quantity": 1}], "payment_method": "Cash", "amount_paid": product["price"] - 1},
        )
        assert named.status_code == 200
        assert named.json()["balance"] == 1


def test_customer_can_be_created_for_checkout() -> None:
    with TestClient(app) as client:
        headers = owner_headers(client)
        response = client.post(
            "/api/customers",
            headers=headers,
            json={"full_name": "Quick Add Customer", "phone": "0799000111"},
        )
        assert response.status_code in (200, 409)
        if response.status_code == 200:
            assert response.json()["full_name"] == "Quick Add Customer"
            assert response.json()["phone"] == "0799000111"


def test_madeni_ledger_excludes_fully_paid_normal_sales() -> None:
    with TestClient(app) as client:
        headers = owner_headers(client)
        product = next(
            item
            for item in client.get("/api/products", headers=headers).json()
            if item["stock_quantity"] > 0
        )
        response = client.post(
            "/api/sales",
            headers=headers,
            json={
                "customer_id": 2,
                "items": [{"product_id": product["id"], "quantity": 1}],
                "payment_method": "Cash",
                "amount_paid": product["price"],
            },
        )
        assert response.status_code == 200
        mary = next(item for item in client.get("/api/dashboard", headers=headers).json()["debts"] if item["id"] == 2)
        assert mary["total_purchases"] == mary["paid"] + mary["balance"]


def test_split_sale_persists_and_reports_payment_breakdown() -> None:
    with TestClient(app) as client:
        headers = owner_headers(client)
        product = next(item for item in client.get("/api/products", headers=headers).json() if item["stock_quantity"] > 0)
        response = client.post(
            "/api/sales",
            headers=headers,
            json={
                "items": [{"product_id": product["id"], "quantity": 1}],
                "customer_id": 1,
                "payment_method": "Split / Hybrid",
                "amount_paid": 150,
                "mpesa_amount": 100,
                "cash_amount": 50,
            },
        )
        assert response.status_code == 200
        sale = next(item for item in client.get("/api/sales", headers=headers).json() if item["id"] == response.json()["id"])
        assert sale["payment_method"] == "Split / Hybrid"
        assert sale["mpesa_amount"] == 100
        assert sale["cash_amount"] == 50


def test_gas_sale_exchange_updates_full_and_returned_empty_stock() -> None:
    with TestClient(app) as client:
        headers = owner_headers(client)
        gas = client.get("/api/gas", headers=headers).json()
        sold = gas[0]
        returned = gas[1]
        response = client.post(
            "/api/sales",
            headers=headers,
            json={
                "items": [{"gas_id": sold["id"], "quantity": 1}],
                "payment_method": "Cash",
                "amount_paid": sold["refill_price"],
                "cash_amount": sold["refill_price"],
                "gas_sale_mode": "exchange",
                "returned_gas_id": returned["id"],
            },
        )
        assert response.status_code == 200, response.text
        updated = {item["id"]: item for item in client.get("/api/gas", headers=headers).json()}
        assert updated[sold["id"]]["full_quantity"] == sold["full_quantity"] - 1
        assert updated[returned["id"]]["empty_quantity"] == returned["empty_quantity"] + 1
