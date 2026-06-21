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
    const fps = Math.max(1, Math.min(60, Math.round(options.fps)));
    const maxWidth = Math.max(16, Math.round(options.maxWidth));
    const maxHeight = Math.max(16, Math.round(options.maxHeight));
    const colors = Math.max(2, Math.min(256, Math.round(options.colors)));
    const scaleFilter = createBoundedScaleFilter(maxWidth, maxHeight);

    const exitCode = await instance.exec([
      '-i', inputPath,
      '-an',
      '-t', String(duration),
      '-filter_complex', `[0:v]fps=${fps},${scaleFilter},split[s0][s1];[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
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

function createBoundedScaleFilter(maxWidth: number, maxHeight: number): string {
  const widthExpr = `if(gt(iw/ih,${maxWidth}/${maxHeight}),trunc(min(${maxWidth},iw)/2)*2,-2)`;
  const heightExpr = `if(gt(iw/ih,${maxWidth}/${maxHeight}),-2,trunc(min(${maxHeight},ih)/2)*2)`;
  return `scale='${widthExpr}':'${heightExpr}':flags=lanczos`;
}

