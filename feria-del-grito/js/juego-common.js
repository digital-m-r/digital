// Configuración general del juego, compartida entre jugador.js y host.js

export const META_CASILLAS = 60;      // con 11 jugadores reales esto da partidas de ~24-33 rondas (ver cálculo)

export const COLORES = ["rojo", "azul", "amarillo", "verde"];
export const FORMAS = { rojo: "▲", azul: "◆", amarillo: "●", verde: "■" };

export const AVATARES = {
  charro:  { nombre: "Charro",         img: "images/caballo-charro.png", cara: { xPct: 54.26, yPct: 16.41, rPct: 6.2 } },
  china:   { nombre: "China Poblana",  img: "images/caballo-china.png",  cara: { xPct: 55.06, yPct: 22.52, rPct: 6.5 } }
};

// Límites (en % del campo) dentro de los cuales rebotan los 5 blancos del
// Tiro al Blanco — ahora se mueven solos por todo el campo, no están fijos.
export const LIMITES_CAMPO_TIRO = { xMin: 11, xMax: 89, yMin: 13, yMax: 60 };

// Genera un código corto de partida, fácil de leer/decir en voz alta
export function generarCodigoPartida() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin O/I para evitar confusión
  let codigo = "";
  for (let i = 0; i < 4; i++) codigo += letras[Math.floor(Math.random() * letras.length)];
  return codigo;
}

// Baraja un arreglo (Fisher-Yates) - usado para el orden de las preguntas
export function barajar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function cargarBancoPreguntas() {
  const res = await fetch("data/preguntas.json");
  const data = await res.json();
  return data.preguntas; // [{id, categoria, dificultad, pregunta, opciones[4], correcta}]
}

// Redimensiona una foto (dataURL o canvas) a un cuadrado pequeño para no inflar Firestore
export function recortarFotoACuadro(video, ladoPx = 240) {
  const canvas = document.createElement("canvas");
  canvas.width = ladoPx;
  canvas.height = ladoPx;
  const ctx = canvas.getContext("2d");
  const vw = video.videoWidth, vh = video.videoHeight;
  const lado = Math.min(vw, vh);
  const sx = (vw - lado) / 2, sy = (vh - lado) / 2;
  // Espejo horizontal para que se vea como el preview (selfie)
  ctx.translate(ladoPx, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, lado, lado, 0, 0, ladoPx, ladoPx);
  return canvas.toDataURL("image/jpeg", 0.82);
}
