import { Keyboard } from 'lucide-react';
import { useMemo } from 'react';
import type { SoundPad } from '../types/soundboard';
import { buildShortcutInventory, type ShortcutKeyEntry } from '../utils/soundboardLogic';

interface ShortcutKeyMapProps {
  sounds: SoundPad[];
  categoryMap: Record<string, string>;
  activeCategoryId: string;
  spotlightedSoundId: string | null;
  onSpotlightSound: (soundId: string | null) => void;
}

export function ShortcutKeyMap({
  sounds,
  categoryMap,
  activeCategoryId,
  spotlightedSoundId,
  onSpotlightSound,
}: ShortcutKeyMapProps) {
  const inventory = useMemo(() => buildShortcutInventory(sounds), [sounds]);

  const spotlightedSound = useMemo(
    () => (spotlightedSoundId ? sounds.find((s) => s.id === spotlightedSoundId) ?? null : null),
    [sounds, spotlightedSoundId]
  );

  const renderKeyCap = (entry: ShortcutKeyEntry, isWide = false) => {
    const isSpotlighted = Boolean(entry.sound && entry.sound.id === spotlightedSoundId);

    if (!entry.sound) {
      return (
        <span
          key={entry.key}
          title={`${entry.key} — Available`}
          aria-label={`Key ${entry.key}, available`}
          className={`inline-flex items-center justify-center h-7 rounded-md border border-[#313D49] bg-[#12171D] font-mono text-[11px] font-medium text-[#9EA2A2] select-none ${
            isWide ? 'px-3 min-w-[64px]' : 'w-7'
          }`}
        >
          {entry.key}
        </span>
      );
    }

    const mappedSound = entry.sound;
    const catName = categoryMap[mappedSound.categoryId];

    return (
      <button
        key={entry.key}
        type="button"
        onMouseEnter={() => onSpotlightSound(mappedSound.id)}
        onMouseLeave={() => onSpotlightSound(null)}
        onFocus={() => onSpotlightSound(mappedSound.id)}
        onBlur={() => onSpotlightSound(null)}
        onClick={() =>
          onSpotlightSound(spotlightedSoundId === mappedSound.id ? null : mappedSound.id)
        }
        title={`${entry.key} → ${mappedSound.title}${catName ? ` (${catName})` : ''}`}
        aria-label={`Key ${entry.key}, assigned to ${mappedSound.title}`}
        aria-pressed={isSpotlighted}
        className={`relative inline-flex items-center justify-center gap-1.5 h-7 rounded-md border font-mono text-[11px] font-bold transition-colors cursor-pointer ${
          isWide ? 'px-3 min-w-[64px]' : 'min-w-[28px] px-1.5'
        } ${
          isSpotlighted
            ? 'bg-[#FFCD00] text-[#1D252D] border-[#FFE57A] ring-2 ring-[#FFCD00]/60'
            : 'bg-[#26303A] text-[#F5F6F7] border-[#9EA2A2]/50 hover:border-[#FFCD00] hover:bg-[#2F3B47]'
        }`}
      >
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: isSpotlighted ? '#1D252D' : mappedSound.color }}
        />
        <span>{entry.key}</span>
      </button>
    );
  };

  const spotlightOutsideCategory = Boolean(
    spotlightedSound &&
      activeCategoryId !== 'all' &&
      spotlightedSound.categoryId !== activeCategoryId
  );

  return (
    <section
      data-testid="shortcut-key-map"
      aria-label="Keyboard shortcut map"
      className="rounded-xl bg-[#1D252D] border border-[#313D49] px-3.5 py-3 space-y-2.5"
    >
      {/* Header Row: Title + Clean Tabular Metadata + Live Hover Readout */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#F5F6F7] whitespace-nowrap">
            <Keyboard className="w-3.5 h-3.5 text-[#FFCD00] shrink-0" />
            <span>Shortcut Map</span>
          </span>
          <span className="text-[#52606E]" aria-hidden="true">
            ·
          </span>
          <span className="font-mono tabular-nums text-[#E2E5E8]">
            Taken {inventory.takenStandardCount}/{inventory.totalStandardKeys}
          </span>
          <span className="text-[#52606E]" aria-hidden="true">
            ·
          </span>
          <span className="font-mono tabular-nums text-[#9EA2A2]">
            Available {inventory.availableStandardCount}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] min-h-[18px]">
          {spotlightedSound ? (
            <span className="text-[#F5F6F7] font-medium">
              <span className="font-mono font-bold text-[#FFCD00]">
                {spotlightedSound.shortcut || 'Unmapped'}
              </span>
              <span className="mx-1.5 text-[#9EA2A2]" aria-hidden="true">
                →
              </span>
              <span>{spotlightedSound.title}</span>
              {categoryMap[spotlightedSound.categoryId] && (
                <>
                  <span className="mx-1.5 text-[#52606E]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[#9EA2A2]">
                    {categoryMap[spotlightedSound.categoryId]}
                    {spotlightOutsideCategory ? ' (switch tab to view tile)' : ''}
                  </span>
                </>
              )}
            </span>
          ) : (
            <div className="flex items-center gap-3 text-[#9EA2A2]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#26303A] border border-[#9EA2A2]/60" />
                <span>Taken (hover to locate)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#12171D] border border-[#313D49]" />
                <span>Available</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Key Rows: 1-0, A-Z, Space (+ any extra keys like F1-F12) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Number keys">
          {inventory.numberKeys.map((entry) => renderKeyCap(entry))}
        </div>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Letter keys">
          {inventory.letterKeys.map((entry) => renderKeyCap(entry))}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Space key">
          {renderKeyCap(inventory.spaceKey, true)}
        </div>

        {inventory.extraMapped.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1 pl-2 border-l border-[#313D49]"
            role="group"
            aria-label="Other assigned keys"
          >
            {inventory.extraMapped.map((entry) => renderKeyCap(entry, true))}
          </div>
        )}
      </div>
    </section>
  );
}
