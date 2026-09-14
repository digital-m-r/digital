import {
  db, doc, getDoc, setDoc, updateDoc, onSnapshot,
  collection, addDoc, runTransaction
} from "./firebase-config.js";
import { AVATARES, BLANCOS_TIRO, BLANCOS_Y_PCT, recortarFotoACuadro } from "./juego-common.js";
// nota: runTransaction se sigue usando al disparar, para reservar el
// blanco de forma atómica (ver ejecutarDisparo)

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

// ---------- Tiro al Blanco: mira que se mueve sola + botón de disparo ----------
let tiroListo = false;
let miraAnimacionId = null;
let miraXActual = 50;

function inicializarSkeeball(partida) {
  if (tiroListo) return; // solo engancha los listeners una vez
  tiroListo = true;

  const btn = $("btn-disparar");
  let disparando = false;

  btn.addEventListener("click", async () => {
    if (disparando) return;
    disparando = true;
    btn.disabled = true;
    await ejecutarDisparo();
    btn.disabled = false;
    disparando = false;
  });
}

// La mira oscila de un lado a otro sola, sin parar, sobre la fila de blancos.
function moverMiraContinuo() {
  if (miraAnimacionId) cancelAnimationFrame(miraAnimacionId);
  const mira = $("mira");
  if (!mira) return;
  const t0 = performance.now();
  function cuadro(t) {
    const seg = (t - t0) / 1000;
    // va y viene entre 8% y 92% del campo, con velocidad ligeramente variable
    miraXActual = 50 + 42 * Math.sin(seg * 1.7);
    mira.style.left = `${miraXActual}%`;
    miraAnimacionId = requestAnimationFrame(cuadro);
  }
  miraAnimacionId = requestAnimationFrame(cuadro);
}

// Reinicia bala/blancos visualmente y vuelve a arrancar la mira
// (se llama al empezar cada ronda nueva)
function reiniciarBola() {
  const bala = $("bola-lanzable");
  if (bala) {
    bala.classList.remove("volando");
    bala.style.transition = "none";
    bala.style.left = "50%";
    bala.style.top = "88%";
  }
  document.querySelectorAll(".blanco").forEach(b => b.classList.remove("impactado", "rechazado"));
  moverMiraContinuo();
}

async function ejecutarDisparo() {
  const bala = $("bola-lanzable");
  const rifle = document.querySelector(".rifle-icono");
  rifle?.classList.add("retroceso");
  setTimeout(() => rifle?.classList.remove("retroceso"), 140);

  // ¿A qué número apuntaba la mira en el momento del disparo?
  let numeroApuntado = 1;
  let mejorDistancia = Infinity;
  for (const [num, pos] of Object.entries(BLANCOS_TIRO)) {
    const d = Math.abs(pos.xPct - miraXActual);
    if (d < mejorDistancia) { mejorDistancia = d; numeroApuntado = parseInt(num); }
  }

  // Un poco de imprecisión "de feria": a veces el rifle se desvía al número vecino
  if (Math.random() < 0.22) {
    const vecino = numeroApuntado + (Math.random() < 0.5 ? -1 : 1);
    if (vecino >= 1 && vecino <= 5) numeroApuntado = vecino;
  }

  // 12% de probabilidad de fallar el tiro por completo (el rifle se movió)
  const noAtina = Math.random() < 0.12;

  if (noAtina) {
    await animarBalaAlAire(bala);
    $("texto-swipe").textContent = "¡Fallaste el tiro! La bala se fue de largo, intenta de nuevo 🎯";
    return;
  }

  try {
    const exito = await runTransaction(db, async (tx) => {
      const ref = doc(db, "partidas", codigoPartida);
      const snap = await tx.get(ref);
      const partida = snap.data();
      const blancos = partida.hoyosOcupados || {};
      if (blancos[numeroApuntado]) return false; // blanco ocupado por otro jugador
      blancos[numeroApuntado] = miId;
      tx.update(ref, { hoyosOcupados: blancos });
      return true;
    });

    if (!exito) {
      await animarRechazo(bala, numeroApuntado);
      $("texto-swipe").textContent = `¡El blanco ${numeroApuntado} ya estaba tomado! La bala rebotó, intenta de nuevo 🎯`;
      return;
    }

    await animarImpacto(bala, numeroApuntado);

    if (miraAnimacionId) cancelAnimationFrame(miraAnimacionId);

    await updateDoc(doc(db, "partidas", codigoPartida, "jugadores", miId), {
      bolaValor: numeroApuntado, listo: true
    });
  } catch (e) {
    $("texto-swipe").textContent = "Algo falló, intenta disparar de nuevo.";
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

// La bala le da justo al blanco: impacto con tambaleo y luego desaparece.
async function animarImpacto(bala, numero) {
  const pos = BLANCOS_TIRO[numero];
  await moverBalaA(bala, pos.xPct, BLANCOS_Y_PCT, 180);
  bala.classList.remove("volando");
  const el = document.querySelector(`.blanco[data-numero="${numero}"]`);
  el?.classList.add("impactado");
  setTimeout(() => el?.classList.remove("impactado"), 500);
}

// El blanco ya estaba tomado: la bala pega y rebota (rechazo).
async function animarRechazo(bala, numero) {
  const pos = BLANCOS_TIRO[numero];
  await moverBalaA(bala, pos.xPct, BLANCOS_Y_PCT, 180);
  const el = document.querySelector(`.blanco[data-numero="${numero}"]`);
  el?.classList.add("rechazado");
  setTimeout(() => el?.classList.remove("rechazado"), 300);
  await moverBalaA(bala, 50, 88, 220);
  bala.classList.remove("volando");
}

// Tiro totalmente errado: la bala se va de largo hacia arriba y desaparece.
async function animarBalaAlAire(bala) {
  await moverBalaA(bala, 50 + (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 20), -10, 220);
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
