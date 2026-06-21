import type { PathPoint } from './types';

export type RecordSession = Readonly<{
  startMs: number;
  lastMs: number | null;
}>;

export type RecordPathResult = Readonly<{
  path: readonly PathPoint[];
  session: RecordSession;
}>;

export function recordPathPoint(params: {
  path: readonly PathPoint[];
  session: RecordSession | null;
  nowMs: number;
  x: number;
  y: number;
  force?: boolean;
}): RecordPathResult {
  const force = params.force ?? false;
  const basePath = normalizeInitialPath(params.path);
  const session = params.session ?? createSessionForPath(basePath, params.nowMs);
  const last = basePath.at(-1);
  const t = (params.nowMs - session.startMs) / 1000;
  const moved = !last || Math.hypot(params.x - last.x, params.y - last.y) > 0.003;
  const waited = !last || params.nowMs - (session.lastMs ?? 0) > 80;

  if (!force && (!moved || !waited)) {
    return { path: basePath, session };
  }

  const point = basePath.length === 0
    ? { t: 0, x: params.x, y: params.y }
    : { t: Number(Math.max(0, t).toFixed(3)), x: params.x, y: params.y };

  const path = limitPathPoints([...basePath, point]);
  return {
    path,
    session: {
      startMs: basePath.length === 0 ? params.nowMs : session.startMs,
      lastMs: params.nowMs,
    },
  };
}

function normalizeInitialPath(path: readonly PathPoint[]): readonly PathPoint[] {
  if (path.length !== 1 || path[0].t === 0) return path;
  return [{ ...path[0], t: 0 }];
}

function createSessionForPath(path: readonly PathPoint[], nowMs: number): RecordSession {
  const pathEndSeconds = path.at(-1)?.t ?? 0;
  return {
    startMs: nowMs - pathEndSeconds * 1000,
    lastMs: null,
  };
}

function limitPathPoints(path: readonly PathPoint[]): readonly PathPoint[] {
  if (path.length <= 180) return path;
  return [path[0], ...path.slice(path.length - 179)];
}
