import { useState, useRef, useCallback } from 'react';
import { FiCamera, FiX, FiRefreshCw } from 'react-icons/fi';

export default function SelfieCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [captured, setCaptured] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const streamRef = useRef(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStreaming(true);
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    // Mirror voor front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    // Compress to <200KB
    let quality = 0.7;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 200_000 && quality > 0.1) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    setCaptured(dataUrl);
    stopCamera();
  }, [facingMode, stopCamera]);

  const retake = useCallback(() => {
    setCaptured(null);
    startCamera();
  }, [startCamera]);

  const confirm = useCallback(() => {
    onCapture(captured);
  }, [captured, onCapture]);

  const flipCamera = useCallback(() => {
    stopCamera();
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setTimeout(() => startCamera(), 200);
  }, [stopCamera, startCamera]);

  // Auto-start camera on mount
  useState(() => { startCamera(); }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-gray-800">Tire sua Selfie</h3>
          <button onClick={() => { stopCamera(); onCancel(); }} className="text-gray-400 hover:text-red-500"><FiX className="w-5 h-5" /></button>
        </div>

        <div className="relative bg-black aspect-[4/3]">
          {!captured ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted
                className="w-full h-full object-cover"
                style={facingMode === 'user' ? { transform: 'scaleX(-1)' } : {}} />
              {!streaming && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
                </div>
              )}
            </>
          ) : (
            <img src={captured} alt="Selfie" className="w-full h-full object-cover" />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex items-center justify-center gap-4 p-4">
          {!captured ? (
            <>
              <button onClick={flipCamera}
                className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition">
                <FiRefreshCw className="w-5 h-5" />
              </button>
              <button onClick={takePhoto}
                className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-700 transition shadow-lg">
                <FiCamera className="w-7 h-7 text-white" />
              </button>
            </>
          ) : (
            <>
              <button onClick={retake}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition">
                Tirar Outra
              </button>
              <button onClick={confirm}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">
                Confirmar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
