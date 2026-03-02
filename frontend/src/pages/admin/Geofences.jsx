import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiMapPin, FiPlus, FiEdit2, FiTrash2, FiCheck, FiX } from 'react-icons/fi';

export default function Geofences() {
  const [fences, setFences] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radiusMeters: 200 });

  useEffect(() => { fetchFences(); }, []);

  async function fetchFences() {
    try {
      const res = await api.get('/geofences');
      setFences(res.data.geofences);
    } catch { setFences([]); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      name: form.name,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radiusMeters: parseInt(form.radiusMeters)
    };
    if (isNaN(payload.latitude) || isNaN(payload.longitude)) return toast.error('Coordenadas inválidas');
    try {
      if (editing) {
        await api.put(`/geofences/${editing}`, payload);
        toast.success('Cerca atualizada!');
      } else {
        await api.post('/geofences', payload);
        toast.success('Cerca criada!');
      }
      setShowModal(false);
      setEditing(null);
      setForm({ name: '', latitude: '', longitude: '', radiusMeters: 200 });
      fetchFences();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta cerca virtual?')) return;
    try {
      await api.delete(`/geofences/${id}`);
      toast.success('Cerca excluída');
      fetchFences();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro');
    }
  }

  function openEdit(fence) {
    setEditing(fence.id);
    setForm({ name: fence.name, latitude: fence.latitude, longitude: fence.longitude, radiusMeters: fence.radiusMeters });
    setShowModal(true);
  }

  function openAdd() {
    // Try to get current location for convenience
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setForm({ name: '', latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6), radiusMeters: 200 }),
        () => setForm({ name: '', latitude: '', longitude: '', radiusMeters: 200 })
      );
    }
    setEditing(null);
    setShowModal(true);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center gap-4">
        <Link to="/admin/dashboard" className="text-gray-400 hover:text-gray-600"><FiArrowLeft /></Link>
        <h1 className="text-xl font-bold text-gray-800">Cercas Virtuais (Geofencing)</h1>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex justify-end">
          <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <FiPlus /> Nova Cerca
          </button>
        </div>

        <div className="bg-white rounded-xl shadow">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Nome', 'Latitude', 'Longitude', 'Raio (m)', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fences.map(fence => (
                  <tr key={fence.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium flex items-center gap-2"><FiMapPin className="text-blue-500" />{fence.name}</td>
                    <td className="px-6 py-4 text-sm font-mono">{fence.latitude}</td>
                    <td className="px-6 py-4 text-sm font-mono">{fence.longitude}</td>
                    <td className="px-6 py-4 text-sm font-bold">{fence.radiusMeters}m</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${fence.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {fence.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 flex gap-2">
                      <button onClick={() => openEdit(fence)} className="text-blue-500 hover:text-blue-700"><FiEdit2 /></button>
                      <button onClick={() => handleDelete(fence.id)} className="text-red-400 hover:text-red-600"><FiTrash2 /></button>
                    </td>
                  </tr>
                ))}
                {fences.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-8">Nenhuma cerca cadastrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-blue-800 mb-2">Como usar</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>Cadastre a localização da empresa (latitude/longitude) e o raio permitido</li>
            <li>Configure o modo em <strong>Configurações</strong>: Desligado, Avisar ou Bloquear</li>
            <li>Funcionários fora da cerca terão o ponto bloqueado ou receberão um aviso</li>
          </ul>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Editar Cerca' : 'Nova Cerca Virtual'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="Ex: Escritório Principal" required
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <input type="text" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})}
                    placeholder="-23.5505" required
                    className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <input type="text" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})}
                    placeholder="-46.6333" required
                    className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Raio (metros)</label>
                <input type="number" value={form.radiusMeters} onChange={e => setForm({...form, radiusMeters: e.target.value})}
                  min={10} max={10000} required
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">{editing ? 'Salvar' : 'Criar'}</button>
                <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
