// ============================================================
//  SEGMENTACIÓN: separa a la persona del fondo (MediaPipe)
//  Si no carga (sin internet, firewall), regresa null y el
//  motor usa una máscara ovalada de respaldo.
// ============================================================

const VERSION = "0.10.14";
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELO =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let segmentador = null;
let promesa = null;

export function prepararSegmentacion() {
  if (!promesa) promesa = cargar();
  return promesa;
}

async function cargar() {
  try {
    const { FilesetResolver, ImageSegmenter } = await import(`${BASE}/vision_bundle.mjs`);
    const vision = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    for (const delegate of ["GPU", "CPU"]) {
      try {
        segmentador = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODELO, delegate },
          runningMode: "IMAGE",
          outputCategoryMask: false,
          outputConfidenceMasks: true
        });
        return true;
      } catch (e) {
        console.warn(`Segmentación con ${delegate} no disponible`, e);
      }
    }
  } catch (e) {
    console.warn("No se pudo cargar MediaPipe; se usará máscara ovalada.", e);
  }
  return false;
}

// Regresa Float32Array (0..1, 1 = persona) del tamaño del canvas, o null.
export async function mascaraPersona(canvas) {
  await prepararSegmentacion();
  if (!segmentador) return null;
  try {
    const w = canvas.width, h = canvas.height;
    const res = segmentador.segment(canvas);
    const mascaras = res.confidenceMasks || [];
    const m = mascaras.length > 1 ? mascaras[1] : mascaras[0];
    if (!m) return null;
    let arr = m.getAsFloat32Array().slice();
    mascaras.forEach((x) => { try { x.close(); } catch {} });
    try { res.close?.(); } catch {}
    if (arr.length !== w * h) return null;

    // Verificación: el centro debe ser "persona" más que las esquinas.
    const centro = arr[Math.floor(h / 2) * w + Math.floor(w / 2)];
    const esquinas = (arr[0] + arr[w - 1] + arr[(h - 1) * w] + arr[h * w - 1]) / 4;
    if (centro < esquinas) arr = arr.map((v) => 1 - v);
    return arr;
  } catch (e) {
    console.warn("Error al segmentar", e);
    return null;
  }
}
