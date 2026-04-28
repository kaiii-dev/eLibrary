import { initializeApp, getApps, getApp }                      from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc,
         doc, orderBy, query, serverTimestamp, deleteDoc,
         getDoc, setDoc, where }                              from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL,
         deleteObject }                                        from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import { getAuth, onAuthStateChanged }                         from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { firebaseConfig }                                       from "./firebase-config.js";

const app     = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db      = getFirestore(app);
const storage = getStorage(app);
const auth    = getAuth(app);

/* ── wait for Firebase Auth to restore session ───────── */
const authReady = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
});

async function getUid() {
  const user = auth.currentUser || await authReady;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
}

async function wishlistCol() { const uid = await getUid(); return collection(db, "users", uid, "wishlist");  }
async function wishlistDoc(id){ const uid = await getUid(); return doc(db, "users", uid, "wishlist", id);    }
async function platformCol() { const uid = await getUid(); return collection(db, "users", uid, "platforms"); }
async function platformDoc(id){ const uid = await getUid(); return doc(db, "users", uid, "platforms", id);   }

function randomFilename(ext) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${rand}_${Date.now()}.${ext}`;
}

function extFrom(file) {
  return file.name.split('.').pop().toLowerCase() || 'jpg';
}

async function uploadImage(folder, file) {
  const filename   = randomFilename(extFrom(file));
  const uid        = await getUid();
  const storageRef = ref(storage, `${folder}/${uid}/${filename}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

/* ── wishlist ─────────────────────────────────────────── */

export async function getWishlist({ q = "", type = "", status = "" } = {}) {
  const q_lower    = q.trim().toLowerCase();
  const type_lower = type.toLowerCase();
  const stat_lower = status.toLowerCase();

  const snap  = await getDocs(query(await wishlistCol(), orderBy("created_at", "desc")));
  let items   = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (q_lower)    items = items.filter(i =>
    (i.title  || "").toLowerCase().includes(q_lower) ||
    (i.genre  || "").toLowerCase().includes(q_lower)
  );
  if (type_lower) items = items.filter(i => (i.type   || "") === type_lower);
  if (stat_lower) items = items.filter(i => (i.status || "") === stat_lower);

  return items;
}

export async function addWishlistItem(fields, coverFile) {
  const cover_path = await uploadImage("covers", coverFile);
  const now = serverTimestamp();
  const docRef = await addDoc(await wishlistCol(), {
    title:            fields.title            || "",
    type:             fields.type             || "",
    genre:            fields.genre            || "",
    status:           fields.status           || "planning",
    site_url:         fields.site_url         || "",
    cover_path,
    preview_url:      fields.preview_url      || "",
    preview_source:   fields.preview_source   || "",
    last_chapter:     "",
    sources:          fields.sources          || [],
    progress_current: fields.progress_current != null ? Number(fields.progress_current) : null,
    progress_total:   fields.progress_total   != null ? Number(fields.progress_total)   : null,
    rating:           fields.rating           != null ? Number(fields.rating)           : null,
    notes:            fields.notes            || "",
    start_date:       (fields.status === 'watching' || fields.status === 'reading') ? now : null,
    finish_date:      fields.status === 'completed' ? now : null,
    created_at:       now,
    updated_at:       now,
  });
  return { id: docRef.id, cover_path };
}

export async function updateWishlistItem(docId, fields) {
  const payload = { updated_at: serverTimestamp() };
  if (fields.status     !== undefined) payload.status       = fields.status;
  if (fields.last_chapter !== undefined) payload.last_chapter = fields.last_chapter;
  if (fields.progress_current !== undefined) payload.progress_current = fields.progress_current != null ? Number(fields.progress_current) : null;
  if (fields.progress_total   !== undefined) payload.progress_total   = fields.progress_total   != null ? Number(fields.progress_total)   : null;
  if (fields.status === 'completed') payload.finish_date = serverTimestamp();
  if (fields.status === 'watching' || fields.status === 'reading') {
    const snap = await getDoc(await wishlistDoc(docId));
    if (snap.exists() && !snap.data().start_date) payload.start_date = serverTimestamp();
  }
  await updateDoc(await wishlistDoc(docId), payload);
}

/* ── platforms ────────────────────────────────────────── */

export async function getPlatforms(type) {
  const snap  = await getDocs(query(await platformCol(), orderBy("created_at", "desc")));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.type === type);
}

/* ── delete + get + updateFull ───────────────────────────── */

function storagePathFromUrl(url) {
  return decodeURIComponent(url.split('/o/')[1].split('?')[0]);
}

async function tryDeleteStorageFile(url) {
  if (!url) return;
  try {
    await deleteObject(ref(storage, storagePathFromUrl(url)));
  } catch (_) { /* file may already be gone — ignore */ }
}

export async function deleteWishlistItem(docId) {
  const snap = await getDoc(await wishlistDoc(docId));
  if (snap.exists()) await tryDeleteStorageFile(snap.data().cover_path);
  await deleteDoc(await wishlistDoc(docId));
}

export async function deletePlatform(docId) {
  const snap = await getDoc(await platformDoc(docId));
  if (snap.exists()) await tryDeleteStorageFile(snap.data().icon_path);
  await deleteDoc(await platformDoc(docId));
}

export async function getWishlistItem(docId) {
  const snap = await getDoc(await wishlistDoc(docId));
  if (!snap.exists()) throw new Error("Item not found");
  return { id: snap.id, ...snap.data() };
}

export async function updateFullWishlistItem(docId, fields, newCoverFile = null) {
  const payload = { ...fields, updated_at: serverTimestamp() };
  if (newCoverFile) {
    const old = await getDoc(await wishlistDoc(docId));
    if (old.exists()) await tryDeleteStorageFile(old.data().cover_path);
    payload.cover_path = await uploadImage("covers", newCoverFile);
  }
  // Auto-set finish_date when marking completed
  if (fields.status === 'completed' && !fields.finish_date) {
    payload.finish_date = serverTimestamp();
  }
  // Auto-set start_date when first switching to in-progress
  if ((fields.status === 'watching' || fields.status === 'reading') && !fields.start_date) {
    const snap = await getDoc(await wishlistDoc(docId));
    if (snap.exists() && !snap.data().start_date) payload.start_date = serverTimestamp();
  }
  await updateDoc(await wishlistDoc(docId), payload);
}

export async function updatePlatform(docId, fields, newIconFile = null) {
  const payload = { ...fields };
  if (newIconFile) {
    const old = await getDoc(await platformDoc(docId));
    if (old.exists()) await tryDeleteStorageFile(old.data().icon_path);
    payload.icon_path = await uploadImage("icons", newIconFile);
  }
  await updateDoc(await platformDoc(docId), payload);
}

export async function recordPlatformVisit(docId) {
  const docRef = await platformDoc(docId);
  const snap   = await getDoc(docRef);
  if (snap.exists()) {
    await updateDoc(docRef, {
      visit_count:  (snap.data().visit_count || 0) + 1,
      last_visited: serverTimestamp()
    });
  }
}

/* Adds a wishlist item using an external cover URL (no file upload needed) */
export async function addWishlistItemFromUrl(fields, coverUrl) {
  const now = serverTimestamp();
  await addDoc(await wishlistCol(), {
    title:            fields.title            || "",
    type:             fields.type             || "",
    genre:            fields.genre            || "",
    status:           fields.status           || "planning",
    site_url:         fields.site_url         || "",
    cover_path:       coverUrl                || "",
    preview_url:      fields.preview_url      || "",
    preview_source:   fields.preview_source   || "",
    last_chapter:     "",
    sources:          fields.sources          || [],
    progress_current: null,
    progress_total:   fields.progress_total   != null ? Number(fields.progress_total) : null,
    rating:           null,
    notes:            "",
    start_date:       null,
    finish_date:      fields.status === 'completed' ? now : null,
    created_at:       now,
    updated_at:       now,
  });
}

export async function addPlatform(fields, iconFile) {
  const icon_path = await uploadImage("icons", iconFile);
  const docRef = await addDoc(await platformCol(), {
    type:        fields.type     || "streaming",
    name:        fields.name     || "",
    url:         fields.url      || "",
    language:    fields.language || "en",
    notes:       fields.notes    || "",
    tags:        fields.tags     || [],
    visit_count: 0,
    last_visited: null,
    icon_path,
    created_at:  serverTimestamp()
  });
  return { id: docRef.id, icon_path };
}

/* ── Public profiles ──────────────────────────────────────── */

export async function upsertPublicProfile(user) {
  await setDoc(doc(db, "profiles", user.uid), {
    uid:       user.uid,
    email:     user.email     || '',
    username:  user.displayName || '',
    photoURL:  user.photoURL  || '',
    updatedAt: serverTimestamp()
  }, { merge: true });
}

/* ── Username uniqueness ──────────────────────────────────── */

export async function checkUsernameAvailable(username) {
  const snap = await getDoc(doc(db, "usernames", username.toLowerCase()));
  if (!snap.exists()) return true;
  const uid = await getUid();
  return snap.data().uid === uid; // already mine → still "available"
}

export async function claimUsername(newUsername, oldUsername) {
  const uid  = await getUid();
  const key  = newUsername.toLowerCase();
  await setDoc(doc(db, "usernames", key), { uid });
  if (oldUsername && oldUsername.toLowerCase() !== key) {
    await deleteDoc(doc(db, "usernames", oldUsername.toLowerCase())).catch(() => {});
  }
}

/* ── Friend discovery ─────────────────────────────────────── */

export async function searchUserByUsername(username) {
  const snap = await getDoc(doc(db, "usernames", username.toLowerCase()));
  if (!snap.exists()) return null;
  const { uid } = snap.data();
  const profile  = await getDoc(doc(db, "profiles", uid));
  if (!profile.exists()) return null;
  return { uid, ...profile.data() };
}

/* ── Friend requests ──────────────────────────────────────── */

export async function sendFriendRequest(toUid) {
  const myUid = await getUid();
  const me    = auth.currentUser;
  await setDoc(doc(db, "friendRequests", toUid, "from", myUid), {
    fromUid:  myUid,
    username: me.displayName || me.email || '',
    photoURL: me.photoURL    || '',
    sentAt:   serverTimestamp()
  });
}

export async function getFriendRequests() {
  const uid  = await getUid();
  const snap = await getDocs(collection(db, "friendRequests", uid, "from"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function acceptFriendRequest(fromUid, fromData) {
  const myUid = await getUid();
  const me    = auth.currentUser;
  const myData = {
    uid:      myUid,
    username: me.displayName || me.email || '',
    photoURL: me.photoURL    || '',
    addedAt:  serverTimestamp()
  };
  // Add friend to my list (owner write)
  await setDoc(doc(db, "users", myUid, "friends", fromUid), {
    uid:      fromUid,
    username: fromData.username || '',
    photoURL: fromData.photoURL || '',
    addedAt:  serverTimestamp()
  });
  // Add myself to their list (allowed by Firestore rule if request exists)
  await setDoc(doc(db, "users", fromUid, "friends", myUid), myData);
  // Delete the request
  await deleteDoc(doc(db, "friendRequests", myUid, "from", fromUid));
}

export async function declineFriendRequest(fromUid) {
  const uid = await getUid();
  await deleteDoc(doc(db, "friendRequests", uid, "from", fromUid));
}

/* ── Friends list ─────────────────────────────────────────── */

export async function getFriends() {
  const uid  = await getUid();
  const snap = await getDocs(collection(db, "users", uid, "friends"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getFriendWishlist(friendUid) {
  const snap = await getDocs(query(
    collection(db, "users", friendUid, "wishlist"),
    orderBy("created_at", "desc")
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function removeFriend(friendUid) {
  const myUid = await getUid();
  await deleteDoc(doc(db, "users", myUid,     "friends", friendUid));
  await deleteDoc(doc(db, "users", friendUid, "friends", myUid)).catch(() => {});
}
