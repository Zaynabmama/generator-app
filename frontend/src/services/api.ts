import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Customers
export const customersAPI = {
  getAll: (params?: any) => api.get('/customers', { params }),
  getOne: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.put(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
};

// Generators
export const generatorsAPI = {
  getAll: () => api.get('/generators'),
  getOne: (id: string) => api.get(`/generators/${id}`),
  create: (data: any) => api.post('/generators', data),
  update: (id: string, data: any) => api.put(`/generators/${id}`, data),
  delete: (id: string) => api.delete(`/generators/${id}`),
};

// Readings
export const readingsAPI = {
  getAll: (params?: any) => api.get('/readings', { params }),
  getOne: (id: string) => api.get(`/readings/${id}`),
  getLatest: (customerId: string) => api.get(`/readings/latest/${customerId}`),
  create: (data: any) => api.post('/readings', data),
};

// Invoices
export const invoicesAPI = {
  getAll: (params?: any) => api.get('/invoices', { params }),
  getOne: (id: string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  addPayment: (id: string, data: any) => api.post(`/invoices/${id}/payment`, data),
};

// Expenses
export const expensesAPI = {
  getAll: (params?: any) => api.get('/expenses', { params }),
  create: (data: any) => api.post('/expenses', data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
};

// Reports
export const reportsAPI = {
  getDebts: (params?: any) => api.get('/reports/debts', { params }),
  getFinancial: (params?: any) => api.get('/reports/financial', { params }),
  getConsumption: (params?: any) => api.get('/reports/consumption', { params }),
};

// Dashboard
export const dashboardAPI = {
  getStats: () => api.get('/stats/dashboard'),
};

export default api;