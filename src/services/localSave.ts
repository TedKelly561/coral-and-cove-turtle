import { WeatherMood } from '../types/game';

/** Progress kept in this browser so a reload or a closed tab never loses the journey. */
export interface LocalSave {
  version: 1;
  savedAt: string;
  collectibles: { id: string; by?: 'mom' | 'baby' | 'both' }[];
  landmarkIds: string[];
  wildlife: { id: string; befriended: boolean }[];
  seaweedEaten: number;
  dayTimeHours: number;
  weatherMood: WeatherMood;
  momPosition?: [number, number, number];
  babyPosition?: [number, number, number];
  completionCelebrated: boolean;
}

const KEY = 'coral-and-cove:save:v1';

export function loadLocalSave(): LocalSave | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSave;
    if (parsed?.version !== 1 || !Array.isArray(parsed.collectibles)) return null;
    return parsed;
  } catch {
    // Private browsing, blocked storage or a damaged entry: start fresh.
    return null;
  }
}

export function writeLocalSave(save: LocalSave): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable or full. The game keeps running; this session just is not saved.
  }
}

export function clearLocalSave(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export function hasProgress(save: LocalSave | null): boolean {
  return Boolean(
    save && (save.collectibles.length || save.landmarkIds.length || save.wildlife.length)
  );
}
