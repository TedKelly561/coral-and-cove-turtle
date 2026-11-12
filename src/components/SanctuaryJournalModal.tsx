import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  CollectibleItem,
  DriveFileEntry,
  SavedOceanJournal,
  StoryLandmark,
  WeatherMood,
  WildlifeSighting,
} from '../types/game';
import {
  deleteDriveFile,
  DRIVE_NOT_CONFIGURED_MESSAGE,
  googleSignIn,
  initAuth,
  listOceanDriveFiles,
  loadJournalFromDrive,
  logout,
  saveJournalToDrive,
  saveSnapshotToDrive,
} from '../services/googleDrive';

interface SanctuaryJournalModalProps {
  isOpen: boolean;
  activeInitialTab?: 'collectibles' | 'wildlife' | 'chronicles' | 'settings' | 'drive';
  collectibles: CollectibleItem[];
  landmarks: StoryLandmark[];
  wildlife: WildlifeSighting[];
  dayTimeHours: number;
  autoCycleTime: boolean;
  weatherMood: WeatherMood;
  isMuted: boolean;
  onChangeWeatherMood: (mood: WeatherMood) => void;
  onChangeDayTimeHours: (hours: number) => void;
  onToggleAutoCycleTime: () => void;
  onToggleMute: () => void;
  onClose: () => void;
  onCaptureSnapshot: () => string;
  onTeleportToZone: (x: number, y: number, z: number) => void;
  onGetPositions: () => { mom: [number, number, number]; baby: [number, number, number] };
  onRestoreSave: (journal: SavedOceanJournal) => void;
  currentZone: string;
}

export const SanctuaryJournalModal: React.FC<SanctuaryJournalModalProps> = ({
  isOpen,
  activeInitialTab = 'collectibles',
  collectibles,
  landmarks,
  wildlife,
  dayTimeHours,
  autoCycleTime,
  weatherMood,
  isMuted,
  onChangeWeatherMood,
  onChangeDayTimeHours,
  onToggleAutoCycleTime,
  onToggleMute,
  onClose,
  onCaptureSnapshot,
  onTeleportToZone,
  onGetPositions,
  onRestoreSave,
  currentZone,
}) => {
  const [activeTab, setActiveTab] = useState<
    'collectibles' | 'wildlife' | 'chronicles' | 'settings' | 'drive'
  >(activeInitialTab);
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'treasure_chest' | 'seashell' | 'glowing_pearl' | 'ancient_artifact'
  >('all');

  // Google Drive Auth & Files State
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileEntry[]>([]);
  const [familyTitle, setFamilyTitle] = useState<string>('Mom & Daughter Odyssey');
  const [previewSnapshotUrl, setPreviewSnapshotUrl] = useState<string | null>(null);

  // Mandatory Explicit User Confirmation Modal State for Mutating/Destructive Drive Operations
  const [pendingConfirm, setPendingConfirm] = useState<{
    type: 'overwrite' | 'delete';
    file: DriveFileEntry;
  } | null>(null);

  useEffect(() => {
    setActiveTab(activeInitialTab);
  }, [activeInitialTab]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'drive' && !needsAuth) {
      refreshDriveFiles();
    }
  }, [isOpen, activeTab, needsAuth]);

  if (!isOpen) return null;

  const refreshDriveFiles = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const files = await listOceanDriveFiles();
      setDriveFiles(files);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'AUTH_REQUIRED') {
        setNeedsAuth(true);
      } else {
        setErrorMessage('Could not load files from Google Drive. Please try signing in again.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setNeedsAuth(false);
        const files = await listOceanDriveFiles();
        setDriveFiles(files);
        setStatusMessage('Connected to Google Drive.');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error && err.message === DRIVE_NOT_CONFIGURED_MESSAGE
          ? DRIVE_NOT_CONFIGURED_MESSAGE
          : 'Sign-in was cancelled or could not complete.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateNewSave = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const pos = onGetPositions();
      const payload: SavedOceanJournal = {
        version: 1,
        savedAt: new Date().toISOString(),
        familyTitle: familyTitle.trim() || 'Mom & Daughter Odyssey',
        discoveredCollectibleIds: collectibles.filter((c) => c.discovered).map((c) => c.id),
        visitedLandmarkIds: landmarks.filter((l) => l.inspected).map((l) => l.id),
        wildlifeMetIds: wildlife.filter((w) => w.discovered).map((w) => w.id),
        dayTimeHours,
        weatherMood,
        momPosition: pos.mom,
        babyPosition: pos.baby,
      };
      const savedFile = await saveJournalToDrive(payload);
      setStatusMessage(`Saved "${savedFile.name}" to your Google Drive.`);
      await refreshDriveFiles();
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'AUTH_REQUIRED') {
        setNeedsAuth(true);
      } else {
        setErrorMessage('Failed to save journal to Google Drive.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmOverwriteOrDelete = async () => {
    if (!pendingConfirm) return;
    const { type, file } = pendingConfirm;
    setPendingConfirm(null);
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (type === 'delete') {
        await deleteDriveFile(file.id);
        setStatusMessage(`Deleted "${file.name}" from Google Drive.`);
      } else {
        const pos = onGetPositions();
        const payload: SavedOceanJournal = {
          version: 1,
          savedAt: new Date().toISOString(),
          familyTitle: familyTitle.trim() || 'Mom & Daughter Odyssey',
          discoveredCollectibleIds: collectibles.filter((c) => c.discovered).map((c) => c.id),
          visitedLandmarkIds: landmarks.filter((l) => l.inspected).map((l) => l.id),
          wildlifeMetIds: wildlife.filter((w) => w.discovered).map((w) => w.id),
          dayTimeHours,
          weatherMood,
          momPosition: pos.mom,
          babyPosition: pos.baby,
        };
        await saveJournalToDrive(payload, file.id);
        setStatusMessage(`Updated "${file.name}" in Google Drive.`);
      }
      await refreshDriveFiles();
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'AUTH_REQUIRED') {
        setNeedsAuth(true);
      } else {
        setErrorMessage(`Could not ${type} "${file.name}".`);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoadSave = async (file: DriveFileEntry) => {
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const loaded = await loadJournalFromDrive(file.id);
      onRestoreSave(loaded);
      setStatusMessage(`Loaded "${file.name}" from Google Drive.`);
    } catch {
      setErrorMessage(`Could not load "${file.name}". Make sure it is a valid Coral & Cove save file.`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleTakeAndUploadPostcard = async () => {
    const dataUrl = onCaptureSnapshot();
    if (!dataUrl) return;
    setPreviewSnapshotUrl(dataUrl);

    if (needsAuth) {
      setStatusMessage('Postcard captured! Sign in with Google below to save it to Google Drive.');
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      const uploaded = await saveSnapshotToDrive(dataUrl, currentZone);
      setStatusMessage(`Saved 3D Postcard "${uploaded.name}" to Google Drive!`);
      await refreshDriveFiles();
    } catch {
      setErrorMessage('Could not upload postcard to Google Drive.');
    } finally {
      setIsBusy(false);
    }
  };

  const filteredCollectibles =
    categoryFilter === 'all'
      ? collectibles
      : collectibles.filter((c) => c.category === categoryFilter);

  const discoveredCount = collectibles.filter((c) => c.discovered).length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 md:p-6 bg-slate-950/85 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Sanctuary Compendium and Cloud Journal"
    >
      <div className="relative w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-slate-800">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white font-display">
              Coral &amp; Cove Sanctuary Compendium
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Discoveries shared by Mother Kaimana &amp; Hatchling Lani ·{' '}
              <span className="font-mono-tabular text-teal-300">
                {discoveredCount}/{collectibles.length}
              </span>{' '}
              Treasures, Shells, Pearls &amp; Artifacts Found
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Resume Swimming (Esc)
            </button>
          </div>
        </div>

        {/* Navigation Tabs + Fast Travel Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 bg-slate-950/60 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
            {(
              [
                ['collectibles', 'Treasures & Shells'],
                ['wildlife', 'Marine Life'],
                ['chronicles', 'Reef Lore'],
                ['settings', 'Weather & Settings'],
                ['drive', 'Google Drive & Postcards'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === key
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Quick Scenic Swim Destinations for Mom & Baby */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="hidden lg:inline">Swim Together To:</span>
            {[
              { label: 'Coconut Cove Beach', pos: [0, 0.4, 24] as [number, number, number] },
              { label: 'Sunlit Coral Reef', pos: [10, -3.2, -16] as [number, number, number] },
              { label: 'Starlight Galleon', pos: [-32, -6.5, -22] as [number, number, number] },
              { label: 'Kelp Forest', pos: [38, -5.0, 22] as [number, number, number] },
              { label: 'Twilight Grotto', pos: [-38, -8.5, 28] as [number, number, number] },
            ].map((dest) => (
              <button
                key={dest.label}
                onClick={() => {
                  onTeleportToZone(dest.pos[0], dest.pos[1], dest.pos[2]);
                  onClose();
                }}
                className="px-2.5 py-1 text-xs text-slate-300 hover:text-teal-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dest.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: COLLECTIBLES (Chests, Unique Seashells, Glowing Pearls, Ancient Artifacts) */}
          {activeTab === 'collectibles' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  {(
                    [
                      ['all', 'All Keepsakes'],
                      ['treasure_chest', 'Treasure Chests'],
                      ['seashell', 'Unique Seashells'],
                      ['glowing_pearl', 'Glowing Pearls'],
                      ['ancient_artifact', 'Ancient Artifacts'],
                    ] as const
                  ).map(([catKey, catLabel]) => (
                    <button
                      key={catKey}
                      onClick={() => setCategoryFilter(catKey)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        categoryFilter === catKey
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {catLabel}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-slate-400">
                  Swim within 4 meters of any shimmering chest, shell, clam pearl, or relic to collect it.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCollectibles.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      item.discovered
                        ? 'bg-slate-950/90 border-teal-500/40'
                        : 'bg-slate-950/40 border-slate-800/80 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-1.5">
                      <span>{item.zone}</span>
                      <span aria-hidden="true">·</span>
                      <span className={item.discovered ? 'text-teal-300 font-medium' : 'text-slate-500'}>
                        {item.discovered
                          ? item.discoveredBy === 'both'
                            ? 'Found Together'
                            : item.discoveredBy === 'baby'
                              ? 'Found by Baby Lani'
                              : 'Found by Mom Kaimana'
                          : 'Undiscovered'}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-white">{item.name}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed mt-1.5">{item.lore}</p>

                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400 capitalize">
                        {item.category.replace('_', ' ')}
                      </span>
                      <button
                        onClick={() => {
                          onTeleportToZone(
                            item.position[0],
                            Math.max(item.position[1] + 1.5, -9),
                            item.position[2] + 4
                          );
                          onClose();
                        }}
                        className="text-teal-300 hover:text-teal-200 font-medium cursor-pointer"
                      >
                        Swim Near Here →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: PEACEFUL MARINE WILDLIFE */}
          {activeTab === 'wildlife' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {wildlife.map((w) => (
                <div
                  key={w.id}
                  className={`p-5 rounded-xl border ${
                    w.discovered
                      ? 'bg-slate-950/90 border-teal-500/40'
                      : 'bg-slate-950/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                    <span className="italic">{w.species}</span>
                    <span aria-hidden="true">·</span>
                    <span>{w.temperament}</span>
                    <span aria-hidden="true">·</span>
                    <span className={w.discovered ? 'text-teal-300 font-medium' : 'text-slate-500'}>
                      {w.discovered ? 'Met in Sanctuary' : 'Swim Out to Meet'}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white">{w.name}</h3>
                  <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{w.description}</p>
                  <p className="text-xs text-teal-300/90 mt-3 pt-3 border-t border-slate-800/80">
                    Interactive Behavior: {w.behavior}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: ENVIRONMENTAL STORYTELLING & SHIPWRECK CHRONICLES */}
          {activeTab === 'chronicles' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {landmarks.map((lm, idx) => (
                <div
                  key={lm.id}
                  className={`p-5 rounded-xl border ${
                    lm.inspected
                      ? 'bg-slate-950/90 border-amber-500/40'
                      : 'bg-slate-950/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
                    <span>Chronicle 0{idx + 1}</span>
                    <span aria-hidden="true">·</span>
                    <span>{lm.zone}</span>
                    <span aria-hidden="true">·</span>
                    <span className={lm.inspected ? 'text-amber-300 font-medium' : 'text-slate-500'}>
                      {lm.inspected ? 'Chronicle Recorded' : 'Unvisited Monument'}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white font-display">{lm.title}</h3>
                  <p className="text-sm text-slate-300 mt-2 leading-relaxed">{lm.storyText}</p>
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => {
                        onTeleportToZone(lm.position[0], lm.position[1] + 2.0, lm.position[2] + 5);
                        onClose();
                      }}
                      className="text-xs font-medium text-teal-300 hover:text-teal-200 cursor-pointer"
                    >
                      Visit Monument →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: GOOGLE DRIVE CLOUD JOURNAL & 3D POSTCARDS */}
          {activeTab === 'drive' && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Google Drive Family Odyssey Cloud Sync &amp; 3D Postcards
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                    Save your discovered seashells, pearls, shipwreck lore, and high-resolution 3D
                    ocean snapshots directly to your personal Google Drive.
                  </p>
                </div>

                {needsAuth ? (
                  <button
                    className="gsi-material-button shrink-0"
                    onClick={handleGoogleLogin}
                    disabled={isBusy}
                  >
                    <div className="gsi-material-button-state"></div>
                    <div className="gsi-material-button-content-wrapper">
                      <div className="gsi-material-button-icon">
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          style={{ display: 'block' }}
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          ></path>
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          ></path>
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          ></path>
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          ></path>
                          <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                      </div>
                      <span className="gsi-material-button-contents">Sign in with Google</span>
                      <span style={{ display: 'none' }}>Sign in with Google</span>
                    </div>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-300">{user?.email || user?.displayName}</span>
                    <button
                      onClick={async () => {
                        await logout();
                        setNeedsAuth(true);
                        setDriveFiles([]);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>

              {statusMessage && (
                <div className="px-4 py-3 rounded-lg bg-teal-950/80 border border-teal-500/40 text-xs text-teal-200">
                  {statusMessage}
                </div>
              )}

              {errorMessage && (
                <div className="px-4 py-3 rounded-lg bg-rose-950/80 border border-rose-500/40 text-xs text-rose-200">
                  {errorMessage}
                </div>
              )}

              {/* Save Odyssey Progress & Capture 3D Postcard */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
                  <h4 className="text-sm font-semibold text-white">
                    Save Odyssey Progress to Google Drive
                  </h4>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5" htmlFor="family-title">
                      Family Save Name
                    </label>
                    <input
                      id="family-title"
                      type="text"
                      value={familyTitle}
                      onChange={(e) => setFamilyTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-teal-400"
                    />
                  </div>
                  <button
                    onClick={handleCreateNewSave}
                    disabled={needsAuth || isBusy}
                    className="w-full py-2.5 px-4 text-xs font-semibold rounded-lg bg-teal-400 text-slate-950 hover:bg-teal-300 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {isBusy ? 'Saving to Google Drive...' : 'Save New Family Journal File'}
                  </button>
                </div>

                <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
                  <h4 className="text-sm font-semibold text-white">
                    Capture 3D Ocean Postcard Snapshot
                  </h4>
                  <p className="text-xs text-slate-400">
                    Takes a crisp 3D snapshot of Mother Kaimana &amp; Baby Lani in{' '}
                    <span className="text-slate-200">{currentZone}</span> and saves the PNG to your
                    Google Drive.
                  </p>
                  <button
                    onClick={handleTakeAndUploadPostcard}
                    disabled={isBusy}
                    className="w-full py-2.5 px-4 text-xs font-semibold rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {needsAuth
                      ? 'Preview 3D Snapshot (Sign in to upload)'
                      : 'Capture & Save 3D Postcard to Google Drive'}
                  </button>
                  {previewSnapshotUrl && (
                    <img
                      src={previewSnapshotUrl}
                      alt="Captured 3D Sea Turtle Odyssey Postcard"
                      referrerPolicy="no-referrer"
                      className="w-full h-32 object-cover rounded-lg border border-slate-700 mt-2"
                    />
                  )}
                </div>
              </div>

              {/* Existing Google Drive Files List */}
              {!needsAuth && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">
                      Your Coral &amp; Cove Files in Google Drive
                    </h4>
                    <button
                      onClick={refreshDriveFiles}
                      disabled={isBusy}
                      className="text-xs text-teal-300 hover:text-teal-200 cursor-pointer"
                    >
                      Refresh List
                    </button>
                  </div>

                  {driveFiles.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">
                      No saved journals or 3D postcards in your Google Drive yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/60">
                      {driveFiles.map((file) => {
                        const isJson = file.mimeType === 'application/json' || file.name.endsWith('.json');
                        return (
                          <div
                            key={file.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                          >
                            <div>
                              <p className="font-medium text-slate-100">{file.name}</p>
                              <p className="text-slate-400 mt-0.5 font-mono-tabular">
                                {new Date(file.modifiedTime).toLocaleString()} ·{' '}
                                {isJson ? 'Odyssey Save File' : '3D Postcard Image'}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {isJson && (
                                <>
                                  <button
                                    onClick={() => handleLoadSave(file)}
                                    disabled={isBusy}
                                    className="px-3 py-1.5 rounded-md bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 font-medium cursor-pointer"
                                  >
                                    Load Save
                                  </button>
                                  <button
                                    onClick={() =>
                                      setPendingConfirm({ type: 'overwrite', file })
                                    }
                                    disabled={isBusy}
                                    className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
                                  >
                                    Overwrite
                                  </button>
                                </>
                              )}
                              {file.webViewLink && (
                                <a
                                  href={file.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700"
                                >
                                  View in Drive
                                </a>
                              )}
                              <button
                                onClick={() => setPendingConfirm({ type: 'delete', file })}
                                disabled={isBusy}
                                className="px-3 py-1.5 rounded-md bg-rose-950/80 text-rose-300 hover:bg-rose-900/80 cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: WEATHER EFFECTS & SANCTUARY SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Dynamic Ocean Weather Effects
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Switch the sanctuary’s atmospheric weather. Updates 3D world lighting, water
                    surface wave shaders, raindrop ripples, and sea-fog layers in real time.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(
                    [
                      {
                        id: 'sunlit_calm' as WeatherMood,
                        title: 'Sunlit Calm',
                        badge: 'Bright & Crystal Clear',
                        desc: 'Radiant tropical sunbeams pierce the turquoise water with gentle trade-wind swells and crisp horizon visibility.',
                      },
                      {
                        id: 'gentle_rain' as WeatherMood,
                        title: 'Gentle Rain',
                        badge: 'Soothing Rain Ripples',
                        desc: 'Warm tropical raindrops patter across the ocean surface, creating concentric shader ripples and serene silver-slate light.',
                      },
                      {
                        id: 'misty_morning' as WeatherMood,
                        title: 'Misty Morning',
                        badge: 'Dreamy Sea-Fog Banks',
                        desc: 'Low-lying pearlescent mist drifts around Coconut Cove Lighthouse over glassy water bathed in diffused rose-gold light.',
                      },
                    ] as const
                  ).map((option) => {
                    const isSelected = weatherMood === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() => onChangeWeatherMood(option.id)}
                        className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-500/15 border-teal-400 shadow-lg'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-sm font-semibold text-white">{option.title}</span>
                          <span
                            className={`px-2 py-0.5 text-[11px] rounded-md font-medium ${
                              isSelected
                                ? 'bg-teal-400 text-slate-950 font-semibold'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isSelected ? 'Active' : option.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{option.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Solar Cycle & Audio Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Time of Day &amp; Solar Cycle</h3>
                    <button
                      onClick={onToggleAutoCycleTime}
                      className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                        autoCycleTime
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {autoCycleTime ? 'Auto Solar Cycle: ON' : 'Auto Solar Cycle: OFF'}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={23.9}
                    step={0.1}
                    value={dayTimeHours}
                    onChange={(e) => onChangeDayTimeHours(parseFloat(e.target.value))}
                    className="w-full accent-teal-400 cursor-pointer"
                  />
                  <div className="flex items-center justify-between gap-2 text-xs">
                    {(
                      [
                        ['Dawn (6:30 AM)', 6.5],
                        ['Noon (12:00 PM)', 12.0],
                        ['Sunset (5:50 PM)', 17.8],
                        ['Starlight (10:30 PM)', 22.5],
                      ] as const
                    ).map(([label, hr]) => (
                      <button
                        key={label}
                        onClick={() => onChangeDayTimeHours(hr)}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Tranquil Ocean Soundscape
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Toggle gentle ocean surf, underwater harmonic harp chimes, and singing dolphin
                      calls.
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={onToggleMute}
                      className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-teal-300 cursor-pointer"
                    >
                      {isMuted ? 'Unmute Ocean Audio' : 'Mute Ocean Audio'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mandatory Explicit User Confirmation Modal for Overwrite or Delete */}
        {pendingConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6">
            <div className="max-w-md w-full rounded-xl bg-slate-900 border border-slate-700 p-6 space-y-4 shadow-2xl">
              <h3 className="text-lg font-semibold text-white">
                {pendingConfirm.type === 'delete'
                  ? 'Confirm Google Drive File Deletion'
                  : 'Confirm Overwriting Google Drive Save'}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pendingConfirm.type === 'delete'
                  ? `Are you sure you want to permanently delete "${pendingConfirm.file.name}" from your Google Drive? This action cannot be undone.`
                  : `Are you sure you want to overwrite "${pendingConfirm.file.name}" in your Google Drive with your current ocean exploration progress?`}
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setPendingConfirm(null)}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmOverwriteOrDelete}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                    pendingConfirm.type === 'delete'
                      ? 'bg-rose-500 text-white hover:bg-rose-400'
                      : 'bg-teal-400 text-slate-950 hover:bg-teal-300'
                  }`}
                >
                  {pendingConfirm.type === 'delete' ? 'Confirm Delete' : 'Confirm Overwrite'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
