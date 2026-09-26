/* ============================================================
   Click Cabs — site chrome shared by every page
   ============================================================

   1. The loading screen: a cartoon cab that drives in, bounces on its
      suspension while the page loads, then drives off the right edge.
   2. The "Log in" menu in the nav: closes on an outside click or Escape.

   WHY THIS IS A SHARED FILE
   Like js/cc-booking.js, this breaks the site's inline-everything
   convention on purpose: the same animation appears on ten pages and ten
   copies would drift the first time anyone tweaked it. Plain static file,
   no build step. Upload it with the HTML.

   WHY IT LOADS SYNCHRONOUSLY AT THE TOP OF <body>
   A loading screen has to be the first thing painted. Loaded any later,
   the page would flash into view and then get covered. The file is small
   and cached after the first page, so the cost is one request, once.

   PREVIEW WITHOUT IT DISAPPEARING
   Add ?ccloader=hold to any page URL and the screen stays up. Useful for
   showing the client or tweaking the animation.
============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
     Shown on the FIRST page of a visit, and on any reload. Not shown when
     clicking from page to page: on every click it would put a 1.4-second
     animation in front of every single navigation, which is the quickest
     way to make a loading screen irritating. Reloads count because that is
     how people check whether it is there. Set EVERY_PAGE to true to show
     it on every page load instead.
  --------------------------------------------------------------- */
  var EVERY_PAGE = false;
  var MIN_MS = 1400;   // long enough for the cab to be seen doing its thing
  var MAX_MS = 3200;   // never hold the page hostage to one slow resource
  var SEEN_KEY = 'cc_loader_seen';

  var hold = /[?&]ccloader=hold\b/.test(location.search);
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var seen = false;
  try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { /* private mode */ }

  var reloaded = false;
  try {
    var nav = performance.getEntriesByType('navigation')[0];
    reloaded = !!(nav && nav.type === 'reload');
  } catch (e) { /* very old browser: treat as a normal navigation */ }

  if (hold || EVERY_PAGE || !seen || reloaded) showLoader();

  /* ================= loading screen ================= */

  function showLoader() {
    var css = document.createElement('style');
    css.id = 'cc-loader-css';
    css.textContent = [
      'html.cc-loading,html.cc-loading body{overflow:hidden!important}',
      '.cc-loader{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;',
        'align-items:center;justify-content:center;gap:18px;',
        'background:radial-gradient(circle at 50% 40%,#0b5f8f 0%,#01456c 48%,#012a41 100%);',
        'transition:opacity .45s ease;font-family:Inter,system-ui,-apple-system,sans-serif}',
      '.cc-loader--out{opacity:0;pointer-events:none;transition:opacity .35s ease .3s}',
      '.cc-loader svg{width:min(340px,82vw);height:auto;overflow:visible}',
      '.cc-loader-logo{height:40px;width:auto;display:block}',
      '.cc-loader-text{color:rgba(255,255,255,.78);font-size:14px;font-weight:600;letter-spacing:.02em}',
      '.cc-loader-dots span{display:inline-block;animation:ccDot 1.1s infinite ease-in-out}',
      '.cc-loader-dots span:nth-child(2){animation-delay:.15s}',
      '.cc-loader-dots span:nth-child(3){animation-delay:.3s}',
      '.cc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',

      /* the cab arrives from the left with a little overshoot */
      '.cc-drive{animation:ccDriveIn .75s cubic-bezier(.2,1.35,.45,1) both}',
      /* suspension bob: body only, wheels stay planted on the road */
      '.cc-body{animation:ccBob .36s ease-in-out infinite alternate}',
      '.cc-wheel{transform-box:fill-box;transform-origin:center;animation:ccSpin .45s linear infinite}',
      '.cc-road-dashes{animation:ccRoad .42s linear infinite}',
      '.cc-skyline{animation:ccSky 7s linear infinite}',
      '.cc-beam{animation:ccBeam 1.2s ease-in-out infinite alternate}',
      '.cc-speed line{animation:ccSpeed .6s linear infinite}',
      '.cc-speed line:nth-child(2){animation-delay:.2s}',
      '.cc-speed line:nth-child(3){animation-delay:.4s}',
      '.cc-puff{transform-box:fill-box;transform-origin:center;animation:ccPuff .9s ease-out infinite}',
      '.cc-puff:nth-child(2){animation-delay:.3s}',
      '.cc-puff:nth-child(3){animation-delay:.6s}',
      /* exit: floor it off the right-hand edge */
      '.cc-loader--out .cc-drive{animation:ccDriveOut .5s cubic-bezier(.55,0,.85,.35) forwards}',

      '@keyframes ccDriveIn{from{transform:translateX(-230px)}to{transform:translateX(0)}}',
      '@keyframes ccDriveOut{from{transform:translateX(0)}to{transform:translateX(360px)}}',
      '@keyframes ccBob{from{transform:translateY(0) rotate(0)}to{transform:translateY(-3px) rotate(-.6deg)}}',
      '@keyframes ccSpin{to{transform:rotate(360deg)}}',
      '@keyframes ccRoad{to{transform:translateX(-48px)}}',
      '@keyframes ccSky{to{transform:translateX(-260px)}}',
      '@keyframes ccBeam{from{opacity:.45}to{opacity:.85}}',
      '@keyframes ccSpeed{0%{transform:translateX(14px);opacity:0}30%{opacity:.9}100%{transform:translateX(-22px);opacity:0}}',
      '@keyframes ccPuff{0%{transform:translateX(0) scale(.35);opacity:.85}100%{transform:translateX(-28px) scale(1.35);opacity:0}}',
      '@keyframes ccDot{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}',

      '@media (prefers-reduced-motion:reduce){',
        '.cc-loader *{animation:none!important}',
        '.cc-loader,.cc-loader--out{transition-duration:.15s;transition-delay:0s}',
      '}'
    ].join('');
    document.head.appendChild(css);

    var INK = '#0b2a3f';           // cartoon outline — the brand's darkest navy
    var CAB = '#f5a800';           // brand yellow
    var CAB_SHADE = '#d98c00';

    // Checker band along the door line: two staggered rows of squares.
    var checker = '';
    for (var i = 0; i < 8; i++) {
      checker += '<rect x="' + (14 + i * 14) + '" y="45" width="7" height="4.5" fill="' + INK + '"/>';
      checker += '<rect x="' + (21 + i * 14) + '" y="49.5" width="7" height="4.5" fill="' + INK + '"/>';
    }

    // A loose Mumbai-ish skyline, repeated twice so the loop is seamless.
    var sky = '';
    var towers = [[0,58,22],[26,40,16],[46,64,26],[76,30,14],[94,52,20],[118,70,12],[134,44,24],[162,60,18],[184,36,22],[210,66,16],[230,48,26]];
    for (var k = 0; k < 2; k++) {
      towers.forEach(function (t) {
        sky += '<rect x="' + (t[0] + k * 260) + '" y="' + (118 - t[1]) + '" width="' + t[2] + '" height="' + t[1] + '" rx="2"/>';
      });
    }

    var dashes = '';
    for (var d = 0; d < 9; d++) dashes += '<rect x="' + (d * 48) + '" y="132" width="24" height="4" rx="2"/>';

    var wheel = function (cx) {
      return '<g class="cc-wheel">' +
        '<circle cx="' + cx + '" cy="68" r="14" fill="#1e2a33" stroke="' + INK + '" stroke-width="3"/>' +
        '<circle cx="' + cx + '" cy="68" r="7" fill="#e9eef2" stroke="' + INK + '" stroke-width="2"/>' +
        '<path d="M' + (cx - 7) + ' 68H' + (cx + 7) + 'M' + cx + ' 61V75" stroke="' + INK + '" stroke-width="2"/>' +
        '<circle cx="' + cx + '" cy="68" r="2" fill="' + INK + '"/>' +
      '</g>';
    };

    var svg =
      '<svg viewBox="-20 -24 300 170" aria-hidden="true" focusable="false">' +
        '<defs>' +
          '<linearGradient id="ccBeamGrad" x1="0" x2="1">' +
            '<stop offset="0" stop-color="#fff3b0" stop-opacity=".95"/>' +
            '<stop offset="1" stop-color="#fff3b0" stop-opacity="0"/>' +
          '</linearGradient>' +
          '<clipPath id="ccClip"><rect x="-20" y="-24" width="300" height="170"/></clipPath>' +
          // fade the road and skyline out at both ends so the scene melts into
          // the background instead of stopping at a hard vertical edge
          '<linearGradient id="ccFadeGrad" x1="0" x2="1">' +
            '<stop offset="0" stop-color="#fff" stop-opacity="0"/>' +
            '<stop offset=".18" stop-color="#fff"/>' +
            '<stop offset=".82" stop-color="#fff"/>' +
            '<stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
          '</linearGradient>' +
          '<mask id="ccFade"><rect x="-20" y="-24" width="300" height="170" fill="url(#ccFadeGrad)"/></mask>' +
        '</defs>' +
        '<g clip-path="url(#ccClip)" mask="url(#ccFade)">' +
          '<g class="cc-skyline" fill="rgba(255,255,255,.07)">' + sky + '</g>' +
          '<rect x="-20" y="118" width="300" height="28" fill="#012233"/>' +
          '<g class="cc-road-dashes" fill="' + CAB + '">' + dashes + '</g>' +
        '</g>' +

        '<g transform="translate(66 36)">' +
          '<g class="cc-drive">' +
            '<g class="cc-speed" stroke="rgba(255,255,255,.75)" stroke-width="3" stroke-linecap="round">' +
              '<line x1="-34" y1="30" x2="-14" y2="30"/>' +
              '<line x1="-42" y1="44" x2="-18" y2="44"/>' +
              '<line x1="-30" y1="58" x2="-12" y2="58"/>' +
            '</g>' +
            '<g fill="#dfe8ee">' +
              '<circle class="cc-puff" cx="-4" cy="64" r="6"/>' +
              '<circle class="cc-puff" cx="-4" cy="64" r="6"/>' +
              '<circle class="cc-puff" cx="-4" cy="64" r="6"/>' +
            '</g>' +
            '<ellipse cx="69" cy="83" rx="66" ry="5" fill="rgba(0,0,0,.28)"/>' +
            '<polygon class="cc-beam" points="134,38 212,20 212,66 134,48" fill="url(#ccBeamGrad)"/>' +

            '<g class="cc-body">' +
              // roof sign: white box, the C-pin in yellow, two lines of "text"
              '<rect x="52" y="-9" width="36" height="13" rx="5" fill="#fff" stroke="' + INK + '" stroke-width="3"/>' +
              '<circle cx="60" cy="-2.5" r="3.6" fill="' + CAB + '" stroke="' + INK + '" stroke-width="1.6"/>' +
              '<path d="M67 -5H83M67 0H79" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/>' +
              // cabin
              '<path d="M24 38 L39 10 Q42 4 49 4 L90 4 Q97 4 100 10 L116 38 Z" fill="' + CAB + '" stroke="' + INK + '" stroke-width="3.5" stroke-linejoin="round"/>' +
              '<path d="M35 36 L46 14 Q48 10 52 10 L66 10 L66 36 Z" fill="#bfe6ff" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
              '<path d="M72 10 L87 10 Q91 10 93 14 L105 36 L72 36 Z" fill="#bfe6ff" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
              '<path d="M84 15 L79 30 M90 19 L88 25" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>' +
              // lower body
              '<rect x="4" y="34" width="130" height="34" rx="13" fill="' + CAB + '" stroke="' + INK + '" stroke-width="3.5"/>' +
              '<rect x="8" y="56" width="122" height="8" rx="4" fill="' + CAB_SHADE + '"/>' +
              checker +
              // wheel wells
              '<circle cx="34" cy="68" r="17.5" fill="' + INK + '"/>' +
              '<circle cx="104" cy="68" r="17.5" fill="' + INK + '"/>' +
              // door, handle, lights, bumper
              '<path d="M69 37 V56 M75 41 H83" stroke="' + INK + '" stroke-width="2.5" stroke-linecap="round"/>' +
              '<circle cx="130" cy="42" r="5.5" fill="#fffbe6" stroke="' + INK + '" stroke-width="3"/>' +
              '<rect x="1" y="39" width="7" height="9" rx="2" fill="#ff5a4f" stroke="' + INK + '" stroke-width="2"/>' +
            '</g>' +
            wheel(34) + wheel(104) +
          '</g>' +
        '</g>' +
      '</svg>';

    var box = document.createElement('div');
    box.className = 'cc-loader';
    box.id = 'ccLoader';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML = svg +
      '<img class="cc-loader-logo" src="images/logo-light.png" alt="" width="125" height="40" />' +
      '<div class="cc-loader-text" aria-hidden="true">Getting your ride ready' +
        '<span class="cc-loader-dots"><span>.</span><span>.</span><span>.</span></span></div>' +
      '<span class="cc-sr">Loading Click Cabs</span>';

    document.documentElement.classList.add('cc-loading');
    (document.body || document.documentElement).insertBefore(box, (document.body || document.documentElement).firstChild);

    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {}

    if (hold) return;

    var start = Date.now();
    var min = reduce ? 250 : MIN_MS;
    var gone = false;

    function dismiss() {
      if (gone) return;
      gone = true;
      box.classList.add('cc-loader--out');
      document.documentElement.classList.remove('cc-loading');
      setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
        if (css.parentNode) css.parentNode.removeChild(css);
      }, reduce ? 200 : 750);   // outlives the 0.3 s delay + 0.35 s fade
    }

    function whenReady() {
      setTimeout(dismiss, Math.max(0, min - (Date.now() - start)));
    }

    if (document.readyState === 'complete') whenReady();
    else window.addEventListener('load', whenReady);
    setTimeout(dismiss, MAX_MS);
  }

  /* ================= "Log in" menu in the nav ================= */
  // It is a <details> element, so it opens, closes and works from the
  // keyboard with no JavaScript at all. This only adds the two things
  // <details> does not do by itself: close on an outside click, and on Esc.

  document.addEventListener('click', function (e) {
    var open = document.querySelectorAll('details.nav-account[open]');
    for (var i = 0; i < open.length; i++) {
      if (!open[i].contains(e.target)) open[i].removeAttribute('open');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('details.nav-account[open]');
    if (!open) return;
    open.removeAttribute('open');
    var s = open.querySelector('summary');
    if (s) s.focus();
  });
})();
