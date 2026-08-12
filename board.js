// board.js — Configuración compartida del tablero BMM Digital Party
// Usado por jugador.html y tablero.html (mismo módulo, una sola fuente de verdad)

export const BOARD_SIZE = 30;

export const CATEGORIES = {
  RPA:            { id: 'RPA',            label: 'RPA',             emoji: '🤖', color: '#FF6B6B', colorSoft: '#4A2333' },
  DASHBOARDS:     { id: 'DASHBOARDS',     label: 'Dashboards',      emoji: '📊', color: '#FFB84D', colorSoft: '#4A3620' },
  POWERAPPS:      { id: 'POWERAPPS',      label: 'Power Apps',      emoji: '📱', color: '#4CD97B', colorSoft: '#1F3F2C' },
  POWERAUTOMATE:  { id: 'POWERAUTOMATE',  label: 'Power Automate',  emoji: '⚡', color: '#45D6E8', colorSoft: '#1D3A40' },
  IA:             { id: 'IA',             label: 'Inteligencia Artificial', emoji: '🧠', color: '#B98CFF', colorSoft: '#332352' },
};

const CATEGORY_ORDER = ['RPA', 'DASHBOARDS', 'POWERAPPS', 'POWERAUTOMATE', 'IA'];

// Casillas de Reto Grupal (minijuego) — estilo Mario Party.
// Al caer aquí NO se hace pregunta individual: se convoca a todos los jugadores.
export const MINIGAME_SQUARES = [8, 16, 24];

// Escaleras (suben) y Serpientes (bajan). from -> to
export const LADDERS = { 4: 14, 9: 21, 17: 27 };
export const SNAKES  = { 26: 10, 22: 13, 12: 2 };

// Construye el arreglo de casillas 1..30 con su categoría o tipo especial
export function buildCasillas() {
  const casillas = {};
  for (let n = 1; n <= BOARD_SIZE; n++) {
    if (MINIGAME_SQUARES.includes(n)) {
      casillas[n] = { numero: n, tipo: 'minijuego' };
    } else if (LADDERS[n]) {
      casillas[n] = { numero: n, tipo: 'escalera', destino: LADDERS[n], categoria: CATEGORY_ORDER[(n - 1) % 5] };
    } else if (SNAKES[n]) {
      casillas[n] = { numero: n, tipo: 'serpiente', destino: SNAKES[n], categoria: CATEGORY_ORDER[(n - 1) % 5] };
    } else {
      casillas[n] = { numero: n, tipo: 'categoria', categoria: CATEGORY_ORDER[(n - 1) % 5] };
    }
  }
  return casillas;
}

export const CASILLAS = buildCasillas();

// Layout en serpiente (boustrophedon) de 6 columnas x 5 filas, igual que el tablero de referencia.
// Fila 0 = abajo (casillas 1-6, izq->der), Fila 1 = 7-12 (der->izq), Fila 2 = 13-18 (izq->der), etc.
export function getGridPosition(numero) {
  const row = Math.floor((numero - 1) / 6);       // 0..4
  let colInRow = (numero - 1) % 6;                 // 0..5
  if (row % 2 === 1) colInRow = 5 - colInRow;       // filas impares van en reversa
  return { row, col: colInRow };
}

// Resuelve un turno completo: posición inicial + valor del dado -> resultado final
export function resolveMovement(fromPos, diceValue) {
  let landedRaw = fromPos + diceValue;
  let meta = false;
  if (landedRaw >= BOARD_SIZE) {
    landedRaw = BOARD_SIZE;
    meta = true;
  }

  const casilla = CASILLAS[landedRaw];
  let final = landedRaw;
  let evento = 'ninguno';

  if (!meta) {
    if (casilla.tipo === 'escalera') {
      final = casilla.destino;
      evento = 'escalera';
    } else if (casilla.tipo === 'serpiente') {
      final = casilla.destino;
      evento = 'serpiente';
    } else if (casilla.tipo === 'minijuego') {
      evento = 'minijuego';
    } else {
      evento = 'pregunta';
    }
  } else {
    evento = 'meta';
  }

  return {
    casillaAterrizaje: landedRaw,
    casillaFinal: final,
    evento,               // 'pregunta' | 'escalera' | 'serpiente' | 'minijuego' | 'meta'
    categoria: casilla.categoria || null,
  };
}

// Avatares = imágenes de producto reales (ya existentes en tu GitHub Pages).
// Si se repiten entre jugadores no pasa nada — el nombre los distingue.
const IMG_BASE = 'img';
export const AVATARES = [
  { id: 'nivea',    label: 'Nivea',    img: `${IMG_BASE}/nivea.png` },
  { id: 'eucerin',  label: 'Eucerin',  img: `${IMG_BASE}/eucerin.png` },
  { id: 'atrix',    label: 'Atrix',    img: `${IMG_BASE}/atrix.png` },
  { id: 'aquaphor', label: 'Aquaphor', img: `${IMG_BASE}/aquaphor.png` },
  { id: 'shower',   label: 'Shower',   img: `${IMG_BASE}/shower.png` },
  { id: 'labello',  label: 'Labello',  img: `${IMG_BASE}/labello.png` },
  { id: 'rollon',   label: 'RollOn',   img: `${IMG_BASE}/rollon.png` },
  { id: 'ph5',      label: 'PH5',      img: `${IMG_BASE}/ph5.png` },
];
