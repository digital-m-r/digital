// ============================================================
//  DIBUJO: crea el SVG, lo anima trazo por trazo y exporta PNG
// ============================================================
import { CONFIG } from "./config.js";

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Lápiz con la punta en (0,0), cuerpo hacia arriba-derecha
function crearLapiz(escala) {
  const u = [0.6, -0.8], v = [0.8, 0.6];
  const P = (a, b) => `${(u[0] * a + v[0] * b) * escala},${(u[1] * a + v[1] * b) * escala}`;
  const g = el("g", { class: "lapiz" });
  g.append(
    el("polygon", { points: [P(0, 0), P(14, -6), P(14, 6)].join(" "), fill: "#F3D9B1", stroke: "#0B2A6F", "stroke-width": 0.8 * escala }),
    el("polygon", { points: [P(0, 0), P(5, -2.2), P(5, 2.2)].join(" "), fill: "#0B2A6F" }),
    el("polygon", { points: [P(14, -6), P(70, -6), P(70, 6), P(14, 6)].join(" "), fill: "#1F5FD6", stroke: "#0B2A6F", "stroke-width": 0.8 * escala }),
    el("polygon", { points: [P(70, -6), P(80, -6), P(80, 6), P(70, 6)].join(" "), fill: "#FFFFFF", stroke: "#0B2A6F", "stroke-width": 0.8 * escala })
  );
  g.style.display = "none";
  return g;
}

export function crearSVG(retrato, { color = CONFIG.ANIMACION.color, grosor = CONFIG.ANIMACION.grosor, lapiz = true } = {}) {
  const svg = el("svg", { viewBox: `0 0 ${retrato.ancho} ${retrato.alto}`, class: "retrato-svg", role: "img", "aria-label": "Retrato dibujado" });
  const g = el("g", { class: "trazos", fill: "none", stroke: color, "stroke-width": grosor, "stroke-linecap": "round", "stroke-linejoin": "round" });
  retrato.trazos.forEach((d, i) => {
    const path = el("path", { d });
    if (retrato.grosores?.[i]) path.setAttribute("stroke-width", retrato.grosores[i]);
    g.append(path);
  });
  svg.append(g);
  if (lapiz) svg.append(crearLapiz(retrato.ancho / 480));
  return svg;
}

// Anima los trazos en orden. Regresa { promesa, cancelar }.
export function animar(svg, { duracion, alProgreso } = {}) {
  const paths = [...svg.querySelectorAll(".trazos path")];
  const lens = paths.map((p) => p.getTotalLength());
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const A = CONFIG.ANIMACION;
  const ms = duracion ?? Math.min(A.maxSegundos, Math.max(A.minSegundos, total / A.pxPorSegundo)) * 1000;
  const lapiz = svg.querySelector(".lapiz");

  paths.forEach((p, i) => {
    p.style.strokeDasharray = `${lens[i]} ${lens[i] + 1}`;
    p.style.strokeDashoffset = lens[i];
  });
  if (lapiz) lapiz.style.display = "";

  let idx = 0, acumulado = 0, raf = 0, cancelado = false, resolver;
  const promesa = new Promise((r) => (resolver = r));
  const inicio = performance.now();

  const terminar = () => {
    paths.forEach((p) => (p.style.strokeDashoffset = 0));
    if (lapiz) lapiz.style.display = "none";
    alProgreso?.(1);
    resolver(!cancelado);
  };

  const paso = (ahora) => {
    if (cancelado) return;
    const t = Math.min(1, (ahora - inicio) / ms);
    const d = total * t;
    while (idx < paths.length && acumulado + lens[idx] <= d) {
      paths[idx].style.strokeDashoffset = 0;
      acumulado += lens[idx];
      idx++;
    }
    if (idx < paths.length) {
      const parcial = d - acumulado;
      paths[idx].style.strokeDashoffset = lens[idx] - parcial;
      if (lapiz) {
        const pt = paths[idx].getPointAtLength(parcial);
        lapiz.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
      }
    }
    alProgreso?.(t);
    if (t < 1) raf = requestAnimationFrame(paso);
    else terminar();
  };
  raf = requestAnimationFrame(paso);

  return {
    promesa,
    cancelar() { cancelado = true; cancelAnimationFrame(raf); resolver(false); }
  };
}

function cargarImagen(src) {
  return new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
  });
}

// Composición final 1080x1350 con marco del Foro -> Blob PNG
export async function aPNG(retrato, { nombre = "" } = {}) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  try { await document.fonts?.ready; } catch {}

  const tinta = "#0B2A6F", azul = "#1F5FD6";
  ctx.fillStyle = tinta; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(28, 28, W - 56, H - 56);

  ctx.fillStyle = tinta;
  ctx.textAlign = "center";
  ctx.font = '700 44px "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(CONFIG.EVENTO_TITULO, W / 2, 112);
  ctx.fillStyle = azul; ctx.fillRect(W / 2 - 60, 136, 120, 5);

  // Retrato
  const lado = 880, ox = (W - lado) / 2, oy = 172;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(lado / retrato.ancho, lado / retrato.alto);
  ctx.strokeStyle = CONFIG.ANIMACION.color;
  ctx.lineWidth = CONFIG.ANIMACION.grosor;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  retrato.trazos.forEach((d, i) => {
    ctx.lineWidth = retrato.grosores?.[i] ?? CONFIG.ANIMACION.grosor;
    ctx.stroke(new Path2D(d));
  });
  ctx.restore();

  ctx.fillStyle = tinta;
  if (nombre) {
    ctx.font = '600 46px "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(nombre, W / 2, 1150);
  }
  ctx.font = '400 28px "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`Dibujado en vivo · ${CONFIG.EVENTO_FECHA}`, W / 2, nombre ? 1206 : 1170);

  const marco = await cargarImagen(CONFIG.MARCO_RETRATO_PNG);
  if (marco) ctx.drawImage(marco, 0, 0, W, H);

  return new Promise((ok) => c.toBlob(ok, "image/png"));
}

// Trazo decorativo para la pantalla de espera
export function trazoDeEspera(n = 480) {
  const pts = [];
  const a = 3 + Math.floor(Math.random() * 3), b = a + 1 + Math.floor(Math.random() * 2);
  const fase = Math.random() * Math.PI;
  for (let t = 0; t <= Math.PI * 2 + 0.001; t += 0.01) {
    pts.push([n / 2 + n * 0.38 * Math.sin(a * t + fase), n / 2 + n * 0.38 * Math.sin(b * t)]);
  }
  const d = "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L");
  return { ancho: n, alto: n, trazos: [d] };
}
