/**
 * useOfflineQueue — gerencia a fila de registros de ponto feitos offline
 * usando IndexedDB via biblioteca `idb`.
 *
 * Fluxo:
 *   1. Usuário bate ponto sem internet → enfileira no IndexedDB
 *   2. Ao voltar online → tenta sincronizar automaticamente via `syncQueue()`
 *   3. Exibe banner com contador de pendentes
 */
import { useState, useEffect, useCallback } from 'react';
import { openDB } from 'idb';

const DB_NAME = 'ponto-digital-db';
const DB_VERSION = 1;
const STORE_NAME = 'offline-punches';

/** Abre (ou cria) o banco IndexedDB */
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('status', 'status');
      }
    },
  });
}

/** Adiciona um punch pendente na fila */
export async function enqueueOfflinePunch(punchData) {
  const db = await getDB();
  const id = await db.add(STORE_NAME, {
    ...punchData,
    status: 'pending',
    queuedAt: new Date().toISOString(),
  });
  return id;
}

/** Retorna todos os punches pendentes */
export async function getPendingPunches() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter(p => p.status === 'pending');
}

/** Marca um punch como enviado */
async function markSynced(id) {
  const db = await getDB();
  const item = await db.get(STORE_NAME, id);
  if (item) {
    await db.put(STORE_NAME, { ...item, status: 'synced', syncedAt: new Date().toISOString() });
  }
}

/** Marca um punch como com erro (para não ficar em loop) */
async function markFailed(id, error) {
  const db = await getDB();
  const item = await db.get(STORE_NAME, id);
  if (item) {
    await db.put(STORE_NAME, { ...item, status: 'failed', error, failedAt: new Date().toISOString() });
  }
}

/**
 * Hook principal.
 * @param {Function} apiPunch - função que faz o POST para a API (recebe punchData)
 */
export default function useOfflineQueue(apiPunch) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Atualiza contador de pendentes
  const refreshCount = useCallback(async () => {
    try {
      const pending = await getPendingPunches();
      setPendingCount(pending.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  // Sincroniza todos os pendentes com a API
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    const pending = await getPendingPunches();
    if (pending.length === 0) return;

    setIsSyncing(true);
    let syncedAny = false;

    for (const punch of pending) {
      try {
        await apiPunch({
          latitude: punch.latitude,
          longitude: punch.longitude,
          deviceInfo: punch.deviceInfo,
          photo: punch.photo,
          offlineQueuedAt: punch.queuedAt,
        });
        await markSynced(punch.id);
        syncedAny = true;
      } catch (err) {
        // Se for erro de autenticação ou erro de negócio (4xx), marca como failed
        // Se for erro de rede, deixa pending para tentar depois
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500) {
          await markFailed(punch.id, err?.response?.data?.error || 'Erro na sincronização');
        }
        // Erro 5xx ou rede: manter pending, parar loop
        break;
      }
    }

    setIsSyncing(false);
    await refreshCount();
    return syncedAny;
  }, [apiPunch, isSyncing, refreshCount]);

  // Monitora online/offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verifica pendentes ao montar
    refreshCount();

    // Tenta sincronizar se já estiver online
    if (navigator.onLine) {
      syncQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncQueue, refreshCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncQueue,
    refreshCount,
  };
}
