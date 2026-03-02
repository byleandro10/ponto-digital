import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  FiArrowLeft, FiMapPin, FiFilter, FiUsers, FiAlertTriangle,
  FiCheckCircle, FiXCircle, FiClock, FiCamera, FiRefreshCw, FiX, FiUser
} from 'react-icons/fi';

// Fix ícones do Leaflet no Vite/Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Ícone customizado colorido por tipo de batida
function createIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:32px;height:32px;border-radius:50% 50% 50% 0;
      background:${color};border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      transform:rotate(-45deg);
    "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  });
}

// Ícone de cerca (centro)
const fenceIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:24px;height:24px;border-radius:50%;
    background:#2563eb;border:3px solid white;
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
    display:flex;align-items:center;justify-content:center;
  ">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
});

const TYPE_COLORS = {
  CLOCK_IN: '#16a34a',
  BREAK_START: '#ca8a04',
  BREAK_END: '#2563eb',
  CLOCK_OUT: '#dc2626',
};

const TYPE_LABELS = {
  CLOCK_IN: 'Entrada',
  BREAK_START: 'Saída Almoço',
  BREAK_END: 'Volta Almoço',
  CLOCK_OUT: 'Saída',
};

const FENCE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

// Componente para centrar o mapa nos marcadores
function FitBounds({ markers, geofences }) {
  const map = useMap();
  useEffect(() => {
    const points = [];
    markers.forEach(m => points.push([m.latitude, m.longitude]));
    geofences.forEach(f => points.push([f.latitude, f.longitude]));
    if (points.length > 0) {
      try { map.fitBounds(points, { padding: [40, 40], maxZoom: 17 }); } catch {}
    }
  }, [markers, geofences]);
  return null;
}

export default function PunchMapPage() {
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterType, setFilterType] = useState('');
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [showPhoto, setShowPhoto] = useState(null);

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data.employees || [])).catch(() => {});
    fetchMap();
  }, []);

  async function fetchMap() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDate) params.append('date', filterDate);
      if (filterEmployee) params.append('employeeId', filterEmployee);
      const res = await api.get(`/reports/punch-map?${params}`);
      setMapData(res.data);
    } catch (err) {
      toast.error('Erro ao carregar dados do mapa');
    } finally {
      setLoading(false);
    }
  }

  function handleFilter(e) {
    e.preventDefault();
    fetchMap();
  }

  // Filtra marcadores por tipo
  const visibleMarkers = mapData?.markers?.filter(m =>
    !filterType || m.type === filterType
  ) || [];

  const geofences = mapData?.geofences || [];

  // Centro padrão (Brasil) se não há dados
  const defaultCenter = geofences.length > 0
    ? [geofences[0].latitude, geofences[0].longitude]
    : visibleMarkers.length > 0
      ? [visibleMarkers[0].latitude, visibleMarkers[0].longitude]
      : [-15.7801, -47.9292];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <Link to="/admin/dashboard" className="text-gray-400 hover:text-gray-600">
          <FiArrowLeft />
        </Link>
        <FiMapPin className="w-5 h-5 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-800 flex-1">Mapa de Batidas</h1>
        <button
          onClick={fetchMap}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-40"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Filtros */}
        <form onSubmit={handleFilter} className="bg-white rounded-xl shadow p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data</label>
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Funcionário</label>
              <select
                value={filterEmployee}
                onChange={e => setFilterEmployee(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Todos</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Todos</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <FiFilter className="w-4 h-4" /> Filtrar
              </button>
            </div>
          </div>
        </form>

        {/* Cards de resumo */}
        {mapData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg"><FiMapPin className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{mapData.totalWithLocation}</p>
                <p className="text-xs text-gray-500">Com localização</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
              <div className="bg-gray-100 p-2 rounded-lg"><FiXCircle className="w-5 h-5 text-gray-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{mapData.totalWithoutLocation}</p>
                <p className="text-xs text-gray-500">Sem localização</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg"><FiCheckCircle className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">
                  {visibleMarkers.filter(m => m.insideGeofence === true).length}
                </p>
                <p className="text-xs text-gray-500">Dentro da cerca</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg"><FiAlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">
                  {visibleMarkers.filter(m => m.insideGeofence === false).length}
                </p>
                <p className="text-xs text-gray-500">Fora da cerca</p>
              </div>
            </div>
          </div>
        )}

        {/* Legenda */}
        <div className="bg-white rounded-xl shadow p-3 flex flex-wrap gap-4 items-center text-sm">
          <span className="font-semibold text-gray-700">Legenda:</span>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: TYPE_COLORS[k] }} />
              <span className="text-gray-600">{v}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-2 rounded border-2 border-blue-400 bg-blue-100 opacity-60" />
            <span className="text-gray-600">Cerca virtual</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Mapa principal */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow overflow-hidden">
            {loading ? (
              <div className="h-[500px] flex items-center justify-center">
                <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <MapContainer
                center={defaultCenter}
                zoom={14}
                style={{ height: '500px', width: '100%' }}
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds markers={visibleMarkers} geofences={geofences} />

                {/* Cercas virtuais: círculo + marcador do centro */}
                {geofences.map((fence, i) => {
                  const color = FENCE_COLORS[i % FENCE_COLORS.length];
                  return (
                    <div key={fence.id}>
                      <Circle
                        center={[fence.latitude, fence.longitude]}
                        radius={fence.radius}
                        pathOptions={{
                          color: color,
                          fillColor: color,
                          fillOpacity: 0.10,
                          weight: 2,
                          dashArray: '6 4'
                        }}
                      >
                        <Tooltip permanent direction="center" className="fence-label">
                          {fence.name} ({fence.radius}m)
                        </Tooltip>
                      </Circle>
                      <Marker
                        position={[fence.latitude, fence.longitude]}
                        icon={fenceIcon}
                      >
                        <Popup>
                          <div className="text-sm">
                            <p className="font-bold text-blue-700">{fence.name}</p>
                            <p className="text-gray-600">Centro da cerca</p>
                            <p className="text-gray-600">Raio: <strong>{fence.radius}m</strong></p>
                            <p className="text-gray-500 text-xs mt-1">
                              {fence.latitude.toFixed(6)}, {fence.longitude.toFixed(6)}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    </div>
                  );
                })}

                {/* Marcadores das batidas */}
                {visibleMarkers.map((marker) => (
                  <Marker
                    key={marker.id}
                    position={[marker.latitude, marker.longitude]}
                    icon={createIcon(marker.color)}
                    eventHandlers={{ click: () => setSelectedMarker(marker) }}
                  >
                    <Popup>
                      <div className="text-sm min-w-[200px]">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-white text-xs font-bold"
                            style={{ background: marker.color }}
                          >
                            {marker.typeLabel}
                          </span>
                          {marker.insideGeofence === true && (
                            <span className="text-green-600 text-xs">✓ Dentro</span>
                          )}
                          {marker.insideGeofence === false && (
                            <span className="text-red-600 text-xs">✗ Fora</span>
                          )}
                        </div>
                        <p className="font-bold text-gray-800">{marker.employeeName}</p>
                        {marker.employeePosition && (
                          <p className="text-gray-500 text-xs">{marker.employeePosition}</p>
                        )}
                        <p className="text-gray-700 mt-1">
                          <FiClock className="inline w-3 h-3 mr-1" />{marker.time}
                        </p>
                        {marker.address && (
                          <p className="text-gray-500 text-xs mt-1 leading-tight">{marker.address}</p>
                        )}
                        {marker.distanceFromFence != null && (
                          <p className={`text-xs mt-1 font-medium ${
                            marker.insideGeofence ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {marker.insideGeofence
                              ? `✓ ${marker.distanceFromFence}m do centro da cerca`
                              : `✗ ${marker.distanceFromFence}m do centro (raio: ${marker.fenceRadius}m)`
                            }
                          </p>
                        )}
                        {marker.geofenceName && (
                          <p className="text-gray-400 text-xs">Cerca: {marker.geofenceName}</p>
                        )}
                        {marker.photo && (
                          <button
                            onClick={() => setShowPhoto(marker.photo)}
                            className="mt-2 flex items-center gap-1 text-blue-600 text-xs hover:underline"
                          >
                            <FiCamera className="w-3 h-3" /> Ver selfie
                          </button>
                        )}
                        <p className="text-gray-400 text-xs mt-1">
                          {marker.latitude.toFixed(6)}, {marker.longitude.toFixed(6)}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}
            {!loading && visibleMarkers.length === 0 && (
              <div className="h-12 flex items-center justify-center bg-yellow-50 border-t border-yellow-200">
                <p className="text-yellow-700 text-sm">
                  {mapData?.totalWithoutLocation > 0
                    ? `${mapData.totalWithoutLocation} batida(s) sem localização registrada neste período.`
                    : 'Nenhuma batida com localização neste período.'}
                </p>
              </div>
            )}
          </div>

          {/* Painel lateral: lista + detalhes */}
          <div className="bg-white rounded-xl shadow overflow-hidden flex flex-col">
            {/* Se há marcador selecionado, mostra painel de detalhes */}
            {selectedMarker ? (
              <div className="flex flex-col h-full">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                    <FiUser className="w-4 h-4" /> Detalhes do Registro
                  </h2>
                  <button onClick={() => setSelectedMarker(null)} className="text-gray-400 hover:text-red-500">
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-4 space-y-3">
                  {/* Badge tipo */}
                  <div className="flex items-center gap-2">
                    <span
                      className="px-3 py-1 rounded-full text-white text-xs font-bold"
                      style={{ background: selectedMarker.color }}
                    >
                      {selectedMarker.typeLabel}
                    </span>
                    {selectedMarker.insideGeofence === true && (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium flex items-center gap-1">
                        <FiCheckCircle className="w-3 h-3" /> Dentro da cerca
                      </span>
                    )}
                    {selectedMarker.insideGeofence === false && (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium flex items-center gap-1">
                        <FiAlertTriangle className="w-3 h-3" /> Fora da cerca
                      </span>
                    )}
                  </div>

                  {/* Dados do funcionário */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="font-bold text-gray-800">{selectedMarker.employeeName}</p>
                    {selectedMarker.employeePosition && (
                      <p className="text-xs text-gray-500">{selectedMarker.employeePosition}</p>
                    )}
                    <p className="text-sm text-gray-700 mt-1 flex items-center gap-1">
                      <FiClock className="w-3.5 h-3.5" /> {selectedMarker.time}
                    </p>
                  </div>

                  {/* Localização */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Localização</p>
                    <p className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1">
                      {selectedMarker.latitude.toFixed(6)}, {selectedMarker.longitude.toFixed(6)}
                    </p>
                    {selectedMarker.address && (
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{selectedMarker.address}</p>
                    )}
                  </div>

                  {/* Distância da cerca */}
                  {selectedMarker.distanceFromFence != null && (
                    <div className={`rounded-lg p-3 ${selectedMarker.insideGeofence ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <p className="text-xs font-semibold mb-0.5" style={{ color: selectedMarker.insideGeofence ? '#15803d' : '#dc2626' }}>
                        {selectedMarker.insideGeofence ? '✓ Dentro da cerca virtual' : '✗ Fora da cerca virtual'}
                      </p>
                      <p className="text-xs text-gray-600">
                        Distância do centro: <strong>{selectedMarker.distanceFromFence}m</strong>
                        {selectedMarker.fenceRadius && ` (raio: ${selectedMarker.fenceRadius}m)`}
                      </p>
                      {selectedMarker.geofenceName && (
                        <p className="text-xs text-gray-500 mt-0.5">Cerca: {selectedMarker.geofenceName}</p>
                      )}
                    </div>
                  )}

                  {/* Selfie */}
                  {selectedMarker.photo ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                        <FiCamera className="w-3 h-3" /> Selfie do Registro
                      </p>
                      <img
                        src={selectedMarker.photo}
                        alt="Selfie do ponto"
                        className="w-full rounded-xl object-cover cursor-pointer hover:opacity-90 transition border border-gray-200"
                        style={{ maxHeight: '280px' }}
                        onClick={() => setShowPhoto(selectedMarker.photo)}
                      />
                      <button
                        onClick={() => setShowPhoto(selectedMarker.photo)}
                        className="mt-2 w-full text-center text-xs text-blue-600 hover:underline"
                      >
                        Ampliar foto
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 text-xs bg-gray-50 rounded-lg p-3">
                      <FiCamera className="w-4 h-4" />
                      <span>Nenhuma selfie registrada</span>
                    </div>
                  )}
                </div>

                {/* Botão voltar para lista */}
                <div className="p-3 border-t bg-gray-50">
                  <button
                    onClick={() => setSelectedMarker(null)}
                    className="w-full text-sm text-gray-600 hover:text-blue-600 flex items-center justify-center gap-1"
                  >
                    ← Ver lista completa
                  </button>
                </div>
              </div>
            ) : (
              /* Lista de registros */
              <>
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <FiUsers className="w-4 h-4" /> Registros
                  </h2>
                  <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                    {visibleMarkers.length} com local
                  </span>
                </div>
                <div className="overflow-y-auto flex-1" style={{ maxHeight: '460px' }}>
                  {visibleMarkers.length === 0 ? (
                    <div className="p-6 text-center text-gray-400">
                      <FiMapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum registro com localização.</p>
                    </div>
                  ) : (
                    visibleMarkers.map(marker => (
                      <button
                        key={marker.id}
                        onClick={() => setSelectedMarker(marker)}
                        className="w-full text-left px-4 py-3 border-b hover:bg-blue-50 transition"
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                            style={{ background: marker.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-sm font-semibold text-gray-800 truncate">
                                {marker.employeeName}
                              </p>
                              <span className="text-xs font-mono text-gray-600 flex-shrink-0">
                                {marker.time}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{marker.typeLabel}</p>
                            {marker.distanceFromFence != null && (
                              <p className={`text-xs font-medium mt-0.5 ${
                                marker.insideGeofence ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {marker.insideGeofence
                                  ? `✓ ${marker.distanceFromFence}m do centro`
                                  : `✗ ${marker.distanceFromFence}m fora (raio: ${marker.fenceRadius}m)`
                                }
                              </p>
                            )}
                            {marker.address && (
                              <p className="text-xs text-gray-400 truncate mt-0.5">{marker.address}</p>
                            )}
                          </div>
                          {marker.photo && (
                            <FiCamera className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" title="Tem selfie" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                {/* Aviso de registros sem localização */}
                {mapData?.totalWithoutLocation > 0 && (
                  <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200">
                    <p className="text-xs text-yellow-700 flex items-center gap-1">
                      <FiAlertTriangle className="w-3 h-3" />
                      {mapData.totalWithoutLocation} registro(s) sem localização (não exibidos no mapa)
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal de selfie ampliada — z-[9999] acima do Leaflet */}
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
            <img
              src={showPhoto}
              alt="Selfie do ponto"
              className="w-full object-cover"
              style={{ maxHeight: '440px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
