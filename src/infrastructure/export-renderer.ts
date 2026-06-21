import { cleanupWorkDir, ensureFFmpeg } from './ffmpeg';
import { layerPositionAtTime } from '../domain/layer-playback';
import type { Layer, MediaFile } from '../domain/types';

export type PreviewRenderProgress = Readonly<{
  message: string;
  progress?: number;
}>;

export type PreviewRenderResult = Readonly<{
  blob: Blob;
  fileName: string;
  mimeType: 'image/png' | 'image/gif';
}>;

export type PreviewRenderOptions = Readonly<{
  media: MediaFile;
  layers: readonly Layer[];
  fps: number;
  colors: number;
  onProgress?: (progress: PreviewRenderProgress) => void;
}>;

type BitmapMap = ReadonlyMap<string, ImageBitmap>;

export async function renderPreview(options: PreviewRenderOptions): Promise<PreviewRenderResult> {
  if (options.media.kind === 'image') {
    return renderStillPreview(options);
  }

  return renderGifPreview(options);
}

async function renderStillPreview(options: PreviewRenderOptions): Promise<PreviewRenderResult> {
  options.onProgress?.({ message: 'Rendering image preview...' });
  const baseBitmap = await createImageBitmap(options.media.blob);
  const width = options.media.width ?? baseBitmap.width;
  const height = options.media.height ?? baseBitmap.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');

  const layerBitmaps = await loadImageLayerBitmaps(options.layers);
  try {
    ctx.drawImage(baseBitmap, 0, 0, width, height);
    drawLayers(ctx, options.layers, layerBitmaps, width, height, 0);
    const blob = await canvasToBlob(canvas, 'image/png');
    return {
      blob,
      fileName: withSuffix(options.media.name, 'meme', 'png'),
      mimeType: 'image/png',
    };
  } finally {
    baseBitmap.close?.();
    closeBitmaps(layerBitmaps);
  }
}

async function renderGifPreview(options: PreviewRenderOptions): Promise<PreviewRenderResult> {
  const ffmpeg = await ensureFFmpeg();
  const workDir = `/preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPath = `${workDir}/input.gif`;
  const framesDir = `${workDir}/frames`;
  const outDir = `${workDir}/out`;
  const outputPath = `${workDir}/output.gif`;
  const fps = Math.max(1, Math.min(30, Math.round(options.fps)));
  const colors = Math.max(2, Math.min(256, Math.round(options.colors)));
  const width = options.media.width ?? 640;
  const height = options.media.height ?? 360;
  const duration = Math.max(0.1, options.media.duration ?? 5);

  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      options.onProgress?.({ message: `Encoding GIF... ${Math.round(progress * 100)}%`, progress });
    }
  };

  ffmpeg.on('progress', progressHandler);

  try {
    options.onProgress?.({ message: 'Preparing GIF frames...' });
    await ffmpeg.createDir(workDir);
    await ffmpeg.createDir(framesDir);
    await ffmpeg.createDir(outDir);
    await ffmpeg.writeFile(inputPath, new Uint8Array(await options.media.blob.arrayBuffer()));

    const extractCode = await ffmpeg.exec([
      '-i', inputPath,
      '-t', String(duration),
      '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos`,
      `${framesDir}/frame_%05d.png`,
    ]);
    if (extractCode !== 0) throw new Error(`Could not extract GIF frames (${extractCode})`);

    const frames = (await ffmpeg.listDir(framesDir))
      .filter((entry) => entry.name.endsWith('.png'))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!frames.length) throw new Error('No frames were extracted from the GIF');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context');

    const layerBitmaps = await loadImageLayerBitmaps(options.layers);
    try {
      let index = 1;
      for (const frame of frames) {
        options.onProgress?.({ message: `Drawing layers on frame ${index}/${frames.length}...`, progress: index / frames.length });
        const data = await ffmpeg.readFile(`${framesDir}/${frame.name}`);
        if (typeof data === 'string') throw new Error('FFmpeg returned text frame data');
        const bitmap = await createImageBitmap(new Blob([copyToArrayBuffer(data)], { type: 'image/png' }));
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();
        drawLayers(ctx, options.layers, layerBitmaps, width, height, (index - 1) / fps);
        const blob = await canvasToBlob(canvas, 'image/png');
        await ffmpeg.writeFile(`${outDir}/frame_${String(index).padStart(5, '0')}.png`, new Uint8Array(await blob.arrayBuffer()));
        index += 1;
      }
    } finally {
      closeBitmaps(layerBitmaps);
    }

    options.onProgress?.({ message: 'Encoding final GIF...' });
    const encodeCode = await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', `${outDir}/frame_%05d.png`,
      '-filter_complex', `split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      '-loop', '0',
      outputPath,
    ]);
    if (encodeCode !== 0) throw new Error(`Could not encode GIF (${encodeCode})`);

    const out = await ffmpeg.readFile(outputPath);
    if (typeof out === 'string') throw new Error('FFmpeg returned text GIF data');
    options.onProgress?.({ message: 'Preview ready.', progress: 1 });
    return {
      blob: new Blob([copyToArrayBuffer(out)], { type: 'image/gif' }),
      fileName: withSuffix(options.media.name, 'meme', 'gif'),
      mimeType: 'image/gif',
    };
  } finally {
    ffmpeg.off('progress', progressHandler);
    await cleanupWorkDir(ffmpeg, workDir).catch(() => undefined);
  }
}

function drawLayers(
  ctx: CanvasRenderingContext2D,
  layers: readonly Layer[],
  layerBitmaps: BitmapMap,
  width: number,
  height: number,
  timeSeconds: number,
): void {
  for (const layer of layers) {
    if (!layer.enabled) continue;
    const position = layerPositionAtTime(layer, timeSeconds);
    const x = position.x * width;
    const y = position.y * height;

    if (layer.type === 'text') {
      drawTextLayer(ctx, layer, x, y, width);
    } else {
      const bitmap = layerBitmaps.get(layer.id);
      if (!bitmap) continue;
      const imageWidth = Math.max(16, Math.min(width * 0.45, layer.naturalWidth) * layer.scale);
      const imageHeight = imageWidth * (layer.naturalHeight / Math.max(1, layer.naturalWidth));
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(bitmap, x, y, imageWidth, imageHeight);
      ctx.restore();
    }
  }
}

function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  layer: Extract<Layer, { type: 'text' }>,
  x: number,
  y: number,
  canvasWidth: number,
): void {
  const fontPx = Math.max(8, layer.fontSizePx);
  const strokeWidth = Math.max(0, layer.outlineWidth);
  ctx.save();
  ctx.font = `${fontPx}px Impact, Arial Black, sans-serif`;
  ctx.fillStyle = layer.color;
  ctx.strokeStyle = layer.outlineColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'top';
  drawWrappedText(ctx, layer.text, x, y, canvasWidth * 0.9, fontPx * 1.1, strokeWidth);
  ctx.restore();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  strokeWidth: number,
): void {
  const lines = String(text || '').split('\n').flatMap((line) => {
    const words = line.split(/\s+/);
    const out: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    out.push(current);
    return out;
  });

  lines.forEach((line, index) => {
    const yy = y + index * lineHeight;
    if (strokeWidth > 0) ctx.strokeText(line, x, yy);
    ctx.fillText(line, x, yy);
  });
}

async function loadImageLayerBitmaps(layers: readonly Layer[]): Promise<Map<string, ImageBitmap>> {
  const bitmaps = new Map<string, ImageBitmap>();
  await Promise.all(layers.map(async (layer) => {
    if (layer.type !== 'image' || !layer.enabled) return;
    const blob = await fetch(layer.objectUrl).then((response) => response.blob());
    bitmaps.set(layer.id, await createImageBitmap(blob));
  }));
  return bitmaps;
}

function closeBitmaps(bitmaps: BitmapMap): void {
  for (const bitmap of bitmaps.values()) bitmap.close?.();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create image blob'));
    }, type);
  });
}

function copyToArrayBuffer(data: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(arrayBuffer).set(data);
  return arrayBuffer;
}

function withSuffix(fileName: string, suffix: string, extension: string): string {
  return `${(fileName || 'meme').replace(/\.[^.]+$/, '')}-${suffix}.${extension}`;
}
