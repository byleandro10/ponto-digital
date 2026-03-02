import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) setUser(JSON.parse(savedUser));
    setLoading(false);
  }, []);

  async function loginAdmin(email, password) {
    const response = await api.post('/auth/login/admin', { email, password });
    const { token, user: userData, company } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ ...userData, company, type: 'admin' }));
    setUser({ ...userData, company, type: 'admin' });
    return response.data;
  }

  async function loginEmployee(cpf, password) {
    const response = await api.post('/auth/login/employee', { cpf, password });
    const { token, employee, company } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ ...employee, company, type: 'employee' }));
    setUser({ ...employee, company, type: 'employee' });
    return response.data;
  }

  async function register(data) {
    const response = await api.post('/auth/register', data);
    const { token, user: userData, company } = response.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ ...userData, company, type: 'admin' }));
    setUser({ ...userData, company, type: 'admin' });
    return response.data;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signed: !!user, loginAdmin, loginEmployee, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
