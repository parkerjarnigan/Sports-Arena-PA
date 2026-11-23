import {
  AlertTriangle,
  Check,
  FileAudio,
  Keyboard,
  Play,
  RotateCcw,
  Scissors,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  BOARD_ID,
  PALETTE_COLORS,
  SYNTH_PRESETS,
  TITLE_MAX_LENGTH,
} from '../config/constants';
import { uploadAudioFile } from '../firebase/client';
import type { Category, PlaybackMode, SoundPad, SynthPresetId } from '../types/soundboard';
import {
  computeClipSegment,
  createSafeId,
  findShortcutConflict,
  isSupportedAudioFile,
  normalizeClipTimes,
  normalizeShortcut,
  validateSoundInput,
} from '../utils/soundboardLogic';

interface SoundModalProps {
  open: boolean;
  editingSound: SoundPad | null;
  droppedFile: File | null;
  categories: Category[];
  defaultCategoryId: string;
  allSounds: SoundPad[];
  onClose: () => void;
  onSave: (sound: SoundPad, isNew: boolean, clearConflictSoundId?: string) => Promise<void>;
  onDelete: (sound: SoundPad) => Promise<void>;
}

export function SoundModal({
  open,
  editingSound,
  droppedFile,
  categories,
  defaultCategoryId,
  allSounds,
  onClose,
  onSave,
  onDelete,
}: SoundModalProps) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [color, setColor] = useState(PALETTE_COLORS[0].hex);
  const [shortcut, setShortcut] = useState('');
  const [capturingKey, setCapturingKey] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('retrigger');
  const [sourceTab, setSourceTab] = useState<'upload' | 'synth'>('upload');
  const [audioUrl, setAudioUrl] = useState('');
  const [storagePath, setStoragePath] = useState('');
  const [synthPreset, setSynthPreset] = useState<SynthPresetId>('air-horn');

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [fileDropHover, setFileDropHover] = useState(false);

  const [clipStartSec, setClipStartSec] = useState<number>(0);
  const [clipEndSec, setClipEndSec] = useState<number>(0);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [inspectingAudio, setInspectingAudio] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflictCleared, setConflictCleared] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSaving(false);
    setConfirmDelete(false);
    setCapturingKey(false);
    setUploadProgress(null);
    setConflictCleared(false);
    setAudioDurationSec(null);
    setWaveformPeaks([]);

    if (editingSound) {
      setTitle(editingSound.title);
      setCategoryId(editingSound.categoryId);
      setColor(editingSound.color);
      setShortcut(editingSound.shortcut);
      setPlaybackMode(editingSound.playbackMode);
      const hasUrl = Boolean(editingSound.audioUrl && editingSound.audioUrl.trim().length > 0);
      setSourceTab(hasUrl ? 'upload' : 'synth');
      setAudioUrl(editingSound.audioUrl || '');
      setStoragePath(editingSound.storagePath || '');
      setSynthPreset(editingSound.synthPreset || 'air-horn');
      setClipStartSec(editingSound.clipStartSec ?? 0);
      setClipEndSec(editingSound.clipEndSec ?? 0);
      setPendingFile(null);
    } else {
      const initialCat =
        defaultCategoryId !== 'all' && categories.some((c) => c.id === defaultCategoryId)
          ? defaultCategoryId
          : categories[0]?.id || 'cat-positive';
      setCategoryId(initialCat);
      setColor(PALETTE_COLORS[0].hex);
      setShortcut('');
      setPlaybackMode('retrigger');
      setStoragePath('');
      setSynthPreset('air-horn');
      setClipStartSec(0);
      setClipEndSec(0);

      if (droppedFile) {
        setPendingFile(droppedFile);
        setSourceTab('upload');
        setAudioUrl('');
        const baseName = droppedFile.name.replace(/\.[^/.]+$/, '').slice(0, TITLE_MAX_LENGTH);
        setTitle(baseName);
      } else {
        setPendingFile(null);
        setSourceTab('upload');
        setAudioUrl('');
        setTitle('');
      }
    }
  }, [open, editingSound, droppedFile, categories, defaultCategoryId]);

  useEffect(() => {
    if (!open || sourceTab !== 'upload') return;
    const trimmedUrl = audioUrl.trim();
    const source: File | string | null = pendingFile || (trimmedUrl ? trimmedUrl : null);
    if (!source) {
      setAudioDurationSec(null);
      setWaveformPeaks([]);
      setInspectingAudio(false);
      return;
    }

    let cancelled = false;
    setInspectingAudio(true);
    const timer = setTimeout(() => {
      soundEngine
        .inspectAudioSource(source)
        .then(({ durationSec, peaks }) => {
          if (cancelled) return;
          setAudioDurationSec(durationSec);
          setWaveformPeaks(peaks);
          setInspectingAudio(false);
        })
        .catch(() => {
          if (cancelled) return;
          setAudioDurationSec(null);
          setWaveformPeaks([]);
          setInspectingAudio(false);
        });
    }, typeof source === 'string' ? 350 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, sourceTab, pendingFile, audioUrl]);

  const shortcutConflict = useMemo(() => {
    if (conflictCleared) return null;
    return findShortcutConflict(allSounds, shortcut, editingSound?.id);
  }, [allSounds, shortcut, editingSound?.id, conflictCleared]);

  useEffect(() => {
    if (!capturingKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturingKey(false);
        return;
      }
      const normalized = normalizeShortcut(e.key, e.code);
      if (normalized) {
        setShortcut(normalized);
        setConflictCleared(false);
        setCapturingKey(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturingKey]);

  if (!open) return null;

  const handleSelectFile = (file: File) => {
    if (!isSupportedAudioFile(file)) {
      setError('Unsupported file format. Please choose an .mp3, .wav, .ogg, or .m4a audio file.');
      return;
    }
    setError(null);
    setPendingFile(file);
    setClipStartSec(0);
    setClipEndSec(0);
    setSourceTab('upload');
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, '').slice(0, TITLE_MAX_LENGTH));
    }
  };

  const activeClipSegment =
    audioDurationSec && audioDurationSec > 0
      ? computeClipSegment(audioDurationSec, clipStartSec, clipEndSec)
      : null;
  const effectiveEndForSlider =
    audioDurationSec && audioDurationSec > 0
      ? clipEndSec > clipStartSec
        ? Math.min(audioDurationSec, clipEndSec)
        : audioDurationSec
      : clipEndSec;

  const handlePreview = async () => {
    let previewUrl = sourceTab === 'upload' ? audioUrl : '';
    let tempUrl: string | null = null;
    if (sourceTab === 'upload' && pendingFile) {
      tempUrl = URL.createObjectURL(pendingFile);
      previewUrl = tempUrl;
    }

    const normalizedTrim =
      sourceTab === 'upload'
        ? normalizeClipTimes(clipStartSec, clipEndSec)
        : { clipStartSec: 0, clipEndSec: 0 };

    const previewPad: SoundPad = {
      id: 'preview-pad',
      title: title || 'Preview',
      categoryId,
      order: 0,
      color,
      shortcut: '',
      playbackMode: 'retrigger',
      audioUrl: previewUrl,
      synthPreset: sourceTab === 'synth' ? synthPreset : '',
      clipStartSec: normalizedTrim.clipStartSec,
      clipEndSec:
        normalizedTrim.clipEndSec > normalizedTrim.clipStartSec ? normalizedTrim.clipEndSec : 0,
      boardId: BOARD_ID,
    };

    await soundEngine.trigger(previewPad);
    if (tempUrl) {
      setTimeout(() => URL.revokeObjectURL(tempUrl!), 15000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (shortcutConflict) {
      setError(
        `Shortcut "${shortcut}" is already assigned to "${shortcutConflict.title}". Choose another key or click "Replace existing".`
      );
      return;
    }

    let finalAudioUrl = sourceTab === 'upload' ? audioUrl.trim() : '';
    let finalStoragePath = sourceTab === 'upload' ? storagePath : '';
    const finalSynthPreset: SynthPresetId = sourceTab === 'synth' ? synthPreset : '';
    const rawTrim =
      sourceTab === 'upload'
        ? normalizeClipTimes(clipStartSec, clipEndSec)
        : { clipStartSec: 0, clipEndSec: 0 };
    const finalClipStart = rawTrim.clipStartSec;
    const finalClipEnd =
      audioDurationSec && rawTrim.clipEndSec >= audioDurationSec ? 0 : rawTrim.clipEndSec;

    const preValidationError = validateSoundInput({
      title,
      categoryId,
      color,
      shortcut,
      playbackMode,
      audioUrl: finalAudioUrl || (pendingFile ? 'https://pending.upload/file.mp3' : ''),
      synthPreset: finalSynthPreset,
      clipStartSec: finalClipStart,
      clipEndSec: finalClipEnd,
    });

    if (preValidationError) {
      setSaving(false);
      setError(preValidationError);
      return;
    }

    if (sourceTab === 'upload' && pendingFile) {
      setSaving(true);
      setUploadProgress(0);
      try {
        const uploaded = await uploadAudioFile(pendingFile, (pct) => setUploadProgress(pct));
        finalAudioUrl = uploaded.downloadUrl;
        finalStoragePath = uploaded.storagePath;
      } catch (err) {
        setSaving(false);
        setUploadProgress(null);
        setError(
          err instanceof Error
            ? err.message
            : 'Audio upload to Firebase Storage failed.'
        );
        return;
      }
    }

    const validationError = validateSoundInput({
      title,
      categoryId,
      color,
      shortcut,
      playbackMode,
      audioUrl: finalAudioUrl,
      synthPreset: finalSynthPreset,
      clipStartSec: finalClipStart,
      clipEndSec: finalClipEnd,
    });

    if (validationError) {
      setSaving(false);
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const nextOrder = editingSound
        ? editingSound.order
        : allSounds.length > 0
          ? Math.max(...allSounds.map((s) => s.order)) + 1
          : 0;

      const pad: SoundPad = {
        id: editingSound ? editingSound.id : createSafeId('snd'),
        title: title.trim(),
        categoryId,
        order: nextOrder,
        color,
        shortcut: shortcut.trim(),
        playbackMode,
        audioUrl: finalAudioUrl,
        storagePath: finalStoragePath,
        synthPreset: finalSynthPreset,
        clipStartSec: finalClipStart,
        clipEndSec: finalClipEnd > finalClipStart ? finalClipEnd : 0,
        boardId: BOARD_ID,
      };

      const conflictToClear = conflictCleared
        ? findShortcutConflict(allSounds, shortcut, editingSound?.id)?.id
        : undefined;

      await onSave(pad, !editingSound, conflictToClear);
      soundEngine.stopSound('preview-pad');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sound pad.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingSound) return;
    setSaving(true);
    try {
      await onDelete(editingSound);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sound.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0F13]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sound-modal-title"
    >
      <div className="w-full max-w-lg bg-[#1D252D] border border-[#313D49] rounded-2xl p-6 shadow-2xl my-auto">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h2 id="sound-modal-title" className="font-display text-2xl font-bold text-white">
            {editingSound ? 'Edit Sound Pad' : 'Add Sound Pad'}
          </h2>
          <button
            type="button"
            onClick={() => {
              soundEngine.stopSound('preview-pad');
              onClose();
            }}
            aria-label="Close sound modal"
            className="min-h-[36px] min-w-[36px] rounded-lg text-[#9EA2A2] hover:text-white hover:bg-[#26303A] inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Audio Source Tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#E2E5E8]">Audio Source</span>
              <div className="inline-flex rounded-lg bg-[#12171D] p-0.5 border border-[#313D49]">
                <button
                  type="button"
                  onClick={() => setSourceTab('upload')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    sourceTab === 'upload' ? 'bg-[#862633] text-white' : 'text-[#9EA2A2] hover:text-white'
                  }`}
                >
                  Audio File / URL
                </button>
                <button
                  type="button"
                  onClick={() => setSourceTab('synth')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    sourceTab === 'synth' ? 'bg-[#862633] text-white' : 'text-[#9EA2A2] hover:text-white'
                  }`}
                >
                  Built-in Synth
                </button>
              </div>
            </div>

            {sourceTab === 'upload' ? (
              <div className="space-y-2.5">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setFileDropHover(true);
                  }}
                  onDragLeave={() => setFileDropHover(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setFileDropHover(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleSelectFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-xl border border-dashed p-4 text-center cursor-pointer transition-colors ${
                    fileDropHover
                      ? 'border-[#FFCD00] bg-[#FFCD00]/10'
                      : 'border-[#384654] bg-[#12171D] hover:border-[#9EA2A2]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,.ogg,.m4a,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSelectFile(file);
                    }}
                  />
                  {pendingFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-[#FFCD00] font-medium">
                      <FileAudio className="w-4 h-4 shrink-0" />
                      <span className="truncate max-w-[280px]">{pendingFile.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-5 h-5 mx-auto text-[#9EA2A2]" />
                      <p className="text-xs text-[#E2E5E8] font-medium">
                        Drop .mp3, .wav, .ogg, or .m4a here, or click to browse
                      </p>
                      <p className="text-[11px] text-[#9EA2A2]">
                        Uploads directly to Firebase Storage
                      </p>
                    </div>
                  )}
                </div>

                {uploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-[#9EA2A2]">
                      <span>Uploading audio...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#12171D] overflow-hidden">
                      <div
                        className="h-full bg-[#FFCD00] transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="sound-url-input" className="block text-[11px] font-medium text-[#9EA2A2] mb-1">
                    Or Audio Download URL
                  </label>
                  <input
                    id="sound-url-input"
                    type="url"
                    value={audioUrl}
                    onChange={(e) => {
                      setAudioUrl(e.target.value);
                      if (pendingFile) setPendingFile(null);
                    }}
                    placeholder="https://..."
                    className="w-full h-10 px-3 rounded-lg bg-[#12171D] border border-[#313D49] text-white placeholder-[#9EA2A2]/60 text-xs focus:outline-none focus:border-[#FFCD00]"
                  />
                </div>

                {(pendingFile || audioUrl.trim().length > 0) && (
                  <div
                    data-testid="audio-trimmer"
                    className="rounded-xl bg-[#12171D] border border-[#313D49] p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5F6F7]">
                        <Scissors className="w-3.5 h-3.5 text-[#FFCD00]" />
                        <span>Audio Trimmer</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-[#9EA2A2] tabular-nums">
                          {inspectingAudio
                            ? 'Analyzing...'
                            : activeClipSegment && audioDurationSec
                              ? `Clip ${activeClipSegment.durationSec.toFixed(2)}s / ${audioDurationSec.toFixed(2)}s`
                              : clipEndSec > clipStartSec
                                ? `${clipStartSec.toFixed(2)}s – ${clipEndSec.toFixed(2)}s`
                                : clipStartSec > 0
                                  ? `Starts at ${clipStartSec.toFixed(2)}s`
                                  : 'Full length'}
                        </span>
                        {(clipStartSec > 0 || clipEndSec > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setClipStartSec(0);
                              setClipEndSec(0);
                            }}
                            className="px-2 py-0.5 rounded bg-[#26303A] hover:bg-[#313D49] text-[11px] text-[#E2E5E8] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {audioDurationSec && audioDurationSec > 0 && (
                      <div className="space-y-2">
                        {/* Waveform + Highlighted Clip Window */}
                        <div className="relative h-10 rounded-lg bg-[#1D252D] border border-[#313D49] px-1.5 flex items-center gap-[2px] overflow-hidden">
                          {activeClipSegment && (
                            <div
                              aria-hidden="true"
                              className="absolute top-0 bottom-0 bg-[#FFCD00]/15 border-x-2 border-[#FFCD00] pointer-events-none"
                              style={{
                                left: `${(activeClipSegment.startSec / audioDurationSec) * 100}%`,
                                width: `${Math.max(1, (activeClipSegment.durationSec / audioDurationSec) * 100)}%`,
                              }}
                            />
                          )}
                          {(waveformPeaks.length > 0 ? waveformPeaks : Array.from({ length: 48 }, () => 0.35)).map(
                            (amp, idx, arr) => {
                              const barTime = ((idx + 0.5) / arr.length) * audioDurationSec;
                              const inSelection =
                                activeClipSegment &&
                                barTime >= activeClipSegment.startSec &&
                                barTime <= activeClipSegment.endSec;
                              return (
                                <span
                                  key={idx}
                                  className={`flex-1 rounded-full transition-colors ${
                                    inSelection ? 'bg-[#FFCD00]' : 'bg-[#9EA2A2]/35'
                                  }`}
                                  style={{ height: `${Math.max(12, Math.round(amp * 88))}%` }}
                                />
                              );
                            }
                          )}
                        </div>

                        {/* Range Sliders */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex justify-between text-[11px] text-[#9EA2A2] mb-1">
                              <span>Start</span>
                              <span className="font-mono text-[#E2E5E8] tabular-nums">
                                {clipStartSec.toFixed(2)}s
                              </span>
                            </div>
                            <input
                              type="range"
                              aria-label="Trim start slider"
                              min={0}
                              max={Math.max(0, Math.round((effectiveEndForSlider - 0.05) * 100) / 100)}
                              step={0.05}
                              value={Math.min(clipStartSec, Math.max(0, effectiveEndForSlider - 0.05))}
                              onChange={(e) => {
                                const nextStart = Math.round(Number(e.target.value) * 100) / 100;
                                setClipStartSec(nextStart);
                              }}
                              className="w-full accent-[#FFCD00] cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] text-[#9EA2A2] mb-1">
                              <span>End</span>
                              <span className="font-mono text-[#E2E5E8] tabular-nums">
                                {effectiveEndForSlider.toFixed(2)}s
                              </span>
                            </div>
                            <input
                              type="range"
                              aria-label="Trim end slider"
                              min={Math.min(audioDurationSec, Math.round((clipStartSec + 0.05) * 100) / 100)}
                              max={audioDurationSec}
                              step={0.05}
                              value={Math.max(
                                Math.min(audioDurationSec, clipStartSec + 0.05),
                                effectiveEndForSlider
                              )}
                              onChange={(e) => {
                                const nextEnd = Math.round(Number(e.target.value) * 100) / 100;
                                setClipEndSec(nextEnd >= audioDurationSec - 0.02 ? 0 : nextEnd);
                              }}
                              className="w-full accent-[#FFCD00] cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Exact Start / End Second Inputs (works even without decoded metadata) */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="clip-start-input"
                          className="block text-[11px] font-medium text-[#9EA2A2] mb-1"
                        >
                          Start Time (sec)
                        </label>
                        <input
                          id="clip-start-input"
                          type="number"
                          min={0}
                          max={audioDurationSec ?? 36000}
                          step={0.05}
                          value={clipStartSec}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setClipStartSec(Math.round(val * 100) / 100);
                          }}
                          className="w-full h-9 px-2.5 rounded-lg bg-[#1D252D] border border-[#313D49] text-white font-mono text-xs focus:outline-none focus:border-[#FFCD00]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="clip-end-input"
                          className="block text-[11px] font-medium text-[#9EA2A2] mb-1"
                        >
                          End Time (sec, 0 = end)
                        </label>
                        <input
                          id="clip-end-input"
                          type="number"
                          min={0}
                          max={audioDurationSec ?? 36000}
                          step={0.05}
                          value={clipEndSec}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setClipEndSec(Math.round(val * 100) / 100);
                          }}
                          className="w-full h-9 px-2.5 rounded-lg bg-[#1D252D] border border-[#313D49] text-white font-mono text-xs focus:outline-none focus:border-[#FFCD00]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="synth-preset-select" className="sr-only">
                  Built-in Synth Effect
                </label>
                <select
                  id="synth-preset-select"
                  value={synthPreset}
                  onChange={(e) => setSynthPreset(e.target.value as SynthPresetId)}
                  className="w-full h-11 px-3 rounded-lg bg-[#12171D] border border-[#313D49] text-white text-sm focus:outline-none focus:border-[#FFCD00]"
                >
                  {SYNTH_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.durationLabel})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePreview}
                className="min-h-[36px] px-3 rounded-lg bg-[#26303A] hover:bg-[#313D49] text-[#F5F6F7] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-[#FFCD00]" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => soundEngine.stopSound('preview-pad')}
                className="min-h-[36px] px-3 rounded-lg bg-[#26303A] hover:bg-[#313D49] text-[#F5F6F7] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
            </div>
          </div>

          {/* Sound Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sound-title-input" className="block text-xs font-semibold text-[#E2E5E8] mb-1.5">
                Sound Name
              </label>
              <input
                id="sound-title-input"
                type="text"
                maxLength={TITLE_MAX_LENGTH}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Air Horn, 3-Pointer!"
                className="w-full h-11 px-3.5 rounded-lg bg-[#12171D] border border-[#313D49] text-white placeholder-[#9EA2A2]/60 text-sm focus:outline-none focus:border-[#FFCD00]"
              />
            </div>

            <div>
              <label htmlFor="sound-category-select" className="block text-xs font-semibold text-[#E2E5E8] mb-1.5">
                Category
              </label>
              <select
                id="sound-category-select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-[#12171D] border border-[#313D49] text-white text-sm focus:outline-none focus:border-[#FFCD00]"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pad Color Picker */}
          <div>
            <span className="block text-xs font-semibold text-[#E2E5E8] mb-2">Pad Color</span>
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE_COLORS.map((swatch) => {
                const selected = color.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => setColor(swatch.hex)}
                    aria-label={`Color ${swatch.name}`}
                    aria-pressed={selected}
                    style={{ backgroundColor: swatch.hex, color: swatch.textHex }}
                    className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-transform ${
                      selected
                        ? 'ring-2 ring-[#FFCD00] ring-offset-2 ring-offset-[#1D252D] scale-105'
                        : swatch.hex.toLowerCase() === '#1d252d'
                          ? 'ring-1 ring-[#384654] opacity-90 hover:opacity-100'
                          : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                    <span>{swatch.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Keyboard Shortcut & Playback Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="block text-xs font-semibold text-[#E2E5E8] mb-1.5">
                Keyboard Shortcut
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCapturingKey((v) => !v)}
                  className={`flex-1 h-11 px-3 rounded-lg border text-sm font-mono font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    capturingKey
                      ? 'bg-[#FFCD00]/15 border-[#FFCD00] text-[#FFCD00]'
                      : 'bg-[#12171D] border-[#313D49] text-white hover:border-[#9EA2A2]'
                  }`}
                >
                  <Keyboard className="w-4 h-4 text-[#9EA2A2] shrink-0" />
                  <span>
                    {capturingKey ? 'Press any key...' : shortcut || 'None assigned'}
                  </span>
                </button>
                {shortcut && (
                  <button
                    type="button"
                    onClick={() => {
                      setShortcut('');
                      setConflictCleared(false);
                    }}
                    aria-label="Clear shortcut"
                    className="h-11 px-3 rounded-lg bg-[#26303A] hover:bg-[#313D49] text-xs font-medium text-[#E2E5E8] cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#E2E5E8] mb-1.5">
                Playback Mode
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#12171D] border border-[#313D49] h-11">
                <button
                  type="button"
                  onClick={() => setPlaybackMode('retrigger')}
                  className={`rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    playbackMode === 'retrigger'
                      ? 'bg-[#862633] text-white'
                      : 'text-[#9EA2A2] hover:text-white'
                  }`}
                >
                  Retrigger
                </button>
                <button
                  type="button"
                  onClick={() => setPlaybackMode('toggle')}
                  className={`rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    playbackMode === 'toggle'
                      ? 'bg-[#862633] text-white'
                      : 'text-[#9EA2A2] hover:text-white'
                  }`}
                >
                  Toggle
                </button>
                <button
                  type="button"
                  onClick={() => setPlaybackMode('gate')}
                  className={`rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    playbackMode === 'gate'
                      ? 'bg-[#862633] text-white'
                      : 'text-[#9EA2A2] hover:text-white'
                  }`}
                >
                  Gate
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[#9EA2A2]">
                {playbackMode === 'retrigger'
                  ? 'Restarts immediately on each tap.'
                  : playbackMode === 'toggle'
                    ? 'Tap once to play, tap again to stop.'
                    : 'Plays while held down; releasing stops playback.'}
              </p>
            </div>
          </div>

          {shortcutConflict && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-[#FFCD00]/10 border border-[#FFCD00]/45 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 text-xs text-[#FFE88A]">
                <AlertTriangle className="w-4 h-4 text-[#FFCD00] shrink-0" />
                <span>
                  Key <strong className="font-mono">{shortcut}</strong> is already assigned to{' '}
                  <strong>{shortcutConflict.title}</strong>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConflictCleared(true)}
                className="px-2.5 py-1 rounded bg-[#FFCD00] hover:bg-[#FFD633] text-[#1D252D] text-xs font-bold cursor-pointer"
              >
                Replace existing
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs font-medium text-red-400" role="alert">
              {error}
            </p>
          )}

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#313D49]">
            <div>
              {editingSound && !confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[44px] px-3 rounded-lg text-red-400 hover:text-red-300 hover:bg-[#862633]/25 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )}
              {editingSound && confirmDelete && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDelete}
                    className="min-h-[40px] px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[40px] px-3 rounded-lg bg-[#26303A] text-[#F5F6F7] text-xs font-medium cursor-pointer"
                  >
                    Keep
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={() => {
                  soundEngine.stopSound('preview-pad');
                  onClose();
                }}
                className="min-h-[44px] px-4 rounded-lg bg-[#26303A] hover:bg-[#313D49] text-[#F5F6F7] text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 rounded-lg bg-[#862633] hover:bg-[#9E2D3C] disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
              >
                {saving ? 'Saving...' : editingSound ? 'Save Changes' : 'Add Sound'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
