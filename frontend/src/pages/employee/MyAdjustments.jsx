import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import EmployeeLayout from '../../components/EmployeeLayout';
import { FiSend, FiClock, FiCheckCircle, FiXCircle, FiLoader, FiPlus, FiEdit2, FiTrash2, FiAlertCircle } from 'react-icons/fi';

const TYPE_LABELS = { CLOCK_IN: 'Entrada', BREAK_START: 'Saída Almoço', BREAK_END: 'Volta Almoço', CLOCK_OUT: 'Saída' };
const STATUS_MAP = {
  PENDING:  { label: 'Pendente',  color: 'bg-yellow-100 text-yellow-700', icon: FiLoader },
  APPROVED: { label: 'Aprovado',  color: 'bg-green-100 text-green-700',   icon: FiCheckCircle },
  REJECTED: { label: 'Rejeitado', color: 'bg-red-100 text-red-700',       icon: FiXCircle },
};
const ACTION_MAP = {
  EDIT:   { label: 'Editar horário',   icon: FiEdit2,  color: 'text-yellow-600' },
  ADD:    { label: 'Adicionar batida',  icon: FiPlus,   color: 'text-green-600' },
  DELETE: { label: 'Excluir batida',    icon: FiTrash2, color: 'text-red-600' },
};

export default function MyAdjustments() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ requestType: 'ADD', type: 'CLOCK_IN', timestamp: '', reason: '' });

  // Para solicitar edição de um registro existente, precisamos carregar os registros do dia  
  const [dayEntries, setDayEntries] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => { fetchRequests(); }, []);

  async function fetchRequests() {
    setLoading(true);
    try {
      const res = await api.get('/adjustment-requests/my-requests');
      setRequests(res.data.requests || []);
    } catch { setRequests([]); }
    finally { setLoading(false); }
  }

  async function fetchDayEntries(date) {
    if (!date) return;
    try {
      const res = await api.get(`/time-entries/history?startDate=${date}&endDate=${date}`);
      const days = res.data.days || [];
      if (days.length > 0) {
        setDayEntries(days[0].entries.map((e, idx) => ({ ...e, idx })));
      } else {
        setDayEntries([]);
      }
    } catch { setDayEntries([]); }
  }

  function openNewRequest() {
    setForm({ requestType: 'ADD', type: 'CLOCK_IN', timestamp: '', reason: '' });
    setSelectedEntry(null);
    setSelectedDate('');
    setDayEntries([]);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.reason || form.reason.length < 5) return toast.error('Justificativa obrigatória (mín. 5 caracteres)');

    try {
      const body = {
        requestType: form.requestType,
        reason: form.reason,
      };

      if (form.requestType === 'ADD') {
        if (!form.timestamp) return toast.error('Informe a data/hora');
        body.requestedValue = { timestamp: form.timestamp, type: form.type };
      } else if (form.requestType === 'EDIT') {
        if (!selectedEntry) return toast.error('Selecione um registro para editar');
        if (!form.timestamp) return toast.error('Informe o novo horário');
        body.entryId = selectedEntry.id;
        body.requestedValue = { timestamp: form.timestamp };
      } else if (form.requestType === 'DELETE') {
        if (!selectedEntry) return toast.error('Selecione um registro para excluir');
        body.entryId = selectedEntry.id;
      }

      await api.post('/adjustment-requests/request', body);
      toast.success('Solicitação enviada!');
      setShowModal(false);
      fetchRequests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao enviar solicitação');
    }
  }

  return (
    <EmployeeLayout title="Solicitar Ajuste">
      <div className="max-w-2xl mx-auto p-4 space-y-6 pb-8">
        {/* Botão nova solicitação */}
        <button
          onClick={openNewRequest}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition shadow"
        >
          <FiSend className="w-5 h-5" /> Nova Solicitação de Ajuste
        </button>

        {/* Lista de solicitações */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Minhas Solicitações</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center">
              <FiAlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Nenhuma solicitação</p>
              <p className="text-gray-400 text-sm mt-1">Use o botão acima para solicitar um ajuste.</p>
            </div>
          ) : requests.map(req => {
            const statusInfo = STATUS_MAP[req.status] || STATUS_MAP.PENDING;
            const actionInfo = ACTION_MAP[req.requestType] || ACTION_MAP.EDIT;
            const StatusIcon = statusInfo.icon;
            const ActionIcon = actionInfo.icon;
            return (
              <div key={req.id} className="bg-white rounded-xl shadow p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ActionIcon className={`w-4 h-4 ${actionInfo.color}`} />
                    <span className="text-sm font-semibold text-gray-800">{actionInfo.label}</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" /> {statusInfo.label}
                  </span>
                </div>

                {req.entryDate && (
                  <p className="text-xs text-gray-500">
                    Registro: {req.entryDate} às {req.entryTime} ({TYPE_LABELS[req.timeEntry?.type] || ''})
                  </p>
                )}

                <p className="text-sm text-gray-700"><strong>Justificativa:</strong> {req.reason}</p>
                <p className="text-xs text-gray-400">Enviado em {req.createdAtFormatted}</p>

                {req.status === 'REJECTED' && req.reviewNote && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-2 mt-2">
                    <p className="text-xs text-red-700"><strong>Motivo da rejeição:</strong> {req.reviewNote}</p>
                    <p className="text-xs text-red-500">Revisado em {req.reviewedAtFormatted}</p>
                  </div>
                )}
                {req.status === 'APPROVED' && (
                  <div className="bg-green-50 border border-green-100 rounded-lg p-2 mt-2">
                    <p className="text-xs text-green-700"><strong>Aprovado!</strong> {req.reviewNote}</p>
                    <p className="text-xs text-green-500">Revisado em {req.reviewedAtFormatted}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal nova solicitação */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <FiSend className="text-blue-600" /> Solicitar Ajuste
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tipo de solicitação */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Solicitação</label>
                <select
                  value={form.requestType}
                  onChange={e => { setForm({ ...form, requestType: e.target.value }); setSelectedEntry(null); }}
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="ADD">Adicionar batida faltante</option>
                  <option value="EDIT">Corrigir horário de batida</option>
                  <option value="DELETE">Excluir batida duplicada</option>
                </select>
              </div>

              {/* Para EDIT/DELETE: selecionar data e registro */}
              {(form.requestType === 'EDIT' || form.requestType === 'DELETE') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data do Registro</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={e => { setSelectedDate(e.target.value); fetchDayEntries(e.target.value); setSelectedEntry(null); }}
                      className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  {dayEntries.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Selecione o registro</label>
                      <div className="space-y-2">
                        {dayEntries.map((entry, idx) => (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => setSelectedEntry(entry)}
                            className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                              selectedEntry?.idx === entry.idx
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <span className="font-mono font-bold text-sm">{entry.time}</span>
                            <span className="ml-2 text-xs text-gray-500">{TYPE_LABELS[entry.type] || entry.type}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedDate && dayEntries.length === 0 && (
                    <p className="text-sm text-gray-400">Nenhum registro nesta data.</p>
                  )}
                </>
              )}

              {/* Para ADD: tipo de batida */}
              {form.requestType === 'ADD' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Batida</label>
                  <select
                    value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}

              {/* Data/hora (ADD e EDIT) */}
              {(form.requestType === 'ADD' || form.requestType === 'EDIT') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {form.requestType === 'ADD' ? 'Data/Hora da Batida' : 'Novo Horário'}
                  </label>
                  <input
                    type="datetime-local"
                    value={form.timestamp}
                    onChange={e => setForm({ ...form, timestamp: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
              )}

              {/* Justificativa */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justificativa *</label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Explique o motivo do ajuste (mín. 5 caracteres)"
                  rows={3}
                  required
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex gap-3">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium">
                  Enviar Solicitação
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </EmployeeLayout>
  );
}
