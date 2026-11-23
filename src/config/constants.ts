import type { Category, PaletteColorOption, SoundPad, SynthPresetId } from '../types/soundboard';

// Easily configure the admin unlock password via VITE_ADMIN_PASSWORD or edit the fallback here:
const envPassword =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_ADMIN_PASSWORD;

export const ADMIN_PASSWORD: string = envPassword || 'hoops2026';

export const SESSION_ADMIN_KEY = 'courtboard_admin_unlocked';
export const BOARD_ID = 'default';

export const TITLE_MAX_LENGTH = 60;
export const CATEGORY_NAME_MAX_LENGTH = 40;
export const SHORTCUT_MAX_LENGTH = 16;
export const AUDIO_URL_MAX_LENGTH = 2048;
export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const PALETTE_COLORS: PaletteColorOption[] = [
  {
    id: 'cardinal',
    name: 'Cardinal',
    hex: '#862633',
    bottomHex: '#591720',
    textHex: '#FFFFFF',
    badgeBg: 'rgba(18, 23, 29, 0.45)',
    badgeText: '#FFFFFF',
  },
  {
    id: 'gold',
    name: 'Gold',
    hex: '#FFCD00',
    bottomHex: '#C29B00',
    textHex: '#1D252D',
    badgeBg: 'rgba(29, 37, 45, 0.16)',
    badgeText: '#1D252D',
  },
  {
    id: 'grey',
    name: 'Grey',
    hex: '#9EA2A2',
    bottomHex: '#6E7373',
    textHex: '#1D252D',
    badgeBg: 'rgba(29, 37, 45, 0.16)',
    badgeText: '#1D252D',
  },
  {
    id: 'anthracite',
    name: 'Anthracite',
    hex: '#1D252D',
    bottomHex: '#10151A',
    textHex: '#F5F6F7',
    badgeBg: 'rgba(0, 0, 0, 0.45)',
    badgeText: '#F5F6F7',
  },
  {
    id: 'blue',
    name: 'Blue',
    hex: '#2563EB',
    bottomHex: '#1E40AF',
    textHex: '#FFFFFF',
    badgeBg: 'rgba(18, 23, 29, 0.4)',
    badgeText: '#FFFFFF',
  },
  {
    id: 'green',
    name: 'Green',
    hex: '#16A34A',
    bottomHex: '#166534',
    textHex: '#FFFFFF',
    badgeBg: 'rgba(18, 23, 29, 0.4)',
    badgeText: '#FFFFFF',
  },
  {
    id: 'purple',
    name: 'Purple',
    hex: '#7C3AED',
    bottomHex: '#5B21B6',
    textHex: '#FFFFFF',
    badgeBg: 'rgba(18, 23, 29, 0.4)',
    badgeText: '#FFFFFF',
  },
];

export const SYNTH_PRESETS: { id: Exclude<SynthPresetId, ''>; label: string; durationLabel: string }[] = [
  { id: 'air-horn', label: 'Stadium Air Horn', durationLabel: '1.1s' },
  { id: 'swish-chime', label: '3-Pointer Swish Chime', durationLabel: '0.9s' },
  { id: 'charge-organ', label: 'Arena Charge Organ', durationLabel: '2.1s' },
  { id: 'hype-siren', label: 'Hype Tip-Off Siren', durationLabel: '3.2s' },
  { id: 'buzzer', label: 'Shot Clock Buzzer', durationLabel: '1.2s' },
  { id: 'sad-trombone', label: 'Turnover Wah-Wah', durationLabel: '1.8s' },
  { id: 'brick-clank', label: 'Rim Brick Clank', durationLabel: '0.7s' },
  { id: 'defense-stomp', label: 'Defense Stomp Beat', durationLabel: '2.8s' },
  { id: 'walkup-riff', label: 'Starter Intro Fanfare', durationLabel: '2.4s' },
  { id: 'mvp-fanfare', label: 'MVP Bucket Stinger', durationLabel: '1.6s' },
];

export const STARTER_CATEGORIES: Category[] = [
  { id: 'cat-positive', name: 'Positive', order: 0, boardId: BOARD_ID },
  { id: 'cat-negative', name: 'Negative', order: 1, boardId: BOARD_ID },
  { id: 'cat-players', name: 'Players', order: 2, boardId: BOARD_ID },
];

export const STARTER_SOUNDS: SoundPad[] = [
  // Positive
  {
    id: 'snd-air-horn',
    title: 'Air Horn',
    categoryId: 'cat-positive',
    order: 0,
    color: '#862633',
    shortcut: '1',
    playbackMode: 'retrigger',
    synthPreset: 'air-horn',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  {
    id: 'snd-three-swish',
    title: '3-Point Swish',
    categoryId: 'cat-positive',
    order: 1,
    color: '#FFCD00',
    shortcut: '2',
    playbackMode: 'retrigger',
    synthPreset: 'swish-chime',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  {
    id: 'snd-charge-organ',
    title: 'Charge Organ',
    categoryId: 'cat-positive',
    order: 2,
    color: '#9EA2A2',
    shortcut: '3',
    playbackMode: 'retrigger',
    synthPreset: 'charge-organ',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  {
    id: 'snd-hype-siren',
    title: 'Tip-Off Hype',
    categoryId: 'cat-positive',
    order: 3,
    color: '#FFCD00',
    shortcut: 'Space',
    playbackMode: 'toggle',
    synthPreset: 'hype-siren',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  // Negative
  {
    id: 'snd-shot-buzzer',
    title: 'Shot Clock Buzzer',
    categoryId: 'cat-negative',
    order: 4,
    color: '#862633',
    shortcut: '4',
    playbackMode: 'retrigger',
    synthPreset: 'buzzer',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  {
    id: 'snd-defense-stomp',
    title: 'Defense Stomp',
    categoryId: 'cat-negative',
    order: 5,
    color: '#1D252D',
    shortcut: '5',
    playbackMode: 'toggle',
    synthPreset: 'defense-stomp',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  {
    id: 'snd-turnover-wah',
    title: 'Turnover Wah-Wah',
    categoryId: 'cat-negative',
    order: 6,
    color: '#862633',
    shortcut: '6',
    playbackMode: 'retrigger',
    synthPreset: 'sad-trombone',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  {
    id: 'snd-brick-clank',
    title: 'Rim Brick',
    categoryId: 'cat-negative',
    order: 7,
    color: '#9EA2A2',
    shortcut: '7',
    playbackMode: 'retrigger',
    synthPreset: 'brick-clank',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  // Players
  {
    id: 'snd-starter-intro',
    title: 'Starter Walk-Up',
    categoryId: 'cat-players',
    order: 8,
    color: '#1D252D',
    shortcut: 'Q',
    playbackMode: 'toggle',
    synthPreset: 'walkup-riff',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
  {
    id: 'snd-mvp-bucket',
    title: 'Captain Bucket',
    categoryId: 'cat-players',
    order: 9,
    color: '#FFCD00',
    shortcut: 'W',
    playbackMode: 'retrigger',
    synthPreset: 'mvp-fanfare',
    audioUrl: '',
    storagePath: '',
    boardId: BOARD_ID,
  },
];

export function getPaletteForColor(hex: string): PaletteColorOption {
  const found = PALETTE_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  if (found) return found;
  return {
    id: 'custom',
    name: 'Custom',
    hex,
    bottomHex: '#12171D',
    textHex: '#FFFFFF',
    badgeBg: 'rgba(18, 23, 29, 0.42)',
    badgeText: '#FFFFFF',
  };
}
