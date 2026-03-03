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
    const { token, user: userData, company, subscriptionStatus, trialEndsAt } = response.data;
    localStorage.setItem('token', token);
    const userObj = { ...userData, company, type: 'admin', subscriptionStatus, trialEndsAt };
    localStorage.setItem('user', JSON.stringify(userObj));
    setUser(userObj);
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

  /** Atualiza a logoUrl da empresa no contexto/localStorage sem novo login */
  function updateCompanyLogo(logoUrl) {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, company: { ...prev.company, logoUrl } };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }

  /** Atualiza o status da assinatura no contexto/localStorage */
  function updateSubscriptionStatus(subscriptionStatus, trialEndsAt) {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, subscriptionStatus, trialEndsAt: trialEndsAt || null };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{ user, loading, signed: !!user, loginAdmin, loginEmployee, register, logout, updateCompanyLogo, updateSubscriptionStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
