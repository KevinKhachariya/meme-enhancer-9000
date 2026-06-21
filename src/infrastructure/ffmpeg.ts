import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

export async function ensureFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
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

export async function cleanupWorkDir(instance: FFmpeg, workDir: string): Promise<void> {
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
