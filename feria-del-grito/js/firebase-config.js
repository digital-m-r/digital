// Proyecto de Firebase: reto-digital-bmm (mismo que Reto Digital / Feria Digital)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot,
  collection, addDoc, runTransaction, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUHTkX6Q9S-h4f36uc-LC2KHhufdanmKY",
  authDomain: "reto-digital-bmm.firebaseapp.com",
  projectId: "reto-digital-bmm",
  storageBucket: "reto-digital-bmm.firebasestorage.app",
  messagingSenderId: "834560588344",
  appId: "1:834560588344:web:c06729830291d6c20d44cd"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export {
  doc, getDoc, setDoc, updateDoc, onSnapshot,
  collection, addDoc, runTransaction, serverTimestamp, deleteField
};
