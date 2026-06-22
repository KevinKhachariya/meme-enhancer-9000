export type NormalizedPoint = Readonly<{
  /**
   * Position relative to the media surface. Values between 0 and 1 are inside
   * the media; values outside that range intentionally allow off-media layers.
   */
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
  return finitePoint({
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
  return finitePoint({
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

function finitePoint(point: NormalizedPoint): NormalizedPoint {
  return {
    x: Number.isFinite(point.x) ? point.x : 0,
    y: Number.isFinite(point.y) ? point.y : 0,
  };
}
