# Deploying `<neon-slot>` to a CDN (GitHub + jsDelivr)

Goal: host the component on a free global CDN at a stable URL, embed it on any site with one
`<script>` tag, and push updates that reach **all** users automatically.

We use **jsDelivr serving directly from a GitHub repo** — no build server, no npm, no cost.

---

## 1. One-time setup — put the files on GitHub

Only these files need to ship (the `examples/` folder is for you, not users):

```
neon-slot.js
three.min.js        ← only fetched when engine="3d" is used
react/NeonSlot.jsx  ← optional
README.md
```

```bash
cd neonslot/embed
git init
git add neon-slot.js three.min.js react README.md package.json CDN-DEPLOY.md
git commit -m "neon-slot v1.0.0"

# create the GitHub repo (using the GitHub CLI) and push
gh repo create neon-slot --public --source=. --remote=origin --push

# tag a release so jsDelivr can serve a clean version
git tag v1.0.0
git push origin v1.0.0
```

> No `gh`? Create an empty public repo named `neon-slot` on github.com, then:
> `git remote add origin https://github.com/<YOU>/neon-slot.git && git push -u origin main && git push origin v1.0.0`

---

## 2. The embed snippet your users paste

Replace `<YOU>` with your GitHub username. The **`@v1`** floating range is the magic part —
it always serves the newest `v1.x.x` tag, so users auto-update without changing their code.

```html
<!-- NEON RUSH slot — auto-updates within v1 -->
<script src="https://cdn.jsdelivr.net/gh/<YOU>/neon-slot@v1/neon-slot.js"></script>

<neon-slot balance="1000" bet="25" currency="CRD"></neon-slot>
```

For the 3D engine, nothing extra to configure — `three.min.js` auto-loads from the **same CDN
path** the script came from (the component detects its own URL):

```html
<neon-slot engine="3d"></neon-slot>
```

Minified build (jsDelivr generates it automatically — just add `.min`):

```html
<script src="https://cdn.jsdelivr.net/gh/<YOU>/neon-slot@v1/neon-slot.min.js"></script>
```

---

## 3. URL forms — pick your stability vs freshness

| URL pattern | Behaviour | Use for |
|---|---|---|
| `…/neon-slot@v1.0.0/neon-slot.js` | **Pinned**, immutable, cached forever | locking a known-good build |
| `…/neon-slot@v1/neon-slot.js` | **Auto-updates** to newest `v1.x.x` | ✅ what you give users |
| `…/neon-slot@latest/neon-slot.js` | newest tag across all majors | risky (picks up breaking v2) |
| `…/neon-slot/neon-slot.js` | newest release, no range | demos |

**Recommendation:** give users `@v1`. Ship bug-fixes and features as `v1.0.1`, `v1.1.0`, … and
they flow out automatically. Only move people to `@v2` when you make a breaking change.

---

## 4. Shipping an update (the everyday workflow)

```bash
# 1. edit neon-slot.js, bump the version
#    - change  const VERSION = "1.0.1";  inside neon-slot.js
#    - change  "version": "1.0.1"        inside package.json
git commit -am "v1.0.1 — fix X"

# 2. tag it INSIDE the same major so @v1 picks it up
git tag v1.0.1
git push origin main v1.0.1
```

That's it — every site on `@v1` now serves `1.0.1` once their CDN cache refreshes.

### Make it instant (cache busting)

jsDelivr caches floating ranges (`@v1`) for up to **12 hours**. To push an update out
immediately, hit the purge URL once after pushing the tag:

```
https://purge.jsdelivr.net/gh/<YOU>/neon-slot@v1/neon-slot.js
https://purge.jsdelivr.net/gh/<YOU>/neon-slot@v1/three.min.js
```

(Pinned URLs like `@v1.0.1` are never cached stale — they're new URLs each release.)

Verify which build is live anywhere:

```js
console.log(window.NeonSlot.version);   // "1.0.1"
```

---

## 5. Notes

- **CORS / security:** loading via `<script src>` cross-origin needs no CORS config. The component
  generates its own symbol graphics on a canvas (no external images), so nothing taints the canvas.
- **Outcomes:** for real crypto/prizes keep outcomes server-authoritative — set
  `el.resolveSpin = async (bet) => fetch('/api/spin', …)`. The CDN only delivers the UI; your
  backend owns the money. See `README.md`.
- **Own domain later:** if you outgrow jsDelivr, the same files drop onto Cloudflare Pages /
  Netlify / Vercel behind `cdn.yourbrand.com` — only the `<script src>` URL changes.
```
