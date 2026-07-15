import type { BallState, HazardZone, HoleConfig, SlopeZone, Vec2 } from "../types";
import { clamp, length, pointInShape } from "./geometry";
import { obstaclePolygon } from "./physics";

export const VIEWPORT = { width: 960, height: 640 };

export type RenderOptions = {
  aimPoint: Vec2 | null;
  canShoot: boolean;
  dragPower: number;
  elapsedSeconds: number;
};

export function renderGame(ctx: CanvasRenderingContext2D, hole: HoleConfig, ball: BallState, options: RenderOptions) {
  ctx.clearRect(0, 0, VIEWPORT.width, VIEWPORT.height);
  drawBackground(ctx, hole);
  drawCourse(ctx, hole);
  drawZones(ctx, hole);
  drawMovingObstacles(ctx, hole, options.elapsedSeconds);
  drawCup(ctx, hole.cup);
  drawBall(ctx, ball);
  if (options.aimPoint && options.canShoot) drawAim(ctx, ball.position, options.aimPoint, options.dragPower);
  drawMotionCue(ctx, ball);
}

function drawMovingObstacles(ctx: CanvasRenderingContext2D, hole: HoleConfig, elapsedSeconds: number) {
  for (const obstacle of hole.movingObstacles) {
    const polygon = obstaclePolygon(obstacle, elapsedSeconds);
    ctx.save();
    tracePolygon(ctx, polygon);
    ctx.fillStyle = obstacle.kind === "rotatingBar" ? "#ba4f4a" : "#e0a84d";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#552d2a";
    ctx.stroke();
    if (obstacle.kind === "rotatingBar") {
      ctx.beginPath();
      ctx.arc(obstacle.center.x, obstacle.center.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#f1d16f";
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, hole: HoleConfig) {
  ctx.fillStyle = "#213a35";
  ctx.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);
  ctx.fillStyle = hole.theme.turf;
  for (let y = -80; y < VIEWPORT.height + 80; y += 44) {
    ctx.fillRect(0, y, VIEWPORT.width, 22);
  }
}

function drawCourse(ctx: CanvasRenderingContext2D, hole: HoleConfig) {
  ctx.save();
  tracePolygon(ctx, hole.boundary);
  ctx.fillStyle = hole.theme.fairway;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = hole.theme.trim;
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = hole.theme.wall;
  ctx.stroke();
  for (const wall of hole.walls) {
    tracePolygon(ctx, wall);
    ctx.fillStyle = hole.theme.wall;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#20352d";
    ctx.stroke();
  }
  ctx.restore();
}

function drawZones(ctx: CanvasRenderingContext2D, hole: HoleConfig) {
  for (const hazard of hole.hazards) drawHazard(ctx, hazard);
  for (const slope of hole.slopes) drawSlope(ctx, slope);
}

function drawHazard(ctx: CanvasRenderingContext2D, hazard: HazardZone) {
  ctx.save();
  if (hazard.type === "sand") {
    ctx.fillStyle = "#d9c17a";
    ctx.strokeStyle = "#b79d58";
  } else {
    ctx.fillStyle = "#3d93b7";
    ctx.strokeStyle = "#2c6d8c";
  }
  drawShape(ctx, hazard.shape);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawSlope(ctx: CanvasRenderingContext2D, slope: SlopeZone) {
  ctx.save();
  drawShape(ctx, slope.shape);
  ctx.fillStyle = "rgba(250, 255, 210, 0.18)";
  ctx.fill();
  const center = shapeCenter(slope.shape);
  const angle = Math.atan2(slope.force.y, slope.force.x);
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 4;
  for (let offset = -30; offset <= 30; offset += 30) {
    ctx.beginPath();
    ctx.moveTo(-30, offset);
    ctx.lineTo(30, offset);
    ctx.lineTo(18, offset - 10);
    ctx.moveTo(30, offset);
    ctx.lineTo(18, offset + 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCup(ctx: CanvasRenderingContext2D, cup: Vec2) {
  ctx.beginPath();
  ctx.arc(cup.x, cup.y, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#152320";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cup.x - 5, cup.y - 5, 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fill();
}

function drawBall(ctx: CanvasRenderingContext2D, ball: BallState) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#f7f4e8";
  ctx.fill();
  ctx.strokeStyle = "#d7d1c0";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawAim(ctx: CanvasRenderingContext2D, ball: Vec2, aimPoint: Vec2, dragPower: number) {
  const cappedPower = clamp(dragPower, 0, 1);
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + cappedPower * 0.55})`;
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(aimPoint.x, aimPoint.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#f0d35f";
  ctx.fillRect(ball.x - 48, ball.y - 34, 96 * cappedPower, 7);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.strokeRect(ball.x - 48, ball.y - 34, 96, 7);
  ctx.restore();
}

function drawMotionCue(ctx: CanvasRenderingContext2D, ball: BallState) {
  const speed = length(ball.velocity);
  if (speed <= 12) return;
  ctx.save();
  ctx.globalAlpha = clamp(speed / 500, 0.18, 0.55);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ball.position.x, ball.position.y);
  ctx.lineTo(ball.position.x - ball.velocity.x * 0.08, ball.position.y - ball.velocity.y * 0.08);
  ctx.stroke();
  ctx.restore();
}

function tracePolygon(ctx: CanvasRenderingContext2D, points: Vec2[]) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: HazardZone["shape"]) {
  if (shape.kind === "circle") {
    ctx.beginPath();
    ctx.arc(shape.center.x, shape.center.y, shape.radius, 0, Math.PI * 2);
    return;
  }
  tracePolygon(ctx, shape.points);
}

function shapeCenter(shape: HazardZone["shape"]) {
  if (shape.kind === "circle") return shape.center;
  return shape.points.reduce((total, point) => ({ x: total.x + point.x / shape.points.length, y: total.y + point.y / shape.points.length }), { x: 0, y: 0 });
}

export function isPointerInPlayableArea(hole: HoleConfig, point: Vec2) {
  return pointInShape(point, { kind: "polygon", points: hole.boundary });
}
