import type { HoleConfig, Vec2 } from "../types";

const rect = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateSeed(dateKey: string) {
  return [...dateKey].reduce((seed, char) => Math.imul(seed ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
}

export function currentDailyKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createDailyChallengeHole(dateKey = currentDailyKey()): HoleConfig {
  const random = mulberry32(dateSeed(dateKey));
  const start: Vec2 = { x: 126, y: 508 };
  const cup: Vec2 = { x: 960 - start.x, y: 650 - start.y };
  const outerWallHeight = 205 + Math.floor(random() * 52);
  const innerWallHeight = 162 + Math.floor(random() * 42);
  const waterDepth = 112 + Math.floor(random() * 44);
  const sandOffset = 126 + Math.floor(random() * 18);
  const slopeForce = { x: 7 + random() * 8, y: 10 + random() * 7 };

  return {
    id: 10,
    name: `Daily ${dateKey}`,
    par: 4,
    start,
    cup,
    boundary: [
      { x: 74, y: 78 },
      { x: 886, y: 78 },
      { x: 886, y: 572 },
      { x: 74, y: 572 },
    ],
    walls: [
      rect(236, 78, 54, outerWallHeight),
      rect(670, 572 - outerWallHeight, 54, outerWallHeight),
      rect(390, 572 - innerWallHeight, 52, innerWallHeight),
      rect(518, 78, 52, innerWallHeight),
    ],
    hazards: [
      { id: "daily-water-a", type: "water", shape: { kind: "polygon", points: rect(350, 78, 112, waterDepth) } },
      { id: "daily-water-b", type: "water", shape: { kind: "polygon", points: rect(498, 572 - waterDepth, 112, waterDepth) } },
      { id: "daily-sand-a", type: "sand", shape: { kind: "circle", center: { x: 480 - sandOffset, y: 325 }, radius: 48 } },
      { id: "daily-sand-b", type: "sand", shape: { kind: "circle", center: { x: 480 + sandOffset, y: 325 }, radius: 48 } },
    ],
    slopes: [
      { id: "daily-slope-a", shape: { kind: "polygon", points: rect(704, 92, 124, 122) }, force: slopeForce },
      { id: "daily-slope-b", shape: { kind: "polygon", points: rect(132, 436, 124, 122) }, force: { x: -slopeForce.x, y: -slopeForce.y } },
    ],
    movingObstacles: [{ id: "daily-spinner", kind: "rotatingBar", center: { x: 480, y: 325 }, length: 116, thickness: 16, angularSpeed: 1.15 + random() * 0.55, phase: random() * Math.PI }],
    theme: { turf: "#4a846e", fairway: "#7bbd76", wall: "#31534c", trim: "#e0e7ae" },
  };
}
