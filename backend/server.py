from fastapi import FastAPI, APIRouter, HTTPException, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta
from bson import ObjectId
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Helper function to convert ObjectId to string
def str_id(doc):
    if doc and '_id' in doc:
        doc['id'] = str(doc['_id'])
        del doc['_id']
    return doc

# ==================== Models ====================

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    message: str
    user: Optional[dict] = None

class CustomerCreate(BaseModel):
    name: str
    phone: str
    address: str
    area: str  # المسعودية، الشرقي، الحيصة، الغربي
    meter_number: str  # رقم العداد
    generator_id: str  # المولد التابع له
    previous_balance: float = 0.0  # الرصيد السابق
    notes: str = ""

class Customer(BaseModel):
    id: Optional[str] = None
    name: str
    phone: str
    address: str
    area: str
    meter_number: str
    generator_id: str
    previous_balance: float = 0.0
    current_balance: float = 0.0  # الرصيد الحالي
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class GeneratorCreate(BaseModel):
    name: str  # مثال: مولد 150 kVA
    capacity: int  # 150, 250, 300
    notes: str = ""

class Generator(BaseModel):
    id: Optional[str] = None
    name: str
    capacity: int
    notes: str = ""
    subscriber_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MeterReadingCreate(BaseModel):
    customer_id: str
    previous_reading: float
    current_reading: float
    reading_date: datetime = Field(default_factory=datetime.utcnow)
    notes: str = ""

class MeterReading(BaseModel):
    id: Optional[str] = None
    customer_id: str
    previous_reading: float
    current_reading: float
    consumption: float  # الاستهلاك = القراءة الحالية - القراءة السابقة
    reading_date: datetime
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class InvoiceCreate(BaseModel):
    customer_id: str
    reading_id: str
    month: str  # YYYY-MM
    consumption_charge: float  # رسم الاستهلاك
    monthly_fee: float = 5.0  # رسم الاشتراك الشهري $5
    total_amount: float  # المبلغ الإجمالي
    previous_balance: float = 0.0  # الرصيد السابق
    amount_paid: float = 0.0  # المبلغ المدفوع
    notes: str = ""

class Invoice(BaseModel):
    id: Optional[str] = None
    customer_id: str
    reading_id: str
    month: str
    consumption_charge: float
    monthly_fee: float = 5.0
    total_amount: float
    previous_balance: float = 0.0
    amount_paid: float = 0.0
    remaining_amount: float = 0.0  # المبلغ المتبقي
    status: str = "unpaid"  # paid, unpaid, partial
    due_date: datetime  # تاريخ الاستحقاق
    is_overdue: bool = False
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ExpenseCreate(BaseModel):
    expense_type: str  # fuel, maintenance, other
    amount: float
    description: str
    expense_date: datetime = Field(default_factory=datetime.utcnow)
    notes: str = ""

class Expense(BaseModel):
    id: Optional[str] = None
    expense_type: str
    amount: float
    description: str
    expense_date: datetime
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentCreate(BaseModel):
    amount: float
    payment_date: datetime = Field(default_factory=datetime.utcnow)
    notes: str = ""

# ==================== Authentication ====================

@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    # Hardcoded credentials for admin
    ADMIN_USERNAME = "MS"
    ADMIN_PASSWORD = "Ms28796610**"
    
    if request.username == ADMIN_USERNAME and request.password == ADMIN_PASSWORD:
        return LoginResponse(
            success=True,
            message="تم تسجيل الدخول بنجاح",
            user={"username": ADMIN_USERNAME, "role": "admin"}
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اسم المستخدم أو كلمة المرور غير صحيحة"
        )

# ==================== Customer APIs ====================

@api_router.post("/customers", response_model=Customer)
async def create_customer(customer: CustomerCreate):
    customer_dict = customer.dict()
    customer_dict['current_balance'] = customer.previous_balance
    customer_dict['created_at'] = datetime.utcnow()
    customer_dict['updated_at'] = datetime.utcnow()
    
    result = await db.customers.insert_one(customer_dict)
    customer_dict['id'] = str(result.inserted_id)
    
    # Update generator subscriber count
    await db.generators.update_one(
        {"_id": ObjectId(customer.generator_id)},
        {"$inc": {"subscriber_count": 1}}
    )
    
    return Customer(**customer_dict)

@api_router.get("/customers", response_model=List[Customer])
async def get_customers(
    area: Optional[str] = None,
    generator_id: Optional[str] = None,
    search: Optional[str] = None
):
    query = {}
    if area:
        query['area'] = area
    if generator_id:
        query['generator_id'] = generator_id
    if search:
        query['$or'] = [
            {'name': {'$regex': search, '$options': 'i'}},
            {'phone': {'$regex': search, '$options': 'i'}}
        ]
    
    customers = await db.customers.find(query).to_list(1000)
    return [Customer(**str_id(c)) for c in customers]

@api_router.get("/customers/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str):
    customer = await db.customers.find_one({"_id": ObjectId(customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    return Customer(**str_id(customer))

@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, customer: CustomerCreate):
    customer_dict = customer.dict()
    customer_dict['updated_at'] = datetime.utcnow()
    
    result = await db.customers.update_one(
        {"_id": ObjectId(customer_id)},
        {"$set": customer_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    
    updated = await db.customers.find_one({"_id": ObjectId(customer_id)})
    return Customer(**str_id(updated))

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str):
    customer = await db.customers.find_one({"_id": ObjectId(customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="المشترك غير موجود")
    
    # Update generator subscriber count
    await db.generators.update_one(
        {"_id": ObjectId(customer['generator_id'])},
        {"$inc": {"subscriber_count": -1}}
    )
    
    await db.customers.delete_one({"_id": ObjectId(customer_id)})
    return {"message": "تم حذف المشترك بنجاح"}

# ==================== Generator APIs ====================

@api_router.post("/generators", response_model=Generator)
async def create_generator(generator: GeneratorCreate):
    generator_dict = generator.dict()
    generator_dict['subscriber_count'] = 0
    generator_dict['created_at'] = datetime.utcnow()
    
    result = await db.generators.insert_one(generator_dict)
    generator_dict['id'] = str(result.inserted_id)
    
    return Generator(**generator_dict)

@api_router.get("/generators", response_model=List[Generator])
async def get_generators():
    generators = await db.generators.find().to_list(1000)
    return [Generator(**str_id(g)) for g in generators]

@api_router.get("/generators/{generator_id}", response_model=Generator)
async def get_generator(generator_id: str):
    generator = await db.generators.find_one({"_id": ObjectId(generator_id)})
    if not generator:
        raise HTTPException(status_code=404, detail="المولد غير موجود")
    return Generator(**str_id(generator))

@api_router.put("/generators/{generator_id}", response_model=Generator)
async def update_generator(generator_id: str, generator: GeneratorCreate):
    result = await db.generators.update_one(
        {"_id": ObjectId(generator_id)},
        {"$set": generator.dict()}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="المولد غير موجود")
    
    updated = await db.generators.find_one({"_id": ObjectId(generator_id)})
    return Generator(**str_id(updated))

@api_router.delete("/generators/{generator_id}")
async def delete_generator(generator_id: str):
    # Check if any customers are linked to this generator
    customer_count = await db.customers.count_documents({"generator_id": generator_id})
    if customer_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"لا يمكن حذف المولد. يوجد {customer_count} مشترك مرتبط بهذا المولد"
        )
    
    await db.generators.delete_one({"_id": ObjectId(generator_id)})
    return {"message": "تم حذف المولد بنجاح"}

# ==================== Meter Reading APIs ====================

@api_router.post("/readings", response_model=MeterReading)
async def create_reading(reading: MeterReadingCreate):
    # Calculate consumption
    consumption = reading.current_reading - reading.previous_reading
    
    reading_dict = reading.dict()
    reading_dict['consumption'] = consumption
    reading_dict['created_at'] = datetime.utcnow()
    
    result = await db.readings.insert_one(reading_dict)
    reading_dict['id'] = str(result.inserted_id)
    
    return MeterReading(**reading_dict)

@api_router.get("/readings", response_model=List[MeterReading])
async def get_readings(customer_id: Optional[str] = None):
    query = {}
    if customer_id:
        query['customer_id'] = customer_id
    
    readings = await db.readings.find(query).sort('reading_date', -1).to_list(1000)
    return [MeterReading(**str_id(r)) for r in readings]

@api_router.get("/readings/latest/{customer_id}")
async def get_latest_reading(customer_id: str):
    """Get the latest meter reading for a customer to auto-populate previous_reading"""
    reading = await db.readings.find_one(
        {"customer_id": customer_id},
        sort=[('reading_date', -1)]
    )
    if not reading:
        return {"has_reading": False, "current_reading": 0}
    
    return {
        "has_reading": True,
        "current_reading": reading.get('current_reading', 0),
        "reading_date": reading.get('reading_date')
    }

@api_router.get("/readings/{reading_id}", response_model=MeterReading)
async def get_reading(reading_id: str):
    reading = await db.readings.find_one({"_id": ObjectId(reading_id)})
    if not reading:
        raise HTTPException(status_code=404, detail="القراءة غير موجودة")
    return MeterReading(**str_id(reading))

# ==================== Invoice APIs ====================

@api_router.post("/invoices", response_model=Invoice)
async def create_invoice(invoice_data: InvoiceCreate):
    invoice_dict = invoice_data.dict()
    
    # Calculate remaining amount
    total_with_previous = invoice_data.total_amount + invoice_data.previous_balance
    remaining = total_with_previous - invoice_data.amount_paid
    invoice_dict['remaining_amount'] = remaining
    
    # Determine status
    if invoice_data.amount_paid >= total_with_previous:
        invoice_dict['status'] = 'paid'
    elif invoice_data.amount_paid > 0:
        invoice_dict['status'] = 'partial'
    else:
        invoice_dict['status'] = 'unpaid'
    
    # Set due date (30 days from now)
    invoice_dict['due_date'] = datetime.utcnow() + timedelta(days=30)
    invoice_dict['is_overdue'] = False
    invoice_dict['created_at'] = datetime.utcnow()
    invoice_dict['updated_at'] = datetime.utcnow()
    
    result = await db.invoices.insert_one(invoice_dict)
    invoice_dict['id'] = str(result.inserted_id)
    
    # Update customer balance
    await db.customers.update_one(
        {"_id": ObjectId(invoice_data.customer_id)},
        {"$set": {"current_balance": remaining}}
    )
    
    return Invoice(**invoice_dict)

@api_router.get("/invoices", response_model=List[Invoice])
async def get_invoices(
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
    month: Optional[str] = None
):
    query = {}
    if customer_id:
        query['customer_id'] = customer_id
    if status:
        query['status'] = status
    if month:
        query['month'] = month
    
    invoices = await db.invoices.find(query).sort('created_at', -1).to_list(1000)
    
    # Check for overdue invoices
    now = datetime.utcnow()
    for inv in invoices:
        if inv['status'] != 'paid' and inv['due_date'] < now:
            inv['is_overdue'] = True
            await db.invoices.update_one(
                {"_id": inv['_id']},
                {"$set": {"is_overdue": True}}
            )
    
    return [Invoice(**str_id(i)) for i in invoices]

@api_router.get("/invoices/{invoice_id}", response_model=Invoice)
async def get_invoice(invoice_id: str):
    invoice = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    return Invoice(**str_id(invoice))

@api_router.post("/invoices/{invoice_id}/payment")
async def add_payment(invoice_id: str, payment: PaymentCreate):
    invoice = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    
    # Update invoice with new payment
    new_amount_paid = invoice['amount_paid'] + payment.amount
    total_with_previous = invoice['total_amount'] + invoice['previous_balance']
    new_remaining = total_with_previous - new_amount_paid
    
    # Determine new status
    if new_amount_paid >= total_with_previous:
        new_status = 'paid'
    elif new_amount_paid > 0:
        new_status = 'partial'
    else:
        new_status = 'unpaid'
    
    await db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": {
            "amount_paid": new_amount_paid,
            "remaining_amount": new_remaining,
            "status": new_status,
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Update customer balance
    await db.customers.update_one(
        {"_id": ObjectId(invoice['customer_id'])},
        {"$set": {"current_balance": new_remaining}}
    )
    
    # Record payment
    payment_dict = payment.dict()
    payment_dict['invoice_id'] = invoice_id
    payment_dict['created_at'] = datetime.utcnow()
    await db.payments.insert_one(payment_dict)
    
    return {"message": "تم تسجيل الدفعة بنجاح", "new_remaining": new_remaining}

# ==================== Expense APIs ====================

@api_router.post("/expenses", response_model=Expense)
async def create_expense(expense: ExpenseCreate):
    expense_dict = expense.dict()
    expense_dict['created_at'] = datetime.utcnow()
    
    result = await db.expenses.insert_one(expense_dict)
    expense_dict['id'] = str(result.inserted_id)
    
    return Expense(**expense_dict)

@api_router.get("/expenses", response_model=List[Expense])
async def get_expenses(
    expense_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    query = {}
    if expense_type:
        query['expense_type'] = expense_type
    
    if start_date and end_date:
        query['expense_date'] = {
            '$gte': datetime.fromisoformat(start_date),
            '$lte': datetime.fromisoformat(end_date)
        }
    
    expenses = await db.expenses.find(query).sort('expense_date', -1).to_list(1000)
    return [Expense(**str_id(e)) for e in expenses]

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    await db.expenses.delete_one({"_id": ObjectId(expense_id)})
    return {"message": "تم حذف المصروف بنجاح"}

# ==================== Reports APIs ====================

@api_router.get("/reports/debts")
async def get_debt_report(
    area: Optional[str] = None,
    generator_id: Optional[str] = None,
    month: Optional[str] = None
):
    # Get all unpaid and partial invoices
    query = {"status": {"$in": ["unpaid", "partial"]}}
    if month:
        query['month'] = month
    
    invoices = await db.invoices.find(query).to_list(1000)
    
    # Get customer details for filtering
    total_debt = 0.0
    debt_by_area = {}
    debt_by_generator = {}
    debtor_list = []
    
    for inv in invoices:
        customer = await db.customers.find_one({"_id": ObjectId(inv['customer_id'])})
        if not customer:
            continue
        
        # Apply filters
        if area and customer['area'] != area:
            continue
        if generator_id and customer['generator_id'] != generator_id:
            continue
        
        debt_amount = inv['remaining_amount']
        total_debt += debt_amount
        
        # Group by area
        if customer['area'] not in debt_by_area:
            debt_by_area[customer['area']] = 0.0
        debt_by_area[customer['area']] += debt_amount
        
        # Group by generator
        gen_id = customer['generator_id']
        if gen_id not in debt_by_generator:
            debt_by_generator[gen_id] = 0.0
        debt_by_generator[gen_id] += debt_amount
        
        debtor_list.append({
            "customer_name": customer['name'],
            "customer_phone": customer['phone'],
            "area": customer['area'],
            "debt_amount": debt_amount,
            "is_overdue": inv.get('is_overdue', False),
            "invoice_month": inv['month']
        })
    
    return {
        "total_debt": total_debt,
        "debt_by_area": debt_by_area,
        "debt_by_generator": debt_by_generator,
        "debtor_list": debtor_list
    }

@api_router.get("/reports/financial")
async def get_financial_report(month: Optional[str] = None):
    query = {}
    if month:
        query['month'] = month
    
    # Calculate total revenue from invoices
    invoices = await db.invoices.find(query).to_list(1000)
    total_revenue = sum(inv.get('amount_paid', 0) for inv in invoices)
    
    # Calculate total expenses
    expense_query = {}
    if month:
        # Parse month and create date range
        year, month_num = month.split('-')
        start_date = datetime(int(year), int(month_num), 1)
        if int(month_num) == 12:
            end_date = datetime(int(year) + 1, 1, 1)
        else:
            end_date = datetime(int(year), int(month_num) + 1, 1)
        
        expense_query['expense_date'] = {'$gte': start_date, '$lt': end_date}
    
    expenses = await db.expenses.find(expense_query).to_list(1000)
    total_expenses = sum(exp.get('amount', 0) for exp in expenses)
    
    # Calculate expenses by type
    expenses_by_type = {}
    for exp in expenses:
        exp_type = exp['expense_type']
        if exp_type not in expenses_by_type:
            expenses_by_type[exp_type] = 0.0
        expenses_by_type[exp_type] += exp['amount']
    
    net_profit = total_revenue - total_expenses
    
    return {
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "expenses_by_type": expenses_by_type,
        "month": month or "all_time"
    }

@api_router.get("/reports/consumption")
async def get_consumption_report(
    area: Optional[str] = None,
    generator_id: Optional[str] = None,
    month: Optional[str] = None
):
    # Get all readings
    readings = await db.readings.find().to_list(1000)
    
    total_consumption = 0.0
    consumption_by_area = {}
    consumption_by_generator = {}
    
    for reading in readings:
        customer = await db.customers.find_one({"_id": ObjectId(reading['customer_id'])})
        if not customer:
            continue
        
        # Apply filters
        if area and customer['area'] != area:
            continue
        if generator_id and customer['generator_id'] != generator_id:
            continue
        
        consumption = reading['consumption']
        total_consumption += consumption
        
        # Group by area
        if customer['area'] not in consumption_by_area:
            consumption_by_area[customer['area']] = 0.0
        consumption_by_area[customer['area']] += consumption
        
        # Group by generator
        gen_id = customer['generator_id']
        if gen_id not in consumption_by_generator:
            consumption_by_generator[gen_id] = 0.0
        consumption_by_generator[gen_id] += consumption
    
    return {
        "total_consumption": total_consumption,
        "consumption_by_area": consumption_by_area,
        "consumption_by_generator": consumption_by_generator
    }

# ==================== Dashboard Stats ====================

@api_router.get("/stats/dashboard")
async def get_dashboard_stats():
    # Get counts
    total_customers = await db.customers.count_documents({})
    total_generators = await db.generators.count_documents({})
    
    # Get unpaid invoices
    unpaid_invoices = await db.invoices.count_documents({"status": {"$in": ["unpaid", "partial"]}})
    
    # Calculate total debt
    invoices = await db.invoices.find({"status": {"$in": ["unpaid", "partial"]}}).to_list(1000)
    total_debt = sum(inv.get('remaining_amount', 0) for inv in invoices)
    
    # Get current month revenue
    now = datetime.utcnow()
    current_month = now.strftime('%Y-%m')
    month_invoices = await db.invoices.find({"month": current_month}).to_list(1000)
    month_revenue = sum(inv.get('amount_paid', 0) for inv in month_invoices)
    
    # Get overdue count
    overdue_count = await db.invoices.count_documents({"is_overdue": True})
    
    return {
        "total_customers": total_customers,
        "total_generators": total_generators,
        "unpaid_invoices": unpaid_invoices,
        "total_debt": total_debt,
        "month_revenue": month_revenue,
        "overdue_count": overdue_count,
        "current_month": current_month
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
