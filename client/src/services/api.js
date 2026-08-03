import axios from 'axios';

// Base API configuration using Vite environment variables
const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000 // 10 seconds timeout
});

// Interceptor to handle request tokens if saved in localStorage
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// API Helper Endpoints
export const checkHealth = () => API.get('/health');

// Hazard API Calls
export const fetchHazards = () => API.get('/hazards');
export const submitHazard = (hazardData) => API.post('/hazards', hazardData);

// SOS API Calls
export const fetchActiveSOS = () => API.get('/sos');
export const triggerSOSCall = (sosData) => API.post('/sos', sosData);

// Auth API Calls
export const registerUser = (userData) => API.post('/auth/register', userData);
export const loginUser = (credentials) => API.post('/auth/login', credentials);

export default API;
