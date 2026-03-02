import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { FiClock, FiMapPin, FiCheckCircle, FiLogOut, FiCamera, FiAlertTriangle } from 'react-icons/fi';
import SelfieCapture from '../../components/SelfieCapture';

dayjs.locale('pt-br');

export default function PunchClock() {
  const { user, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState(dayjs());
  const [todayEntries, setTodayEntries] = useState([]);
  const [nextPunch, setNextPunch] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [selfieData, setSelfieData] = useState(null);
  const [requireSelfie, setRequireSelfie] = useState(false);
  const [hourBankBalance, setHourBankBalance] = useState(null);
  const [geoWarning, setGeoWarning] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(dayjs()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { fetchTodayEntries(); getLocation(); fetchCompanyConfig(); }, []);

  async function fetchCompanyConfig() {
    try {
      const res = await api.get('/geofences/config');
      setRequireSelfie(res.data.requireSelfie || false);
    } catch (err) { /* empresa pode não ter config */ }
  }

  async function fetchTodayEntries() {
    try {
      const response = await api.get('/time-entries/today');
      setTodayEntries(response.data.entries);
      setNextPunch(response.data.nextPunch);
      setIsComplete(response.data.isComplete);
      if (response.data.hourBankBalance !== undefined) {
        setHourBankBalance(response.data.hourBankBalance);
      }
    } catch (error) { console.error(error); }
  }

  function getLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => console.log('Geolocalização não disponível')
      );
    }
  }

  async function handlePunch(photo = null) {
    if (isComplete) return;

    // Se selfie obrigatória e não tem foto, abrir câmera
    if (requireSelfie && !photo && !selfieData) {
      setShowCamera(true);
      return;
    }

    setLoading(true);
    setGeoWarning(null);
    try {
      const data = {
        latitude: location?.latitude,
        longitude: location?.longitude,
        deviceInfo: navigator.userAgent,
        photo: photo || selfieData || undefined
      };
      const response = await api.post('/time-entries/punch', data);
      toast.success(response.data.message);
      if (response.data.warning) {
        setGeoWarning(response.data.warning);
      }
      setSelfieData(null);
      fetchTodayEntries();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao registrar ponto');
    } finally { setLoading(false); }
  }

  function onSelfieCapture(dataUrl) {
    setSelfieData(dataUrl);
    setShowCamera(false);
    // Auto-punch after selfie
    handlePunch(dataUrl);
  }

  const typeColors = {
    CLOCK_IN: 'bg-green-100 text-green-700',
    BREAK_START: 'bg-yellow-100 text-yellow-700',
    BREAK_END: 'bg-blue-100 text-blue-700',
    CLOCK_OUT: 'bg-red-100 text-red-700'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {showCamera && <SelfieCapture onCapture={onSelfieCapture} onCancel={() => setShowCamera(false)} />}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Ponto Digital</h1>
          <p className="text-xs text-gray-500">{user?.company?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user?.name}</span>
          <button onClick={logout} className="text-gray-400 hover:text-red-500"><FiLogOut /></button>
        </div>
      </header>
      <div className="max-w-lg mx-auto p-4 space-y-6 mt-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <p className="text-gray-500 text-sm capitalize">{currentTime.format('dddd, DD [de] MMMM [de] YYYY')}</p>
          <p className="text-6xl font-bold text-gray-800 mt-2 font-mono">{currentTime.format('HH:mm:ss')}</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            {location && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <FiMapPin className="w-3 h-3" /><span>Localização capturada</span>
              </div>
            )}
            {requireSelfie && (
              <div className="flex items-center gap-1 text-xs text-blue-600">
                <FiCamera className="w-3 h-3" /><span>Selfie obrigatória</span>
              </div>
            )}
          </div>
        </div>

        {geoWarning && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-700">{geoWarning}</p>
          </div>
        )}

        {hourBankBalance !== null && (
          <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
            <span className="text-sm text-gray-600">Banco de Horas</span>
            <span className={`text-lg font-bold font-mono ${hourBankBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {hourBankBalance >= 0 ? '+' : ''}{Math.floor(hourBankBalance / 60)}h{String(Math.abs(hourBankBalance) % 60).padStart(2, '0')}min
            </span>
          </div>
        )}

        <div className="text-center">
          {isComplete ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
              <FiCheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="text-green-700 font-medium mt-2">Dia completo!</p>
              <p className="text-green-500 text-sm">Todos os pontos foram registrados.</p>
            </div>
          ) : (
            <>
              <p className="text-gray-500 text-sm mb-3">Próximo registro: <strong>{nextPunch}</strong></p>
              <button onClick={() => handlePunch()} disabled={loading}
                className="w-40 h-40 rounded-full bg-blue-600 text-white text-lg font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center mx-auto">
                {loading ? (
                  <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
                ) : (
                  <div><FiClock className="w-8 h-8 mx-auto mb-1" /><span className="text-sm">BATER PONTO</span></div>
                )}
              </button>
            </>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Registros de Hoje</h2>
          {todayEntries.length === 0 ? (
            <p className="text-gray-400 text-center py-4">Nenhum registro ainda.</p>
          ) : (
            <div className="space-y-3">
              {todayEntries.map((entry, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${typeColors[entry.type]}`}>{entry.typeLabel}</span>
                  <span className="text-lg font-mono font-bold text-gray-700">{entry.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
