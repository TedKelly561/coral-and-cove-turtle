import { initializeApp, getApps, FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  Auth,
  User,
} from 'firebase/auth';
import { DriveFileEntry, SavedOceanJournal } from '../types/game';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Firebase settings are never committed. They come from either:
//   1. firebase-applet-config.json at the project root (git-ignored; AI Studio generates it), or
//   2. VITE_FIREBASE_* variables in .env.local (see .env.example).
const localConfigFiles = import.meta.glob<FirebaseOptions>('../../firebase-applet-config.json', {
  eager: true,
  import: 'default',
});

const loadFirebaseConfig = (): FirebaseOptions | null => {
  const fromFile = Object.values(localConfigFiles)[0];
  if (fromFile?.apiKey) return fromFile;

  const env = import.meta.env;
  if (!env.VITE_FIREBASE_API_KEY) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
};

const firebaseConfig = loadFirebaseConfig();

/** False when no Firebase settings are present; the game still runs, Drive saves are off. */
export const isDriveConfigured = firebaseConfig !== null;

export const DRIVE_NOT_CONFIGURED_MESSAGE =
  'Google Drive saves are not set up for this copy of the game. Add your Firebase settings to .env.local (see .env.example).';

let auth: Auth | null = null;
if (firebaseConfig) {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
}

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) throw new Error(DRIVE_NOT_CONFIGURED_MESSAGE);
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth?.signOut();
  cachedAccessToken = null;
};

export const listOceanDriveFiles = async (): Promise<DriveFileEntry[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const query = encodeURIComponent("trashed = false");
  const fields = encodeURIComponent("files(id, name, mimeType, modifiedTime, webViewLink)");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&pageSize=20`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Failed to list Google Drive files (${res.status})`);
  }

  const data = await res.json();
  return (data.files || []) as DriveFileEntry[];
};

export const saveJournalToDrive = async (
  journal: SavedOceanJournal,
  existingFileId?: string
): Promise<DriveFileEntry> => {
  const token = await getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const fileName = `Coral-and-Cove-Odyssey-${journal.familyTitle.replace(/[^a-zA-Z0-9_-]/g, '-')}.json`;
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: 'Coral & Cove: Two-Player Sea Turtle Odyssey family save file',
  };

  const boundary = '-------CoralAndCoveDriveBoundary7MA4YWxkTrZu0gW';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(journal, null, 2) +
    closeDelimiter;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink';

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Failed to save journal to Google Drive (${res.status})`);
  }

  return (await res.json()) as DriveFileEntry;
};

export const loadJournalFromDrive = async (fileId: string): Promise<SavedOceanJournal> => {
  const token = await getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Failed to load journal from Google Drive (${res.status})`);
  }

  return (await res.json()) as SavedOceanJournal;
};

export const saveSnapshotToDrive = async (
  dataUrl: string,
  zoneName: string
): Promise<DriveFileEntry> => {
  const token = await getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const metadata = {
    name: `Sea-Turtle-Postcard-${zoneName.replace(/\s+/g, '-')}-${timestamp}.png`,
    mimeType: 'image/png',
    description: `Captured in ${zoneName} during Coral & Cove: A Sea Turtle Odyssey`,
  };

  const boundary = '-------CoralAndCoveSnapshotBoundary9NB2ZX';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: image/png\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data +
    closeDelimiter;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Failed to upload postcard to Google Drive (${res.status})`);
  }

  return (await res.json()) as DriveFileEntry;
};

export const deleteDriveFile = async (fileId: string): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    throw new Error(`Failed to delete file from Google Drive (${res.status})`);
  }
};
