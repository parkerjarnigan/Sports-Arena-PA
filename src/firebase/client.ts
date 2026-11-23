import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  where,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { BOARD_ID, STARTER_CATEGORIES, STARTER_SOUNDS } from '../config/constants';
import type { Category, SoundPad } from '../types/soundboard';
import { normalizeClipTimes, sanitizeFilename } from '../utils/soundboardLogic';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
storage.maxUploadRetryTime = 15000;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

let seedAttempted = false;

export async function seedStarterBoardIfEmpty(): Promise<void> {
  if (seedAttempted) return;
  seedAttempted = true;

  try {
    const catQuery = query(collection(db, 'categories'), where('boardId', '==', BOARD_ID));
    const soundQuery = query(collection(db, 'sounds'), where('boardId', '==', BOARD_ID));
    const [catSnap, soundSnap] = await Promise.all([getDocs(catQuery), getDocs(soundQuery)]);

    if (!catSnap.empty || !soundSnap.empty) {
      return;
    }

    const batch = writeBatch(db);
    const now = new Date().toISOString();

    for (const cat of STARTER_CATEGORIES) {
      batch.set(doc(db, 'categories', cat.id), {
        id: cat.id,
        name: cat.name,
        order: cat.order,
        boardId: BOARD_ID,
        updatedAt: now,
      });
    }

    for (const sound of STARTER_SOUNDS) {
      batch.set(doc(db, 'sounds', sound.id), {
        id: sound.id,
        title: sound.title,
        categoryId: sound.categoryId,
        order: sound.order,
        color: sound.color,
        shortcut: sound.shortcut,
        playbackMode: sound.playbackMode,
        audioUrl: sound.audioUrl || '',
        storagePath: sound.storagePath || '',
        synthPreset: sound.synthPreset || '',
        boardId: BOARD_ID,
        updatedAt: now,
      });
    }

    await batch.commit();
  } catch (error) {
    seedAttempted = false;
    handleFirestoreError(error, OperationType.WRITE, 'categories,sounds');
  }
}

export function subscribeBoardData(
  onCategories: (categories: Category[]) => void,
  onSounds: (sounds: SoundPad[]) => void,
  onError: (err: Error) => void
): () => void {
  const catQuery = query(collection(db, 'categories'), where('boardId', '==', BOARD_ID));
  const soundQuery = query(collection(db, 'sounds'), where('boardId', '==', BOARD_ID));

  let categoriesLoaded = false;
  let soundsLoaded = false;
  let latestCats: Category[] = [];
  let latestSounds: SoundPad[] = [];

  const maybeSeed = () => {
    if (categoriesLoaded && soundsLoaded && latestCats.length === 0 && latestSounds.length === 0) {
      seedStarterBoardIfEmpty().catch((err) => {
        onError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const unsubCats = onSnapshot(
    catQuery,
    (snapshot) => {
      categoriesLoaded = true;
      latestCats = snapshot.docs
        .map((d) => d.data() as Category)
        .sort((a, b) => a.order - b.order);
      onCategories(latestCats);
      maybeSeed();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'categories');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  const unsubSounds = onSnapshot(
    soundQuery,
    (snapshot) => {
      soundsLoaded = true;
      latestSounds = snapshot.docs
        .map((d) => d.data() as SoundPad)
        .sort((a, b) => a.order - b.order);
      onSounds(latestSounds);
      maybeSeed();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'sounds');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  return () => {
    unsubCats();
    unsubSounds();
  };
}

export async function saveCategory(category: Category, isNew: boolean): Promise<void> {
  const path = `categories/${category.id}`;
  const payload = {
    id: category.id,
    name: category.name.trim().slice(0, 40),
    order: category.order,
    boardId: BOARD_ID,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'categories', category.id), payload, { merge: !isNew });
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteCategoryAndReassign(
  categoryId: string,
  soundsInCategory: SoundPad[],
  fallbackCategoryId: string | null
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    for (const s of soundsInCategory) {
      if (fallbackCategoryId) {
        batch.update(doc(db, 'sounds', s.id), {
          categoryId: fallbackCategoryId,
          updatedAt: now,
        });
      } else {
        batch.delete(doc(db, 'sounds', s.id));
      }
    }

    batch.delete(doc(db, 'categories', categoryId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `categories/${categoryId}`);
  }
}

export async function saveSoundPad(sound: SoundPad, isNew: boolean): Promise<void> {
  const path = `sounds/${sound.id}`;
  const { clipStartSec, clipEndSec } = normalizeClipTimes(sound.clipStartSec, sound.clipEndSec);
  const payload = {
    id: sound.id,
    title: sound.title.trim().slice(0, 60),
    categoryId: sound.categoryId,
    order: sound.order,
    color: sound.color,
    shortcut: sound.shortcut.trim().slice(0, 16),
    playbackMode: sound.playbackMode,
    audioUrl: (sound.audioUrl || '').slice(0, 2048),
    storagePath: (sound.storagePath || '').slice(0, 256),
    synthPreset: (sound.synthPreset || '').slice(0, 40),
    clipStartSec,
    clipEndSec: clipEndSec > clipStartSec ? clipEndSec : 0,
    boardId: BOARD_ID,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'sounds', sound.id), payload, { merge: !isNew });
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteSoundPad(sound: SoundPad): Promise<void> {
  const path = `sounds/${sound.id}`;
  try {
    await deleteDoc(doc(db, 'sounds', sound.id));
    if (sound.storagePath) {
      try {
        await deleteObject(storageRef(storage, sound.storagePath));
      } catch {
        // Ignore missing storage object cleanup errors
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function batchUpdateSoundOrder(changedSounds: SoundPad[]): Promise<void> {
  if (changedSounds.length === 0) return;
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    for (const s of changedSounds) {
      batch.update(doc(db, 'sounds', s.id), {
        order: s.order,
        categoryId: s.categoryId,
        updatedAt: now,
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'sounds');
  }
}

export async function uploadAudioFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ downloadUrl: string; storagePath: string }> {
  const safeName = sanitizeFilename(file.name);
  const path = `boards/${BOARD_ID}/audio/${Date.now()}-${safeName}`.slice(0, 256);
  const fileRef = storageRef(storage, path);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(fileRef, file, {
      contentType: file.type || 'audio/mpeg',
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && onProgress) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (error) => {
        reject(
          new Error(
            error.message ||
              'Firebase Storage upload failed. Check that Firebase Storage is enabled and Storage rules allow uploads.'
          )
        );
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ downloadUrl, storagePath: path });
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to get download URL.'));
        }
      }
    );
  });
}
