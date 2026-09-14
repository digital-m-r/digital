import {
  db, doc, getDoc, setDoc, updateDoc, onSnapshot,
  collection, addDoc, runTransaction
} from "./firebase-config.js";
import { AVATARES, recortarFotoACuadro } from "./juego-common.js";
// nota: runTransaction se sigue usando en el lanzamiento del skee-ball
// para reservar el hoyo de forma atómica (ver intentarLanzamiento)

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

  if (partida.estado !== ultimoEstadoRenderizado) {
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

// ---------- Skee-ball: lanzamiento por swipe ----------
let skeeballListo = false;
function inicializarSkeeball(partida) {
  if (skeeballListo) return; // solo engancha los listeners una vez
  skeeballListo = true;

  const wrap = $("tablero-wrap");
  const bola = $("bola-lanzable");
  let y0 = null, t0 = null;
  let procesando = false;

  wrap.addEventListener("touchstart", (e) => {
    y0 = e.touches[0].clientY;
    t0 = Date.now();
  }, { passive: true });

  wrap.addEventListener("touchend", async (e) => {
    if (y0 == null || procesando) return;
    const y1 = e.changedTouches[0].clientY;
    const t1 = Date.now();
    const dy = y0 - y1;               // positivo = deslizó hacia arriba
    const dt = Math.max(t1 - t0, 40);
    const velocidad = dy / dt;         // px/ms

    y0 = null;
    if (velocidad < 0.15) return;      // swipe muy débil, no lanza

    procesando = true;
    bola.style.transition = "transform 0.35s ease-out, opacity 0.35s ease-out";
    bola.style.transform = `translate(-50%, -${Math.min(velocidad, 2.2) * 140}px)`;
    bola.style.opacity = "0";

    await intentarLanzamiento(velocidad);

    setTimeout(() => {
      bola.style.transition = "none";
      bola.style.transform = "translateX(-50%)";
      bola.style.opacity = "1";
      procesando = false;
    }, 500);
  }, { passive: true });
}

async function intentarLanzamiento(velocidad) {
  // Mapea la velocidad del swipe a un número base 1-9, con algo de imprecisión "de feria"
  const base = Math.max(1, Math.min(9, Math.round(velocidad * 4.2)));
  const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
  let valor = Math.max(1, Math.min(9, base + jitter));

  // 12% de probabilidad de que la bola no atine a ningún hoyo (rebote real de feria)
  if (Math.random() < 0.12) {
    $("texto-swipe").textContent = "¡Uy, no atinaste! La bola regresó, intenta de nuevo 🎯";
    return;
  }

  try {
    const exito = await runTransaction(db, async (tx) => {
      const ref = doc(db, "partidas", codigoPartida);
      const snap = await tx.get(ref);
      const partida = snap.data();
      const hoyos = partida.hoyosOcupados || {};
      if (hoyos[valor]) return false; // hoyo ocupado por otro jugador
      hoyos[valor] = miId;
      tx.update(ref, { hoyosOcupados: hoyos });
      return true;
    });

    if (!exito) {
      $("texto-swipe").textContent = `¡El hoyo ${valor} ya estaba ocupado! La bola rebotó, intenta de nuevo 🎯`;
      return;
    }

    await updateDoc(doc(db, "partidas", codigoPartida, "jugadores", miId), {
      bolaValor: valor, listo: true
    });
  } catch (e) {
    $("texto-swipe").textContent = "Algo falló, intenta lanzar de nuevo.";
  }
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
