import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { FiEdit2, FiPlus, FiTrash2, FiClock, FiAlertCircle, FiCamera, FiX } from 'react-icons/fi';
import AdminLayout from '../../components/AdminLayout';

dayjs.extend(utc);
dayjs.extend(timezone);

export default function TimeAdjustments() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [entries, setEntries] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentEntry, setCurrentEntry] = useState(null);
  const [form, setForm] = useState({ type: 'CLOCK_IN', timestamp: '', reason: '' });

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data.employees)).catch(() => {});
    fetchLogs();
  }, []);

  useEffect(() => {
    if (selectedEmployee && selectedDate) fetchEntries();
  }, [selectedEmployee, selectedDate]);

  async function fetchEntries() {
    try {
      const res = await api.get(`/adjustments/entries?employeeId=${selectedEmployee}&date=${selectedDate}`);
      setEntries(res.data.entries);
    } catch { setEntries([]); }
  }

  async function fetchLogs() {
    try {
      const res = await api.get('/adjustments/logs');
      setLogs(res.data.logs);
    } catch { setLogs([]); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.reason || form.reason.length < 5) return toast.error('Justificativa obrigatória (mín. 5 caracteres)');
    try {
      await api.post('/adjustments/add', {
        employeeId: selectedEmployee,
        type: form.type,
        timestamp: form.timestamp,
        reason: form.reason
      });
      toast.success('Registro adicionado!');
      setShowAddModal(false);
      setForm({ type: 'CLOCK_IN', timestamp: '', reason: '' });
      fetchEntries();
      fetchLogs();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao adicionar');
    }
  }

  async function handleEdit(e) {
    e.preventDefault();
    if (!form.reason || form.reason.length < 5) return toast.error('Justificativa obrigatória');
    try {
      await api.put(`/adjustments/${currentEntry.id}`, {
        newTimestamp: form.timestamp,
        reason: form.reason
      });
      toast.success('Ponto ajustado!');
      setShowEditModal(false);
      fetchEntries();
      fetchLogs();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao ajustar');
    }
  }

  async function handleDelete(e) {
    e.preventDefault();
    if (!form.reason || form.reason.length < 5) return toast.error('Justificativa obrigatória');
    try {
      await api.delete(`/adjustments/${currentEntry.id}`, { data: { reason: form.reason } });
      toast.success('Registro removido!');
      setShowDeleteModal(false);
      fetchEntries();
      fetchLogs();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao remover');
    }
  }

  function openEdit(entry) {
    setCurrentEntry(entry);
    setForm({ ...form, timestamp: dayjs(entry.timestamp).tz('America/Sao_Paulo').format('YYYY-MM-DDTHH:mm'), reason: '' });
    setShowEditModal(true);
  }

  function openDelete(entry) {
    setCurrentEntry(entry);
    setForm({ ...form, reason: '' });
    setShowDeleteModal(true);
  }

  function openAdd() {
    setForm({ type: 'CLOCK_IN', timestamp: `${selectedDate}T08:00`, reason: '' });
    setShowAddModal(true);
  }

  const typeLabels = { CLOCK_IN: 'Entrada', BREAK_START: 'Almoço Ida', BREAK_END: 'Almoço Volta', CLOCK_OUT: 'Saída' };
  const actionLabels = { EDIT: 'Editou', ADD: 'Adicionou', DELETE: 'Removeu' };
  const actionColors = { EDIT: 'bg-yellow-100 text-yellow-700', ADD: 'bg-green-100 text-green-700', DELETE: 'bg-red-100 text-red-700' };
  const [showPhoto, setShowPhoto] = useState(null);

  return (
    <AdminLayout title="Ajustes de Ponto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Filtros */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Funcionário</label>
              <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Selecione...</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="flex items-end">
              <button onClick={openAdd} disabled={!selectedEmployee}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-40 font-medium">
                <FiPlus /> Adicionar Registro
              </button>
            </div>
          </div>
        </div>

        {/* Registros do dia */}
        {selectedEmployee && (
          <div className="bg-white rounded-xl shadow">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FiClock /> Registros de {dayjs(selectedDate).format('DD/MM/YYYY')}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {['Tipo', 'Horário', 'Selfie', 'Localização', 'Observação', 'Ações'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{entry.typeLabel}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm font-bold">{entry.time}</td>
                      <td className="px-6 py-4">
                        {entry.photo ? (
                          <button
                            onClick={() => setShowPhoto(entry.photo)}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            <FiCamera className="w-4 h-4" />
                            <img src={entry.photo} alt="selfie" className="w-8 h-8 rounded-full object-cover border border-gray-200 ml-1" />
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 max-w-[140px]">
                        {entry.latitude && entry.longitude ? (
                          <a
                            href={`https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {Number(entry.latitude).toFixed(5)},<br/>{Number(entry.longitude).toFixed(5)}
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {entry.adjustmentNote && (
                          <span className="flex items-center gap-1 text-yellow-600">
                            <FiAlertCircle className="w-3 h-3" /> {entry.adjustmentNote}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 flex gap-2">
                        <button onClick={() => openEdit(entry)} className="text-blue-500 hover:text-blue-700" title="Editar horário"><FiEdit2 /></button>
                        <button onClick={() => openDelete(entry)} className="text-red-400 hover:text-red-600" title="Excluir registro"><FiTrash2 /></button>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-gray-400 py-8">Nenhum registro nesta data.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Log de auditoria */}
        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FiAlertCircle /> Log de Ajustes (últimos 100)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Data', 'Funcionário', 'Ação', 'Justificativa'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-600">{dayjs(log.createdAt).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm')}</td>
                    <td className="px-6 py-3 text-sm font-medium">{log.employee?.name}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColors[log.action] || ''}`}>
                        {actionLabels[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{log.reason}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-8">Nenhum ajuste registrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Adicionar */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Adicionar Registro</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none">
                  {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data/Hora</label>
                <input type="datetime-local" value={form.timestamp} onChange={e => setForm({...form, timestamp: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justificativa *</label>
                <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
                  placeholder="Motivo do ajuste (mín. 5 caracteres)" rows={3} required
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Adicionar</button>
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Editar Horário — {currentEntry?.typeLabel}</h2>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Novo Horário</label>
                <input type="datetime-local" value={form.timestamp} onChange={e => setForm({...form, timestamp: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justificativa *</label>
                <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
                  placeholder="Motivo do ajuste" rows={3} required
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Salvar</button>
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Excluir */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-2 text-red-600">Excluir Registro</h2>
            <p className="text-sm text-gray-500 mb-4">Tem certeza que deseja remover o registro de <strong>{currentEntry?.typeLabel}</strong> às <strong>{currentEntry?.time}</strong>?</p>
            <form onSubmit={handleDelete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justificativa *</label>
                <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
                  placeholder="Motivo da exclusão" rows={3} required
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700">Excluir</button>
                <button type="button" onClick={() => setShowDeleteModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de selfie */}
      {showPhoto && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center p-4"
          style={{ zIndex: 9999 }}
          onClick={() => setShowPhoto(null)}
        >
          <div className="bg-white rounded-2xl overflow-hidden max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <FiCamera className="w-4 h-4 text-blue-600" /> Selfie do Registro
              </h3>
              <button onClick={() => setShowPhoto(null)} className="text-gray-400 hover:text-red-500">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <img src={showPhoto} alt="Selfie do ponto" className="w-full object-cover" style={{ maxHeight: '440px' }} />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
