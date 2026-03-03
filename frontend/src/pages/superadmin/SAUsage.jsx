import { useState, useEffect } from 'react';
import SuperAdminLayout from '../../components/SuperAdminLayout';
import api from '../../services/api';
import { FiActivity, FiAlertTriangle } from 'react-icons/fi';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function SAUsage() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/super-admin/usage-stats?days=${days}`)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <SuperAdminLayout title="Métricas de Uso">
        <div className="flex items-center justify-center p-20">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout title="Métricas de Uso">
      <div className="p-4 lg:p-6 space-y-6">
        {/* Period Selector */}
        <div className="flex gap-2">
          {[7, 30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                days === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Punches Chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <FiActivity className="text-purple-500" /> Batidas por Dia
          </h3>
          {(data?.daily || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.daily}>
                <defs>
                  <linearGradient id="colorPunches" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#6b7280"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                />
                <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                  labelFormatter={(v) => new Date(v).toLocaleDateString('pt-BR')}
                  formatter={(value, name) => [
                    value,
                    { totalPunches: 'Batidas', adminLogins: 'Logins Admin', employeeLogins: 'Logins Func.' }[name] || name,
                  ]}
                />
                <Area type="monotone" dataKey="totalPunches" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorPunches)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-10">Sem dados de uso no período.</p>
          )}
        </div>

        {/* Top Companies + Inactive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Companies */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4">Top Empresas por Uso</h3>
            {(data?.topCompanies || []).length > 0 ? (
              <div className="space-y-3">
                {data.topCompanies.map((c, i) => (
                  <div key={c.companyId} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-6 text-right">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="text-gray-200 text-sm font-medium truncate">{c.companyName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold text-sm">{c.totalPunches}</p>
                      <p className="text-gray-500 text-xs">batidas</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-6">Sem dados.</p>
            )}
          </div>

          {/* Inactive Companies */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <FiAlertTriangle className="text-yellow-500" /> Empresas Inativas (7+ dias)
            </h3>
            {(data?.inactiveCompanies || []).length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {data.inactiveCompanies.map((c) => (
                  <div key={c.id} className="bg-gray-800 rounded-xl p-3">
                    <p className="text-gray-200 text-sm font-medium">{c.name}</p>
                    <p className="text-gray-500 text-xs">
                      Cadastrada em {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-6">Todas as empresas estão ativas!</p>
            )}
            <p className="text-gray-600 text-xs mt-3">
              {(data?.inactiveCompanies || []).length} empresa(s) sem registro de batida nos últimos 7 dias.
            </p>
          </div>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
