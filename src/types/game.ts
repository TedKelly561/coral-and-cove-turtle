export type GameScreenState = 'title' | 'playing' | 'paused' | 'victory';

export type CameraMode = 'dynamic_coop' | 'split_screen' | 'follow_mom' | 'follow_baby';

export type TimeOfDay = 'morning' | 'noon' | 'sunset' | 'bioluminescent';

export type WeatherMood =
  | 'sunlit_calm'
  | 'gentle_rain'
  | 'misty_morning'
  | 'gentle_currents'
  | 'golden_shimmer';

export interface CollectibleItem {
  id: string;
  name: string;
  category: 'treasure_chest' | 'seashell' | 'glowing_pearl' | 'ancient_artifact';
  zone: string;
  lore: string;
  position: [number, number, number];
  discovered: boolean;
  discoveredBy?: 'mom' | 'baby' | 'both';
  accentColor: string;
}

export interface StoryLandmark {
  id: string;
  title: string;
  zone: string;
  storyText: string;
  position: [number, number, number];
  inspected: boolean;
}

export interface WildlifeSighting {
  id: string;
  name: string;
  species: string;
  behavior: string;
  temperament: string;
  description: string;
  discovered: boolean;
  befriended?: boolean;
  reactionState?: string;
}

export interface ControllerStatus {
  p1Connected: boolean;
  p1Name: string;
  p2Connected: boolean;
  p2Name: string;
}

export interface GameHudState {
  treasuresFound: number;
  totalTreasures: number;
  shellsCollected: number;
  totalShells: number;
  artifactsFound: number;
  totalArtifacts: number;
  landmarksVisited: number;
  totalLandmarks: number;
  wildlifeMet: number;
  totalWildlife: number;
  friendsMade: number;
  seaweedEaten: number;
  currentZone: string;
  momDepth: number;
  babyDepth: number;
  distanceBetween: number;
  babyFollowingMom: boolean;
  piggybackActive: boolean;
  dayTimeHours: number; // 0 to 24 continuous solar/lunar cycle
  autoCycleTime: boolean;
  weatherMood: WeatherMood;
  inGentleCurrent: boolean;
  activeWildlifeReaction: string | null;
  recentDiscovery: {
    title: string;
    subtitle: string;
    lore?: string;
    category:
      | 'treasure_chest'
      | 'seashell'
      | 'glowing_pearl'
      | 'ancient_artifact'
      | 'wildlife'
      | 'landmark'
      | 'seaweed';
  } | null;
  nearbyPrompt: string | null;
}

export interface SavedOceanJournal {
  version: number;
  savedAt: string;
  familyTitle: string;
  discoveredCollectibleIds: string[];
  visitedLandmarkIds: string[];
  wildlifeMetIds: string[];
  seaweedEaten?: number;
  dayTimeHours: number;
  weatherMood: WeatherMood;
  momPosition: [number, number, number];
  babyPosition: [number, number, number];
}

export interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}
