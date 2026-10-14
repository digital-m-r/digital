// ============================================================
//  CÁMARA: iniciar, capturar recorte cuadrado y detener
// ============================================================

export async function iniciarCamara(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no permite usar la cámara. Abre la página con https o en localhost.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  video.srcObject = stream;
  video.setAttribute("playsinline", "");
  video.muted = true;
  await video.play();
  return stream;
}

// Recorta el centro del video en un cuadrado. "espejo" = igual que la vista previa.
export function capturarCuadrado(video, tam = 720, espejo = true) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const lado = Math.min(vw, vh);
  const sx = (vw - lado) / 2, sy = (vh - lado) / 2;
  const c = document.createElement("canvas");
  c.width = c.height = tam;
  const ctx = c.getContext("2d");
  if (espejo) { ctx.translate(tam, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, sx, sy, lado, lado, 0, 0, tam, tam);
  return c;
}

export function detenerCamara(video) {
  const s = video.srcObject;
  if (s) s.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
