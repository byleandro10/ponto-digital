import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiUsers, FiCheckCircle, FiXCircle, FiClock, FiLogOut, FiPlus, FiFileText, FiEdit2, FiMapPin, FiSettings } from 'react-icons/fi';

export default function Dashboard() {
  const { user, logout } = useAuth();
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
    } catch (error) { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }

  const statusColors = {
    'Trabalhando': 'bg-green-100 text-green-700',
    'Em Almoço': 'bg-yellow-100 text-yellow-700',
    'Saiu': 'bg-blue-100 text-blue-700',
    'Ausente': 'bg-red-100 text-red-700'
  };

  const cardStyles = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    green: { bg: 'bg-green-100', text: 'text-green-600' },
    red: { bg: 'bg-red-100', text: 'text-red-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Painel Administrativo</h1>
          <p className="text-sm text-gray-500">{user?.company?.name}</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Link to="/admin/employees" className="text-sm text-blue-600 hover:underline flex items-center gap-1"><FiUsers /> Funcionários</Link>
          <Link to="/admin/reports" className="text-sm text-blue-600 hover:underline flex items-center gap-1"><FiFileText /> Relatórios</Link>
          <Link to="/admin/adjustments" className="text-sm text-blue-600 hover:underline flex items-center gap-1"><FiEdit2 /> Ajustes</Link>
          <Link to="/admin/geofences" className="text-sm text-blue-600 hover:underline flex items-center gap-1"><FiMapPin /> Cercas</Link>
          <Link to="/admin/settings" className="text-sm text-blue-600 hover:underline flex items-center gap-1"><FiSettings /> Config</Link>
          <button onClick={logout} className="text-gray-400 hover:text-red-500"><FiLogOut /></button>
        </div>
      </header>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { icon: FiUsers, color: 'blue', value: stats?.totalEmployees || 0, label: 'Total Funcionários' },
            { icon: FiCheckCircle, color: 'green', value: stats?.presentToday || 0, label: 'Presentes Hoje' },
            { icon: FiXCircle, color: 'red', value: stats?.absentToday || 0, label: 'Ausentes Hoje' },
            { icon: FiClock, color: 'purple', value: stats?.totalEntriesThisMonth || 0, label: 'Registros no Mês' }
          ].map((card, i) => (
            <div key={i} className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center gap-3">
                <div className={`${cardStyles[card.color].bg} p-3 rounded-lg`}>
                  <card.icon className={`w-6 h-6 ${cardStyles[card.color].text}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                  <p className="text-sm text-gray-500">{card.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link to="/admin/employees" className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <FiPlus /> Novo Funcionário
          </Link>
          <Link to="/admin/reports" className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition">
            <FiFileText /> Relatórios / Exportar
          </Link>
          <Link to="/admin/adjustments" className="flex items-center gap-2 bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition">
            <FiEdit2 /> Ajustar Pontos
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b"><h2 className="text-lg font-bold text-gray-800">Ponto de Hoje - {stats?.date}</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Funcionário','Cargo','Status','Entrada','Almoço','Volta','Saída'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp) => {
                  const getTime = (type) => emp.entries.find(e => e.type === type)?.time || '--:--';
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-medium text-gray-800">{emp.name}</p><p className="text-xs text-gray-500">{emp.department}</p></td>
                      <td className="px-6 py-4 text-sm text-gray-600">{emp.position || '-'}</td>
                      <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[emp.status]}`}>{emp.status}</span></td>
                      <td className="px-6 py-4 font-mono text-sm">{getTime('CLOCK_IN')}</td>
                      <td className="px-6 py-4 font-mono text-sm">{getTime('BREAK_START')}</td>
                      <td className="px-6 py-4 font-mono text-sm">{getTime('BREAK_END')}</td>
                      <td className="px-6 py-4 font-mono text-sm">{getTime('CLOCK_OUT')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {employees.length === 0 && <p className="text-gray-400 text-center py-8">Nenhum funcionário cadastrado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
