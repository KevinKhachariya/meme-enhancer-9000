import { cleanupWorkDir, ensureFFmpeg } from './ffmpeg';

export type VideoGifConversionOptions = Readonly<{
  durationSeconds: number;
  fps: number;
  maxWidth: number;
  maxHeight: number;
  colors: number;
  onProgress?: (progress: number) => void;
}>;

export async function convertVideoToGif(file: File, options: VideoGifConversionOptions): Promise<Blob> {
  const instance = await ensureFFmpeg();
  const workDir = `/video-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPath = `${workDir}/input`;
  const outputPath = `${workDir}/output.gif`;
  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) options.onProgress?.(Math.max(0, Math.min(1, progress)));
  };

  instance.on('progress', progressHandler);

  try {
    await instance.createDir(workDir);
    await instance.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));

    const duration = Math.max(0.1, options.durationSeconds);

    const exitCode = await instance.exec([
      '-i', inputPath,
      '-an',
      '-t', String(duration),
      // Keep the upload's native resolution and frame rate, use the full
      // 256-color palette with Floyd–Steinberg dithering so the GIF quality
      // matches the source video instead of downscaling/banding it.
      '-filter_complex', `[0:v]split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=floyd_steinberg`,
      '-gifflags', '-offsetting',
      '-loop', '0',
      outputPath,
    ]);

    if (exitCode !== 0) {
      throw new Error(`FFmpeg video conversion failed with exit code ${exitCode}`);
    }

    const data = await instance.readFile(outputPath);
    if (typeof data === 'string') {
      throw new Error('FFmpeg returned text data instead of GIF bytes');
    }

    const arrayBuffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(arrayBuffer).set(data);

    options.onProgress?.(1);
    return new Blob([arrayBuffer], { type: 'image/gif' });
  } finally {
    instance.off('progress', progressHandler);
    await cleanupWorkDir(instance, workDir).catch(() => undefined);
  }
}


