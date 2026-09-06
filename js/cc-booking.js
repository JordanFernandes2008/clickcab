/* ============================================================
   Click Cabs — booking recorder
   ============================================================

   Records every booking to Firestore the moment the form is submitted,
   then hands the customer off to WhatsApp.

   WHY THIS IS A SHARED FILE
   Every other page on this site keeps its CSS and JS inline, deliberately.
   This one is shared because the same logic runs on six pages and the six
   copies must never drift apart. Fixing a bug here fixes it everywhere.
   It is still a plain static file — no build step, no bundler. Upload it
   with the HTML.

   THE ONE RULE THIS FILE EXISTS TO ENFORCE
   WhatsApp must open even if the database write fails. A booking that
   reaches WhatsApp but not Firestore is a minor inconvenience. A booking
   that reaches neither is a lost customer. Every failure path here ends
   with the WhatsApp window opening anyway.

   WHY THE WRITE IS NOT AWAITED
   window.open() only survives a popup blocker if it runs inside the same
   synchronous call stack as the user's click. Awaiting the Firestore write
   first would push window.open into a later microtask, and Safari and iOS
   would silently swallow it. So the write is *started* before the handoff
   and left to finish in the background — the original tab stays open
   because WhatsApp opens in a new one, so it always gets the chance.
============================================================ */

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ------------------------------------------------------------------
   Firebase web config. These values are public by design — they
   identify the project, they do not grant access to it. Access is
   controlled entirely by the security rules in firestore.rules.
   Never put an Admin SDK service-account key in this file.
------------------------------------------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyCoITUbvm1c0-Ud9VN_jVOZg99dg42jPgY",
  authDomain: "clickcabs-772bd.firebaseapp.com",
  projectId: "clickcabs-772bd",
  storageBucket: "clickcabs-772bd.firebasestorage.app",
  messagingSenderId: "861153834886",
  appId: "1:861153834886:web:eae295a297c47120c31e07"
};

/* Set this to your reCAPTCHA v3 site key once App Check is registered in
   the Firebase console. Leave it empty until then — an empty value simply
   skips App Check, which is correct while enforcement is off. Turning
   enforcement on in the console before filling this in will block every
   booking write. See HOW-IT-WORKS.md for the exact order to do it in. */
const CC_APPCHECK_SITE_KEY = "";

const WA_NUMBER = "919702290804";

/* A booking submitted faster than this is almost certainly a script.
   Three seconds is under the time it takes a real person to fill even the
   shortest of these forms, so it costs genuine customers nothing. */
const MIN_FILL_MS = 3000;

const QUEUE_KEY = "cc_pending_bookings";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const loadedAt = Date.now();

/* App Check is initialised lazily and defensively: if the key is missing or
   the module fails to load, booking must still work. */
if (CC_APPCHECK_SITE_KEY) {
  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js")
    .then(function (m) {
      m.initializeAppCheck(app, {
        provider: new m.ReCaptchaV3Provider(CC_APPCHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    })
    .catch(function (e) { console.warn("App Check unavailable:", e); });
}


/* ================= reference numbers ================= */

/* 0/O/1/I are removed so a reference read aloud over the phone or copied off
   a screenshot cannot be mistyped. Vowels are removed too, for a blunter
   reason: with vowels in the set a random five-character code will sooner or
   later spell something you would not want printed on a customer's booking.
   28^5 still gives 17.2 million codes. */
const REF_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXZ";

function newRef() {
  let out = "";
  try {
    const buf = new Uint32Array(5);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 5; i++) out += REF_ALPHABET[buf[i] % REF_ALPHABET.length];
  } catch (e) {
    /* crypto is unavailable on some very old browsers over plain http */
    for (let i = 0; i < 5; i++) {
      out += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
    }
  }
  return "CC-" + out;
}


/* ================= validation helpers ================= */

/* Indian mobile numbers: ten digits starting 6-9, with an optional +91 or
   0 in front. Returns the normalised ten digits, or "" if it isn't one. */
function normalisePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const m = digits.match(/^(?:91|0)?([6-9]\d{9})$/);
  return m ? m[1] : "";
}

function looksLikeEmail(raw) {
  const s = String(raw || "").trim();
  return s === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}


/* ================= the retry queue ================= */

/* If Firestore is unreachable the booking is parked in localStorage and
   retried the next time any page on the site loads. This is what stops a
   Firebase outage from quietly costing a day of leads. */

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch (e) { return []; }
}

function writeQueue(list) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-25))); }
  catch (e) { /* private mode, or storage full — nothing we can do */ }
}

function enqueue(doc) {
  const q = readQueue();
  q.push(doc);
  writeQueue(q);
}

function flushQueue() {
  const q = readQueue();
  if (!q.length) return;
  writeQueue([]);
  q.forEach(function (doc) {
    /* createdAt cannot survive JSON, so it is re-stamped on retry. The
       document keeps its original reference, which is what ties it to the
       WhatsApp conversation the customer already started. */
    doc.createdAt = serverTimestamp();
    addDoc(collection(db, "bookings"), doc).catch(function () { enqueue(doc); });
  });
}


/* ================= the reference panel ================= */

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = document.createElement("style");
  css.textContent = [
    ".cc-hp{position:absolute!important;left:-9999px!important;top:auto!important;",
    "width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important;}",
    ".cc-ref{margin-top:0.9rem;border-radius:10px;padding:0.85rem 1rem;",
    "background:#f2f8f4;border:1px solid #cfe6d8;color:#1c5334;",
    "font-family:'Inter',system-ui,sans-serif;font-size:0.82rem;line-height:1.55;",
    "opacity:0;transform:translateY(6px);transition:opacity .3s ease,transform .3s ease;}",
    ".cc-ref.in{opacity:1;transform:none;}",
    ".cc-ref.warn{background:#fff8ec;border-color:#f0d9ad;color:#7a5312;}",
    ".cc-ref strong{display:block;font-size:1.05rem;letter-spacing:0.06em;margin:0.15rem 0 0.3rem;}",
    ".cc-ref .cc-ref-sub{display:block;font-size:0.74rem;opacity:0.85;}",
    "@media (max-width:767px){.cc-ref{font-size:13px;}.cc-ref .cc-ref-sub{font-size:13px;}}"
  ].join("");
  document.head.appendChild(css);
}

/* `saved` is null while the write is still in flight, then true or false. */
function showRef(host, ref, saved) {
  injectStyles();
  const box = host && (host.closest(".booking-widget, .cc-box, .tour-form, .tm-right") || host);
  if (!box) return null;

  let el = box.querySelector(".cc-ref");
  if (!el) {
    el = document.createElement("div");
    el.className = "cc-ref";
    box.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("in"); });
  }

  const tail = saved === false
    ? "We could not reach our system just now, so keep this number handy — your WhatsApp message has all the details and we will pick it up from there."
    : "We have your request. Send the WhatsApp message to confirm, and quote this number if you call us.";

  el.classList.toggle("warn", saved === false);
  el.innerHTML =
    "Your booking reference<strong></strong><span class=\"cc-ref-sub\"></span>";
  el.querySelector("strong").textContent = ref;
  el.querySelector(".cc-ref-sub").textContent = tail;
  return el;
}


/* ================= the main entry point ================= */

/*  ccBooking.send({
 *    service : 'outstation',            // used by the dashboard filter
 *    source  : 'outstation.html',       // which page it came from
 *    host    : someElementInsideTheForm,
 *    fields  : { name, phone, email, pickup, drop, date, ... },
 *    message : function (ref) { return 'Hi ClickCabs...'; }
 *  })
 *
 *  Returns the reference string. Never throws, never returns without
 *  having opened WhatsApp.
 */
function send(opts) {
  const ref    = newRef();
  const fields = opts.fields || {};
  const host   = opts.host || document.body;

  /* --- open WhatsApp first, and unconditionally -------------------
     Everything after this point can fail without costing the lead. */
  let waOpened = false;
  try {
    const text = opts.message(ref);
    window.open(
      "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(text),
      "_blank"
    );
    waOpened = true;
  } catch (e) {
    console.error("WhatsApp handoff failed:", e);
  }

  /* --- spam gate --------------------------------------------------
     A filled honeypot or an impossibly fast submit skips the database
     write only. A real person who somehow beat the timer still gets
     their WhatsApp message through. */
  const hp = host.closest && host.closest(".booking-widget, .cc-box, .tour-form, .tm-right");
  const trap = hp && hp.querySelector(".cc-hp");
  const tooFast = (Date.now() - loadedAt) < MIN_FILL_MS;
  if ((trap && trap.value) || tooFast) {
    if (waOpened) showRef(host, ref, null);
    return ref;
  }

  /* --- build the document ----------------------------------------
     Only non-empty fields are stored, so documents stay small and the
     hasOnly() rule has less to check. */
  const doc = {
    ref: ref,
    service: String(opts.service || "other").slice(0, 20),
    source: String(opts.source || location.pathname).slice(0, 60),
    status: "new",
    createdAt: serverTimestamp()
  };
  ["name","phone","email","pickup","drop","date","time",
   "passengers","vehicle","package","tour","message"].forEach(function (k) {
    const v = fields[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      doc[k] = String(v).trim().slice(0, k === "message" ? 900 : 200);
    }
  });

  const panel = showRef(host, ref, null);

  addDoc(collection(db, "bookings"), doc)
    .then(function () { if (panel) showRef(host, ref, true); })
    .catch(function (err) {
      console.warn("Booking not saved, queued for retry:", err && err.code);
      enqueue(doc);
      if (panel) showRef(host, ref, false);
    });

  return ref;
}


window.ccBooking = {
  send: send,
  newRef: newRef,
  normalisePhone: normalisePhone,
  looksLikeEmail: looksLikeEmail,
  showRef: showRef
};

injectStyles();
flushQueue();
