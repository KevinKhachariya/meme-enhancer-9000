export type NormalizedPoint = Readonly<{
  x: number;
  y: number;
}>;

export type RectLike = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export function pointFromClientPosition(
  clientX: number,
  clientY: number,
  rect: RectLike,
): NormalizedPoint {
  return clampPoint({
    x: rect.width > 0 ? (clientX - rect.left) / rect.width : 0,
    y: rect.height > 0 ? (clientY - rect.top) / rect.height : 0,
  });
}

export function draggedPointFromClientPosition(params: {
  clientX: number;
  clientY: number;
  rect: RectLike;
  pointerOffset: NormalizedPoint;
}): NormalizedPoint {
  const pointer = pointFromClientPosition(params.clientX, params.clientY, params.rect);
  return clampPoint({
    x: pointer.x - params.pointerOffset.x,
    y: pointer.y - params.pointerOffset.y,
  });
}

export function pointerOffsetFromLayerPosition(
  pointer: NormalizedPoint,
  layer: NormalizedPoint,
): NormalizedPoint {
  return {
    x: pointer.x - layer.x,
    y: pointer.y - layer.y,
  };
}

export function clampPoint(point: NormalizedPoint): NormalizedPoint {
  return {
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
