import axios from 'axios';
import { storage } from '@/src/utils/storage';
import { router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await storage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 (expired/invalid token)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      // Clear stored auth
      await storage.removeItem('access_token');
      await storage.removeItem('user');
      // Redirect to login
      try {
        router.replace('/');
      } catch (e) {
        // Router might not be ready
      }
    }
    return Promise.reject(error);
  }
);

// Customers
export const customersAPI = {
  getAll: (params?: any) => api.get('/customers', { params }),
  getOne: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.put(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
  suspend: (id: string) => api.put(`/customers/${id}/suspend`, {}),
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
  delete: (id: string) => api.delete(`/invoices/${id}`),
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
