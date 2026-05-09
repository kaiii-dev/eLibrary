import { initializeApp, getApps, getApp }                      from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache,
         collection, addDoc, getDocs, updateDoc,
         doc, orderBy, query, serverTimestamp, deleteDoc,
         getDoc, setDoc, where, limit, startAfter, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL,
         deleteObject }                                        from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import { getAuth, onAuthStateChanged }                         from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { firebaseConfig }                                       from "./firebase-config.js";
import { checkAndUnlock }                                        from "./achievements.js";

const app     = getApps().length ? getApp() : initializeApp(firebaseConfig);
// Enable Firestore offline persistence so the wishlist loads without network
const db = (() => {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache() });
  } catch {
    return getFirestore(app); // already initialized — reuse existing instance
  }
})();
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

// Community platforms — root collection, shared across all users
const communityCol     = ()   => collection(db, "community_platforms");
const communityDocRef  = (id) => doc(db, "community_platforms", id);

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

export async function getWishlistPage({ lastDoc = null, pageSize = 24 } = {}) {
  const constraints = [orderBy("created_at", "desc"), limit(pageSize + 1)];
  if (lastDoc) constraints.push(startAfter(lastDoc));
  const snap = await getDocs(query(await wishlistCol(), ...constraints));
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items = docs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
  return { items, lastDoc: hasMore ? docs[pageSize - 1] : null, hasMore };
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
  logActivity('added', { itemId: docRef.id, itemTitle: fields.title || '', itemType: fields.type || '', coverPath: cover_path }).catch(() => {});
  // Achievement: first add
  (async () => {
    try {
      const snap = await getDocs(await wishlistCol());
      await checkAndUnlock('added', { totalCount: snap.size });
    } catch (_) {}
  })();
  return { id: docRef.id, cover_path };
}

export async function updateWishlistItem(docId, fields) {
  const snap = await getDoc(await wishlistDoc(docId));
  const existing = snap.exists() ? snap.data() : {};

  const payload = { updated_at: serverTimestamp() };
  if (fields.status       !== undefined) payload.status           = fields.status;
  if (fields.last_chapter !== undefined) payload.last_chapter     = fields.last_chapter;
  if (fields.progress_current !== undefined) payload.progress_current = fields.progress_current != null ? Number(fields.progress_current) : null;
  if (fields.progress_total   !== undefined) payload.progress_total   = fields.progress_total   != null ? Number(fields.progress_total)   : null;
  if (fields.rating           !== undefined) payload.rating           = fields.rating != null ? Number(fields.rating) : null;
  if (fields.status === 'completed') payload.finish_date = serverTimestamp();
  if ((fields.status === 'watching' || fields.status === 'reading') && !existing.start_date) {
    payload.start_date = serverTimestamp();
  }
  await updateDoc(await wishlistDoc(docId), payload);

  // Log activity (fire-and-forget)
  const base = { itemId: docId, itemTitle: existing.title || '', itemType: existing.type || '', coverPath: existing.cover_path || '' };
  if (fields.status === 'completed') {
    logActivity('completed', base).catch(() => {});
    (async () => {
      try {
        const snap = await getDocs(await wishlistCol());
        const completedCount = snap.docs.filter(d => d.data().status === 'completed').length;
        await checkAndUnlock('completed', { completedCount });
      } catch (_) {}
    })();
  } else if (fields.status === 'dropped') {
    logActivity('dropped', base).catch(() => {});
    checkAndUnlock('dropped', {}).catch(() => {});
  } else if (fields.rating != null && fields.rating !== existing.rating) {
    logActivity('rated', { ...base, rating: Number(fields.rating) }).catch(() => {});
    (async () => {
      try {
        const snap = await getDocs(await wishlistCol());
        const ratedCount = snap.docs.filter(d => d.data().rating != null).length;
        await checkAndUnlock('rated', { ratedCount });
      } catch (_) {}
    })();
  } else if (fields.status && fields.status !== existing.status) {
    logActivity('status_changed', { ...base, newStatus: fields.status }).catch(() => {});
  }
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
  const docRef = await addDoc(await wishlistCol(), {
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
  logActivity('added', { itemId: docRef.id, itemTitle: fields.title || '', itemType: fields.type || '', coverPath: coverUrl || '' }).catch(() => {});
  return docRef.id;
}

/* Returns the doc ID of a wishlist item matching the given title, or null */
export async function getWishlistItemIdByTitle(title) {
  if (!title) return null;
  const snap = await getDocs(query(await wishlistCol(), where('title', '==', title), limit(1)));
  return snap.empty ? null : snap.docs[0].id;
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

/* ── One-time migration: user platforms → community ──────── */

export async function migrateUserPlatformsToCommunity() {
  const uid  = await getUid();
  const snap = await getDocs(await platformCol());
  if (snap.empty) return 0;

  let migrated = 0;
  for (const d of snap.docs) {
    const p    = d.data();
    const url  = p.url || '';
    if (!url) continue;

    const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const norm    = safeUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();

    // Skip if already exists in community collection
    const dup = await getDocs(query(communityCol(), where('url_norm', '==', norm)));
    if (!dup.empty) continue;

    const domain = norm.split('/')[0];
    await addDoc(communityCol(), {
      type:         p.type        || 'streaming',
      name:         p.name        || '',
      url:          safeUrl,
      url_norm:     norm,
      tags:         p.tags        || [],
      icon_path:    p.icon_path   || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      visit_count:  p.visit_count || 0,
      last_visited: p.last_visited || null,
      created_by:   uid,
      created_at:   p.created_at  || serverTimestamp(),
    });
    migrated++;
  }
  return migrated;
}

/* ── Community platforms (shared, root collection) ────────── */

function normUrl(url) {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

function faviconFrom(url) {
  const domain = normUrl(url).split('/')[0];
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

export async function getCommunityPlatforms(type) {
  const snap = await getDocs(query(communityCol(), orderBy("created_at", "desc")));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => !type || p.type === type);
}

export async function checkCommunityDuplicate(url, excludeId = null) {
  const norm = normUrl(url);
  const snap = await getDocs(communityCol());
  return snap.docs.find(d => {
    if (excludeId && d.id === excludeId) return false;
    return d.data().url_norm === norm;
  }) || null;
}

export async function addCommunityPlatform(fields) {
  const uid  = await getUid();
  const url  = (fields.url || '').startsWith('http') ? fields.url : `https://${fields.url}`;
  const norm = normUrl(url);

  // Duplicate check
  const dup = await checkCommunityDuplicate(url);
  if (dup) throw new Error(`DUPLICATE:${dup.data().name}`);

  const docRef = await addDoc(communityCol(), {
    type:         fields.type || 'streaming',
    name:         fields.name || '',
    url,
    url_norm:     norm,
    tags:         fields.tags || [],
    icon_path:    faviconFrom(url),
    visit_count:  0,
    last_visited: null,
    created_by:   uid,
    created_at:   serverTimestamp(),
  });
  return { id: docRef.id };
}

export async function updateCommunityPlatform(docId, fields) {
  const uid    = await getUid();
  const docRef = communityDocRef(docId);
  const snap   = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Platform not found');
  if (snap.data().created_by !== uid) throw new Error('Not authorized');

  const payload = { ...fields, updated_at: serverTimestamp() };
  if (fields.url) {
    const url  = fields.url.startsWith('http') ? fields.url : `https://${fields.url}`;
    // Duplicate check (exclude self)
    const dup = await checkCommunityDuplicate(url, docId);
    if (dup) throw new Error(`DUPLICATE:${dup.data().name}`);
    payload.url      = url;
    payload.url_norm = normUrl(url);
    payload.icon_path = faviconFrom(url);
  }
  await updateDoc(docRef, payload);
}

export async function deleteCommunityPlatform(docId) {
  const uid    = await getUid();
  const docRef = communityDocRef(docId);
  const snap   = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Platform not found');
  if (snap.data().created_by !== uid) throw new Error('Not authorized');
  await deleteDoc(docRef);
}

export async function recordCommunityVisit(docId) {
  const docRef = communityDocRef(docId);
  const snap   = await getDoc(docRef);
  if (snap.exists()) {
    await updateDoc(docRef, {
      visit_count:  (snap.data().visit_count || 0) + 1,
      last_visited: serverTimestamp(),
    });
  }
}

export async function getCurrentUid() {
  return getUid();
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
  // Achievement: first friend
  (async () => {
    try {
      const fSnap = await getDocs(collection(db, "users", myUid, "friends"));
      await checkAndUnlock('friend_added', { friendCount: fSnap.size });
    } catch (_) {}
  })();
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

/* ── Activity feed ─────────────────────────────────────────── */

export async function logActivity(type, data) {
  const uid = await getUid();
  const col = collection(db, "users", uid, "activity");
  await addDoc(col, {
    type,
    itemId:    data.itemId    || '',
    itemTitle: data.itemTitle || '',
    itemType:  data.itemType  || '',
    coverPath: data.coverPath || '',
    rating:    data.rating    != null ? data.rating : null,
    newStatus: data.newStatus || '',
    timestamp: serverTimestamp(),
  });

  // Update streak (fire-and-forget)
  (async () => {
    try {
      const today      = new Date().toISOString().slice(0, 10);
      const streakRef  = doc(db, "users", uid, "meta", "streak");
      const streakSnap = await getDoc(streakRef);
      let { lastActiveDate = '', currentStreak = 0, longestStreak = 0 } =
        streakSnap.exists() ? streakSnap.data() : {};
      if (lastActiveDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        currentStreak = lastActiveDate === yesterday ? currentStreak + 1 : 1;
        longestStreak = Math.max(longestStreak, currentStreak);
        await setDoc(streakRef, { lastActiveDate: today, currentStreak, longestStreak }, { merge: true });
        checkAndUnlock('streak', { streak: currentStreak }).catch(() => {});
      }
    } catch (_) {}
  })();
}

export async function getFriendActivity(friendUid, limitCount = 15) {
  const snap = await getDocs(query(
    collection(db, "users", friendUid, "activity"),
    orderBy("timestamp", "desc"),
    limit(limitCount)
  ));
  return snap.docs.map(d => ({ id: d.id, friendUid, ...d.data() }));
}

export async function getAllFriendsActivity() {
  const friends = await getFriends();
  if (!friends.length) return [];
  const allResults = await Promise.all(
    friends.map(f =>
      getFriendActivity(f.uid, 10)
        .then(acts => acts.map(a => ({ ...a, friendUsername: f.username || '', friendPhoto: f.photoURL || '' })))
        .catch(() => [])
    )
  );
  return allResults.flat().sort((a, b) => {
    const ta = a.timestamp?.toMillis?.() || 0;
    const tb = b.timestamp?.toMillis?.() || 0;
    return tb - ta;
  }).slice(0, 50);
}

export async function getSharedTitles(friendUid) {
  const [myItems, friendItems] = await Promise.all([
    getWishlist(),
    getFriendWishlist(friendUid)
  ]);
  const myMap = new Map(myItems.map(i => [(i.title || '').toLowerCase().trim(), i]));
  return friendItems
    .filter(fi => myMap.has((fi.title || '').toLowerCase().trim()))
    .map(fi => ({ ...fi, myItem: myMap.get((fi.title || '').toLowerCase().trim()) }));
}

/* ── Friend reviews ────────────────────────────────────────── */

function slugify(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

export async function submitReview(title, { rating, text }, itemId = null) {
  const uid = await getUid();
  const me  = auth.currentUser;
  const slug = slugify(title);

  // Save to public reviews collection
  await setDoc(doc(db, "reviews", slug, "entries", uid), {
    uid,
    username: me.displayName || me.email || '',
    photoURL: me.photoURL    || '',
    rating:   rating != null  ? Number(rating) : null,
    text:     text   || '',
    timestamp: serverTimestamp(),
  });

  // Sync rating back to the wishlist item so both are always in sync
  if (itemId) {
    await updateDoc(await wishlistDoc(itemId), {
      rating:     rating != null ? Number(rating) : null,
      updated_at: serverTimestamp(),
    });
  }
}

export async function getMyReview(title) {
  const uid  = await getUid();
  const slug = slugify(title);
  const snap = await getDoc(doc(db, "reviews", slug, "entries", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getFriendReviews(title) {
  const friends = await getFriends();
  if (!friends.length) return [];
  const slug = slugify(title);
  const snaps = await Promise.all(
    friends.map(f => getDoc(doc(db, "reviews", slug, "entries", f.uid)).catch(() => null))
  );
  return snaps
    .filter(s => s && s.exists())
    .map(s => ({ id: s.id, ...s.data() }));
}

/* ── Batch Import ───────────────────────────────────────── */

export async function batchImportWishlist(items) {
  const uid = await getUid();
  const col = await wishlistCol();
  const now = serverTimestamp();

  // Firestore batch max 500 ops — split into chunks of 499
  const chunks = [];
  for (let i = 0; i < items.length; i += 499) chunks.push(items.slice(i, i + 499));

  let total = 0;
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(item => {
      const ref = doc(col);
      batch.set(ref, {
        title:            item.title            || '',
        type:             item.type             || 'anime',
        genre:            item.genre            || '',
        status:           item.status           || 'planning',
        site_url:         '',
        cover_path:       '',
        preview_url:      '',
        preview_source:   '',
        last_chapter:     '',
        sources:          [],
        progress_current: item.progress_current != null ? Number(item.progress_current) : null,
        progress_total:   null,
        rating:           item.rating != null ? Number(item.rating) : null,
        notes:            '',
        start_date:       null,
        finish_date:      item.status === 'completed' ? now : null,
        created_at:       now,
        updated_at:       now,
      });
    });
    await batch.commit();
    total += chunk.length;
  }
  return total;
}

/* ── Duplicate check ────────────────────────────────────── */

export async function checkWishlistTitleExists(title) {
  if (!title) return false;
  const snap = await getDocs(query(await wishlistCol(), where('title', '==', title), limit(1)));
  return !snap.empty;
}

/* ── Stats ──────────────────────────────────────────────── */

export async function getStats() {
  const uid = await getUid();
  const [wishlistSnap, streakSnap] = await Promise.all([
    getDocs(query(await wishlistCol(), orderBy("created_at", "desc"))),
    getDoc(doc(db, "users", uid, "meta", "streak")),
  ]);

  const items = wishlistSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const streakData = streakSnap.exists() ? streakSnap.data() : {};

  const totalItems     = items.length;
  const completedCount = items.filter(i => i.status === 'completed').length;
  const droppedCount   = items.filter(i => i.status === 'dropped').length;

  // Estimated hours watched (anime: assume 24 min/ep)
  let totalMinutes = 0;
  items.forEach(i => {
    if (i.type === 'anime' && i.progress_current) {
      totalMinutes += Number(i.progress_current) * 24;
    }
  });
  const totalHoursWatched = Math.round(totalMinutes / 60);

  // Genre breakdown
  const genreBreakdown = {};
  items.forEach(i => {
    (i.genre || '').split(',').map(g => g.trim()).filter(Boolean).forEach(g => {
      genreBreakdown[g] = (genreBreakdown[g] || 0) + 1;
    });
  });

  // Avg rating
  const rated = items.filter(i => i.rating != null);
  const avgRating = rated.length
    ? (rated.reduce((s, i) => s + Number(i.rating), 0) / rated.length).toFixed(1)
    : null;

  // Type breakdown
  const typeBreakdown = {};
  items.forEach(i => {
    const t = i.type || 'other';
    typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
  });

  return {
    totalItems, completedCount, droppedCount,
    totalHoursWatched, genreBreakdown, avgRating,
    typeBreakdown, ratedCount: rated.length,
    currentStreak: streakData.currentStreak || 0,
    longestStreak: streakData.longestStreak || 0,
  };
}

export async function getRecentlyUpdated(limitCount = 5) {
  try {
    const snap = await getDocs(query(
      await wishlistCol(),
      where('status', 'in', ['watching', 'reading']),
      orderBy('updated_at', 'desc'),
      limit(limitCount)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback if composite index not yet created — client-side filter
    const snap = await getDocs(query(await wishlistCol(), orderBy('updated_at', 'desc'), limit(50)));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.status === 'watching' || i.status === 'reading')
      .slice(0, limitCount);
  }
}
