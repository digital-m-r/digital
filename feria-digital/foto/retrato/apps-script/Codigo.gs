/**
 * ============================================================
 *  RETRATO DIBUJADO · Puente seguro hacia Gemini
 *  Foro Digital & Innovación BMM 2026
 *
 *  La web manda la foto aquí; este script la envía a Gemini con
 *  el prompt fijo y regresa la caricatura en dibujo lineal.
 *  La API key vive SOLO aquí (Propiedades del script), nunca
 *  en el navegador.
 * ============================================================
 */

// Debe ser igual a GEMINI.CLAVE en js/config.js
const CLAVE_COMPARTIDA = 'foro-bmm-2026';

// Modelo de imagen. Opciones:
//  'gemini-2.5-flash-image'          → el más económico
//  'gemini-3.1-flash-image-preview'  → mejor calidad, un poco más caro
const MODELO = 'gemini-2.5-flash-image';

// Máximo de imágenes por día (protege tu presupuesto)
const LIMITE_DIARIO = 400;

const PROMPT = [
  'Convierte a esta persona en una caricatura de dibujo lineal estilo libro para colorear:',
  'solo líneas negras gruesas, limpias y continuas sobre fondo blanco,',
  'solo blanco y negro, sin ningún color, sin sombras, sin grises ni rellenos (excepto pupilas y cejas).',
  'Conserva fielmente la forma de cara, cejas y sonrisa de la persona, con la cabeza un poco más grande, sonriente.',
  'Medio cuerpo, con bata blanca de trabajo y cofia, sosteniendo con ambas manos frente al pecho',
  'una lata redonda con el texto "NIVEA Creme".',
  'Detrás, una banda transportadora sencilla de línea de producción con algunas latas y botellas SIN texto.',
  'Pocos elementos de fondo, líneas simples. Formato cuadrado.'
].join(' ');

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);
    if (datos.clave !== CLAVE_COMPARTIDA) return responder({ ok: false, error: 'Clave inválida.' });
    if (!datos.foto) return responder({ ok: false, error: 'No llegó la foto.' });

    // Límite diario
    const props = PropertiesService.getScriptProperties();
    const hoy = Utilities.formatDate(new Date(), 'America/Monterrey', 'yyyy-MM-dd');
    const llave = 'conteo_' + hoy;
    const conteo = Number(props.getProperty(llave) || 0);
    if (conteo >= LIMITE_DIARIO) return responder({ ok: false, error: 'Se alcanzó el límite diario de imágenes.' });

    const apiKey = props.getProperty('GEMINI_API_KEY');
    if (!apiKey) return responder({ ok: false, error: 'Falta GEMINI_API_KEY en las propiedades del script.' });

    const cuerpo = {
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: 'image/jpeg', data: datos.foto } }
        ]
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '1:1' }
      }
    };

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODELO + ':generateContent';
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true
    });

    const codigo = res.getResponseCode();
    const json = JSON.parse(res.getContentText());
    if (codigo !== 200) {
      console.error('Gemini respondió ' + codigo, res.getContentText());
      return responder({ ok: false, error: 'Gemini respondió con error ' + codigo + ': ' + ((json.error && json.error.message) || '') });
    }

    const partes = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
    const parteImagen = partes.find(function (p) { return p.inlineData || p.inline_data; });
    if (!parteImagen) return responder({ ok: false, error: 'Gemini no regresó imagen (posible filtro de seguridad). Intenta otra foto.' });

    const img = parteImagen.inlineData || parteImagen.inline_data;
    props.setProperty(llave, String(conteo + 1));
    return responder({ ok: true, imagen: img.data, mime: img.mimeType || img.mime_type || 'image/png' });

  } catch (err) {
    console.error(err);
    return responder({ ok: false, error: 'Error en Apps Script: ' + err.message });
  }
}

// Para comprobar que el despliegue funciona: abre la URL en el navegador
function doGet() {
  const props = PropertiesService.getScriptProperties();
  const hoy = Utilities.formatDate(new Date(), 'America/Monterrey', 'yyyy-MM-dd');
  return responder({
    ok: true,
    mensaje: 'Puente de Retrato Dibujado activo',
    modelo: MODELO,
    apiKeyConfigurada: !!props.getProperty('GEMINI_API_KEY'),
    imagenesHoy: Number(props.getProperty('conteo_' + hoy) || 0),
    limiteDiario: LIMITE_DIARIO
  });
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Ejecuta esta función UNA vez desde el editor para probar la API key sin la web.
function probarConexion() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELO, {
    headers: { 'x-goog-api-key': apiKey }, muteHttpExceptions: true
  });
  console.log(res.getResponseCode(), res.getContentText().slice(0, 300));
}
