import { useState, useEffect } from 'react';
import api from '../../services/api';
import EmployeeLayout from '../../components/EmployeeLayout';
import { FiShield, FiEdit2, FiPlus, FiTrash2, FiArrowRight } from 'react-icons/fi';

const ACTION_MAP = {
  EDIT:   { label: 'Edição',   icon: FiEdit2,  color: 'bg-yellow-100 text-yellow-700', dotColor: 'bg-yellow-500' },
  ADD:    { label: 'Adição',   icon: FiPlus,   color: 'bg-green-100 text-green-700',   dotColor: 'bg-green-500' },
  DELETE: { label: 'Exclusão', icon: FiTrash2, color: 'bg-red-100 text-red-700',       dotColor: 'bg-red-500' },
};

const TYPE_LABELS = {
  CLOCK_IN: 'Entrada', BREAK_START: 'Saída Almoço',
  BREAK_END: 'Volta Almoço', CLOCK_OUT: 'Saída',
};

export default function MyAuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLogs(); }, []);

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await api.get('/employee/audit-log');
      setLogs(res.data.logs || []);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  }

  return (
    <EmployeeLayout title="Alterações nos Meus Registros">
      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8">
        {/* Cabeçalho informativo */}
        <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
          <p className="font-semibold flex items-center gap-2 mb-1">
            <FiShield className="w-4 h-4" /> Trilha de Auditoria
          </p>
          <p className="text-xs">
            Aqui você pode acompanhar todas as alterações feitas nos seus registros de ponto.
            Toda modificação é registrada de forma imutável com data, hora, valores anteriores e novos.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-8 text-center">
            <FiShield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Nenhuma alteração registrada</p>
            <p className="text-gray-400 text-sm mt-1">Seus registros não foram modificados.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map(log => {
              const info = ACTION_MAP[log.action] || ACTION_MAP.EDIT;
              const Icon = info.icon;
              return (
                <div key={log.id} className="bg-white rounded-xl shadow p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${info.color}`}>
                      <Icon className="w-3 h-3" /> {info.label}
                    </span>
                    <span className="text-xs text-gray-400">{log.date} às {log.time}</span>
                  </div>

                  {/* Conteúdo */}
                  <div className="space-y-1">
                    {log.action === 'EDIT' && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="bg-red-50 rounded-lg px-2 py-1">
                          <span className="text-xs text-gray-500">De:</span>
                          <span className="ml-1 font-mono font-bold text-red-600">{log.oldTime}</span>
                          <span className="ml-1 text-xs text-gray-400">{log.oldDate}</span>
                          {log.oldType && <span className="ml-1 text-xs text-gray-400">({TYPE_LABELS[log.oldType] || log.oldType})</span>}
                        </div>
                        <FiArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="bg-green-50 rounded-lg px-2 py-1">
                          <span className="text-xs text-gray-500">Para:</span>
                          <span className="ml-1 font-mono font-bold text-green-600">{log.newTime}</span>
                          <span className="ml-1 text-xs text-gray-400">{log.newDate}</span>
                          {log.newType && <span className="ml-1 text-xs text-gray-400">({TYPE_LABELS[log.newType] || log.newType})</span>}
                        </div>
                      </div>
                    )}
                    {log.action === 'ADD' && (
                      <div className="text-sm">
                        <span className="text-gray-500">Registro adicionado:</span>
                        <span className="ml-1 font-mono font-bold text-green-600">{log.newTime}</span>
                        <span className="ml-1 text-xs text-gray-400">{log.newDate}</span>
                        {log.newType && <span className="ml-1 text-xs text-gray-500">({TYPE_LABELS[log.newType] || log.newType})</span>}
                      </div>
                    )}
                    {log.action === 'DELETE' && (
                      <div className="text-sm">
                        <span className="text-gray-500">Registro removido:</span>
                        <span className="ml-1 font-mono font-bold text-red-600 line-through">{log.oldTime}</span>
                        <span className="ml-1 text-xs text-gray-400">{log.oldDate}</span>
                        {log.oldType && <span className="ml-1 text-xs text-gray-500">({TYPE_LABELS[log.oldType] || log.oldType})</span>}
                      </div>
                    )}
                  </div>

                  {/* Justificativa */}
                  <div className="mt-2 bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-600"><strong>Justificativa:</strong> {log.reason}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </EmployeeLayout>
  );
}
