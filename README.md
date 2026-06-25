# NEON RUSH — Embeddable Slot Component

A neon/vaparwave, phase-escalation slot machine packaged as a **Web Component** (`<neon-slot>`).
Drop it into any frontend — React, Vue, Angular, Svelte, plain HTML, Webflow — with **no build step**.
Shadow DOM keeps its styles fully isolated from the host app.

```
embed/
├── neon-slot.js          ← the component (this is the deliverable; no dependencies)
├── three.min.js          ← only needed if you use engine="3d"
├── react/NeonSlot.jsx    ← optional thin React wrapper
├── examples/
│   ├── plain.html        ← plain HTML + live event log
│   └── server-resolver.html ← server-authoritative outcomes
└── README.md
```

## Quick start

```html
<script src="neon-slot.js"></script>
<neon-slot balance="1000" bet="25" currency="COINS"></neon-slot>
```

That's it — fully playable (client-side RNG) out of the box.

### Pick an engine

```html
<neon-slot engine="stylized"></neon-slot>   <!-- default: zero-dependency DOM/CSS -->
<neon-slot engine="3d" three-src="three.min.js"></neon-slot> <!-- WebGL via Three.js -->
```

`three-src` tells the 3D engine where to load Three.js from (path or CDN URL). If it fails to load,
the component automatically falls back to the stylized engine and fires an `engineerror` event.

## Server-authoritative outcomes (recommended for real money/prizes)

The reels only **animate to a result you provide** — they never decide anything. Wire one async hook:

```js
const el = document.querySelector('neon-slot');

el.resolveSpin = async (bet) => {
  const r = await fetch('/api/spin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bet })
  }).then(x => x.json());

  return {
    reels: r.reels,   // array of N symbol indices (0..symbols.length-1), N = config.reels
    win:   r.win      // OPTIONAL authoritative payout. If omitted, the client payout table is used.
  };
};

// OPTIONAL — make the RISK gamble server-authoritative too:
el.resolveRisk = async (phase, pot) => {
  const r = await fetch('/api/risk', { method:'POST', body: JSON.stringify({ phase, pot }) }).then(x=>x.json());
  return { won: r.won };
};
```

If you don't set these hooks, the component uses fair client-side RNG (great for demos/free-play,
**not** safe when money or rewards are on the line — the client can be tampered with).

> Security note: with `resolveSpin`/`resolveRisk` wired to your backend, the browser cannot fabricate
> wins — it can only request animations. Always also debit/credit balance server-side and treat the
> component's `balance` as display only.

## Configuration

Set the `config` property (JS object — merged over defaults). Drives symbols, payouts, phase ladder,
and the bet→phase ceiling tiers:

```js
el.config = {
  currency: "COINS",
  reels: 4,
  symbols: [
    { glyph: "⚡", color: "#0ff7ff", value: 5,  weight: 5 },
    { glyph: "★", color: "#ffd84d", value: 12, weight: 3 },
    { glyph: "7", color: "#ff4d6d", value: 50, weight: 1 }
    // ...
  ],
  payouts: { 4: 1.0, 3: 0.4, 2: 0.12 },   // win = bet * symbol.value * payouts[matchCount]
  phaseMultipliers: [1, 2, 4, 8],
  phaseNames: ["PHASE 1", "PHASE 2", "PHASE 3", "BONUS"],
  betTiers: [                              // these are ALSO the selectable bet buttons
    { bet: 10,  maxPhase: 0 },             // bet 10 → can only reach Phase 1
    { bet: 25,  maxPhase: 1 },
    { bet: 50,  maxPhase: 2 },
    { bet: 100, maxPhase: 3 }              // bet 100 → unlocks Bonus
  ],
  riskOdds: 0.5,                           // client-side risk win chance (ignored if resolveRisk set)
  sound: true
};
```

### Theming

Override the CSS custom properties from the host page (they pierce Shadow DOM):

```css
neon-slot { --neon:#39ff9c; --pink:#ff7b00; --gold:#fff; --radius:18px; max-width:640px; }
```

## Attributes

| Attribute    | Type    | Default      | Notes |
|--------------|---------|--------------|-------|
| `engine`     | string  | `stylized`   | `stylized` or `3d` |
| `balance`    | number  | `1000`       | starting balance |
| `bet`        | number  | `25`         | must match a `betTiers` entry |
| `currency`   | string  | `CREDITS`    | label shown in the HUD |
| `three-src`  | string  | `three.min.js` | where to load Three.js for `engine="3d"` |
| `muted`      | boolean | absent       | disables sound |

## JS API (properties & methods)

```js
el.balance            // get/set balance (number)
el.bet                // get/set current bet
el.spinning           // boolean (read-only)
el.config = {...}     // set configuration (see above)
el.resolveSpin = fn   // server hook for outcomes
el.resolveRisk = fn   // server hook for the gamble

el.spin()             // trigger a spin programmatically
el.setBet(50)         // change bet (must be a tier)
el.setBalance(1000)   // set balance + emit balancechange
el.reset()            // clear spin/gamble state
```

## Events

All events bubble and cross the shadow boundary. `event.detail` payloads:

| Event           | detail |
|-----------------|--------|
| `spinstart`     | `{ bet, balance }` |
| `result`        | `{ reels, count, symbol, win }` |
| `win`           | `{ amount, count, symbol }` |
| `noresult`      | `{ reels }` |
| `phasechange`   | `{ phase, pot }` |
| `risk`          | `{ won, phase?, pot? }` |
| `bank`          | `{ amount }` |
| `bust`          | `{}` |
| `balancechange` | `{ balance }` |
| `betchange`     | `{ bet }` |
| `spinend`       | `{ balance }` |
| `insufficient`  | `{ balance, bet }` |
| `engineerror`   | `{ fallback }` (3D failed → fell back to stylized) |

```js
el.addEventListener('win', (e) => console.log('player won', e.detail.amount));
```

## Framework usage

**Plain JS / mount helper**

```js
NeonSlot.mount('#host', {
  engine: 'stylized', balance: 1000, bet: 25, currency: 'COINS',
  resolveSpin: async (bet) => fetch('/api/spin', {method:'POST',body:JSON.stringify({bet})}).then(r=>r.json()),
  on: { win: (e) => console.log(e.detail) }
});
```

**React** — use the wrapper in `react/NeonSlot.jsx`:

```jsx
<NeonSlot engine="stylized" balance={1000} bet={25}
          resolveSpin={mySpin} onWin={(d) => addCoins(d.amount)} />
```

**Vue** — register `neon-slot` as a custom element and bind normally:

```js
// vite: app.config.compilerOptions.isCustomElement = tag => tag === 'neon-slot'
```
```html
<neon-slot ref="slot" engine="3d" :balance="balance" @win="onWin" />
```

## Browser support

Modern evergreen browsers (Custom Elements v1 + Shadow DOM). The stylized engine has zero
dependencies; the 3D engine needs Three.js (r128+ works; bundled copy included).
