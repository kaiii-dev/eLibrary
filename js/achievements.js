import { getApps, getApp, initializeApp }           from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc }         from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAuth }                                   from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { firebaseConfig }                            from "./firebase-config.js";

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

export const ACHIEVEMENTS = [
  { id: 'first_add',       label: 'First Entry',     icon: '📚', desc: 'Add your first title' },
  { id: 'ten_completed',   label: 'Completionist',    icon: '🏆', desc: 'Complete 10 titles' },
  { id: 'fifty_completed', label: 'Library Legend',   icon: '👑', desc: 'Complete 50 titles' },
  { id: 'first_friend',    label: 'Social Butterfly', icon: '🦋', desc: 'Add your first friend' },
  { id: 'rated_ten',       label: 'Critic',           icon: '⭐', desc: 'Rate 10 titles' },
  { id: 'dropped_one',     label: 'Quality Control',  icon: '🚫', desc: 'Drop a title' },
  { id: 'streak_7',        label: 'Week Warrior',     icon: '🔥', desc: '7-day activity streak' },
  { id: 'streak_30',       label: 'Monthly Devotee',  icon: '💎', desc: '30-day activity streak' },
];

async function getUid() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
}

export async function getUnlockedAchievements() {
  try {
    const uid  = await getUid();
    const snap = await getDoc(doc(db, "users", uid, "meta", "achievements"));
    return snap.exists() ? (snap.data().unlocked || []) : [];
  } catch { return []; }
}

async function unlockAchievement(id) {
  const uid    = await getUid();
  const docRef = doc(db, "users", uid, "meta", "achievements");
  const snap   = await getDoc(docRef);
  const existing = snap.exists() ? (snap.data().unlocked || []) : [];
  if (existing.includes(id)) return false;
  await setDoc(docRef, { unlocked: [...existing, id] }, { merge: true });
  return true;
}

// event: 'added' | 'completed' | 'rated' | 'dropped' | 'friend_added' | 'streak'
// context: { totalCount, completedCount, ratedCount, friendCount, streak }
export async function checkAndUnlock(event, context = {}) {
  const toUnlock = [];
  if (event === 'added'        && context.totalCount    === 1)  toUnlock.push('first_add');
  if (event === 'completed'    && context.completedCount >= 10) toUnlock.push('ten_completed');
  if (event === 'completed'    && context.completedCount >= 50) toUnlock.push('fifty_completed');
  if (event === 'friend_added' && context.friendCount   >= 1)  toUnlock.push('first_friend');
  if (event === 'rated'        && context.ratedCount    >= 10) toUnlock.push('rated_ten');
  if (event === 'dropped')                                       toUnlock.push('dropped_one');
  if (event === 'streak'       && context.streak        >= 7)  toUnlock.push('streak_7');
  if (event === 'streak'       && context.streak        >= 30) toUnlock.push('streak_30');

  const newlyUnlocked = [];
  for (const id of toUnlock) {
    try {
      const isNew = await unlockAchievement(id);
      if (isNew) newlyUnlocked.push(id);
    } catch (_) {}
  }
  return newlyUnlocked;
}
