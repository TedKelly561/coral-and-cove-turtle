/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  CameraMode,
  CollectibleItem,
  ControllerStatus,
  GameHudState,
  GameScreenState,
  SavedOceanJournal,
  StoryLandmark,
  WeatherMood,
  WildlifeSighting,
} from './types/game';
import {
  INITIAL_COLLECTIBLES,
  INITIAL_LANDMARKS,
  INITIAL_WILDLIFE,
} from './data/oceanCatalog';
import { OceanCanvas, OceanCanvasHandle } from './components/OceanCanvas';
import { SanctuaryJournalModal } from './components/SanctuaryJournalModal';
import { TouchControls } from './components/TouchControls';
import { oceanAudio } from './audio/oceanAudio';
import {
  clearLocalSave,
  hasProgress,
  loadLocalSave,
  LocalSave,
  writeLocalSave,
} from './services/localSave';

function formatSolarTime(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

export default function App() {
  const oceanRef = useRef<OceanCanvasHandle | null>(null);

  // Progress saved in this browser by an earlier visit, read once at start-up.
  const [initialSave] = useState<LocalSave | null>(() => loadLocalSave());
  const [hasSavedProgress, setHasSavedProgress] = useState<boolean>(() => hasProgress(initialSave));
  const completionCelebrated = useRef<boolean>(initialSave?.completionCelebrated ?? false);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(
    () => window.matchMedia('(pointer: coarse)').matches
  );
  const [showControlsHint, setShowControlsHint] = useState<boolean>(false);

  const [screenState, setScreenState] = useState<GameScreenState>('title');
  const [cameraMode, setCameraMode] = useState<CameraMode>('dynamic_coop');
  const [dayTimeHours, setDayTimeHours] = useState<number>(initialSave?.dayTimeHours ?? 10.5);
  const [autoCycleTime, setAutoCycleTime] = useState<boolean>(true);
  const [weatherMood, setWeatherMood] = useState<WeatherMood>(
    initialSave?.weatherMood ?? 'sunlit_calm'
  );
  const [babyFollowingMom, setBabyFollowingMom] = useState<boolean>(true);
  const [piggybackActive, setPiggybackActive] = useState<boolean>(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [journalInitialTab, setJournalInitialTab] = useState<
    'collectibles' | 'wildlife' | 'chronicles' | 'settings' | 'drive'
  >('collectibles');

  const [collectibles, setCollectibles] = useState<CollectibleItem[]>(() =>
    INITIAL_COLLECTIBLES.map((c) => {
      const saved = initialSave?.collectibles.find((entry) => entry.id === c.id);
      return saved ? { ...c, discovered: true, discoveredBy: saved.by } : c;
    })
  );
  const [landmarks, setLandmarks] = useState<StoryLandmark[]>(() =>
    INITIAL_LANDMARKS.map((l) =>
      initialSave?.landmarkIds.includes(l.id) ? { ...l, inspected: true } : l
    )
  );
  const [wildlife, setWildlife] = useState<WildlifeSighting[]>(() =>
    INITIAL_WILDLIFE.map((w) => {
      const saved = initialSave?.wildlife.find((entry) => entry.id === w.id);
      return saved ? { ...w, discovered: true, befriended: saved.befriended } : w;
    })
  );

  const [controllers, setControllers] = useState<ControllerStatus>({
    p1Connected: false,
    p1Name: 'Keyboard (WASD)',
    p2Connected: false,
    p2Name: 'Keyboard (Arrows)',
  });

  const [hud, setHud] = useState<GameHudState>({
    treasuresFound: 0,
    totalTreasures: INITIAL_COLLECTIBLES.filter((c) => c.category === 'treasure_chest').length,
    shellsCollected: 0,
    totalShells: INITIAL_COLLECTIBLES.filter((c) => c.category === 'seashell').length,
    artifactsFound: 0,
    totalArtifacts: INITIAL_COLLECTIBLES.filter(
      (c) => c.category === 'glowing_pearl' || c.category === 'ancient_artifact'
    ).length,
    landmarksVisited: 0,
    totalLandmarks: INITIAL_LANDMARKS.length,
    wildlifeMet: 0,
    totalWildlife: INITIAL_WILDLIFE.length,
    friendsMade: 0,
    seaweedEaten: initialSave?.seaweedEaten ?? 0,
    currentZone: 'Sunlit Coral Gardens',
    momDepth: 2.8,
    babyDepth: 2.5,
    distanceBetween: 4.3,
    babyFollowingMom: true,
    piggybackActive: false,
    dayTimeHours: initialSave?.dayTimeHours ?? 10.5,
    autoCycleTime: true,
    weatherMood: initialSave?.weatherMood ?? 'sunlit_calm',
    inGentleCurrent: false,
    activeWildlifeReaction: null,
    recentDiscovery: null,
    nearbyPrompt: null,
  });

  const discoveryToastTimer = useRef<number | null>(null);

  const triggerDiscoveryBanner = useCallback(
    (
      title: string,
      subtitle: string,
      category: NonNullable<GameHudState['recentDiscovery']>['category'],
      lore?: string
    ) => {
      if (discoveryToastTimer.current) {
        clearTimeout(discoveryToastTimer.current);
      }
      setHud((prev) => ({
        ...prev,
        recentDiscovery: { title, subtitle, category, lore },
      }));
      discoveryToastTimer.current = window.setTimeout(() => {
        setHud((prev) => ({ ...prev, recentDiscovery: null }));
      }, 4800);
    },
    []
  );

  const handleDiscoverCollectible = useCallback(
    (id: string, by: 'mom' | 'baby' | 'both') => {
      setCollectibles((prev) => {
        const target = prev.find((c) => c.id === id);
        if (!target || target.discovered) return prev;
        const next = prev.map((c) =>
          c.id === id ? { ...c, discovered: true, discoveredBy: by } : c
        );

        const whoLabel =
          by === 'both'
            ? 'Collected Together by Kaimana & Lani'
            : by === 'baby'
              ? 'Collected by Hatchling Lani'
              : 'Collected by Mother Kaimana';

        triggerDiscoveryBanner(
          target.name,
          `${whoLabel} · ${target.zone}`,
          target.category,
          target.lore
        );
        return next;
      });
    },
    [triggerDiscoveryBanner]
  );

  const handleInspectLandmark = useCallback(
    (id: string) => {
      setLandmarks((prev) => {
        const target = prev.find((l) => l.id === id);
        if (!target || target.inspected) return prev;
        const next = prev.map((l) => (l.id === id ? { ...l, inspected: true } : l));
        triggerDiscoveryBanner(
          target.title,
          `Sanctuary Chronicle Recorded · ${target.zone}`,
          'landmark',
          target.storyText
        );
        return next;
      });
    },
    [triggerDiscoveryBanner]
  );

  const handleMeetWildlife = useCallback(
    (id: string, befriended = false) => {
      setWildlife((prev) => {
        const target = prev.find((w) => w.id === id);
        if (!target) return prev;
        const alreadyDiscovered = target.discovered;
        const alreadyBefriended = Boolean(target.befriended);

        if (alreadyDiscovered && (!befriended || alreadyBefriended)) {
          return prev;
        }

        const next = prev.map((w) =>
          w.id === id
            ? {
                ...w,
                discovered: true,
                befriended: w.befriended || befriended,
              }
            : w
        );

        if (befriended && !alreadyBefriended) {
          oceanAudio.playFriendshipChime();
          triggerDiscoveryBanner(
            `New Ocean Friend: ${target.name}`,
            `Friendship Bond Formed · ${target.temperament}`,
            'wildlife',
            target.behavior
          );
        } else if (!alreadyDiscovered) {
          triggerDiscoveryBanner(
            target.name,
            `Peaceful Marine Companion Met · ${target.temperament}`,
            'wildlife',
            target.behavior
          );
        }
        return next;
      });
    },
    [triggerDiscoveryBanner]
  );

  const handleMunchSeaweed = useCallback(
    (zoneName: string) => {
      setHud((prev) => {
        const nextCount = prev.seaweedEaten + 1;
        return {
          ...prev,
          seaweedEaten: nextCount,
        };
      });
      triggerDiscoveryBanner(
        'Yum! Fresh Tender Sea-Lettuce & Kelp Snack',
        `Shared by Mother Kaimana & Hatchling Lani · ${zoneName}`,
        'seaweed',
        'Rich in ocean minerals—the little turtle’s favorite afternoon reef treat!'
      );
    },
    [triggerDiscoveryBanner]
  );

  const handleUpdateHud = useCallback((partial: Partial<GameHudState>) => {
    setHud((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleTogglePause = useCallback(() => {
    setScreenState((prev) => {
      if (prev === 'title') return 'playing';
      return prev === 'playing' ? 'paused' : 'playing';
    });
  }, []);

  const handleTogglePiggyback = useCallback(() => {
    setPiggybackActive((prev) => !prev);
  }, []);

  const handleStartGame = () => {
    oceanAudio.init();
    setScreenState('playing');
    setShowControlsHint(true);
  };

  const handleStartFresh = () => {
    clearLocalSave();
    completionCelebrated.current = false;
    setHasSavedProgress(false);
    setCollectibles(INITIAL_COLLECTIBLES);
    setLandmarks(INITIAL_LANDMARKS);
    setWildlife(INITIAL_WILDLIFE);
    setHud((prev) => ({ ...prev, seaweedEaten: 0 }));
    oceanRef.current?.setPositions([-2.5, -2.8, 4], [1.8, -2.5, 5.2]);
    handleStartGame();
  };

  // Put the turtles back where the last visit left them.
  useEffect(() => {
    if (initialSave?.momPosition && initialSave.babyPosition) {
      oceanRef.current?.setPositions(initialSave.momPosition, initialSave.babyPosition);
    }
  }, [initialSave]);

  // A finger on the screen switches the on-screen sticks on, even on a laptop with touch.
  useEffect(() => {
    const onFirstTouch = () => setIsTouchDevice(true);
    window.addEventListener('touchstart', onFirstTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onFirstTouch);
  }, []);

  useEffect(() => {
    if (!showControlsHint) return;
    const timer = window.setTimeout(() => setShowControlsHint(false), 9000);
    return () => window.clearTimeout(timer);
  }, [showControlsHint]);

  // Autosave: whenever progress changes, every 10 seconds while playing (for position),
  // and when the tab is hidden or closed.
  const saveSnapshot = useRef<() => void>(() => {});
  saveSnapshot.current = () => {
    const positions = oceanRef.current?.getPositions();
    writeLocalSave({
      version: 1,
      savedAt: new Date().toISOString(),
      collectibles: collectibles
        .filter((c) => c.discovered)
        .map((c) => ({ id: c.id, by: c.discoveredBy })),
      landmarkIds: landmarks.filter((l) => l.inspected).map((l) => l.id),
      wildlife: wildlife
        .filter((w) => w.discovered)
        .map((w) => ({ id: w.id, befriended: Boolean(w.befriended) })),
      seaweedEaten: hud.seaweedEaten,
      dayTimeHours: hud.dayTimeHours,
      weatherMood,
      momPosition: positions?.mom,
      babyPosition: positions?.baby,
      completionCelebrated: completionCelebrated.current,
    });
  };

  useEffect(() => {
    if (screenState === 'title') return;
    saveSnapshot.current();
  }, [collectibles, landmarks, wildlife, hud.seaweedEaten, weatherMood, screenState]);

  useEffect(() => {
    if (screenState === 'title') return;
    const interval = window.setInterval(() => saveSnapshot.current(), 10000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') saveSnapshot.current();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [screenState]);

  // One-time celebration when every treasure, landmark and friend has been found.
  const sanctuaryComplete =
    collectibles.every((c) => c.discovered) &&
    landmarks.every((l) => l.inspected) &&
    wildlife.every((w) => w.befriended);

  useEffect(() => {
    if (!sanctuaryComplete || completionCelebrated.current || screenState !== 'playing') return;
    // Let the last discovery banner be read before the celebration takes over.
    const timer = window.setTimeout(() => {
      completionCelebrated.current = true;
      oceanAudio.playFriendshipChime();
      setScreenState('victory');
      saveSnapshot.current();
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [sanctuaryComplete, screenState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (screenState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        oceanAudio.init();
        setScreenState('playing');
        setShowControlsHint(true);
      } else if (screenState === 'playing' && e.code === 'KeyH') {
        setIsDockCollapsed((prev) => !prev);
      } else if (screenState === 'playing' && e.code === 'KeyJ') {
        setJournalInitialTab('collectibles');
        setScreenState('paused');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screenState]);

  const handleRestoreSave = (journal: SavedOceanJournal) => {
    setCollectibles((prev) =>
      prev.map((c) => ({
        ...c,
        discovered: journal.discoveredCollectibleIds.includes(c.id),
      }))
    );
    setLandmarks((prev) =>
      prev.map((l) => ({
        ...l,
        inspected: journal.visitedLandmarkIds.includes(l.id),
      }))
    );
    setWildlife((prev) =>
      prev.map((w) => ({
        ...w,
        discovered: journal.wildlifeMetIds.includes(w.id),
        befriended: journal.wildlifeMetIds.includes(w.id),
      }))
    );
    if (typeof journal.seaweedEaten === 'number') {
      setHud((prev) => ({ ...prev, seaweedEaten: journal.seaweedEaten! }));
    }
    if (typeof journal.dayTimeHours === 'number') {
      setDayTimeHours(journal.dayTimeHours);
    }
    if (journal.weatherMood) {
      setWeatherMood(journal.weatherMood);
    }
    if (journal.momPosition && journal.babyPosition) {
      oceanRef.current?.setPositions(journal.momPosition, journal.babyPosition);
    }
  };

  const chestsFound = collectibles.filter(
    (c) => c.category === 'treasure_chest' && c.discovered
  ).length;
  const shellsFound = collectibles.filter(
    (c) => c.category === 'seashell' && c.discovered
  ).length;
  const pearlsAndArtifactsFound = collectibles.filter(
    (c) =>
      (c.category === 'glowing_pearl' || c.category === 'ancient_artifact') && c.discovered
  ).length;
  const wildlifeMetCount = wildlife.filter((w) => w.discovered).length;
  const friendsCount = wildlife.filter((w) => w.befriended).length;
  const chroniclesCount = landmarks.filter((l) => l.inspected).length;

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-slate-950">
      {/* Full-Viewport 3D Ocean Sanctuary WebGL Canvas */}
      <OceanCanvas
        ref={oceanRef}
        screenState={screenState}
        cameraMode={cameraMode}
        dayTimeHours={dayTimeHours}
        autoCycleTime={autoCycleTime}
        weatherMood={weatherMood}
        babyFollowingMom={babyFollowingMom}
        piggybackActive={piggybackActive}
        collectibles={collectibles}
        landmarks={landmarks}
        wildlife={wildlife}
        onDiscoverCollectible={handleDiscoverCollectible}
        onInspectLandmark={handleInspectLandmark}
        onMeetWildlife={handleMeetWildlife}
        onMunchSeaweed={handleMunchSeaweed}
        onUpdateHud={handleUpdateHud}
        onUpdateControllers={setControllers}
        onTogglePause={handleTogglePause}
        onTogglePiggyback={handleTogglePiggyback}
      />

      {/* SPLIT-SCREEN CO-OP DIVIDER & PLAYER LABELS */}
      {screenState === 'playing' && cameraMode === 'split_screen' && (
        <div className="fixed inset-0 pointer-events-none z-10">
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-slate-950/80 border-x border-teal-400/30" />
          <div className="absolute top-28 md:top-24 left-5 px-3 py-1.5 rounded-lg bg-slate-950/85 border border-slate-800 text-xs text-teal-200 font-medium shadow-lg backdrop-blur-none">
            Mother Kaimana · Depth{' '}
            <span className="font-mono-tabular">{hud.momDepth.toFixed(1)}m</span>
          </div>
          <div className="absolute top-28 md:top-24 right-5 px-3 py-1.5 rounded-lg bg-slate-950/85 border border-slate-800 text-xs text-amber-200 font-medium shadow-lg backdrop-blur-none">
            Hatchling Lani · Depth{' '}
            <span className="font-mono-tabular">{hud.babyDepth.toFixed(1)}m</span>
          </div>
        </div>
      )}

      {/* =====================================================================
          1. TITLE SCREEN OVERLAY
         ===================================================================== */}
      {screenState === 'title' && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-14 pointer-events-none bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-slate-950/60">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-lg bg-slate-950/80 border border-slate-800">
              <span>Player 1 (Mother Kaimana): {controllers.p1Name}</span>
              <span aria-hidden="true">·</span>
              <span>Player 2 (Baby Lani): {controllers.p2Name}</span>
            </div>
            <div className="px-3.5 py-2 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-300">
              Two-Player PC Controller &amp; Shared Keyboard Supported
            </div>
          </div>

          <div className="max-w-2xl mx-auto text-center space-y-5 pointer-events-auto my-auto">
            <div className="flex flex-col items-center">
              <svg
                className="w-24 h-24 text-teal-300 mb-3"
                viewBox="0 0 120 120"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="currentColor"
                  strokeOpacity="0.28"
                  strokeWidth="1.5"
                />
                <ellipse
                  cx="52"
                  cy="62"
                  rx="18"
                  ry="23"
                  fill="#14b8a6"
                  fillOpacity="0.25"
                  stroke="#5eead4"
                  strokeWidth="2.2"
                />
                <polygon
                  points="52,44 61,52 58,68 46,68 43,52"
                  stroke="#5eead4"
                  strokeWidth="1.4"
                  fill="none"
                />
                <circle cx="52" cy="33" r="5.5" fill="#5eead4" />
                <path
                  d="M34 52 C18 44, 12 56, 26 64"
                  stroke="#5eead4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M70 52 C86 44, 92 56, 78 64"
                  stroke="#5eead4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <ellipse
                  cx="84"
                  cy="78"
                  rx="9"
                  ry="11.5"
                  fill="#fbbf24"
                  fillOpacity="0.28"
                  stroke="#fde047"
                  strokeWidth="2"
                />
                <circle cx="84" cy="63" r="3.2" fill="#fde047" />
                <path
                  d="M75 73 C66 69, 64 76, 72 79"
                  stroke="#fde047"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M93 73 C102 69, 104 76, 96 79"
                  stroke="#fde047"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>

              <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-white font-display">
                Coral &amp; Cove
              </h1>
              <p className="text-base md:text-lg text-teal-200/90 font-medium mt-1">
                A Two-Player Mother &amp; Hatchling Sea Turtle Odyssey
              </p>
            </div>

            <p className="text-sm md:text-base text-slate-200/90 leading-relaxed max-w-xl mx-auto">
              Swim together through sunlit coral gardens, munch tender kelp, do bubbly barrel
              rolls, befriend singing dolphins &amp; gentle whale sharks, and visit the Coconut Cove
              Lighthouse &amp; Sea Turtle Hatchery.
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={handleStartGame}
                className="px-8 py-3.5 text-sm font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
              >
                {hasSavedProgress
                  ? 'Continue Your Odyssey (Enter / Space)'
                  : 'Dive Into the Sanctuary (Enter / Space)'}
              </button>
              {hasSavedProgress && (
                <button
                  onClick={() => {
                    if (window.confirm('Start a new odyssey? Your saved discoveries will be erased.')) {
                      handleStartFresh();
                    }
                  }}
                  className="px-5 py-3.5 text-sm font-medium text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl cursor-pointer"
                >
                  Start Fresh
                </button>
              )}
              <button
                onClick={() => {
                  oceanAudio.init();
                  setJournalInitialTab('settings');
                  setScreenState('paused');
                }}
                className="px-5 py-3.5 text-sm font-medium text-teal-200 bg-slate-900/90 hover:bg-slate-800 border border-teal-500/30 rounded-xl transition-colors cursor-pointer"
              >
                Weather &amp; Settings
              </button>
              <button
                onClick={() => {
                  oceanAudio.init();
                  setJournalInitialTab('drive');
                  setScreenState('paused');
                }}
                className="px-5 py-3.5 text-sm font-medium text-slate-100 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Google Drive Saves &amp; Postcards
              </button>
            </div>
          </div>

          <div className="text-center text-xs text-slate-300 tracking-wide">
            Left Stick / WASD Move · Swim Up: A / RT / D-Pad Up / Space · Dive Down: B / LT / D-Pad
            Down / C · Barrel Roll: LB / B · Munch Seaweed: G · Sing &amp; Befriend: Y / E
          </div>
        </div>
      )}

      {/* =====================================================================
          2. PLAYING HUD (Perimeter Status & Unified Collapsible Bottom Dock)
         ===================================================================== */}
      {screenState !== 'title' && (
        <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-5">
          {/* TOP PERIMETER STATUS BAR */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="pointer-events-auto flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-950/85 border border-slate-800/90 text-xs text-slate-200 shadow-lg">
              <span className="font-semibold text-teal-300">{hud.currentZone}</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono-tabular text-slate-300">
                Depth {hud.momDepth.toFixed(1)}m
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono-tabular text-amber-200">
                {formatSolarTime(hud.dayTimeHours)}
              </span>

              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>

              {/* Seaweed Snacks Nibbled Counter */}
              <span
                className="flex items-center gap-1.5 text-lime-300"
                title="Tender Seaweed Snacks Nibbled"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66l.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
                </svg>
                <span className="font-mono-tabular">{hud.seaweedEaten}</span>
                <span className="hidden sm:inline text-slate-400">Seaweed</span>
              </span>

              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>

              {/* Ocean Friends Counter */}
              <span
                className="flex items-center gap-1.5 text-emerald-300"
                title="Ocean Creatures Befriended"
              >
                <span className="font-mono-tabular">
                  {friendsCount}/{hud.totalWildlife}
                </span>
                <span className="hidden sm:inline text-slate-400">Friends</span>
              </span>

              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>

              {/* Chests, Shells, Pearls */}
              <span className="flex items-center gap-1.5" title="Treasures, Shells & Pearls">
                <span className="font-mono-tabular text-amber-300">
                  {chestsFound + shellsFound + pearlsAndArtifactsFound}/{collectibles.length}
                </span>
                <span className="hidden md:inline text-slate-400">Treasures</span>
              </span>

              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>

              {/* Chronicles */}
              <span className="flex items-center gap-1.5">
                <span className="font-mono-tabular text-purple-300">
                  {chroniclesCount}/{hud.totalLandmarks}
                </span>
                <span className="hidden lg:inline text-slate-400">Landmarks</span>
              </span>
            </div>

            {/* Right Cluster: Quick Compendium, Weather & Settings, Cloud Save & Audio Mute Buttons */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                onClick={() => {
                  setJournalInitialTab('collectibles');
                  setScreenState('paused');
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-100 bg-slate-950/85 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Compendium &amp; Map ({chestsFound + shellsFound + pearlsAndArtifactsFound}/
                {collectibles.length})
              </button>

              <button
                onClick={() => {
                  setJournalInitialTab('settings');
                  setScreenState('paused');
                }}
                className="px-3.5 py-2 text-xs font-medium text-sky-200 bg-slate-950/85 hover:bg-slate-900 border border-sky-500/30 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Weather &amp; Settings
              </button>

              <button
                onClick={() => {
                  setJournalInitialTab('drive');
                  setScreenState('paused');
                }}
                className="px-3.5 py-2 text-xs font-medium text-teal-300 bg-slate-950/85 hover:bg-slate-900 border border-teal-500/30 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Google Drive &amp; Postcard
              </button>

              <button
                onClick={() => {
                  const nextMute = !isMuted;
                  setIsMuted(nextMute);
                  oceanAudio.setMuted(nextMute);
                }}
                className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-950/85 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isMuted ? 'Sound Off' : 'Sound On'}
              </button>
            </div>
          </div>

          {/* =====================================================================
              UNIFIED COLLAPSIBLE BOTTOM CONTROL DOCK & COMPACT TOAST NOTIFICATIONS
             ===================================================================== */}
          <div className="mx-auto w-full max-w-[min(940px,94vw)] flex flex-col items-center pointer-events-auto">
            {/* COMPACT WORD POP-UPS & DISCOVERY TOASTS (Positioned at bottom, clear of central view & Zen mode) */}
            <div className="w-full max-w-md mx-auto text-center space-y-1.5 mb-2 pointer-events-none transition-all duration-300">
              {hud.recentDiscovery && (
                <div className="px-4 py-2 rounded-xl bg-slate-950/90 border border-teal-400/40 text-slate-100 shadow-xl inline-block max-w-full">
                  <p className="text-[10px] font-medium text-teal-300 tracking-wide uppercase">
                    {hud.recentDiscovery.subtitle}
                  </p>
                  <p className="text-sm font-semibold text-white font-display leading-tight">
                    {hud.recentDiscovery.title}
                  </p>
                  {hud.recentDiscovery.lore && (
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-snug line-clamp-2">
                      {hud.recentDiscovery.lore}
                    </p>
                  )}
                </div>
              )}

              {!hud.recentDiscovery && hud.activeWildlifeReaction && (
                <div className="px-3.5 py-1 rounded-lg bg-slate-950/85 border border-teal-500/30 text-xs text-teal-200 inline-block shadow-md">
                  {hud.activeWildlifeReaction}
                </div>
              )}

              {hud.nearbyPrompt && (
                <div className="px-3.5 py-1 rounded-lg bg-amber-950/85 border border-amber-400/40 text-xs text-amber-200 font-medium inline-block shadow-md">
                  {hud.nearbyPrompt}
                </div>
              )}
            </div>

            <button
              onClick={() => setIsDockCollapsed((prev) => !prev)}
              className="px-4 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-950/90 border border-b-0 border-slate-800 rounded-t-lg transition-colors cursor-pointer"
            >
              {isDockCollapsed ? '▴ Show Sanctuary Controls (H)' : '▾ Hide Controls · Zen Mode (H)'}
            </button>

            {!isDockCollapsed && (
              <div className="w-full px-4 py-3 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-2xl space-y-2.5 text-xs">
                {/* Row 1: Up/Down Swim Controls, Munch Seaweed, Barrel Roll, Sing & Befriend, and Camera View */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  {/* Explicit Interactive Up / Down Swim Buttons + Shortcut Hints */}
                  <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      onPointerDown={() => oceanRef.current?.setExternalVertical(1)}
                      onPointerUp={() => oceanRef.current?.setExternalVertical(0)}
                      onPointerLeave={() => oceanRef.current?.setExternalVertical(0)}
                      className="px-3 py-1.5 rounded-md bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      title="Hold to Swim Up toward the water surface (Controller: A / RT / D-Pad Up · Keyboard: Space / R)"
                    >
                      ▲ Swim Up (A / RT / Space)
                    </button>
                    <button
                      onPointerDown={() => oceanRef.current?.setExternalVertical(-1)}
                      onPointerUp={() => oceanRef.current?.setExternalVertical(0)}
                      onPointerLeave={() => oceanRef.current?.setExternalVertical(0)}
                      className="px-3 py-1.5 rounded-md bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      title="Hold to Dive Down toward the sandy seabed (Controller: B / LT / D-Pad Down · Keyboard: C / F / Shift)"
                    >
                      ▼ Dive Down (B / LT / C)
                    </button>
                  </div>

                  {/* Interactive Turtle Play Actions: Munch Seaweed, Barrel Roll, Sing & Befriend, Ride on Mom */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => oceanRef.current?.triggerMunchSeaweed()}
                      className="px-3 py-1.5 rounded-lg bg-lime-500/20 hover:bg-lime-500/30 border border-lime-400/40 text-lime-200 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      title="Stop and nibble tender green seaweed!"
                    >
                      Munch Seaweed (G)
                    </button>

                    <button
                      onClick={() => oceanRef.current?.triggerBarrelRoll('both')}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      title="Perform a bubbly 360-degree underwater barrel roll (Controller: LB · Keyboard: B)"
                    >
                      Barrel Roll (LB / B)
                    </button>

                    <button
                      onClick={() => {
                        oceanRef.current?.triggerTurtleSong('mom');
                        window.setTimeout(() => oceanRef.current?.triggerTurtleSong('baby'), 240);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      title="Sing a harmonic call to befriend dolphins, manta rays, and whale sharks (Controller: Y · Keyboard: E)"
                    >
                      Sing &amp; Befriend (Y / E)
                    </button>

                    <button
                      onClick={() => setPiggybackActive((prev) => !prev)}
                      className={`px-3 py-1.5 rounded-lg border font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        piggybackActive
                          ? 'bg-amber-400 text-slate-950 border-amber-300 font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {piggybackActive ? 'Riding Mom’s Shell' : 'Ride on Mom (P)'}
                    </button>
                  </div>
                </div>

                {/* Row 2: Camera Modes, Solar Cycle Scrubber, & Island / Reef Quick-Swim */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
                    {(
                      [
                        ['dynamic_coop', 'Shared Co-op'],
                        ['split_screen', 'Split-Screen'],
                        ['follow_mom', 'Mom'],
                        ['follow_baby', 'Baby'],
                      ] as const
                    ).map(([modeKey, modeLabel]) => (
                      <button
                        key={modeKey}
                        onClick={() => setCameraMode(modeKey)}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          cameraMode === modeKey
                            ? 'bg-teal-400 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {modeLabel}
                      </button>
                    ))}
                  </div>

                  {/* Day/Night Cycle Scrubber */}
                  <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                    <label htmlFor="solar-slider" className="text-slate-400 whitespace-nowrap">
                      Time:
                    </label>
                    <input
                      id="solar-slider"
                      type="range"
                      min={0}
                      max={23.9}
                      step={0.1}
                      value={hud.dayTimeHours}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setDayTimeHours(val);
                        setHud((prev) => ({ ...prev, dayTimeHours: val }));
                      }}
                      className="w-16 accent-teal-400 cursor-pointer"
                    />
                    {(
                      [
                        ['Dawn', 6.5],
                        ['Noon', 12.0],
                        ['Sunset', 17.8],
                        ['Night', 22.5],
                      ] as const
                    ).map(([label, hr]) => (
                      <button
                        key={label}
                        onClick={() => {
                          setDayTimeHours(hr);
                          setHud((prev) => ({ ...prev, dayTimeHours: hr }));
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Weather Effects Toggle */}
                  <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
                    {(
                      [
                        ['sunlit_calm', 'Sunlit Calm'],
                        ['gentle_rain', 'Gentle Rain'],
                        ['misty_morning', 'Misty Morning'],
                      ] as const
                    ).map(([moodKey, moodLabel]) => (
                      <button
                        key={moodKey}
                        onClick={() => {
                          setWeatherMood(moodKey);
                          setHud((prev) => ({ ...prev, weatherMood: moodKey }));
                        }}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          weatherMood === moodKey
                            ? 'bg-sky-400 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {moodLabel}
                      </button>
                    ))}
                  </div>

                  {/* Quick Visit Island Lighthouse or Shipwreck */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => oceanRef.current?.teleportToZone(0, 0.8, 22)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
                      title="Swim right to the Coconut Cove Island Lighthouse & Sea Turtle Nesting Sanctuary"
                    >
                      Visit Island Lighthouse
                    </button>
                    <button
                      onClick={() => oceanRef.current?.teleportToZone(-32, -6.5, -22)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-200 whitespace-nowrap shrink-0 cursor-pointer"
                      title="Swim to the Starlight Galleon Shipwreck"
                    >
                      Visit Shipwreck
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          3. SANCTUARY COMPENDIUM, WEATHER SETTINGS & GOOGLE DRIVE CLOUD MODAL
         ===================================================================== */}
      {screenState === 'playing' && isTouchDevice && (
        <TouchControls
          onSteer={(who, turn, forward) => oceanRef.current?.setTouchSteer(who, turn, forward)}
          onVertical={(who, dir) => oceanRef.current?.setTouchVertical(who, dir)}
          onSing={(who) => oceanRef.current?.triggerTurtleSong(who)}
          onRoll={(who) => oceanRef.current?.triggerBarrelRoll(who)}
          onMunch={() => oceanRef.current?.triggerMunchSeaweed()}
        />
      )}

      {screenState === 'playing' && showControlsHint && (
        <div className="absolute top-28 inset-x-0 z-20 flex justify-center pointer-events-none px-4">
          <div className="px-4 py-2 rounded-xl bg-slate-950/90 border border-teal-400/40 text-sm text-teal-100 shadow-xl text-center">
            {isTouchDevice
              ? 'Left stick swims Mom · right stick swims Baby (leave it and she follows) · tap a treasure to collect it'
              : 'W A S D swims Mom · arrow keys swim Baby · Space up, C down · press H for all controls'}
          </div>
        </div>
      )}

      {screenState === 'victory' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sanctuary complete"
          className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-slate-950/70"
        >
          <div className="max-w-lg w-full text-center px-8 py-9 rounded-3xl bg-slate-950/95 border border-teal-400/50 shadow-2xl space-y-4">
            <p className="text-xs font-semibold tracking-widest uppercase text-teal-300">
              Sanctuary Complete
            </p>
            <h2 className="text-3xl font-display font-semibold text-white">
              Kaimana &amp; Lani found everything!
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              All {collectibles.length} treasures collected, all {landmarks.length} landmarks
              visited and all {wildlife.length} ocean friends made, with {hud.seaweedEaten} seaweed
              snacks along the way. The whole reef is singing for you.
            </p>
            <button
              onClick={() => setScreenState('playing')}
              className="px-7 py-3 text-sm font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-xl cursor-pointer"
            >
              Keep Exploring
            </button>
          </div>
        </div>
      )}

      <SanctuaryJournalModal
        isOpen={screenState === 'paused'}
        activeInitialTab={journalInitialTab}
        collectibles={collectibles}
        landmarks={landmarks}
        wildlife={wildlife}
        dayTimeHours={hud.dayTimeHours}
        autoCycleTime={autoCycleTime}
        weatherMood={weatherMood}
        isMuted={isMuted}
        currentZone={hud.currentZone}
        onClose={() => setScreenState('playing')}
        onChangeWeatherMood={(mood) => {
          setWeatherMood(mood);
          setHud((prev) => ({ ...prev, weatherMood: mood }));
        }}
        onChangeDayTimeHours={(val) => {
          setDayTimeHours(val);
          setHud((prev) => ({ ...prev, dayTimeHours: val }));
        }}
        onToggleAutoCycleTime={() => {
          setAutoCycleTime((prev) => {
            const next = !prev;
            setHud((h) => ({ ...h, autoCycleTime: next }));
            return next;
          });
        }}
        onToggleMute={() => {
          const nextMute = !isMuted;
          setIsMuted(nextMute);
          oceanAudio.setMuted(nextMute);
        }}
        onCaptureSnapshot={() => oceanRef.current?.captureSnapshot() || ''}
        onTeleportToZone={(x, y, z) => oceanRef.current?.teleportToZone(x, y, z)}
        onGetPositions={() =>
          oceanRef.current?.getPositions() || { mom: [0, -2, 0], baby: [2, -2, 0] }
        }
        onRestoreSave={handleRestoreSave}
      />
    </div>
  );
}
