export type Vec2 = {
  x: number;
  y: number;
};

export type ZoneShape =
  | { kind: "circle"; center: Vec2; radius: number }
  | { kind: "polygon"; points: Vec2[] };

export type HazardZone = {
  id: string;
  type: "sand" | "water";
  shape: ZoneShape;
};

export type SlopeZone = {
  id: string;
  shape: ZoneShape;
  force: Vec2;
};

export type MovingObstacle =
  | {
      id: string;
      kind: "rotatingBar";
      center: Vec2;
      length: number;
      thickness: number;
      angularSpeed: number;
      phase: number;
    }
  | {
      id: string;
      kind: "oscillatingBlock";
      origin: Vec2;
      size: Vec2;
      axis: Vec2;
      distance: number;
      speed: number;
      phase: number;
    };

export type HoleTheme = {
  turf: string;
  fairway: string;
  wall: string;
  trim: string;
};

export type HoleConfig = {
  id: number;
  name: string;
  par: 2 | 3 | 4 | 5;
  start: Vec2;
  cup: Vec2;
  boundary: Vec2[];
  walls: Vec2[][];
  hazards: HazardZone[];
  slopes: SlopeZone[];
  movingObstacles: MovingObstacle[];
  theme: HoleTheme;
};

export type BallState = {
  position: Vec2;
  velocity: Vec2;
  lastDryPosition: Vec2;
  radius: number;
  moving: boolean;
  captured: boolean;
};

export type ScoreEntry = {
  strokes: number | null;
  par: number;
};

export type LeaderboardEntry = {
  playerName: string;
  totalStrokes: number;
  createdAt: string;
};
