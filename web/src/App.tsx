import { PointerEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createDailyChallengeHole, currentDailyKey } from "./data/dailyChallenge";
import { holes } from "./data/holes";
import { clamp, distance, length, multiply, signedScore, subtract } from "./game/geometry";
import { createBall, isBallMoving, launchBall, stepBall } from "./game/physics";
import { renderGame, VIEWPORT } from "./game/renderer";
import { loadBestScore, loadDailyScore, loadLeaderboard, loadPlayerName, saveBestScore, saveDailyScore, savePlayerName, submitLeaderboardScore } from "./game/storage";
import type { BallState, HoleConfig, LeaderboardEntry, ScoreEntry, Vec2 } from "./types";

const MAX_DRAG = 170;
const MAX_SHOT_SPEED = 520;
const HOLE_COMPLETE_DELAY = 1500;

type GameMode = "menu" | "playing" | "hole-complete" | "scorecard";
type CourseMode = "round" | "daily";

type GameState = {
  mode: GameMode;
  courseMode: CourseMode;
  courseHoles: HoleConfig[];
  activeHoleIndex: number;
  ball: BallState;
  currentStrokes: number;
  scorecard: ScoreEntry[];
  bestScore: number | null;
  dailyScore: number | null;
  message: string;
};

type Action =
  | { type: "best-loaded"; score: number | null }
  | { type: "daily-loaded"; score: number | null }
  | { type: "start-round"; playerName: string }
  | { type: "start-daily" }
  | { type: "jump-to-hole"; hole: HoleConfig }
  | { type: "open-scorecard" }
  | { type: "resume" }
  | { type: "shoot"; velocity: Vec2 }
  | { type: "physics-step"; ball: BallState; penalty: boolean }
  | { type: "hole-complete" }
  | { type: "next-hole" }
  | { type: "finish-round"; bestScore: number | null };

const initialScorecard = (): ScoreEntry[] => holes.map((hole) => ({ strokes: null, par: hole.par }));
const dailyKey = currentDailyKey();
const dailyHole = createDailyChallengeHole(dailyKey);

const initialState: GameState = {
  mode: "menu",
  courseMode: "round",
  courseHoles: holes,
  activeHoleIndex: 0,
  ball: createBall(holes[0]),
  currentStrokes: 0,
  scorecard: initialScorecard(),
  bestScore: null,
  dailyScore: null,
  message: "",
};

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "best-loaded":
      return { ...state, bestScore: action.score };
    case "daily-loaded":
      return { ...state, dailyScore: action.score };
    case "start-round":
      return {
        ...initialState,
        mode: "playing",
        bestScore: state.bestScore,
        dailyScore: state.dailyScore,
        ball: createBall(holes[0]),
      };
    case "start-daily": {
      const courseHoles = [dailyHole];
      return {
        ...initialState,
        mode: "playing",
        courseMode: "daily",
        courseHoles,
        bestScore: state.bestScore,
        dailyScore: state.dailyScore,
        scorecard: courseHoles.map((hole) => ({ strokes: null, par: hole.par })),
        ball: createBall(courseHoles[0]),
      };
    }
    case "jump-to-hole": {
      const isDaily = action.hole.id === dailyHole.id;
      const courseHoles = isDaily ? [dailyHole] : holes;
      const activeHoleIndex = isDaily ? 0 : holes.findIndex((hole) => hole.id === action.hole.id);
      return {
        ...state,
        mode: "playing",
        courseMode: isDaily ? "daily" : "round",
        courseHoles,
        activeHoleIndex,
        ball: createBall(courseHoles[activeHoleIndex]),
        currentStrokes: 0,
        scorecard: courseHoles.map((hole) => ({ strokes: null, par: hole.par })),
        message: "",
      };
    }
    case "open-scorecard":
      return { ...state, mode: "scorecard" };
    case "resume":
      return { ...state, mode: state.scorecard.every((entry) => entry.strokes !== null) ? "scorecard" : "playing" };
    case "shoot":
      if (state.mode !== "playing" || isBallMoving(state.ball)) return state;
      return {
        ...state,
        currentStrokes: state.currentStrokes + 1,
        ball: launchBall(state.ball, action.velocity),
      };
    case "physics-step":
      return {
        ...state,
        ball: action.ball,
        currentStrokes: state.currentStrokes + (action.penalty ? 1 : 0),
      };
    case "hole-complete": {
      const hole = state.courseHoles[state.activeHoleIndex];
      const scorecard = [...state.scorecard];
      scorecard[state.activeHoleIndex] = { strokes: state.currentStrokes, par: hole.par };
      const relative = state.currentStrokes - hole.par;
      const phrase = relative === 0 ? "even par" : relative < 0 ? `${Math.abs(relative)} under par` : `${relative} over par`;
      return { ...state, mode: "hole-complete", scorecard, message: `Hole ${hole.id} - ${phrase}` };
    }
    case "next-hole": {
      const nextIndex = state.activeHoleIndex + 1;
      if (nextIndex >= state.courseHoles.length) return { ...state, mode: "scorecard" };
      return {
        ...state,
        mode: "playing",
        activeHoleIndex: nextIndex,
        ball: createBall(state.courseHoles[nextIndex]),
        currentStrokes: 0,
        message: "",
      };
    }
    case "finish-round":
      return { ...state, bestScore: action.bestScore };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const [drag, setDrag] = useState<{ active: boolean; point: Vec2 | null }>({ active: false, point: null });
  const [playerName, setPlayerName] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showHolePicker, setShowHolePicker] = useState(false);
  const leaderboardSubmittedRef = useRef("");
  const activeHole = state.courseHoles[state.activeHoleIndex];
  const completedRound = state.scorecard.every((entry) => entry.strokes !== null);
  const totalStrokes = state.scorecard.reduce((sum, entry) => sum + (entry.strokes ?? 0), 0);
  const totalPar = state.courseHoles.reduce((sum, hole) => sum + hole.par, 0);
  const canShoot = state.mode === "playing" && !isBallMoving(state.ball);
  const dragPower = drag.point ? clamp(distance(state.ball.position, drag.point) / MAX_DRAG, 0, 1) : 0;

  stateRef.current = state;

  useEffect(() => {
    loadBestScore().then((score) => dispatch({ type: "best-loaded", score }));
    loadDailyScore(dailyKey).then((score) => dispatch({ type: "daily-loaded", score }));
    loadPlayerName().then(setPlayerName);
    loadLeaderboard().then(setLeaderboard);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = (time: number) => {
      const current = stateRef.current;
      const hole = current.courseHoles[current.activeHoleIndex];
      if (lastTimeRef.current === null) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (current.mode === "playing" && current.ball.moving) {
        const result = stepBall(hole, current.ball, dt, time / 1000);
        dispatch({ type: "physics-step", ball: result.ball, penalty: result.penalty });
        if (result.captured && completionTimerRef.current === null) {
          dispatch({ type: "hole-complete" });
          completionTimerRef.current = window.setTimeout(() => {
            completionTimerRef.current = null;
            dispatch({ type: "next-hole" });
          }, HOLE_COMPLETE_DELAY);
        }
      }

      renderGame(ctx, hole, current.ball, {
        aimPoint: drag.active ? drag.point : null,
        canShoot: current.mode === "playing" && !isBallMoving(current.ball),
        dragPower,
        elapsedSeconds: time / 1000,
      });
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    };
  }, [drag, dragPower]);

  useEffect(() => {
    if (!completedRound || state.mode !== "scorecard") return;
    const currentTotal = state.scorecard.reduce((sum, entry) => sum + (entry.strokes ?? 0), 0);
    if (state.courseMode === "daily") {
      if (state.dailyScore === null || currentTotal < state.dailyScore) {
        saveDailyScore(dailyKey, currentTotal).then(() => dispatch({ type: "daily-loaded", score: currentTotal }));
      }
      return;
    }

    if (state.bestScore === null || currentTotal < state.bestScore) {
      saveBestScore(currentTotal).then(() => dispatch({ type: "finish-round", bestScore: currentTotal }));
    }

    const cleanName = playerName.trim() || "Player";
    const submissionKey = `${cleanName}:${currentTotal}:${state.scorecard.map((entry) => entry.strokes ?? "-").join(",")}`;
    if (leaderboardSubmittedRef.current !== submissionKey) {
      leaderboardSubmittedRef.current = submissionKey;
      submitLeaderboardScore({ playerName: cleanName, totalStrokes: currentTotal, createdAt: new Date().toISOString() })
        .then(loadLeaderboard)
        .then(setLeaderboard);
    }
  }, [completedRound, playerName, state.bestScore, state.courseMode, state.dailyScore, state.mode, state.scorecard]);

  const canvasPoint = useCallback((event: PointerEvent<HTMLCanvasElement>): Vec2 => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEWPORT.width,
      y: ((event.clientY - rect.top) / rect.height) * VIEWPORT.height,
    };
  }, []);

  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canShoot) return;
    const point = canvasPoint(event);
    if (distance(point, state.ball.position) > 44) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ active: true, point });
  };

  const moveDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.active) return;
    setDrag({ active: true, point: canvasPoint(event) });
  };

  const releaseDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.active || !drag.point || !canShoot) {
      setDrag({ active: false, point: null });
      return;
    }
    const pullVector = subtract(state.ball.position, drag.point);
    const cappedDistance = clamp(length(pullVector), 0, MAX_DRAG);
    if (cappedDistance > 8) {
      const velocity = multiply(pullVector, MAX_SHOT_SPEED / MAX_DRAG);
      const scale = cappedDistance / Math.max(length(pullVector), 1);
      dispatch({ type: "shoot", velocity: multiply(velocity, scale) });
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag({ active: false, point: null });
  };

  const scoreRows = useMemo(
    () =>
      state.scorecard.map((entry, index) => ({
        hole: index + 1,
        par: entry.par,
        strokes: entry.strokes,
        relative: entry.strokes === null ? "-" : signedScore(entry.strokes, entry.par),
      })),
    [state.scorecard],
  );

  const jumpToHole = (hole: HoleConfig) => {
    if (completionTimerRef.current !== null) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setDrag({ active: false, point: null });
    setShowHolePicker(false);
    dispatch({ type: "jump-to-hole", hole });
  };

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="Mini Golf course">
        <canvas
          ref={canvasRef}
          width={VIEWPORT.width}
          height={VIEWPORT.height}
          className={!canShoot ? "game-canvas is-locked" : "game-canvas"}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={releaseDrag}
          onPointerCancel={() => setDrag({ active: false, point: null })}
        />

        <Hud
          holeNumber={activeHole.id}
          holeName={activeHole.name}
          par={activeHole.par}
          strokes={state.currentStrokes}
          total={completedRound ? totalStrokes : null}
          best={state.bestScore}
          canShoot={canShoot}
          onScorecard={() => dispatch({ type: "open-scorecard" })}
          onHoles={() => setShowHolePicker(true)}
        />

        {state.mode === "menu" && (
          <Menu
            bestScore={state.bestScore}
            dailyScore={state.dailyScore}
            playerName={playerName}
            leaderboard={leaderboard}
            onNameChange={(name) => {
              setPlayerName(name);
              savePlayerName(name);
            }}
            onStart={() => dispatch({ type: "start-round", playerName })}
            onDaily={() => dispatch({ type: "start-daily" })}
            onHoles={() => setShowHolePicker(true)}
          />
        )}
        {state.mode === "hole-complete" && <Overlay title={state.message} body="Next tee loading..." />}
        {state.mode === "scorecard" && (
          <Scorecard
            rows={scoreRows}
            totalStrokes={totalStrokes}
            totalPar={totalPar}
            bestScore={state.bestScore}
            dailyScore={state.dailyScore}
            courseMode={state.courseMode}
            completed={completedRound}
            onResume={() => dispatch({ type: "resume" })}
            onRestart={() => dispatch({ type: "start-round", playerName })}
          />
        )}
        {showHolePicker && <HolePicker onSelect={jumpToHole} onClose={() => setShowHolePicker(false)} />}
      </section>
    </main>
  );
}

function Hud(props: {
  holeNumber: number;
  holeName: string;
  par: number;
  strokes: number;
  total: number | null;
  best: number | null;
  canShoot: boolean;
  onScorecard: () => void;
  onHoles: () => void;
}) {
  return (
    <div className="hud">
      <div>
        <span className="hud-label">Hole</span>
        <strong>{props.holeNumber}</strong>
        <span>{props.holeName}</span>
      </div>
      <div>
        <span className="hud-label">Par</span>
        <strong>{props.par}</strong>
      </div>
      <div>
        <span className="hud-label">Strokes</span>
        <strong>{props.strokes}</strong>
      </div>
      <div>
        <span className="hud-label">Best</span>
        <strong>{props.best ?? "-"}</strong>
      </div>
      <button type="button" onClick={props.onHoles}>Holes</button>
      <button type="button" onClick={props.onScorecard}>Scorecard</button>
      <span className={props.canShoot ? "status ready" : "status"}>{props.canShoot ? "Ready" : "Rolling"}</span>
    </div>
  );
}

function Menu(props: {
  bestScore: number | null;
  dailyScore: number | null;
  playerName: string;
  leaderboard: LeaderboardEntry[];
  onNameChange: (name: string) => void;
  onStart: () => void;
  onDaily: () => void;
  onHoles: () => void;
}) {
  return (
    <div className="screen">
      <div className="panel menu-panel">
        <p className="eyebrow">FreeGameStore Sports</p>
        <h1>Mini Golf</h1>
        <label className="name-field">
          <span>Player name</span>
          <input maxLength={18} value={props.playerName} onChange={(event) => props.onNameChange(event.target.value)} placeholder="Player" />
        </label>
        <div className="menu-stats">
          {props.bestScore !== null && <p className="best-line">Best round: {props.bestScore} strokes</p>}
          {props.dailyScore !== null && <p className="best-line">Daily {dailyKey}: {props.dailyScore} strokes</p>}
        </div>
        <div className="actions menu-actions">
          <button type="button" className="primary-action" onClick={props.onStart}>Play 9 Holes</button>
          <button type="button" onClick={props.onDaily}>Daily Challenge</button>
          <button type="button" onClick={props.onHoles}>View Holes</button>
        </div>
        <Leaderboard rows={props.leaderboard} />
      </div>
    </div>
  );
}

function HolePicker(props: { onSelect: (hole: HoleConfig) => void; onClose: () => void }) {
  const availableHoles = [...holes, dailyHole];
  return (
    <div className="screen hole-picker-screen">
      <div className="panel hole-picker-panel">
        <div className="score-header">
          <div>
            <p className="eyebrow">Course browser</p>
            <h2>Choose a hole</h2>
          </div>
          <button type="button" onClick={props.onClose} aria-label="Close hole picker">Close</button>
        </div>
        <div className="hole-grid">
          {availableHoles.map((hole) => (
            <button type="button" key={hole.id} onClick={() => props.onSelect(hole)}>
              <strong>{hole.id}</strong>
              <span>{hole.id === 10 ? "Daily Challenge" : hole.name}</span>
              <small>Par {hole.par}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Overlay({ title, body }: { title: string; body: string }) {
  return (
    <div className="screen soft-screen">
      <div className="panel compact-panel">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </div>
  );
}

function Scorecard(props: {
  rows: { hole: number; par: number; strokes: number | null; relative: string }[];
  totalStrokes: number;
  totalPar: number;
  bestScore: number | null;
  dailyScore: number | null;
  courseMode: CourseMode;
  completed: boolean;
  onResume: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="screen">
      <div className="panel score-panel">
        <div className="score-header">
          <div>
            <p className="eyebrow">Scorecard</p>
            <h2>{props.completed ? "Round Complete" : "Round In Progress"}</h2>
          </div>
          <strong className="relative-score">{signedScore(props.totalStrokes, props.totalPar)}</strong>
        </div>
        <div className="score-grid">
          <span>Hole</span>
          <span>Par</span>
          <span>Strokes</span>
          <span>Score</span>
          {props.rows.map((row) => (
            <FragmentRow key={row.hole} row={row} />
          ))}
        </div>
        <div className="score-footer">
          <span>Total: {props.totalStrokes || "-"} / Par {props.totalPar}</span>
          <span>{props.courseMode === "daily" ? `Daily best: ${props.dailyScore ?? "-"}` : `Best: ${props.bestScore ?? "-"}`}</span>
        </div>
        <div className="actions">
          {!props.completed && <button type="button" onClick={props.onResume}>Resume</button>}
          <button type="button" className="primary-action" onClick={props.onRestart}>New Round</button>
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ rows }: { rows: LeaderboardEntry[] }) {
  return (
    <div className="leaderboard">
      <h2>Leaderboard</h2>
      <div className="leaderboard-list">
        {rows.length === 0 && <span className="empty-row">No public scores yet</span>}
        {rows.map((row, index) => (
          <div key={`${row.playerName}-${row.createdAt}`}>
            <strong>{index + 1}</strong>
            <span>{row.playerName}</span>
            <span>{row.totalStrokes}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FragmentRow({ row }: { row: { hole: number; par: number; strokes: number | null; relative: string } }) {
  return (
    <>
      <strong>{row.hole}</strong>
      <span>{row.par}</span>
      <span>{row.strokes ?? "-"}</span>
      <span>{row.relative}</span>
    </>
  );
}
