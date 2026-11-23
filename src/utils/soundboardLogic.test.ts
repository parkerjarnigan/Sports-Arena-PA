import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExportPayload,
  buildShortcutInventory,
  checkAdminPassword,
  computeClipSegment,
  createSafeId,
  filterSoundsByCategory,
  findShortcutConflict,
  isSupportedAudioFile,
  movePadToCategory,
  normalizeShortcut,
  reorderPads,
  validateCategoryName,
  validateSoundInput,
} from './soundboardLogic';
import type { Category, SoundPad } from '../types/soundboard';

const sampleCategories: Category[] = [
  { id: 'cat-positive', name: 'Positive', order: 0, boardId: 'default' },
  { id: 'cat-negative', name: 'Negative', order: 1, boardId: 'default' },
];

const sampleSounds: SoundPad[] = [
  {
    id: 's1',
    title: 'Air Horn',
    categoryId: 'cat-positive',
    order: 0,
    color: '#EA580C',
    shortcut: '1',
    playbackMode: 'retrigger',
    synthPreset: 'air-horn',
    boardId: 'default',
  },
  {
    id: 's2',
    title: 'Swish',
    categoryId: 'cat-positive',
    order: 1,
    color: '#16A34A',
    shortcut: '2',
    playbackMode: 'retrigger',
    synthPreset: 'swish-chime',
    boardId: 'default',
  },
  {
    id: 's3',
    title: 'Buzzer',
    categoryId: 'cat-negative',
    order: 2,
    color: '#DC2626',
    shortcut: 'Space',
    playbackMode: 'toggle',
    synthPreset: 'buzzer',
    boardId: 'default',
  },
];

test('normalizeShortcut normalizes letters, space, and ignores Escape/Shift', () => {
  assert.equal(normalizeShortcut('q'), 'Q');
  assert.equal(normalizeShortcut(' ', 'Space'), 'Space');
  assert.equal(normalizeShortcut('f3'), 'F3');
  assert.equal(normalizeShortcut('Escape'), '');
  assert.equal(normalizeShortcut('Shift'), '');
});

test('findShortcutConflict detects duplicate shortcuts case-insensitively and respects excludeId', () => {
  const conflict = findShortcutConflict(sampleSounds, 'space');
  assert.equal(conflict?.id, 's3');

  const selfIgnored = findShortcutConflict(sampleSounds, 'Space', 's3');
  assert.equal(selfIgnored, null);

  const unique = findShortcutConflict(sampleSounds, '9');
  assert.equal(unique, null);
});

test('buildShortcutInventory tracks 1-0, A-Z, Space, and extra keys', () => {
  const extended: SoundPad[] = [
    ...sampleSounds,
    {
      id: 's4',
      title: 'Extra F2',
      categoryId: 'cat-positive',
      order: 3,
      color: '#2563EB',
      shortcut: 'F2',
      playbackMode: 'retrigger',
      synthPreset: 'air-horn',
      boardId: 'default',
    },
  ];
  const inv = buildShortcutInventory(extended);
  assert.equal(inv.totalStandardKeys, 37);
  assert.equal(inv.takenStandardCount, 3);
  assert.equal(inv.availableStandardCount, 34);
  assert.equal(inv.numberKeys.find((k) => k.key === '1')?.sound?.id, 's1');
  assert.equal(inv.numberKeys.find((k) => k.key === '2')?.sound?.id, 's2');
  assert.equal(inv.numberKeys.find((k) => k.key === '3')?.sound, null);
  assert.equal(inv.spaceKey.sound?.id, 's3');
  assert.equal(inv.extraMapped.length, 1);
  assert.equal(inv.extraMapped[0].key, 'F2');
});

test('filterSoundsByCategory returns sorted items for All or specific category', () => {
  const reversed = [...sampleSounds].reverse();
  const all = filterSoundsByCategory(reversed, 'all');
  assert.deepEqual(
    all.map((s) => s.id),
    ['s1', 's2', 's3']
  );

  const pos = filterSoundsByCategory(reversed, 'cat-positive');
  assert.deepEqual(
    pos.map((s) => s.id),
    ['s1', 's2']
  );
});

test('reorderPads swaps two pads 1-for-1 without shifting intermediate pads', () => {
  const { all, changed } = reorderPads(sampleSounds, 's3', 's1');
  assert.deepEqual(
    all.map((s) => `${s.id}:${s.order}:${s.categoryId}`),
    ['s3:0:cat-negative', 's2:1:cat-positive', 's1:2:cat-positive']
  );
  assert.deepEqual(
    changed.map((s) => s.id),
    ['s3', 's1']
  );
});

test('movePadToCategory moves a pad into a new category and returns changed entries', () => {
  const { all, changed } = movePadToCategory(sampleSounds, 's1', 'cat-negative');
  const moved = all.find((s) => s.id === 's1');
  assert.equal(moved?.categoryId, 'cat-negative');
  assert.equal(moved?.order, 2);
  assert.ok(changed.length >= 1);
});

test('validateSoundInput enforces blueprint bounds and audio source presence', () => {
  assert.equal(
    validateSoundInput({
      title: '',
      categoryId: 'cat-positive',
      color: '#DC2626',
      shortcut: '1',
      playbackMode: 'retrigger',
      synthPreset: 'air-horn',
    }),
    'Sound name is required.'
  );

  assert.equal(
    validateSoundInput({
      title: 'Test Sound',
      categoryId: 'cat-positive',
      color: 'not-hex',
      shortcut: '1',
      playbackMode: 'retrigger',
      synthPreset: 'air-horn',
    }),
    'Please choose a valid hex color.'
  );

  assert.equal(
    validateSoundInput({
      title: 'No Source',
      categoryId: 'cat-positive',
      color: '#DC2626',
      shortcut: '1',
      playbackMode: 'retrigger',
      audioUrl: '',
      synthPreset: '',
    }),
    'Upload an audio file, paste an audio URL, or pick a built-in synth effect.'
  );

  assert.equal(
    validateSoundInput({
      title: 'Valid Pad',
      categoryId: 'cat-positive',
      color: '#DC2626',
      shortcut: '1',
      playbackMode: 'retrigger',
      synthPreset: 'air-horn',
    }),
    null
  );

  assert.equal(
    validateSoundInput({
      title: 'Applause Gate',
      categoryId: 'cat-positive',
      color: '#16A34A',
      shortcut: 'G',
      playbackMode: 'gate',
      synthPreset: 'swish-chime',
    }),
    null
  );

  assert.equal(
    validateSoundInput({
      title: 'Bad Trim',
      categoryId: 'cat-positive',
      color: '#16A34A',
      shortcut: 'T',
      playbackMode: 'retrigger',
      audioUrl: 'https://example.com/clip.mp3',
      clipStartSec: 4,
      clipEndSec: 2,
    }),
    'Trim end time must be greater than start time.'
  );
});

test('computeClipSegment clamps start and end times cleanly', () => {
  assert.deepEqual(computeClipSegment(10, 0, 0), {
    startSec: 0,
    endSec: 10,
    durationSec: 10,
  });
  assert.deepEqual(computeClipSegment(10, 1.5, 4.25), {
    startSec: 1.5,
    endSec: 4.25,
    durationSec: 2.75,
  });
  assert.deepEqual(computeClipSegment(5, 8, 12), {
    startSec: 4.95,
    endSec: 5,
    durationSec: 0.05,
  });
});

test('validateCategoryName rejects reserved All and duplicates', () => {
  assert.equal(validateCategoryName('All', sampleCategories), '"All" is a reserved view name.');
  assert.equal(validateCategoryName('positive', sampleCategories), 'A category with that name already exists.');
  assert.equal(validateCategoryName('Timeouts', sampleCategories), null);
});

test('checkAdminPassword validates default and custom passwords', () => {
  assert.equal(checkAdminPassword('hoops2026', 'hoops2026'), true);
  assert.equal(checkAdminPassword(' hoops2026 ', 'hoops2026'), true);
  assert.equal(checkAdminPassword('wrong', 'hoops2026'), false);
});

test('buildExportPayload creates sorted backup structure and createSafeId matches pattern', () => {
  const payload = buildExportPayload(sampleCategories, sampleSounds);
  assert.equal(payload.version, 1);
  assert.equal(payload.categories.length, 2);
  assert.equal(payload.sounds.length, 3);
  const id = createSafeId('snd');
  assert.match(id, /^[a-zA-Z0-9_-]+$/);
});

test('isSupportedAudioFile accepts mp3, wav, ogg, m4a and rejects pdf/png', () => {
  assert.equal(isSupportedAudioFile({ name: 'horn.mp3' }), true);
  assert.equal(isSupportedAudioFile({ name: 'cheer.WAV' }), true);
  assert.equal(isSupportedAudioFile({ name: 'clip.ogg' }), true);
  assert.equal(isSupportedAudioFile({ name: 'intro.m4a' }), true);
  assert.equal(isSupportedAudioFile({ name: 'roster.pdf' }), false);
});
