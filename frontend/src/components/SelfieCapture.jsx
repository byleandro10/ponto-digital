import { useState, useRef, useCallback, useEffect } from 'react';
import { FiCamera, FiX, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';

export default function SelfieCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [streaming, setStreaming] = useState(false);
  const [captured, setCaptured] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [cameraError, setCameraError] = useState(null);

  // Para câmera usando o facingMode atual via ref para evitar stale closure
  const facingModeRef = useRef(facingMode);
  useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  const startCamera = useCallback(async (mode) => {
    setCameraError(null);
    setStreaming(false);
    const targetMode = mode ?? facingModeRef.current;

    // Para stream anterior antes de iniciar novo
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Câmera não suportada neste navegador.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Permissão para câmera negada. Permita o acesso à câmera nas configurações do navegador.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('Nenhuma câmera encontrada neste dispositivo.');
      } else if (err.name === 'NotReadableError') {
        setCameraError('A câmera está sendo usada por outro aplicativo. Feche e tente novamente.');
      } else {
        setCameraError(err.message || 'Não foi possível acessar a câmera.');
      }
    }
  }, []);

  // Auto-inicia câmera ao montar o componente
  useEffect(() => {
    startCamera('user');
    return () => stopCamera(); // limpa stream ao desmontar
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    // Espelha imagem para câmera frontal (efeito natural)
    if (facingModeRef.current === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    // Comprime para < 200KB
    let quality = 0.75;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 200_000 && quality > 0.1) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    setCaptured(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const retake = useCallback(() => {
    setCaptured(null);
    startCamera(facingModeRef.current);
  }, [startCamera]);

  const confirm = useCallback(() => {
    if (captured) onCapture(captured);
  }, [captured, onCapture]);

  const flipCamera = useCallback(() => {
    const next = facingModeRef.current === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    facingModeRef.current = next;
    startCamera(next);
  }, [startCamera]);

  const handleCancel = useCallback(() => {
    stopCamera();
    onCancel();
  }, [stopCamera, onCancel]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <FiCamera className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-gray-800">Selfie para Ponto</h3>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-red-500 transition"
            title="Cancelar"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Área da câmera */}
        <div className="relative bg-black aspect-[4/3]">
          {cameraError ? (
            /* Tela de erro de câmera */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <FiAlertTriangle className="w-12 h-12 text-yellow-400" />
              <p className="text-white text-sm leading-relaxed">{cameraError}</p>
              <button
                onClick={() => startCamera(facingModeRef.current)}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Tentar novamente
              </button>
            </div>
          ) : !captured ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : {}}
              />
              {/* Overlay de carregamento */}
              {!streaming && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                  <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full" />
                  <p className="text-white text-sm">Iniciando câmera...</p>
                </div>
              )}
              {/* Guia de posição */}
              {streaming && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-36 h-36 rounded-full border-4 border-white/60 border-dashed" />
                </div>
              )}
            </>
          ) : (
            <img src={captured} alt="Selfie capturada" className="w-full h-full object-cover" />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Instrução */}
        {!cameraError && (
          <p className="text-center text-xs text-gray-500 pt-3 px-4">
            {!captured
              ? 'Centralize seu rosto no círculo e clique para fotografar'
              : 'Confira a foto antes de confirmar'}
          </p>
        )}

        {/* Botões de ação */}
        <div className="flex items-center justify-center gap-4 p-4">
          {!captured && !cameraError ? (
            <>
              {/* Virar câmera */}
              <button
                onClick={flipCamera}
                disabled={!streaming}
                className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition disabled:opacity-40"
                title="Virar câmera"
              >
                <FiRefreshCw className="w-5 h-5 text-gray-600" />
              </button>

              {/* Tirar foto */}
              <button
                onClick={takePhoto}
                disabled={!streaming}
                className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-700 active:scale-95 transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                title="Tirar foto"
              >
                <FiCamera className="w-8 h-8 text-white" />
              </button>

              {/* Cancelar */}
              <button
                onClick={handleCancel}
                className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center hover:bg-red-100 transition"
                title="Cancelar"
              >
                <FiX className="w-5 h-5 text-gray-500" />
              </button>
            </>
          ) : captured ? (
            <>
              <button
                onClick={retake}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
              >
                Tirar Outra
              </button>
              <button
                onClick={confirm}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow"
              >
                ✓ Confirmar
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
