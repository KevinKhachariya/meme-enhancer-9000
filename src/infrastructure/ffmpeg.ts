let ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg | null = null;
let ffmpegLoadPromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null;

export async function ensureFFmpeg(): Promise<import('@ffmpeg/ffmpeg').FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const [{ FFmpeg }, coreURL, wasmURL] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/core?url').then((m) => m.default as string),
      import('@ffmpeg/core/wasm?url').then((m) => m.default as string),
    ]);
    const instance = new FFmpeg();
    await instance.load({ coreURL, wasmURL });
    ffmpeg = instance;
    return instance;
  })();

  try {
    return await ffmpegLoadPromise;
  } finally {
    ffmpegLoadPromise = null;
  }
}

export async function cleanupWorkDir(instance: import('@ffmpeg/ffmpeg').FFmpeg, workDir: string): Promise<void> {
  let entries: Array<{ name: string; isDir: boolean }>;

  try {
    entries = await instance.listDir(workDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue;
    const path = `${workDir}/${entry.name}`;
    if (entry.isDir) {
      await cleanupWorkDir(instance, path);
    } else {
      await instance.deleteFile(path).catch(() => undefined);
    }
  }

  await instance.deleteDir(workDir).catch(() => undefined);
}
