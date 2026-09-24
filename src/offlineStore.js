const DB_NAME = "rutaflow-offline";
const DB_VERSION = 1;

let opening;

function database() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("El almacenamiento sin conexión no está disponible en este dispositivo."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local."));
    request.onblocked = () => reject(new Error("Cierra las otras pestañas de RutaFlow e inténtalo otra vez."));
  }).catch(error => {
    opening = null;
    throw error;
  });
  return opening;
}

async function write(storeName, item, operation = "put") {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName)[operation](item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("No se pudieron guardar los datos locales."));
    transaction.onabort = () => reject(transaction.error || new Error("El almacenamiento local canceló el guardado."));
  });
}

async function all(storeName) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("No se pudieron leer los datos locales."));
  });
}

export const enqueue = item => write("outbox", item);
export const acknowledge = id => write("outbox", id, "delete");
export const pendingFor = async userId => (await all("outbox")).filter(item => item.user_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at));

export const saveSnapshot = (userId, kind, rows) => write("snapshots", {
  key: `${userId}:${kind}`,
  user_id: userId,
  kind,
  rows,
  saved_at: new Date().toISOString(),
});

export const readSnapshot = async (userId, kind) => {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("snapshots", "readonly").objectStore("snapshots").get(`${userId}:${kind}`);
    request.onsuccess = () => resolve(request.result?.rows || []);
    request.onerror = () => reject(request.error || new Error("No se pudo leer el historial local."));
  });
};
