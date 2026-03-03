import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { FiArrowLeft, FiClock, FiCalendar, FiChevronDown, FiChevronUp, FiLogOut, FiFileText, FiEdit2 } from 'react-icons/fi';

const TYPE_LABELS = {
  CLOCK_IN: 'Entrada',
  BREAK_START: 'Saída Almoço',
  BREAK_END: 'Volta Almoço',
  CLOCK_OUT: 'Saída',
};

const TYPE_COLORS = {
  CLOCK_IN: 'bg-green-100 text-green-700',
  BREAK_START: 'bg-yellow-100 text-yellow-700',
  BREAK_END: 'bg-blue-100 text-blue-700',
  CLOCK_OUT: 'bg-red-100 text-red-700',
};

export default function MyHistory() {
  const { user, logout } = useAuth();
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [totalDays, setTotalDays] = useState(0);

  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory(start, end) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: start || startDate,
        endDate: end || endDate,
      });
      const res = await api.get(`/time-entries/my-history?${params}`);
      setDays(res.data.days || []);
      setTotalDays(res.data.totalDays || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleFilter(e) {
    e.preventDefault();
    fetchHistory(startDate, endDate);
  }

  function toggleDay(date) {
    setExpanded(prev => ({ ...prev, [date]: !prev[date] }));
  }

  // Calcular total de horas no período
  function parseTotalMinutes(formatted) {
    if (!formatted) return 0;
    const [h, m] = formatted.split(':').map(Number);
    return h * 60 + m;
  }

  const totalMinutes = days.reduce((acc, d) => acc + parseTotalMinutes(d.totalWorked), 0);
  const totalFormatted = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link to="/employee/punch" className="text-gray-400 hover:text-blue-600">
            <FiArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-base font-bold text-gray-800">Meu Histórico</h1>
            <p className="text-xs text-gray-500">{user?.company?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/employee/punch-mirror" className="text-gray-400 hover:text-green-600" title="Espelho de Ponto">
            <FiFileText className="w-5 h-5" />
          </Link>
          <Link to="/employee/adjustments" className="text-gray-400 hover:text-orange-500" title="Solicitar Ajuste">
            <FiEdit2 className="w-5 h-5" />
          </Link>
          <span className="text-sm text-gray-600 hidden sm:block">{user?.name}</span>
          <button onClick={logout} className="text-gray-400 hover:text-red-500" title="Sair">
            <FiLogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">
        {/* Filtro de período */}
        <form onSubmit={handleFilter} className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FiCalendar className="w-4 h-4 text-blue-500" /> Filtrar Período
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">De</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Até</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Buscar
          </button>
        </form>

        {/* Resumo do período */}
        {!loading && days.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Dias trabalhados</p>
              <p className="text-2xl font-bold text-blue-600">{totalDays}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">Total no período</p>
              <p className="text-2xl font-bold text-green-600 font-mono">{totalFormatted}</p>
            </div>
          </div>
        )}

        {/* Lista de dias */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : days.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-8 text-center">
            <FiClock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Nenhum registro encontrado</p>
            <p className="text-gray-400 text-sm mt-1">Tente alterar o período de busca.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {days.map((day, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow overflow-hidden">
                {/* Cabeçalho do dia */}
                <button
                  onClick={() => toggleDay(day.date)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <FiCalendar className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">{day.date}</p>
                      <p className="text-xs text-gray-400">{day.entries.length} registro{day.entries.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold font-mono text-green-600">{day.totalWorked}</span>
                    {expanded[day.date]
                      ? <FiChevronUp className="w-4 h-4 text-gray-400" />
                      : <FiChevronDown className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                </button>

                {/* Detalhes do dia */}
                {expanded[day.date] && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50">
                    {day.entries.map((entry, eIdx) => (
                      <div key={eIdx} className="flex items-center justify-between py-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[entry.type] || 'bg-gray-100 text-gray-600'}`}>
                          {TYPE_LABELS[entry.type] || entry.type}
                        </span>
                        <div className="text-right">
                          <span className="text-base font-bold font-mono text-gray-800">{entry.time}</span>
                          {entry.address && (
                            <p className="text-xs text-gray-400 mt-0.5 max-w-[180px] truncate">{entry.address}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
