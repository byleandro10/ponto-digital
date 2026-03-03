import { useState, useEffect } from 'react';
import api from '../../services/api';
import EmployeeLayout from '../../components/EmployeeLayout';
import { FiFileText, FiCalendar, FiClock, FiChevronDown, FiChevronUp, FiAlertTriangle, FiShield, FiCheckCircle } from 'react-icons/fi';

const TYPE_LABELS = {
  CLOCK_IN: 'Entrada', BREAK_START: 'Saída Almoço',
  BREAK_END: 'Volta Almoço', CLOCK_OUT: 'Saída',
};
const TYPE_COLORS = {
  CLOCK_IN: 'bg-green-100 text-green-700', BREAK_START: 'bg-yellow-100 text-yellow-700',
  BREAK_END: 'bg-blue-100 text-blue-700', CLOCK_OUT: 'bg-red-100 text-red-700',
};

export default function MyPunchMirror() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => { fetchMirror(); }, [month, year]);

  async function fetchMirror() {
    setLoading(true);
    try {
      const res = await api.get(`/employee/punch-mirror?month=${month}&year=${year}`);
      setData(res.data);
    } catch { setData(null); }
    finally { setLoading(false); }
  }

  function toggleDay(date) {
    setExpanded(prev => ({ ...prev, [date]: !prev[date] }));
  }

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <EmployeeLayout title="Espelho de Ponto">
      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8">
        {/* Seletor de mês */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FiCalendar className="w-4 h-4 text-blue-500" /> Período
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : !data ? (
          <div className="bg-white rounded-2xl shadow p-8 text-center">
            <FiFileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Sem dados para este período</p>
          </div>
        ) : (
          <>
            {/* Info funcionário */}
            <div className="bg-white rounded-2xl shadow p-4">
              <p className="font-bold text-gray-800">{data.employee.name}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                {data.employee.cpf && <span>CPF: {data.employee.cpf}</span>}
                {data.employee.position && <span>Cargo: {data.employee.position}</span>}
                {data.employee.department && <span>Setor: {data.employee.department}</span>}
              </div>
              <p className="text-sm text-blue-600 font-semibold mt-2">Período: {data.period}</p>
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Dias Trabalhados', value: data.summary.daysWorked, color: 'text-blue-600' },
                { label: 'Total Horas', value: data.summary.totalWorked, color: 'text-green-600' },
                { label: 'Horas Extras', value: data.summary.overtime, color: 'text-orange-600' },
                { label: 'Déficit', value: data.summary.deficit, color: 'text-red-600' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-xl shadow p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className={`text-xl font-bold font-mono ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Banco de horas */}
            {data.summary.hourBankBalance !== undefined && (
              <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Banco de Horas</p>
                  <p className="text-xs text-gray-400">Saldo acumulado total</p>
                </div>
                <p className={`text-xl font-bold font-mono ${data.summary.hourBankBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.summary.hourBankBalance >= 0 ? '+' : ''}{Math.floor(data.summary.hourBankBalance / 60)}:{String(Math.abs(data.summary.hourBankBalance % 60)).padStart(2, '0')}
                </p>
              </div>
            )}

            {/* Lista de dias */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Detalhamento Diário</h3>
              {data.days.map((day, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow overflow-hidden">
                  <button
                    onClick={() => toggleDay(day.date)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${day.hasAdjustment ? 'bg-yellow-100' : 'bg-blue-100'}`}>
                        {day.hasAdjustment ? (
                          <FiAlertTriangle className="w-4 h-4 text-yellow-600" />
                        ) : (
                          <FiCalendar className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-800">{day.date}</p>
                        <div className="flex gap-2 text-xs text-gray-400">
                          {day.clockIn && <span>E: {day.clockIn}</span>}
                          {day.clockOut && <span>S: {day.clockOut}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold font-mono text-green-600">{day.totalHours}</span>
                      {expanded[day.date]
                        ? <FiChevronUp className="w-4 h-4 text-gray-400" />
                        : <FiChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>

                  {expanded[day.date] && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50">
                      {day.entries.map((entry, eIdx) => (
                        <div key={eIdx} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[entry.type] || 'bg-gray-100 text-gray-600'}`}>
                              {TYPE_LABELS[entry.type] || entry.type}
                            </span>
                            {entry.adjusted && (
                              <span className="text-xs text-yellow-600 flex items-center gap-1" title={entry.adjustmentNote}>
                                <FiAlertTriangle className="w-3 h-3" /> Ajustado
                              </span>
                            )}
                            {entry.integrityValid !== null && (
                              <span className={`text-xs flex items-center gap-1 ${entry.integrityValid ? 'text-green-500' : 'text-red-500'}`}>
                                {entry.integrityValid
                                  ? <><FiShield className="w-3 h-3" /> Íntegro</>
                                  : <><FiAlertTriangle className="w-3 h-3" /> Alterado</>}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-base font-bold font-mono text-gray-800">{entry.time}</span>
                            {entry.originalTime && (
                              <p className="text-xs text-gray-400 line-through">{entry.originalTime}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {data.days.length === 0 && (
                <div className="bg-white rounded-2xl shadow p-8 text-center">
                  <FiClock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">Nenhum registro neste mês</p>
                </div>
              )}
            </div>

            {/* Info extra */}
            <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700 space-y-1">
              <p className="font-semibold flex items-center gap-1"><FiShield className="w-3 h-3" /> Informações Legais</p>
              <p>• Seus registros são protegidos por assinatura eletrônica (SHA-256).</p>
              <p>• Alterações feitas pelo administrador são sinalizadas com o ícone ⚠️.</p>
              <p>• Você pode solicitar ajustes na seção "Solicitar Ajuste".</p>
              <p>• Dias úteis no mês: {data.summary.businessDays} | Faltas: {data.summary.absences}</p>
            </div>
          </>
        )}
      </div>
    </EmployeeLayout>
  );
}
