# Kurry Tranzit Logist — landing page

Ultra-premium single-page website for **Kurry Tranzit Logist** (Uzbekistan logistics
company). Static site — no build step, no dependencies to install.

Stack: semantic HTML5, modern CSS, vanilla JS, Three.js r149 (vendored locally).

## Live URL

**https://muhammadjonovsa.github.io/**

Deployed by `.github/workflows/pages.yml`, which publishes only this folder as the
Pages artifact, so the site is served from the repository root of Pages.

> If Pages is instead set to "Deploy from a branch" (`master` / root), the same files
> are reachable at `https://muhammadjonovsa.github.io/kurry-tranzit-site/`
> and all asset paths keep working — the markup uses relative URLs.

## Run locally

Open `index.html` directly, or serve the folder over HTTP (recommended, so the
browser does not block the WebGL scene):

```bash
python -m http.server 8000
# then open http://127.0.0.1:8000/
```

Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, cPanel.
There is nothing to compile — upload the contents of this folder as-is.

## Files

```
index.html                     all markup, SEO meta, JSON-LD, inline critical CSS hook
assets/css/styles.css          theme, layout, responsive, animations
assets/js/hero.js              procedural Three.js scene (trucks, globe, routes, particles)
assets/js/main.js              nav, reveals, counters, tilt, form UX
assets/vendor/three.min.js     Three.js r149 UMD (vendored, no CDN)
assets/img/favicon.svg         favicon
assets/img/og-cover.svg        social cover source
assets/img/og-cover.png        1200x630 social cover (used by og:image)
robots.txt / sitemap.xml       crawler directives
.nojekyll                      required so GitHub Pages serves the folder as-is
```

## Sections

`#home` (3D hero) Â· `#about` Â· `#services` Â· `#why` Â· `#mission` Â· `#contact`

Navigation is a single continuous page: all in-page links scroll smoothly and never
reload or open a new tab. The only links that leave the page are the Telegram chat
(`t.me/+998907571500`), the single `tel:` number and the Yandex Maps link — all intentional.

## Contacts used in the page

- Telegram: `https://t.me/+998907571500`
- Phone: `+998 90 757 15 00` → `tel:+998907571500`
- Office: Fergana city, Universitet ko`chasi 73-uy
- Map: `https://yandex.uz/maps/?text=Fargona%20shahri%2C%20Universitet%20kochasi%2073`

## 3D scene notes

The hero scene is generated in code — no GLTF/GLB models or texture downloads, so the
page stays fast and works offline. It is rendered by `assets/js/hero.js` into
`<canvas class="hero__canvas">`, with a second, smaller scene in the About section.

Degradation is handled:

- no WebGL / no Three.js → CSS gradient hero with a static poster fallback
- mobile or `prefers-reduced-motion` → the render loop stops when the hero scrolls out
  of view, and pointer parallax is disabled
- low-power devices get a reduced particle count and fewer trucks

## Contact form

The form is client-side only (no backend): it validates input, builds a formatted
message, offers clipboard copy, and links the visitor to Telegram with the message
pre-filled. Wire it to a real endpoint (Formspree, your own API, Telegram bot) in
`assets/js/main.js` if you want server-side submissions.

## Before going live

1. Replace `https://kurrytranzitlogist.uz/` if your real domain differs — it appears in
   `index.html` (`canonical`, `og:url`, `og:image`, JSON-LD) and in `robots.txt` +
   `sitemap.xml`.
2. Update the social cover (`assets/img/og-cover.png`) if the branding changes.
3. Set up HTTPS — the `tel:` and Telegram links assume a live site.
4. Re-generate `assets/img/og-cover.png` from the SVG if you edit the source.
