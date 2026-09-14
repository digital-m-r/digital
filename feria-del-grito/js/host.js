import {
  db, doc, setDoc, updateDoc, onSnapshot, collection
} from "./firebase-config.js";
import {
  META_CASILLAS, COLORES, AVATARES,
  generarCodigoPartida, barajar, cargarBancoPreguntas
} from "./juego-common.js";
import {
  sonarAcierto, sonarError, sonarVictoriaCorta,
  iniciarMusicaCarrera, detenerMusicaCarrera, setSilenciado
} from "./sonidos.js";
import { lanzarConfeti } from "./confeti.js";

let codigoPartida = null;
let bancoPreguntas = [];
let jugadoresCache = {}; // id -> data
let partidaCache = null;
let popupAbierto = false;
let musicaSilenciada = false;
let ganadorYaAnunciado = false;

const $ = (id) => document.getElementById(id);
const COLOR_HEX = { rojo: "#C8232A", azul: "#1668C9", amarillo: "#E8AE00", verde: "#0E7A3E" };

$("btn-silenciar").addEventListener("click", () => {
  musicaSilenciada = !musicaSilenciada;
  setSilenciado(musicaSilenciada);
  $("btn-silenciar").textContent = musicaSilenciada ? "🔇" : "🔊";
});

// ---------- Crear partida ----------
$("btn-crear-partida").addEventListener("click", async () => {
  bancoPreguntas = await cargarBancoPreguntas();
  const ordenPreguntas = barajar(bancoPreguntas.map(p => p.id));

  codigoPartida = generarCodigoPartida();
  await setDoc(doc(db, "partidas", codigoPartida), {
    estado: "lobby",
    metaCasillas: META_CASILLAS,
    rondaActual: 0,
    ordenPreguntas,
    preguntaIndexActual: -1,
    preguntaActual: null,
    ganadorId: null,
    creadaEn: Date.now()
  });

  $("codigo-grande").textContent = codigoPartida;
  $("codigo-header").textContent = codigoPartida;
  $("pantalla-crear").style.display = "none";
  $("pantalla-lobby").style.display = "flex";

  escucharJugadores();
  escucharPartida();
});

$("btn-iniciar-partida").addEventListener("click", async () => {
  await iniciarNuevaRonda();
  $("pantalla-lobby").style.display = "none";
  $("pantalla-pista").style.display = "flex";
});

// ---------- Escuchar jugadores ----------
function escucharJugadores() {
  onSnapshot(collection(db, "partidas", codigoPartida, "jugadores"), (snap) => {
    jugadoresCache = {};
    snap.forEach(d => jugadoresCache[d.id] = d.data());
    renderLobby();
    renderPista();
    verificarTodosLanzaron();
    verificarTodosRespondieron();
  });
}

function renderLobby() {
  const cont = $("lista-jugadores-lobby");
  cont.innerHTML = "";
  const ids = Object.keys(jugadoresCache);
  ids.forEach(id => {
    const j = jugadoresCache[id];
    const row = document.createElement("div");
    row.style.cssText = "display:flex; align-items:center; gap:10px; background:white; border-radius:12px; padding:8px 12px;";
    row.innerHTML = `<img src="${j.foto}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;"/><strong>${j.nombre}</strong>`;
    cont.appendChild(row);
  });
  $("btn-iniciar-partida").disabled = ids.length < 1;
}

// ---------- Escuchar partida ----------
function escucharPartida() {
  onSnapshot(doc(db, "partidas", codigoPartida), (snap) => {
    partidaCache = snap.data();
    if (!partidaCache) return;
    renderPreguntaEnPantalla();
    if (partidaCache.estado === "terminado") mostrarGanador();
  });
}

// ---------- Nueva ronda ----------
async function iniciarNuevaRonda() {
  const ids = Object.keys(jugadoresCache);
  for (const id of ids) {
    await updateDoc(doc(db, "partidas", codigoPartida, "jugadores", id), {
      bolaValor: null, listo: false,
      respuestaColor: null, respondido: false, correcto: null
    });
  }
  await updateDoc(doc(db, "partidas", codigoPartida), {
    estado: "lanzando",
    preguntaActual: null,
    rondaActual: (partidaCache?.rondaActual || 0) + 1
  });
  $("panel-revelacion").style.display = "none";
  popupAbierto = false;
  ganadorYaAnunciado = false;
}

// ---------- Fase 1: esperar a que todos lancen la bola ----------
async function verificarTodosLanzaron() {
  if (!partidaCache || partidaCache.estado !== "lanzando") return;
  const ids = Object.keys(jugadoresCache);
  if (ids.length === 0) return;
  if (!ids.every(id => jugadoresCache[id].listo)) return;

  const siguienteIndex = (partidaCache.preguntaIndexActual + 1) % partidaCache.ordenPreguntas.length;
  const preguntaId = partidaCache.ordenPreguntas[siguienteIndex];
  const pregunta = await buscarPreguntaPorId(preguntaId);

  await updateDoc(doc(db, "partidas", codigoPartida), {
    estado: "pregunta",
    preguntaIndexActual: siguienteIndex,
    preguntaActual: pregunta
  });
}

async function buscarPreguntaPorId(id) {
  if (!bancoPreguntas.length) bancoPreguntas = await cargarBancoPreguntas();
  return bancoPreguntas.find(p => p.id === id);
}

// ---------- Fase 2: esperar a que todos respondan ----------
async function verificarTodosRespondieron() {
  if (!partidaCache || partidaCache.estado !== "pregunta" || popupAbierto) return;
  const ids = Object.keys(jugadoresCache);
  if (ids.length === 0) return;
  if (!ids.every(id => jugadoresCache[id].respondido)) return;

  popupAbierto = true;
  await updateDoc(doc(db, "partidas", codigoPartida), { estado: "revelando" });
  mostrarPopupRevelacion();
}

function mostrarPopupRevelacion() {
  const cont = $("grid-revelacion");
  cont.innerHTML = "";
  let hayAcierto = false, hayError = false;
  Object.keys(jugadoresCache).forEach(id => {
    const j = jugadoresCache[id];
    if (j.correcto) hayAcierto = true; else hayError = true;
    const avatarDiv = document.createElement("div");
    avatarDiv.className = `avatar-revelacion ${j.correcto ? "correcto" : "incorrecto"}`;
    avatarDiv.innerHTML = `
      <img src="${j.foto}" alt="" />
      <span>${j.nombre}</span>
      <div class="marca-resultado">${j.correcto ? "✅" : "❌"}</div>
    `;
    cont.appendChild(avatarDiv);
  });

  const p = partidaCache.preguntaActual;
  $("respuesta-correcta-texto").textContent = p
    ? `✅ La respuesta correcta era: ${p.opciones[p.correcta]}`
    : "";

  $("panel-pregunta").style.display = "none";
  $("panel-revelacion").style.display = "flex";

  if (hayAcierto) sonarAcierto();
  if (hayError) setTimeout(() => sonarError(), hayAcierto ? 550 : 0);
}

// ---------- El anfitrión cierra el popup: aplica avances y vibra a los que fallaron ----------
$("btn-cerrar-revelacion").addEventListener("click", async () => {
  $("panel-revelacion").style.display = "none";
  popupAbierto = false;

  const ids = Object.keys(jugadoresCache);
  const huboAlgunAcierto = ids.some(id => jugadoresCache[id].correcto);
  if (huboAlgunAcierto) iniciarMusicaCarrera();

  // Vibra a los que fallaron (efecto local, no se guarda en Firestore)
  ids.forEach(id => {
    if (!jugadoresCache[id].correcto) {
      const el = document.querySelector(`.carril[data-id="${id}"]`);
      if (el) {
        el.classList.add("vibrar");
        setTimeout(() => el.classList.remove("vibrar"), 650);
      }
    }
  });

  let ganador = null;
  for (const id of ids) {
    const j = jugadoresCache[id];
    if (j.correcto) {
      const nuevaPos = Math.min(META_CASILLAS, (j.posicion || 0) + (j.bolaValor || 0));
      await updateDoc(doc(db, "partidas", codigoPartida, "jugadores", id), { posicion: nuevaPos });
      if (nuevaPos >= META_CASILLAS) ganador = id;
    }
  }

  setTimeout(() => detenerMusicaCarrera(), 1400);

  if (ganador) {
    await updateDoc(doc(db, "partidas", codigoPartida), { estado: "terminado", ganadorId: ganador });
    return;
  }

  setTimeout(() => { iniciarNuevaRonda(); }, 1500);
});

// ---------- Render de la pista ----------
function renderPista() {
  const cont = $("contenedor-pista");
  const ids = Object.keys(jugadoresCache);
  cont.innerHTML = "";
  const alturaCarril = 100 / Math.max(ids.length, 1);
  // El caballo se hace más chico entre más jugadores haya, para que quepan sin encimarse
  const anchoCarril = Math.max(4.5, Math.min(9.5, 62 / Math.max(ids.length, 1)));

  ids.forEach((id, i) => {
    const j = jugadoresCache[id];
    const avatar = AVATARES[j.avatar] || AVATARES.charro;
    const pctAvance = Math.min(1, (j.posicion || 0) / META_CASILLAS);
    const leftPct = 2 + pctAvance * 78;

    const carril = document.createElement("div");
    carril.className = "carril";
    carril.dataset.id = id;
    carril.style.top = `${i * alturaCarril}%`;
    carril.style.left = `${leftPct}%`;
    carril.style.width = `${anchoCarril}%`;

    const caraSize = 100 * (avatar.cara.rPct * 2 / 100);
    carril.innerHTML = `
      <img class="caballo-sprite" src="${avatar.img}" alt="" />
      <div class="cara-jugador" style="
          width:${caraSize}%; height:${caraSize * (871/703)}%;
          left:${avatar.cara.xPct - avatar.cara.rPct}%;
          top:${avatar.cara.yPct - avatar.cara.rPct}%;">
        <img src="${j.foto}" alt="" />
      </div>
      <div class="nombre-jugador">${j.nombre}</div>
      ${j.bolaValor != null && partidaCache?.estado !== "lanzando" ? `<div class="num-lanzado">${j.bolaValor}</div>` : ""}
    `;
    cont.appendChild(carril);
  });
}

// ---------- Render de la pregunta en la pantalla grande ----------
function renderPreguntaEnPantalla() {
  const panel = $("panel-pregunta");
  if (partidaCache.estado !== "pregunta" || !partidaCache.preguntaActual) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "flex";
  const p = partidaCache.preguntaActual;
  $("texto-pregunta").textContent = p.pregunta;
  $("aviso-turno").textContent = "🙋 Respondan a su ritmo desde su celular — sin prisa, sin tiempo límite";

  const cont = $("opciones-pregunta");
  cont.innerHTML = "";
  p.opciones.forEach((texto, idx) => {
    const div = document.createElement("div");
    div.className = `host-opcion ${COLORES[idx]}`;
    div.style.background = COLOR_HEX[COLORES[idx]];
    div.textContent = texto;
    cont.appendChild(div);
  });

  const ids = Object.keys(jugadoresCache);
  const respondieron = ids.filter(id => jugadoresCache[id].respondido).length;
  $("contador-respondidos").textContent = `${respondieron} / ${ids.length} ya respondieron`;
}

function mostrarGanador() {
  if (ganadorYaAnunciado) return;
  ganadorYaAnunciado = true;

  $("panel-pregunta").style.display = "none";
  $("panel-revelacion").style.display = "none";
  const panel = $("panel-ganador");
  panel.style.display = "flex";
  const g = jugadoresCache[partidaCache.ganadorId];
  if (g) {
    $("foto-ganador").src = g.foto;
    $("texto-ganador").textContent = `¡${g.nombre} ganó la carrera! 🏆🐎`;
  }

  detenerMusicaCarrera();
  sonarVictoriaCorta();
  lanzarConfeti(panel, 4500);
}

// Redibuja la pista periódicamente para animaciones suaves de posición
setInterval(() => { if (partidaCache) renderPista(); }, 1200);
