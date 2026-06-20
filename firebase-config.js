// ==========================================================================
// CONFIGURACIÓN Y CONEXIÓN MODULAR DE FIREBASE
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Reemplaza estos datos con la configuración real de tu proyecto en la consola de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBzrr9Jc7IY4FSEkZn4_WPuZXiua9Q43fw",
    authDomain: "controlceges.firebaseapp.com",
    projectId: "controlceges",
    storageBucket: "controlceges.firebasestorage.app",
    messagingSenderId: "523718425904",
    appId: "1:523718425904:web:ec2bec422522e6b06c5cf5",
    measurementId: "G-PDVML1F5QH"
  };

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firestore y exportarlo
export const db = getFirestore(app);