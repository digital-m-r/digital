// ============================================================
//  CONFIGURACIÓN DEL MODO "RETRATO DIBUJADO"
//  Es el único archivo que necesitas editar.
// ============================================================

// 1) Copia aquí el MISMO firebaseConfig que ya usa tu photo booth.
//    Mientras diga "TU_API_KEY", el sistema funciona en modo local
//    (captura y pantalla en el mismo navegador, sin QR de descarga).
export const firebaseConfig = {
  apiKey: "AIzaSyDUHTkX6Q9S-h4f36uc-LC2KHhufdanmKY",
  authDomain: "reto-digital-bmm.firebaseapp.com",
  projectId: "reto-digital-bmm",
  storageBucket: "reto-digital-bmm.firebasestorage.app",
  messagingSenderId: "834560588344",
  appId: "1:834560588344:web:c06729830291d6c20d44cd"
};

// 2) GEMINI: pega aquí la URL de tu Apps Script (ver CONFIGURAR-GEMINI.md).
//    Mientras esté vacía, se usa el estilo clásico (sin IA).
export const GEMINI = {
  URL_APPS_SCRIPT: "https://script.google.com/macros/s/AKfycbwe3AvNYdLxGL9HhVBSXrf5UeBPZmAZ9zpipy5aZSJPnbbOwwqPNQxwEhnJ4BW2zLt5/exec",
  CLAVE: "foro-bmm-2026",   // debe ser igual a CLAVE_COMPARTIDA en el Apps Script
  SEGUNDOS_ESPERA: 60        // si la IA tarda más, se usa el estilo clásico
};

export const CONFIG = {
  // Página del photo booth actual (ruta relativa a Foto/inicio.html)
  PAGINA_FOTO_MARCO: "index.html",

  // Colección nueva en Firestore (no toca las colecciones del photo booth)
  COLECCION: "retratos",

  EVENTO_TITULO: "Foro Digital & Innovación BMM 2026",
  EVENTO_FECHA: "13 de noviembre de 2026",

  // Días que se conserva cada retrato (requiere política TTL en Firestore, ver LEEME)
  DIAS_CONSERVAR: 30,

  // Vacío = se calcula solo. Si la pantalla grande corre en localhost,
  // pon aquí la URL pública, ej: "https://tu-sitio.web.app/Foto/retrato/descarga.html"
  URL_DESCARGA: "",

  // Marco PNG opcional diseñado en Canva (1080 x 1350, centro transparente).
  // Si no existe el archivo, se usa el marco dibujado por código.
  MARCO_RETRATO_PNG: new URL("../img/marco-retrato.png", import.meta.url).href,

  // Parámetros del dibujo (afínalos con laboratorio.html)
  RETRATO: {
    resolucion: 480,        // tamaño de trabajo en px
    detalle: 0.22,          // 0.08 = pocas líneas · 0.40 = muchas líneas
    pasadasDesenfoque: 2,   // más = menos ruido de piel
    minLargo: 10,           // trazos más cortos que esto se descartan
    simplificacion: 1.0,    // más = trazos más simples y livianos
    sombras: true,          // achurado en zonas oscuras (cabello, ojos)
    umbralSombra: 0.16,     // % más oscuro que se sombrea
    espacioSombra: 6,       // separación entre líneas de sombra
    sombraCruzada: true     // segunda capa de achurado en lo más oscuro
  },

  // Parámetros del modo IA (dibujo lineal de Gemini)
  LINEAL: { resolucion: 800, umbral: 150, minLargo: 5, simplificacion: 0.7, rellenoMin: 5 },

  ANIMACION: {
    minSegundos: 25,
    maxSegundos: 50,
    pxPorSegundo: 900,
    color: "#0B2A6F",
    grosor: 1.6
  },

  PANTALLA: { segundosQR: 20 },
  CAPTURA: { segundosReinicio: 12, cuentaRegresiva: 3 }
};
