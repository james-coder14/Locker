import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const S = { user: null, profile: null, mod: false, classes: [], cls: null, posts: [], likes: [], events: [], reports: [], members: [], users: {}, clsUnsubs: [], tab: "feed", onboardMode: "new", photoData: "", pendingClassId: null };
const $ = id => document.getElementById(id);
const appEl = $("app");
const mobile = () => matchMedia("(max-width:720px)").matches;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function toast(t) { const d = el("div", "toast", t); document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }
function onErr(e) { if (e && e.code === "permission-denied") toast("You do not have access to that."); }
function when(ts) { const d = ts && ts.toDate ? ts.toDate() : new Date(ts || Date.now()); return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }); }
function show(name) { ["login", "verify", "onboard", "app"].forEach(s => $(s).classList.toggle("hidden", s !== name)); }
function avatar(src, size) { const i = el("img", "avatar" + (size ? " " + size : "")); if (src) i.src = src; else i.classList.add("empty"); i.alt = ""; return i; }
function makeCode() { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c = ""; for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]; return c; }
function isOwnerOf(c) { return !!c && c.ownerUid === S.user.uid; }
function resetClass() { S.clsUnsubs.forEach(u => u()); S.clsUnsubs = []; }

/* ---------- Sign in / create account ---------- */
let creating = false;
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
  $("loginSub").textContent = creating ? "Make an account to get started." : "Sign in to continue.";
  $("loginMsg").textContent = "";
};
$("authBtn").onclick = async () => {
  const email = $("emailIn").value.trim(), pass = $("passIn").value, name = $("nameIn").value.trim();
  $("loginMsg").textContent = "";
  if (creating && !name) return $("loginMsg").textContent = "Please enter your name.";
  try {
    if (creating) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (e) { $("loginMsg").textContent = friendly(e); }
};
$("resetBtn").onclick = async () => {
  const email = $("emailIn").value.trim();
  if (!email) return $("loginMsg").textContent = "Type your email above first, then tap Forgot password.";
  try { await sendPasswordResetEmail(auth, email); $("loginMsg").textContent = "If an account exists, a reset link was sent."; }
  catch (e) { $("loginMsg").textContent = friendly(e); }
};
$("checkBtn").onclick = async () => {
  if (!auth.currentUser) return;
  await auth.currentUser.reload();
  if (auth.currentUser.emailVerified) location.reload();
  else $("verifyMsg").textContent = "Not verified yet. Open the link in your email, then try again.";
};
$("resendBtn").onclick = async () => {
  try { await sendEmailVerification(auth.currentUser); $("verifyMsg").textContent = "Verification email sent."; }
  catch (e) { $("verifyMsg").textContent = "Please wait a minute before resending."; }
};
$("backBtn").onclick = () => signOut(auth);
$("signOutBtn").onclick = () => signOut(auth);
$("sideSignOut").onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  resetClass();
  S.user = user; S.profile = null; S.mod = false; S.cls = null; S.classes = [];
  if (!user) return show("login");
  if (!user.emailVerified) return show("verify");
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    S.profile = snap.exists() ? snap.data() : null;
    S.mod = (await getDoc(doc(db, "mods", user.uid))).exists();
  } catch (e) { return toast("Could not load your account. Refresh and try again."); }
  if (S.profile) S.users[user.uid] = S.profile;
  if (!S.profile || !S.profile.onboarded) return startOnboarding("new");
  enterApp();
});

/* ---------- Onboarding ---------- */
function setPhoto(src) { const img = $("photoPreview"); img.src = src || ""; img.classList.toggle("empty", !src); }
function onboardMsg(t) { $("onboardMsg").textContent = t; }
function stepTo(n) {
  [1, 2, 3, 4].forEach(i => $("s" + i).classList.toggle("hidden", i !== n));
  $("stepLabel").textContent = S.onboardMode === "edit" ? "Edit profile" : "Step " + n + " of 4";
  onboardMsg("");
}
function startOnboarding(mode) {
  S.onboardMode = mode;
  show("onboard");
  $("s1Cancel").classList.toggle("hidden", mode !== "edit");
  const p = S.profile || {};
  S.photoData = p.photo || "";
  setPhoto(S.photoData);
  $("pName").value = p.name || (S.user && S.user.displayName) || "";
  $("pBio").value = p.bio || "";
  $("pEmail").value = p.contactEmail || (S.user && S.user.email) || "";
  stepTo(1);
}
function shrinkImage(file, size) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
$("photoIn").onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try { S.photoData = await shrinkImage(f, 160); setPhoto(S.photoData); }
  catch (err) { onboardMsg("That picture could not be used. Try a different one."); }
};

async function saveProfile() {
  const name = $("pName").value.trim();
  const bio = $("pBio").value.trim();
  const contactEmail = $("pEmail").value.trim();
  if (!name) { onboardMsg("Please enter your name."); return false; }
  if (!contactEmail) { onboardMsg("Please enter a contact email."); return false; }
  const data = { name, bio, contactEmail, photo: S.photoData || "", onboarded: !!(S.profile && S.profile.onboarded), updatedAt: Date.now() };
  try { await setDoc(doc(db, "users", S.user.uid), data); }
  catch (e) { onboardMsg("Could not save. Check your internet and try again."); return false; }
  S.profile = data; S.users[S.user.uid] = data;
  updateProfile(S.user, { displayName: name }).catch(() => {});
  return true;
}
$("s1Next").onclick = async () => {
  if (!(await saveProfile())) return;
  if (S.onboardMode === "edit") return enterApp(S.cls && S.cls.classId);
  stepTo(2);
};
$("s1Cancel").onclick = () => enterApp(S.cls && S.cls.classId);

$("s2Create").onclick = () => stepTo(3);
$("s2Back").onclick = () => (S.profile && S.profile.onboarded) ? enterApp(S.cls && S.cls.classId) : stepTo(1);
$("s2Join").onclick = async () => {
  const code = $("joinCode").value.trim().toUpperCase();
  if (code.length !== 6) return onboardMsg("Class codes are 6 characters.");
  let snap;
  try { snap = await getDoc(doc(db, "classCodes", code)); }
  catch (e) { return onboardMsg("Could not check that code. Try again."); }
  if (!snap.exists()) return onboardMsg("No classroom has that code. Check it and try again.");
  const classId = snap.data().classId;
  try { await joinClass(classId); }
  catch (e) { return onboardMsg("Could not join that classroom. Try again."); }
  S.pendingClassId = classId;
  finishOnboarding();
};
async function joinClass(classId) {
  const id = classId + "_" + S.user.uid;
  let exists = false;
  try { exists = (await getDoc(doc(db, "members", id))).exists(); } catch (e) {}
  if (exists) return;
  await setDoc(doc(db, "members", id), { classId, uid: S.user.uid, role: "student", joinedAt: Date.now() });
}

$("s3Back").onclick = () => stepTo(2);
$("s3Create").onclick = async () => {
  const name = $("className").value.trim();
  if (!name) return onboardMsg("Name your classroom first.");
  $("s3Create").disabled = true;
  try {
    const c = await createClass(name);
    S.pendingClassId = c.classId;
    $("codeBig").textContent = c.code;
    $("inviteText").value = inviteMessage(name, c.code);
    stepTo(4);
  } catch (e) { onboardMsg("Could not create the classroom. Try again."); }
  $("s3Create").disabled = false;
};
async function createClass(name) {
  const classId = doc(collection(db, "classes")).id;
  const code = makeCode();
  await setDoc(doc(db, "classes", classId), { name, code, ownerUid: S.user.uid, ownerName: S.profile.name, createdAt: Date.now() });
  await setDoc(doc(db, "members", classId + "_" + S.user.uid), { classId, uid: S.user.uid, role: "owner", joinedAt: Date.now() });
  await setDoc(doc(db, "classCodes", code), { classId });
  return { classId, code, name };
}
function inviteMessage(name, code) {
  const site = new URL("./", location.href).href;
  return "Hi! Join my classroom \"" + name + "\" on Locker.\n\n" +
    "1. Make a free account at " + site + "\n" +
    "2. Tap Join classroom and enter this code: " + code + "\n\n" +
    "Thanks for joining Locker and we hope you have fun!\n-The Locker Team";
}

$("copyInvite").onclick = async () => {
  try { await navigator.clipboard.writeText($("inviteText").value); toast("Message copied!"); }
  catch (e) { $("inviteText").select(); toast("Press and hold the text to copy it."); }
};
$("shareInvite").onclick = async () => {
  if (!navigator.share) return toast("Sharing is not available here. Use Copy instead.");
  try { await navigator.share({ text: $("inviteText").value }); } catch (e) {}
};
$("s4Done").onclick = () => finishOnboarding();

async function finishOnboarding() {
  const data = { ...S.profile, onboarded: true, updatedAt: Date.now() };
  try { await setDoc(doc(db, "users", S.user.uid), data); }
  catch (e) { return onboardMsg("Could not finish setup. Check your internet and try again."); }
  S.profile = data; S.users[S.user.uid] = data;
  const pick = S.pendingClassId;
  S.pendingClassId = null;
  enterApp(pick);
}

$("addClass").onclick = () => { S.onboardMode = "new"; show("onboard"); stepTo(2); };
$("editProfile").onclick = () => startOnboarding("edit");

/* ---------- Main app ---------- */
async function enterApp(selectId) {
  resetClass();
  show("app");
  renderProfileCard();
  try { await loadClasses(); } catch (e) { S.classes = []; toast("Could not load your classrooms."); }
  renderSideClasses();
  const pick = S.classes.find(c => c.classId === selectId) || S.classes[0] || null;
  selectClass(pick);
}

async function loadClasses() {
  const snap = await getDocs(query(collection(db, "members"), where("uid", "==", S.user.uid)));
  const list = await Promise.all(snap.docs.map(async d => {
    const m = d.data();
    try {
      const c = await getDoc(doc(db, "classes", m.classId));
      return c.exists() ? { ...c.data(), classId: c.id, myRole: m.role } : null;
    } catch (e) { return null; }
  }));
  S.classes = list.filter(Boolean);
}

function renderProfileCard() {
  const p = S.profile || {};
  const img = $("sideAvatar");
  img.src = p.photo || ""; img.classList.toggle("empty", !p.photo);
  $("sideName").textContent = p.name || "Student";
  $("sideBio").textContent = p.bio || "";
}

function renderSideClasses() {
  const box = $("classList"); box.textContent = "";
  if (!S.classes.length) box.append(el("p", "note", "No classrooms yet."));
  S.classes.forEach(c => {
    const b = el("button", "item" + (S.cls && S.cls.classId === c.classId ? " on" : ""), c.name);
    b.onclick = () => { selectClass(c); if (mobile()) appEl.classList.remove("open"); };
    box.append(b);
  });
}

function selectClass(c) {
  resetClass();
  S.cls = c || null;
  S.posts = []; S.likes = []; S.events = []; S.reports = []; S.members = [];
  renderSideClasses();
  $("title").textContent = c ? c.name : "No classroom yet";
  $("classCode").textContent = c ? "Code " + c.code : "";
  $("evForm").classList.toggle("hidden", !isOwnerOf(c));
  renderPosts(); renderMembers(); renderEvents(); renderReports();
  renderTabs();
  go("feed");
  if (!c) return;
  const cid = c.classId;
  S.clsUnsubs.push(onSnapshot(query(collection(db, "posts"), where("classId", "==", cid), orderBy("createdAt", "desc"), limit(100)),
    s => { S.posts = s.docs.map(d => ({ id: d.id, ...d.data() })); renderPosts(); ensureUsers(S.posts.map(p => p.author)); }, onErr));
  S.clsUnsubs.push(onSnapshot(query(collection(db, "likes"), where("classId", "==", cid)),
    s => { S.likes = s.docs.map(d => ({ id: d.id, ...d.data() })); renderPosts(); }, onErr));
  S.clsUnsubs.push(onSnapshot(query(collection(db, "members"), where("classId", "==", cid)),
    s => { S.members = s.docs.map(d => ({ id: d.id, ...d.data() })); renderMembers(); ensureUsers(S.members.map(m => m.uid)); }, onErr));
  S.clsUnsubs.push(onSnapshot(query(collection(db, "events"), where("classId", "==", cid), orderBy("at", "asc")),
    s => { S.events = s.docs.map(d => ({ id: d.id, ...d.data() })); renderEvents(); }, onErr));
  if (isOwnerOf(c) || S.mod) {
    S.clsUnsubs.push(onSnapshot(query(collection(db, "reports"), where("classId", "==", cid)),
      s => { S.reports = s.docs.map(d => ({ id: d.id, ...d.data() })); renderReports(); renderTabs(); }, onErr));
  }
}

async function ensureUsers(uids) {
  const missing = [...new Set(uids)].filter(u => u && !S.users[u]);
  if (!missing.length) return;
  missing.forEach(u => { S.users[u] = { name: "Student", photo: "", bio: "", contactEmail: "" }; });
  await Promise.all(missing.map(async u => {
    try { const s = await getDoc(doc(db, "users", u)); if (s.exists()) S.users[u] = s.data(); } catch (e) {}
  }));
  renderPosts(); renderMembers();
}

function renderTabs() {
  const t = $("tabs"); t.textContent = "";
  const tabs = [["feed", "Feed"], ["members", "Classmates"], ["calendar", "Calendar"]];
  if (S.cls && (isOwnerOf(S.cls) || S.mod)) tabs.push(["mod", "Moderate" + (S.reports.length ? " (" + S.reports.length + ")" : "")]);
  tabs.forEach(([k, l]) => { const b = el("button", S.tab === k ? "on" : "", l); b.onclick = () => go(k); t.append(b); });
}
function go(tab) {
  S.tab = tab;
  ["feed", "members", "calendar", "mod"].forEach(k => $(k).classList.toggle("hidden", k !== tab));
  renderTabs();
}

function renderPosts() {
  const box = $("posts"); box.textContent = "";
  if (!S.cls) { box.append(el("p", "note", "You're not in a classroom yet. Open the menu and tap + Join or create a classroom.")); return; }
  if (!S.posts.length) box.append(el("p", "note", "No posts yet. Say hi to your classmates!"));
  S.posts.forEach(p => {
    const u = S.users[p.author] || {};
    const d = el("div", "post");
    const meta = el("div", "meta");
    meta.append(avatar(u.photo, "sm"), el("b", "", p.authorName || u.name || "Student"), document.createTextNode(when(p.createdAt)));
    const n = S.likes.filter(l => l.post === p.id).length;
    const liked = S.likes.some(l => l.id === p.id + "_" + S.user.uid);
    const a = el("div", "actions");
    const lb = el("button", liked ? "on" : "", (liked ? "Liked " : "Like ") + n);
    lb.onclick = () => toggleLike(p, liked);
    const rb = el("button", "", "Report");
    rb.onclick = () => report(p);
    a.append(lb, rb);
    if (p.author === S.user.uid || isOwnerOf(S.cls) || S.mod) {
      const x = el("button", "", "Delete");
      x.onclick = () => deleteDoc(doc(db, "posts", p.id)).catch(onErr);
      a.append(x);
    }
    d.append(meta, el("p", "", p.text), a);
    box.append(d);
  });
}

async function toggleLike(p, liked) {
  const ref = doc(db, "likes", p.id + "_" + S.user.uid);
  try {
    if (liked) await deleteDoc(ref);
    else await setDoc(ref, { post: p.id, user: S.user.uid, classId: S.cls.classId });
  } catch (e) { toast("Could not save."); }
}
async function report(p) {
  try {
    await addDoc(collection(db, "reports"), { post: p.id, by: S.user.uid, text: p.text, classId: S.cls.classId, at: Date.now() });
    toast("Reported. The teacher will review it.");
  } catch (e) { toast("Could not report."); }
}

$("postBtn").onclick = async () => {
  const input = $("newPost"), text = input.value.trim();
  if (!text || !S.cls) return;
  try {
    await addDoc(collection(db, "posts"), { text, author: S.user.uid, authorName: S.profile.name || "Student", classId: S.cls.classId, createdAt: serverTimestamp() });
    input.value = "";
  } catch (e) { toast("Could not post."); }
};

function renderMembers() {
  const box = $("memberList"); box.textContent = "";
  if (!S.cls) return;
  box.append(el("p", "note", S.members.length + " in this classroom"));
  [...S.members].sort((a, b) => (b.role === "owner") - (a.role === "owner")).forEach(m => {
    const u = S.users[m.uid] || {};
    const r = el("div", "row");
    r.append(avatar(u.photo, "lg"));
    const info = el("div", "info");
    info.append(el("b", "", (u.name || "Student") + (m.role === "owner" ? " · Teacher" : "")));
    if (u.bio) info.append(el("span", "", u.bio));
    if (u.contactEmail) info.append(el("span", "", u.contactEmail));
    r.append(info);
    box.append(r);
  });
}

function renderEvents() {
  const b = $("events"); b.textContent = "";
  if (!S.cls) return;
  if (!S.events.length) b.append(el("p", "note", "No events yet."));
  S.events.forEach(e => {
    const r = el("div", "row"), i = el("div", "info");
    i.append(el("b", "", e.title), el("span", "", e.when || ""));
    r.append(i);
    if (isOwnerOf(S.cls)) {
      const x = el("button", "btn", "Remove");
      x.onclick = () => deleteDoc(doc(db, "events", e.id)).catch(onErr);
      r.append(x);
    }
    b.append(r);
  });
}
$("evAdd").onclick = async () => {
  const title = $("evTitle").value.trim(), w = $("evWhen").value.trim();
  if (!title || !S.cls) return;
  try {
    await addDoc(collection(db, "events"), { classId: S.cls.classId, title, when: w, at: Date.now() });
    $("evTitle").value = ""; $("evWhen").value = "";
  } catch (e) { toast("Only the teacher can add events."); }
};

function renderReports() {
  const b = $("reports"); b.textContent = "";
  if (!S.cls) return;
  if (!S.reports.length) b.append(el("p", "note", "No reports. All clear."));
  S.reports.forEach(r => {
    const d = el("div", "post");
    d.append(el("div", "meta", "Reported post"), el("p", "", r.text || ""));
    const a = el("div", "actions");
    const del = el("button", "", "Delete post");
    del.onclick = async () => {
      try { await deleteDoc(doc(db, "posts", r.post)); } catch (e) {}
      await deleteDoc(doc(db, "reports", r.id)).catch(onErr);
    };
    const dis = el("button", "", "Dismiss");
    dis.onclick = () => deleteDoc(doc(db, "reports", r.id)).catch(onErr);
    a.append(del, dis);
    d.append(a);
    b.append(d);
  });
}

$("menuBtn").onclick = () => { if (mobile()) appEl.classList.toggle("open"); else appEl.classList.toggle("collapsed"); };
$("scrim").onclick = () => appEl.classList.remove("open");
