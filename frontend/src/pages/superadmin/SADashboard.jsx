import { useState, useEffect } from 'react';
import SuperAdminLayout from '../../components/SuperAdminLayout';
import api from '../../services/api';
import { FiUsers, FiDollarSign, FiTrendingDown, FiActivity, FiClock, FiArrowUp } from 'react-icons/fi';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function KPICard({ icon: Icon, label, value, sub, color = 'text-blue-600', bg = 'bg-blue-50' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <p className="text-sm text-gray-400">{label}</p>
      </div>
      <p className="text-2xl font-extrabold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function SADashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/super-admin/dashboard'),
      api.get('/super-admin/revenue?months=12'),
    ])
      .then(([dashRes, revRes]) => {
        setData(dashRes.data);
        setRevenueData(revRes.data.monthlyRevenue || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SuperAdminLayout title="Dashboard">
        <div className="flex items-center justify-center p-20">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </SuperAdminLayout>
    );
  }

  const k = data?.kpis || {};

  return (
    <SuperAdminLayout title="Dashboard">
      <div className="p-4 lg:p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={FiDollarSign} label="MRR" value={`R$${(k.mrr || 0).toLocaleString('pt-BR')}`} sub="Receita mensal recorrente" color="text-green-500" bg="bg-green-900/30" />
          <KPICard icon={FiUsers} label="Empresas Ativas" value={k.activeSubscriptions || 0} sub={`${k.trialSubscriptions || 0} em trial`} color="text-blue-500" bg="bg-blue-900/30" />
          <KPICard icon={FiTrendingDown} label="Churn Rate" value={`${k.churnRate || 0}%`} sub="Últimos 30 dias" color="text-red-500" bg="bg-red-900/30" />
          <KPICard icon={FiActivity} label="Batidas no Mês" value={(k.punchesThisMonth || 0).toLocaleString('pt-BR')} sub={`${(k.totalEmployees || 0).toLocaleString('pt-BR')} funcionários`} color="text-purple-500" bg="bg-purple-900/30" />
        </div>

        {/* Revenue Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-4">Receita Mensal (últimos 12 meses)</h3>
          {revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 12 }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(value) => [`R$${value.toFixed(2)}`, 'Receita']}
                />
                <Area type="monotone" dataKey="amount" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-10">Sem dados de receita ainda.</p>
          )}
        </div>

        {/* Recent Companies */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-4">Últimas Empresas Cadastradas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 font-medium">Empresa</th>
                  <th className="pb-3 font-medium">Plano</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Funcionários</th>
                  <th className="pb-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentCompanies || []).map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50">
                    <td className="py-3">
                      <p className="text-white font-medium">{c.name}</p>
                      <p className="text-gray-500 text-xs">{c.cnpj}</p>
                    </td>
                    <td className="py-3 text-gray-300 capitalize">{c.subscription?.plan?.toLowerCase() || 'N/A'}</td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                        c.subscription?.status === 'ACTIVE' ? 'bg-green-900/30 text-green-400' :
                        c.subscription?.status === 'TRIALING' ? 'bg-blue-900/30 text-blue-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {c.subscription?.status || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 text-gray-300">{c.employeeCount}</td>
                    <td className="py-3 text-gray-400 text-xs">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
            <p className="text-3xl font-extrabold text-white">{k.totalCompanies || 0}</p>
            <p className="text-gray-500 text-sm mt-1">Total de Empresas</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
            <p className="text-3xl font-extrabold text-white">{k.totalEmployees || 0}</p>
            <p className="text-gray-500 text-sm mt-1">Total de Funcionários</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
            <p className="text-3xl font-extrabold text-green-400">R${parseFloat(k.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p className="text-gray-500 text-sm mt-1">Receita Total</p>
          </div>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
