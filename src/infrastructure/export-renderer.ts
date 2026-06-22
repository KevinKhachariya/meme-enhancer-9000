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
  duration: number;
  outputWidth?: number;
  outputHeight?: number;
  dither: 'none' | 'bayer' | 'sierra2_4a' | 'floyd_steinberg';
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
  const naturalWidth = options.media.width ?? baseBitmap.width;
  const naturalHeight = options.media.height ?? baseBitmap.height;
  const width = options.outputWidth ?? naturalWidth;
  const height = options.outputHeight ?? naturalHeight;
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
  const rawExtractedPath = `${workDir}/frames.raw`;
  const rawOutputPath = `${workDir}/layered.raw`;
  const outputPath = `${workDir}/output.gif`;
  const fps = Math.max(1, Math.min(30, Math.round(options.fps)));
  const colors = Math.max(2, Math.min(256, Math.round(options.colors)));
  const duration = Math.max(0.1, Math.min(options.duration, options.media.duration ?? options.duration));
  // Use export settings for output dimensions, falling back to media's natural size
  const width = options.outputWidth ?? options.media.width ?? 640;
  const height = options.outputHeight ?? options.media.height ?? 360;
  const frameSize = width * height * 4;
  const frameCount = Math.ceil(duration * fps);

  // FFmpeg's progress value is not normalized — clamp it to 0–1 before displaying
  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      const clamped = Math.max(0, Math.min(1, progress));
      options.onProgress?.({ message: `Encoding GIF... ${Math.round(clamped * 100)}%`, progress: clamped });
    }
  };

  ffmpeg.on('progress', progressHandler);

  try {
    options.onProgress?.({ message: 'Preparing GIF frames...' });
    await ffmpeg.createDir(workDir);
    await ffmpeg.writeFile(inputPath, new Uint8Array(await options.media.blob.arrayBuffer()));

    // Extract ALL frames as a single rawvideo file — avoids %d pattern matching issues
    const extractCode = await ffmpeg.exec([
      '-i', inputPath,
      '-t', String(duration),
      '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos`,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      rawExtractedPath,
    ]);
    if (extractCode !== 0) throw new Error(`Could not extract GIF frames (${extractCode})`);

    const allFrameData = await ffmpeg.readFile(rawExtractedPath);
    if (typeof allFrameData === 'string') throw new Error('FFmpeg returned text frame data');

    const actualFrameCount = Math.floor(allFrameData.length / frameSize);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context');

    const layerBitmaps = await loadImageLayerBitmaps(options.layers);
    const imageData = ctx.createImageData(width, height);

    // Build the output raw data by processing each frame
    const outputSize = actualFrameCount * frameSize;
    const outputBuffer = new Uint8Array(outputSize);

    try {
      for (let index = 0; index < actualFrameCount; index++) {
        options.onProgress?.({ message: `Drawing layers on frame ${index + 1}/${actualFrameCount}...`, progress: (index + 1) / actualFrameCount });

        const offset = index * frameSize;
        const frameSlice = allFrameData.subarray(offset, offset + frameSize);

        // Copy raw RGBA directly into ImageData — no PNG decode needed
        imageData.data.set(frameSlice);
        ctx.putImageData(imageData, 0, 0);

        drawLayers(ctx, options.layers, layerBitmaps, width, height, index / fps);

        // Read back raw RGBA — getImageData is a fast memory copy
        const outData = ctx.getImageData(0, 0, width, height);
        const outBytes = new Uint8Array(outData.data.buffer, outData.data.byteOffset, outData.data.byteLength);
        outputBuffer.set(outBytes, offset);
      }
    } finally {
      closeBitmaps(layerBitmaps);
    }

    // Write all processed frames as a single raw file
    await ffmpeg.writeFile(rawOutputPath, outputBuffer);

    options.onProgress?.({ message: 'Encoding final GIF...' });
    const encodeCode = await ffmpeg.exec([
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-framerate', String(fps),
      '-i', rawOutputPath,
      '-frames:v', String(actualFrameCount),
      '-filter_complex', `split[s0][s1];[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse=${ffmpegDither(options.dither)}`,
      '-gifflags', '-offsetting',
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
  ctx.font = `${fontPx}px ${layer.fontFamily || 'system-ui, sans-serif'}`;
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

function ffmpegDither(dither: 'none' | 'bayer' | 'sierra2_4a' | 'floyd_steinberg'): string {
  switch (dither) {
    case 'none': return 'dither=none';
    case 'bayer': return 'dither=bayer:bayer_scale=5';
    case 'sierra2_4a': return 'dither=sierra2_4a';
    case 'floyd_steinberg': return 'dither=floyd_steinberg';
  }
}
