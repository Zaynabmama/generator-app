#!/usr/bin/env python3
"""
Backend API Testing Script for Arabic Generator Subscription Management App
Tests all backend endpoints sequentially
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Backend URL
BASE_URL = "https://gen-subscriptions-ar.preview.emergentagent.com/api"

# Test credentials
USERNAME = "MS"
PASSWORD = "Ms28796610**"

# Store test data IDs
test_data = {
    "generators": [],
    "customers": [],
    "readings": [],
    "invoices": [],
    "expenses": []
}

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(test_name: str):
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}Testing: {test_name}{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}")

def print_success(message: str):
    print(f"{Colors.GREEN}✓ {message}{Colors.END}")

def print_error(message: str):
    print(f"{Colors.RED}✗ {message}{Colors.END}")

def print_info(message: str):
    print(f"{Colors.YELLOW}ℹ {message}{Colors.END}")

def make_request(method: str, endpoint: str, data: Optional[Dict] = None, params: Optional[Dict] = None) -> tuple:
    """Make HTTP request and return (success, response_data, status_code)"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url, params=params, timeout=10)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=10)
        elif method == "PUT":
            response = requests.put(url, json=data, timeout=10)
        elif method == "DELETE":
            response = requests.delete(url, timeout=10)
        else:
            return False, {"error": "Invalid method"}, 0
        
        try:
            response_data = response.json()
        except:
            response_data = {"text": response.text}
        
        return response.status_code < 400, response_data, response.status_code
    except Exception as e:
        return False, {"error": str(e)}, 0

# ==================== Test Functions ====================

def test_authentication():
    """Test 1: Authentication"""
    print_test("1. Authentication - POST /api/auth/login")
    
    # Test with correct credentials
    success, data, status = make_request("POST", "/auth/login", {
        "username": USERNAME,
        "password": PASSWORD
    })
    
    if success and data.get("success"):
        print_success(f"Login successful with status {status}")
        print_info(f"User: {json.dumps(data.get('user'), ensure_ascii=False)}")
        print_info(f"Message: {data.get('message')}")
        return True
    else:
        print_error(f"Login failed with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_dashboard_stats():
    """Test 2: Dashboard Stats"""
    print_test("2. Dashboard Stats - GET /api/stats/dashboard")
    
    success, data, status = make_request("GET", "/stats/dashboard")
    
    if success:
        print_success(f"Dashboard stats retrieved with status {status}")
        print_info(f"Total Customers: {data.get('total_customers')}")
        print_info(f"Total Generators: {data.get('total_generators')}")
        print_info(f"Unpaid Invoices: {data.get('unpaid_invoices')}")
        print_info(f"Total Debt: {data.get('total_debt')} IQD")
        print_info(f"Month Revenue: {data.get('month_revenue')} IQD")
        print_info(f"Overdue Count: {data.get('overdue_count')}")
        return True
    else:
        print_error(f"Failed to get dashboard stats with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_create_generators():
    """Test 3: Create Generators"""
    print_test("3. Generators - POST /api/generators")
    
    generators_to_create = [
        {"name": "مولد 150 kVA", "capacity": 150, "notes": ""},
        {"name": "مولد 250 kVA", "capacity": 250, "notes": ""},
        {"name": "مولد 300 kVA", "capacity": 300, "notes": ""}
    ]
    
    all_success = True
    for gen_data in generators_to_create:
        success, data, status = make_request("POST", "/generators", gen_data)
        
        if success and data.get("id"):
            test_data["generators"].append(data)
            print_success(f"Created generator: {gen_data['name']} (ID: {data['id']})")
        else:
            print_error(f"Failed to create generator: {gen_data['name']}")
            print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
            all_success = False
    
    return all_success

def test_get_generators():
    """Test 4: Get All Generators"""
    print_test("4. Generators - GET /api/generators")
    
    success, data, status = make_request("GET", "/generators")
    
    if success and isinstance(data, list):
        print_success(f"Retrieved {len(data)} generators with status {status}")
        for gen in data:
            print_info(f"  - {gen.get('name')} ({gen.get('capacity')} kVA) - Subscribers: {gen.get('subscriber_count')}")
        return True
    else:
        print_error(f"Failed to get generators with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_create_customer():
    """Test 5: Create Customer"""
    print_test("5. Customers - POST /api/customers")
    
    if not test_data["generators"]:
        print_error("No generators available. Cannot create customer.")
        return False
    
    generator_id = test_data["generators"][0]["id"]
    customer_data = {
        "name": "أحمد محمد علي",
        "phone": "07701234567",
        "address": "شارع الرئيسي، بناية 15",
        "area": "المسعودية",
        "amperage": 50,
        "meter_number": "MTR-001",
        "generator_id": generator_id,
        "previous_balance": 0.0,
        "notes": "عميل جديد"
    }
    
    success, data, status = make_request("POST", "/customers", customer_data)
    
    if success and data.get("id"):
        test_data["customers"].append(data)
        print_success(f"Created customer: {customer_data['name']} (ID: {data['id']})")
        print_info(f"Phone: {data.get('phone')}, Area: {data.get('area')}, Amperage: {data.get('amperage')}")
        return True
    else:
        print_error(f"Failed to create customer with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_get_customers():
    """Test 6: Get All Customers"""
    print_test("6. Customers - GET /api/customers")
    
    success, data, status = make_request("GET", "/customers")
    
    if success and isinstance(data, list):
        print_success(f"Retrieved {len(data)} customers with status {status}")
        for customer in data:
            print_info(f"  - {customer.get('name')} ({customer.get('phone')}) - Balance: {customer.get('current_balance')} IQD")
        return True
    else:
        print_error(f"Failed to get customers with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_search_customers():
    """Test 7: Search Customers"""
    print_test("7. Customers - GET /api/customers?search=أحمد")
    
    success, data, status = make_request("GET", "/customers", params={"search": "أحمد"})
    
    if success and isinstance(data, list):
        print_success(f"Search returned {len(data)} customers with status {status}")
        for customer in data:
            print_info(f"  - {customer.get('name')} ({customer.get('phone')})")
        return True
    else:
        print_error(f"Failed to search customers with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_create_reading():
    """Test 8: Create Meter Reading"""
    print_test("8. Meter Readings - POST /api/readings")
    
    if not test_data["customers"]:
        print_error("No customers available. Cannot create reading.")
        return False
    
    customer_id = test_data["customers"][0]["id"]
    reading_data = {
        "customer_id": customer_id,
        "previous_reading": 1000.0,
        "current_reading": 1500.0,
        "reading_date": datetime.utcnow().isoformat(),
        "notes": "قراءة شهر يناير"
    }
    
    success, data, status = make_request("POST", "/readings", reading_data)
    
    if success and data.get("id"):
        test_data["readings"].append(data)
        print_success(f"Created reading (ID: {data['id']})")
        print_info(f"Previous: {data.get('previous_reading')} kWh, Current: {data.get('current_reading')} kWh")
        print_info(f"Consumption: {data.get('consumption')} kWh")
        return True
    else:
        print_error(f"Failed to create reading with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_get_readings():
    """Test 9: Get Readings for Customer"""
    print_test("9. Meter Readings - GET /api/readings?customer_id=<id>")
    
    if not test_data["customers"]:
        print_error("No customers available. Cannot get readings.")
        return False
    
    customer_id = test_data["customers"][0]["id"]
    success, data, status = make_request("GET", "/readings", params={"customer_id": customer_id})
    
    if success and isinstance(data, list):
        print_success(f"Retrieved {len(data)} readings with status {status}")
        for reading in data:
            print_info(f"  - Reading ID: {reading.get('id')}, Consumption: {reading.get('consumption')} kWh")
        return True
    else:
        print_error(f"Failed to get readings with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_create_invoice():
    """Test 10: Create Invoice"""
    print_test("10. Invoices - POST /api/invoices")
    
    if not test_data["customers"] or not test_data["readings"]:
        print_error("No customers or readings available. Cannot create invoice.")
        return False
    
    customer_id = test_data["customers"][0]["id"]
    reading_id = test_data["readings"][0]["id"]
    
    # Calculate charges based on default pricing
    amperage = test_data["customers"][0]["amperage"]
    consumption = test_data["readings"][0]["consumption"]
    amperage_charge = amperage * 5000  # 5000 IQD per ampere
    consumption_charge = consumption * 150  # 150 IQD per kWh
    total_amount = amperage_charge + consumption_charge
    
    invoice_data = {
        "customer_id": customer_id,
        "reading_id": reading_id,
        "month": datetime.utcnow().strftime('%Y-%m'),
        "amperage_charge": amperage_charge,
        "consumption_charge": consumption_charge,
        "total_amount": total_amount,
        "previous_balance": 0.0,
        "amount_paid": 0.0,
        "notes": "فاتورة شهر يناير"
    }
    
    success, data, status = make_request("POST", "/invoices", invoice_data)
    
    if success and data.get("id"):
        test_data["invoices"].append(data)
        print_success(f"Created invoice (ID: {data['id']})")
        print_info(f"Amperage Charge: {data.get('amperage_charge')} IQD")
        print_info(f"Consumption Charge: {data.get('consumption_charge')} IQD")
        print_info(f"Total Amount: {data.get('total_amount')} IQD")
        print_info(f"Status: {data.get('status')}")
        return True
    else:
        print_error(f"Failed to create invoice with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_get_invoices():
    """Test 11: Get All Invoices"""
    print_test("11. Invoices - GET /api/invoices")
    
    success, data, status = make_request("GET", "/invoices")
    
    if success and isinstance(data, list):
        print_success(f"Retrieved {len(data)} invoices with status {status}")
        for invoice in data:
            print_info(f"  - Invoice ID: {invoice.get('id')}, Total: {invoice.get('total_amount')} IQD, Status: {invoice.get('status')}")
        return True
    else:
        print_error(f"Failed to get invoices with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_add_payment():
    """Test 12: Add Payment to Invoice"""
    print_test("12. Invoices - POST /api/invoices/{id}/payment")
    
    if not test_data["invoices"]:
        print_error("No invoices available. Cannot add payment.")
        return False
    
    invoice_id = test_data["invoices"][0]["id"]
    payment_amount = 100000.0  # Partial payment
    
    payment_data = {
        "invoice_id": invoice_id,
        "amount": payment_amount,
        "payment_date": datetime.utcnow().isoformat(),
        "notes": "دفعة جزئية"
    }
    
    success, data, status = make_request("POST", f"/invoices/{invoice_id}/payment", payment_data)
    
    if success:
        print_success(f"Payment added successfully with status {status}")
        print_info(f"Message: {data.get('message')}")
        print_info(f"New Remaining: {data.get('new_remaining')} IQD")
        return True
    else:
        print_error(f"Failed to add payment with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_create_expense():
    """Test 13: Create Expense"""
    print_test("13. Expenses - POST /api/expenses")
    
    expense_data = {
        "expense_type": "fuel",
        "amount": 500000.0,
        "description": "شراء وقود للمولدات",
        "expense_date": datetime.utcnow().isoformat(),
        "notes": "وقود ديزل"
    }
    
    success, data, status = make_request("POST", "/expenses", expense_data)
    
    if success and data.get("id"):
        test_data["expenses"].append(data)
        print_success(f"Created expense (ID: {data['id']})")
        print_info(f"Type: {data.get('expense_type')}, Amount: {data.get('amount')} IQD")
        print_info(f"Description: {data.get('description')}")
        return True
    else:
        print_error(f"Failed to create expense with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_get_expenses():
    """Test 14: Get All Expenses"""
    print_test("14. Expenses - GET /api/expenses")
    
    success, data, status = make_request("GET", "/expenses")
    
    if success and isinstance(data, list):
        print_success(f"Retrieved {len(data)} expenses with status {status}")
        for expense in data:
            print_info(f"  - {expense.get('expense_type')}: {expense.get('amount')} IQD - {expense.get('description')}")
        return True
    else:
        print_error(f"Failed to get expenses with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_debt_report():
    """Test 15: Get Debt Report"""
    print_test("15. Reports - GET /api/reports/debts")
    
    success, data, status = make_request("GET", "/reports/debts")
    
    if success:
        print_success(f"Retrieved debt report with status {status}")
        print_info(f"Total Debt: {data.get('total_debt')} IQD")
        print_info(f"Debt by Area: {json.dumps(data.get('debt_by_area'), ensure_ascii=False)}")
        print_info(f"Number of Debtors: {len(data.get('debtor_list', []))}")
        return True
    else:
        print_error(f"Failed to get debt report with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_financial_report():
    """Test 16: Get Financial Report"""
    print_test("16. Reports - GET /api/reports/financial")
    
    success, data, status = make_request("GET", "/reports/financial")
    
    if success:
        print_success(f"Retrieved financial report with status {status}")
        print_info(f"Total Revenue: {data.get('total_revenue')} IQD")
        print_info(f"Total Expenses: {data.get('total_expenses')} IQD")
        print_info(f"Net Profit: {data.get('net_profit')} IQD")
        print_info(f"Expenses by Type: {json.dumps(data.get('expenses_by_type'), ensure_ascii=False)}")
        return True
    else:
        print_error(f"Failed to get financial report with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

def test_consumption_report():
    """Test 17: Get Consumption Report"""
    print_test("17. Reports - GET /api/reports/consumption")
    
    success, data, status = make_request("GET", "/reports/consumption")
    
    if success:
        print_success(f"Retrieved consumption report with status {status}")
        print_info(f"Total Consumption: {data.get('total_consumption')} kWh")
        print_info(f"Consumption by Area: {json.dumps(data.get('consumption_by_area'), ensure_ascii=False)}")
        return True
    else:
        print_error(f"Failed to get consumption report with status {status}")
        print_error(f"Response: {json.dumps(data, ensure_ascii=False)}")
        return False

# ==================== Main Test Runner ====================

def main():
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}Arabic Generator Subscription Management - Backend API Tests{Colors.END}")
    print(f"{Colors.BLUE}Backend URL: {BASE_URL}{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}")
    
    results = {}
    
    # Run all tests in sequence
    results["Authentication"] = test_authentication()
    results["Dashboard Stats"] = test_dashboard_stats()
    results["Create Generators"] = test_create_generators()
    results["Get Generators"] = test_get_generators()
    results["Create Customer"] = test_create_customer()
    results["Get Customers"] = test_get_customers()
    results["Search Customers"] = test_search_customers()
    results["Create Reading"] = test_create_reading()
    results["Get Readings"] = test_get_readings()
    results["Create Invoice"] = test_create_invoice()
    results["Get Invoices"] = test_get_invoices()
    results["Add Payment"] = test_add_payment()
    results["Create Expense"] = test_create_expense()
    results["Get Expenses"] = test_get_expenses()
    results["Debt Report"] = test_debt_report()
    results["Financial Report"] = test_financial_report()
    results["Consumption Report"] = test_consumption_report()
    
    # Print summary
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}TEST SUMMARY{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = f"{Colors.GREEN}PASSED{Colors.END}" if result else f"{Colors.RED}FAILED{Colors.END}"
        print(f"{test_name}: {status}")
    
    print(f"\n{Colors.BLUE}Total: {passed}/{total} tests passed{Colors.END}")
    
    if passed == total:
        print(f"{Colors.GREEN}All tests passed successfully!{Colors.END}")
        return 0
    else:
        print(f"{Colors.RED}Some tests failed. Please review the output above.{Colors.END}")
        return 1

if __name__ == "__main__":
    exit(main())
