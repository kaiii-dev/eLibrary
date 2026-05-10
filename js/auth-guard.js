import { initializeApp, getApps, getApp }       from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut }  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp, collection, getDocs }
                                                 from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig }                        from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace('login.html');
  } else if (!user.emailVerified) {
    // Sign out unverified sessions and redirect with a prompt to verify
    await signOut(auth);
    window.location.replace('login.html?verify=1');
  } else {
    sessionStorage.setItem('userEmail',  user.email        || '');
    sessionStorage.setItem('userName',   user.displayName  || '');
    sessionStorage.setItem('userPhoto',  user.photoURL     || '');

    window.__authUser     = user;
    window.__authInstance = auth;

    window.__authSignOut = () => signOut(auth).then(() => {
      sessionStorage.clear();
      window.location.href = 'login.html';
    });

    // Check pending friend requests and store count for nav badge
    getDocs(collection(db, "friendRequests", user.uid, "from"))
      .then(snap => sessionStorage.setItem('friendReqCount', snap.size))
      .catch(() => {});

    // Sync public profile — email intentionally excluded (not public)
    setDoc(doc(db, "profiles", user.uid), {
      uid:       user.uid,
      username:  user.displayName || '',
      photoURL:  user.photoURL    || '',
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(() => {});

    // Load profile modal module
    import('./profile.js').catch(() => {});
  }
});
