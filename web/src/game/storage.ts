const BEST_SCORE_KEY = "minigolf.bestTotal";
const PLAYER_NAME_KEY = "minigolf.playerName";
const LEADERBOARD_KEY = "minigolf.leaderboard";

type FasKv = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
};

type FasDb = {
  collection?: (name: string) => {
    add?: <T>(value: T) => Promise<void>;
    insert?: <T>(value: T) => Promise<void>;
    query?: <T>(options: unknown) => Promise<T[]>;
    find?: <T>(options: unknown) => Promise<T[]>;
  };
  insert?: <T>(collection: string, value: T) => Promise<void>;
  query?: <T>(collection: string, options: unknown) => Promise<T[]>;
};

export type LeaderboardEntry = {
  playerName: string;
  totalStrokes: number;
  createdAt: string;
};

declare global {
  interface Window {
    fas?: {
      kv?: FasKv;
      db?: FasDb;
    };
  }
}

export async function loadBestScore() {
  try {
    const value = window.fas?.kv ? await window.fas.kv.get<number>(BEST_SCORE_KEY) : window.localStorage.getItem(BEST_SCORE_KEY);
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveBestScore(score: number) {
  if (window.fas?.kv) {
    await window.fas.kv.set(BEST_SCORE_KEY, score);
    return;
  }
  window.localStorage.setItem(BEST_SCORE_KEY, String(score));
}

export async function loadPlayerName() {
  return window.localStorage.getItem(PLAYER_NAME_KEY) ?? "";
}

export async function savePlayerName(playerName: string) {
  window.localStorage.setItem(PLAYER_NAME_KEY, playerName);
}

export async function loadDailyScore(dateKey: string) {
  const key = dailyScoreKey(dateKey);
  try {
    const value = window.fas?.kv ? await window.fas.kv.get<number>(key) : window.localStorage.getItem(key);
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveDailyScore(dateKey: string, score: number) {
  const key = dailyScoreKey(dateKey);
  if (window.fas?.kv) {
    await window.fas.kv.set(key, score);
    return;
  }
  window.localStorage.setItem(key, String(score));
}

export async function submitLeaderboardScore(entry: LeaderboardEntry) {
  const collection = window.fas?.db?.collection?.("minigolf_leaderboard");
  if (collection?.add) {
    await collection.add(entry);
    return;
  }
  if (collection?.insert) {
    await collection.insert(entry);
    return;
  }
  if (window.fas?.db?.insert) {
    await window.fas.db.insert("minigolf_leaderboard", entry);
    return;
  }

  const entries = loadLocalLeaderboard();
  entries.push(entry);
  window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
}

export async function loadLeaderboard() {
  const options = { orderBy: [{ field: "totalStrokes", direction: "asc" }], limit: 10 };
  try {
    const collection = window.fas?.db?.collection?.("minigolf_leaderboard");
    const rows = collection?.query
      ? await collection.query<LeaderboardEntry>(options)
      : collection?.find
        ? await collection.find<LeaderboardEntry>(options)
        : window.fas?.db?.query
          ? await window.fas.db.query<LeaderboardEntry>("minigolf_leaderboard", options)
          : null;
    if (rows) return cleanLeaderboard(rows);
  } catch {
    return cleanLeaderboard(loadLocalLeaderboard());
  }
  return cleanLeaderboard(loadLocalLeaderboard());
}

function dailyScoreKey(dateKey: string) {
  return `minigolf.daily.${dateKey}`;
}

function loadLocalLeaderboard() {
  try {
    const stored = window.localStorage.getItem(LEADERBOARD_KEY);
    return stored ? (JSON.parse(stored) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

function cleanLeaderboard(entries: LeaderboardEntry[]) {
  return entries
    .filter((entry) => entry.playerName && Number.isFinite(entry.totalStrokes))
    .sort((a, b) => a.totalStrokes - b.totalStrokes || a.createdAt.localeCompare(b.createdAt))
    .slice(0, 10);
}
