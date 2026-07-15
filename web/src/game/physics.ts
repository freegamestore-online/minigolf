import type { BallState, HoleConfig, MovingObstacle, Vec2 } from "../types";
import { add, closestPointOnSegment, distance, dot, length, multiply, normalize, pointInPolygon, pointInShape, polygonSegments, subtract } from "./geometry";

const BASE_FRICTION = 0.986;
const SAND_FRICTION = 0.93;
const RESTITUTION = 0.7;
const STOP_SPEED = 9;
const CUP_CAPTURE_SPEED = 78;
const CUP_RADIUS = 17;
const MAX_DELTA = 1 / 30;

export type StepResult = {
  ball: BallState;
  penalty: boolean;
  captured: boolean;
  stopped: boolean;
};

export function createBall(hole: HoleConfig): BallState {
  return {
    position: { ...hole.start },
    velocity: { x: 0, y: 0 },
    lastDryPosition: { ...hole.start },
    radius: 10,
    moving: false,
    captured: false,
  };
}

export function isInWater(hole: HoleConfig, point: Vec2) {
  return hole.hazards.some((hazard) => hazard.type === "water" && pointInShape(point, hazard.shape));
}

export function isBallMoving(ball: BallState) {
  return ball.moving && length(ball.velocity) > 0;
}

export function launchBall(ball: BallState, velocity: Vec2): BallState {
  return {
    ...ball,
    velocity,
    moving: true,
    captured: false,
  };
}

export function stepBall(hole: HoleConfig, ball: BallState, deltaSeconds: number, elapsedSeconds = 0): StepResult {
  if (!ball.moving || ball.captured) {
    return { ball, penalty: false, captured: false, stopped: false };
  }

  const dt = Math.min(deltaSeconds, MAX_DELTA);
  let nextBall: BallState = {
    ...ball,
    position: { ...ball.position },
    velocity: { ...ball.velocity },
  };

  for (const slope of hole.slopes) {
    if (pointInShape(nextBall.position, slope.shape)) {
      nextBall.velocity = add(nextBall.velocity, multiply(slope.force, dt));
    }
  }

  const inSand = hole.hazards.some((hazard) => hazard.type === "sand" && pointInShape(nextBall.position, hazard.shape));
  const friction = Math.pow(inSand ? SAND_FRICTION : BASE_FRICTION, dt * 60);
  nextBall.velocity = multiply(nextBall.velocity, friction);
  nextBall.position = add(nextBall.position, multiply(nextBall.velocity, dt));

  if (!pointInPolygon(nextBall.position, hole.boundary)) {
    nextBall = resolveWallCollision(nextBall, [hole.boundary], true);
  }
  nextBall = resolveWallCollision(nextBall, hole.walls, false);
  nextBall = resolveMovingObstacles(nextBall, hole.movingObstacles, elapsedSeconds);

  if (isInWater(hole, nextBall.position)) {
    return {
      ball: {
        ...nextBall,
        position: { ...ball.lastDryPosition },
        velocity: { x: 0, y: 0 },
        moving: false,
      },
      penalty: true,
      captured: false,
      stopped: true,
    };
  }

  const speed = length(nextBall.velocity);
  if (distance(nextBall.position, hole.cup) <= CUP_RADIUS && speed <= CUP_CAPTURE_SPEED) {
    return {
      ball: {
        ...nextBall,
        position: { ...hole.cup },
        velocity: { x: 0, y: 0 },
        moving: false,
        captured: true,
      },
      penalty: false,
      captured: true,
      stopped: true,
    };
  }

  if (speed < STOP_SPEED) {
    return {
      ball: {
        ...nextBall,
        velocity: { x: 0, y: 0 },
        moving: false,
        lastDryPosition: isInWater(hole, nextBall.position) ? ball.lastDryPosition : { ...nextBall.position },
      },
      penalty: false,
      captured: false,
      stopped: true,
    };
  }

  return {
    ball: {
      ...nextBall,
      lastDryPosition: isInWater(hole, nextBall.position) ? ball.lastDryPosition : { ...nextBall.position },
    },
    penalty: false,
    captured: false,
    stopped: false,
  };
}

export function obstaclePolygon(obstacle: MovingObstacle, elapsedSeconds: number) {
  if (obstacle.kind === "oscillatingBlock") {
    const offset = Math.sin(elapsedSeconds * obstacle.speed + obstacle.phase) * obstacle.distance;
    const center = add(obstacle.origin, multiply(normalize(obstacle.axis), offset));
    const halfWidth = obstacle.size.x / 2;
    const halfHeight = obstacle.size.y / 2;
    return [
      { x: center.x - halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y + halfHeight },
      { x: center.x - halfWidth, y: center.y + halfHeight },
    ];
  }

  const angle = elapsedSeconds * obstacle.angularSpeed + obstacle.phase;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -direction.y, y: direction.x };
  const halfLength = obstacle.length / 2;
  const halfThickness = obstacle.thickness / 2;
  return [
    add(add(obstacle.center, multiply(direction, -halfLength)), multiply(normal, -halfThickness)),
    add(add(obstacle.center, multiply(direction, halfLength)), multiply(normal, -halfThickness)),
    add(add(obstacle.center, multiply(direction, halfLength)), multiply(normal, halfThickness)),
    add(add(obstacle.center, multiply(direction, -halfLength)), multiply(normal, halfThickness)),
  ];
}

function obstacleVelocity(obstacle: MovingObstacle, contactPoint: Vec2, elapsedSeconds: number): Vec2 {
  if (obstacle.kind === "oscillatingBlock") {
    const axis = normalize(obstacle.axis);
    const speed = Math.cos(elapsedSeconds * obstacle.speed + obstacle.phase) * obstacle.distance * obstacle.speed;
    return multiply(axis, speed);
  }

  const radial = subtract(contactPoint, obstacle.center);
  return multiply({ x: -radial.y, y: radial.x }, obstacle.angularSpeed);
}

function resolveMovingObstacles(ball: BallState, obstacles: MovingObstacle[], elapsedSeconds: number): BallState {
  let resolved = ball;
  for (const obstacle of obstacles) {
    const polygon = obstaclePolygon(obstacle, elapsedSeconds);
    for (const segment of polygonSegments([polygon])) {
      const closest = closestPointOnSegment(resolved.position, segment.a, segment.b);
      const overlap = resolved.radius - distance(resolved.position, closest);
      if (overlap <= 0) continue;

      let normal = normalize(subtract(resolved.position, closest));
      if (length(normal) === 0) {
        const edge = subtract(segment.b, segment.a);
        normal = normalize({ x: -edge.y, y: edge.x });
      }

      const platformVelocity = obstacleVelocity(obstacle, closest, elapsedSeconds);
      const relativeVelocity = subtract(resolved.velocity, platformVelocity);
      const velocityAlongNormal = dot(relativeVelocity, normal);
      const reflectedRelative = velocityAlongNormal < 0 ? subtract(relativeVelocity, multiply(normal, (1 + 0.85) * velocityAlongNormal)) : relativeVelocity;
      resolved = {
        ...resolved,
        position: add(resolved.position, multiply(normal, overlap + 0.75)),
        velocity: add(reflectedRelative, multiply(platformVelocity, 0.72)),
      };
    }
  }
  return resolved;
}

function resolveWallCollision(ball: BallState, polygons: Vec2[][], boundaryCollision: boolean): BallState {
  let resolved = ball;
  for (const segment of polygonSegments(polygons)) {
    const closest = closestPointOnSegment(resolved.position, segment.a, segment.b);
    const overlap = resolved.radius - distance(resolved.position, closest);
    if (overlap <= 0) continue;

    let normal = normalize(subtract(resolved.position, closest));
    if (length(normal) === 0) {
      const edge = subtract(segment.b, segment.a);
      normal = normalize({ x: -edge.y, y: edge.x });
    }
    if (boundaryCollision) normal = multiply(normal, -1);

    const velocityAlongNormal = dot(resolved.velocity, normal);
    resolved = {
      ...resolved,
      position: add(resolved.position, multiply(normal, overlap + 0.5)),
      velocity: velocityAlongNormal < 0 ? subtract(resolved.velocity, multiply(normal, (1 + RESTITUTION) * velocityAlongNormal)) : resolved.velocity,
    };
  }
  return resolved;
}
