# Human Atlas

An interactive 3D anatomy explorer built with React, Three.js, and shadcn/ui. Take the BodyParts3D adult male reference apart into **2,234 individually selectable meshes**, explore **15 anatomical systems**, and search **3,432 named concepts**.

**[GitHub Pages site](https://llm-junkie.github.io/ha/)** (available after the first deployment).

## Explore

- Orbit, zoom toward the pointer, and select structures directly on the body.
- Toggle systems or individual structures, or use skeleton and organ presets.
- Move from assembled anatomy to a spaced inventory of every visible piece.
- Search anatomical names, source identifiers, and muscle groups such as quads, hamstrings, calves, and glutes.
- Reopen recent selections, smoothly locate or isolate structures, and return to the overall view.
- Adjust automatic rotation speed and direction.
- Fade any anatomical system while keeping selected structures clear.
- Save named views on your device and share links that restore the camera, selection, and layers.
- Use compact controls and detail panels on mobile.
- Install the atlas on your home screen or desktop and explore the complete model offline.

Expand a system in the layers panel to adjust its opacity from 5% to 100%. **Reset opacity** restores the default appearance; the system switches still control visibility. Faded surfaces yield to solid structures behind them when selecting or zooming, and selected structures stay opaque.

Use the bookmark button to save up to 20 named views in this browser, reopen them, or delete them. The link button creates a shareable view, with a copyable field if clipboard access is unavailable. Saving or sharing pauses automatic rotation. Views include the current orbit, zoom, pan, inspector framing, visible systems, individual structure switches, opacity, and exploded layout. Shared views adapt their camera distance on narrower screens and work under the GitHub Pages repository path. Bookmarks remain on this device; links carry the view itself and need no account or server.

## Install and use offline

Open the published site and choose **Install app · App & credits** (or the information button), then **Install Human Atlas**. The button opens a native install prompt when supported; otherwise it shows installation steps. On iPhone or iPad, open the site in Safari, use **Share → Add to Home Screen**, keep **Open as Web App** turned on if shown, then tap **Add**. You may need to open the page menu to find Share, or tap More / View More to find Add to Home Screen. Safari does not provide a website-triggered install prompt. The install link remains visible after offline saving finishes. **Ready offline** confirms that files are saved, independently of installation; the atlas also works offline in a regular browser tab.

Stay connected until the anatomy finishes loading and the panel confirms **Ready offline**. The app saves its interface, catalogue, credits, and all 15 model chunks automatically, reusing the normal anatomy download (about 33 MB compressed). It also supports browsers that need the uncompressed model files. The first visit can finish before the service worker takes control; offline preparation fills any missing cache entries afterward.

Once ready, you can reopen the atlas, search, change layers, save views, and open previously copied view links without a connection. Bookmarks and offline files belong to this browser on this device. Clearing site data removes them, and browsers can evict offline files when storage is low. The panel reports incomplete saving and offers a retry; external source websites still need a connection.

Use the permanent **Update** button in the footer or **App & credits** panel to check for a new release and apply it. The panel confirms when you are up to date, reports connection or saving failures, and waits for a new offline copy to finish preparing before reloading open atlas windows. Saved bookmarks remain. **Update available** also appears when a background check finds a prepared release; it can be applied offline. A release also activates when all old atlas windows are closed. UI-only updates reuse the existing geometry cache. Content hashes keep each catalogue and its geometry together, and old caches are removed only after the new app activates.

PWA registration runs in production builds on HTTPS or localhost. Development stays uncached so edits appear immediately. The manifest, icons, worker scope, and offline navigation use the configured base path, including `/ha/` on GitHub Pages. No extra dependencies or deployment secrets are needed.

## App version

The initial app release is **v0.1.0**. **App & credits → App updates** shows the version currently open, including when the app is installed or offline. The display and built files read the version from `package.json`.

For the next release, run `npm version patch --no-git-tag-version` for fixes, or `npm version minor --no-git-tag-version` for new features. This updates `package.json` and `package-lock.json` together. Validate and deploy the release as usual; installed apps show the new version after an update. Each build still has a content-based cache identifier, so builds with the same release number can update correctly.

## Run locally

Use Node.js 24 LTS (specified in `.nvmrc`); Node.js 22.18 or newer is supported. No API keys or accounts are needed.

```sh
npm ci
npm run dev
```

Open http://localhost:3016. To build the static site, run `npm run build`; the output is in `dist/`.

## Validate

```sh
npm run check
npm test
npm run build
```

Validation covers mesh buffers, names and concept membership, nonoverlapping exploded layouts at desktop and mobile aspect ratios, search and inspection contracts, tap-versus-drag handling, asset URLs under GitHub Pages subpaths, and compressed model downloads. Browser interaction checks have exercised selection, system controls, search, isolation, rotation, and 390×844, 320×568, and 844×390 layouts. Phone controls stay clear of the exploded inventory, and isolated structures fit the space above or beside the detail panel. Physical-device performance and real multitouch hardware have not been tested.

Focused viewer tests also cover muscle-group membership, individual visibility, recent history, hidden-geometry drawing, frame scheduling, cursor zoom with inspector offsets and distance limits, saved-view and link validation, storage failures, camera restoration, and layer opacity.

PWA tests cover offline navigation and anatomy, subpath isolation, download deduplication, gzip and raw responses, damaged downloads, storage limits, update activation, cache reuse, and failed updates. Manual-update tests cover checking for releases, using an already prepared release without a connection, waiting for downloads, and recovering from connection or installation failures. Every production build also validates the manifest, PNG icon sizes, scoped URLs, and content hashes against the files being deployed.

The production `/ha/` preview has also been reopened with its server stopped: full anatomy, search, and isolation remained usable. Browser checks confirmed that **Update** applies a new release, reports when the app is current, and allows retrying a failed connection. Update controls and feedback remain visible on a small phone layout. Saved views were retained after an update. The manual install button, expandable iPhone/iPad steps, persistent install link, and offline status were checked on a small phone layout; OS-level installation on physical phones has not been tested.

## Anatomy data

The current viewer uses **BodyParts3D 4.0**, an adult male reference anatomy, licensed **CC BY 4.0**. It does not represent every human structure or variation. Individual source meshes are distinct from named concepts, which may group multiple meshes. Descriptions distinguish general system context from individual organ explanations.

Geometry is simplified for browser performance while retaining every source mesh. The packaged model contains 2,288,268 triangles and downloads approximately 33 MB of compressed geometry. Full credits, source links, and adaptation details are in [ATTRIBUTION.md](public/ATTRIBUTION.md).

This is an educational explorer, not a diagnostic or surgical tool.

## How it works

Geometry is merged into batches whose draw indices contain only visible structures. Per-structure GPU textures control translation and selection, while component geometry supports accurate picking. Exploded layouts pack only visible pieces; layout, visibility and selection buffers stay cached during animation. The frame loop wakes for interactions, loading and animations, then stops when the view is still. It also pauses while the browser tab is hidden.

Recent selections are stored locally in the browser. Muscle search shortcuts group verified source meshes without modifying the source catalogue. Guided camera movement respects the reduced-motion setting and yields to manual navigation.

Rendering and navigation improvements are adapted from [isunky/Anatolume](https://github.com/isunky/Anatolume/tree/3cef53da908c902f13bd48c10cd6365de162c150); cursor zoom and muscle-group search are adapted from [wiiiimm/human-atlas](https://github.com/wiiiimm/human-atlas/tree/9c1dd3d222a54844c1a8b54870663ce63b9d53b0).

The optional WebMCP tools expose anatomy search and inspection in compatible browsers. The visible interface works without them.

## Rebuilding geometry

The repository includes browser-ready geometry. Rebuilding it is optional: obtain the official BodyParts3D OBJ archive and English metadata tables, prepare the joined concepts and display-system mappings, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs` and `node scripts/compress-models.mjs`. Simplification uses a 0.2% relative error limit per structure.

## Deploy

The included [GitHub Actions workflow](.github/workflows/deploy-pages.yml) builds and deploys the static site directly to GitHub Pages.

1. In the fork's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push these changes to `main`, or run **Deploy to GitHub Pages** from the **Actions** tab.
3. Open the site URL shown by the deployment. For this fork, it is https://llm-junkie.github.io/ha/.

Every push to `main` installs dependencies with `npm ci`, checks types, runs validation, builds `dist/`, and deploys it. Pull requests run the same checks and build without publishing. No Vercel account, deployment token, or additional secrets are needed.

The build reads the site's base path from GitHub Pages, so model downloads, scripts, styles, and the favicon work under a repository path such as `/ha/`, a renamed fork, or a custom domain. To test the repository path locally:

```sh
npm run build -- --base=/ha/
npm run preview -- --base=/ha/
```

In Windows PowerShell, use `npm.cmd` in these two commands so the `--base` option is passed through to Vite.

Open http://localhost:4173/ha/. A normal `npm run build` uses `/` and can also be served by another static host. `BASE_PATH` can override that default for other subpath deployments. The 3D viewer requires WebGL 2.

## License

Original application code is released under the [MIT License](LICENSE). **The anatomy data has its own CC BY 4.0 license**; preserve the attribution when redistributing it. Third-party dependencies retain their respective licenses.

Issues and pull requests are welcome. Please include reproduction steps and browser/device details for interaction problems.
