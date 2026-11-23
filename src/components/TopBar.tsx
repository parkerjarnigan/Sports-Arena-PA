import {
  CheckCircle2,
  Download,
  HardDriveDownload,
  Lock,
  Move,
  OctagonX,
  ShieldCheck,
  Unlock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState } from 'react';
import type { PreloadState } from '../types/soundboard';

const WILDCAT_LOGO_PATH =
  '/assets/aistudio/ORHS_Wildcat_-_Jarnigan_Cardinal_Gray_re-render_988d7c65.png';

interface TopBarProps {
  activeSoundCount: number;
  volume: number;
  muted: boolean;
  reorderMode: boolean;
  isAdminUnlocked: boolean;
  preloadState: PreloadState;
  onStopAll: () => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onPreloadOffline: () => void;
  onToggleReorderMode: () => void;
  onToggleAdmin: () => void;
  onExportBackup: () => void;
}

export function TopBar({
  activeSoundCount,
  volume,
  muted,
  reorderMode,
  isAdminUnlocked,
  preloadState,
  onStopAll,
  onVolumeChange,
  onToggleMute,
  onPreloadOffline,
  onToggleReorderMode,
  onToggleAdmin,
  onExportBackup,
}: TopBarProps) {
  const [logoError, setLogoError] = useState(false);
  const volumePercent = muted ? 0 : Math.round(volume * 100);

  return (
    <header className="sm:sticky sm:top-0 z-30 bg-gradient-to-r from-[#9EA2A2] to-[#862633] border-b border-[#1D252D]/35 shadow-sm">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand Emblem + STOP ALL Panic Control */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <div className="flex items-center gap-2.5 shrink-0">
            {!logoError ? (
              <img
                src={WILDCAT_LOGO_PATH}
                alt="Wildcat mascot emblem"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                className="h-11 w-11 sm:h-12 sm:w-12 object-contain shrink-0 drop-shadow-[0_1px_2px_rgba(29,37,45,0.35)]"
              />
            ) : (
              <span
                aria-hidden="true"
                className="h-11 w-11 rounded-lg bg-[#1D252D] text-[#FFCD00] font-display text-2xl font-extrabold inline-flex items-center justify-center shrink-0"
              >
                W
              </span>
            )}
            <span className="font-display text-2xl sm:text-[26px] font-extrabold tracking-wide text-[#1D252D] whitespace-nowrap shrink-0">
              WILDCAT ARENA <span className="text-[#862633]">PA</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onStopAll}
            data-testid="stop-all-button"
            className={`min-h-[44px] px-4 sm:px-5 rounded-lg font-display font-bold text-base sm:text-lg tracking-wide inline-flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 border-b-2 ${
              activeSoundCount > 0
                ? 'bg-[#DC2626] hover:bg-[#EF4444] border-[#7F1D1D] text-white ring-2 ring-[#FFCD00] shadow-[0_0_20px_rgba(220,38,38,0.5)]'
                : 'bg-[#B91C1C] hover:bg-[#DC2626] border-[#7F1D1D] text-white ring-1 ring-[#1D252D]/35 shadow-sm'
            }`}
            aria-label="Stop all playing sounds (Escape)"
          >
            <OctagonX className="w-5 h-5 shrink-0" />
            <span>STOP ALL</span>
            <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded bg-[#12171D]/50 text-white/95">
              ESC
            </kbd>
          </button>
        </div>

        {/* Operator Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Master Volume */}
          <div className="flex items-center gap-2 bg-[#1D252D] border border-[#10151A]/60 rounded-lg px-2.5 min-h-[44px] shadow-sm">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute master volume' : 'Mute master volume'}
              className="p-1 text-[#9EA2A2] hover:text-white transition-colors cursor-pointer"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-[#FFCD00]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#F5F6F7]" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
              aria-label="Master volume"
              className="w-20 sm:w-24 accent-[#FFCD00] cursor-pointer"
            />
            <span className="w-9 text-right text-xs font-mono tabular-nums text-[#E2E5E8]">
              {volumePercent}%
            </span>
          </div>

          {/* Preload Audio for Offline */}
          <button
            type="button"
            onClick={onPreloadOffline}
            disabled={preloadState.status === 'loading'}
            className={`min-h-[44px] px-3 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-2 border transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm ${
              preloadState.status === 'ready'
                ? 'bg-[#1D252D] border-emerald-400 text-emerald-300 hover:bg-[#26303A]'
                : 'bg-[#1D252D] border-[#10151A]/60 text-[#F5F6F7] hover:bg-[#26303A]'
            }`}
          >
            {preloadState.status === 'ready' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <HardDriveDownload className="w-4 h-4 text-[#9EA2A2] shrink-0" />
            )}
            <span>
              {preloadState.status === 'loading'
                ? `Caching ${preloadState.loaded}/${preloadState.total}`
                : preloadState.status === 'ready'
                  ? `Cached (${preloadState.loaded})`
                  : 'Preload Audio for Offline'}
            </span>
          </button>

          {/* Unlock Grid vs Lock Grid Switch */}
          <button
            type="button"
            onClick={onToggleReorderMode}
            role="switch"
            aria-checked={reorderMode}
            data-testid="reorder-mode-toggle"
            className={`min-h-[44px] px-3 rounded-lg text-xs sm:text-sm inline-flex items-center gap-2 border transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm ${
              reorderMode
                ? 'bg-[#FFCD00] border-[#C29B00] text-[#1D252D] font-bold hover:bg-[#FFD633]'
                : 'bg-[#1D252D] border-[#10151A]/60 text-[#F5F6F7] font-medium hover:bg-[#26303A]'
            }`}
          >
            {reorderMode ? (
              <Lock className="w-4 h-4 text-[#1D252D] shrink-0" />
            ) : (
              <Move className="w-4 h-4 text-[#9EA2A2] shrink-0" />
            )}
            <span>{reorderMode ? 'Lock Grid' : 'Unlock Grid'}</span>
          </button>

          {/* Admin Unlock / Lock */}
          <button
            type="button"
            onClick={onToggleAdmin}
            data-testid="admin-auth-button"
            className={`min-h-[44px] px-3 rounded-lg text-xs sm:text-sm font-medium inline-flex items-center gap-2 border transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm ${
              isAdminUnlocked
                ? 'bg-[#1D252D] border-[#FFCD00] text-[#FFCD00] hover:bg-[#26303A]'
                : 'bg-[#1D252D] border-[#10151A]/60 text-[#F5F6F7] hover:bg-[#26303A]'
            }`}
          >
            {isAdminUnlocked ? (
              <ShieldCheck className="w-4 h-4 text-[#FFCD00] shrink-0" />
            ) : (
              <Unlock className="w-4 h-4 text-[#9EA2A2] shrink-0" />
            )}
            <span>{isAdminUnlocked ? 'Admin Unlocked' : 'Unlock Editing'}</span>
          </button>

          {/* Export JSON Backup */}
          <button
            type="button"
            onClick={onExportBackup}
            aria-label="Export soundboard backup JSON"
            title="Export JSON Backup"
            className="min-h-[44px] px-3 rounded-lg bg-[#1D252D] border border-[#10151A]/60 text-[#F5F6F7] hover:bg-[#26303A] text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
          >
            <Download className="w-4 h-4 text-[#9EA2A2] shrink-0" />
            <span className="hidden md:inline">Export</span>
          </button>
        </div>
      </div>
    </header>
  );
}
