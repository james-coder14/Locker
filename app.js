import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendEmailVerification, sendPasswordResetEmail, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, deleteDoc, getDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

const CH = { "SCHOOLWIDE": ["Student Body", "Juniors", "Student Council"], "CLASSES": ["Math 1A", "Girls Soccer"] };
const S = { user: null, mod: false, channel: "Student Body", tab: "feed", posts: [], likes: [], events: [], reports: [], unsubs: [] };
const $ = id => document.getElementById(id);
const app = $("app");
const mobile = () => matchMedia("(max-width:720px)").matches;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function toast(t) { const d = el("div", "toast", t); document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }
function when(ts) {
  const d = ts && ts.toDate ? ts.toDate() : new Date();
  return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/* ---------- Sign in / create account (email + password) ---------- */
let creating = false;
const showLogin = () => { $("login").classList.remove("hidden"); $("verify").classList.add("hidden"); app.classList.add("hidden"); };
const showVerify = () => { $("verify").classList.remove("hidden"); $("login").classList.add("hidden"); app.classList.add("hidden"); };
const setMsg = (id, t) => { $(id).textContent = t; };
const friendly = e => ({
  "auth/invalid-email": "That email address is not valid.",
  "auth/missing-password": "Enter a password.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/email-already-in-use": "An account already exists for that email. Try signing in.",
  "auth/invalid-credential": "Email or password is wrong.",
  "auth/user-not-found": "Email or password is wrong.",
  "auth/wrong-password": "Email or password is wrong.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
  "auth/network-request-failed": "No internet connection."
}[e.code] || "Something went wrong. Please try again.");

$("toggleBtn").onclick = () => {
  creating = !creating;
  $("nameIn").classList.toggle("hidden", !creating);
  $("authBtn").textContent = creating ? "Create account" : "Sign in";
  $("toggleBtn").textContent = creating ? "I already have an account" : "Create an account";
  $("loginSub").textContent = creating ? "Make an account to post." : "Sign in to continue.";
  setMsg("loginMsg", "");
};

$("authBtn").onclick = async () => {
  const email = $("emailIn").value.trim(), pass = $("passIn").value, name = $("nameIn").value.trim();
  setMsg("loginMsg", "");
  if (creating && !name) return setMsg("loginMsg", "Please enter your name.");
  try {
    if (creating) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (e) { setMsg("loginMsg", friendly(e)); }
};

$("resetBtn").onclick = async () => {
  const email = $("emailIn").value.trim();
  if (!email) return setMsg("loginMsg", "Type your email above first, then tap Forgot password.");
  try { await sendPasswordResetEmail(auth, email); setMsg("loginMsg", "If an account exists, a reset link was sent."); }
  catch (e) { setMsg("loginMsg", friendly(e)); }
};

$("checkBtn").onclick = async () => {
  if (!auth.currentUser) return;
  await auth.currentUser.reload();
  if (auth.currentUser.emailVerified) { setMsg("verifyMsg", ""); location.reload(); }
  else setMsg("verifyMsg", "Not verified yet. Open the link in your email, then try again.");
};
$("resendBtn").onclick = async () => {
  try { await sendEmailVerification(auth.currentUser); setMsg("verifyMsg", "Verification email sent."); }
  catch (e) { setMsg("verifyMsg", "Please wait a minute before resending."); }
};
$("backBtn").onclick = () => signOut(auth);
$("signOutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  S.unsubs.forEach(u => u()); S.unsubs = [];
  S.user = user; S.mod = false;
  if (!user) { showLogin(); return; }
  if (!user.emailVerified) { showVerify(); return; }
  $("login").classList.add("hidden"); $("verify").classList.add("hidden"); app.classList.remove("hidden");
  try { S.mod = (await getDoc(doc(db, "mods", user.uid))).exists(); } catch (e) {}
  $("evForm").classList.toggle("hidden", !S.mod);
  go("feed");
  subscribeStatic();
  subscribeChannel();
});

/* ---------- Data ---------- */
const onErr = e => { if (e.code === "permission-denied") toast("Your account does not have access."); };

function subscribeStatic() {
  S.unsubs.push(onSnapshot(query(collection(db, "events"), orderBy("at", "asc")), s => {
    S.events = s.docs.map(d => ({ id: d.id, ...d.data() })); renderEvents();
  }, onErr));
  if (S.mod) S.unsubs.push(onSnapshot(collection(db, "reports"), s => {
    S.reports = s.docs.map(d => ({ id: d.id, ...d.data() })); renderReports(); renderTabs();
  }, onErr));
}

let chUnsubs = [];
function subscribeChannel() {
  chUnsubs.forEach(u => u()); chUnsubs = [];
  const q = query(collection(db, "posts"), where("channel", "==", S.channel), orderBy("createdAt", "desc"), limit(100));
  chUnsubs.push(onSnapshot(q, s => { S.posts = s.docs.map(d => ({ id: d.id, ...d.data() })); renderPosts(); }, onErr));
  chUnsubs.push(onSnapshot(query(collection(db, "likes"), where("channel", "==", S.channel)), s => {
    S.likes = s.docs.map(d => ({ id: d.id, ...d.data() })); renderPosts();
  }, onErr));
  S.unsubs.push(() => { chUnsubs.forEach(u => u()); chUnsubs = []; });
}

$("postBtn").onclick = async () => {
  const input = $("newPost"), text = input.value.trim();
  if (!text) return;
  try {
    await addDoc(collection(db, "posts"), {
      text, author: S.user.uid, authorName: S.user.displayName || "Student",
      channel: S.channel, createdAt: serverTimestamp()
    });
    input.value = "";
  } catch (e) { toast("Could not post."); }
};

async function toggleLike(p, liked) {
  const ref = doc(db, "likes", p.id + "_" + S.user.uid);
  try { liked ? await deleteDoc(ref) : await setDoc(ref, { post: p.id, user: S.user.uid, channel: p.channel }); }
  catch (e) { toast("Could not save."); }
}
async function report(p) {
  try {
    await addDoc(collection(db, "reports"), { post: p.id, by: S.user.uid, text: p.text, channel: p.channel, at: Date.now() });
    toast("Reported. Moderators will review it.");
  } catch (e) { toast("Could not report."); }
}

$("evAdd").onclick = async () => {
  const t = $("evTitle").value.trim(), w = $("evWhen").value.trim();
  if (!t) return;
  try { await addDoc(collection(db, "events"), { title: t, when: w, at: Date.now() }); $("evTitle").value = ""; $("evWhen").value = ""; }
  catch (e) { toast("Could not add."); }
};

/* ---------- Rendering ---------- */
function renderSide() {
  const s = $("side"); s.textContent = "";
  const sc = el("div", "school"); sc.append(el("div", "mark", "L"), el("span", "", "Locker")); s.append(sc);
  for (const g in CH) {
    s.append(el("div", "label", g));
    CH[g].forEach(c => {
      const b = el("button", "item" + (S.channel === c ? " on" : ""), c);
      b.onclick = () => { S.channel = c; go("feed"); subscribeChannel(); if (mobile()) app.classList.remove("open"); };
      s.append(b);
    });
  }
}
function renderTabs() {
  const t = $("tabs"); t.textContent = "";
  const tabs = [["feed", "Feed"], ["calendar", "Calendar"], ["connect", "Connect"]];
  if (S.mod) tabs.push(["mod", "Moderate" + (S.reports.length ? " (" + S.reports.length + ")" : "")]);
  tabs.forEach(([k, l]) => { const b = el("button", S.tab === k ? "on" : "", l); b.onclick = () => go(k); t.append(b); });
}
function go(tab) {
  S.tab = tab;
  ["feed", "calendar", "connect", "mod"].forEach(k => $(k).classList.toggle("hidden", k !== tab));
  $("title").textContent = tab === "feed" ? S.channel : { calendar: "Calendar", connect: "Connect", mod: "Moderation" }[tab];
  renderSide(); renderTabs(); renderPosts();
}
function renderPosts() {
  const box = $("posts"); box.textContent = "";
  if (!S.posts.length) box.append(el("p", "note", "No posts yet. Be the first to post."));
  S.posts.forEach(p => {
    const d = el("div", "post"), m = el("div", "meta");
    m.append(el("b", "", p.authorName || "Student"), document.createTextNode(" \u00b7 " + when(p.createdAt)));
    const n = S.likes.filter(l => l.post === p.id).length;
    const liked = S.likes.some(l => l.id === p.id + "_" + S.user.uid);
    const a = el("div", "actions");
    const lb = el("button", liked ? "on" : "", (liked ? "Liked " : "Like ") + n); lb.onclick = () => toggleLike(p, liked); a.append(lb);
    const rb = el("button", "", "Report"); rb.onclick = () => report(p); a.append(rb);
    if (p.author === S.user.uid || S.mod) { const x = el("button", "", "Delete"); x.onclick = () => deleteDoc(doc(db, "posts", p.id)); a.append(x); }
    d.append(m, el("p", "", p.text), a); box.append(d);
  });
}
function renderEvents() {
  const b = $("events"); b.textContent = "";
  if (!S.events.length) b.append(el("p", "note", "No events yet."));
  S.events.forEach(e => {
    const r = el("div", "row"), i = el("div", "info");
    i.append(el("b", "", e.title), el("span", "", e.when || ""));
    r.append(i);
    if (S.mod) { const x = el("button", "btn", "Remove"); x.onclick = () => deleteDoc(doc(db, "events", e.id)); r.append(x); }
    b.append(r);
  });
}
function renderReports() {
  const b = $("reports"); b.textContent = "";
  if (!S.reports.length) b.append(el("p", "note", "No reports. All clear."));
  S.reports.forEach(r => {
    const d = el("div", "post");
    d.append(el("div", "meta", "Reported in " + (r.channel || "")), el("p", "", r.text));
    const a = el("div", "actions");
    const del = el("button", "", "Delete post"); del.onclick = async () => { await deleteDoc(doc(db, "posts", r.post)).catch(() => {}); await deleteDoc(doc(db, "reports", r.id)); }; a.append(del);
    const dis = el("button", "", "Dismiss"); dis.onclick = () => deleteDoc(doc(db, "reports", r.id)); a.append(dis);
    d.append(a); b.append(d);
  });
}

$("menuBtn").onclick = () => app.classList.toggle(mobile() ? "open" : "collapsed");
$("scrim").onclick = () => app.classList.remove("open");
