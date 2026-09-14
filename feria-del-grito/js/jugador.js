import {
  db, doc, getDoc, setDoc, updateDoc, onSnapshot,
  collection, addDoc
} from "./firebase-config.js";
import { AVATARES, LIMITES_CAMPO_TIRO, recortarFotoACuadro } from "./juego-common.js";

const $ = (id) => document.getElementById(id);
const mostrar = (id) => { document.querySelectorAll(".pantalla").forEach(s => s.style.display = "none"); $(id).style.display = "flex"; };

let codigoPartida = null;
let miId = null;
let miNombre = "";
let miAvatar = "charro";
let miFotoDataUrl = null;
let streamCamara = null;
let ultimoEstadoRenderizado = null;
let yaEnviadoEstaVuelta = false; // evita doble-tap en preguntas
let miJugadorCache = null;
let ultimaPartidaCache = null;

// ---------- Paso 0: entrar con código ----------
$("btn-unirse").addEventListener("click", async () => {
  const codigo = $("input-codigo").value.trim().toUpperCase();
  if (codigo.length < 4) return;
  const snap = await getDoc(doc(db, "partidas", codigo));
  if (!snap.exists()) {
    $("error-codigo").style.display = "block";
    return;
  }
  codigoPartida = codigo;
  mostrar("pantalla-registro");
});

// ---------- Paso 1: registro ----------
document.querySelectorAll(".opcion-avatar").forEach(el => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".opcion-avatar").forEach(o => o.classList.remove("seleccionado"));
    el.classList.add("seleccionado");
    miAvatar = el.dataset.avatar;
    revisarHabilitarSiguiente();
  });
});
$("input-nombre").addEventListener("input", revisarHabilitarSiguiente);
function revisarHabilitarSiguiente() {
  miNombre = $("input-nombre").value.trim();
  $("btn-a-camara").disabled = !(miNombre.length >= 2 && miAvatar);
}

$("btn-a-camara").addEventListener("click", async () => {
  mostrar("pantalla-camara");
  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    $("video-camara").srcObject = streamCamara;
  } catch (e) {
    $("error-camara").style.display = "block";
  }
});

// ---------- Paso 2: selfie ----------
$("btn-tomar-foto").addEventListener("click", () => {
  const video = $("video-camara");
  miFotoDataUrl = recortarFotoACuadro(video, 240);
  $("preview-foto").src = miFotoDataUrl;
  $("preview-foto").style.display = "block";
  video.style.display = "none";
  $("btn-tomar-foto").style.display = "none";
  $("btn-repetir-foto").style.display = "block";
  $("btn-confirmar-foto").style.display = "block";
});

$("btn-repetir-foto").addEventListener("click", () => {
  $("preview-foto").style.display = "none";
  $("video-camara").style.display = "block";
  $("btn-tomar-foto").style.display = "block";
  $("btn-repetir-foto").style.display = "none";
  $("btn-confirmar-foto").style.display = "none";
});

$("btn-confirmar-foto").addEventListener("click", async () => {
  if (streamCamara) streamCamara.getTracks().forEach(t => t.stop());
  const ref = await addDoc(collection(db, "partidas", codigoPartida, "jugadores"), {
    nombre: miNombre,
    avatar: miAvatar,
    foto: miFotoDataUrl,
    posicion: 0,
    bolaValor: null,
    listo: false,
    creadoEn: Date.now()
  });
  miId = ref.id;
  localStorage.setItem("feriaDelGrito_miId_" + codigoPartida, miId);
  $("nombre-espera").textContent = miNombre;
  mostrar("pantalla-espera");
  escucharMiJugador();
  escucharPartida();
});

function escucharMiJugador() {
  onSnapshot(doc(db, "partidas", codigoPartida, "jugadores", miId), (snapJ) => {
    miJugadorCache = snapJ.data();
    if (ultimaPartidaCache && ultimaPartidaCache.estado === "lanzando") {
      renderSegunEstado(ultimaPartidaCache);
    }
  });
}

// ---------- Escuchar el estado de la partida ----------
function escucharPartida() {
  onSnapshot(doc(db, "partidas", codigoPartida), (snap) => {
    const partida = snap.data();
    if (!partida) return;
    renderSegunEstado(partida);
  });
}

function renderSegunEstado(partida) {
  ultimaPartidaCache = partida;
  if (partida.estado === "lobby") { return; } // sigue en espera

  mostrar("pantalla-juego");

  const esNuevoEstado = partida.estado !== ultimoEstadoRenderizado;
  if (esNuevoEstado) {
    yaEnviadoEstaVuelta = false;
    ultimoEstadoRenderizado = partida.estado;
  }

  ocultarTodosLosBloques();

  if (partida.estado === "lanzando") {
    const j = miJugadorCache;
    if (j && j.listo) {
      $("bloque-espera-ronda").style.display = "block";
      $("texto-espera-ronda").textContent = `¡Ya lanzaste! Sacaste el ${j.bolaValor}. Esperando a los demás...`;
    } else {
      $("bloque-skeeball").style.display = "flex";
      if (esNuevoEstado) reiniciarBola();
      inicializarSkeeball(partida);
    }
    return;
  }

  if (partida.estado === "pregunta") {
    const j = miJugadorCache;
    if (j && j.respondido) {
      $("bloque-espera-ronda").style.display = "block";
      $("texto-espera-ronda").textContent = "¡Ya respondiste! Esperando a los demás jugadores...";
    } else {
      $("bloque-pregunta").style.display = "flex";
      activarColores("colores-pregunta", partida);
    }
    return;
  }

  if (partida.estado === "revelando") {
    $("bloque-espera-ronda").style.display = "block";
    $("texto-espera-ronda").textContent = "Mira la pantalla para ver quién acertó 👀";
    return;
  }

  if (partida.estado === "terminado") {
    $("bloque-fin").style.display = "block";
    return;
  }
}

function ocultarTodosLosBloques() {
  ["bloque-skeeball", "bloque-espera-ronda", "bloque-pregunta", "bloque-fin"]
    .forEach(id => { $(id).style.display = "none"; });
}

// ---------- Tiro al Blanco: 5 blancos que flotan y rebotan solos ----------
let tiroListo = false;
let animacionBlancosId = null;
let estadosBlancos = {}; // numero -> {x, y, vx, vy, resuelto}
let ultimoTiempoFrame = null;

function inicializarSkeeball(partida) {
  if (tiroListo) return; // solo engancha los listeners una vez
  tiroListo = true;

  document.querySelectorAll(".blanco").forEach((el) => {
    const numero = parseInt(el.dataset.numero);
    el.addEventListener("click", () => manejarToqueBlanco(numero));
  });
}

// Crea una velocidad aleatoria (en %/segundo) dentro de un rango parejo
function velocidadAleatoria() {
  const signo = Math.random() < 0.5 ? -1 : 1;
  return signo * (14 + Math.random() * 12);
}

// Prepara los 5 blancos en posiciones y velocidades nuevas, y arranca el
// ciclo de animación que los hace rebotar solos por todo el campo.
function reiniciarBola() {
  const bala = $("bola-lanzable");
  if (bala) {
    bala.classList.remove("volando");
    bala.style.transition = "none";
    bala.style.left = "50%";
    bala.style.top = "88%";
  }

  const { xMin, xMax, yMin, yMax } = LIMITES_CAMPO_TIRO;
  estadosBlancos = {};
  for (let n = 1; n <= 5; n++) {
    estadosBlancos[n] = {
      x: xMin + Math.random() * (xMax - xMin),
      y: yMin + Math.random() * (yMax - yMin),
      vx: velocidadAleatoria(),
      vy: velocidadAleatoria(),
      resuelto: false
    };
    const el = document.querySelector(`.blanco[data-numero="${n}"]`);
    if (el) {
      el.classList.remove("impactado", "rechazado", "resuelto");
      el.style.left = `${estadosBlancos[n].x}%`;
      el.style.top = `${estadosBlancos[n].y}%`;
    }
  }

  if (animacionBlancosId) cancelAnimationFrame(animacionBlancosId);
  ultimoTiempoFrame = null;
  animacionBlancosId = requestAnimationFrame(animarBlancosFlotando);
}

function animarBlancosFlotando(t) {
  if (ultimoTiempoFrame == null) ultimoTiempoFrame = t;
  const dt = Math.min((t - ultimoTiempoFrame) / 1000, 0.05); // segundos, con tope por si hay lag
  ultimoTiempoFrame = t;
  const { xMin, xMax, yMin, yMax } = LIMITES_CAMPO_TIRO;

  for (let n = 1; n <= 5; n++) {
    const s = estadosBlancos[n];
    if (!s || s.resuelto) continue;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.x <= xMin || s.x >= xMax) { s.vx *= -1; s.x = Math.max(xMin, Math.min(xMax, s.x)); }
    if (s.y <= yMin || s.y >= yMax) { s.vy *= -1; s.y = Math.max(yMin, Math.min(yMax, s.y)); }
    const el = document.querySelector(`.blanco[data-numero="${n}"]`);
    if (el) { el.style.left = `${s.x}%`; el.style.top = `${s.y}%`; }
  }
  animacionBlancosId = requestAnimationFrame(animarBlancosFlotando);
}

async function manejarToqueBlanco(numero) {
  const s = estadosBlancos[numero];
  if (!s || s.resuelto) return;
  s.resuelto = true; // se congela mientras se resuelve el disparo, no sigue rebotando

  const bala = $("bola-lanzable");
  const rifle = document.querySelector(".rifle-icono");
  rifle?.classList.add("retroceso");
  setTimeout(() => rifle?.classList.remove("retroceso"), 140);

  // 8% de probabilidad de que el disparo salga desviado por completo
  if (Math.random() < 0.08) {
    await animarBalaAlAire(bala, s.x);
    $("texto-swipe").textContent = "¡Fallaste el tiro! La bala se fue de largo, intenta de nuevo 🎯";
    s.resuelto = false; // se puede volver a intentar, sigue flotando
    return;
  }

  try {
    // Cada jugador dispara de forma independiente — no hay "blancos ocupados"
    // entre jugadores, así que con 11 jugadores y 5 blancos nadie se queda sin
    // número al que dispararle.
    await animarImpacto(bala, numero, s.x, s.y);

    if (animacionBlancosId) cancelAnimationFrame(animacionBlancosId);

    await updateDoc(doc(db, "partidas", codigoPartida, "jugadores", miId), {
      bolaValor: numero, listo: true
    });
  } catch (e) {
    $("texto-swipe").textContent = "Algo falló, intenta disparar de nuevo.";
    s.resuelto = false;
  }
}

// Mueve la bala con una pequeña animación de tween (JS puro).
function moverBalaA(bala, xPct, yPct, duracionMs) {
  return new Promise((resolve) => {
    const inicioX = parseFloat(bala.style.left) || 50;
    const inicioY = parseFloat(bala.style.top) || 88;
    bala.style.transition = "none";
    bala.classList.add("volando");
    const t0 = performance.now();
    function cuadro(t) {
      const p = Math.min(1, (t - t0) / duracionMs);
      const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic, más "disparo" que rebote
      bala.style.left = `${inicioX + (xPct - inicioX) * ease}%`;
      bala.style.top = `${inicioY + (yPct - inicioY) * ease}%`;
      if (p < 1) requestAnimationFrame(cuadro);
      else resolve();
    }
    requestAnimationFrame(cuadro);
  });
}

// La bala le da justo al blanco (en la posición donde estaba al tocarlo):
// impacto con tambaleo, y el blanco queda marcado como resuelto.
async function animarImpacto(bala, numero, x, y) {
  await moverBalaA(bala, x, y, 160);
  bala.classList.remove("volando");
  const el = document.querySelector(`.blanco[data-numero="${numero}"]`);
  el?.classList.add("impactado");
  setTimeout(() => el?.classList.add("resuelto"), 500);
}

// Tiro totalmente errado: la bala se va de largo hacia arriba y desaparece.
async function animarBalaAlAire(bala, xAprox) {
  await moverBalaA(bala, xAprox, -10, 220);
  bala.classList.remove("volando");
  bala.style.left = "50%";
  bala.style.top = "88%";
}

// ---------- Preguntas: colores tipo Kahoot (todos responden a su ritmo) ----------
function activarColores(contenedorId, partida) {
  const cont = $(contenedorId);
  cont.querySelectorAll(".color-btn").forEach(btn => {
    btn.classList.remove("deshabilitado");
    btn.onclick = () => manejarRespuesta(parseInt(btn.dataset.color), partida);
  });
}

async function manejarRespuesta(colorIdx, partida) {
  if (yaEnviadoEstaVuelta) return;
  yaEnviadoEstaVuelta = true;

  const esCorrecta = colorIdx === partida.preguntaActual.correcta;
  await updateDoc(doc(db, "partidas", codigoPartida, "jugadores", miId), {
    respuestaColor: colorIdx,
    respondido: true,
    correcto: esCorrecta
  });
}
