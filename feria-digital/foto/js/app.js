import { db, doc, setDoc, serverTimestamp, COLECCION_FOTOS } from "./firebase-foto.js";
import { MARCOS } from "./marcos.js";

/* ============================================================
   AJUSTES
   ============================================================ */
const SEGUNDOS_CUENTA = 3;
const SEGUNDOS_REINICIO_QR = 90;     // vuelve solo al inicio si nadie toca la pantalla
const SEGUNDOS_APAGAR_CAMARA = 180;  // apaga la cámara tras 3 min sin usarse
const ANCHO_FOTO = 1920, ALTO_FOTO = 1080;   // foto final en Full HD
const CALIDAD_INICIAL = 0.92;
const MAX_CARACTERES_FOTO = 850000;  // debe ser menor a 900000 (regla de Firestore)

// Si abres la cabina directo en el iPhone con ?camara=trasera,
// arranca con la cámara de atrás.
const FORZAR_TRASERA = new URLSearchParams(location.search).get("camara") === "trasera";

/* ---------- referencias ---------- */
const $ = id => document.getElementById(id);
const pantallas = ["s-marcos", "s-camara", "s-resultado", "s-qr", "s-mensaje"];
const video = $("video");
const lienzo = $("lienzo");
lienzo.width = ANCHO_FOTO;
lienzo.height = ALTO_FOTO;
const ctx = lienzo.getContext("2d");

let marcoActual = null;
let marcoImg = null;
let stream = null;
let fotoDataUrl = null;
let temporizadorQR = null;
let temporizadorCamara = null;
let ocupado = false;

// cámara y espejo
let camaras = [];                                // cámaras disponibles
let camId = leer("foto_camId");                  // última cámara elegida
let espejo = true;

/* ---------- almacenamiento local (recuerda la cámara elegida) ---------- */
function leer(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function guardar(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }

function mostrar(id){
  pantallas.forEach(p => $(p).classList.toggle("activa", p === id));
}

function mensaje(titulo, texto, textoBoton, accion){
  $("msg-titulo").textContent = titulo;
  $("msg-texto").textContent = texto;
  const b = $("btn-msg");
  b.textContent = textoBoton;
  b.onclick = accion;
  mostrar("s-mensaje");
}

/* ============================================================
   1. GRID DE MARCOS (se ajusta solo al número de marcos)
   ============================================================ */
function construirMarcos(){
  const grid = $("grid-marcos");
  grid.innerHTML = "";
  const n = MARCOS.length;
  const cols = n <= 4 ? 2 : (n <= 6 ? 3 : 4);
  const filas = Math.ceil(n / cols);
  grid.style.setProperty("--cols", cols);
  grid.style.setProperty("--factor", (cols * 16 / 9 / filas).toFixed(4));

  MARCOS.forEach(m => {
    const card = document.createElement("button");
    card.className = "marco-card";
    card.setAttribute("aria-label", m.nombre);
    card.style.padding = "0";
    card.innerHTML = `<img src="${m.src}" alt="${m.nombre}">`;
    card.addEventListener("click", () => elegirMarco(m));
    grid.appendChild(card);
  });
}

function cargarImagen(src){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("No se pudo cargar " + src));
    img.src = src;
  });
}

/* ============================================================
   2. CÁMARA
   ============================================================ */
const esTrasera = label => /back|rear|trasera|environment/i.test(label || "");

async function abrirStream(deviceId){
  // Pedimos la mejor resolución disponible (el navegador entrega la más cercana)
  const base = {
    width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }
  };
  const intentos = [];
  if (deviceId){
    intentos.push({ video: { ...base, deviceId: { exact: deviceId } }, audio: false });
  } else if (FORZAR_TRASERA){
    intentos.push({ video: { ...base, facingMode: { ideal: "environment" } }, audio: false });
  } else {
    intentos.push({ video: { ...base, facingMode: "user" }, audio: false });
  }
  intentos.push({ video: true, audio: false }); // último recurso

  let ultimoError;
  for (const c of intentos){
    try{
      return await navigator.mediaDevices.getUserMedia(c);
    }catch(e){
      ultimoError = e;
      if (e.name === "NotAllowedError" || e.name === "SecurityError") throw e;
    }
  }
  throw ultimoError;
}

async function actualizarListaCamaras(){
  try{
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    camaras = dispositivos.filter(d => d.kind === "videoinput");
  }catch(e){ camaras = []; }
  $("btn-camara").style.display = camaras.length > 1 ? "" : "none";
}

function aplicarEspejo(){
  video.classList.toggle("espejo", espejo);
  const b = $("btn-espejo");
  b.textContent = espejo ? "↔ Espejo: SÍ" : "↔ Espejo: NO";
  b.classList.toggle("activo", espejo);
}

async function iniciarCamara(){
  if (stream) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    throw new Error("sin-soporte");
  }
  stream = await abrirStream(camId);
  video.srcObject = stream;
  await video.play().catch(() => {});

  const track = stream.getVideoTracks()[0];
  const ajustes = track && track.getSettings ? track.getSettings() : {};

  // enfoque y exposición continuos, si el dispositivo lo permite
  try{
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" }, { exposureMode: "continuous" }] });
  }catch(e){ /* no todos los navegadores lo soportan, no pasa nada */ }

  await actualizarListaCamaras();
  if (ajustes.deviceId){ camId = ajustes.deviceId; guardar("foto_camId", camId); }

  // espejo: recuerda la preferencia de cada cámara; por defecto, sí (como espejo),
  // excepto en cámaras traseras
  const pref = leer("foto_espejo_" + camId);
  espejo = pref !== null ? pref === "1" : !(ajustes.facingMode === "environment" || esTrasera(track.label));
  aplicarEspejo();

  const nombre = (track.label || "Cámara").replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
  const res = ajustes.width && ajustes.height ? `  ·  ${ajustes.width}×${ajustes.height}` : "";
  $("cam-nombre").textContent = "📷 " + nombre + res;
}

function detenerCamara(){
  if (stream){
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
}

function programarApagadoCamara(){
  clearTimeout(temporizadorCamara);
  temporizadorCamara = setTimeout(detenerCamara, SEGUNDOS_APAGAR_CAMARA * 1000);
}

async function cambiarCamara(){
  if (ocupado || camaras.length < 2) return;
  ocupado = true;
  const anterior = camId;
  try{
    const i = camaras.findIndex(c => c.deviceId === camId);
    camId = camaras[(i + 1) % camaras.length].deviceId;
    detenerCamara();
    await iniciarCamara();
  }catch(err){
    console.error("No se pudo cambiar de cámara:", err);
    camId = anterior;            // regresa a la que sí funcionaba
    detenerCamara();
    try{ await iniciarCamara(); }catch(e){ console.error(e); }
  }finally{
    ocupado = false;
  }
}

function alternarEspejo(){
  espejo = !espejo;
  guardar("foto_espejo_" + camId, espejo ? "1" : "0");
  aplicarEspejo();
}

async function elegirMarco(m){
  if (ocupado) return;
  ocupado = true;
  clearTimeout(temporizadorCamara);
  try{
    marcoImg = await cargarImagen(m.src);
    marcoActual = m;
    $("marco-overlay").src = m.src;
    await iniciarCamara();
    mostrar("s-camara");
  }catch(err){
    console.error(err);
    const sinPermiso = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
    const sinCamara = err && (err.name === "NotFoundError" || err.message === "sin-soporte");
    if (sinPermiso){
      mensaje("Necesitamos tu cámara",
        "Permite el acceso a la cámara en tu navegador (ícono de candado junto a la dirección) y vuelve a intentar.",
        "Reintentar", () => elegirMarco(m));
    } else if (sinCamara){
      mensaje("No encontramos una cámara",
        "Conecta una cámara o revisa que ninguna otra aplicación la esté usando.",
        "Reintentar", () => elegirMarco(m));
    } else {
      mensaje("Algo salió mal", "No pudimos cargar el marco o la cámara. Intenta de nuevo.",
        "Volver", () => mostrar("s-marcos"));
    }
  }finally{
    ocupado = false;
  }
}

/* ============================================================
   3. CUENTA REGRESIVA + CAPTURA
   ============================================================ */
function esperar(ms){ return new Promise(r => setTimeout(r, ms)); }

async function tomarFoto(){
  if (ocupado) return;
  ocupado = true;
  const botones = ["btn-foto", "btn-cambiar-marco", "btn-camara", "btn-espejo"].map($);
  botones.forEach(b => b.disabled = true);
  $("cam-nombre").style.visibility = "hidden";

  const cuenta = $("cuenta");
  for (let n = SEGUNDOS_CUENTA; n > 0; n--){
    cuenta.textContent = n;
    await esperar(1000);
  }
  cuenta.textContent = "";

  $("flash").classList.remove("go");
  void $("flash").offsetWidth;
  $("flash").classList.add("go");

  capturar();
  $("foto-resultado").src = fotoDataUrl;
  mostrar("s-resultado");

  botones.forEach(b => b.disabled = false);
  $("cam-nombre").style.visibility = "visible";
  ocupado = false;
}

function capturar(){
  const W = lienzo.width, H = lienzo.height;
  const vw = video.videoWidth || 1920, vh = video.videoHeight || 1080;

  // encuadre tipo "cover" (llena el 16:9 sin deformar)
  const escala = Math.max(W / vw, H / vh);
  const dw = vw * escala, dh = vh * escala;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  if (espejo){ ctx.translate(W, 0); ctx.scale(-1, 1); }   // misma orientación que la vista previa
  ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();

  // el marco se encuadra igual que en la vista previa (cover), así nunca se deforma
  const mw = marcoImg.naturalWidth || W, mh = marcoImg.naturalHeight || H;
  const me = Math.max(W / mw, H / mh);
  ctx.drawImage(marcoImg, (W - mw * me) / 2, (H - mh * me) / 2, mw * me, mh * me);

  // JPEG de alta calidad; si pesa demasiado, baja la calidad de a poco hasta que quepa
  let calidad = CALIDAD_INICIAL;
  fotoDataUrl = lienzo.toDataURL("image/jpeg", calidad);
  while (fotoDataUrl.length > MAX_CARACTERES_FOTO && calidad > 0.45){
    calidad -= 0.04;
    fotoDataUrl = lienzo.toDataURL("image/jpeg", calidad);
  }
}

/* ============================================================
   4. GUARDAR Y MOSTRAR QR
   ============================================================ */
function idAleatorio(){
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

async function guardarYMostrarQR(){
  if (ocupado || !fotoDataUrl) return;
  ocupado = true;
  $("btn-listo").disabled = true;
  $("btn-repetir").disabled = true;
  $("btn-listo").textContent = "Guardando…";

  const id = idAleatorio();
  try{
    await setDoc(doc(db, COLECCION_FOTOS, id), {
      imagen: fotoDataUrl,
      marco: marcoActual ? marcoActual.nombre : "",
      creado: serverTimestamp()
    });

    const url = new URL("ver.html?id=" + id, location.href).href;
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("qr-caja").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });

    $("foto-final").src = fotoDataUrl;
    mostrar("s-qr");

    // la cámara se queda encendida para que la siguiente persona no espere;
    // se apaga sola si pasan 3 minutos sin usarse
    programarApagadoCamara();
    clearTimeout(temporizadorQR);
    temporizadorQR = setTimeout(reiniciar, SEGUNDOS_REINICIO_QR * 1000);
  }catch(err){
    console.error("No se pudo guardar la foto:", err);
    mensaje("No pudimos guardar tu foto",
      "Revisa la conexión a internet e inténtalo de nuevo. Tu foto sigue aquí.",
      "Reintentar", () => { mostrar("s-resultado"); });
  }finally{
    $("btn-listo").disabled = false;
    $("btn-repetir").disabled = false;
    $("btn-listo").textContent = "✓ ¡LISTO!";
    ocupado = false;
  }
}

function reiniciar(){
  clearTimeout(temporizadorQR);
  fotoDataUrl = null;
  $("foto-resultado").removeAttribute("src");
  $("foto-final").removeAttribute("src");
  $("qr-caja").innerHTML = "";
  programarApagadoCamara();
  mostrar("s-marcos");
}

/* ============================================================
   EVENTOS
   ============================================================ */
$("btn-foto").addEventListener("click", tomarFoto);
$("btn-cambiar-marco").addEventListener("click", () => { programarApagadoCamara(); mostrar("s-marcos"); });
$("btn-camara").addEventListener("click", cambiarCamara);
$("btn-espejo").addEventListener("click", alternarEspejo);
$("btn-repetir").addEventListener("click", async () => {
  try{ await iniciarCamara(); }catch(e){ console.error(e); }
  mostrar("s-camara");
});
$("btn-listo").addEventListener("click", guardarYMostrarQR);
$("btn-nueva").addEventListener("click", reiniciar);

// pantalla completa (útil para la pantalla del foro; Safari en iPhone no la soporta)
const btnPantalla = $("btn-pantalla");
if (!document.documentElement.requestFullscreen){
  btnPantalla.style.display = "none";
} else {
  btnPantalla.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
}

construirMarcos();
