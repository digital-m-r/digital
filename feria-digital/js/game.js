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
const stageEl = document.getElementById("stage");

// El tamaño del canvas se recalcula con el tamaño real del contenedor
// (no window.innerWidth/innerHeight): en navegadores móviles o in-app
// (Safari, Telegram, etc.) esas propiedades cambian cuando aparece o
// desaparece la barra de direcciones, y eso dejaba al avatar fuera de
// la pantalla visible. getBoundingClientRect() siempre da el tamaño
// real y visible del contenedor.
let ANCHO = window.innerWidth, ALTO = window.innerHeight;
let AVATAR_W = 190, AVATAR_H = 190;
let ICONO_TAM = 100;

function actualizarTamanos(){
  const base = Math.min(ANCHO, ALTO);
  AVATAR_W = AVATAR_H = base * 0.24;
  ICONO_TAM = base * 0.13;
}

function resizeCanvas(){
  const rect = stageEl.getBoundingClientRect();
  ANCHO = rect.width;
  ALTO = rect.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(ANCHO * dpr);
  canvas.height = Math.round(ALTO * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  actualizarTamanos();
  // mantener al avatar dentro de los límites si la pantalla cambió de tamaño
  avatar.x = Math.min(Math.max(avatar.x, AVATAR_W / 2), ANCHO - AVATAR_W / 2);
  avatar.targetX = avatar.x;
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);
if (window.visualViewport){
  window.visualViewport.addEventListener("resize", resizeCanvas);
}

let avatar = { x: ANCHO / 2, targetX: ANCHO / 2, shakeHasta: 0 };
actualizarTamanos();
resizeCanvas();
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

/* ---- Controles de teclado (flechas o A/D) para probar desde la compu ---- */
let teclaIzquierda = false, teclaDerecha = false;
window.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") teclaIzquierda = true;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") teclaDerecha = true;
});
window.addEventListener("keyup", e => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") teclaIzquierda = false;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") teclaDerecha = false;
});

/* ---- Cuenta regresiva ---- */
function iniciarCuentaRegresiva(){
  resizeCanvas(); // por si el dispositivo giró u orientó distinto desde el registro
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
  // dificultad progresiva (velocidad como fracción del alto de pantalla,
  // así cae igual de "rápido" relativamente sin importar el tamaño de pantalla)
  velocidadBase = ALTO * (0.35 + Math.min(transcurrido * 0.006, 0.25));
  intervaloSpawn = Math.max(950 - transcurrido * 12, 420);

  if (t - ultimoSpawn > intervaloSpawn){
    spawnObjeto();
    ultimoSpawn = t;
  }

  // control por teclado (flechas o A/D)
  const velocidadTeclado = ANCHO * 0.9; // px/seg
  if (teclaIzquierda) avatar.targetX -= velocidadTeclado * dt;
  if (teclaDerecha) avatar.targetX += velocidadTeclado * dt;
  avatar.targetX = Math.min(Math.max(avatar.targetX, AVATAR_W/2), ANCHO - AVATAR_W/2);

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

function avatarCentroY(){
  // el avatar vive cerca del borde inferior, con un pequeño margen relativo
  return ALTO - AVATAR_H * 0.55 - ALTO * 0.04;
}

function detectarColisiones(){
  const avatarTop = avatarCentroY() - AVATAR_H / 2;
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

  // objetos cayendo — respaldo blanco detrás de cada ícono (para que se
  // distingan bien sin importar el color de fondo) + aro rojo en los malos
  for (const o of objetos){
    const img = cacheImagenes[o.src];
    if (!img) continue;
    const radioChip = o.tam * 0.62;
    ctx.save();

    // sombra/resplandor de fondo
    ctx.shadowColor = o.tipo === "malo" ? "rgba(255,71,87,0.6)" : "rgba(0,0,0,0.35)";
    ctx.shadowBlur = o.tipo === "malo" ? 18 : 10;

    // chip blanco de fondo
    ctx.beginPath();
    ctx.arc(o.x, o.y, radioChip, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    // aro rojo alrededor de los íconos malos
    if (o.tipo === "malo"){
      ctx.save();
      ctx.lineWidth = o.tam * 0.09;
      ctx.strokeStyle = "#FF4757";
      ctx.beginPath();
      ctx.arc(o.x, o.y, radioChip - ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // el logo, un poco más chico que el chip para que respire
    const logoTam = o.tam * 0.82;
    ctx.drawImage(img, o.x - logoTam/2, o.y - logoTam/2, logoTam, logoTam);
  }

  // avatar
  const img = cacheImagenes[jugador.avatar];
  let dx = 0, dy = 0;
  if (t < avatar.shakeHasta){
    dx = (Math.random() - 0.5) * 18;
    dy = (Math.random() - 0.5) * 10;
  }
  const avatarY = avatarCentroY();
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
