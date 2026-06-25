/*!
 * NEON RUSH — embeddable slot machine Web Component
 * <neon-slot engine="stylized|3d"></neon-slot>
 *
 * Drop-in, framework-agnostic, Shadow-DOM isolated. No build step required.
 *
 *   <script src="neon-slot.js"></script>
 *   <neon-slot balance="1000" bet="25"></neon-slot>
 *
 * Server-authoritative outcomes:
 *   const el = document.querySelector('neon-slot');
 *   el.resolveSpin = async (bet) => {                 // your backend decides
 *     const r = await fetch('/api/spin', {method:'POST', body: JSON.stringify({bet})}).then(x=>x.json());
 *     return { reels: r.reels, win: r.win };          // reels: 4 symbol indices
 *   };
 *
 * Events (all bubble + cross shadow boundary):
 *   spinstart, result, win, noresult, phasechange, risk, bank, bust, balancechange, betchange
 *
 * Also exposes:  NeonSlot.mount(target, options)  and  window.NeonSlot (the class)
 */
(function (global) {
  "use strict";

  /* --------------------------------------------------------------------
     Resolve our own script URL so sibling assets (three.min.js) load from
     the SAME origin/CDN we were served from — not the host page's origin.
     Captured at load time via document.currentScript, with a fallback scan.
     -------------------------------------------------------------------- */
  const SELF_SRC = (function () {
    try {
      if (document.currentScript && document.currentScript.src) return document.currentScript.src;
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && /neon-slot(\.min)?\.js(\?|#|$)/.test(scripts[i].src)) return scripts[i].src;
      }
    } catch (e) {}
    return '';
  })();
  const SELF_DIR = SELF_SRC ? SELF_SRC.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : '';
  const VERSION = "1.0.0";

  /* ----------------------------- defaults ----------------------------- */
  const DEFAULTS = {
    currency: "CREDITS",
    reels: 4,
    symbols: [
      { glyph: "⚡", color: "#0ff7ff", value: 5,  weight: 5 },
      { glyph: "◆", color: "#9b5bff", value: 8,  weight: 4 },
      { glyph: "★", color: "#ffd84d", value: 12, weight: 3 },
      { glyph: "❖", color: "#ff2bd6", value: 15, weight: 3 },
      { glyph: "♦", color: "#39ff9c", value: 20, weight: 2 },
      { glyph: "7", color: "#ff4d6d", value: 50, weight: 1 }
    ],
    // payout = bet * symbol.value * payouts[matchCount]
    payouts: { 4: 1.0, 3: 0.4, 2: 0.12 },
    phaseMultipliers: [1, 2, 4, 8],
    phaseNames: ["PHASE 1", "PHASE 2", "PHASE 3", "BONUS"],
    // bet tiers double as the selectable bet buttons AND the phase ceiling per bet
    betTiers: [
      { bet: 10,  maxPhase: 0 },
      { bet: 25,  maxPhase: 1 },
      { bet: 50,  maxPhase: 2 },
      { bet: 100, maxPhase: 3 }
    ],
    riskOdds: 0.5,
    sound: true
  };

  /* ----------------------------- styles ------------------------------- */
  const CSS = `
  :host{
    --neon:#0ff7ff; --pink:#ff2bd6; --gold:#ffd84d; --green:#39ff9c; --violet:#9b5bff; --red:#ff4d6d;
    --bg0:#070014; --bg1:#160033; --cell:78px; --radius:24px;
    display:block; width:100%; max-width:880px; margin:0 auto;
    font-family:"Segoe UI",system-ui,sans-serif; color:#fff; -webkit-font-smoothing:antialiased;
  }
  *{box-sizing:border-box; margin:0; padding:0}
  .cab{position:relative; border-radius:var(--radius); padding:20px 22px 16px; overflow:hidden;
    background:linear-gradient(160deg, rgba(40,8,80,.95), rgba(10,2,30,.97));
    border:1px solid rgba(0,247,255,.4);
    box-shadow:0 0 0 2px rgba(255,43,214,.2), 0 24px 60px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.1), 0 0 50px rgba(155,91,255,.28)}
  .glow{position:absolute; top:-30%; left:50%; transform:translateX(-50%); width:55%; height:60%; border-radius:50%;
    background:radial-gradient(circle at 50% 60%, #ff8a3d, var(--pink) 55%, transparent 72%); filter:blur(8px); opacity:.35; pointer-events:none}
  .fx{position:absolute; inset:0; pointer-events:none; z-index:6}

  .topbar{display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; position:relative; z-index:2}
  .logo{font-weight:900; font-size:24px; letter-spacing:3px; line-height:1; font-family:"Trebuchet MS",sans-serif;
    background:linear-gradient(90deg,var(--neon),var(--pink),var(--gold)); -webkit-background-clip:text; background-clip:text; color:transparent;
    filter:drop-shadow(0 0 12px rgba(0,247,255,.55))}
  .logo small{display:block; font-size:9px; letter-spacing:5px; color:var(--neon); -webkit-text-fill-color:var(--neon); opacity:.8}
  .bal{text-align:right}
  .bal b{font-size:22px; color:var(--gold); text-shadow:0 0 12px rgba(255,216,77,.7)}
  .bal span{display:block; font-size:9px; letter-spacing:3px; opacity:.6}

  .ladder{display:flex; gap:7px; margin-bottom:5px; position:relative; z-index:2}
  .step{position:relative; flex:1; text-align:center; padding:7px 3px; border-radius:11px; font-size:10px; letter-spacing:1px;
    border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.03); color:#9aa; transition:.35s}
  .step b{display:block; font-size:14px; margin-top:1px}
  .step small{opacity:.8}
  .step.on{color:#fff; border-color:var(--neon); background:linear-gradient(180deg,rgba(0,247,255,.25),rgba(0,247,255,.05));
    box-shadow:0 0 20px rgba(0,247,255,.5); transform:translateY(-2px) scale(1.03)}
  .step.bonus.on{border-color:var(--gold); background:linear-gradient(180deg,rgba(255,216,77,.3),rgba(255,43,214,.12));
    box-shadow:0 0 26px rgba(255,216,77,.6)}
  .step.locked{opacity:.3; filter:grayscale(.7)}
  .step.locked::after{content:"🔒"; position:absolute; top:3px; right:5px; font-size:9px}
  .hint{text-align:center; font-size:10.5px; letter-spacing:.5px; color:var(--neon); opacity:.75; margin-bottom:10px; min-height:13px; position:relative; z-index:2}
  .hint b{color:var(--gold)}

  .reels-host{position:relative; z-index:1; border-radius:18px}
  .machine{display:grid; gap:10px; padding:12px; border-radius:18px;
    background:linear-gradient(180deg,#04001a,#0b0030); border:1px solid rgba(0,247,255,.3);
    box-shadow:inset 0 0 36px rgba(0,0,0,.9), 0 0 26px rgba(155,91,255,.22)}
  .reel{position:relative; height:calc(var(--cell)*3); border-radius:12px; overflow:hidden;
    background:linear-gradient(180deg,#16003c,#05000f 55%,#16003c); border:1px solid rgba(255,43,214,.3);
    box-shadow:inset 0 12px 24px rgba(0,0,0,.95), inset 0 -12px 24px rgba(0,0,0,.95)}
  .reel::before,.reel::after{content:""; position:absolute; left:0; right:0; height:34%; z-index:3; pointer-events:none}
  .reel::before{top:0; background:linear-gradient(#05000f,transparent)}
  .reel::after{bottom:0; background:linear-gradient(transparent,#05000f)}
  .strip{position:absolute; left:0; right:0; top:0; will-change:transform}
  .cell{height:var(--cell); display:flex; align-items:center; justify-content:center; font-size:42px; filter:drop-shadow(0 0 11px currentColor)}
  .payline{position:absolute; top:50%; left:6px; right:6px; height:var(--cell); transform:translateY(-50%);
    border:2px solid var(--gold); border-radius:9px; box-shadow:0 0 18px rgba(255,216,77,.45),inset 0 0 18px rgba(255,216,77,.16); z-index:4; pointer-events:none; opacity:.5}
  .reel.win{animation:nf .45s ease 3}
  @keyframes nf{50%{box-shadow:inset 0 0 0 3px var(--green),0 0 28px var(--green)}}
  .reels-host canvas{display:block; width:100%; height:calc(var(--cell)*3.4); border-radius:18px; background:#05000f;
    border:1px solid rgba(0,247,255,.3)}

  .controls{display:flex; align-items:center; gap:12px; margin-top:14px; flex-wrap:wrap; justify-content:center; position:relative; z-index:2}
  .bets{display:flex; gap:6px}
  .bet{padding:8px 12px; border-radius:10px; border:1px solid rgba(0,247,255,.4); background:rgba(0,247,255,.06);
    color:var(--neon); font-weight:700; cursor:pointer; transition:.15s; font-size:13px; font-family:inherit}
  .bet:hover{background:rgba(0,247,255,.18)}
  .bet.sel{background:var(--neon); color:#001; box-shadow:0 0 16px rgba(0,247,255,.6)}
  .meta{display:flex; flex-direction:column; align-items:center; min-width:96px}
  .meta span{font-size:9px; letter-spacing:2px; opacity:.6}
  .meta b{font-size:20px; color:var(--green); text-shadow:0 0 10px rgba(57,255,156,.55)}
  .btn{cursor:pointer; border:none; font-weight:900; letter-spacing:2px; border-radius:15px; transition:transform .1s,filter .15s; font-family:inherit}
  .spin{padding:16px 40px; font-size:21px; color:#10001a; background:linear-gradient(180deg,var(--gold),#ff9f1c); box-shadow:0 7px 0 #b56b00,0 0 26px rgba(255,216,77,.55)}
  .spin:hover{filter:brightness(1.06)}
  .spin:active{transform:translateY(5px); box-shadow:0 2px 0 #b56b00}
  .spin:disabled{filter:grayscale(.6) brightness(.7); cursor:not-allowed; box-shadow:0 4px 0 #555}

  .gamble{position:absolute; inset:0; z-index:8; display:none; align-items:center; justify-content:center;
    background:radial-gradient(circle at 50% 42%, rgba(20,2,50,.92), rgba(3,0,12,.97))}
  .gamble.show{display:flex; animation:fd .25s}
  @keyframes fd{from{opacity:0}}
  .gpanel{text-align:center; padding:10px}
  .gtitle{font-size:12px; letter-spacing:5px; color:var(--neon); margin-bottom:6px}
  .gwin{font-size:50px; font-weight:900; color:var(--gold); text-shadow:0 0 24px rgba(255,216,77,.8)}
  .gphase{font-size:11px; letter-spacing:3px; color:var(--pink); margin:4px 0 20px}
  .gbtns{display:flex; gap:14px; justify-content:center}
  .risk{padding:15px 26px; font-size:15px; color:#fff; background:linear-gradient(180deg,var(--red),#a01030); box-shadow:0 6px 0 #5e0a1c,0 0 24px rgba(255,77,109,.5)}
  .bank{padding:15px 26px; font-size:15px; color:#012; background:linear-gradient(180deg,var(--green),#11a86a); box-shadow:0 6px 0 #0a6b42,0 0 24px rgba(57,255,156,.5)}
  .risk:active,.bank:active{transform:translateY(4px)}
  .gnext{font-size:10.5px; opacity:.7; margin-top:12px; letter-spacing:.5px; max-width:320px}
  .toast{position:absolute; top:14px; left:50%; transform:translateX(-50%); z-index:9; padding:9px 20px; border-radius:30px;
    font-weight:800; letter-spacing:2px; opacity:0; transition:.35s; pointer-events:none; font-size:13px;
    background:rgba(0,0,0,.72); border:1px solid var(--neon); color:var(--neon); white-space:nowrap}
  .toast.show{opacity:1; top:24px}
  .cab.shake{animation:sh .4s}
  @keyframes sh{0%,100%{transform:translate(0)}20%{transform:translate(-6px,3px)}40%{transform:translate(6px,-3px)}60%{transform:translate(-4px,2px)}80%{transform:translate(4px,-2px)}}
  `;

  /* ----------------------------- audio -------------------------------- */
  let AC = null;
  function audioCtx() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }
  function beep(on, f, d, type, v) {
    if (!on) return; const c = audioCtx(); if (!c) return;
    try { const o = c.createOscillator(), g = c.createGain(); o.type = type || "square"; o.frequency.value = f;
      o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(v == null ? .14 : v, c.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + (d || .08)); o.start(); o.stop(c.currentTime + (d || .08)); } catch (e) {}
  }
  function sweep(on, a, b, d) {
    if (!on) return; const c = audioCtx(); if (!c) return;
    try { const o = c.createOscillator(), g = c.createGain(); o.type = "sawtooth";
      o.frequency.setValueAtTime(a, c.currentTime); o.frequency.exponentialRampToValueAtTime(b, c.currentTime + d);
      g.gain.setValueAtTime(.1, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + d);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + d); } catch (e) {}
  }

  /* ------------------------- weighted pool ---------------------------- */
  function buildPool(symbols) { const p = []; symbols.forEach((s, i) => { for (let k = 0; k < (s.weight || 1); k++) p.push(i); }); return p; }

  /* ====================================================================
     STYLIZED REEL ENGINE (DOM strips inside the shadow root)
     ==================================================================== */
  function StylizedReels(host, ctx) {
    const n = ctx.config.reels;
    host.innerHTML =
      '<div class="machine" style="grid-template-columns:repeat(' + n + ',1fr)">' +
      Array.from({ length: n }).map((_, i) =>
        '<div class="reel"><div class="strip" data-s="' + i + '"></div>' + (i === 0 ? '<div class="payline"></div>' : '') + '</div>'
      ).join('') + '</div>';
    const strips = Array.from(host.querySelectorAll('.strip'));
    const reels = Array.from(host.querySelectorAll('.reel'));
    const cellH = () => parseFloat(getComputedStyle(host).getPropertyValue('--cell')) || 78;
    const cellHTML = (i) => { const s = ctx.config.symbols[i]; return '<div class="cell" style="color:' + s.color + '">' + s.glyph + '</div>'; };

    function idle() { strips.forEach(st => { let h = ''; for (let i = 0; i < 5; i++) h += cellHTML(ctx.rand()); st.innerHTML = h; st.style.transition = 'none'; st.style.transform = 'translateY(-' + cellH() + 'px)'; }); }
    function spinTo(results, onReelStop, onDone) {
      const H = cellH(), total = 24, target = total - 2, scroll = (target - 1) * H; let stopped = 0;
      results.forEach((res, r) => {
        let html = ''; for (let i = 0; i < total; i++) html += (i === target) ? cellHTML(res) : cellHTML(ctx.rand());
        strips[r].innerHTML = html; strips[r].style.transition = 'none'; strips[r].style.transform = 'translateY(0)';
        void strips[r].offsetWidth;
        const dur = 1.1 + r * 0.5;
        strips[r].style.transition = 'transform ' + dur + 's cubic-bezier(.16,.7,.2,1)';
        strips[r].style.transform = 'translateY(-' + scroll + 'px)';
        let t = 0; const ti = setInterval(() => { beep(ctx.sound(), 300 + Math.random() * 120, .02, 'square', .05); if (++t > 14) clearInterval(ti); }, 70);
        setTimeout(() => {
          clearInterval(ti); beep(ctx.sound(), 180 + r * 60, .12, 'square', .18);
          try { reels[r].animate([{ transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], { duration: 160 }); } catch (e) {}
          onReelStop && onReelStop(r);
          if (++stopped === results.length) setTimeout(onDone, 250);
        }, dur * 1000);
      });
    }
    function flashWin(results, sym) {
      results.forEach((s, i) => { if (s === sym) reels[i].classList.add('win'); });
      setTimeout(() => reels.forEach(r => r.classList.remove('win')), 1600);
    }
    idle();
    return { spinTo, flashWin, resize() {}, destroy() { host.innerHTML = ''; } };
  }

  /* ====================================================================
     3D REEL ENGINE (Three.js canvas inside the shadow root) — lazy loaded
     ==================================================================== */
  function loadThree(src) {
    return new Promise((resolve, reject) => {
      if (window.THREE) return resolve(window.THREE);
      const s = document.createElement('script'); s.src = src;
      s.onload = () => window.THREE ? resolve(window.THREE) : reject(new Error('THREE missing'));
      s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function ThreeReels(host, ctx, THREE) {
    const n = ctx.config.reels, NS = 8, R = 1.9, STEP = Math.PI * 2 / NS;
    const cv = document.createElement('canvas'); host.appendChild(cv);
    const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x05000f, 0.05);
    const cam = new THREE.PerspectiveCamera(55, 2, 0.1, 100);
    const rend = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    rend.setPixelRatio(Math.min(devicePixelRatio, 2));
    scene.add(new THREE.AmbientLight(0x4422aa, .65));
    [[0x0ff7ff, -6, 4, 8], [0xff2bd6, 6, -3, 8], [0xffd84d, 0, 6, 4]].forEach(([c, x, y, z]) => { const l = new THREE.PointLight(c, 1.3, 40); l.position.set(x, y, z); scene.add(l); });

    function tex(i) {
      const s = ctx.config.symbols[i], c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#13002e'); g.addColorStop(1, '#1d0040'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = s.color; x.lineWidth = 8; x.shadowColor = s.color; x.shadowBlur = 30; x.strokeRect(14, 14, 228, 228);
      x.shadowBlur = 40; x.fillStyle = s.color; x.font = 'bold 150px Segoe UI,Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s.glyph, 128, 140);
      const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
    }
    const TEX = ctx.config.symbols.map((_, i) => tex(i));
    const groups = [];
    const xs = []; const spread = 2.3; for (let i = 0; i < n; i++) xs.push((i - (n - 1) / 2) * spread);
    xs.forEach(px => {
      const grp = new THREE.Group(); grp.position.x = px; const planes = [];
      for (let k = 0; k < NS; k++) {
        const sy = ctx.rand();
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6),
          new THREE.MeshStandardMaterial({ map: TEX[sy], emissive: 0xffffff, emissiveMap: TEX[sy], emissiveIntensity: .6, metalness: .3, roughness: .45, side: THREE.DoubleSide }));
        const th = k * STEP; m.position.set(0, R * Math.sin(th), R * Math.cos(th)); m.rotation.x = -th; m.userData = { mat: m.material };
        grp.add(m); planes.push(m);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R + .22, .15, 16, 44),
        new THREE.MeshStandardMaterial({ color: 0x1a0040, emissive: 0xff2bd6, emissiveIntensity: .5, metalness: .8, roughness: .3 }));
      ring.rotation.y = Math.PI / 2; grp.add(ring);
      grp.userData = { planes: planes, spinning: false, from: 0, target: 0, t0: 0, dur: 0, onStop: null };
      scene.add(grp); groups.push(grp);
    });

    function fit() {
      const w = host.clientWidth || 600, h = cv.clientHeight || 260;
      rend.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
      const need = (xs[xs.length - 1] + 1.4) / Math.tan((cam.fov / 2) * Math.PI / 180) / cam.aspect;
      cam.position.set(0, .3, Math.max(7, need + 1.5)); cam.lookAt(0, 0, 0);
    }
    const ro = new ResizeObserver(fit); ro.observe(host); fit();

    let raf = 0, last = performance.now(), shakeT = 0;
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function loop(now) {
      raf = requestAnimationFrame(loop); const dt = Math.min(.05, (now - last) / 1000); last = now;
      groups.forEach(g => {
        const u = g.userData;
        if (u.spinning) { const t = Math.min(1, (now / 1000 - u.t0) / u.dur); g.rotation.x = u.from + (u.target - u.from) * easeOutCubic(t);
          if (t >= 1) { u.spinning = false; u.onStop && u.onStop(); } }
        else g.rotation.x += dt * .05;
      });
      if (shakeT > 0) { shakeT -= dt; scene.position.x = (Math.random() - .5) * .2 * shakeT * 6; } else scene.position.x = 0;
      rend.render(scene, cam);
    }
    raf = requestAnimationFrame(loop);

    function spinTo(results, onReelStop, onDone) {
      let stopped = 0;
      groups.forEach((g, r) => {
        const u = g.userData;
        u.planes.forEach((m, k) => { const s = (k === 0) ? results[r] : ctx.rand(); m.material.map = TEX[s]; m.material.emissiveMap = TEX[s]; m.material.needsUpdate = true; });
        const spins = 4 + r; u.from = g.rotation.x;
        u.target = Math.ceil(g.rotation.x / (Math.PI * 2)) * (Math.PI * 2) + spins * Math.PI * 2;
        u.t0 = performance.now() / 1000; u.dur = 1.4 + r * .55; u.spinning = true;
        let t = 0; const ti = setInterval(() => { beep(ctx.sound(), 280 + Math.random() * 120, .02, 'square', .05); if (++t > 16) clearInterval(ti); }, 80);
        u.onStop = () => { clearInterval(ti); beep(ctx.sound(), 180 + r * 60, .12, 'square', .18); onReelStop && onReelStop(r); if (++stopped === results.length) setTimeout(onDone, 250); };
      });
    }
    function flashWin(results, sym) {
      groups.forEach((g, i) => { if (results[i] === sym) { g.userData.planes[0].material.emissiveIntensity = 1.5; setTimeout(() => g.userData.planes[0].material.emissiveIntensity = .6, 1400); } });
      shakeT = .4;
    }
    return { spinTo, flashWin, resize: fit, destroy() { cancelAnimationFrame(raf); ro.disconnect(); rend.dispose(); host.innerHTML = ''; } };
  }

  /* ====================================================================
     THE WEB COMPONENT
     ==================================================================== */
  class NeonSlot extends HTMLElement {
    static get observedAttributes() { return ["engine", "balance", "bet", "currency", "three-src", "muted"]; }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      this._cfg = JSON.parse(JSON.stringify(DEFAULTS));
      this._state = { balance: 1000, bet: 25, spinning: false, phase: 0, pot: 0, muted: false };
      this._engine = null;
      this._pool = buildPool(this._cfg.symbols);
      this.resolveSpin = null;   // host hook: async (bet) => { reels:[...], win?:number }
      this.resolveRisk = null;   // host hook: async (phase, pot) => { won:boolean }
    }

    /* ----- public config property ----- */
    set config(obj) {
      this._cfg = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), obj || {});
      this._pool = buildPool(this._cfg.symbols);
      if (this._built) this._rebuild();
    }
    get config() { return this._cfg; }

    /* ----- balance / bet props ----- */
    get balance() { return this._state.balance; }
    set balance(v) { this._state.balance = Math.max(0, v | 0); this._renderHUD(); }
    get bet() { return this._state.bet; }
    set bet(v) { this.setBet(+v); }
    get spinning() { return this._state.spinning; }

    connectedCallback() {
      if (this.hasAttribute("balance")) this._state.balance = +this.getAttribute("balance");
      if (this.hasAttribute("bet")) this._state.bet = +this.getAttribute("bet");
      if (this.hasAttribute("currency")) this._cfg.currency = this.getAttribute("currency");
      this._state.muted = this.hasAttribute("muted");
      this._build();
    }
    disconnectedCallback() { this._engine && this._engine.destroy(); cancelAnimationFrame(this._fxRaf); }

    attributeChangedCallback(name, _o, v) {
      if (!this._built) return;
      if (name === "balance") this.balance = +v;
      else if (name === "bet") this.setBet(+v);
      else if (name === "currency") { this._cfg.currency = v; this._renderHUD(); }
      else if (name === "muted") this._state.muted = this.hasAttribute("muted");
      else if (name === "engine") this._mountEngine();
    }

    /* ----- helpers exposed to engines ----- */
    _ctx() { const self = this; return { config: this._cfg, rand: () => this._pool[(Math.random() * this._pool.length) | 0], sound: () => self._cfg.sound && !self._state.muted }; }
    rand() { return this._pool[(Math.random() * this._pool.length) | 0]; }
    _maxPhase() { const t = this._cfg.betTiers.find(t => t.bet === this._state.bet); return t ? t.maxPhase : 0; }
    _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail: detail || {}, bubbles: true, composed: true })); }

    /* ----- build shadow DOM ----- */
    _build() {
      const tiers = this._cfg.betTiers;
      const steps = this._cfg.phaseNames.map((nm, i) => {
        const isBonus = i === this._cfg.phaseNames.length - 1;
        const label = isBonus ? "BONUS" : "PHASE";
        const sym = isBonus ? "★" : (i + 1);
        return '<div class="step' + (isBonus ? ' bonus' : '') + (i === 0 ? ' on' : '') + '"><span>' + label + '</span><b>' + sym + '</b><small>×' + this._cfg.phaseMultipliers[i] + '</small></div>';
      }).join('');
      this._root.innerHTML =
        '<style>' + CSS + '</style>' +
        '<div class="cab" part="cabinet"><div class="glow"></div>' +
          '<div class="toast"></div>' +
          '<div class="topbar"><div class="logo">NEON RUSH<small>SLOT</small></div>' +
            '<div class="bal"><b class="bal-v">0</b><span class="bal-c">CREDITS</span></div></div>' +
          '<div class="ladder">' + steps + '</div>' +
          '<div class="hint"></div>' +
          '<div class="reels-host"></div>' +
          '<div class="controls"><div class="bets">' +
            tiers.map(t => '<button class="bet" data-b="' + t.bet + '">' + t.bet + '</button>').join('') +
            '</div><button class="btn spin" type="button">SPIN</button>' +
            '<div class="meta"><span>LAST WIN</span><b class="lastwin">0</b></div></div>' +
          '<div class="gamble"><div class="gpanel">' +
            '<div class="gtitle">PHASE WIN — RISK IT?</div><div class="gwin">0</div>' +
            '<div class="gphase">PHASE 1</div>' +
            '<div class="gbtns"><button class="btn risk" type="button">RISK ↑ <span class="rnext">×2</span></button>' +
            '<button class="btn bank" type="button">BANK ↓</button></div>' +
            '<div class="gnext"></div></div></div>' +
          '<canvas class="fx"></canvas>' +
        '</div>';

      const $ = s => this._root.querySelector(s);
      this._el = {
        cab: $('.cab'), toast: $('.toast'), balV: $('.bal-v'), balC: $('.bal-c'),
        hint: $('.hint'), reelsHost: $('.reels-host'), spin: $('.spin'), lastwin: $('.lastwin'),
        gamble: $('.gamble'), gwin: $('.gwin'), gphase: $('.gphase'), rnext: $('.rnext'),
        risk: $('.risk'), bank: $('.bank'), gnext: $('.gnext'), fx: $('.fx'),
        steps: Array.from(this._root.querySelectorAll('.step')),
        bets: Array.from(this._root.querySelectorAll('.bet'))
      };
      this._el.spin.addEventListener('click', () => this.spin());
      this._el.bank.addEventListener('click', () => this._bank());
      this._el.risk.addEventListener('click', () => this._risk());
      this._el.bets.forEach(b => b.addEventListener('click', () => { if (!this._state.spinning) this.setBet(+b.dataset.b); }));
      this._built = true;
      this._initFX();
      this._mountEngine();
      this._renderHUD();
      this._refreshLadder();
    }
    _rebuild() { if (this._engine) this._engine.destroy(); this._build(); }

    _mountEngine() {
      if (this._engine) { this._engine.destroy(); this._engine = null; }
      const wantsThree = (this.getAttribute('engine') || 'stylized') === '3d';
      const host = this._el.reelsHost;
      if (!wantsThree) { this._engine = StylizedReels(host, this._ctx()); return; }
      // 3D — lazy load Three, fall back to stylized on failure
      host.innerHTML = '<div style="padding:40px;text-align:center;color:var(--neon);font-size:12px;letter-spacing:2px">LOADING 3D…</div>';
      const src = this.getAttribute('three-src') || (global.NeonSlot && global.NeonSlot.threeSrc) || (SELF_DIR + 'three.min.js');
      loadThree(src)
        .then(THREE => { host.innerHTML = ''; this._engine = ThreeReels(host, this._ctx(), THREE); })
        .catch(() => { this._emit('engineerror', { fallback: 'stylized' }); this._engine = StylizedReels(host, this._ctx()); });
    }

    /* ----- HUD ----- */
    _renderHUD() {
      if (!this._el) return;
      this._el.balV.textContent = this._state.balance;
      this._el.balC.textContent = this._cfg.currency;
      this._el.bets.forEach(b => b.classList.toggle('sel', +b.dataset.b === this._state.bet));
    }
    _refreshLadder() {
      const mp = this._maxPhase();
      this._el.steps.forEach((el, i) => el.classList.toggle('locked', i > mp));
      const nm = this._cfg.phaseNames, top = mp >= nm.length - 1;
      this._el.hint.innerHTML = top
        ? 'Bet ' + this._state.bet + ' unlocks the full ladder up to <b>' + nm[nm.length - 1] + ' ×' + this._cfg.phaseMultipliers[nm.length - 1] + '</b>'
        : 'Bet ' + this._state.bet + ' reaches <b>' + nm[mp] + '</b> · raise your bet to climb higher';
    }
    _lightLadder(p) { this._el.steps.forEach((el, i) => el.classList.toggle('on', i <= p)); }
    _toast(msg, col) { const t = this._el.toast; t.textContent = msg; t.style.color = col || '#0ff7ff'; t.style.borderColor = col || '#0ff7ff';
      t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1600); }
    _shake() { const c = this._el.cab; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }

    /* ----- public API ----- */
    setBet(b) { if (!this._cfg.betTiers.some(t => t.bet === b)) return; this._state.bet = b; this._renderHUD(); this._refreshLadder(); this._emit('betchange', { bet: b }); }
    setBalance(n) { this.balance = n; this._emit('balancechange', { balance: this._state.balance }); }
    reset() { this._state.phase = 0; this._state.pot = 0; this._state.spinning = false; this._el.spin.disabled = false; this._el.gamble.classList.remove('show'); this._lightLadder(0); }

    /* ----- the spin flow ----- */
    spin() {
      if (this._state.spinning) return;
      audioCtx();
      if (this._state.balance < this._state.bet) { this._toast('NOT ENOUGH ' + this._cfg.currency, '#ff4d6d'); beep(this._cfg.sound && !this._state.muted, 120, .2, 'sawtooth'); this._shake(); this._emit('insufficient', { balance: this._state.balance, bet: this._state.bet }); return; }
      if (!this._engine) return;
      this._state.spinning = true; this._el.spin.disabled = true;
      this._state.balance -= this._state.bet; this._state.lastWin = 0; this._renderHUD();
      this._emit('balancechange', { balance: this._state.balance });
      this._emit('spinstart', { bet: this._state.bet, balance: this._state.balance });
      beep(this._cfg.sound && !this._state.muted, 660, .05);

      clearTimeout(this._watch);
      this._watch = setTimeout(() => { if (this._state.spinning && !this._el.gamble.classList.contains('show')) this._endSpin(); }, 12000);

      const decide = this.resolveSpin
        ? Promise.resolve(this.resolveSpin(this._state.bet, { config: this._cfg }))
        : Promise.resolve({ reels: Array.from({ length: this._cfg.reels }, () => this.rand()) });

      decide.then(out => {
        const results = (out && out.reels) || Array.from({ length: this._cfg.reels }, () => this.rand());
        this._pendingWinOverride = (out && typeof out.win === 'number') ? out.win : null;
        this._engine.spinTo(results, null, () => this._resolve(results));
      }).catch(err => { this._emit('error', { error: String(err) }); this._endSpin(); });
    }

    _matchInfo(results) { const m = {}; results.forEach(x => m[x] = (m[x] || 0) + 1); let best = 0, sym = results[0]; for (const k in m) if (m[k] > best) { best = m[k]; sym = +k; } return { count: best, sym }; }

    _resolve(results) {
      const { count, sym } = this._matchInfo(results);
      let base = 0;
      if (this._pendingWinOverride != null) base = this._pendingWinOverride;
      else { const p = this._cfg.payouts[count]; if (p) base = Math.round(this._state.bet * this._cfg.symbols[sym].value * p); }
      this._pendingWinOverride = null;
      this._emit('result', { reels: results, count, symbol: sym, win: base });

      if (base > 0) {
        this._engine.flashWin(results, sym);
        this._burst(count >= 4 ? 150 : 80, this._cfg.symbols[sym].color);
        beep(this._cfg.sound && !this._state.muted, 880, .1); setTimeout(() => beep(this._cfg.sound && !this._state.muted, 1180, .12), 110);
        if (count >= 4) { this._shake(); this._toast('MEGA LINE', this._cfg.symbols[sym].color); } else this._toast(count + ' MATCH · +' + base, this._cfg.symbols[sym].color);
        this._emit('win', { amount: base, count, symbol: sym });
        this._startGamble(base);
      } else {
        this._toast('NO LINE', '#9aa'); beep(this._cfg.sound && !this._state.muted, 160, .15, 'sawtooth', .1);
        this._emit('noresult', { reels: results }); this._endSpin();
      }
    }

    /* ----- phase escalation ----- */
    _startGamble(base) { this._state.phase = 0; this._state.pot = base; this._updateGamble(); this._el.gamble.classList.add('show'); sweep(this._cfg.sound && !this._state.muted, 300, 1000, .4); this._emit('phasechange', { phase: 0, pot: base }); }
    _updateGamble() {
      const s = this._state, cap = s.phase >= this._maxPhase();
      this._el.gwin.textContent = s.pot;
      this._el.gphase.textContent = this._cfg.phaseNames[s.phase] + ' · ×' + this._cfg.phaseMultipliers[s.phase];
      this._lightLadder(s.phase);
      this._el.rnext.textContent = cap ? 'MAXED' : ('×' + this._cfg.phaseMultipliers[s.phase + 1]);
      this._el.risk.style.display = cap ? 'none' : '';
      this._el.gnext.textContent = cap ? 'Max phase for this bet — BANK to collect, or bet higher next spin.' : '50/50 — win to climb the phase ladder, lose it all.';
    }
    _risk() {
      if (!this._el.gamble.classList.contains('show')) return;
      const muted = !(this._cfg.sound && !this._state.muted);
      beep(!muted, 520, .06); sweep(!muted, 800, 200, .3); this._el.risk.disabled = true;
      const decide = this.resolveRisk ? Promise.resolve(this.resolveRisk(this._state.phase, this._state.pot)) : Promise.resolve({ won: Math.random() < this._cfg.riskOdds });
      setTimeout(() => decide.then(r => {
        this._el.risk.disabled = false; const won = !!(r && r.won);
        if (won) {
          this._state.phase++; this._state.pot = Math.round(this._state.pot * 2);
          this._burst(70, this._state.phase >= this._maxPhase() ? '#ffd84d' : '#39ff9c'); beep(!muted, 1000, .1); setTimeout(() => beep(!muted, 1400, .12), 100); this._shake();
          this._emit('risk', { won: true, phase: this._state.phase, pot: this._state.pot });
          this._emit('phasechange', { phase: this._state.phase, pot: this._state.pot });
          if (this._state.phase >= this._cfg.phaseNames.length - 1) { this._toast('BONUS PHASE!', '#ffd84d'); this._burst(200, '#ffd84d'); }
          this._updateGamble();
        } else {
          this._state.pot = 0; this._lightLadder(-1); this._el.gwin.textContent = '0'; this._el.gphase.textContent = 'BUSTED';
          this._toast('PHASE LOST', '#ff4d6d'); beep(!muted, 140, .3, 'sawtooth', .2); this._shake();
          this._emit('risk', { won: false }); this._emit('bust', {});
          setTimeout(() => { this._el.gamble.classList.remove('show'); this._endSpin(); }, 900);
        }
      }), 350);
    }
    _bank() {
      if (!this._el.gamble.classList.contains('show')) return;
      const muted = !(this._cfg.sound && !this._state.muted);
      this._state.balance += this._state.pot; this._state.lastWin = this._state.pot; this._el.lastwin.textContent = this._state.pot;
      this._toast('BANKED +' + this._state.pot, '#39ff9c'); this._burst(120, '#39ff9c');
      beep(!muted, 700, .08); setTimeout(() => beep(!muted, 1050, .1), 90); setTimeout(() => beep(!muted, 1400, .12), 180);
      this._el.gamble.classList.remove('show'); this._renderHUD();
      this._emit('bank', { amount: this._state.pot }); this._emit('balancechange', { balance: this._state.balance });
      this._endSpin();
    }
    _endSpin() { this._state.spinning = false; this._el.spin.disabled = false; this._lightLadder(0); clearTimeout(this._watch); this._emit('spinend', { balance: this._state.balance }); }

    /* ----- particles ----- */
    _initFX() {
      const cv = this._el.fx, ctx = cv.getContext('2d'); this._parts = [];
      const fit = () => { const r = this._el.cab.getBoundingClientRect(); cv.width = r.width; cv.height = r.height; };
      this._fxFit = fit; fit();
      try { this._ro2 = new ResizeObserver(fit); this._ro2.observe(this._el.cab); } catch (e) {}
      const loop = () => {
        this._fxRaf = requestAnimationFrame(loop);
        ctx.clearRect(0, 0, cv.width, cv.height);
        for (const p of this._parts) { p.vy += .18; p.x += p.vx; p.y += p.vy; p.life -= .018;
          ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.shadowBlur = 12; ctx.shadowColor = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0; this._parts = this._parts.filter(p => p.life > 0);
      };
      loop();
    }
    _burst(n, color) {
      const cv = this._el.fx, cx = cv.width / 2, cy = cv.height * 0.5;
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 8;
        this._parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, life: 1, color, size: 2 + Math.random() * 3.5 }); }
    }
  }

  /* ----------------------------- register ----------------------------- */
  if (!customElements.get('neon-slot')) customElements.define('neon-slot', NeonSlot);

  /* convenience: NeonSlot.mount(target, options) */
  NeonSlot.mount = function (target, options) {
    const el = document.createElement('neon-slot');
    options = options || {};
    if (options.engine) el.setAttribute('engine', options.engine);
    if (options.balance != null) el.setAttribute('balance', options.balance);
    if (options.bet != null) el.setAttribute('bet', options.bet);
    if (options.currency) el.setAttribute('currency', options.currency);
    if (options.threeSrc) el.setAttribute('three-src', options.threeSrc);
    if (options.muted) el.setAttribute('muted', '');
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    node.appendChild(el);
    if (options.config) el.config = options.config;
    if (options.resolveSpin) el.resolveSpin = options.resolveSpin;
    if (options.resolveRisk) el.resolveRisk = options.resolveRisk;
    if (options.on) Object.keys(options.on).forEach(k => el.addEventListener(k, options.on[k]));
    return el;
  };

  NeonSlot.baseUrl = SELF_DIR;   // where sibling assets (three.min.js) resolve from
  NeonSlot.version = VERSION;     // check window.NeonSlot.version to confirm the live build
  global.NeonSlot = NeonSlot;
  if (typeof module !== 'undefined' && module.exports) module.exports = NeonSlot;
})(typeof window !== 'undefined' ? window : this);
