# Meme Enhancer 9000

![Demo](Demo.gif)

Private browser editor. Upload Image/Video/GIF, add text/image layers over the media, move them with recorded paths, and save as Image or GIF.

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

## Run

```bash
npm install
npm run dev
```

## License

GPL-2.0-or-later. See [LICENSE](./LICENSE) for the full terms.

This project uses [FFmpeg](https://ffmpeg.org) via `@ffmpeg/core` (GPL-2.0-or-later).
See [ATTRIBUTION.md](./ATTRIBUTION.md) for third-party license details. The upstream
FFmpeg license files are included as `COPYING.GPLv2` and `COPYING.LGPLv2.1`.

## Architecture rule

Keep domain logic pure where possible:

- pure types/factories/reducers in `src/domain/`
- browser side effects in Svelte components, stores, or future service modules
- no FFmpeg/export logic in UI components once those stages begin
