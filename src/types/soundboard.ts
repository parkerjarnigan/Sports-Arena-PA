export type PlaybackMode = 'retrigger' | 'toggle' | 'gate';

export type SynthPresetId =
  | ''
  | 'air-horn'
  | 'buzzer'
  | 'swish-chime'
  | 'charge-organ'
  | 'defense-stomp'
  | 'sad-trombone'
  | 'brick-clank'
  | 'hype-siren'
  | 'walkup-riff'
  | 'mvp-fanfare';

export interface Category {
  id: string;
  name: string;
  order: number;
  boardId: string;
  updatedAt?: string;
}

export interface SoundPad {
  id: string;
  title: string;
  categoryId: string;
  order: number;
  color: string;
  shortcut: string;
  playbackMode: PlaybackMode;
  audioUrl?: string;
  storagePath?: string;
  synthPreset?: SynthPresetId;
  clipStartSec?: number;
  clipEndSec?: number;
  boardId: string;
  updatedAt?: string;
}

export interface PaletteColorOption {
  id: string;
  name: string;
  hex: string;
  bottomHex: string;
  textHex: string;
  badgeBg: string;
  badgeText: string;
}

export interface ActivePlaybackInfo {
  soundId: string;
  progress: number; // 0..1
  durationMs: number;
}

export interface PreloadState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  loaded: number;
  total: number;
  failed: number;
}

export interface BoardBackup {
  exportedAt: string;
  boardId: string;
  version: number;
  categories: Category[];
  sounds: SoundPad[];
}
