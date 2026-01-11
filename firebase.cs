// <<< PASTE YOUR FIREBASE CONFIG HERE >>>
const firebaseConfig = {
 apiKey: "AIzaSyDKKAxKTFJcMDmj6j21nKHwlSpwAxsw57k",
  authDomain: "call-breke.firebaseapp.com",
  databaseURL: "https://call-breke-default-rtdb.firebaseio.com",
  projectId: "call-breke",
  storageBucket: "call-breke.firebasestorage.app",
  messagingSenderId: "908751603046",
  appId: "1:908751603046:web:fd30e07b9e6400b35c74a7",
  measurementId: "G-V2D55S47QV"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();