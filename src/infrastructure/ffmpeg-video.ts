import { cleanupWorkDir, withFFmpeg } from './ffmpeg';

export type VideoGifConversionOptions = Readonly<{
  durationSeconds: number;
  fps: number;
  maxWidth: number;
  maxHeight: number;
  colors: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceFps?: number;
  onProgress?: (progress: number) => void;
}>;

export type VideoGifConversionResult = Readonly<{
  blob: Blob;
  width?: number;
  height?: number;
}>;

/**
 * Convert an uploaded video (mp4/mov/webm/...) into an animated GIF.
 *
 * The conversion is a single ffmpeg pass using palettegen/paletteuse, which is
 * the fastest reliable path to a high-quality GIF. We preserve the source
 * resolution unless it exceeds the configured max dimensions (never upscale),
 * and cap the frame rate at the configured value without duplicating frames.
 */
export async function convertVideoToGif(
  file: File,
  options: VideoGifConversionOptions,
): Promise<VideoGifConversionResult> {
  return withFFmpeg(async (ffmpeg) => {
    const workDir = uniqueWorkDir('video');
    const inputPath = `${workDir}/input${extensionOf(file.name)}`;
    const outputPath = `${workDir}/output.gif`;

    try {
      await ffmpeg.createDir(workDir);
      await ffmpeg.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));

      const duration = clamp(options.durationSeconds, 0.1, 120);
      const colors = clamp(Math.round(options.colors), 2, 256);
      const fps = pickFps(options.fps, options.sourceFps);
      const scale = fitWithin(options.sourceWidth, options.sourceHeight, options.maxWidth, options.maxHeight);
      const filter = buildGifFilter({ fps, colors, scale });

      const exitCode = await ffmpeg.exec([
        '-i', inputPath,
        '-an',
        '-t', String(duration),
        '-filter_complex', filter,
        '-c:v', 'gif',
        '-gifflags', '-offsetting',
        '-loop', '0',
        '-y',
        outputPath,
      ]);

      if (exitCode !== 0) {
        throw new Error(`FFmpeg video conversion failed with exit code ${exitCode}`);
      }

      const output = await ffmpeg.readFile(outputPath);
      if (typeof output === 'string') {
        throw new Error('FFmpeg returned text data instead of GIF bytes');
      }

      return {
        blob: blobFromUint8Array(output, 'image/gif'),
        width: scale?.width ?? options.sourceWidth,
        height: scale?.height ?? options.sourceHeight,
      };
    } finally {
      await cleanupWorkDir(ffmpeg, workDir).catch(() => undefined);
    }
  }, options.onProgress);
}

function buildGifFilter(options: {
  fps: number;
  colors: number;
  scale?: { width: number; height: number };
}): string {
  const video = options.scale
    ? `[0:v]scale=${options.scale.width}:${options.scale.height}:flags=lanczos,fps=${options.fps},split[s0][s1]`
    : `[0:v]fps=${options.fps},split[s0][s1]`;

  return [
    video,
    `[s0]palettegen=max_colors=${options.colors}:stats_mode=diff[p]`,
    `[s1][p]paletteuse=dither=floyd_steinberg`,
  ].join(';');
}

/**
 * Never upscale. If the source is unknown we keep ffmpeg's native resolution
 * (quality is preserved by simply not adding a scale filter).
 */
function fitWithin(
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } | undefined {
  if (!sourceWidth || !sourceHeight) return undefined;

  const ratio = Math.min(
    maxWidth / sourceWidth,
    maxHeight / sourceHeight,
    1, // never upscale
  );

  if (ratio >= 1) return undefined;

  const width = Math.max(1, Math.round(sourceWidth * ratio));
  const height = Math.max(1, Math.round(sourceHeight * ratio));

  // Keep dimensions even; some gif encoders handle odd sizes poorly.
  return {
    width: width - (width % 2),
    height: height - (height % 2),
  };
}

/**
 * Use the lower of the configured fps and the source fps. This avoids creating
 * duplicate frames (which would waste time and bytes) while still applying the
 * user's "fps" as a ceiling.
 */
function pickFps(configuredFps: number, sourceFps: number | undefined): number {
  const capped = clamp(Math.round(configuredFps), 1, 30);
  if (!sourceFps || !Number.isFinite(sourceFps)) return capped;
  return Math.min(capped, Math.max(1, Math.round(sourceFps)));
}

function extensionOf(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName);
  return match ? match[0].toLowerCase() : '.mp4';
}

function uniqueWorkDir(prefix: string): string {
  return `/${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function blobFromUint8Array(data: Uint8Array, type: string): Blob {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return new Blob([copy], { type });
}
