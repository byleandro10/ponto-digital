import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiBriefcase, FiClock, FiUser } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { maskCPF, unmask } from '../utils/masks';
import { hasBillingAccess } from '../utils/billing';

export default function Login() {
  const [tab, setTab] = useState('employee');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { loginAdmin, loginEmployee } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      if (tab === 'employee') {
        await loginEmployee(unmask(cpf), password);
        toast.success('Bem-vindo!');
        navigate('/employee/punch');
        return;
      }

      const data = await loginAdmin(email, password);
      toast.success('Bem-vindo!');

      if (data.user?.role === 'SUPER_ADMIN') {
        navigate('/super-admin/dashboard');
        return;
      }

      if (hasBillingAccess(data.subscriptionStatus)) {
        navigate('/admin/dashboard');
        return;
      }

      navigate('/admin/subscription');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-800 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <FiClock className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Ponto Digital</h1>
          <p className="mt-1 text-gray-500">Controle de ponto inteligente</p>
        </div>

        <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setTab('employee')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition ${
              tab === 'employee' ? 'bg-white text-blue-600 shadow' : 'text-gray-500'
            }`}
          >
            <FiUser />
            Funcionário
          </button>
          <button
            type="button"
            onClick={() => setTab('admin')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition ${
              tab === 'admin' ? 'bg-white text-blue-600 shadow' : 'text-gray-500'
            }`}
          >
            <FiBriefcase />
            Empresa
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'employee' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">CPF</label>
              <input
                type="text"
                value={cpf}
                onChange={(event) => setCpf(maskCPF(event.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@empresa.com"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Não tem conta?{' '}
          <Link to="/checkout" className="font-medium text-blue-600 hover:underline">
            Contratar plano
          </Link>
        </p>
      </div>
    </div>
  );
}
