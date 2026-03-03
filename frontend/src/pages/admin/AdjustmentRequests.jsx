import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/AdminLayout';
import { FiCheckCircle, FiXCircle, FiClock, FiUser, FiCalendar, FiEdit2, FiPlus, FiTrash2, FiFilter } from 'react-icons/fi';

const TYPE_LABELS = { CLOCK_IN: 'Entrada', BREAK_START: 'Saída Almoço', BREAK_END: 'Volta Almoço', CLOCK_OUT: 'Saída' };
const ACTION_MAP = {
  EDIT:   { label: 'Editar horário',   icon: FiEdit2,  bg: 'bg-yellow-50 border-yellow-200' },
  ADD:    { label: 'Adicionar batida',  icon: FiPlus,   bg: 'bg-green-50 border-green-200' },
  DELETE: { label: 'Excluir batida',    icon: FiTrash2, bg: 'bg-red-50 border-red-200' },
};
const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function AdjustmentRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDING');
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [processing, setProcessing] = useState(null);

  useEffect(() => { fetchRequests(); }, [filter]);

  async function fetchRequests() {
    setLoading(true);
    try {
      const res = await api.get(`/adjustment-requests/pending?status=${filter}`);
      setRequests(res.data.requests || []);
    } catch { setRequests([]); }
    finally { setLoading(false); }
  }

  async function handleApprove(requestId) {
    setProcessing(requestId);
    try {
      await api.put(`/adjustment-requests/${requestId}/approve`, { reviewNote: 'Aprovado pelo administrador' });
      toast.success('Solicitação aprovada e aplicada!');
      fetchRequests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao aprovar');
    }
    setProcessing(null);
  }

  async function handleReject() {
    if (!rejectNote || rejectNote.length < 3) return toast.error('Informe o motivo da rejeição');
    setProcessing(rejectModal);
    try {
      await api.put(`/adjustment-requests/${rejectModal}/reject`, { reviewNote: rejectNote });
      toast.success('Solicitação rejeitada');
      setRejectModal(null);
      setRejectNote('');
      fetchRequests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao rejeitar');
    }
    setProcessing(null);
  }

  return (
    <AdminLayout title="Solicitações de Ajuste">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <FiFilter className="w-4 h-4 text-gray-400" />
          {[
            { value: 'PENDING', label: 'Pendentes' },
            { value: 'APPROVED', label: 'Aprovadas' },
            { value: 'REJECTED', label: 'Rejeitadas' },
          ].map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-8 text-center">
            <FiClock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Nenhuma solicitação {filter === 'PENDING' ? 'pendente' : filter === 'APPROVED' ? 'aprovada' : 'rejeitada'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(req => {
              const action = ACTION_MAP[req.requestType] || ACTION_MAP.EDIT;
              const ActionIcon = action.icon;
              let requestedValue = null;
              try { requestedValue = req.requestedValue ? JSON.parse(req.requestedValue) : null; } catch {}
              
              return (
                <div key={req.id} className={`bg-white rounded-xl shadow border-l-4 p-5 ${action.bg}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <FiUser className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-800">{req.employee?.name}</span>
                        {req.employee?.department && (
                          <span className="text-xs text-gray-400">• {req.employee.department}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <ActionIcon className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">{action.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status]}`}>
                          {req.status === 'PENDING' ? 'Pendente' : req.status === 'APPROVED' ? 'Aprovada' : 'Rejeitada'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <FiCalendar className="w-3 h-3" /> {req.createdAtFormatted}
                    </span>
                  </div>

                  {/* Detalhes */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm mb-3">
                    {req.entryDate && (
                      <p className="text-gray-600">
                        <strong>Registro atual:</strong> {req.entryDate} às {req.entryTime}
                        {req.timeEntry?.type && ` (${TYPE_LABELS[req.timeEntry.type] || req.timeEntry.type})`}
                      </p>
                    )}
                    {requestedValue?.timestamp && (
                      <p className="text-gray-600">
                        <strong>Horário solicitado:</strong> {new Date(requestedValue.timestamp).toLocaleString('pt-BR')}
                        {requestedValue.type && ` (${TYPE_LABELS[requestedValue.type] || requestedValue.type})`}
                      </p>
                    )}
                    <p className="text-gray-700"><strong>Justificativa:</strong> {req.reason}</p>
                  </div>

                  {/* Ações */}
                  {req.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={processing === req.id}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50"
                      >
                        <FiCheckCircle className="w-4 h-4" />
                        {processing === req.id ? 'Processando...' : 'Aprovar'}
                      </button>
                      <button
                        onClick={() => { setRejectModal(req.id); setRejectNote(''); }}
                        disabled={processing === req.id}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 py-2 rounded-lg hover:bg-red-100 transition font-medium border border-red-200 disabled:opacity-50"
                      >
                        <FiXCircle className="w-4 h-4" /> Rejeitar
                      </button>
                    </div>
                  )}

                  {req.status !== 'PENDING' && req.reviewNote && (
                    <div className={`rounded-lg p-2 text-xs ${req.status === 'APPROVED' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <strong>Nota do revisor:</strong> {req.reviewNote}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal rejeição */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-600">
              <FiXCircle /> Rejeitar Solicitação
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da Rejeição *</label>
                <textarea
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  placeholder="Explique ao funcionário por que a solicitação foi rejeitada"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={handleReject} disabled={processing}
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
                  Confirmar Rejeição
                </button>
                <button onClick={() => setRejectModal(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
