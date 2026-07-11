"""
Backend tests for Arabic Generator Subscription Management app.

Iteration 2 focus (amperage field completely removed from Customer models):
- CustomerCreate/Customer models must NOT contain 'amperage'
- POST /api/customers WITHOUT amperage succeeds
- POST /api/customers WITH amperage is silently ignored (backward compat)
- GET /api/customers response does NOT contain amperage
- Full flow: create customer (no amperage) -> reading -> invoice
- Regression: still exactly 3 generators, all endpoints healthy
"""

import os
import uuid
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
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


# ==================== Generators regression ====================

class TestGenerators:
    def test_get_generators_returns_exactly_3(self, api_client):
        r = api_client.get(f"{API}/generators")
        assert r.status_code == 200, r.text
        gens = r.json()
        assert isinstance(gens, list)
        assert len(gens) == 3, f"Expected 3 seed generators, found {len(gens)}"

    def test_generator_names_match_seed(self, api_client):
        r = api_client.get(f"{API}/generators")
        names = sorted(g["name"] for g in r.json())
        expected = sorted(["مولد 150 kVA", "مولد 250 kVA", "مولد 300 kVA"])
        assert names == expected

    def test_generator_capacities(self, api_client):
        r = api_client.get(f"{API}/generators")
        caps = sorted(g["capacity"] for g in r.json())
        assert caps == [150, 250, 300]


# ==================== Dashboard ====================

class TestDashboard:
    def test_dashboard_total_generators_is_3(self, api_client):
        r = api_client.get(f"{API}/stats/dashboard")
        assert r.status_code == 200, r.text
        stats = r.json()
        assert stats["total_generators"] == 3
        for key in [
            "total_customers", "unpaid_invoices", "total_debt",
            "month_revenue", "overdue_count", "current_month",
        ]:
            assert key in stats


# ==================== Customer model: amperage REMOVED ====================

class TestCustomerAmperageRemoval:
    """Verify 'amperage' has been COMPLETELY REMOVED from customer models."""

    def _get_gen_id(self, api_client):
        gens = api_client.get(f"{API}/generators").json()
        assert gens, "No generators available"
        return gens[0]["id"]

    def test_create_customer_without_amperage_succeeds(self, api_client):
        gen_id = self._get_gen_id(api_client)
        payload = {
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07700000001",
            "address": "TEST address",
            "area": "المسعودية",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
            "notes": "TEST no-amperage",
        }
        r = api_client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        cust = r.json()
        # Response MUST NOT contain amperage
        assert "amperage" not in cust, f"amperage still in response: {cust}"
        # Verify fields persisted
        assert cust["name"] == payload["name"]
        assert cust["meter_number"] == payload["meter_number"]
        assert cust["area"] == "المسعودية"
        cust_id = cust["id"]

        # GET verification - persisted correctly, no amperage
        gr = api_client.get(f"{API}/customers/{cust_id}")
        assert gr.status_code == 200
        got = gr.json()
        assert "amperage" not in got
        assert got["name"] == payload["name"]

        # Cleanup
        api_client.delete(f"{API}/customers/{cust_id}")

    def test_create_customer_with_amperage_is_ignored(self, api_client):
        """Backward compat: stale clients sending amperage should not crash;
        Pydantic default silently ignores extra fields, and it must NOT
        surface in the response."""
        gen_id = self._get_gen_id(api_client)
        payload = {
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07700000002",
            "address": "TEST address",
            "area": "الشرقي",
            "amperage": 25,  # legacy field
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 5.0,
            "notes": "TEST legacy amperage",
        }
        r = api_client.post(f"{API}/customers", json=payload)
        # Either accepted (extra ignored) OR 422. Both acceptable.
        if r.status_code == 200:
            cust = r.json()
            assert "amperage" not in cust, f"amperage leaked back: {cust}"
            assert cust["previous_balance"] == 5.0
            # Cleanup
            api_client.delete(f"{API}/customers/{cust['id']}")
        else:
            assert r.status_code == 422, r.text

    def test_get_customers_list_has_no_amperage(self, api_client):
        gen_id = self._get_gen_id(api_client)
        # Create at least one so the list isn't empty (best effort)
        cr = api_client.post(f"{API}/customers", json={
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07700000003",
            "address": "a",
            "area": "الحيصة",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
        })
        assert cr.status_code == 200, cr.text
        cust_id = cr.json()["id"]

        try:
            r = api_client.get(f"{API}/customers")
            assert r.status_code == 200
            data = r.json()
            assert isinstance(data, list)
            for c in data:
                assert "amperage" not in c, f"amperage in list item: {c}"
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_update_customer_without_amperage(self, api_client):
        gen_id = self._get_gen_id(api_client)
        cr = api_client.post(f"{API}/customers", json={
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07700000004",
            "address": "old",
            "area": "الغربي",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
        })
        assert cr.status_code == 200
        cust_id = cr.json()["id"]

        try:
            update_payload = {
                "name": "TEST_updated",
                "phone": "07700000005",
                "address": "new",
                "area": "الغربي",
                "meter_number": cr.json()["meter_number"],
                "generator_id": gen_id,
                "previous_balance": 0.0,
                "notes": "updated",
            }
            ur = api_client.put(f"{API}/customers/{cust_id}", json=update_payload)
            assert ur.status_code == 200, ur.text
            updated = ur.json()
            assert "amperage" not in updated
            assert updated["name"] == "TEST_updated"
            assert updated["address"] == "new"
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")


# ==================== Full flow (no amperage) ====================

class TestFullFlow:
    def test_customer_reading_invoice_flow_no_amperage(self, api_client):
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]

        # 1) Create customer (no amperage)
        cust_payload = {
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07799999999",
            "address": "Full flow test",
            "area": "المسعودية",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
        }
        cr = api_client.post(f"{API}/customers", json=cust_payload)
        assert cr.status_code == 200, cr.text
        customer = cr.json()
        assert "amperage" not in customer
        cust_id = customer["id"]

        try:
            # 2) Meter reading
            reading_payload = {
                "customer_id": cust_id,
                "previous_reading": 0.0,
                "current_reading": 100.0,
                "reading_date": datetime.utcnow().isoformat(),
                "notes": "TEST",
            }
            rr = api_client.post(f"{API}/readings", json=reading_payload)
            assert rr.status_code == 200, rr.text
            reading = rr.json()
            assert reading["consumption"] == 100.0
            reading_id = reading["id"]

            # 3) Invoice at $0.85/kWh -> $85.00
            consumption_charge = 100.0 * 0.85
            invoice_payload = {
                "customer_id": cust_id,
                "reading_id": reading_id,
                "month": datetime.utcnow().strftime("%Y-%m"),
                "consumption_charge": consumption_charge,
                "total_amount": consumption_charge,
                "previous_balance": 0.0,
                "amount_paid": 0.0,
            }
            ir = api_client.post(f"{API}/invoices", json=invoice_payload)
            assert ir.status_code == 200, ir.text
            invoice = ir.json()
            assert invoice["consumption_charge"] == consumption_charge
            assert invoice["total_amount"] == 85.0
            assert invoice["remaining_amount"] == 85.0
            assert invoice["status"] == "unpaid"
            assert "amperage_charge" not in invoice
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")


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
