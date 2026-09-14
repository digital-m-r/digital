// Confeti sencillo dibujado en un <canvas>, sin librerías externas.
export function lanzarConfeti(contenedor, duracionMs = 4000) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute; inset:0; pointer-events:none; z-index:5;";
  contenedor.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  function ajustarTamano() {
    canvas.width = contenedor.clientWidth;
    canvas.height = contenedor.clientHeight;
  }
  ajustarTamano();
  window.addEventListener("resize", ajustarTamano);

  const colores = ["#E8672B", "#0F6E6A", "#D6337A", "#F2B705", "#0E7A3E", "#C8232A", "#ffffff"];
  const particulas = Array.from({ length: 150 }).map(() => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.6,
    r: 4 + Math.random() * 5,
    vy: 2 + Math.random() * 3,
    vx: -1.8 + Math.random() * 3.6,
    color: colores[Math.floor(Math.random() * colores.length)],
    rot: Math.random() * 360,
    vr: -8 + Math.random() * 16,
    forma: Math.random() < 0.5 ? "rect" : "circ"
  }));

  const inicio = performance.now();
  function frame(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particulas.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      if (p.forma === "rect") ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      else { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    if (t - inicio < duracionMs) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
      window.removeEventListener("resize", ajustarTamano);
    }
  }
  requestAnimationFrame(frame);
}
