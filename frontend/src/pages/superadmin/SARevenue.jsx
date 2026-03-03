import { useState, useEffect } from 'react';
import SuperAdminLayout from '../../components/SuperAdminLayout';
import api from '../../services/api';
import { FiDollarSign } from 'react-icons/fi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const PLAN_COLORS = { BASIC: '#3b82f6', PROFESSIONAL: '#8b5cf6', ENTERPRISE: '#f59e0b' };

export default function SARevenue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/super-admin/revenue?months=12')
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SuperAdminLayout title="Receita">
        <div className="flex items-center justify-center p-20">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </SuperAdminLayout>
    );
  }

  const planPieData = data?.revenueByPlan
    ? Object.entries(data.revenueByPlan)
        .filter(([_, v]) => v > 0)
        .map(([key, value]) => ({
          name: { BASIC: 'Básico', PROFESSIONAL: 'Profissional', ENTERPRISE: 'Empresarial' }[key] || key,
          value,
          color: PLAN_COLORS[key] || '#6b7280',
        }))
    : [];

  return (
    <SuperAdminLayout title="Receita">
      <div className="p-4 lg:p-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
            <p className="text-3xl font-extrabold text-green-400">
              R${parseFloat(data?.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-gray-500 text-sm mt-1">Receita Total</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
            <p className="text-3xl font-extrabold text-white">{data?.totalPayments || 0}</p>
            <p className="text-gray-500 text-sm mt-1">Total de Pagamentos</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
            <p className="text-3xl font-extrabold text-blue-400">
              R${data?.totalPayments > 0
                ? (parseFloat(data.totalRevenue) / data.totalPayments).toFixed(2)
                : '0.00'}
            </p>
            <p className="text-gray-500 text-sm mt-1">Ticket Médio</p>
          </div>
        </div>

        {/* Monthly Revenue Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-4">Receita Mensal</h3>
          {(data?.monthlyRevenue || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#6b7280" tick={{ fontSize: 12 }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(value) => [`R$${value.toFixed(2)}`, 'Receita']}
                />
                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-10">Sem dados de receita.</p>
          )}
        </div>

        {/* Revenue by Plan */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-4">Receita por Plano</h3>
          {planPieData.length > 0 ? (
            <div className="flex flex-col md:flex-row items-center gap-8">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={planPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={3}
                  >
                    {planPieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 12 }}
                    formatter={(value) => [`R$${value.toFixed(2)}`]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ color: '#9ca3af' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {planPieData.map((p) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-gray-300 text-sm">{p.name}</span>
                    <span className="text-white font-bold text-sm">R${p.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-10">Sem dados de receita por plano.</p>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
