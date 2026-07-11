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
from pymongo import MongoClient
from bson import ObjectId

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


# ==================== Payment & Monthly Fee (Iteration 4) ====================

class TestMonthlyFeeAndPayment:
    """Iteration 4 focus:
    1) Invoice.monthly_fee defaults to 5.0 and is added to total.
    2) POST /api/invoices/{id}/payment MUST accept {amount, payment_date, notes}
       WITHOUT invoice_id in body (invoice_id comes from URL path).
    3) Partial / full payment status transitions.
    """

    def _create_customer(self, api_client, gen_id, prev_balance=0.0):
        payload = {
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07711111111",
            "address": "TEST",
            "area": "المسعودية",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": prev_balance,
        }
        r = api_client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _create_reading(self, api_client, cust_id, prev=0.0, curr=100.0):
        r = api_client.post(f"{API}/readings", json={
            "customer_id": cust_id,
            "previous_reading": prev,
            "current_reading": curr,
            "reading_date": datetime.utcnow().isoformat(),
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _create_invoice(self, api_client, cust_id, reading_id,
                        consumption_charge=85.0, monthly_fee=5.0,
                        prev_balance=0.0, amount_paid=0.0):
        total = consumption_charge + monthly_fee
        payload = {
            "customer_id": cust_id,
            "reading_id": reading_id,
            "month": datetime.utcnow().strftime("%Y-%m"),
            "consumption_charge": consumption_charge,
            "monthly_fee": monthly_fee,
            "total_amount": total,
            "previous_balance": prev_balance,
            "amount_paid": amount_paid,
        }
        r = api_client.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, r.text
        return r.json()

    def test_invoice_has_monthly_fee_field_default_5(self, api_client):
        """Create invoice; verify monthly_fee=5.0 and total=consumption+5."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._create_customer(api_client, gen_id)
        try:
            reading_id = self._create_reading(api_client, cust_id, 0.0, 100.0)
            # 100 kWh * $0.85 = $85, + $5 monthly = $90
            inv = self._create_invoice(
                api_client, cust_id, reading_id,
                consumption_charge=85.0, monthly_fee=5.0,
            )
            assert inv["consumption_charge"] == 85.0
            assert inv["monthly_fee"] == 5.0, f"monthly_fee missing/wrong: {inv}"
            assert inv["total_amount"] == 90.0
            assert inv["remaining_amount"] == 90.0
            assert inv["status"] == "unpaid"

            # GET verification
            gr = api_client.get(f"{API}/invoices/{inv['id']}")
            assert gr.status_code == 200
            got = gr.json()
            assert got["monthly_fee"] == 5.0
            assert got["total_amount"] == 90.0
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_payment_without_invoice_id_in_body_succeeds(self, api_client):
        """CRITICAL BUG FIX: PaymentCreate must not require invoice_id.
        Frontend sends only {amount, payment_date, notes}.
        """
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._create_customer(api_client, gen_id)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            inv = self._create_invoice(api_client, cust_id, reading_id)
            inv_id = inv["id"]

            # Post payment WITHOUT invoice_id in body
            pr = api_client.post(
                f"{API}/invoices/{inv_id}/payment",
                json={"amount": 10.0, "notes": "TEST payment"},
            )
            assert pr.status_code == 200, f"Payment failed: {pr.status_code} {pr.text}"
            data = pr.json()
            assert "new_remaining" in data
            assert data["new_remaining"] == 80.0, data

            # GET invoice verifies persistence
            gi = api_client.get(f"{API}/invoices/{inv_id}").json()
            assert gi["amount_paid"] == 10.0
            assert gi["remaining_amount"] == 80.0
            assert gi["status"] == "partial"
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_payment_minimal_body_only_amount(self, api_client):
        """Even more minimal: only {amount} - payment_date has default."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._create_customer(api_client, gen_id)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            inv = self._create_invoice(api_client, cust_id, reading_id)
            pr = api_client.post(
                f"{API}/invoices/{inv['id']}/payment",
                json={"amount": 10.0},
            )
            assert pr.status_code == 200, pr.text
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_partial_payment_status(self, api_client):
        """total=90, pay 30 -> remaining=60, status=partial."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._create_customer(api_client, gen_id)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            inv = self._create_invoice(api_client, cust_id, reading_id)
            pr = api_client.post(
                f"{API}/invoices/{inv['id']}/payment",
                json={"amount": 30.0},
            )
            assert pr.status_code == 200, pr.text
            assert pr.json()["new_remaining"] == 60.0

            gi = api_client.get(f"{API}/invoices/{inv['id']}").json()
            assert gi["amount_paid"] == 30.0
            assert gi["remaining_amount"] == 60.0
            assert gi["status"] == "partial"
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_full_payment_status(self, api_client):
        """total=90, pay 90 -> remaining=0, status=paid."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._create_customer(api_client, gen_id)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            inv = self._create_invoice(api_client, cust_id, reading_id)
            pr = api_client.post(
                f"{API}/invoices/{inv['id']}/payment",
                json={"amount": 90.0},
            )
            assert pr.status_code == 200, pr.text
            assert pr.json()["new_remaining"] == 0.0

            gi = api_client.get(f"{API}/invoices/{inv['id']}").json()
            assert gi["amount_paid"] == 90.0
            assert gi["remaining_amount"] == 0.0
            assert gi["status"] == "paid"
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_multiple_incremental_payments(self, api_client):
        """Pay 30, then 60 -> paid. Verifies cumulative amount_paid tracked."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._create_customer(api_client, gen_id)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            inv = self._create_invoice(api_client, cust_id, reading_id)
            iid = inv["id"]

            p1 = api_client.post(f"{API}/invoices/{iid}/payment",
                                 json={"amount": 30.0})
            assert p1.status_code == 200
            p2 = api_client.post(f"{API}/invoices/{iid}/payment",
                                 json={"amount": 60.0})
            assert p2.status_code == 200

            gi = api_client.get(f"{API}/invoices/{iid}").json()
            assert gi["amount_paid"] == 90.0
            assert gi["remaining_amount"] == 0.0
            assert gi["status"] == "paid"
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_payment_on_nonexistent_invoice_returns_404(self, api_client):
        # Well-formed but non-existent ObjectId
        fake = "507f1f77bcf86cd799439011"
        r = api_client.post(f"{API}/invoices/{fake}/payment",
                            json={"amount": 5.0})
        assert r.status_code == 404, r.text


# ==================== Iteration 5: GET /api/readings/latest/{customer_id} ====================

class TestLatestReading:
    """Verify GET /api/readings/latest/{customer_id} used by frontend to
    auto-populate previous_reading when creating an invoice."""

    def _create_customer(self, api_client):
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        payload = {
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07722222222",
            "address": "TEST latest",
            "area": "المسعودية",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
        }
        r = api_client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _create_reading(self, api_client, cust_id, prev, curr, date_iso):
        r = api_client.post(f"{API}/readings", json={
            "customer_id": cust_id,
            "previous_reading": prev,
            "current_reading": curr,
            "reading_date": date_iso,
        })
        assert r.status_code == 200, r.text
        return r.json()

    def test_latest_reading_no_readings_returns_has_reading_false(self, api_client):
        cust_id = self._create_customer(api_client)
        try:
            r = api_client.get(f"{API}/readings/latest/{cust_id}")
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["has_reading"] is False
            assert data["current_reading"] == 0
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_latest_reading_returns_most_recent(self, api_client):
        """Create reading1(current=100, older) then reading2(current=200, newer).
        Latest endpoint MUST return current=200 regardless of insertion order."""
        cust_id = self._create_customer(api_client)
        try:
            older = datetime(2026, 1, 1, 10, 0, 0).isoformat()
            newer = datetime(2026, 1, 15, 10, 0, 0).isoformat()

            # Insert older first
            r1 = self._create_reading(api_client, cust_id, 0.0, 100.0, older)
            # Then newer
            r2 = self._create_reading(api_client, cust_id, 100.0, 200.0, newer)
            assert r1["current_reading"] == 100.0
            assert r2["current_reading"] == 200.0

            resp = api_client.get(f"{API}/readings/latest/{cust_id}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["has_reading"] is True
            assert data["current_reading"] == 200.0, f"Expected latest=200, got {data}"
            assert "reading_date" in data
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_latest_reading_returns_most_recent_reverse_insert(self, api_client):
        """Insert newer FIRST, then older. Latest must still return the newer (200)
        based on reading_date, not created_at."""
        cust_id = self._create_customer(api_client)
        try:
            older = datetime(2026, 1, 1, 10, 0, 0).isoformat()
            newer = datetime(2026, 1, 20, 10, 0, 0).isoformat()

            # Insert newer first, older second
            self._create_reading(api_client, cust_id, 100.0, 200.0, newer)
            self._create_reading(api_client, cust_id, 0.0, 100.0, older)

            resp = api_client.get(f"{API}/readings/latest/{cust_id}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["has_reading"] is True
            assert data["current_reading"] == 200.0, f"Sort by reading_date desc failed: {data}"
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_latest_reading_full_flow_100_then_200(self, api_client):
        """PRD scenario: create customer -> reading1(current=100) -> reading2(current=200)
        -> GET latest should return current=200."""
        cust_id = self._create_customer(api_client)
        try:
            t1 = datetime(2026, 1, 5, 8, 0, 0).isoformat()
            t2 = datetime(2026, 1, 10, 8, 0, 0).isoformat()
            self._create_reading(api_client, cust_id, 0.0, 100.0, t1)
            self._create_reading(api_client, cust_id, 100.0, 200.0, t2)

            resp = api_client.get(f"{API}/readings/latest/{cust_id}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["has_reading"] is True
            assert data["current_reading"] == 200.0
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_latest_reading_invalid_customer_id_string(self, api_client):
        """Non-existent (but arbitrary) customer_id: endpoint should not 500;
        returns has_reading:false per spec."""
        r = api_client.get(f"{API}/readings/latest/nonexistent-customer-xyz")
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            data = r.json()
            assert data["has_reading"] is False
            assert data["current_reading"] == 0

    def test_latest_reading_wellformed_but_missing_objectid(self, api_client):
        """Well-formed ObjectId that does not exist as a customer."""
        fake = "507f1f77bcf86cd799439099"
        r = api_client.get(f"{API}/readings/latest/{fake}")
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            data = r.json()
            assert data["has_reading"] is False
            assert data["current_reading"] == 0

    def test_latest_reading_route_not_shadowed_by_reading_id_route(self, api_client):
        """Route ordering guard: /readings/latest/{cid} must not be captured by
        /readings/{reading_id}. If shadowed, we'd get 404 'القراءة غير موجودة'
        or an ObjectId parse 500."""
        cust_id = self._create_customer(api_client)
        try:
            self._create_reading(
                api_client, cust_id, 0.0, 50.0,
                datetime(2026, 1, 12, 9, 0, 0).isoformat()
            )
            r = api_client.get(f"{API}/readings/latest/{cust_id}")
            assert r.status_code == 200, f"Route shadowed? {r.status_code} {r.text}"
            data = r.json()
            assert "has_reading" in data
            assert data["has_reading"] is True
            assert data["current_reading"] == 50.0
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")


# ==================== Iteration 6: Invoice Number auto-generation ====================

class TestInvoiceNumber:
    """Verify Invoice.invoice_number is auto-generated (5-digit, sequential)."""

    def _create_customer(self, api_client):
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        payload = {
            "name": f"TEST_{uuid.uuid4().hex[:6]}",
            "phone": "07733333333",
            "address": "TEST invoice number",
            "area": "المسعودية",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
        }
        r = api_client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _create_reading(self, api_client, cust_id):
        r = api_client.post(f"{API}/readings", json={
            "customer_id": cust_id,
            "previous_reading": 0.0,
            "current_reading": 100.0,
            "reading_date": datetime.utcnow().isoformat(),
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _create_invoice(self, api_client, cust_id, reading_id):
        payload = {
            "customer_id": cust_id,
            "reading_id": reading_id,
            "month": datetime.utcnow().strftime("%Y-%m"),
            "consumption_charge": 85.0,
            "monthly_fee": 5.0,
            "total_amount": 90.0,
            "previous_balance": 0.0,
            "amount_paid": 0.0,
        }
        r = api_client.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, r.text
        return r.json()

    def test_new_invoice_has_5digit_invoice_number(self, api_client):
        cust_id = self._create_customer(api_client)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            inv = self._create_invoice(api_client, cust_id, reading_id)
            assert "invoice_number" in inv, f"invoice_number missing: {inv}"
            assert inv["invoice_number"] is not None
            num_str = inv["invoice_number"]
            assert isinstance(num_str, str), f"Expected string, got {type(num_str)}"
            assert len(num_str) == 5, f"Expected 5-digit, got '{num_str}'"
            assert num_str.isdigit(), f"Not all digits: '{num_str}'"
            # GET verification
            gr = api_client.get(f"{API}/invoices/{inv['id']}")
            assert gr.status_code == 200
            assert gr.json()["invoice_number"] == num_str
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_invoice_numbers_are_sequential(self, api_client):
        """Two new invoices back-to-back: second should be first + 1."""
        cust_id = self._create_customer(api_client)
        try:
            r1 = self._create_reading(api_client, cust_id)
            inv1 = self._create_invoice(api_client, cust_id, r1)

            # Second invoice on same customer
            r2 = api_client.post(f"{API}/readings", json={
                "customer_id": cust_id,
                "previous_reading": 100.0,
                "current_reading": 200.0,
                "reading_date": datetime.utcnow().isoformat(),
            })
            assert r2.status_code == 200, r2.text
            inv2 = self._create_invoice(api_client, cust_id, r2.json()["id"])

            n1 = int(inv1["invoice_number"])
            n2 = int(inv2["invoice_number"])
            assert n2 == n1 + 1, f"Not sequential: {n1} -> {n2}"
            assert len(inv2["invoice_number"]) == 5
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_get_invoices_list_contains_invoice_number(self, api_client):
        cust_id = self._create_customer(api_client)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            self._create_invoice(api_client, cust_id, reading_id)

            r = api_client.get(f"{API}/invoices")
            assert r.status_code == 200
            invoices = r.json()
            assert isinstance(invoices, list)
            assert len(invoices) > 0
            for inv in invoices:
                assert "invoice_number" in inv, f"invoice_number missing in list item: {inv}"
                # Note: existing migrated invoices should have populated numbers.
                # Newly created ones must have 5-digit strings.
                if inv["invoice_number"] is not None:
                    assert isinstance(inv["invoice_number"], str)
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_new_invoice_number_greater_than_or_equal_01710(self, api_client):
        """Per PRD: migration set existing invoices starting at 01710,
        so next new invoice should be > 01710."""
        cust_id = self._create_customer(api_client)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            inv = self._create_invoice(api_client, cust_id, reading_id)
            n = int(inv["invoice_number"])
            assert n >= 1710, f"Expected invoice_number >= 01710, got {inv['invoice_number']}"
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_invoice_monthly_fee_default_still_5(self, api_client):
        """Regression: monthly_fee=5.0 default still works alongside invoice_number."""
        cust_id = self._create_customer(api_client)
        try:
            reading_id = self._create_reading(api_client, cust_id)
            # Do not send monthly_fee - server should default to 5.0
            payload = {
                "customer_id": cust_id,
                "reading_id": reading_id,
                "month": datetime.utcnow().strftime("%Y-%m"),
                "consumption_charge": 85.0,
                "total_amount": 90.0,
                "previous_balance": 0.0,
                "amount_paid": 0.0,
            }
            r = api_client.post(f"{API}/invoices", json=payload)
            assert r.status_code == 200, r.text
            inv = r.json()
            assert inv["monthly_fee"] == 5.0
            assert inv["invoice_number"] is not None
            assert len(inv["invoice_number"]) == 5
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


# ==================== Iteration 8: DELETE customer cascade ====================

class TestCustomerCascadeDelete:
    """
    DELETE /api/customers/{id} must cascade-delete:
    - all invoices for that customer
    - all readings for that customer
    - all payments for that customer
    AND decrement generator.subscriber_count.
    """

    def _make_customer(self, api_client, gen_id):
        payload = {
            "name": f"TEST_CASCADE_{uuid.uuid4().hex[:6]}",
            "phone": "07799999999",
            "address": "TEST",
            "area": "المسعودية",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
        }
        r = api_client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _make_reading(self, api_client, cust_id):
        r = api_client.post(f"{API}/readings", json={
            "customer_id": cust_id,
            "previous_reading": 0.0,
            "current_reading": 100.0,
            "reading_date": datetime.utcnow().isoformat(),
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _make_invoice(self, api_client, cust_id, reading_id):
        r = api_client.post(f"{API}/invoices", json={
            "customer_id": cust_id,
            "reading_id": reading_id,
            "month": datetime.utcnow().strftime("%Y-%m"),
            "consumption_charge": 85.0,
            "monthly_fee": 5.0,
            "total_amount": 90.0,
            "previous_balance": 0.0,
            "amount_paid": 0.0,
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_delete_customer_cascades_invoices_readings_and_decrements_generator(
        self, api_client
    ):
        # pick a generator, capture initial subscriber_count
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        initial_count = gens[0]["subscriber_count"]

        # create customer -> +1 to subscriber_count
        cust_id = self._make_customer(api_client, gen_id)
        after_create = api_client.get(f"{API}/generators/{gen_id}").json()
        assert after_create["subscriber_count"] == initial_count + 1

        # create reading + invoice
        reading_id = self._make_reading(api_client, cust_id)
        invoice_id = self._make_invoice(api_client, cust_id, reading_id)

        # sanity: they exist and are linked
        inv_before = api_client.get(f"{API}/invoices", params={"customer_id": cust_id}).json()
        rd_before = api_client.get(f"{API}/readings", params={"customer_id": cust_id}).json()
        assert len(inv_before) >= 1 and any(i["id"] == invoice_id for i in inv_before)
        assert len(rd_before) >= 1 and any(r["id"] == reading_id for r in rd_before)

        # cascade delete
        d = api_client.delete(f"{API}/customers/{cust_id}")
        assert d.status_code == 200, d.text
        assert "message" in d.json()

        # customer is gone
        assert api_client.get(f"{API}/customers/{cust_id}").status_code == 404

        # invoices for this customer are gone
        inv_after = api_client.get(f"{API}/invoices", params={"customer_id": cust_id}).json()
        assert inv_after == [], f"Orphan invoices remained: {inv_after}"

        # individual invoice endpoint should 404
        assert api_client.get(f"{API}/invoices/{invoice_id}").status_code == 404

        # readings for this customer are gone
        rd_after = api_client.get(f"{API}/readings", params={"customer_id": cust_id}).json()
        assert rd_after == [], f"Orphan readings remained: {rd_after}"

        # generator subscriber_count decremented back to initial
        after_delete = api_client.get(f"{API}/generators/{gen_id}").json()
        assert after_delete["subscriber_count"] == initial_count, (
            f"subscriber_count not decremented: initial={initial_count}, "
            f"after_delete={after_delete['subscriber_count']}"
        )

    def test_delete_customer_only_cascades_own_data_not_others(self, api_client):
        """Deleting customer A must NOT delete customer B's invoices/readings."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]

        cust_a = self._make_customer(api_client, gen_id)
        cust_b = self._make_customer(api_client, gen_id)

        rd_a = self._make_reading(api_client, cust_a)
        rd_b = self._make_reading(api_client, cust_b)
        inv_a = self._make_invoice(api_client, cust_a, rd_a)
        inv_b = self._make_invoice(api_client, cust_b, rd_b)

        # delete A
        assert api_client.delete(f"{API}/customers/{cust_a}").status_code == 200

        # A's data gone
        assert api_client.get(f"{API}/invoices/{inv_a}").status_code == 404
        # B's data still present
        rb = api_client.get(f"{API}/invoices/{inv_b}")
        assert rb.status_code == 200, rb.text
        assert rb.json()["customer_id"] == cust_b

        rd_b_list = api_client.get(f"{API}/readings", params={"customer_id": cust_b}).json()
        assert any(r["id"] == rd_b for r in rd_b_list)

        # cleanup B
        api_client.delete(f"{API}/customers/{cust_b}")

    def test_delete_nonexistent_customer_returns_404(self, api_client):
        # well-formed but non-existing ObjectId
        fake_id = "507f1f77bcf86cd799439011"
        r = api_client.delete(f"{API}/customers/{fake_id}")
        assert r.status_code == 404, r.text

    def test_invoice_creation_returns_invoice_id_in_response(self, api_client):
        """Frontend uses returned id to redirect to /invoices/{id}?autoWhatsApp=1."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._make_customer(api_client, gen_id)
        try:
            reading_id = self._make_reading(api_client, cust_id)
            r = api_client.post(f"{API}/invoices", json={
                "customer_id": cust_id,
                "reading_id": reading_id,
                "month": datetime.utcnow().strftime("%Y-%m"),
                "consumption_charge": 85.0,
                "monthly_fee": 5.0,
                "total_amount": 90.0,
                "previous_balance": 0.0,
                "amount_paid": 0.0,
            })
            assert r.status_code == 200, r.text
            body = r.json()
            assert "id" in body and isinstance(body["id"], str) and len(body["id"]) > 0
            # verify it's fetchable
            got = api_client.get(f"{API}/invoices/{body['id']}")
            assert got.status_code == 200
            assert got.json()["customer_id"] == cust_id
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")


# ==================== Iteration 9: Payment cascade delete fix ====================

MONGO_URL = None
DB_NAME = None
with open("/app/backend/.env") as _f:
    for _l in _f:
        _l = _l.strip()
        if _l.startswith("MONGO_URL="):
            MONGO_URL = _l.split("=", 1)[1].strip().strip('"')
        elif _l.startswith("DB_NAME="):
            DB_NAME = _l.split("=", 1)[1].strip().strip('"')


@pytest.fixture(scope="module")
def mongo_db():
    assert MONGO_URL and DB_NAME, "Mongo config missing"
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


class TestPaymentCascadeDelete:
    """Iteration 9 fix: add_payment must persist customer_id on payment doc so
    that DELETE /api/customers/{id} cascade-deletes payments (no orphans)."""

    def _make_customer(self, api_client, gen_id):
        payload = {
            "name": f"TEST_PAYCASCADE_{uuid.uuid4().hex[:6]}",
            "phone": "07788888888",
            "address": "TEST",
            "area": "المسعودية",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": gen_id,
            "previous_balance": 0.0,
        }
        r = api_client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _make_reading(self, api_client, cust_id):
        r = api_client.post(f"{API}/readings", json={
            "customer_id": cust_id,
            "previous_reading": 0.0,
            "current_reading": 100.0,
            "reading_date": datetime.utcnow().isoformat(),
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _make_invoice(self, api_client, cust_id, reading_id):
        r = api_client.post(f"{API}/invoices", json={
            "customer_id": cust_id,
            "reading_id": reading_id,
            "month": datetime.utcnow().strftime("%Y-%m"),
            "consumption_charge": 85.0,
            "monthly_fee": 5.0,
            "total_amount": 90.0,
            "previous_balance": 0.0,
            "amount_paid": 0.0,
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_add_payment_persists_customer_id_on_payment_doc(self, api_client, mongo_db):
        """The fix under review: payment_dict['customer_id'] must be set on insert."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._make_customer(api_client, gen_id)
        try:
            reading_id = self._make_reading(api_client, cust_id)
            invoice_id = self._make_invoice(api_client, cust_id, reading_id)

            pr = api_client.post(
                f"{API}/invoices/{invoice_id}/payment",
                json={"amount": 30.0, "notes": "TEST_PAYCASCADE"},
            )
            assert pr.status_code == 200, pr.text

            # Directly query the payments collection
            payment_docs = list(mongo_db.payments.find({"invoice_id": invoice_id}))
            assert len(payment_docs) == 1, f"Expected 1 payment, got {len(payment_docs)}"
            p = payment_docs[0]
            assert "customer_id" in p, f"customer_id NOT persisted on payment: {p}"
            assert p["customer_id"] == cust_id, (
                f"customer_id mismatch: expected {cust_id}, got {p.get('customer_id')}"
            )
            assert p["amount"] == 30.0
            assert p["invoice_id"] == invoice_id
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_delete_customer_removes_all_payments(self, api_client, mongo_db):
        """Full cascade: customer -> invoice -> payment(s), then DELETE customer
        must remove all payments. Verify via direct mongo query."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]
        cust_id = self._make_customer(api_client, gen_id)

        reading_id = self._make_reading(api_client, cust_id)
        invoice_id = self._make_invoice(api_client, cust_id, reading_id)

        # 2 partial payments
        p1 = api_client.post(f"{API}/invoices/{invoice_id}/payment",
                             json={"amount": 20.0})
        p2 = api_client.post(f"{API}/invoices/{invoice_id}/payment",
                             json={"amount": 25.0})
        assert p1.status_code == 200 and p2.status_code == 200

        # Sanity: 2 payment docs exist with the customer_id
        pre = list(mongo_db.payments.find({"customer_id": cust_id}))
        assert len(pre) == 2, f"Expected 2 payments before delete, got {len(pre)}"

        # DELETE the customer
        d = api_client.delete(f"{API}/customers/{cust_id}")
        assert d.status_code == 200, d.text

        # No payments should remain for this customer
        post_by_cust = list(mongo_db.payments.find({"customer_id": cust_id}))
        assert post_by_cust == [], f"Orphan payments by customer_id: {post_by_cust}"

        # And no payments referencing the now-deleted invoice either
        post_by_inv = list(mongo_db.payments.find({"invoice_id": invoice_id}))
        assert post_by_inv == [], f"Orphan payments by invoice_id: {post_by_inv}"

    def test_delete_customer_does_not_touch_other_customers_payments(
        self, api_client, mongo_db
    ):
        """Isolation: deleting customer A must not delete customer B's payments."""
        gens = api_client.get(f"{API}/generators").json()
        gen_id = gens[0]["id"]

        cust_a = self._make_customer(api_client, gen_id)
        cust_b = self._make_customer(api_client, gen_id)

        try:
            rd_a = self._make_reading(api_client, cust_a)
            rd_b = self._make_reading(api_client, cust_b)
            inv_a = self._make_invoice(api_client, cust_a, rd_a)
            inv_b = self._make_invoice(api_client, cust_b, rd_b)

            assert api_client.post(f"{API}/invoices/{inv_a}/payment",
                                   json={"amount": 10.0}).status_code == 200
            assert api_client.post(f"{API}/invoices/{inv_b}/payment",
                                   json={"amount": 15.0}).status_code == 200

            # Delete A
            assert api_client.delete(f"{API}/customers/{cust_a}").status_code == 200

            # A's payments gone
            a_pays = list(mongo_db.payments.find({"customer_id": cust_a}))
            assert a_pays == [], f"A payments not deleted: {a_pays}"

            # B's payments still there
            b_pays = list(mongo_db.payments.find({"customer_id": cust_b}))
            assert len(b_pays) == 1, f"B payments lost: {b_pays}"
            assert b_pays[0]["amount"] == 15.0
            assert b_pays[0]["invoice_id"] == inv_b
        finally:
            # cleanup B (will also cascade its payment)
            api_client.delete(f"{API}/customers/{cust_b}")
            # confirm cleanup
            assert list(mongo_db.payments.find({"customer_id": cust_b})) == []


# ==================== Iteration 10: Dashboard kWh + expense breakdown + 'oil' type ====================

class TestDashboardMonthlyStats:
    """
    Iteration 10:
    GET /api/stats/dashboard must additionally return:
      total_monthly_kwh, monthly_fuel_expense, monthly_oil_expense,
      monthly_maintenance_expense, monthly_other_expense,
      monthly_total_expenses, monthly_net_profit
    Also: POST /api/expenses must accept expense_type='oil'.
    """

    def _gen_id(self, api_client):
        return api_client.get(f"{API}/generators").json()[0]["id"]

    def _new_customer(self, api_client):
        payload = {
            "name": f"TEST_ITER10_{uuid.uuid4().hex[:6]}",
            "phone": "07755555555",
            "address": "TEST",
            "area": "المسعودية",
            "meter_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "generator_id": self._gen_id(api_client),
            "previous_balance": 0.0,
        }
        r = api_client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _new_reading(self, api_client, cust_id, prev, curr, date_iso=None):
        r = api_client.post(f"{API}/readings", json={
            "customer_id": cust_id,
            "previous_reading": prev,
            "current_reading": curr,
            "reading_date": (date_iso or datetime.utcnow().isoformat()),
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def _new_expense(self, api_client, etype, amount, date_iso=None):
        r = api_client.post(f"{API}/expenses", json={
            "expense_type": etype,
            "amount": amount,
            "description": f"TEST_ITER10_{etype}",
            "expense_date": (date_iso or datetime.utcnow().isoformat()),
        })
        assert r.status_code == 200, f"{etype} expense failed: {r.status_code} {r.text}"
        return r.json()

    def test_dashboard_response_contains_all_new_fields(self, api_client):
        r = api_client.get(f"{API}/stats/dashboard")
        assert r.status_code == 200, r.text
        data = r.json()
        for key in [
            "total_monthly_kwh",
            "monthly_fuel_expense",
            "monthly_oil_expense",
            "monthly_maintenance_expense",
            "monthly_other_expense",
            "monthly_total_expenses",
            "monthly_net_profit",
        ]:
            assert key in data, f"Missing dashboard field: {key}"
            assert isinstance(data[key], (int, float)), f"{key} not numeric: {data[key]}"

    def test_create_expense_type_oil_succeeds(self, api_client):
        exp = self._new_expense(api_client, "oil", 12.34)
        assert exp["expense_type"] == "oil"
        assert exp["amount"] == 12.34
        assert "id" in exp and exp["id"]
        # cleanup
        api_client.delete(f"{API}/expenses/{exp['id']}")

    def test_create_expense_types_fuel_maintenance_other_still_work(self, api_client):
        created = []
        try:
            for etype in ("fuel", "maintenance", "other"):
                exp = self._new_expense(api_client, etype, 1.0)
                assert exp["expense_type"] == etype
                created.append(exp["id"])
            # list contains them
            r = api_client.get(f"{API}/expenses")
            assert r.status_code == 200
            all_types = {e["expense_type"] for e in r.json()}
            assert {"fuel", "maintenance", "other"}.issubset(all_types)
        finally:
            for eid in created:
                api_client.delete(f"{API}/expenses/{eid}")

    def test_kwh_and_expense_deltas_after_create(self, api_client):
        """Snapshot dashboard, add 1 reading (55 kWh, current month) + 4 expenses
        (fuel/oil/maintenance/other), and verify each field increases by the exact
        amount. This isolates the calculation without depending on absolute values."""
        before = api_client.get(f"{API}/stats/dashboard").json()

        cust_id = self._new_customer(api_client)
        created_expenses = []
        try:
            # Reading in the current month (utcnow) - consumption = 55.0
            self._new_reading(api_client, cust_id, 0.0, 55.0)

            # Distinct amounts to detect miscategorization
            e_fuel = self._new_expense(api_client, "fuel", 11.0)
            e_oil = self._new_expense(api_client, "oil", 22.0)
            e_maint = self._new_expense(api_client, "maintenance", 33.0)
            e_other = self._new_expense(api_client, "other", 44.0)
            created_expenses += [e_fuel["id"], e_oil["id"], e_maint["id"], e_other["id"]]

            after = api_client.get(f"{API}/stats/dashboard").json()

            # kWh delta
            assert round(after["total_monthly_kwh"] - before["total_monthly_kwh"], 2) == 55.0, (
                f"kWh delta wrong. before={before['total_monthly_kwh']} after={after['total_monthly_kwh']}"
            )
            # Expense deltas per type
            assert round(after["monthly_fuel_expense"] - before["monthly_fuel_expense"], 2) == 11.0
            assert round(after["monthly_oil_expense"] - before["monthly_oil_expense"], 2) == 22.0
            assert round(after["monthly_maintenance_expense"] - before["monthly_maintenance_expense"], 2) == 33.0
            assert round(after["monthly_other_expense"] - before["monthly_other_expense"], 2) == 44.0
            # Total delta = 110
            assert round(after["monthly_total_expenses"] - before["monthly_total_expenses"], 2) == 110.0
            # monthly_total_expenses == sum of four buckets (invariant check on 'after')
            assert round(
                after["monthly_fuel_expense"] + after["monthly_oil_expense"]
                + after["monthly_maintenance_expense"] + after["monthly_other_expense"]
                - after["monthly_total_expenses"], 2
            ) == 0.0, f"Sum of buckets != monthly_total_expenses: {after}"
            # net_profit == month_revenue - monthly_total_expenses
            assert round(
                after["month_revenue"] - after["monthly_total_expenses"]
                - after["monthly_net_profit"], 2
            ) == 0.0, f"monthly_net_profit != month_revenue - monthly_total_expenses: {after}"
        finally:
            for eid in created_expenses:
                api_client.delete(f"{API}/expenses/{eid}")
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_previous_month_reading_not_counted_in_monthly_kwh(self, api_client):
        """Reading dated in a previous month must NOT affect total_monthly_kwh."""
        before = api_client.get(f"{API}/stats/dashboard").json()
        cust_id = self._new_customer(api_client)
        try:
            # A safely-in-the-past date (2023) that is definitely not current month
            past = datetime(2023, 6, 15, 10, 0, 0).isoformat()
            self._new_reading(api_client, cust_id, 0.0, 999.0, past)
            after = api_client.get(f"{API}/stats/dashboard").json()
            assert after["total_monthly_kwh"] == before["total_monthly_kwh"], (
                f"Past reading leaked into monthly kWh: before={before['total_monthly_kwh']} "
                f"after={after['total_monthly_kwh']}"
            )
        finally:
            api_client.delete(f"{API}/customers/{cust_id}")

    def test_previous_month_expense_not_counted_in_monthly_expenses(self, api_client):
        """Expense dated in a previous month must NOT affect monthly expense buckets."""
        before = api_client.get(f"{API}/stats/dashboard").json()
        past = datetime(2023, 6, 15, 10, 0, 0).isoformat()
        exp = self._new_expense(api_client, "oil", 500.0, past)
        try:
            after = api_client.get(f"{API}/stats/dashboard").json()
            assert after["monthly_oil_expense"] == before["monthly_oil_expense"], (
                f"Past oil expense leaked: before={before['monthly_oil_expense']} "
                f"after={after['monthly_oil_expense']}"
            )
            assert after["monthly_total_expenses"] == before["monthly_total_expenses"]
        finally:
            api_client.delete(f"{API}/expenses/{exp['id']}")

    def test_delete_expense_still_works(self, api_client):
        exp = self._new_expense(api_client, "oil", 7.77)
        eid = exp["id"]
        d = api_client.delete(f"{API}/expenses/{eid}")
        assert d.status_code == 200, d.text
        # Verify removed from list
        r = api_client.get(f"{API}/expenses")
        assert r.status_code == 200
        assert not any(e["id"] == eid for e in r.json())
