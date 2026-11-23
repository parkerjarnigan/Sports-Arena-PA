import { ArrowLeft, ArrowRight, GripVertical, Hand, Keyboard, Play, Repeat, Settings } from 'lucide-react';
import { getPaletteForColor } from '../config/constants';
import type { ActivePlaybackInfo, SoundPad } from '../types/soundboard';

interface SoundPadTileProps {
  sound: SoundPad;
  categoryName?: string;
  showCategoryLabel?: boolean;
  playback?: ActivePlaybackInfo;
  reorderMode: boolean;
  isAdminUnlocked: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isShortcutSpotlighted?: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onTrigger: (sound: SoundPad) => void;
  onStop: (soundId: string) => void;
  onEdit: (sound: SoundPad) => void;
  onPadPointerDown: (
    e: React.PointerEvent<HTMLElement>,
    sound: SoundPad,
    fromHandle: boolean
  ) => void;
  onStepMove: (soundId: string, direction: -1 | 1) => void;
  onHoverSound?: (soundId: string | null) => void;
}

export function SoundPadTile({
  sound,
  categoryName,
  showCategoryLabel,
  playback,
  reorderMode,
  isAdminUnlocked,
  isDragging,
  isDropTarget,
  isShortcutSpotlighted = false,
  canMoveLeft,
  canMoveRight,
  onTrigger,
  onStop,
  onEdit,
  onPadPointerDown,
  onStepMove,
  onHoverSound,
}: SoundPadTileProps) {
  const palette = getPaletteForColor(sound.color);
  const isPlaying = Boolean(playback);
  const progress = playback?.progress ?? 0;
  const hasShortcut = Boolean(sound.shortcut.trim());

  return (
    <div
      data-testid={`sound-pad-${sound.id}`}
      data-pad-id={sound.id}
      data-shortcut-state={hasShortcut ? 'mapped' : 'unmapped'}
      data-spotlighted={isShortcutSpotlighted ? 'true' : 'false'}
      onMouseEnter={() => {
        if (reorderMode && hasShortcut) onHoverSound?.(sound.id);
      }}
      onMouseLeave={() => {
        if (reorderMode && hasShortcut) onHoverSound?.(null);
      }}
      className={`relative group rounded-xl select-none transition-transform ${
        isDragging ? 'opacity-25 scale-[0.96]' : ''
      } ${isDropTarget ? 'ring-2 ring-[#FFCD00] ring-offset-2 ring-offset-[#9EA2A2]' : ''}`}
    >
      <button
        type="button"
        onPointerDown={(e) => onPadPointerDown(e, sound, false)}
        onKeyDown={(e) => {
          if (reorderMode || sound.playbackMode !== 'gate') return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!e.repeat) {
              onTrigger(sound);
            }
          }
        }}
        onKeyUp={(e) => {
          if (sound.playbackMode !== 'gate') return;
          if (e.key === 'Enter' || e.key === ' ') {
            onStop(sound.id);
          }
        }}
        onBlur={() => {
          if (sound.playbackMode === 'gate') {
            onStop(sound.id);
          }
        }}
        onContextMenu={(e) => {
          if (sound.playbackMode === 'gate' && !reorderMode) {
            e.preventDefault();
          }
        }}
        onClick={(e) => {
          // Pointer taps are handled on pointerup in App so hold-to-drag never triggers playback.
          // Keyboard activation (Enter / Space when focused) has e.detail === 0.
          if (e.detail === 0 && !reorderMode && sound.playbackMode !== 'gate') {
            onTrigger(sound);
          }
        }}
        style={{
          backgroundColor: palette.hex,
          borderBottomColor: palette.bottomHex,
          color: palette.textHex,
          touchAction: reorderMode ? 'none' : 'manipulation',
        }}
        className={`sound-pad-surface relative w-full aspect-[4/3] sm:aspect-square rounded-xl border-b-4 p-3.5 flex flex-col justify-between text-left overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCD00] transition-opacity ${
          reorderMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:brightness-110'
        } ${
          isShortcutSpotlighted
            ? 'ring-2 ring-[#FFCD00] ring-offset-2 ring-offset-[#9EA2A2] shadow-[0_0_24px_rgba(255,205,0,0.5)]'
            : isPlaying
              ? 'ring-2 ring-white shadow-[0_0_24px_rgba(255,255,255,0.45)]'
              : reorderMode && hasShortcut
                ? 'ring-2 ring-white/85 shadow-lg shadow-black/30'
                : reorderMode && !hasShortcut
                  ? 'opacity-75 hover:opacity-100 shadow-md shadow-black/25'
                  : palette.hex.toLowerCase() === '#9ea2a2'
                    ? 'ring-1 ring-[#1D252D]/35 shadow-md shadow-black/25'
                    : 'shadow-md shadow-black/30'
        }`}
        aria-label={`Play ${sound.title}${sound.shortcut ? `, shortcut ${sound.shortcut}` : ''}`}
      >
        {/* Top Row: Drag Handle (top-left, visible when grid is unlocked) + Keyboard Shortcut Badge (top-right) */}
        <div className="w-full flex items-start justify-between gap-2">
          {reorderMode ? (
            <span
              onPointerDown={(e) => {
                e.stopPropagation();
                onPadPointerDown(e, sound, true);
              }}
              title="Drag to swap"
              aria-hidden="true"
              style={{ touchAction: 'none' }}
              className="inline-flex items-center justify-center w-7 h-7 -m-0.5 rounded cursor-grab active:cursor-grabbing opacity-95 bg-black/25 transition-opacity"
            >
              <GripVertical className="w-4 h-4" />
            </span>
          ) : (
            <span className="h-6" />
          )}

          {sound.shortcut ? (
            <kbd
              style={
                reorderMode
                  ? undefined
                  : {
                      backgroundColor: palette.badgeBg,
                      color: palette.badgeText,
                    }
              }
              className={
                reorderMode
                  ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-bold tracking-tight border border-white/50 bg-[#12171D]/85 text-white shadow-sm shrink-0'
                  : 'px-2 py-0.5 rounded-md font-mono text-xs font-bold tracking-tight border border-white/15 shrink-0'
              }
            >
              {reorderMode && <Keyboard className="w-3 h-3 text-[#FFCD00] shrink-0" />}
              <span>{sound.shortcut}</span>
            </kbd>
          ) : reorderMode ? (
            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-medium border border-dashed border-[#9EA2A2]/60 bg-[#12171D]/70 text-[#F5F6F7] opacity-90 shrink-0">
              No key
            </span>
          ) : (
            <span className="h-5" />
          )}
        </div>

        {/* Center: Sound Name */}
        <div className="w-full flex-1 flex flex-col items-center justify-center px-1 text-center">
          <span className="font-display text-xl sm:text-2xl font-extrabold leading-[1.1] tracking-wide line-clamp-2 break-words">
            {sound.title}
          </span>
          {showCategoryLabel && categoryName && (
            <span className="mt-1 text-[11px] font-medium opacity-75 truncate max-w-full">
              {categoryName}
            </span>
          )}
        </div>

        {/* Bottom Row: Playback Mode micro-label */}
        <div className="w-full flex items-center justify-between gap-2 pr-8">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold opacity-80">
            {sound.playbackMode === 'toggle' ? (
              <Repeat className="w-3 h-3 shrink-0" />
            ) : sound.playbackMode === 'gate' ? (
              <Hand className="w-3 h-3 shrink-0" />
            ) : (
              <Play className="w-3 h-3 shrink-0" />
            )}
            <span>
              {sound.playbackMode === 'toggle'
                ? 'Toggle'
                : sound.playbackMode === 'gate'
                  ? 'Gate'
                  : 'Retrigger'}
            </span>
          </span>
        </div>

        {/* Bottom Playback Progress Bar */}
        {isPlaying && (
          <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-black/35 overflow-hidden">
            <div
              className="h-full bg-white origin-left transition-transform duration-75"
              style={{ transform: `scaleX(${Math.max(0.04, progress)})` }}
            />
          </div>
        )}
      </button>

      {/* Admin Edit Gear Icon (bottom-right) */}
      {isAdminUnlocked && !reorderMode && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(sound);
          }}
          aria-label={`Edit ${sound.title}`}
          data-testid={`edit-sound-${sound.id}`}
          style={{
            backgroundColor: palette.badgeBg,
            color: palette.badgeText,
          }}
          className="absolute bottom-2.5 right-2.5 min-h-[36px] min-w-[36px] rounded-lg inline-flex items-center justify-center hover:scale-105 hover:bg-black/55 transition-all cursor-pointer border border-white/15"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}

      {/* Reorder Mode Quick Step Controls (bottom-right) for touch/keyboard accessibility */}
      {reorderMode && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-2.5 right-2.5 flex items-center gap-1"
        >
          <button
            type="button"
            disabled={!canMoveLeft}
            onClick={(e) => {
              e.stopPropagation();
              onStepMove(sound.id, -1);
            }}
            aria-label={`Move ${sound.title} earlier`}
            className="min-h-[32px] min-w-[32px] rounded-md bg-black/55 text-white hover:bg-black/75 disabled:opacity-30 inline-flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canMoveRight}
            onClick={(e) => {
              e.stopPropagation();
              onStepMove(sound.id, 1);
            }}
            aria-label={`Move ${sound.title} later`}
            className="min-h-[32px] min-w-[32px] rounded-md bg-black/55 text-white hover:bg-black/75 disabled:opacity-30 inline-flex items-center justify-center cursor-pointer"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
