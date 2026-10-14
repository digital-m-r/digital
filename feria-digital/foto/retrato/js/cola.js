// ============================================================
//  COLA: conecta la estación de captura con la pantalla grande
//  - Con Firebase: Firestore (y habilita el QR de descarga)
//  - Sin Firebase: BroadcastChannel (mismo navegador, sin QR)
// ============================================================
import { firebaseConfig, CONFIG } from "./config.js";

const V = "10.12.2";
let modo = "sin-iniciar";
let db = null, fs = null, canal = null, arranque = null;
const memoria = new Map();

export const modoActual = () => modo;

export function iniciar() {
  if (!arranque) arranque = _iniciar();
  return arranque;
}

async function _iniciar() {
  const configurado = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("TU_");
  if (configurado) {
    try {
      const app = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
      fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
      const nombre = "retrato-dibujado";
      const a = app.getApps().find((x) => x.name === nombre) || app.initializeApp(firebaseConfig, nombre);
      db = fs.getFirestore(a);
      modo = "firebase";
      return modo;
    } catch (e) {
      console.warn("Firebase no disponible, usando modo local", e);
    }
  }
  canal = new BroadcastChannel("retrato-dibujado");
  modo = "local";
  return modo;
}

export async function enviar(retrato, nombre = "") {
  await iniciar();
  const doc = {
    nombre: nombre.trim().slice(0, 24),
    ancho: retrato.ancho,
    alto: retrato.alto,
    trazos: retrato.trazos,
    grosores: retrato.grosores || null,
    conMascara: !!retrato.conMascara,
    estado: "pendiente",
    creadoLocal: Date.now()
  };

  if (modo === "firebase") {
    const col = fs.collection(db, CONFIG.COLECCION);
    const ref = await fs.addDoc(col, {
      ...doc,
      creado: fs.serverTimestamp(),
      expira: fs.Timestamp.fromMillis(Date.now() + CONFIG.DIAS_CONSERVAR * 864e5)
    });
    let lugar = null;
    try {
      const pend = await fs.getDocs(fs.query(col, fs.where("estado", "==", "pendiente")));
      lugar = pend.size;
    } catch {}
    return { id: ref.id, lugar };
  }

  const id = "local-" + Date.now();
  canal.postMessage({ tipo: "nuevo", id, ...doc });
  return { id, lugar: null };
}

// cb(lista) recibe los pendientes ordenados por llegada
export async function escucharPendientes(cb) {
  await iniciar();
  if (modo === "firebase") {
    const q = fs.query(fs.collection(db, CONFIG.COLECCION), fs.where("estado", "==", "pendiente"));
    return fs.onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.creadoLocal - b.creadoLocal)),
      (err) => console.error("Error escuchando la cola", err)
    );
  }
  const emitir = () =>
    cb([...memoria.values()].filter((x) => x.estado === "pendiente").sort((a, b) => a.creadoLocal - b.creadoLocal));
  canal.onmessage = (e) => {
    if (e.data?.tipo === "nuevo") { memoria.set(e.data.id, e.data); emitir(); }
  };
  emitir();
  return () => (canal.onmessage = null);
}

export async function marcar(id, estado) {
  await iniciar();
  if (modo === "firebase") {
    try {
      await fs.updateDoc(fs.doc(db, CONFIG.COLECCION, id), { estado, actualizado: fs.serverTimestamp() });
    } catch (e) { console.warn("No se pudo actualizar estado", e); }
    return;
  }
  const x = memoria.get(id);
  if (x) x.estado = estado;
}

export async function obtener(id) {
  await iniciar();
  if (modo !== "firebase" || !id) return null;
  const s = await fs.getDoc(fs.doc(db, CONFIG.COLECCION, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export function urlDescarga(id) {
  const base = CONFIG.URL_DESCARGA || new URL("descarga.html", location.href).href;
  return `${base}?id=${encodeURIComponent(id)}`;
}
