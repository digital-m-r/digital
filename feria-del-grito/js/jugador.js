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
  $("btn-tomar-foto").disabled = true; // se habilita solo cuando la cámara ya tiene imagen real
  try {
    streamCamara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    const video = $("video-camara");
    video.srcObject = streamCamara;
    // Espera a que el video tenga dimensiones reales antes de dejar tomar la foto
    // (si se toma antes de tiempo, sale una imagen en blanco sin avisar del error).
    const habilitarCuandoListo = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        $("btn-tomar-foto").disabled = false;
      } else {
        requestAnimationFrame(habilitarCuandoListo);
      }
    };
    habilitarCuandoListo();
  } catch (e) {
    $("error-camara").style.display = "block";
  }
});

// ---------- Paso 2: selfie ----------
$("btn-tomar-foto").addEventListener("click", () => {
  const video = $("video-camara");
  const foto = recortarFotoACuadro(video, 240);
  if (!foto) {
    // Salvavidas extra por si el botón se alcanzó a presionar antes de tiempo
    return;
  }
  miFotoDataUrl = foto;
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
  activarRefrescoAlVolver();
});

// En iOS/Safari, cuando el celular se bloquea o el usuario cambia de app,
// la conexión en tiempo real con Firestore se pausa. Al volver a la pestaña,
// en vez de esperar a que se reconecte sola (puede tardar unos segundos),
// forzamos una lectura fresca de inmediato para ponerse al día al instante.
function activarRefrescoAlVolver() {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !codigoPartida || !miId) return;
    try {
      const [snapPartida, snapJugador] = await Promise.all([
        getDoc(doc(db, "partidas", codigoPartida)),
        getDoc(doc(db, "partidas", codigoPartida, "jugadores", miId))
      ]);
      if (snapJugador.exists()) miJugadorCache = snapJugador.data();
      if (snapPartida.exists()) renderSegunEstado(snapPartida.data());
    } catch (e) { /* si falla, el listener normal se pondrá al día de todas formas */ }
  });
}

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
let cambioNumerosId = null;
let estadosBlancos = {}; // slot(1-5) -> {x, y, vx, vy, resuelto, valor}
let ultimoTiempoFrame = null;

function inicializarSkeeball(partida) {
  if (tiroListo) return; // solo engancha los listeners una vez
  tiroListo = true;

  document.querySelectorAll(".blanco").forEach((el) => {
    const slot = parseInt(el.dataset.slot);
    // Lee el número en el momento exacto del toque (no uno capturado antes),
    // porque el número mostrado cambia solo con el tiempo.
    el.addEventListener("click", () => manejarToqueBlanco(slot));
  });
}

// Crea una velocidad aleatoria (en %/segundo) dentro de un rango parejo
function velocidadAleatoria() {
  const signo = Math.random() < 0.5 ? -1 : 1;
  return signo * (14 + Math.random() * 12);
}

// Prepara los 5 blancos en posiciones, velocidades y números nuevos, y
// arranca tanto el rebote como el cambio aleatorio de números.
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
  for (let slot = 1; slot <= 5; slot++) {
    estadosBlancos[slot] = {
      x: xMin + Math.random() * (xMax - xMin),
      y: yMin + Math.random() * (yMax - yMin),
      vx: velocidadAleatoria(),
      vy: velocidadAleatoria(),
      resuelto: false,
      valor: 1 + Math.floor(Math.random() * 5)
    };
    const el = document.querySelector(`.blanco[data-slot="${slot}"]`);
    if (el) {
      el.classList.remove("impactado", "resuelto");
      el.style.left = `${estadosBlancos[slot].x}%`;
      el.style.top = `${estadosBlancos[slot].y}%`;
      el.textContent = estadosBlancos[slot].valor;
      el.dataset.numero = estadosBlancos[slot].valor;
    }
  }

  $("texto-swipe").textContent = "Toca el número al que le quieres disparar antes de que se te escape 🎯";

  if (animacionBlancosId) cancelAnimationFrame(animacionBlancosId);
  ultimoTiempoFrame = null;
  animacionBlancosId = requestAnimationFrame(animarBlancosFlotando);

  if (cambioNumerosId) clearInterval(cambioNumerosId);
  cambioNumerosId = setInterval(cambiarNumerosAlAzar, 700);
}

// Cada cierto tiempo, cada blanco que siga activo cambia a un número nuevo
// al azar (1-5) — así no basta con perseguir el blanco, también hay que
// fijarse qué número tiene EN ESE INSTANTE antes de disparar.
function cambiarNumerosAlAzar() {
  for (let slot = 1; slot <= 5; slot++) {
    const s = estadosBlancos[slot];
    if (!s || s.resuelto) continue;
    s.valor = 1 + Math.floor(Math.random() * 5);
    const el = document.querySelector(`.blanco[data-slot="${slot}"]`);
    if (el) {
      el.textContent = s.valor;
      el.dataset.numero = s.valor;
      el.classList.add("numero-cambia");
      setTimeout(() => el.classList.remove("numero-cambia"), 220);
    }
  }
}

function animarBlancosFlotando(t) {
  if (ultimoTiempoFrame == null) ultimoTiempoFrame = t;
  const dt = Math.min((t - ultimoTiempoFrame) / 1000, 0.05); // segundos, con tope por si hay lag
  ultimoTiempoFrame = t;
  const { xMin, xMax, yMin, yMax } = LIMITES_CAMPO_TIRO;

  for (let slot = 1; slot <= 5; slot++) {
    const s = estadosBlancos[slot];
    if (!s || s.resuelto) continue;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.x <= xMin || s.x >= xMax) { s.vx *= -1; s.x = Math.max(xMin, Math.min(xMax, s.x)); }
    if (s.y <= yMin || s.y >= yMax) { s.vy *= -1; s.y = Math.max(yMin, Math.min(yMax, s.y)); }
    const el = document.querySelector(`.blanco[data-slot="${slot}"]`);
    if (el) { el.style.left = `${s.x}%`; el.style.top = `${s.y}%`; }
  }
  animacionBlancosId = requestAnimationFrame(animarBlancosFlotando);
}

async function manejarToqueBlanco(slot) {
  const s = estadosBlancos[slot];
  if (!s || s.resuelto) return;
  s.resuelto = true; // se congela mientras se resuelve el disparo: ya no rebota ni cambia de número
  const valorElegido = s.valor; // el número que tenía justo en el instante del toque

  const bala = $("bola-lanzable");
  const rifle = document.querySelector(".rifle-icono");
  rifle?.classList.add("retroceso");
  setTimeout(() => rifle?.classList.remove("retroceso"), 140);

  // 8% de probabilidad de que el disparo salga desviado por completo
  if (Math.random() < 0.08) {
    await animarBalaAlAire(bala, s.x);
    $("texto-swipe").textContent = "¡Fallaste el tiro! La bala se fue de largo, intenta de nuevo 🎯";
    s.resuelto = false; // se puede volver a intentar, sigue flotando y cambiando de número
    return;
  }

  try {
    // Cada jugador dispara de forma independiente — no hay "blancos ocupados"
    // entre jugadores, así que con 11 jugadores y 5 blancos nadie se queda sin
    // número al que dispararle.
    await animarImpacto(bala, slot, s.x, s.y);

    // Pausa para que el jugador confirme bien qué número le tocó antes de
    // que la pantalla cambie a "esperando a los demás".
    $("texto-swipe").textContent = `🎯 ¡Le diste al número ${valorElegido}!`;
    await new Promise((r) => setTimeout(r, 1400));

    if (animacionBlancosId) cancelAnimationFrame(animacionBlancosId);
    if (cambioNumerosId) clearInterval(cambioNumerosId);

    await updateDoc(doc(db, "partidas", codigoPartida, "jugadores", miId), {
      bolaValor: valorElegido, listo: true
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
async function animarImpacto(bala, slot, x, y) {
  await moverBalaA(bala, x, y, 160);
  bala.classList.remove("volando");
  const el = document.querySelector(`.blanco[data-slot="${slot}"]`);
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
