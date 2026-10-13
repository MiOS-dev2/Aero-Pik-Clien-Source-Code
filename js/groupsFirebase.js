import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { groupsFirebaseConfig } from "./config.js";

const gapp = initializeApp(groupsFirebaseConfig, "groups");
export const gauth = getAuth(gapp);
export const gdb = getFirestore(gapp);
