import { guardarPuntaje, obtenerTop10 } from "./firebase-config.js";

/* ============================================================
   CONFIGURACIÓN DE ÍCONOS Y PUNTOS
   ============================================================ */
const ICONOS_BUENOS = [
  { src: "assets/iconos/buenos/powerapps.png",      puntos: 3, nombre: "Power Apps" },
  { src: "assets/iconos/buenos/powerautomate.png",  puntos: 3, nombre: "Power Automate" },
  { src: "assets/iconos/buenos/powerbi.png",        puntos: 2, nombre: "Power BI" },
  { src: "assets/iconos/buenos/copilot.png",        puntos: 2, nombre: "Copilot" },
  { src: "assets/iconos/buenos/sap.png",             puntos: 2, nombre: "SAP" },
  { src: "assets/iconos/buenos/sharepoint.png",      puntos: 1, nombre: "SharePoint" },
  { src: "assets/iconos/buenos/teams.png",           puntos: 1, nombre: "Teams" },
  { src: "assets/iconos/buenos/outlook.png",         puntos: 1, nombre: "Outlook" },
];

const ICONOS_MALOS = [
  "assets/iconos/malos/malo_1.png",
  "assets/iconos/malos/malo_2.png",
  "assets/iconos/malos/malo_3.png",
  "assets/iconos/malos/malo_4.png",
  "assets/iconos/malos/malo_5.png",
];

const VIDAS_INICIALES = 2;
const PROB_ICONO_MALO = 0.28; // 28% de los íconos que caen son "malos"

/* ============================================================
   ESCALADO DEL STAGE (1920x1080) A CUALQUIER PANTALLA
   ============================================================ */
const stage = document.getElementById("stage");
function ajustarEscala(){
  const escala = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${escala})`;
}
window.addEventListener("resize", ajustarEscala);
ajustarEscala();

/* ============================================================
   NAVEGACIÓN ENTRE PANTALLAS
   ============================================================ */
function mostrarPantalla(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ============================================================
   ESTADO DEL JUGADOR / REGISTRO
   ============================================================ */
const jugador = { nombre: "", nomina: "", avatar: "" };

const inputNombre = document.getElementById("input-nombre");
const inputNomina = document.getElementById("input-nomina");
const avatarBotones = document.querySelectorAll(".avatar-opcion");
const btnJugar = document.getElementById("btn-jugar");
const registroError = document.getElementById("registro-error");

avatarBotones.forEach(btn => {
  btn.addEventListener("click", () => {
    avatarBotones.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    jugador.avatar = btn.dataset.avatar;
    validarRegistro();
  });
});
inputNombre.addEventListener("input", validarRegistro);
inputNomina.addEventListener("input", validarRegistro);

function validarRegistro(){
  const nombreOk = inputNombre.value.trim().length >= 2;
  const nominaOk = inputNomina.value.trim().length >= 1;
  const avatarOk = !!jugador.avatar;
  btnJugar.disabled = !(nombreOk && nominaOk && avatarOk);
  registroError.textContent = "";
}

btnJugar.addEventListener("click", () => {
  jugador.nombre = inputNombre.value.trim();
  jugador.nomina = inputNomina.value.trim();
  mostrarPantalla("screen-instrucciones");
});

document.getElementById("btn-empezar").addEventListener("click", () => {
  mostrarPantalla("screen-juego");
  iniciarCuentaRegresiva();
});

document.getElementById("btn-ver-top").addEventListener("click", () => {
  mostrarPantalla("screen-top10");
  cargarTop10();
});
document.getElementById("btn-ir-top").addEventListener("click", () => {
  mostrarPantalla("screen-top10");
  cargarTop10();
});
document.getElementById("btn-top-volver").addEventListener("click", () => {
  reiniciarFormulario();
  mostrarPantalla("screen-registro");
});
document.getElementById("btn-jugar-de-nuevo").addEventListener("click", () => {
  reiniciarFormulario();
  mostrarPantalla("screen-registro");
});

function reiniciarFormulario(){
  inputNombre.value = "";
  inputNomina.value = "";
  jugador.avatar = "";
  avatarBotones.forEach(b => b.classList.remove("selected"));
  btnJugar.disabled = true;
}

/* ============================================================
   PRECARGA DE IMÁGENES
   ============================================================ */
const cacheImagenes = {};
function precargarImagen(src){
  return new Promise(resolve => {
    if (cacheImagenes[src]) return resolve(cacheImagenes[src]);
    const img = new Image();
    img.onload = () => { cacheImagenes[src] = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
const todasLasRutas = [
  ...ICONOS_BUENOS.map(i => i.src),
  ...ICONOS_MALOS,
  ...Array.from(avatarBotones).map(b => b.dataset.avatar),
];
Promise.all(todasLasRutas.map(precargarImagen));

/* ============================================================
   CANVAS Y JUEGO
   ============================================================ */
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const ANCHO = 1920, ALTO = 1080;

const AVATAR_W = 190, AVATAR_H = 190;
const ICONO_TAM = 100;

let avatar = { x: ANCHO / 2, targetX: ANCHO / 2, shakeHasta: 0 };
let objetos = []; // {x, y, vel, tam, tipo:'bueno'|'malo', data, id}
let idCounter = 0;
let puntos = 0;
let racha = 0;
let rachaMax = 0;
let vidas = VIDAS_INICIALES;
let tiempoInicio = 0;
let ultimoSpawn = 0;
let intervaloSpawn = 950; // ms, baja con el tiempo
let velocidadBase = 380;  // px/seg, sube con el tiempo
let jugando = false;
let rafId = null;

/* ---- Controles táctiles / mouse: el avatar sigue al dedo ---- */
function posXDesdeEvento(clientX){
  const rect = canvas.getBoundingClientRect();
  const relativo = (clientX - rect.left) / rect.width;
  return Math.min(Math.max(relativo, 0), 1) * ANCHO;
}
canvas.addEventListener("touchstart", e => {
  avatar.targetX = posXDesdeEvento(e.touches[0].clientX);
}, { passive: true });
canvas.addEventListener("touchmove", e => {
  avatar.targetX = posXDesdeEvento(e.touches[0].clientX);
}, { passive: true });

let arrastrando = false;
canvas.addEventListener("mousedown", e => { arrastrando = true; avatar.targetX = posXDesdeEvento(e.clientX); });
window.addEventListener("mousemove", e => { if (arrastrando) avatar.targetX = posXDesdeEvento(e.clientX); });
window.addEventListener("mouseup", () => arrastrando = false);

/* ---- Cuenta regresiva ---- */
function iniciarCuentaRegresiva(){
  resetEstadoJuego();
  const overlay = document.getElementById("countdown-overlay");
  const numeroEl = document.getElementById("countdown-numero");
  overlay.classList.add("show");
  let n = 3;
  numeroEl.textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n > 0){
      numeroEl.textContent = n;
    } else {
      clearInterval(iv);
      overlay.classList.remove("show");
      empezarJuego();
    }
  }, 700);
}

function resetEstadoJuego(){
  puntos = 0; racha = 0; rachaMax = 0; vidas = VIDAS_INICIALES;
  objetos = []; avatar.x = ANCHO/2; avatar.targetX = ANCHO/2;
  intervaloSpawn = 950; velocidadBase = 380;
  actualizarHudPuntos();
  actualizarHudRacha();
  actualizarHudVidas();
}

function actualizarHudPuntos(){
  document.getElementById("hud-puntos-valor").textContent = puntos;
}
function actualizarHudRacha(){
  const el = document.getElementById("hud-racha");
  const val = document.getElementById("hud-racha-valor");
  if (racha >= 2){
    val.textContent = `🔥 x${racha}`;
    el.classList.add("show");
  } else {
    el.classList.remove("show");
  }
}
function actualizarHudVidas(){
  for (let i = 1; i <= VIDAS_INICIALES; i++){
    const el = document.getElementById(`hud-vida-${i}`);
    if (!el) continue;
    el.classList.toggle("lost", i > vidas);
  }
}

/* ---- Loop principal ---- */
function empezarJuego(){
  jugando = true;
  tiempoInicio = performance.now();
  ultimoSpawn = tiempoInicio;
  rafId = requestAnimationFrame(loop);
}

function loop(t){
  if (!jugando) return;
  const dt = Math.min((t - (loop.ultimo || t)) / 1000, 0.05);
  loop.ultimo = t;

  const transcurrido = (t - tiempoInicio) / 1000;
  // dificultad progresiva
  velocidadBase = 380 + Math.min(transcurrido * 6, 260);
  intervaloSpawn = Math.max(950 - transcurrido * 12, 420);

  if (t - ultimoSpawn > intervaloSpawn){
    spawnObjeto();
    ultimoSpawn = t;
  }

  // mover avatar suavemente hacia targetX
  avatar.x += (avatar.targetX - avatar.x) * Math.min(dt * 12, 1);
  avatar.x = Math.min(Math.max(avatar.x, AVATAR_W/2), ANCHO - AVATAR_W/2);

  // mover objetos
  for (const o of objetos){
    o.y += o.vel * dt;
  }

  detectarColisiones();
  objetos = objetos.filter(o => o.y < ALTO + 150 && !o.atrapado);

  dibujar(t);

  if (jugando) rafId = requestAnimationFrame(loop);
}

function spawnObjeto(){
  const esMalo = Math.random() < PROB_ICONO_MALO;
  const x = ICONO_TAM/2 + Math.random() * (ANCHO - ICONO_TAM);
  if (esMalo){
    const src = ICONOS_MALOS[Math.floor(Math.random() * ICONOS_MALOS.length)];
    objetos.push({ id: idCounter++, x, y: -ICONO_TAM, vel: velocidadBase * (0.85 + Math.random()*0.3), tam: ICONO_TAM, tipo: "malo", src });
  } else {
    const data = ICONOS_BUENOS[Math.floor(Math.random() * ICONOS_BUENOS.length)];
    objetos.push({ id: idCounter++, x, y: -ICONO_TAM, vel: velocidadBase * (0.85 + Math.random()*0.3), tam: ICONO_TAM, tipo: "bueno", src: data.src, valor: data.puntos });
  }
}

function detectarColisiones(){
  const avatarTop = ALTO - 200; // posición fija del avatar (zona baja del canvas)
  const zonaAncho = AVATAR_W * 0.75;
  for (const o of objetos){
    if (o.atrapado) continue;
    const dentroX = Math.abs(o.x - avatar.x) < (zonaAncho/2 + o.tam/2 * 0.5);
    const dentroY = (o.y + o.tam/2) > avatarTop && (o.y - o.tam/2) < avatarTop + AVATAR_H*0.6;
    if (dentroX && dentroY){
      o.atrapado = true;
      if (o.tipo === "bueno"){
        atraparBueno(o);
      } else {
        atraparMalo();
      }
    }
  }
}

function atraparBueno(o){
  puntos += o.valor;
  racha += 1;
  if (racha > rachaMax) rachaMax = racha;
  actualizarHudPuntos();
  actualizarHudRacha();
}

function atraparMalo(){
  racha = 0;
  vidas -= 1;
  actualizarHudRacha();
  actualizarHudVidas();
  avatar.shakeHasta = performance.now() + 350;
  const juegoScreen = document.getElementById("screen-juego");
  juegoScreen.classList.remove("flash-malo");
  void juegoScreen.offsetWidth; // reinicia animación
  juegoScreen.classList.add("flash-malo");
  if (navigator.vibrate) navigator.vibrate(200);

  if (vidas <= 0){
    terminarJuego();
  }
}

function terminarJuego(){
  jugando = false;
  cancelAnimationFrame(rafId);
  mostrarResultado();
}

/* ---- Dibujo ---- */
function dibujar(t){
  ctx.clearRect(0, 0, ANCHO, ALTO);

  // objetos cayendo
  for (const o of objetos){
    const img = cacheImagenes[o.src];
    if (!img) continue;
    ctx.save();
    if (o.tipo === "malo"){
      ctx.shadowColor = "rgba(255,71,87,0.85)";
      ctx.shadowBlur = 22;
    } else {
      ctx.shadowColor = "rgba(255,255,255,0.35)";
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(img, o.x - o.tam/2, o.y - o.tam/2, o.tam, o.tam);
    ctx.restore();
  }

  // avatar
  const img = cacheImagenes[jugador.avatar];
  let dx = 0, dy = 0;
  if (t < avatar.shakeHasta){
    dx = (Math.random() - 0.5) * 18;
    dy = (Math.random() - 0.5) * 10;
  }
  const avatarY = ALTO - 200;
  if (img){
    ctx.save();
    if (t < avatar.shakeHasta){
      ctx.shadowColor = "rgba(255,71,87,0.9)";
      ctx.shadowBlur = 30;
    } else {
      ctx.shadowColor = "rgba(62,142,255,0.5)";
      ctx.shadowBlur = 20;
    }
    ctx.drawImage(img, avatar.x - AVATAR_W/2 + dx, avatarY - AVATAR_H/2 + dy, AVATAR_W, AVATAR_H);
    ctx.restore();
  }
}

/* ============================================================
   RESULTADO
   ============================================================ */
async function mostrarResultado(){
  document.getElementById("resultado-nombre").textContent = jugador.nombre;
  document.getElementById("resultado-puntaje-valor").textContent = puntos;
  document.getElementById("resultado-racha-max").textContent = `Racha máxima: 🔥 x${rachaMax}`;
  mostrarPantalla("screen-resultado");

  await guardarPuntaje({
    nombre: jugador.nombre,
    nomina: jugador.nomina,
    avatar: jugador.avatar,
    puntos: puntos,
    rachaMax: rachaMax
  });
}

/* ============================================================
   TOP 10
   ============================================================ */
async function cargarTop10(){
  const lista = document.getElementById("top10-lista");
  lista.innerHTML = `<p class="top10-cargando">Cargando...</p>`;
  const datos = await obtenerTop10();
  if (!datos.length){
    lista.innerHTML = `<p class="top10-cargando">Aún no hay puntajes registrados.</p>`;
    return;
  }
  lista.innerHTML = "";
  datos.forEach((d, i) => {
    const fila = document.createElement("div");
    fila.className = "top10-fila" + (i < 3 ? " top3" : "");
    fila.innerHTML = `
      <span class="top10-pos">#${i+1}</span>
      <img class="top10-avatar" src="${d.avatar || ""}" alt="">
      <span class="top10-nombre">${escaparHtml(d.nombre || "—")}</span>
      <span class="top10-puntos">${d.puntos ?? 0}</span>
    `;
    lista.appendChild(fila);
  });
}

function escaparHtml(str){
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
