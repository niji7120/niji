// ===== FIREBASE 초기화 =====
// 이 파일은 Firebase 연결 설정입니다. 수정하지 마세요.

try {
  const firebaseConfig = {
    apiKey: "AIzaSyCyDq-V7J3JfGNyU8wL7rUIQntdU_lD31Q",
    authDomain: "niji-string-app.firebaseapp.com",
    databaseURL: "https://niji-string-app-default-rtdb.firebaseio.com",
    projectId: "niji-string-app",
    storageBucket: "niji-string-app.firebasestorage.app",
    messagingSenderId: "179605771373",
    appId: "1:179605771373:web:a0e1900361cdc6a2c41b64"
  };
  firebase.initializeApp(firebaseConfig);
  window._firebaseDB = firebase.database();
  window._firebaseAuth = firebase.auth();
  window._userId = null;
} catch(e) {
  console.warn('Firebase 초기화 실패:', e);
  window._firebaseDB = null;
  window._firebaseAuth = null;
  window._userId = null;
}
