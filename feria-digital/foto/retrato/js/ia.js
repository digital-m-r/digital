// ============================================================
//  IA: manda la foto al Apps Script, que llama a Gemini y
//  regresa la caricatura en dibujo lineal.
// ============================================================
import { GEMINI } from "./config.js";

export const iaConfigurada = () => !!GEMINI.URL_APPS_SCRIPT;

// canvas con la foto -> HTMLImageElement con el dibujo lineal
export async function generarDibujo(canvasFoto) {
  if (!iaConfigurada()) throw new Error("La IA no está configurada (falta URL_APPS_SCRIPT en config.js).");
  const foto = canvasFoto.toDataURL("image/jpeg", 0.85).split(",")[1];

  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), GEMINI.SEGUNDOS_ESPERA * 1000);
  let datos;
  try {
    // Sin encabezados = "text/plain": evita el bloqueo CORS de Apps Script
    const res = await fetch(GEMINI.URL_APPS_SCRIPT, {
      method: "POST",
      body: JSON.stringify({ clave: GEMINI.CLAVE, foto }),
      signal: control.signal
    });
    datos = await res.json();
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "La IA tardó demasiado en responder." : "No se pudo conectar con la IA.");
  } finally {
    clearTimeout(limite);
  }
  if (!datos.ok) throw new Error(datos.error || "La IA no regresó una imagen.");

  const img = new Image();
  img.src = `data:${datos.mime || "image/png"};base64,${datos.imagen}`;
  await img.decode();
  return img;
}
