import { db, doc, setDoc, serverTimestamp, COLECCION_FOTOS } from "./firebase-foto.js";

/* ============================================================
   MARCOS — para cambiarlos por los de Canva, reemplaza los PNG
   de la carpeta marcos/ (mismo nombre) o edita esta lista.
   Formato: PNG 1920x1080 con el centro transparente.
   ============================================================ */
const MARCOS = [
  { src: "marcos/marco1.png", nombre: "Marco 1" },
  { src: "marcos/marco2.png", nombre: "Marco 2" },
  { src: "marcos/marco3.png", nombre: "Marco 3" },
  { src: "marcos/marco4.png", nombre: "Marco 4" },
  { src: "marcos/marco5.png", nombre: "Marco 5" },
  { src: "marcos/marco6.png", nombre: "Marco 6" },
];

const SEGUNDOS_CUENTA = 3;
const SEGUNDOS_REINICIO_QR = 90;   // vuelve solo a la pantalla de inicio
const MAX_CARACTERES_FOTO = 700000; // límite seguro para un documento de Firestore

/* ---------- referencias ---------- */
const $ = id => document.getElementById(id);
const pantallas = ["s-marcos", "s-camara", "s-resultado", "s-qr", "s-mensaje"];
const video = $("video");
const lienzo = $("lienzo");
const ctx = lienzo.getContext("2d");

let marcoActual = null;       // objeto de MARCOS
let marcoImg = null;          // <img> ya cargada
let stream = null;
let fotoDataUrl = null;
let temporizadorQR = null;
let ocupado = false;

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
   1. GRID DE MARCOS
   ============================================================ */
function construirMarcos(){
  const grid = $("grid-marcos");
  grid.innerHTML = "";
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
async function iniciarCamara(){
  if (stream) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    throw new Error("sin-soporte");
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
    audio: false
  });
  video.srcObject = stream;
  await video.play().catch(() => {});
}

function detenerCamara(){
  if (stream){
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
}

async function elegirMarco(m){
  if (ocupado) return;
  ocupado = true;
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
        "Conecta una cámara web o revisa que ninguna otra aplicación la esté usando.",
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
  $("btn-foto").disabled = true;
  $("btn-cambiar-marco").disabled = true;

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

  $("btn-foto").disabled = false;
  $("btn-cambiar-marco").disabled = false;
  ocupado = false;
}

function capturar(){
  const W = lienzo.width, H = lienzo.height;
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;

  // encuadre tipo "cover" (llena el 16:9 sin deformar)
  const escala = Math.max(W / vw, H / vh);
  const dw = vw * escala, dh = vh * escala;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1); // espejo, igual que la vista previa
  ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();

  // el marco se encuadra igual que en la vista previa (cover), así nunca se deforma
  const mw = marcoImg.naturalWidth || W, mh = marcoImg.naturalHeight || H;
  const me = Math.max(W / mw, H / mh);
  ctx.drawImage(marcoImg, (W - mw * me) / 2, (H - mh * me) / 2, mw * me, mh * me);

  // JPEG comprimido; si pesa mucho, baja la calidad hasta que quepa
  let calidad = 0.88;
  fotoDataUrl = lienzo.toDataURL("image/jpeg", calidad);
  while (fotoDataUrl.length > MAX_CARACTERES_FOTO && calidad > 0.4){
    calidad -= 0.08;
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
    detenerCamara(); // libera la cámara mientras se muestra el QR

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
  mostrar("s-marcos");
}

/* ============================================================
   EVENTOS
   ============================================================ */
$("btn-foto").addEventListener("click", tomarFoto);
$("btn-cambiar-marco").addEventListener("click", () => { detenerCamara(); mostrar("s-marcos"); });
$("btn-repetir").addEventListener("click", async () => {
  try{ await iniciarCamara(); }catch(e){ console.error(e); }
  mostrar("s-camara");
});
$("btn-listo").addEventListener("click", guardarYMostrarQR);
$("btn-nueva").addEventListener("click", reiniciar);

construirMarcos();
