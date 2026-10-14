// ============================================================
//  PROCESAMIENTO DE IMAGEN: de foto a bordes y sombras
//  Funciones puras: reciben arreglos y regresan arreglos (sin DOM).
// ============================================================

export function aGris(rgba, n) {
  const g = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  }
  return g;
}

export function percentil(valores, p) {
  if (!valores.length) return 0;
  const copia = Float32Array.from(valores).sort();
  const i = Math.min(copia.length - 1, Math.max(0, Math.floor(p * (copia.length - 1))));
  return copia[i];
}

function suave(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Máscara de respaldo cuando no carga la segmentación: un óvalo centrado.
export function mascaraOvalo(w, h) {
  const m = new Float32Array(w * h);
  const cx = w * 0.5, cy = h * 0.5, rx = w * 0.4, ry = h * 0.48;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      m[y * w + x] = 1 - suave(0.7, 1.05, d);
    }
  }
  return m;
}

// Desenfoque gaussiano separable (kernel 1-4-6-4-1).
export function desenfocar(src, w, h, pasadas = 1) {
  const k = [1, 4, 6, 4, 1];
  let a = src;
  for (let p = 0; p < pasadas; p++) {
    const t = new Float32Array(w * h);
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const f = y * w;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let j = -2; j <= 2; j++) {
          const xx = Math.min(w - 1, Math.max(0, x + j));
          s += a[f + xx] * k[j + 2];
        }
        t[f + x] = s / 16;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let j = -2; j <= 2; j++) {
          const yy = Math.min(h - 1, Math.max(0, y + j));
          s += t[yy * w + x] * k[j + 2];
        }
        o[y * w + x] = s / 16;
      }
    }
    a = o;
  }
  return a;
}

// Normaliza el contraste usando solo los píxeles de la persona.
export function estirarContraste(g, m) {
  const muestra = [];
  for (let i = 0; i < g.length; i += 3) if (m[i] > 0.5) muestra.push(g[i]);
  const base = muestra.length > 200 ? muestra : Array.from(g);
  const lo = percentil(base, 0.02);
  const hi = percentil(base, 0.98);
  const r = Math.max(1, hi - lo);
  const out = new Float32Array(g.length);
  for (let i = 0; i < g.length; i++) {
    out[i] = Math.min(255, Math.max(0, ((g[i] - lo) / r) * 255));
  }
  return out;
}

// Detector de bordes Canny. "detalle" = fracción de bordes fuertes.
export function canny(g, w, h, m, detalle = 0.22) {
  const n = w * h;
  const mag = new Float32Array(n);
  const dir = new Uint8Array(n);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = g[i - w - 1], tc = g[i - w], tr = g[i - w + 1];
      const ml = g[i - 1], mr = g[i + 1];
      const bl = g[i + w - 1], bc = g[i + w], br = g[i + w + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      mag[i] = Math.hypot(gx, gy);
      let a = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (a < 0) a += 180;
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
  }

  // Supresión de no-máximos
  const nms = new Float32Array(n);
  const candidatos = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = mag[i];
      if (v < 4) continue;
      let a, b;
      switch (dir[i]) {
        case 0: a = mag[i - 1]; b = mag[i + 1]; break;
        case 1: a = mag[i - w - 1]; b = mag[i + w + 1]; break;
        case 2: a = mag[i - w]; b = mag[i + w]; break;
        default: a = mag[i - w + 1]; b = mag[i + w - 1];
      }
      if (v >= a && v >= b) {
        nms[i] = v;
        if (m[i] > 0.3) candidatos.push(v);
      }
    }
  }

  // Umbral doble con histéresis
  const alto = Math.max(24, percentil(candidatos, 1 - detalle));
  const bajo = alto * 0.5;
  const out = new Uint8Array(n);
  const pila = [];
  for (let i = 0; i < n; i++) {
    if (nms[i] >= alto && alto > 0 && m[i] > 0.15) { out[i] = 1; pila.push(i); }
  }
  const vec = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
  while (pila.length) {
    const i = pila.pop();
    for (const d of vec) {
      const j = i + d;
      if (j >= 0 && j < n && !out[j] && nms[j] >= bajo && m[j] > 0.15) {
        out[j] = 1;
        pila.push(j);
      }
    }
  }
  return out;
}

// Achurado diagonal en las zonas más oscuras (cabello, cejas, ojos).
export function sombreado(g, m, w, h, op = {}) {
  const { umbralSombra = 0.16, espacioSombra = 6, sombraCruzada = true } = op;
  const vals = [];
  for (let i = 0; i < g.length; i += 2) if (m[i] > 0.6) vals.push(g[i]);
  if (vals.length < 200) return [];
  const t1 = percentil(vals, umbralSombra);
  const t2 = percentil(vals, umbralSombra * 0.45);
  const lineas = [];

  const pasar = (sentido, umbral, espacio, desfase) => {
    for (let c = -h + desfase; c < w + h; c += espacio) {
      let inicio = null, ultimo = null, hueco = 0;
      const cerrar = () => {
        if (inicio && ultimo[1] - inicio[1] >= 4) lineas.push([inicio, ultimo]);
        inicio = null; ultimo = null; hueco = 0;
      };
      for (let y = 0; y < h; y++) {
        const x = c + sentido * y;
        const dentro = x >= 0 && x < w;
        const i = y * w + x;
        const oscuro = dentro && g[i] < umbral && m[i] > 0.6;
        if (oscuro) {
          if (!inicio) inicio = [x, y];
          ultimo = [x, y];
          hueco = 0;
        } else if (inicio) {
          hueco++;
          if (hueco > 2) cerrar();
        }
      }
      cerrar();
    }
  };

  pasar(1, t1, espacioSombra, 0);
  if (sombraCruzada) pasar(-1, t2, espacioSombra, Math.floor(espacioSombra / 2));
  return lineas;
}

// ============================================================
//  MODO DIBUJO LINEAL (imagen ya en línea negra, p. ej. de Gemini)
// ============================================================

// 1 = tinta, 0 = papel
export function binarizar(g, umbral = 150) {
  const b = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) b[i] = g[i] < umbral ? 1 : 0;
  return b;
}

// Adelgazamiento Zhang-Suen: deja cada línea de 1 px (su centro)
export function adelgazar(b, w, h) {
  const img = b.slice();
  const borrar = [];
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (let paso = 0; paso < 2; paso++) {
      borrar.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!img[i]) continue;
          const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1];
          const p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) +
                    (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (paso === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          borrar.push(i);
        }
      }
      if (borrar.length) cambio = true;
      for (const i of borrar) img[i] = 0;
    }
  }
  return img;
}

// Distancia (en px) de cada píxel de tinta al papel más cercano.
// Sirve para medir el grosor de cada línea: grosor ≈ 2·d − 1.
export function distanciaTinta(b, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = b[i] ? INF : 0;
  const A = 1, D = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + A);
    if (y > 0) {
      v = Math.min(v, d[i - w] + A);
      if (x > 0) v = Math.min(v, d[i - w - 1] + D);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + D);
    } else v = Math.min(v, 1);
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!d[i]) continue;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + A);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + A);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + D);
      if (x > 0) v = Math.min(v, d[i + w - 1] + D);
    } else v = Math.min(v, 1);
    d[i] = v;
  }
  return d;
}
