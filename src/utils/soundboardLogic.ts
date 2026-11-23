import {
  ADMIN_PASSWORD,
  AUDIO_URL_MAX_LENGTH,
  BOARD_ID,
  CATEGORY_NAME_MAX_LENGTH,
  HEX_COLOR_PATTERN,
  ID_PATTERN,
  SHORTCUT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../config/constants';
import type { BoardBackup, Category, PlaybackMode, SoundPad, SynthPresetId } from '../types/soundboard';

const IGNORED_SHORTCUT_KEYS = new Set([
  'Escape',
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'Tab',
  'Dead',
  'Unidentified',
]);

/**
 * Normalizes a KeyboardEvent key/code into a concise, consistent badge label
 * (e.g., "Space", "1", "Q", "F2", "Enter"). Returns "" for modifier/ignored keys.
 */
export function normalizeShortcut(key: string, code?: string): string {
  if (!key || IGNORED_SHORTCUT_KEYS.has(key)) return '';
  if (key === ' ' || code === 'Space') return 'Space';
  if (key.length === 1) {
    return key.toUpperCase();
  }
  if (/^F([1-9]|1[0-2])$/i.test(key)) {
    return key.toUpperCase();
  }
  if (['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(key)) {
    return key;
  }
  return '';
}

/**
 * Finds an existing SoundPad using the same normalized keyboard shortcut.
 */
export function findShortcutConflict(
  sounds: SoundPad[],
  shortcut: string,
  excludeSoundId?: string
): SoundPad | null {
  const clean = shortcut.trim().toLowerCase();
  if (!clean) return null;
  return (
    sounds.find(
      (s) => s.id !== excludeSoundId && s.shortcut.trim().toLowerCase() === clean
    ) || null
  );
}

export const STANDARD_NUMBER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;
export const STANDARD_LETTER_KEYS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
] as const;
export const STANDARD_SPACE_KEY = 'Space' as const;

export interface ShortcutKeyEntry {
  key: string;
  sound: SoundPad | null;
}

export interface ShortcutInventory {
  numberKeys: ShortcutKeyEntry[];
  letterKeys: ShortcutKeyEntry[];
  spaceKey: ShortcutKeyEntry;
  extraMapped: ShortcutKeyEntry[];
  takenStandardCount: number;
  availableStandardCount: number;
  totalStandardKeys: number;
}

/**
 * Builds an inventory of standard keys (1-0, A-Z, Space) plus any extra assigned
 * keys (e.g. F1-F12, Enter) mapped to SoundPads on the board.
 */
export function buildShortcutInventory(sounds: SoundPad[]): ShortcutInventory {
  const byNormalizedKey = new Map<string, SoundPad>();
  for (const sound of sounds) {
    const clean = sound.shortcut.trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (!byNormalizedKey.has(lower)) {
      byNormalizedKey.set(lower, sound);
    }
  }

  const standardSet = new Set<string>();
  const numberKeys: ShortcutKeyEntry[] = STANDARD_NUMBER_KEYS.map((key) => {
    standardSet.add(key.toLowerCase());
    return { key, sound: byNormalizedKey.get(key.toLowerCase()) ?? null };
  });

  const letterKeys: ShortcutKeyEntry[] = STANDARD_LETTER_KEYS.map((key) => {
    standardSet.add(key.toLowerCase());
    return { key, sound: byNormalizedKey.get(key.toLowerCase()) ?? null };
  });

  standardSet.add(STANDARD_SPACE_KEY.toLowerCase());
  const spaceKey: ShortcutKeyEntry = {
    key: STANDARD_SPACE_KEY,
    sound: byNormalizedKey.get(STANDARD_SPACE_KEY.toLowerCase()) ?? null,
  };

  const extraMapped: ShortcutKeyEntry[] = [];
  for (const sound of sounds) {
    const clean = sound.shortcut.trim();
    if (!clean) continue;
    if (!standardSet.has(clean.toLowerCase())) {
      extraMapped.push({ key: clean, sound });
    }
  }

  const allStandard = [...numberKeys, ...letterKeys, spaceKey];
  const takenStandardCount = allStandard.filter((entry) => entry.sound !== null).length;
  const totalStandardKeys = allStandard.length;
  const availableStandardCount = totalStandardKeys - takenStandardCount;

  return {
    numberKeys,
    letterKeys,
    spaceKey,
    extraMapped,
    takenStandardCount,
    availableStandardCount,
    totalStandardKeys,
  };
}

/**
 * Filters sounds by active category ('all' shows every pad) and sorts ascending by order.
 */
export function filterSoundsByCategory(
  sounds: SoundPad[],
  activeCategoryId: string
): SoundPad[] {
  const list =
    activeCategoryId === 'all'
      ? sounds
      : sounds.filter((s) => s.categoryId === activeCategoryId);
  return [...list].sort((a, b) => a.order - b.order);
}

/**
 * Swaps two pads 1-for-1 when draggedId is dropped onto targetId, leaving all
 * other pads in their original positions.
 * Returns a new sorted array with contiguous 0..N-1 order indices, plus only the changed pads.
 */
export function reorderPads(
  sounds: SoundPad[],
  draggedId: string,
  targetId: string
): { all: SoundPad[]; changed: SoundPad[] } {
  const sorted = [...sounds].sort((a, b) => a.order - b.order);
  const fromIndex = sorted.findIndex((s) => s.id === draggedId);
  const toIndex = sorted.findIndex((s) => s.id === targetId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return { all: sorted, changed: [] };
  }

  const next = [...sorted];
  const draggedPad = next[fromIndex];
  const targetPad = next[toIndex];
  next[fromIndex] = targetPad;
  next[toIndex] = draggedPad;

  const reindexed = next.map((pad, idx) => ({
    ...pad,
    order: idx,
  }));

  const originalMap = new Map(sounds.map((s) => [s.id, s]));
  const changed = reindexed.filter((pad) => {
    const prev = originalMap.get(pad.id);
    return !prev || prev.order !== pad.order || prev.categoryId !== pad.categoryId;
  });

  return { all: reindexed, changed };
}

/**
 * Moves a pad to another category (e.g., dropped onto a category tab) and places it at the end.
 */
export function movePadToCategory(
  sounds: SoundPad[],
  draggedId: string,
  targetCategoryId: string
): { all: SoundPad[]; changed: SoundPad[] } {
  if (!targetCategoryId || targetCategoryId === 'all') {
    return { all: [...sounds].sort((a, b) => a.order - b.order), changed: [] };
  }
  const sorted = [...sounds].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((s) => s.id === draggedId);
  if (idx === -1) return { all: sorted, changed: [] };

  const target = sorted[idx];
  if (target.categoryId === targetCategoryId) {
    return { all: sorted, changed: [] };
  }

  const next = [...sorted];
  const [moved] = next.splice(idx, 1);
  next.push({ ...moved, categoryId: targetCategoryId });

  const reindexed = next.map((pad, i) => ({ ...pad, order: i }));
  const originalMap = new Map(sounds.map((s) => [s.id, s]));
  const changed = reindexed.filter((pad) => {
    const prev = originalMap.get(pad.id);
    return !prev || prev.order !== pad.order || prev.categoryId !== pad.categoryId;
  });

  return { all: reindexed, changed };
}

export interface SoundInputCandidate {
  title: string;
  categoryId: string;
  color: string;
  shortcut: string;
  playbackMode: PlaybackMode;
  audioUrl?: string;
  synthPreset?: SynthPresetId;
  clipStartSec?: number;
  clipEndSec?: number;
}

export function normalizeClipTimes(
  clipStartSec?: number,
  clipEndSec?: number
): { clipStartSec: number; clipEndSec: number } {
  const start =
    typeof clipStartSec === 'number' && Number.isFinite(clipStartSec)
      ? Math.max(0, Math.min(36000, Math.round(clipStartSec * 100) / 100))
      : 0;
  const end =
    typeof clipEndSec === 'number' && Number.isFinite(clipEndSec)
      ? Math.max(0, Math.min(36000, Math.round(clipEndSec * 100) / 100))
      : 0;
  return { clipStartSec: start, clipEndSec: end };
}

export function computeClipSegment(
  totalDurationSec: number,
  clipStartSec?: number,
  clipEndSec?: number
): { startSec: number; endSec: number; durationSec: number } {
  const total = Number.isFinite(totalDurationSec) && totalDurationSec > 0 ? totalDurationSec : 0;
  if (total <= 0) {
    return { startSec: 0, endSec: 0, durationSec: 0 };
  }
  const minSlice = Math.min(0.05, total);
  const rawStart =
    typeof clipStartSec === 'number' && Number.isFinite(clipStartSec) && clipStartSec > 0
      ? clipStartSec
      : 0;
  const startSec = Math.max(0, Math.min(total - minSlice, rawStart));
  const hasCustomEnd =
    typeof clipEndSec === 'number' && Number.isFinite(clipEndSec) && clipEndSec > startSec;
  const endSec = hasCustomEnd ? Math.min(total, Math.max(startSec + minSlice, clipEndSec)) : total;
  const durationSec = Math.max(minSlice, endSec - startSec);
  return { startSec, endSec, durationSec };
}

export function validateSoundInput(input: SoundInputCandidate): string | null {
  const title = input.title.trim();
  if (!title) return 'Sound name is required.';
  if (title.length > TITLE_MAX_LENGTH) {
    return `Sound name must be ${TITLE_MAX_LENGTH} characters or less.`;
  }
  if (!input.categoryId || !ID_PATTERN.test(input.categoryId)) {
    return 'Please select a valid category.';
  }
  if (!HEX_COLOR_PATTERN.test(input.color)) {
    return 'Please choose a valid hex color.';
  }
  if (input.shortcut.length > SHORTCUT_MAX_LENGTH) {
    return `Shortcut must be ${SHORTCUT_MAX_LENGTH} characters or less.`;
  }
  if (
    input.playbackMode !== 'retrigger' &&
    input.playbackMode !== 'toggle' &&
    input.playbackMode !== 'gate'
  ) {
    return 'Invalid playback mode.';
  }
  const hasAudioUrl = Boolean(input.audioUrl && input.audioUrl.trim().length > 0);
  const hasSynth = Boolean(input.synthPreset && input.synthPreset.trim().length > 0);
  if (!hasAudioUrl && !hasSynth) {
    return 'Upload an audio file, paste an audio URL, or pick a built-in synth effect.';
  }
  if (input.audioUrl && input.audioUrl.length > AUDIO_URL_MAX_LENGTH) {
    return `Audio URL exceeds ${AUDIO_URL_MAX_LENGTH} characters.`;
  }
  if (input.clipStartSec !== undefined) {
    if (!Number.isFinite(input.clipStartSec) || input.clipStartSec < 0 || input.clipStartSec > 36000) {
      return 'Trim start time must be between 0 and 36000 seconds.';
    }
  }
  if (input.clipEndSec !== undefined) {
    if (!Number.isFinite(input.clipEndSec) || input.clipEndSec < 0 || input.clipEndSec > 36000) {
      return 'Trim end time must be between 0 and 36000 seconds.';
    }
    if (input.clipEndSec > 0 && input.clipEndSec <= (input.clipStartSec ?? 0)) {
      return 'Trim end time must be greater than start time.';
    }
  }
  return null;
}

export function validateCategoryName(name: string, existing: Category[], excludeId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Category name is required.';
  if (trimmed.length > CATEGORY_NAME_MAX_LENGTH) {
    return `Category name must be ${CATEGORY_NAME_MAX_LENGTH} characters or less.`;
  }
  if (trimmed.toLowerCase() === 'all') {
    return '"All" is a reserved view name.';
  }
  const duplicate = existing.some(
    (c) => c.id !== excludeId && c.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    return 'A category with that name already exists.';
  }
  return null;
}

export function createSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'item';
  return `${cleanPrefix}-${ts}-${rand}`;
}

export function checkAdminPassword(input: string, expected: string = ADMIN_PASSWORD): boolean {
  return input.trim() === expected;
}

export function buildExportPayload(categories: Category[], sounds: SoundPad[]): BoardBackup {
  return {
    exportedAt: new Date().toISOString(),
    boardId: BOARD_ID,
    version: 1,
    categories: [...categories].sort((a, b) => a.order - b.order),
    sounds: [...sounds].sort((a, b) => a.order - b.order),
  };
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function isSupportedAudioFile(file: { name: string; type?: string }): boolean {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  const validExt = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
  const validMime = Boolean(
    file.type &&
      ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'].includes(
        file.type.toLowerCase()
      )
  );
  return validExt || validMime;
}
