import type { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * FFmpeg runs in a single Web Worker. The worker serialises messages on its own
 * thread, but the public API has no mutex: two callers that interleave
 * writeFile/exec/readFile calls will corrupt each other's work directory and
 * cross-talk progress events.
 *
 * To keep the app simple and deterministic we give the module a tiny exclusive
 * job queue. Every FFmpeg task (video upload conversion, preview rendering)
 * runs through `withFFmpeg`, one at a time, and progress events are scoped to
 * whichever job is currently running.
 */

let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let activeProgressHandler: ((progress: number) => void) | null = null;

export async function ensureFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const [{ FFmpeg: FFmpegClass }, coreURL, wasmURL] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/core?url').then((mod) => mod.default as string),
      import('@ffmpeg/core/wasm?url').then((mod) => mod.default as string),
    ]);

    const instance = new FFmpegClass();

    // Single global listener dispatches only to the active job. This is what
    // keeps progress from leaking between concurrent/queued operations.
    instance.on('progress', ({ progress }) => {
      if (!Number.isFinite(progress)) return;
      const clamped = Math.max(0, Math.min(1, progress));
      activeProgressHandler?.(clamped);
    });

    if (import.meta.env.DEV) {
      instance.on('log', ({ type, message }) => {
        console.debug(`[ffmpeg:${type}]`, message);
      });
    }

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

/**
 * Run `task` on the shared FFmpeg instance after all previously queued tasks
 * have finished. `onProgress` receives progress for this task only.
 */
export function withFFmpeg<T>(
  task: (ffmpeg: FFmpeg) => Promise<T>,
  onProgress?: (progress: number) => void,
): Promise<T> {
  const run = queue.then(() => runExclusive(task, onProgress));

  // Keep the chain alive even when a job throws so a failed job never blocks
  // the next one.
  queue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

async function runExclusive<T>(
  task: (ffmpeg: FFmpeg) => Promise<T>,
  onProgress?: (progress: number) => void,
): Promise<T> {
  const instance = await ensureFFmpeg();
  const previous = activeProgressHandler;
  activeProgressHandler = onProgress ?? null;

  try {
    return await task(instance);
  } finally {
    activeProgressHandler = previous;
  }
}

/**
 * Recursively remove a per-job work directory. Best-effort: a failed cleanup
 * should never hide the real conversion/rendering result.
 */
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
