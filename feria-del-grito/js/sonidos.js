// Todo el audio del juego se genera con osciladores del navegador (Web Audio
// API) — no depende de archivos .mp3 externos, así que funciona de inmediato
// sin subir nada extra, en cuanto el anfitrión interactúa una vez con la
// página (requisito normal de los navegadores para permitir audio).

let ctx = null;
let silenciado = false;

function obtenerContexto() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setSilenciado(valor) {
  silenciado = valor;
  if (silenciado) detenerMusicaCarrera();
}
export function estaSilenciado() { return silenciado; }

function tono(freq, duracion, tipo = "sine", volumenInicial = 0.25, retardo = 0) {
  if (silenciado) return;
  try {
    const c = obtenerContexto();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, c.currentTime + retardo);
    gain.gain.setValueAtTime(volumenInicial, c.currentTime + retardo);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + retardo + duracion);
    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime + retardo);
    osc.stop(c.currentTime + retardo + duracion + 0.03);
  } catch (e) { /* audio no disponible en este navegador, se ignora */ }
}

// Pequeño arpegio ascendente y alegre — "acertaste"
export function sonarAcierto() {
  tono(523.25, 0.14, "triangle", 0.3, 0);
  tono(659.25, 0.14, "triangle", 0.3, 0.1);
  tono(783.99, 0.22, "triangle", 0.32, 0.2);
}

// Zumbido grave y corto — "fallaste"
export function sonarError() {
  tono(180, 0.28, "sawtooth", 0.22, 0);
  tono(140, 0.32, "sawtooth", 0.2, 0.1);
}

// Fanfarria corta para cuando se anuncia el ganador
export function sonarVictoriaCorta() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tono(f, 0.32, "triangle", 0.3, i * 0.14);
  });
  tono(1046.5, 0.7, "triangle", 0.34, 0.62);
}

// "Galope" repetitivo (da-da-DUM, como cascos de caballo) mientras avanzan
let intervaloGalope = null;
export function iniciarMusicaCarrera() {
  detenerMusicaCarrera();
  if (silenciado) return;
  let paso = 0;
  intervaloGalope = setInterval(() => {
    const t = paso % 3;
    if (t === 0 || t === 1) tono(95, 0.08, "square", 0.16, 0);
    else tono(70, 0.15, "square", 0.2, 0);
    paso++;
  }, 150);
}
export function detenerMusicaCarrera() {
  if (intervaloGalope) { clearInterval(intervaloGalope); intervaloGalope = null; }
}
