import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiMapPin, FiPlus, FiEdit2, FiTrash2, FiCheck, FiX, FiMap, FiCrosshair } from 'react-icons/fi';

// Fix Leaflet default icons no Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const FENCE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

function FlyTo({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      map.flyTo([lat, lng], 16, { animate: true, duration: 0.8 });
    }
  }, [lat, lng, map]);
  return null;
}

export default function Geofences() {
  const [fences, setFences] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radiusMeters: 200 });
  const [flyTarget, setFlyTarget] = useState(null);
  const defaultCenter = [-15.7801, -47.9292];

  useEffect(() => { fetchFences(); }, []);

  async function fetchFences() {
    try {
      const res = await api.get('/geofences');
      setFences(res.data.geofences);
    } catch { setFences([]); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const rad = parseInt(form.radiusMeters);
    if (isNaN(lat) || isNaN(lng)) return toast.error('Coordenadas inválidas');
    if (rad < 10 || rad > 10000) return toast.error('Raio deve ser entre 10 e 10.000 metros');
    try {
      if (editing) {
        await api.put(`/geofences/${editing}`, { name: form.name, latitude: lat, longitude: lng, radiusMeters: rad });
        toast.success('Cerca atualizada!');
      } else {
        await api.post('/geofences', { name: form.name, latitude: lat, longitude: lng, radiusMeters: rad });
        toast.success('Cerca criada!');
      }
      setShowModal(false);
      setEditing(null);
      setForm({ name: '', latitude: '', longitude: '', radiusMeters: 200 });
      fetchFences();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar cerca');
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
    const rad = fence.radiusMeters || fence.radius;
    const lat = parseFloat(fence.latitude);
    const lng = parseFloat(fence.longitude);
    setForm({ name: fence.name, latitude: lat, longitude: lng, radiusMeters: rad });
    setFlyTarget({ lat, lng });
    setShowModal(true);
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: '', latitude: '', longitude: '', radiusMeters: 200 });
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        setForm(f => ({ ...f, latitude: lat, longitude: lng }));
        setFlyTarget({ lat, lng });
      }, () => {});
    }
    setShowModal(true);
  }

  const handleMapClick = useCallback(({ lat, lng }) => {
    setForm(f => ({ ...f, latitude: parseFloat(lat.toFixed(6)), longitude: parseFloat(lng.toFixed(6)) }));
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error('Geolocalização não suportada');
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = parseFloat(pos.coords.latitude.toFixed(6));
      const lng = parseFloat(pos.coords.longitude.toFixed(6));
      setForm(f => ({ ...f, latitude: lat, longitude: lng }));
      setFlyTarget({ lat, lng });
    }, () => toast.error('Não foi possível obter localização'));
  }

  const mapCenter = fences.length > 0
    ? [parseFloat(fences[0].latitude), parseFloat(fences[0].longitude)]
    : defaultCenter;

  const formLat = parseFloat(form.latitude);
  const formLng = parseFloat(form.longitude);
  const formCenter = (!isNaN(formLat) && !isNaN(formLng)) ? [formLat, formLng] : mapCenter;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center gap-4">
        <Link to="/admin/dashboard" className="text-gray-400 hover:text-gray-600"><FiArrowLeft /></Link>
        <FiMapPin className="w-5 h-5 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-800">Cercas Virtuais (Geofencing)</h1>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">{fences.length} cerca(s) cadastrada(s)</p>
          <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            <FiPlus /> Nova Cerca
          </button>
        </div>

        {/* Mapa visão geral — isolation:isolate impede z-index do Leaflet de vazar para o modal */}
        <div className="bg-white rounded-xl shadow overflow-hidden" style={{ isolation: 'isolate' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <FiMap className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-gray-700">Visão Geral — Todas as Cercas</h2>
          </div>
          <MapContainer center={mapCenter} zoom={fences.length > 0 ? 14 : 5} style={{ height: '360px', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {fences.map((fence, i) => {
              const color = FENCE_COLORS[i % FENCE_COLORS.length];
              const lat = parseFloat(fence.latitude);
              const lng = parseFloat(fence.longitude);
              const rad = parseInt(fence.radiusMeters || fence.radius);
              if (isNaN(lat) || isNaN(lng) || isNaN(rad)) return null;
              return (
                <span key={fence.id}>
                  <Circle
                    center={[lat, lng]}
                    radius={rad}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 2.5, dashArray: '6 4' }}
                  />
                  <Marker position={[lat, lng]}>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-bold" style={{ color }}>{fence.name}</p>
                        <p className="text-gray-600">Raio: <strong>{rad}m</strong></p>
                        <p className="text-gray-500 text-xs mt-1">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
                        <button onClick={() => openEdit(fence)} className="mt-2 text-blue-600 text-xs hover:underline flex items-center gap-1">
                          <FiEdit2 className="w-3 h-3" /> Editar
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                </span>
              );
            })}
          </MapContainer>
          {fences.length === 0 && (
            <div className="py-3 flex items-center justify-center bg-gray-50 border-t">
              <p className="text-sm text-gray-400">Cadastre uma cerca para visualizar no mapa.</p>
            </div>
          )}
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['', 'Nome', 'Latitude', 'Longitude', 'Raio', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fences.map((fence, i) => (
                  <tr key={fence.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="w-3 h-3 rounded-full" style={{ background: FENCE_COLORS[i % FENCE_COLORS.length] }} />
                    </td>
                    <td className="px-4 py-4 font-medium">
                      <div className="flex items-center gap-2"><FiMapPin className="text-blue-500 flex-shrink-0" />{fence.name}</div>
                    </td>
                    <td className="px-4 py-4 text-sm font-mono text-gray-600">{parseFloat(fence.latitude).toFixed(6)}</td>
                    <td className="px-4 py-4 text-sm font-mono text-gray-600">{parseFloat(fence.longitude).toFixed(6)}</td>
                    <td className="px-4 py-4 text-sm font-bold text-gray-800">{fence.radiusMeters || fence.radius}m</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${fence.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {fence.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-3">
                        <button onClick={() => openEdit(fence)} className="text-blue-500 hover:text-blue-700"><FiEdit2 /></button>
                        <button onClick={() => handleDelete(fence.id)} className="text-red-400 hover:text-red-600"><FiTrash2 /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {fences.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-10">
                      <FiMapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Nenhuma cerca cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-blue-800 mb-2">Como usar</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>Clique em <strong>Nova Cerca</strong> e depois <strong>clique no mapa</strong> para definir a posição exata</li>
            <li>Use o controle deslizante para ajustar o raio e visualizar a área no mapa em tempo real</li>
            <li>Configure o modo em <strong>Configurações</strong>: Desligado, Avisar ou Bloquear</li>
            <li>Veja onde os funcionários bateram ponto em <Link to="/admin/punch-map" className="underline font-medium">Mapa de Batidas</Link></li>
          </ul>
        </div>
      </div>

      {/* Modal com mapa interativo — z-[9999] para ficar acima do Leaflet */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">
                {editing ? 'Editar Cerca Virtual' : 'Nova Cerca Virtual'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditing(null); }} className="text-gray-400 hover:text-red-500">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Cerca</label>
                  <input
                    type="text" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Escritório Principal" required
                    className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Mapa interativo */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Posição <span className="text-gray-400 font-normal text-xs">(clique no mapa para definir)</span>
                    </label>
                    <button type="button" onClick={useMyLocation} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                      <FiCrosshair className="w-3 h-3" /> Minha localização
                    </button>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: '260px' }}>
                    <MapContainer center={formCenter} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
                      <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <MapClickHandler onMapClick={handleMapClick} />
                      {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
                      {!isNaN(formLat) && !isNaN(formLng) && (
                        <>
                          <Marker position={[formLat, formLng]} />
                          <Circle
                            center={[formLat, formLng]}
                            radius={parseInt(form.radiusMeters) || 200}
                            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2, dashArray: '6 4' }}
                          />
                        </>
                      )}
                    </MapContainer>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                    <input
                      type="text" value={form.latitude}
                      onChange={e => setForm({ ...form, latitude: e.target.value })}
                      placeholder="-23.5505" required
                      className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                    <input
                      type="text" value={form.longitude}
                      onChange={e => setForm({ ...form, longitude: e.target.value })}
                      placeholder="-46.6333" required
                      className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                    />
                  </div>
                </div>

                {/* Slider de raio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Raio permitido: <strong className="text-blue-600">{form.radiusMeters}m</strong>
                  </label>
                  <input
                    type="range" min={10} max={2000} step={10}
                    value={form.radiusMeters}
                    onChange={e => setForm({ ...form, radiusMeters: parseInt(e.target.value) })}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5 mb-2">
                    <span>10m</span><span>500m</span><span>1km</span><span>2km</span>
                  </div>
                  <input
                    type="number" value={form.radiusMeters}
                    onChange={e => setForm({ ...form, radiusMeters: parseInt(e.target.value) || 10 })}
                    min={10} max={10000}
                    placeholder="Valor exato em metros"
                    className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium transition">
                    {editing ? 'Salvar Alterações' : 'Criar Cerca'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setEditing(null); }}
                    className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 font-medium transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
