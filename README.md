# Meme Enhancer 9000

![Demo](demo.gif)

Private browser editor. Upload Image/Video/GIF, add text/image layers over the media, move them with recorded paths, and save as Image or GIF.

## Install

Download the latest desktop app for your platform from the [GitHub Releases page](https://github.com/KevinKhachariya/meme-enhancer-9000/releases). Pick the ZIP for Windows, macOS, or Linux, extract it, and run **Meme Enhancer 9000**.

## Stack

- Svelte 5 + TypeScript + Vite
- FFmpeg WASM for local video-to-GIF conversion
- Pure typed domain reducer pattern

## Features

- Upload image, GIF, or video as base media
- Convert uploaded video to GIF locally with FFmpeg WASM
- Add text and image layers over the loaded media
- Move layers by dragging them on the preview
- Record movement paths with GIF restart sync
- Generate PNG/GIF preview and save through browser download
- Desktop packaging with Neutralinojs for Windows, macOS, and Linux
- Native desktop Save As dialog when running in the Neutralinojs app

## Quick Start (no dev server)

Build once, then serve with the included production server:

```bash
npm install
npm run build
npm start
```

Then open **http://localhost:9000**.

> **Why a server?** The app uses FFmpeg WASM which relies on `SharedArrayBuffer`. This
> requires special HTTP headers (`Cross-Origin-Opener-Policy` and
> `Cross-Origin-Embedder-Policy`) — you can't just open `index.html` directly.
> The built-in `server.js` handles this for you using only Node.js built-in modules,
> no extra dependencies.

## Desktop app development

End users should install from the [GitHub Releases page](https://github.com/KevinKhachariya/meme-enhancer-9000/releases). The commands below are for local desktop development.

This project includes a Neutralinojs desktop wrapper branded as **Meme Enhancer 9000**. The desktop app uses the same local-only Svelte/FFmpeg WASM frontend and adds a native Save As flow for exports.

```bash
npm install
npm run desktop:dev
```

Build desktop release bundles:

```bash
npm run desktop:build
```

Neutralinojs writes release artifacts to `dist/desktop/`. The GitHub release workflow template in `docs/github-release-workflow.yml` packages platform-specific downloads for Windows, macOS, and Linux.

## Development (hot-reload dev server)

For active development with Vite's hot module replacement:

```bash
npm install
npm run dev
```

Opens at **http://localhost:9000**. Changes to source files will reload the browser automatically.

The dev server already includes the required `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy` headers, so FFmpeg WASM works out of the box.

## License

GPL-2.0-or-later. See [LICENSE](./LICENSE) for the full terms.

This project uses [FFmpeg](https://ffmpeg.org) via `@ffmpeg/core` (GPL-2.0-or-later).
See [ATTRIBUTION.md](./ATTRIBUTION.md) for third-party license details.
