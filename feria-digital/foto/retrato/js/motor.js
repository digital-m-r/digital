// ============================================================
//  MOTOR: foto (canvas o imagen) -> retrato en trazos SVG
// ============================================================
import { CONFIG } from "./config.js";
import { aGris, mascaraOvalo, desenfocar, estirarContraste, canny, sombreado, binarizar, adelgazar, distanciaTinta } from "./procesar.js";
import { trazar, rdp, chaikin, ordenar, aD } from "./trazos.js";
import { mascaraPersona } from "./segmentacion.js";

const LIMITE_BYTES = 700_000; // Firestore permite 1 MB por documento

export async function fotoARetrato(fuente, opciones = {}) {
  const base = { ...CONFIG.RETRATO, ...opciones };
  const N = base.resolucion;
  const t0 = performance.now();

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(fuente, 0, 0, N, N);
  const img = ctx.getImageData(0, 0, N, N);

  let mascara = opciones.usarSegmentacion === false ? null : await mascaraPersona(canvas);
  const conMascara = !!mascara;
  mascara = conMascara ? desenfocar(mascara, N, N, 1) : mascaraOvalo(N, N);

  // Gris + contraste + fondo blanco
  let gris = estirarContraste(aGris(img.data, N * N), mascara);
  for (let i = 0; i < gris.length; i++) gris[i] = mascara[i] * gris[i] + (1 - mascara[i]) * 255;

  // Si el resultado pesa demasiado, se reintenta con menos detalle
  let op = { ...base };
  let resultado;
  for (let intento = 0; intento < 3; intento++) {
    resultado = generar(gris, mascara, N, op);
    if (resultado.bytes <= LIMITE_BYTES) break;
    op = { ...op, detalle: op.detalle * 0.7, minLargo: op.minLargo * 1.5, simplificacion: op.simplificacion * 1.4 };
  }

  return {
    ancho: N,
    alto: N,
    trazos: resultado.trazos,
    conMascara,
    stats: {
      contornos: resultado.nContornos,
      sombras: resultado.nSombras,
      kb: Math.round(resultado.bytes / 1024),
      ms: Math.round(performance.now() - t0)
    }
  };
}

function generar(gris, mascara, N, op) {
  const suave = desenfocar(gris, N, N, op.pasadasDesenfoque);
  const bordes = canny(suave, N, N, mascara, op.detalle);

  let contornos = trazar(bordes, N, N, Math.round(op.minLargo)).map((p) => rdp(p, op.simplificacion));
  contornos = ordenar(contornos, N / 2, 0);

  let sombras = op.sombras ? sombreado(suave, mascara, N, N, op) : [];
  const ultimo = contornos.length ? contornos[contornos.length - 1].at(-1) : [0, 0];
  sombras = ordenar(sombras, ultimo[0], ultimo[1]);

  // Primero el contorno (como lo haría un artista) y al final las sombras
  const trazos = [...contornos.map((p) => aD(chaikin(p))), ...sombras.map((p) => aD(p))];
  const bytes = trazos.reduce((s, d) => s + d.length + 3, 0);
  return { trazos, bytes, nContornos: contornos.length, nSombras: sombras.length };
}

// Imagen que YA es dibujo lineal (p. ej. generada con Gemini) -> trazos.
// No detecta bordes: adelgaza cada línea a su centro, mide su grosor y la recorre.
export function dibujoLinealARetrato(fuente, opciones = {}) {
  const { resolucion, umbral, minLargo, simplificacion, rellenoMin } = { ...CONFIG.LINEAL, ...opciones };
  const N = resolucion;
  const t0 = performance.now();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, N, N);
  const fw = fuente.naturalWidth || fuente.width, fh = fuente.naturalHeight || fuente.height;
  const k = Math.min(N / fw, N / fh);
  ctx.drawImage(fuente, (N - fw * k) / 2, (N - fh * k) / 2, fw * k, fh * k);

  const g = aGris(ctx.getImageData(0, 0, N, N).data, N * N);
  const tinta = binarizar(g, umbral);
  const dist = distanciaTinta(tinta, N, N);
  const esqueleto = adelgazar(tinta, N, N);

  // Zonas rellenas (pupilas, cejas gruesas): donde la tinta es más gruesa que una línea normal
  const relleno = new Uint8Array(N * N);
  const R = rellenoMin * (N / 800);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = dist[y * N + x];
    if (r < R) continue;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N || dx * dx + dy * dy > (r + 0.5) ** 2) continue;
      const j = yy * N + xx;
      if (tinta[j]) relleno[j] = 1;
    }
  }
  for (let i = 0; i < relleno.length; i++) if (relleno[i]) esqueleto[i] = 0;

  let lineas = [];
  // Relleno con trazos horizontales apretados (como un plumón coloreando)
  const paso = 2;
  for (let y = 0; y < N; y += paso) {
    let x0 = -1;
    for (let x = 0; x <= N; x++) {
      const dentro = x < N && relleno[y * N + x];
      if (dentro && x0 < 0) x0 = x;
      if (!dentro && x0 >= 0) {
        const q = x - 1 > x0 ? [[x0, y], [x - 1, y]] : [[x0, y]];
        q.ancho = paso + 1;
        lineas.push(q);
        x0 = -1;
      }
    }
  }

  for (const p of trazar(esqueleto, N, N, 1)) {
    // Grosor = promedio de 2·d − 1 a lo largo del trazo
    let s = 0;
    for (const [x, y] of p) s += Math.max(1, 2 * dist[y * N + x] - 1);
    const ancho = s / p.length;
    // Se descartan rayitas sueltas, pero NO los puntos gruesos (pupilas)
    if (p.length < minLargo && ancho < 3) continue;
    const q = rdp(p, simplificacion);
    q.ancho = Math.round(ancho * 10) / 10;
    lineas.push(q);
  }
  lineas = ordenar(lineas, N / 2, 0);
  const trazos = lineas.map((p) => aD(p.length > 2 ? chaikin(p) : p));
  const grosores = lineas.map((p) => p.ancho);
  const bytes = trazos.reduce((s, d) => s + d.length + 3, 0) + grosores.length * 4;
  return {
    ancho: N, alto: N, trazos, grosores, conMascara: false,
    stats: { contornos: lineas.length, sombras: 0, kb: Math.round(bytes / 1024), ms: Math.round(performance.now() - t0) }
  };
}
