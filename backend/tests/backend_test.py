"""
Backend tests for Arabic Generator Subscription Management app.

Focus areas (per review request):
- Verify DB has exactly 3 seed generators (bug fix regression)
- Invoice model no longer requires amperage_charge and should accept only
  consumption_charge (feature change)
- Full flow: create customer -> reading -> invoice -> verify total_amount
- Dashboard/stats sanity check
"""

import os
import uuid
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # Load from frontend .env as fallback
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not configured"
BASE_URL = BASE_URL.rstrip("/")

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ==================== Auth ====================

class TestAuth:
    def test_login_success(self, api_client):
        r = api_client.post(
            f"{API}/auth/login",
            json={"username": "MS", "password": "Ms28796610**"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["user"]["username"] == "MS"

    def test_login_failure(self, api_client):
        r = api_client.post(
            f"{API}/auth/login",
            json={"username": "MS", "password": "wrong"},
        )
        assert r.status_code == 401


# ==================== Generators (bug fix regression) ====================

class TestGenerators:
    def test_get_generators_returns_exactly_3(self, api_client):
        r = api_client.get(f"{API}/generators")
        assert r.status_code == 200, r.text
        gens = r.json()
        assert isinstance(gens, list)
        assert len(gens) == 3, f"Expected 3 seed generators, found {len(gens)}: {[g['name'] for g in gens]}"

    def test_generator_names_match_seed(self, api_client):
        r = api_client.get(f"{API}/generators")
        gens = r.json()
        names = sorted(g["name"] for g in gens)
        expected = sorted(["مولد 150 kVA", "مولد 250 kVA", "مولد 300 kVA"])
        assert names == expected, f"Generator names mismatch: {names} vs {expected}"

    def test_generator_capacities(self, api_client):
        r = api_client.get(f"{API}/generators")
        caps = sorted(g["capacity"] for g in r.json())
        assert caps == [150, 250, 300]


# ==================== Dashboard stats ====================

class TestDashboard:
    def test_dashboard_total_generators_is_3(self, api_client):
        r = api_client.get(f"{API}/stats/dashboard")
        assert r.status_code == 200, r.text
        stats = r.json()
        assert stats["total_generators"] == 3, stats
        # Sanity: keys exist
        for key in [
            "total_customers", "unpaid_invoices", "total_debt",
            "month_revenue", "overdue_count", "current_month"
        ]:
            assert key in stats


# ==================== Invoice model (amperage_charge removed) ====================

class TestInvoiceModelSchema:
    def test_invoice_create_without_amperage_charge(self, api_client):
        """Full-flow: customer -> reading -> invoice WITHOUT amperage_charge."""
        # Pick an existing generator
        gens = api_client.get(f"{API}/generators").json()
        assert gens, "No generators available"
        gen_id = gens[0]["id"]

        # Create test customer
        cust_payload = {
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07700000000",
            "address": "TEST addr",
            "area": "المسعودية",
            "amperage": 10,
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
            "notes": "TEST customer",
        }
        cr = api_client.post(f"{API}/customers", json=cust_payload)
        assert cr.status_code == 200, cr.text
        customer = cr.json()
        customer_id = customer["id"]

        # Create reading
        reading_payload = {
            "customer_id": customer_id,
            "previous_reading": 1000.0,
            "current_reading": 1100.0,
            "reading_date": datetime.utcnow().isoformat(),
            "notes": "TEST reading",
        }
        rr = api_client.post(f"{API}/readings", json=reading_payload)
        assert rr.status_code == 200, rr.text
        reading = rr.json()
        assert reading["consumption"] == 100.0
        reading_id = reading["id"]

        # Create invoice WITHOUT amperage_charge
        consumption_charge = 15.0  # 100 kWh * $0.15
        invoice_payload = {
            "customer_id": customer_id,
            "reading_id": reading_id,
            "month": datetime.utcnow().strftime("%Y-%m"),
            "consumption_charge": consumption_charge,
            "total_amount": consumption_charge,
            "previous_balance": 0.0,
            "amount_paid": 0.0,
            "notes": "TEST invoice - no amperage",
        }
        ir = api_client.post(f"{API}/invoices", json=invoice_payload)
        assert ir.status_code == 200, ir.text
        invoice = ir.json()
        invoice_id = invoice["id"]

        # Verify amperage_charge not in model
        assert "amperage_charge" not in invoice, f"amperage_charge still exists: {invoice}"
        assert invoice["consumption_charge"] == consumption_charge
        assert invoice["total_amount"] == consumption_charge
        assert invoice["remaining_amount"] == consumption_charge
        assert invoice["status"] == "unpaid"

        # GET to verify persistence
        gr = api_client.get(f"{API}/invoices/{invoice_id}")
        assert gr.status_code == 200
        got = gr.json()
        assert "amperage_charge" not in got
        assert got["total_amount"] == consumption_charge

        # Cleanup
        api_client.delete(f"{API}/customers/{customer_id}")

    def test_invoice_rejects_missing_consumption_charge(self, api_client):
        """Invoice creation should still require consumption_charge."""
        payload = {
            "customer_id": "000000000000000000000000",
            "reading_id": "000000000000000000000000",
            "month": "2026-01",
            "total_amount": 10.0,
        }
        r = api_client.post(f"{API}/invoices", json=payload)
        # Should be 422 validation error (missing consumption_charge)
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_invoice_ignores_amperage_charge_if_sent(self, api_client):
        """If a client accidentally sends amperage_charge, Pydantic should reject
        extra field or silently ignore. Verify it doesn't crash the endpoint."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust = api_client.post(f"{API}/customers", json={
            "name": f"TEST_{uuid.uuid4().hex[:6]}", "phone": "07701111111",
            "address": "a", "area": "المسعودية", "amperage": 5,
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id, "previous_balance": 0.0,
        }).json()
        reading = api_client.post(f"{API}/readings", json={
            "customer_id": cust["id"],
            "previous_reading": 0.0, "current_reading": 50.0,
            "reading_date": datetime.utcnow().isoformat(),
        }).json()

        payload = {
            "customer_id": cust["id"],
            "reading_id": reading["id"],
            "month": "2026-01",
            "consumption_charge": 7.5,
            "total_amount": 7.5,
            "amperage_charge": 999.0,  # legacy field
        }
        r = api_client.post(f"{API}/invoices", json=payload)
        # Either accepted (extra ignored) or 422. Both acceptable, but the
        # invoice must NOT include amperage_charge on retrieval.
        if r.status_code == 200:
            inv = r.json()
            assert "amperage_charge" not in inv
            assert inv["total_amount"] == 7.5
        else:
            assert r.status_code == 422

        # Cleanup
        api_client.delete(f"{API}/customers/{cust['id']}")


# ==================== Existing endpoints regression ====================

class TestEndpointsHealth:
    def test_get_customers(self, api_client):
        r = api_client.get(f"{API}/customers")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_invoices(self, api_client):
        r = api_client.get(f"{API}/invoices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_readings(self, api_client):
        r = api_client.get(f"{API}/readings")
        assert r.status_code == 200

    def test_get_expenses(self, api_client):
        r = api_client.get(f"{API}/expenses")
        assert r.status_code == 200

    def test_reports_debts(self, api_client):
        r = api_client.get(f"{API}/reports/debts")
        assert r.status_code == 200
        data = r.json()
        for k in ["total_debt", "debt_by_area", "debt_by_generator", "debtor_list"]:
            assert k in data

    def test_reports_financial(self, api_client):
        r = api_client.get(f"{API}/reports/financial")
        assert r.status_code == 200
        data = r.json()
        for k in ["total_revenue", "total_expenses", "net_profit", "expenses_by_type"]:
            assert k in data

    def test_reports_consumption(self, api_client):
        r = api_client.get(f"{API}/reports/consumption")
        assert r.status_code == 200
        data = r.json()
        for k in ["total_consumption", "consumption_by_area", "consumption_by_generator"]:
            assert k in data
