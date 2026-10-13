import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export {
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query, where,
  orderBy, limit, limitToLast, onSnapshot, serverTimestamp, writeBatch,
  arrayUnion, arrayRemove, documentId
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
