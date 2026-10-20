import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteField, deleteDoc, getDoc, getDocs, query, where, limit, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { settings } from "./settings.js";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);
const appEl = $("app");
const mobile = () => matchMedia("(max-width:720px)").matches;
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function toast(t) { const d = el("div", "toast", t); document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
function onErr(e) {
  if (!e) return;
  if (e.code === "permission-denied") toast("You do not have access to that.");
  else toast("Something went wrong. (" + (e.code || "error") + ")");
}
function ms(ts) { return ts && ts.toMillis ? ts.toMillis() : Date.now(); }
function when(ts) { const d = ts && ts.toDate ? ts.toDate() : new Date(ts || Date.now()); return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }); }
function show(name) { ["login", "verify", "onboard", "app"].forEach(s => $(s).classList.toggle("hidden", s !== name)); }
function avatar(src, size) { const i = el("img", "avatar" + (size ? " " + size : "")); if (src) i.src = src; else i.classList.add("empty"); i.alt = ""; return i; }
function makeCode() { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c = ""; for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]; return c; }
function configured(v) { return !!v && !String(v).startsWith("PASTE"); }
function isOwnerOf(c) { return !!c && c.ownerUid === S.user.uid; }
function isStudent() { return !!S.profile && S.profile.role === "student"; }
function convIdFor(a, b) { return [a, b].sort().join("_"); }

/* ---------- State ---------- */
const S = { user: null, profile: null, mod: false, classes: [], cls: null, posts: [], likes: [], events: [], reports: [], members: [], users: {}, clsUnsubs: [], tab: "feed", onboardMode: "new", photoData: "", pendingClassId: null, myRole: null };
const DM = { convs: [], convUnsub: null, msgs: [], msgUnsub: null, cur: null, reactOpen: null, menuOpen: null, mates: [], matesUnsub: null };
const EMOJIS = ["😀", "😂", "❤️", "👍", "🔥", "😮", "😢", "🙏", "🎉", "😎", "🤔", "👏"];
const REACTS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function resetClass() { S.clsUnsubs.forEach(u => u()); S.clsUnsubs = []; }
function unsubAll() {
  resetClass();
  if (DM.convUnsub) DM.convUnsub();
  if (DM.matesUnsub) DM.matesUnsub();
  if (DM.msgUnsub) DM.msgUnsub();
  DM.convUnsub = null; DM.matesUnsub = null; DM.msgUnsub = null;
  DM.convs = []; DM.mates = []; DM.msgs = []; DM.cur = null; DM.reactOpen = null; DM.menuOpen = null;
}

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

$("googleBtn").onclick = async () => {
  $("loginMsg").textContent = "";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      $("loginMsg").textContent = "Google sign-in did not work. Your school may block it. Try email instead.";
    }
  }
};

$("toggleBtn").onclick = () => {
  creating = !creating;
  $("nameIn").classList.toggle("hidden", !creating);
  $("authBtn").textContent = creating ? "Create account" : "Sign in";
  $("toggleBtn").textContent = creating ? "I already have an account" : "Create an account";
  $("loginSub").textContent = creating ? "Make an account to get started." : "Welcome to Locker!";
  $("loginMsg").textContent = "";
};
$("authBtn").onclick = async () => {
  const email = $("emailIn").value.trim(), pass = $("passIn").value, name = $("nameIn").value.trim();
  $("loginMsg").textContent = "";
  if (creating && !name) { $("loginMsg").textContent = "Please enter your name."; return; }
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
  if (!email) { $("loginMsg").textContent = "Type your email above first, then tap Forgot password."; return; }
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
$("sideSignOut").onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  unsubAll();
  S.user = user; S.profile = null; S.mod = false; S.cls = null; S.classes = [];
  if (!user) { show("login"); return; }
  if (!user.emailVerified) { show("verify"); return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    S.profile = snap.exists() ? snap.data() : null;
    S.mod = (await getDoc(doc(db, "mods", user.uid))).exists();
  } catch (e) { toast("Could not load your account. Refresh and try again."); return; }
  if (S.profile) S.users[user.uid] = S.profile;
  if (!S.profile || !S.profile.onboarded) { startOnboarding("new"); return; }
  enterApp();
});

/* ---------- Onboarding (5 steps) ---------- */
function setPhoto(src) { const img = $("photoPreview"); img.src = src || ""; img.classList.toggle("empty", !src); }
function onboardMsg(t) { $("onboardMsg").textContent = t; }
function stepTo(n) {
  [1, 2, 3, 4, 5].forEach(i => $("s" + i).classList.toggle("hidden", i !== n));
  $("stepLabel").textContent = S.onboardMode === "edit" ? "Edit profile" : "Step " + n + " of 5";
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
  $("pUsername").value = p.username || "";
  $("pRole").value = p.role || "";
  if ($("pTheme")) $("pTheme").value = p.theme || "default";
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
  const username = $("pUsername").value.trim().toLowerCase();
  const role = $("pRole").value;
  if (!name) { onboardMsg("Please enter your name."); return false; }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) { onboardMsg("Username must be 3 to 20 letters, numbers, or underscores."); return false; }
  if (role !== "teacher" && role !== "student") { onboardMsg("Please choose Teacher or Student."); return false; }
  if (!contactEmail) { onboardMsg("Please enter a contact email."); return false; }
  const oldUsername = S.profile && S.profile.username;
  if (username !== oldUsername) {
    try { await setDoc(doc(db, "usernames", username), { uid: S.user.uid }); }
    catch (e) { onboardMsg("That username is taken. Try another one."); return false; }
    if (oldUsername) await deleteDoc(doc(db, "usernames", oldUsername)).catch(() => {});
  }
  const theme = ($("pTheme") && $("pTheme").value) || "default";
  const data = { name, bio, contactEmail, username, role, theme, photo: S.photoData || "", onboarded: !!(S.profile && S.profile.onboarded), updatedAt: Date.now() };
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

$("s2Create").onclick = () => (S.profile && S.profile.role === "teacher")
  ? stepTo(3)
  : onboardMsg("Only teachers can create classrooms. Ask your teacher for the classroom code.");
$("s2Back").onclick = () => (S.profile && S.profile.onboarded) ? enterApp(S.cls && S.cls.classId) : stepTo(1);

async function joinClass(classId) {
  const id = classId + "_" + S.user.uid;
  let exists = false;
  try { exists = (await getDoc(doc(db, "members", id))).exists(); } catch (e) {}
  if (exists) return;
  await setDoc(doc(db, "members", id), { classId, uid: S.user.uid, role: "student", joinedAt: Date.now() });
}
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
  stepTo(5);
};

$("s3Back").onclick = () => stepTo(2);
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
$("copyInvite").onclick = async () => {
  try { await navigator.clipboard.writeText($("inviteText").value); toast("Message copied!"); }
  catch (e) { $("inviteText").select(); toast("Press and hold the text to copy it."); }
};
$("shareInvite").onclick = async () => {
  if (!navigator.share) return toast("Sharing is not available here. Use Copy instead.");
  try { await navigator.share({ text: $("inviteText").value }); } catch (e) {}
};
$("s4Done").onclick = () => stepTo(5);

$("s5Add").onclick = async () => {
  const r = await addMate($("s5User").value);
  if (r.error) return onboardMsg(r.error);
  $("s5User").value = "";
  onboardMsg(r.message);
};
$("s5Done").onclick = () => finishOnboarding();

async function finishOnboarding() {
  const data = { ...S.profile, onboarded: true, updatedAt: Date.now() };
  try { await setDoc(doc(db, "users", S.user.uid), data); }
  catch (e) { return onboardMsg("Could not finish setup. Check your internet and try again."); }
  S.profile = data; S.users[S.user.uid] = data;
  const pick = S.pendingClassId;
  S.pendingClassId = null;
  enterApp(pick);
}

$("addClass").onclick = () => {
  if (!S.profile || !S.profile.username || !S.profile.role) return startOnboarding("edit");
  S.onboardMode = "new";
  show("onboard");
  stepTo(2);
};
$("editProfile").onclick = () => startOnboarding("edit");

/* ---------- Main app ---------- */
async function enterApp(selectId) {
  resetClass();
  show("app");
  renderProfileCard();
  subscribeConvs();
  subscribeMates();
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
  $("sideBio").textContent = (p.username ? "@" + p.username : "") + (p.bio ? (p.username ? " · " : "") + p.bio : "");
  const card = $("profileCard");
  if (card) card.className = "profile-card" + (p.theme && p.theme !== "default" ? " theme-" + p.theme : "");
}

function renderSideClasses() {
  const box = $("classList"); box.textContent = "";
  if (!S.classes.length) box.append(el("p", "note", "No classrooms yet."));
  S.classes.forEach(c => {
    const row = el("div", "class-row");
    const b = el("button", "item" + (S.cls && S.cls.classId === c.classId ? " on" : ""), c.name);
    b.onclick = () => { selectClass(c); if (mobile()) appEl.classList.remove("open"); };
    row.append(b);
    if (isOwnerOf(c) || S.mod) {
      const del = el("button", "class-del", "🗑");
      del.title = "Delete classroom";
      del.onclick = (e) => {
        e.stopPropagation();
        deleteClassroom(c);
      };
      row.append(del);
    }
    box.append(row);
  });
}

async function deleteClassroom(cls) {
  if (!cls) return;
  if (!(isOwnerOf(cls) || S.mod)) return toast("Only the owner or a mod can delete this classroom.");
  const typed = window.prompt("To delete this classroom, type its name exactly:\n" + cls.name);
  if (typed === null) return;
  if (typed.trim() !== cls.name) return toast("The name did not match. Classroom not deleted.");
  try {
    const mems = await getDocs(query(collection(db, "members"), where("classId", "==", cls.classId)));
    for (const d of mems.docs) {
      await deleteDoc(d.ref).catch(err => console.warn("member delete", err));
    }
    if (cls.code) await deleteDoc(doc(db, "classCodes", cls.code)).catch(err => console.warn("code delete", err));
    await deleteDoc(doc(db, "classes", cls.classId));
    toast("Classroom deleted.");
    if (S.cls && S.cls.classId === cls.classId) S.cls = null;
    await loadClasses();
    renderSideClasses();
    selectClass(S.classes[0] || null);
  } catch (e) {
    console.error("deleteClassroom", e);
    toast("Could not delete the classroom. (" + (e.code || "error") + ")");
  }
}

function selectClass(c) {
  resetClass();
  S.cls = c || null;
  S.posts = []; S.likes = []; S.events = []; S.reports = []; S.members = [];
  renderSideClasses();
  $("title").textContent = c ? c.name : "No classroom yet";
  $("classCode").textContent = c ? "Code " + c.code : "";
  S.myRole = c ? c.myRole : null;
  $("evForm").classList.toggle("hidden", !(isOwnerOf(c) || S.myRole === "admin"));
  renderTabs();
  go("feed");
  renderAll();
  if (!c) return;
  const cid = c.classId;
  S.clsUnsubs.push(onSnapshot(query(collection(db, "posts"), where("classId", "==", cid), limit(200)), s => {
    S.posts = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    renderPosts();
    ensureUsers(S.posts.map(p => p.author));
  }, onErr));
  S.clsUnsubs.push(onSnapshot(query(collection(db, "likes"), where("classId", "==", cid)), s => {
    S.likes = s.docs.map(d => ({ id: d.id, ...d.data() })); renderPosts();
  }, onErr));
  S.clsUnsubs.push(onSnapshot(query(collection(db, "members"), where("classId", "==", cid)), s => {
    S.members = s.docs.map(d => ({ id: d.id, ...d.data() })); renderMembers();
    ensureUsers(S.members.map(m => m.uid));
  }, onErr));
  S.clsUnsubs.push(onSnapshot(query(collection(db, "events"), where("classId", "==", cid)), s => {
    S.events = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.at || 0) - (b.at || 0));
    renderEvents();
  }, onErr));
  if (isOwnerOf(c) || S.myRole === "admin" || S.mod) {
    S.clsUnsubs.push(onSnapshot(query(collection(db, "reports"), where("classId", "==", cid)), s => {
      S.reports = s.docs.map(d => ({ id: d.id, ...d.data() }));
      renderReports(); renderTabs();
    }, onErr));
  }
}

function renderAll() { renderPosts(); renderMembers(); renderEvents(); renderReports(); }

async function ensureUsers(uids) {
  const missing = [...new Set(uids)].filter(u => u && !S.users[u]);
  if (!missing.length) return;
  missing.forEach(u => { S.users[u] = { name: "Student", photo: "", bio: "", contactEmail: "", username: "", role: "" }; });
  await Promise.all(missing.map(async u => {
    try { const s = await getDoc(doc(db, "users", u)); if (s.exists()) S.users[u] = s.data(); } catch (e) {}
  }));
  renderPosts(); renderMembers(); renderConvs(); renderMates(); renderMsgs();
}

function renderTabs() {
  const t = $("tabs"); t.textContent = "";
  const tabs = [["feed", "Feed"], ["members", "Classmates"], ["calendar", "Calendar"]];
  if (isStudent()) tabs.push(["dms", "Messages"]);
  if (S.cls && (isOwnerOf(S.cls) || S.myRole === "admin" || S.mod)) tabs.push(["mod", "Moderate" + (S.reports.length ? " (" + S.reports.length + ")" : "")]);
  tabs.forEach(([k, l]) => { const b = el("button", S.tab === k ? "on" : "", l); b.onclick = () => go(k); t.append(b); });
}
function go(tab) {
  S.tab = tab;
  ["feed", "members", "calendar", "dms", "mod"].forEach(k => $(k).classList.toggle("hidden", k !== tab));
  const titles = { feed: S.cls ? S.cls.name : "No classroom yet", members: "Classmates", calendar: "Calendar", dms: "Messages", mod: "Moderation" };
  if (tab !== "feed" && tab !== "members" && tab !== "calendar" && tab !== "dms" && tab !== "mod") return;
  $("title").textContent = titles[tab];
  renderTabs();
}

/* ---------- Posts and reports ---------- */
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
    if (p.author === S.user.uid || isOwnerOf(S.cls) || S.myRole === "admin" || S.mod) {
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
    const sent = await sendReportEmail({ report_type: "Class post", reporter: S.profile.name, reporter_uid: S.user.uid, classroom: S.cls.name, reason: "Reported from the class feed", message: p.text, convo_id: S.cls.classId });
    toast(sent ? "Reported. Thank you." : "Reported. Email is not set up yet.");
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

/* ---------- Classmates ---------- */
function renderMembers() {
  const box = $("memberList"); box.textContent = "";
  if (!S.cls) return;
  $("deleteClass").classList.toggle("hidden", !isOwnerOf(S.cls));
  box.append(el("p", "note", S.members.length + " in this classroom"));
  const roleLabel = { owner: "Teacher", admin: "Admin", student: "Student" };
  const rank = r => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
  [...S.members].sort((a, b) => rank(a.role) - rank(b.role)).forEach(m => {
    const u = S.users[m.uid] || {};
    const r = el("div", "row");
    r.style.cursor = "pointer";
    r.append(avatar(u.photo, "lg"));
    const info = el("div", "info");
    info.append(el("b", "", u.name || "Student"));
    info.append(el("span", "", (roleLabel[m.role] || "Student") + (u.username ? " · @" + u.username : "")));
    if (u.bio) info.append(el("span", "", u.bio));
    r.append(info);
    r.onclick = (e) => {
      if (e.target.closest("select, button")) return;
      openProfile(m.uid);
    };
    if (isOwnerOf(S.cls) && m.role !== "owner") {
      const sel = el("select", "field");
      [["student", "Student"], ["admin", "Admin"]].forEach(([v, label]) => {
        const o = el("option", "", label); o.value = v;
        if (m.role === v) o.selected = true;
        sel.append(o);
      });
      sel.onchange = () => updateDoc(doc(db, "members", m.id), { role: sel.value })
        .then(() => toast("Role updated."))
        .catch(() => toast("Could not change role."));
      const rm = el("button", "btn small", "Remove");
      rm.onclick = (e) => {
        e.stopPropagation();
        if (!window.confirm("Remove " + (u.name || "this person") + " from the classroom?")) return;
        deleteDoc(doc(db, "members", m.id)).then(() => toast("Removed.")).catch(() => toast("Could not remove."));
      };
      const act = el("div", "member-actions");
      act.append(sel, rm);
      r.append(act);
    }
    box.append(r);
  });
}

$("deleteClass").onclick = async () => {
  if (!S.cls || !isOwnerOf(S.cls)) return;
  const cls = S.cls;
  const typed = window.prompt("To delete this classroom, type its name exactly:\n" + cls.name);
  if (typed === null) return;
  if (typed.trim() !== cls.name) return toast("The name did not match. Classroom not deleted.");
  try {
    const mems = await getDocs(query(collection(db, "members"), where("classId", "==", cls.classId)));
    for (const d of mems.docs) {
      if (d.id !== cls.classId + "_" + S.user.uid) await deleteDoc(d.ref).catch(() => {});
    }
    await deleteDoc(doc(db, "classCodes", cls.code)).catch(() => {});
    await deleteDoc(doc(db, "members", cls.classId + "_" + S.user.uid)).catch(() => {});
    await deleteDoc(doc(db, "classes", cls.classId));
    toast("Classroom deleted.");
    S.cls = null;
    enterApp(null);
  } catch (e) { toast("Could not delete the classroom. Try again."); }
};

/* ---------- Events ---------- */
function renderEvents() {
  const b = $("events"); b.textContent = "";
  if (!S.cls) return;
  if (!S.events.length) b.append(el("p", "note", "No events yet."));
  S.events.forEach(e => {
    const r = el("div", "row"), i = el("div", "info");
    i.append(el("b", "", e.title), el("span", "", e.when || ""));
    r.append(i);
    if (isOwnerOf(S.cls) || S.myRole === "admin") {
      const x = el("button", "btn small", "Remove");
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

/* ---------- Moderation ---------- */
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

/* ---------- Mates (request, then accept) ---------- */
function subscribeMates() {
  if (DM.matesUnsub) DM.matesUnsub();
  DM.matesUnsub = onSnapshot(query(collection(db, "mates"), where("participants", "array-contains", S.user.uid)),
    s => { DM.mates = s.docs.map(d => ({ id: d.id, ...d.data() })); renderMates(); }, onErr);
}
function mateOther(m) { return m.participants.find(u => u !== S.user.uid); }
function mateName(m) { const o = mateOther(m); return (S.users[o] && S.users[o].name) || (m.names && m.names[o]) || "Mate"; }
function renderMates() {
  const box = $("mateList"); box.textContent = "";
  const reqBox = $("mateRequests"); reqBox.textContent = "";
  const accepted = DM.mates.filter(m => m.status === "accepted");
  const incoming = DM.mates.filter(m => m.status === "pending" && m.requestedBy !== S.user.uid);
  const outgoing = DM.mates.filter(m => m.status === "pending" && m.requestedBy === S.user.uid);
  incoming.forEach(m => {
    const r = el("div", "row");
    const info = el("div", "info");
    info.append(el("b", "", mateName(m)), el("span", "", "wants to be your Mate"));
    const acc = el("button", "btn small", "Accept");
    acc.onclick = async () => {
      try { await updateDoc(doc(db, "mates", m.id), { status: "accepted" }); toast("You are now Mates!"); }
      catch (e) { toast("Could not accept."); }
    };
    r.append(info, acc);
    reqBox.append(r);
  });
  if (outgoing.length) reqBox.append(el("p", "note small", "Waiting for: " + outgoing.map(mateName).join(", ")));
  if (!accepted.length) { box.append(el("p", "note", "No Mates yet.")); return; }
  accepted.forEach(m => {
    const name = mateName(m);
    const uid = mateOther(m);
    const b = el("button", "item", name);
    b.onclick = () => {
      if (mobile()) appEl.classList.remove("open");
      openProfile(uid);
    };
    box.append(b);
  });
}
async function addMate(raw) {
  const uname = (raw || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(uname)) return { error: "Usernames are 3 to 20 letters, numbers, or underscores." };
  if (S.profile && uname === S.profile.username) return { error: "That's your own username." };
  let uid;
  try {
    const snap = await getDoc(doc(db, "usernames", uname));
    if (!snap.exists()) return { error: "No one has that username." };
    uid = snap.data().uid;
  } catch (e) { return { error: "Could not look up that username." }; }
  const me = S.user.uid;
  let otherName = uname;
  try { const us = await getDoc(doc(db, "users", uid)); if (us.exists()) otherName = us.data().name || uname; } catch (e) {}
  for (const id of [me + "_" + uid, uid + "_" + me]) {
    let snap = null;
    try { snap = await getDoc(doc(db, "mates", id)); } catch (e) {}
    if (snap && snap.exists()) {
      const d = snap.data();
      if (d.status === "accepted") return { error: "You are already Mates!" };
      if (d.requestedBy === me) return { error: "Request already sent. Waiting for " + otherName + " to add you back." };
      try { await updateDoc(doc(db, "mates", id), { status: "accepted" }); }
      catch (e) { return { error: "Could not accept that request. Try again." }; }
      return { name: otherName, message: "You and " + otherName + " are now Mates!" };
    }
  }
  try {
    await setDoc(doc(db, "mates", me + "_" + uid), {
      participants: [me, uid], names: { [me]: S.profile.name || "Student", [uid]: otherName },
      status: "pending", requestedBy: me, createdAt: Date.now()
    });
  } catch (e) { return { error: "Could not send the request. Try again." }; }
  return { name: otherName, message: "Request sent to " + otherName + ". You become Mates when they add you back." };
}
$("addMate").onclick = () => {
  $("mateMsg").textContent = ""; $("mateUser").value = "";
  $("mateModal").classList.remove("hidden");
};
$("mateCancel").onclick = () => $("mateModal").classList.add("hidden");
$("mateAdd").onclick = async () => {
  const r = await addMate($("mateUser").value);
  if (r.error) { $("mateMsg").textContent = r.error; return; }
  $("mateModal").classList.add("hidden");
  toast(r.message);
};

/* ---------- Direct messages (students only) ---------- */
function subscribeConvs() {
  if (DM.convUnsub) DM.convUnsub();
  DM.convUnsub = null;
  if (!isStudent()) return;
  DM.convUnsub = onSnapshot(query(collection(db, "conversations"), where("participants", "array-contains", S.user.uid)),
    s => { DM.convs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)); renderConvs(); }, onErr);
}
function renderConvs() {
  const box = $("convList"); box.textContent = "";
  // Keep the New group button at the top
  const newBtn = el("button", "btn wide", "New group chat");
  newBtn.id = "newGroupBtn";
  newBtn.style.margin = "8px 0 12px";
  newBtn.onclick = openGroupModal;
  box.append(newBtn);

  if (!DM.convs.length) {
    box.append(el("p", "note", "No conversations yet. Open Classmates or Mates and tap Message, or start a group chat."));
    return;
  }
  DM.convs.forEach(c => {
    let title, other = null;
    if (c.isGroup) {
      title = c.title || "Group chat";
    } else {
      other = c.participants.find(u => u !== S.user.uid);
      title = (S.users[other] && S.users[other].name) || (c.names && c.names[other]) || "Student";
    }
    const r = el("div", "row");
    r.style.cursor = "pointer";
    const info = el("div", "info");
    const label = c.isGroup ? ("👥 " + title) : title;
    info.append(el("b", "", label), el("span", "", c.lastText || ""));
    r.append(info);
    r.onclick = () => openChat(c.id, other, title, !!c.isGroup);
    box.append(r);
  });
}

function openGroupModal() {
  if (!isStudent()) return toast("Only students can create group chats.");
  const accepted = DM.mates.filter(m => m.status === "accepted");
  if (accepted.length < 2) return toast("You need at least 2 Mates to start a group chat.");
  const list = $("groupMateList");
  list.textContent = "";
  accepted.forEach(m => {
    const uid = mateOther(m);
    const name = mateName(m);
    const row = el("label", "row");
    row.style.cursor = "pointer";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = uid;
    cb.dataset.name = name;
    cb.style.marginRight = "10px";
    row.append(cb, document.createTextNode(name));
    list.append(row);
  });
  $("groupTitle").value = "";
  $("groupMsg").textContent = "";
  $("groupModal").classList.remove("hidden");
}

async function createGroupChat() {
  const title = ($("groupTitle").value || "").trim();
  if (!title) { $("groupMsg").textContent = "Give the group a name."; return; }
  const checks = [...$("groupMateList").querySelectorAll("input[type=checkbox]:checked")];
  if (checks.length < 2) { $("groupMsg").textContent = "Pick at least 2 Mates."; return; }
  const me = S.user.uid;
  const participants = [me, ...checks.map(c => c.value)];
  const names = { [me]: S.profile.name || "Student" };
  checks.forEach(c => { names[c.value] = c.dataset.name || "Student"; });
  try {
    const ref = await addDoc(collection(db, "conversations"), {
      participants,
      names,
      classId: S.cls ? S.cls.classId : "none",
      isGroup: true,
      title: title.slice(0, 40),
      createdBy: me,
      createdAt: Date.now(),
      lastAt: Date.now(),
      lastText: "",
      typing: {}
    });
    $("groupModal").classList.add("hidden");
    toast("Group created!");
    openChat(ref.id, null, title, true);
  } catch (e) {
    console.error(e);
    $("groupMsg").textContent = "Could not create the group. Try again.";
  }
}
async function startDM(otherUid, otherName) {
  if (!isStudent()) return toast("Only students can send messages.");
  if (otherUid === S.user.uid) return;
  const me = S.user.uid, id = convIdFor(me, otherUid);
  let exists = false;
  try { exists = (await getDoc(doc(db, "conversations", id))).exists(); } catch (e) {}
  if (!exists) {
    try {
      await setDoc(doc(db, "conversations", id), {
        participants: [me, otherUid],
        classId: S.cls ? S.cls.classId : "none",
        names: { [me]: S.profile.name || "Student", [otherUid]: otherName },
        createdAt: Date.now(), lastAt: Date.now(), lastText: "",
        typing: {}
      });
    } catch (e) {
      console.error("startDM error:", e);
      if (e && e.code === "permission-denied") {
        return toast("You can't message this person (blocked, not mates, or not in the same class).");
      }
      return toast("Could not start a conversation with this person.");
    }
  }
  if ($("profileModal")) $("profileModal").classList.add("hidden");
  go("dms");
  openChat(id, otherUid, otherName);
}
function closeChatSub() { if (DM.msgUnsub) DM.msgUnsub(); DM.msgUnsub = null; }
function openChat(id, otherUid, otherName, isGroup) {
  DM.cur = { id, other: otherUid, name: otherName, isGroup: !!isGroup };
  DM.reactOpen = null; DM.menuOpen = null;
  $("convList").classList.add("hidden");
  $("chat").classList.remove("hidden");
  const nameEl = $("chatName");
  nameEl.textContent = isGroup ? ("👥 " + otherName) : otherName;
  nameEl.style.cursor = isGroup ? "pointer" : "";
  nameEl.onclick = isGroup ? () => openGroupMenu() : null;
  $("emojiBar").classList.add("hidden");
  $("gifPanel").classList.add("hidden");
  closeChatSub();
  DM.msgUnsub = onSnapshot(query(collection(db, "conversations", id, "messages")), s => {
    DM.msgs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    renderMsgs();
    markReceipts();
  }, onErr);
}

async function openGroupMenu() {
  if (!DM.cur || !DM.cur.isGroup) return;
  let conv = DM.convs.find(c => c.id === DM.cur.id);
  if (!conv) {
    try {
      const snap = await getDoc(doc(db, "conversations", DM.cur.id));
      if (snap.exists()) conv = { id: snap.id, ...snap.data() };
    } catch (e) {}
  }
  if (!conv) return toast("Could not load group info.");

  const view = $("profileView");
  view.textContent = "";
  view.append(el("h2", "", conv.title || "Group chat"));
  view.append(el("p", "muted small", (conv.participants || []).length + " members"));

  const list = el("div", "");
  (conv.participants || []).forEach(uid => {
    const name = (S.users[uid] && S.users[uid].name) || (conv.names && conv.names[uid]) || "Member";
    const row = el("div", "row");
    row.append(el("span", "", name + (uid === S.user.uid ? " (you)" : "")));
    // Creator or mod can remove others
    if (uid !== S.user.uid && (conv.createdBy === S.user.uid || S.mod)) {
      const rm = el("button", "btn small", "Remove");
      rm.onclick = async () => {
        if (!window.confirm("Remove " + name + " from this group?")) return;
        try {
          const newParts = conv.participants.filter(u => u !== uid);
          const newNames = { ...(conv.names || {}) };
          delete newNames[uid];
          // Firestore array update via set whole participants
          await updateDoc(doc(db, "conversations", conv.id), {
            participants: newParts,
            names: newNames
          });
          toast(name + " removed.");
          openGroupMenu();
        } catch (e) {
          console.error(e);
          toast("Could not remove member. Rules may need a participants update allow.");
        }
      };
      row.append(rm);
    }
    list.append(row);
  });
  view.append(list);

  const actions = el("div", "form");
  actions.style.marginTop = "16px";

  // Leave group
  const leave = el("button", "btn wide", "Leave group");
  leave.onclick = async () => {
    if (!window.confirm("Leave this group chat?")) return;
    try {
      const newParts = (conv.participants || []).filter(u => u !== S.user.uid);
      if (newParts.length < 2) {
        // Too few left — delete the whole chat
        await deleteDoc(doc(db, "conversations", conv.id));
      } else {
        const newNames = { ...(conv.names || {}) };
        delete newNames[S.user.uid];
        await updateDoc(doc(db, "conversations", conv.id), {
          participants: newParts,
          names: newNames
        });
      }
      toast("Left the group.");
      $("profileModal").classList.add("hidden");
      closeChatSub();
      DM.cur = null;
      $("chat").classList.add("hidden");
      $("convList").classList.remove("hidden");
    } catch (e) {
      console.error(e);
      toast("Could not leave group.");
    }
  };
  actions.append(leave);

  // Delete entire group (creator or mod)
  if (conv.createdBy === S.user.uid || S.mod) {
    const del = el("button", "btn wide danger", "Delete group chat");
    del.onclick = async () => {
      if (!window.confirm("Delete this group chat for everyone? This cannot be undone.")) return;
      try {
        await deleteDoc(doc(db, "conversations", conv.id));
        toast("Group deleted.");
        $("profileModal").classList.add("hidden");
        closeChatSub();
        DM.cur = null;
        $("chat").classList.add("hidden");
        $("convList").classList.remove("hidden");
      } catch (e) {
        console.error(e);
        toast("Could not delete group. (" + (e.code || "error") + ")");
      }
    };
    actions.append(del);
  }

  view.append(actions);
  $("profileModal").classList.remove("hidden");
}
$("backChat").onclick = () => {
  closeChatSub();
  DM.cur = null; DM.msgs = [];
  $("chat").classList.add("hidden");
  $("convList").classList.remove("hidden");
};

function renderMsgs() {
  const box = $("msgs"); box.textContent = "";
  if (!DM.cur) return;
  const me = S.user.uid, other = DM.cur.other;
  const mine = DM.msgs.filter(m => m.from === me);
  const lastMine = mine[mine.length - 1];
  DM.msgs.forEach(m => {
    const isMe = m.from === me;
    const wrap = el("div", "bwrap " + (isMe ? "me" : "them"));
    const bubble = el("div", "bubble " + (isMe ? "me" : "them"));
    if (m.type === "gif" && m.gifUrl) { const g = el("img", "gif"); g.src = m.gifUrl; g.alt = "GIF"; bubble.append(g); }
    if (m.text) bubble.append(el("div", "btext", m.text));
    wrap.append(bubble);

    const counts = {};
    Object.values(m.reactions || {}).forEach(e => { counts[e] = (counts[e] || 0) + 1; });
    if (Object.keys(counts).length) {
      const rx = el("div", "rx");
      Object.entries(counts).forEach(([e, n]) => rx.append(el("span", "chip", n > 1 ? e + " " + n : e)));
      wrap.append(rx);
    }
    wrap.append(el("div", "bmeta", when(m.createdAt) + (m.editedAt ? " · edited" : "")));

    const act = el("div", "row-act");
    const rb = el("button", "react-btn", "😊");
    rb.title = "React";
    rb.onclick = () => { DM.reactOpen = DM.reactOpen === m.id ? null : m.id; DM.menuOpen = null; renderMsgs(); };
    const mb = el("button", "react-btn", "⋯");
    mb.title = "More";
    mb.onclick = () => { DM.menuOpen = DM.menuOpen === m.id ? null : m.id; DM.reactOpen = null; renderMsgs(); };
    act.append(rb, mb);
    wrap.append(act);

    if (DM.reactOpen === m.id) {
      const bar = el("div", "react-bar");
      REACTS.forEach(e => { const x = el("button", "", e); x.onclick = () => toggleReact(m, e); bar.append(x); });
      wrap.append(bar);
    }
    if (DM.menuOpen === m.id) {
      const menu = el("div", "menu-drop");
      if (isMe && m.type === "text") {
        const eb = el("button", "", "Edit message");
        eb.onclick = () => { DM.menuOpen = null; editMsg(m); };
        menu.append(eb);
      }
      if (!isMe) {
        const pb = el("button", "", "Report message");
        pb.onclick = () => { DM.menuOpen = null; reportDM(m); };
        menu.append(pb);
      }
      if (!menu.children.length) menu.append(el("span", "muted small", "No options here"));
      wrap.append(menu);
    }
    box.append(wrap);

    if (isMe && m === lastMine && other) {
      const status = (m.readBy && m.readBy[other]) ? "Read" : ((m.deliveredTo && m.deliveredTo[other]) ? "Delivered" : "Sent");
      box.append(el("div", "receipt", status));
    } else if (isMe && m === lastMine && DM.cur && DM.cur.isGroup) {
      box.append(el("div", "receipt", "Sent"));
    }
  });
  box.scrollTop = box.scrollHeight;
}

async function markReceipts() {
  if (!DM.cur) return;
  const me = S.user.uid;
  const visible = document.visibilityState === "visible" && !$("chat").classList.contains("hidden");
  for (const m of DM.msgs) {
    if (m.from === me) continue;
    const upd = {};
    if (!(m.deliveredTo && m.deliveredTo[me])) upd["deliveredTo." + me] = Date.now();
    if (visible && !(m.readBy && m.readBy[me])) upd["readBy." + me] = Date.now();
    if (Object.keys(upd).length) updateDoc(doc(db, "conversations", DM.cur.id, "messages", m.id), upd).catch(() => {});
  }
}

async function toggleReact(m, e) {
  const me = S.user.uid;
  const current = (m.reactions || {})[me];
  try {
    await updateDoc(doc(db, "conversations", DM.cur.id, "messages", m.id), { ["reactions." + me]: current === e ? deleteField() : e });
    DM.reactOpen = null;
  } catch (err) { toast("Could not react."); }
}

async function editMsg(m) {
  const t = window.prompt("Edit your message", m.text || "");
  if (t === null) return;
  const text = t.trim();
  if (!text) return toast("Message cannot be empty.");
  try {
    await updateDoc(doc(db, "conversations", DM.cur.id, "messages", m.id), { text: text.slice(0, 500), editedAt: Date.now() });
  } catch (err) { toast("Could not edit."); }
}

async function sendDM(type, text, gifUrl) {
  if (!DM.cur) return;
  const me = S.user.uid, id = DM.cur.id;
  const preview = type === "gif" ? "GIF" : text.slice(0, 80);
  try {
    await addDoc(collection(db, "conversations", id, "messages"), {
      from: me, type, text: text || "", gifUrl: gifUrl || null, createdAt: serverTimestamp(),
      editedAt: null, readBy: {}, deliveredTo: {}, reactions: {}
    });
    await updateDoc(doc(db, "conversations", id), { lastAt: Date.now(), lastText: preview });
  } catch (err) { toast("Could not send."); }
}
async function sendText() {
  const i = $("dmInput"), t = i.value.trim();
  if (!t) return;
  i.value = "";
  await sendDM("text", t, null);
}
$("dmSend").onclick = sendText;
$("dmInput").addEventListener("keydown", e => { if (e.key === "Enter") sendText(); });

EMOJIS.forEach(e => {
  const b = el("button", "", e);
  b.onclick = () => { $("dmInput").value += e; $("dmInput").focus(); };
  $("emojiBar").append(b);
});
$("dmEmoji").onclick = () => $("emojiBar").classList.toggle("hidden");

$("dmGif").onclick = async () => {
  if (!configured(settings.giphyKey)) return toast("GIFs are not set up yet.");
  const q = window.prompt("Search for a GIF");
  if (!q) return;
  const panel = $("gifPanel");
  panel.textContent = ""; panel.classList.remove("hidden");
  const closeX = el("button", "gif-close", "✕");
  closeX.title = "Close";
  closeX.onclick = () => panel.classList.add("hidden");
  panel.append(closeX);
  try {
    const r = await fetch("https://api.giphy.com/v1/gifs/search?api_key=" + encodeURIComponent(settings.giphyKey) + "&q=" + encodeURIComponent(q) + "&limit=12&rating=pg");
    const j = await r.json();
    if (!j.data || !j.data.length) panel.append(el("p", "note", "No GIFs found."));
    (j.data || []).forEach(g => {
      const url = g.images.fixed_height_small.url;
      const img = el("img"); img.src = url; img.alt = "GIF";
      img.onclick = () => { panel.classList.add("hidden"); sendDM("gif", "", url); };
      panel.append(img);
    });
  } catch (e) { panel.append(el("p", "note", "Could not load GIFs.")); }
};

async function sendReportEmail(params) {
  if (!configured(settings.emailjsPublicKey)) return false;
  try {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: settings.emailjsServiceId, template_id: settings.emailjsTemplateId, user_id: settings.emailjsPublicKey,
        template_params: { ...params, time: new Date().toLocaleString() }
      })
    });
    return r.ok;
  } catch (e) { return false; }
}
async function reportDM(m) {
  const reason = window.prompt("Why are you reporting this message?");
  if (reason === null) return;
  const text = m.text || (m.type === "gif" ? "[GIF]" : "");
  try {
    await addDoc(collection(db, "dmReports"), { by: S.user.uid, convId: DM.cur.id, messageId: m.id, text: text.slice(0, 500), reason: reason.slice(0, 300), at: Date.now() });
    const sent = await sendReportEmail({ report_type: "Direct message", reporter: S.profile.name, reporter_uid: S.user.uid, classroom: S.cls ? S.cls.name : "", reason, message: text, convo_id: DM.cur.id });
    toast(sent ? "Report sent. Thank you." : "Report saved. Email is not set up yet.");
  } catch (e) { toast("Could not send the report."); }
}

/* ---------- Profile view + Block + Remove Mate ---------- */
async function openProfile(uid) {
  if (!uid) return;
  let u = S.users[uid];
  if (!u) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) { u = snap.data(); S.users[uid] = u; }
    } catch (e) {}
  }
  if (!u) return toast("Could not load that profile.");

  const view = $("profileView");
  view.textContent = "";
  const theme = u.theme && u.theme !== "default" ? " theme-" + u.theme : "";
  const card = el("div", "profile-card" + theme);
  card.append(avatar(u.photo, "xl"));
  const info = el("div", "info");
  info.append(el("b", "", u.name || "Student"));
  info.append(el("span", "", (u.username ? "@" + u.username : "") + (u.role ? " · " + (u.role === "teacher" ? "Teacher" : "Student") : "")));
  if (u.bio) info.append(el("span", "", u.bio));
  card.append(info);
  view.append(card);

  const actions = el("div", "form");

  // Message (students only)
  if (uid !== S.user.uid && isStudent() && u.role === "student") {
    const msgBtn = el("button", "btn wide", "Message");
    msgBtn.onclick = () => startDM(uid, u.name || "Student");
    actions.append(msgBtn);
  }

  // Remove Mate (if they are accepted mates)
  const mateDoc = DM.mates.find(m => m.status === "accepted" && m.participants.includes(uid));
  if (mateDoc) {
    const rmMate = el("button", "btn wide", "Remove Mate");
    rmMate.onclick = async () => {
      if (!window.confirm("Remove " + (u.name || "this person") + " as a Mate?")) return;
      try {
        await deleteDoc(doc(db, "mates", mateDoc.id));
        toast("Mate removed.");
        $("profileModal").classList.add("hidden");
      } catch (e) { toast("Could not remove Mate."); }
    };
    actions.append(rmMate);
  }

  // Block / Unblock
  if (uid !== S.user.uid) {
    const blocked = await isBlocked(uid);
    const blkBtn = el("button", "btn wide" + (blocked ? "" : " danger"), blocked ? "Unblock" : "Block");
    blkBtn.onclick = async () => {
      if (blocked) {
        await unblockUser(uid);
        toast("Unblocked.");
      } else {
        if (!window.confirm("Block " + (u.name || "this person") + "? They won't be able to message you or send Mate requests.")) return;
        await blockUser(uid);
        toast("Blocked.");
      }
      openProfile(uid);
    };
    actions.append(blkBtn);
  }

  // Mod: delete profile (dangerous)
  if (S.mod && uid !== S.user.uid) {
    const delBtn = el("button", "btn wide danger", "Delete profile (mod)");
    delBtn.onclick = async () => {
      if (!window.confirm("PERMANENTLY delete this user's profile data? This cannot be undone easily.")) return;
      try {
        await deleteDoc(doc(db, "users", uid));
        if (u.username) await deleteDoc(doc(db, "usernames", u.username)).catch(() => {});
        toast("Profile data deleted.");
        $("profileModal").classList.add("hidden");
      } catch (e) { toast("Could not delete profile."); }
    };
    actions.append(delBtn);
  }

  view.append(actions);
  $("profileModal").classList.remove("hidden");
}

$("profileClose").onclick = () => $("profileModal").classList.add("hidden");

async function isBlocked(otherUid) {
  try {
    const a = await getDoc(doc(db, "blocks", S.user.uid + "_" + otherUid));
    return a.exists();
  } catch (e) { return false; }
}

async function blockUser(otherUid) {
  try {
    await setDoc(doc(db, "blocks", S.user.uid + "_" + otherUid), {
      blocker: S.user.uid, blocked: otherUid, at: Date.now()
    });
  } catch (e) { toast("Could not block."); }
}

async function unblockUser(otherUid) {
  try {
    await deleteDoc(doc(db, "blocks", S.user.uid + "_" + otherUid));
  } catch (e) { toast("Could not unblock."); }
}

/* ---------- Menu and drawer ---------- */
$("menuBtn").onclick = () => { if (mobile()) appEl.classList.toggle("open"); else appEl.classList.toggle("collapsed"); };
$("scrim").onclick = () => appEl.classList.remove("open");
if ($("openMessages")) $("openMessages").onclick = () => { go("dms"); if (mobile()) appEl.classList.remove("open"); };

$("groupCancel").onclick = () => $("groupModal").classList.add("hidden");
$("groupCreate").onclick = createGroupChat;
