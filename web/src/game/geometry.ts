import type { Vec2, ZoneShape } from "../types";

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const multiply = (v: Vec2, scalar: number): Vec2 => ({ x: v.x * scalar, y: v.y * scalar });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const length = (v: Vec2) => Math.hypot(v.x, v.y);
export const normalize = (v: Vec2): Vec2 => {
  const size = length(v);
  return size === 0 ? { x: 0, y: 0 } : { x: v.x / size, y: v.y / size };
};
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const distance = (a: Vec2, b: Vec2) => length(subtract(a, b));

export function pointInPolygon(point: Vec2, polygon: Vec2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInShape(point: Vec2, shape: ZoneShape) {
  if (shape.kind === "circle") {
    return distance(point, shape.center) <= shape.radius;
  }
  return pointInPolygon(point, shape.points);
}

export function closestPointOnSegment(point: Vec2, a: Vec2, b: Vec2) {
  const segment = subtract(b, a);
  const segmentLengthSquared = dot(segment, segment);
  const t = segmentLengthSquared === 0 ? 0 : clamp(dot(subtract(point, a), segment) / segmentLengthSquared, 0, 1);
  return add(a, multiply(segment, t));
}

export function polygonSegments(polygons: Vec2[][]) {
  return polygons.flatMap((polygon) =>
    polygon.map((point, index) => ({
      a: point,
      b: polygon[(index + 1) % polygon.length],
    })),
  );
}

export function signedScore(strokes: number, par: number) {
  const delta = strokes - par;
  if (delta === 0) return "E";
  return delta > 0 ? `+${delta}` : `${delta}`;
}
