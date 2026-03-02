import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  FiUsers, FiCheckCircle, FiXCircle, FiClock, FiPlus,
  FiFileText, FiEdit2, FiMapPin, FiSettings, FiMap, FiGrid
} from 'react-icons/fi';
import AdminLayout, { NAV_ITEMS } from '../../components/AdminLayout';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    try {
      const [statsRes, employeesRes] = await Promise.all([
        api.get('/reports/dashboard'),
        api.get('/time-entries/all-today')
      ]);
      setStats(statsRes.data);
      setEmployees(employeesRes.data.employees);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }

  const statusColors = {
    'Trabalhando':  'bg-green-100 text-green-700 border border-green-200',
    'Em Almoço':    'bg-yellow-100 text-yellow-700 border border-yellow-200',
    'Saiu':         'bg-blue-100 text-blue-700 border border-blue-200',
    'Ausente':      'bg-red-100 text-red-700 border border-red-200',
  };

  const kpis = [
    { icon: FiUsers,       bg: 'bg-blue-50',   iconColor: 'text-blue-600',   value: stats?.totalEmployees || 0,       label: 'Total Funcionários',  sub: 'cadastrados' },
    { icon: FiCheckCircle, bg: 'bg-green-50',  iconColor: 'text-green-600',  value: stats?.presentToday || 0,         label: 'Presentes Hoje',      sub: 'trabalhando agora' },
    { icon: FiXCircle,     bg: 'bg-red-50',    iconColor: 'text-red-500',    value: stats?.absentToday || 0,          label: 'Ausentes',            sub: 'sem registro hoje' },
    { icon: FiClock,       bg: 'bg-purple-50', iconColor: 'text-purple-600', value: stats?.totalEntriesThisMonth || 0,label: 'Registros no Mês',    sub: 'batidas no mês' },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <AdminLayout title="Painel Administrativo">
      <div className="p-4 lg:p-6 space-y-6">
        <p className="text-xs text-gray-400">Visão geral de hoje — {stats?.date}</p>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className={`${kpi.bg} p-3 rounded-xl flex-shrink-0`}>
                <kpi.icon className={`w-6 h-6 ${kpi.iconColor}`} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-gray-900 leading-none">{kpi.value}</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{kpi.label}</p>
                <p className="text-xs text-gray-400">{kpi.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Atalhos rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {NAV_ITEMS.slice(1).map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 group-hover:bg-blue-50 flex items-center justify-center transition">
                <item.icon className={`w-5 h-5 ${item.color} group-hover:scale-110 transition`} />
              </div>
              <span className="text-xs font-medium text-gray-600 text-center leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Tabela de ponto do dia */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Ponto de Hoje</h2>
              <p className="text-xs text-gray-400">{stats?.date}</p>
            </div>
            <Link
              to="/admin/adjustments"
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              <FiEdit2 className="w-3 h-3" /> Ajustar pontos
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  {['Funcionário', 'Cargo', 'Status', 'Entrada', 'Almoço', 'Volta', 'Saída'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map(emp => {
                  const getTime = type => emp.entries.find(e => e.type === type)?.time || '—';
                  return (
                    <tr key={emp.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {emp.name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 text-sm">{emp.name}</p>
                            <p className="text-xs text-gray-400">{emp.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{emp.position || '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[emp.status] || 'bg-gray-100 text-gray-500'}`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm text-gray-700">{getTime('CLOCK_IN')}</td>
                      <td className="px-5 py-3.5 font-mono text-sm text-gray-700">{getTime('BREAK_START')}</td>
                      <td className="px-5 py-3.5 font-mono text-sm text-gray-700">{getTime('BREAK_END')}</td>
                      <td className="px-5 py-3.5 font-mono text-sm text-gray-700">{getTime('CLOCK_OUT')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {employees.length === 0 && (
              <div className="py-16 text-center">
                <FiUsers className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Nenhum funcionário cadastrado.</p>
                <Link to="/admin/employees" className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  <FiPlus className="w-4 h-4" /> Adicionar funcionário
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
