// ============================================================
// CONFIGURACIÓN DE FIREBASE
// ------------------------------------------------------------
// Ya está conectado al proyecto reto-digital-bmm (el mismo de
// Carrera de Obstáculos). Esta app usa su propia colección
// ("puntajes_feria_digital"), así que no choca con Reto Digital.
//
// Lo que falta hacer en la consola de Firebase antes de que
// guarde puntajes de verdad:
// 1. Build > Firestore Database > Crear base de datos (si el
//    proyecto aún no la tiene activada) — modo producción.
// 2. En Firestore > Reglas, pega las reglas de abajo para permitir
//    que cualquiera en la feria escriba su puntaje y lea el Top 10,
//    pero nadie pueda borrar ni editar registros ajenos:
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /puntajes_feria_digital/{doc} {
//          allow read: if true;
//          allow create: if true;
//          allow update, delete: if false;
//        }
//      }
//    }
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUHTkX6Q9S-h4f36uc-LC2KHhufdanmKY",
  authDomain: "reto-digital-bmm.firebaseapp.com",
  projectId: "reto-digital-bmm",
  storageBucket: "reto-digital-bmm.firebasestorage.app",
  messagingSenderId: "834560588344",
  appId: "1:834560588344:web:c06729830291d6c20d44cd"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLECCION = "puntajes_feria_digital";

/**
 * Guarda un puntaje al terminar una partida.
 * @param {{nombre:string, nomina:string, avatar:string, puntos:number, rachaMax:number}} datos
 */
export async function guardarPuntaje(datos){
  try{
    await addDoc(collection(db, COLECCION), {
      nombre: datos.nombre,
      nomina: datos.nomina,
      avatar: datos.avatar,
      puntos: datos.puntos,
      rachaMax: datos.rachaMax,
      creado: serverTimestamp()
    });
    return true;
  }catch(err){
    console.error("No se pudo guardar el puntaje:", err);
    return false;
  }
}

/**
 * Obtiene el Top 10 histórico ordenado por puntos descendente.
 * @returns {Promise<Array>}
 */
export async function obtenerTop10(){
  try{
    const q = query(collection(db, COLECCION), orderBy("puntos", "desc"), limit(10));
    const snap = await getDocs(q);
    const resultados = [];
    snap.forEach(doc => resultados.push(doc.data()));
    return resultados;
  }catch(err){
    console.error("No se pudo leer el Top 10:", err);
    return [];
  }
}
