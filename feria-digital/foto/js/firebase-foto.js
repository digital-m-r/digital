// Misma configuración del proyecto reto-digital-bmm que usa la Feria Digital.
// Las fotos se guardan en la colección "fotos_foro_digital" de Firestore
// (JPEG comprimido en base64, ~150-250 KB por foto).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUHTkX6Q9S-h4f36uc-LC2KHhufdanmKY",
  authDomain: "reto-digital-bmm.firebaseapp.com",
  projectId: "reto-digital-bmm",
  storageBucket: "reto-digital-bmm.firebasestorage.app",
  messagingSenderId: "834560588344",
  appId: "1:834560588344:web:c06729830291d6c20d44cd"
};

const app = initializeApp(firebaseConfig, "foto");
export const db = getFirestore(app);
export { doc, setDoc, getDoc, serverTimestamp };
export const COLECCION_FOTOS = "fotos_foro_digital";
