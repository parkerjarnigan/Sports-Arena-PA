import { GripVertical, Plus, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { AdminPasswordModal } from './components/AdminPasswordModal';
import { CategoryModal } from './components/CategoryModal';
import { CategoryTabs } from './components/CategoryTabs';
import { ShortcutKeyMap } from './components/ShortcutKeyMap';
import { SoundModal } from './components/SoundModal';
import { SoundPadTile } from './components/SoundPadTile';
import { TopBar } from './components/TopBar';
import { BOARD_ID, getPaletteForColor, SESSION_ADMIN_KEY } from './config/constants';
import {
  batchUpdateSoundOrder,
  deleteCategoryAndReassign,
  deleteSoundPad,
  saveCategory,
  saveSoundPad,
  subscribeBoardData,
  testConnection,
} from './firebase/client';
import type {
  ActivePlaybackInfo,
  Category,
  PreloadState,
  SoundPad,
} from './types/soundboard';
import {
  buildExportPayload,
  createSafeId,
  filterSoundsByCategory,
  isSupportedAudioFile,
  movePadToCategory,
  normalizeShortcut,
  reorderPads,
} from './utils/soundboardLogic';

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [sounds, setSounds] = useState<SoundPad[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [spotlightedSoundId, setSpotlightedSoundId] = useState<string | null>(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_ADMIN_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [activePlayback, setActivePlayback] = useState<Record<string, ActivePlaybackInfo>>({});
  const [preloadState, setPreloadState] = useState<PreloadState>({
    status: 'idle',
    loaded: 0,
    total: 0,
    failed: 0,
  });

  // Pointer drag-and-drop state
  const [draggingSoundId, setDraggingSoundId] = useState<string | null>(null);
  const [dropTargetSoundId, setDropTargetSoundId] = useState<string | null>(null);
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    sound: SoundPad;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [pageFileDragActive, setPageFileDragActive] = useState(false);

  const activeDragCleanupRef = useRef<(() => void) | null>(null);
  const activeGateKeysRef = useRef<Map<string, string>>(new Map());

  // Modals state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [queuedDroppedFile, setQueuedDroppedFile] = useState<File | null>(null);
  const [soundModalOpen, setSoundModalOpen] = useState(false);
  const [editingSound, setEditingSound] = useState<SoundPad | null>(null);
  const [droppedAudioFile, setDroppedAudioFile] = useState<File | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Check Firestore connection and subscribe to real-time updates
  useEffect(() => {
    testConnection().catch(() => {});

    const unsubscribe = subscribeBoardData(
      (cats) => {
        setCategories(cats);
        setLoading(false);
        setSyncError(null);
      },
      (snds) => {
        setSounds(snds);
        setLoading(false);
        setSyncError(null);
      },
      (err) => {
        setSyncError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to sound engine playback progress
  useEffect(() => {
    return soundEngine.subscribe((map) => setActivePlayback(map));
  }, []);

  // Keep master volume synced
  useEffect(() => {
    soundEngine.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    soundEngine.setMuted(muted);
  }, [muted]);

  // Dismiss notice banner automatically
  useEffect(() => {
    if (!noticeMessage) return;
    const t = setTimeout(() => setNoticeMessage(null), 4000);
    return () => clearTimeout(t);
  }, [noticeMessage]);

  useEffect(() => {
    if (!reorderMode) {
      setSpotlightedSoundId(null);
    }
  }, [reorderMode]);

  const anyModalOpen = adminModalOpen || soundModalOpen || categoryModalOpen;

  // Global keyboard shortcuts (including hold-and-release for Gate pads)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (anyModalOpen) {
          setAdminModalOpen(false);
          setSoundModalOpen(false);
          setCategoryModalOpen(false);
          soundEngine.stopSound('preview-pad');
          return;
        }
        e.preventDefault();
        activeGateKeysRef.current.clear();
        soundEngine.stopAll();
        return;
      }

      if (isTyping || anyModalOpen || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const normalized = normalizeShortcut(e.key, e.code);
      if (!normalized) return;

      const matched = sounds.find(
        (s) => s.shortcut.trim().toLowerCase() === normalized.toLowerCase()
      );
      if (matched) {
        if (normalized === 'Space') {
          e.preventDefault();
        }
        if (matched.playbackMode === 'gate') {
          if (e.repeat || activeGateKeysRef.current.has(normalized)) {
            return;
          }
          activeGateKeysRef.current.set(normalized, matched.id);
        }
        void soundEngine.trigger(matched);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const normalized = normalizeShortcut(e.key, e.code);
      if (!normalized) return;
      const soundId = activeGateKeysRef.current.get(normalized);
      if (soundId) {
        activeGateKeysRef.current.delete(normalized);
        soundEngine.stopSound(soundId);
      }
    };

    const handleBlur = () => {
      if (activeGateKeysRef.current.size === 0) return;
      for (const soundId of activeGateKeysRef.current.values()) {
        soundEngine.stopSound(soundId);
      }
      activeGateKeysRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [sounds, anyModalOpen]);

  // Page-level audio file drag-and-drop
  useEffect(() => {
    let dragCounter = 0;

    const hasFiles = (e: DragEvent) =>
      Boolean(e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files'));

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter += 1;
      setPageFileDragActive(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        setPageFileDragActive(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter = 0;
      setPageFileDragActive(false);

      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      if (!isSupportedAudioFile(file)) {
        setNoticeMessage('Unsupported file type. Drop an .mp3, .wav, .ogg, or .m4a audio file.');
        return;
      }

      if (!isAdminUnlocked) {
        setQueuedDroppedFile(file);
        setAdminModalOpen(true);
        return;
      }

      setEditingSound(null);
      setDroppedAudioFile(file);
      setSoundModalOpen(true);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [isAdminUnlocked]);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      map[c.id] = c.name;
    }
    return map;
  }, [categories]);

  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sounds) {
      counts[s.categoryId] = (counts[s.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [sounds]);

  const visibleSounds = useMemo(
    () => filterSoundsByCategory(sounds, activeCategoryId),
    [sounds, activeCategoryId]
  );

  const handleToggleAdmin = () => {
    if (isAdminUnlocked) {
      try {
        sessionStorage.removeItem(SESSION_ADMIN_KEY);
      } catch {
        // ignore storage errors
      }
      setIsAdminUnlocked(false);
      setNoticeMessage('Editing locked.');
    } else {
      setAdminModalOpen(true);
    }
  };

  const handleAdminUnlocked = () => {
    try {
      sessionStorage.setItem(SESSION_ADMIN_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setIsAdminUnlocked(true);
    setAdminModalOpen(false);
    if (queuedDroppedFile) {
      setEditingSound(null);
      setDroppedAudioFile(queuedDroppedFile);
      setQueuedDroppedFile(null);
      setSoundModalOpen(true);
    }
  };

  const handlePreloadOffline = async () => {
    const result = await soundEngine.preloadAll(sounds, setPreloadState);
    if (result.failed > 0) {
      setNoticeMessage(
        `Preloaded ${result.loaded} of ${result.total} sounds (${result.failed} remote file(s) failed).`
      );
    }
  };

  const handleExportBackup = () => {
    const payload = buildExportPayload(categories, sounds);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `courtboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setNoticeMessage('Board backup exported as JSON.');
  };

  const handleDropOnPad = useCallback(
    async (draggedId: string, targetSoundId: string) => {
      if (!draggedId || draggedId === targetSoundId) {
        return;
      }

      const { all, changed } = reorderPads(sounds, draggedId, targetSoundId);

      if (changed.length > 0) {
        setSounds(all);
        try {
          await batchUpdateSoundOrder(changed);
        } catch (err) {
          setNoticeMessage(err instanceof Error ? err.message : 'Failed to save pad order.');
        }
      }
    },
    [sounds]
  );

  const handleDropOnCategory = useCallback(
    async (soundId: string, targetCategoryId: string) => {
      const { all, changed } = movePadToCategory(sounds, soundId, targetCategoryId);
      if (changed.length > 0) {
        setSounds(all);
        try {
          await batchUpdateSoundOrder(changed);
          setNoticeMessage(`Moved sound to ${categoryMap[targetCategoryId] || 'category'}.`);
        } catch (err) {
          setNoticeMessage(err instanceof Error ? err.message : 'Failed to move sound.');
        }
      }
    },
    [sounds, categoryMap]
  );

  useEffect(() => {
    return () => {
      activeDragCleanupRef.current?.();
    };
  }, []);

  const handlePadPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, sound: SoundPad, fromHandle: boolean) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      activeDragCleanupRef.current?.();

      // Gate mode on pad body when grid is locked:
      // Play immediately on press and stop immediately on release.
      if (sound.playbackMode === 'gate' && !reorderMode) {
        void soundEngine.trigger(sound);

        const releaseGate = () => {
          window.removeEventListener('pointerup', releaseGate);
          window.removeEventListener('pointercancel', releaseGate);
          soundEngine.stopSound(sound.id);
          activeDragCleanupRef.current = null;
        };

        activeDragCleanupRef.current = releaseGate;
        window.addEventListener('pointerup', releaseGate);
        window.addEventListener('pointercancel', releaseGate);
        return;
      }

      const startX = e.clientX;
      const startY = e.clientY;

      // When the grid is locked, tiles cannot be dragged or moved — only tapped to play.
      if (!reorderMode) {
        let movedTooFar = false;

        const onPointerMoveLocked = (moveEvt: PointerEvent) => {
          if (Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY) > 12) {
            movedTooFar = true;
          }
        };

        const cleanupLocked = () => {
          window.removeEventListener('pointermove', onPointerMoveLocked);
          window.removeEventListener('pointerup', onPointerUpLocked);
          window.removeEventListener('pointercancel', cleanupLocked);
          activeDragCleanupRef.current = null;
        };

        const onPointerUpLocked = () => {
          const shouldPlay = !movedTooFar;
          cleanupLocked();
          if (shouldPlay) {
            void soundEngine.trigger(sound);
          }
        };

        activeDragCleanupRef.current = cleanupLocked;
        window.addEventListener('pointermove', onPointerMoveLocked);
        window.addEventListener('pointerup', onPointerUpLocked);
        window.addEventListener('pointercancel', cleanupLocked);
        return;
      }

      const padEl = (e.currentTarget.closest('[data-pad-id]') as HTMLElement | null) || e.currentTarget;
      const rect = padEl.getBoundingClientRect();
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;

      let dragActive = false;
      let currentTargetPadId: string | null = null;
      let currentTargetCatId: string | null = null;

      const activateDrag = (clientX: number, clientY: number) => {
        if (dragActive) return;
        dragActive = true;
        document.body.style.userSelect = 'none';
        setDraggingSoundId(sound.id);
        setDragGhost({
          sound,
          x: clientX - offsetX,
          y: clientY - offsetY,
          width: rect.width,
          height: rect.height,
        });
      };

      const updateDropTarget = (clientX: number, clientY: number) => {
        const hitElements = document.elementsFromPoint(clientX, clientY);
        let foundPad: string | null = null;
        let foundCat: string | null = null;

        for (const el of hitElements) {
          const padAttr = (el as HTMLElement).getAttribute?.('data-pad-id');
          if (padAttr && padAttr !== sound.id) {
            foundPad = padAttr;
            break;
          }
          const catAttr = (el as HTMLElement).getAttribute?.('data-category-drop-id');
          if (catAttr) {
            foundCat = catAttr;
            break;
          }
        }

        currentTargetPadId = foundPad;
        currentTargetCatId = foundCat;
        setDropTargetSoundId(foundPad);
        setDropTargetCategoryId(foundCat);
      };

      if (fromHandle) {
        activateDrag(startX, startY);
      }

      const onPointerMove = (moveEvt: PointerEvent) => {
        const dist = Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY);

        if (!dragActive) {
          if (dist >= 6) {
            activateDrag(moveEvt.clientX, moveEvt.clientY);
            updateDropTarget(moveEvt.clientX, moveEvt.clientY);
          }
          return;
        }

        setDragGhost((prev) =>
          prev
            ? {
                ...prev,
                x: moveEvt.clientX - offsetX,
                y: moveEvt.clientY - offsetY,
              }
            : null
        );
        updateDropTarget(moveEvt.clientX, moveEvt.clientY);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        document.body.style.userSelect = '';
        setDraggingSoundId(null);
        setDropTargetSoundId(null);
        setDropTargetCategoryId(null);
        setDragGhost(null);
        activeDragCleanupRef.current = null;
      };

      const onPointerUp = () => {
        const wasDragging = dragActive;
        const droppedPadId = currentTargetPadId;
        const droppedCatId = currentTargetCatId;

        cleanup();

        if (wasDragging) {
          if (droppedCatId) {
            void handleDropOnCategory(sound.id, droppedCatId);
          } else if (droppedPadId) {
            void handleDropOnPad(sound.id, droppedPadId);
          }
        }
      };

      const onPointerCancel = () => {
        cleanup();
      };

      activeDragCleanupRef.current = cleanup;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    },
    [reorderMode, handleDropOnCategory, handleDropOnPad]
  );

  const handleStepMove = useCallback(
    async (soundId: string, direction: -1 | 1) => {
      const idx = visibleSounds.findIndex((s) => s.id === soundId);
      const targetIdx = idx + direction;
      if (idx === -1 || targetIdx < 0 || targetIdx >= visibleSounds.length) return;

      const targetPad = visibleSounds[targetIdx];
      const { all, changed } = reorderPads(sounds, soundId, targetPad.id);
      if (changed.length > 0) {
        setSounds(all);
        try {
          await batchUpdateSoundOrder(changed);
        } catch (err) {
          setNoticeMessage(err instanceof Error ? err.message : 'Failed to save pad order.');
        }
      }
    },
    [visibleSounds, sounds]
  );

  const handleSaveSound = async (
    pad: SoundPad,
    isNew: boolean,
    clearConflictSoundId?: string
  ) => {
    if (clearConflictSoundId) {
      const conflictPad = sounds.find((s) => s.id === clearConflictSoundId);
      if (conflictPad) {
        await saveSoundPad({ ...conflictPad, shortcut: '' }, false);
      }
    }
    await saveSoundPad(pad, isNew);
  };

  const handleSaveCategory = async (name: string) => {
    if (editingCategory) {
      await saveCategory({ ...editingCategory, name }, false);
    } else {
      const nextOrder =
        categories.length > 0 ? Math.max(...categories.map((c) => c.order)) + 1 : 0;
      const newCat: Category = {
        id: createSafeId('cat'),
        name,
        order: nextOrder,
        boardId: BOARD_ID,
      };
      await saveCategory(newCat, true);
      setActiveCategoryId(newCat.id);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const remaining = categories.filter((c) => c.id !== categoryId);
    const fallbackId = remaining[0]?.id ?? null;
    const affectedSounds = sounds.filter((s) => s.categoryId === categoryId);
    await deleteCategoryAndReassign(categoryId, affectedSounds, fallbackId);
    if (activeCategoryId === categoryId) {
      setActiveCategoryId('all');
    }
  };

  return (
    <div className="min-h-screen bg-[#9EA2A2] text-[#1D252D] flex flex-col">
      <TopBar
        activeSoundCount={Object.keys(activePlayback).length}
        volume={volume}
        muted={muted}
        reorderMode={reorderMode}
        isAdminUnlocked={isAdminUnlocked}
        preloadState={preloadState}
        onStopAll={() => soundEngine.stopAll()}
        onVolumeChange={(v) => {
          setVolume(v);
          if (muted && v > 0) setMuted(false);
        }}
        onToggleMute={() => setMuted((m) => !m)}
        onPreloadOffline={handlePreloadOffline}
        onToggleReorderMode={() => setReorderMode((r) => !r)}
        onToggleAdmin={handleToggleAdmin}
        onExportBackup={handleExportBackup}
      />

      <CategoryTabs
        categories={categories}
        activeCategoryId={activeCategoryId}
        countsByCategory={countsByCategory}
        totalSounds={sounds.length}
        isAdminUnlocked={isAdminUnlocked}
        dropTargetCategoryId={dropTargetCategoryId}
        onSelectCategory={setActiveCategoryId}
        onOpenAddCategory={() => {
          setEditingCategory(null);
          setCategoryModalOpen(true);
        }}
        onOpenRenameCategory={(cat) => {
          setEditingCategory(cat);
          setCategoryModalOpen(true);
        }}
        onOpenAddSound={() => {
          setEditingSound(null);
          setDroppedAudioFile(null);
          setSoundModalOpen(true);
        }}
      />

      {/* Contextual Notice / Reorder Banner */}
      {(reorderMode || noticeMessage || syncError) && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-2 space-y-2">
          {reorderMode && (
            <>
              <div className="px-3.5 py-2 rounded-lg bg-[#1D252D] border border-[#FFCD00]/75 text-xs text-[#FFE88A] flex items-center justify-between gap-3 shadow-sm">
                <span>
                  Grid unlocked — drag a pad onto another to swap positions, or drop onto a category tab to move it.
                </span>
                <button
                  type="button"
                  onClick={() => setReorderMode(false)}
                  className="font-semibold text-[#FFCD00] hover:text-white underline cursor-pointer shrink-0"
                >
                  Lock Grid
                </button>
              </div>
              <ShortcutKeyMap
                sounds={sounds}
                categoryMap={categoryMap}
                activeCategoryId={activeCategoryId}
                spotlightedSoundId={spotlightedSoundId}
                onSpotlightSound={setSpotlightedSoundId}
              />
            </>
          )}
          {noticeMessage && (
            <div className="px-3.5 py-2 rounded-lg bg-[#1D252D] border border-[#313D49] text-xs text-[#F5F6F7] shadow-sm">
              {noticeMessage}
            </div>
          )}
          {syncError && (
            <div className="px-3.5 py-2 rounded-lg bg-[#862633] border border-[#591720] text-xs text-white shadow-sm">
              Sync error: {syncError}
            </div>
          )}
        </div>
      )}

      {/* Main Tactile Pad Grid */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 pb-10">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] sm:aspect-square rounded-xl bg-[#1D252D]/25 border border-[#1D252D]/20 animate-pulse"
              />
            ))}
          </div>
        ) : visibleSounds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#313D49] bg-[#1D252D] p-10 text-center space-y-3 shadow-md">
            <img
              src="/assets/aistudio/ORHS_Wildcat_-_Jarnigan_Cardinal_Gray_re-render_988d7c65.png"
              alt="Wildcat mascot emblem"
              referrerPolicy="no-referrer"
              className="w-20 h-20 object-contain mx-auto"
            />
            <p className="font-display text-2xl font-bold text-[#F5F6F7]">
              No sound pads in this category yet
            </p>
            <p className="text-sm text-[#D2D6D9] max-w-md mx-auto">
              {isAdminUnlocked
                ? 'Add a new sound pad or click Unlock Grid to drag pads from another category onto this tab.'
                : 'Switch to another category tab, or unlock editing to add new sounds.'}
            </p>
            <div className="pt-1 flex items-center justify-center gap-3">
              {isAdminUnlocked ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSound(null);
                    setDroppedAudioFile(null);
                    setSoundModalOpen(true);
                  }}
                  className="min-h-[44px] px-4 rounded-lg bg-[#FFCD00] hover:bg-[#FFD633] text-[#1D252D] text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Sound</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveCategoryId('all')}
                  className="min-h-[44px] px-4 rounded-lg bg-[#26303A] hover:bg-[#313D49] text-[#F5F6F7] text-sm font-medium cursor-pointer"
                >
                  View All Pads
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            data-testid="sound-pad-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4"
          >
            {visibleSounds.map((sound, index) => (
              <SoundPadTile
                key={sound.id}
                sound={sound}
                categoryName={categoryMap[sound.categoryId]}
                showCategoryLabel={activeCategoryId === 'all'}
                playback={activePlayback[sound.id]}
                reorderMode={reorderMode}
                isAdminUnlocked={isAdminUnlocked}
                isDragging={draggingSoundId === sound.id}
                isDropTarget={dropTargetSoundId === sound.id && draggingSoundId !== sound.id}
                isShortcutSpotlighted={reorderMode && spotlightedSoundId === sound.id}
                canMoveLeft={index > 0}
                canMoveRight={index < visibleSounds.length - 1}
                onTrigger={(s) => void soundEngine.trigger(s)}
                onStop={(id) => soundEngine.stopSound(id)}
                onEdit={(s) => {
                  setEditingSound(s);
                  setDroppedAudioFile(null);
                  setSoundModalOpen(true);
                }}
                onPadPointerDown={handlePadPointerDown}
                onStepMove={(id, dir) => void handleStepMove(id, dir)}
                onHoverSound={setSpotlightedSoundId}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Drag Preview Ghost */}
      {dragGhost && (
        <div
          aria-hidden="true"
          style={{
            left: dragGhost.x,
            top: dragGhost.y,
            width: dragGhost.width,
            height: dragGhost.height,
            backgroundColor: getPaletteForColor(dragGhost.sound.color).hex,
            borderBottomColor: getPaletteForColor(dragGhost.sound.color).bottomHex,
            color: getPaletteForColor(dragGhost.sound.color).textHex,
          }}
          className="fixed z-50 pointer-events-none rounded-xl border-b-4 p-3.5 flex flex-col justify-between shadow-2xl scale-105 opacity-95 ring-2 ring-white/80"
        >
          <div className="flex items-start justify-between">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-black/25">
              <GripVertical className="w-4 h-4" />
            </span>
            {dragGhost.sound.shortcut && (
              <kbd className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-black/35">
                {dragGhost.sound.shortcut}
              </kbd>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center text-center px-1">
            <span className="font-display text-xl sm:text-2xl font-extrabold leading-[1.1] tracking-wide line-clamp-2">
              {dragGhost.sound.title}
            </span>
          </div>
          <div className="text-[11px] font-semibold opacity-80">
            {dropTargetCategoryId ? 'Drop to move' : 'Drop to swap'}
          </div>
        </div>
      )}

      {/* Global Page Audio File Drop Overlay */}
      {pageFileDragActive && (
        <div className="fixed inset-0 z-40 bg-[#12171D]/85 backdrop-blur-sm border-4 border-dashed border-[#FFCD00] m-3 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-2 p-6">
            <Upload className="w-10 h-10 mx-auto text-[#FFCD00]" />
            <p className="font-display text-3xl font-bold text-white">
              Drop Audio File to Add Sound Pad
            </p>
            <p className="text-sm text-[#9EA2A2]">
              Supports .mp3, .wav, .ogg, and .m4a
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      <AdminPasswordModal
        open={adminModalOpen}
        onClose={() => {
          setAdminModalOpen(false);
          setQueuedDroppedFile(null);
        }}
        onSuccess={handleAdminUnlocked}
      />

      <SoundModal
        open={soundModalOpen}
        editingSound={editingSound}
        droppedFile={droppedAudioFile}
        categories={categories}
        defaultCategoryId={activeCategoryId}
        allSounds={sounds}
        onClose={() => {
          setSoundModalOpen(false);
          setDroppedAudioFile(null);
        }}
        onSave={handleSaveSound}
        onDelete={deleteSoundPad}
      />

      <CategoryModal
        open={categoryModalOpen}
        editingCategory={editingCategory}
        categories={categories}
        soundCountInCategory={editingCategory ? countsByCategory[editingCategory.id] ?? 0 : 0}
        onClose={() => setCategoryModalOpen(false)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
      />
    </div>
  );
}
