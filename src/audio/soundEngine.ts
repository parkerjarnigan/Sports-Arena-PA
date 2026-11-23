import type { ActivePlaybackInfo, PreloadState, SoundPad, SynthPresetId } from '../types/soundboard';
import { computeClipSegment } from '../utils/soundboardLogic';

const AUDIO_CACHE_NAME = 'courtboard-audio-v1';

interface PlayingInstance {
  soundId: string;
  startTime: number;
  wallStartMs: number;
  durationSec: number;
  stop: () => void;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.85;
  private muted = false;

  private audioBufferCache = new Map<string, AudioBuffer>();
  private synthBufferCache = new Map<string, AudioBuffer>();
  private activeInstances = new Map<string, PlayingInstance>();
  private playGeneration = new Map<string, number>();
  private listeners = new Set<(activeMap: Record<string, ActivePlaybackInfo>) => void>();
  private rafId: number | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.01);
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.01);
    }
  }

  public subscribe(listener: (activeMap: Record<string, ActivePlaybackInfo>) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private getSnapshot(): Record<string, ActivePlaybackInfo> {
    const out: Record<string, ActivePlaybackInfo> = {};
    const now = this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    const nowMs = performance.now();
    for (const [id, inst] of this.activeInstances.entries()) {
      const ctxElapsed = Math.max(0, now - inst.startTime);
      const wallElapsed = Math.max(0, (nowMs - inst.wallStartMs) / 1000);
      const elapsed = ctxElapsed > 0.01 ? ctxElapsed : wallElapsed;
      const progress = inst.durationSec > 0 ? Math.min(1, elapsed / inst.durationSec) : 0;
      out[id] = {
        soundId: id,
        progress,
        durationMs: Math.round(inst.durationSec * 1000),
      };
    }
    return out;
  }

  private ensureTicker(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      if (this.activeInstances.size === 0) {
        this.rafId = null;
        this.emitState();
        return;
      }
      this.emitState();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private bumpGeneration(soundId: string): number {
    const next = (this.playGeneration.get(soundId) ?? 0) + 1;
    this.playGeneration.set(soundId, next);
    return next;
  }

  public stopSound(soundId: string): void {
    this.bumpGeneration(soundId);
    const existing = this.activeInstances.get(soundId);
    if (existing) {
      this.activeInstances.delete(soundId);
      existing.stop();
      this.emitState();
    }
  }

  public stopAll(): void {
    for (const id of this.playGeneration.keys()) {
      this.bumpGeneration(id);
    }
    const instances = Array.from(this.activeInstances.values());
    this.activeInstances.clear();
    for (const inst of instances) {
      inst.stop();
    }
    this.emitState();
  }

  public async trigger(sound: SoundPad): Promise<void> {
    const existing = this.activeInstances.get(sound.id);
    if (sound.playbackMode === 'toggle' && existing) {
      this.stopSound(sound.id);
      return;
    }
    if (existing) {
      this.stopSound(sound.id);
    }

    const gen = this.bumpGeneration(sound.id);
    const ctx = this.ensureContext();

    if (sound.audioUrl && sound.audioUrl.trim().length > 0) {
      const url = sound.audioUrl.trim();
      let buffer = this.audioBufferCache.get(url);

      if (!buffer) {
        try {
          buffer = await this.fetchAndDecodeAudio(url, ctx);
          this.audioBufferCache.set(url, buffer);
        } catch {
          if (this.playGeneration.get(sound.id) !== gen) return;
          this.playHtmlAudioFallback(sound.id, url, sound.clipStartSec, sound.clipEndSec);
          return;
        }
      }

      if (this.playGeneration.get(sound.id) !== gen) return;
      this.playBuffer(sound.id, buffer, ctx, sound.clipStartSec, sound.clipEndSec);
      return;
    }

    if (sound.synthPreset) {
      const buffer = await this.getOrRenderSynth(sound.synthPreset, ctx);
      if (this.playGeneration.get(sound.id) !== gen) return;
      this.playBuffer(sound.id, buffer, ctx, sound.clipStartSec, sound.clipEndSec);
    }
  }

  private playBuffer(
    soundId: string,
    buffer: AudioBuffer,
    ctx: AudioContext,
    clipStartSec?: number,
    clipEndSec?: number
  ): void {
    if (!this.masterGain) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);

    const seg = computeClipSegment(buffer.duration, clipStartSec, clipEndSec);
    const startTime = ctx.currentTime;
    const wallStartMs = performance.now();
    const durationSec = seg.durationSec;
    let stopped = false;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Already stopped
      }
      if (this.activeInstances.get(soundId)?.startTime === startTime && this.activeInstances.get(soundId)?.wallStartMs === wallStartMs) {
        this.activeInstances.delete(soundId);
        this.emitState();
      }
    };

    source.onended = () => {
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      if (this.activeInstances.get(soundId)?.startTime === startTime && this.activeInstances.get(soundId)?.wallStartMs === wallStartMs) {
        this.activeInstances.delete(soundId);
        this.emitState();
      }
    };

    this.activeInstances.set(soundId, {
      soundId,
      startTime,
      wallStartMs,
      durationSec,
      stop: cleanup,
    });

    watchdogTimer = setTimeout(cleanup, Math.ceil(seg.durationSec * 1000) + 80);
    source.start(0, seg.startSec, seg.durationSec);
    this.emitState();
    this.ensureTicker();
  }

  private playHtmlAudioFallback(
    soundId: string,
    url: string,
    clipStartSec?: number,
    clipEndSec?: number
  ): void {
    const audio = new Audio(url);
    audio.volume = this.muted ? 0 : this.volume;
    const startTime = this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    const startOffset =
      typeof clipStartSec === 'number' && Number.isFinite(clipStartSec) && clipStartSec > 0
        ? clipStartSec
        : 0;
    const hasEndCap =
      typeof clipEndSec === 'number' && Number.isFinite(clipEndSec) && clipEndSec > startOffset;
    let endTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (endTimer) {
        clearTimeout(endTimer);
        endTimer = null;
      }
      audio.pause();
      audio.currentTime = 0;
      if (this.activeInstances.get(soundId)?.startTime === startTime) {
        this.activeInstances.delete(soundId);
        this.emitState();
      }
    };

    audio.onended = () => {
      if (endTimer) {
        clearTimeout(endTimer);
        endTimer = null;
      }
      if (this.activeInstances.get(soundId)?.startTime === startTime) {
        this.activeInstances.delete(soundId);
        this.emitState();
      }
    };

    audio.ontimeupdate = () => {
      if (hasEndCap && clipEndSec && audio.currentTime >= clipEndSec) {
        cleanup();
      }
    };

    const estimatedDur = hasEndCap && clipEndSec ? clipEndSec - startOffset : 2;
    this.activeInstances.set(soundId, {
      soundId,
      startTime,
      wallStartMs: performance.now(),
      durationSec: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : estimatedDur,
      stop: cleanup,
    });

    const startPlayback = () => {
      if (startOffset > 0 && (!Number.isFinite(audio.duration) || startOffset < audio.duration)) {
        try {
          audio.currentTime = startOffset;
        } catch {
          // Ignore seek errors before metadata
        }
      }
      if (hasEndCap && clipEndSec) {
        const ms = Math.max(50, (clipEndSec - startOffset) * 1000);
        endTimer = setTimeout(cleanup, ms);
      }
      audio.play().catch(() => {
        cleanup();
      });
    };

    if (audio.readyState >= 1) {
      startPlayback();
    } else {
      audio.addEventListener('loadedmetadata', startPlayback, { once: true });
      audio.load();
    }

    this.emitState();
    this.ensureTicker();
  }

  public async inspectAudioSource(
    source: File | string
  ): Promise<{ durationSec: number; peaks: number[] }> {
    const ctx = this.ensureContext();
    try {
      let buffer: AudioBuffer;
      if (typeof source === 'string') {
        const cached = this.audioBufferCache.get(source);
        if (cached) {
          buffer = cached;
        } else {
          buffer = await this.fetchAndDecodeAudio(source, ctx);
          this.audioBufferCache.set(source, buffer);
        }
      } else {
        const arr = await source.arrayBuffer();
        buffer = await ctx.decodeAudioData(arr.slice(0));
      }

      const channel = buffer.getChannelData(0);
      const barCount = 48;
      const blockSize = Math.max(1, Math.floor(channel.length / barCount));
      const rawPeaks: number[] = [];
      let maxPeak = 0.01;
      for (let i = 0; i < barCount; i++) {
        const start = i * blockSize;
        const end = Math.min(channel.length, start + blockSize);
        let peak = 0;
        for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 64))) {
          const val = Math.abs(channel[j]);
          if (val > peak) peak = val;
        }
        rawPeaks.push(peak);
        if (peak > maxPeak) maxPeak = peak;
      }
      const peaks = rawPeaks.map((p) => Math.max(0.08, Math.round((p / maxPeak) * 100) / 100));
      return { durationSec: Math.round(buffer.duration * 100) / 100, peaks };
    } catch {
      const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
      try {
        const durationSec = await new Promise<number>((resolve, reject) => {
          const audio = new Audio();
          audio.preload = 'metadata';
          audio.onloadedmetadata = () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
              resolve(Math.round(audio.duration * 100) / 100);
            } else {
              reject(new Error('Unknown duration'));
            }
          };
          audio.onerror = () => reject(new Error('Failed to load audio metadata'));
          audio.src = objectUrl;
        });
        return { durationSec, peaks: [] };
      } finally {
        if (typeof source !== 'string') {
          URL.revokeObjectURL(objectUrl);
        }
      }
    }
  }

  private async fetchAndDecodeAudio(url: string, ctx: AudioContext): Promise<AudioBuffer> {
    let arrayBuffer: ArrayBuffer | null = null;

    if ('caches' in window) {
      try {
        const cache = await caches.open(AUDIO_CACHE_NAME);
        const cachedResp = await cache.match(url);
        if (cachedResp) {
          arrayBuffer = await cachedResp.arrayBuffer();
        } else {
          const netResp = await fetch(url, { mode: 'cors' });
          if (!netResp.ok) throw new Error(`HTTP ${netResp.status}`);
          await cache.put(url, netResp.clone());
          arrayBuffer = await netResp.arrayBuffer();
        }
      } catch {
        // Fallback to direct fetch below
      }
    }

    if (!arrayBuffer) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      arrayBuffer = await resp.arrayBuffer();
    }

    return ctx.decodeAudioData(arrayBuffer.slice(0));
  }

  public async preloadAll(
    sounds: SoundPad[],
    onProgress: (state: PreloadState) => void
  ): Promise<PreloadState> {
    const ctx = this.ensureContext();
    const remoteSounds = sounds.filter((s) => s.audioUrl && s.audioUrl.trim().length > 0);
    const synthSounds = sounds.filter((s) => !s.audioUrl && s.synthPreset);
    const total = remoteSounds.length + synthSounds.length;

    let loaded = 0;
    let failed = 0;

    onProgress({ status: 'loading', loaded: 0, total, failed: 0 });

    for (const s of synthSounds) {
      if (s.synthPreset) {
        try {
          await this.getOrRenderSynth(s.synthPreset, ctx);
          loaded += 1;
        } catch {
          failed += 1;
        }
        onProgress({ status: 'loading', loaded, total, failed });
      }
    }

    for (const s of remoteSounds) {
      const url = s.audioUrl!.trim();
      if (!this.audioBufferCache.has(url)) {
        try {
          const buf = await this.fetchAndDecodeAudio(url, ctx);
          this.audioBufferCache.set(url, buf);
          loaded += 1;
        } catch {
          failed += 1;
        }
      } else {
        loaded += 1;
      }
      onProgress({ status: 'loading', loaded, total, failed });
    }

    const finalState: PreloadState = {
      status: failed > 0 && loaded === 0 ? 'error' : 'ready',
      loaded,
      total,
      failed,
    };
    onProgress(finalState);
    return finalState;
  }

  private async getOrRenderSynth(preset: Exclude<SynthPresetId, ''>, liveCtx: AudioContext): Promise<AudioBuffer> {
    const cached = this.synthBufferCache.get(preset);
    if (cached) return cached;

    const sampleRate = liveCtx.sampleRate || 44100;
    const durationMap: Record<Exclude<SynthPresetId, ''>, number> = {
      'air-horn': 1.15,
      buzzer: 1.2,
      'swish-chime': 0.95,
      'charge-organ': 2.1,
      'defense-stomp': 2.8,
      'sad-trombone': 1.85,
      'brick-clank': 0.75,
      'hype-siren': 3.2,
      'walkup-riff': 2.4,
      'mvp-fanfare': 1.65,
    };

    const dur = durationMap[preset] || 1.2;
    const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * dur), sampleRate);
    this.renderSynthPreset(offline, preset, dur);
    const rendered = await offline.startRendering();
    this.synthBufferCache.set(preset, rendered);
    return rendered;
  }

  private renderSynthPreset(ctx: OfflineAudioContext, preset: Exclude<SynthPresetId, ''>, dur: number): void {
    const master = ctx.createGain();
    master.gain.value = 0.75;
    master.connect(ctx.destination);

    if (preset === 'air-horn') {
      const freqs = [349.23, 440, 523.25];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f * 0.96, 0);
        osc.frequency.exponentialRampToValueAtTime(f, 0.04);
        osc.frequency.setValueAtTime(f, dur - 0.14);
        osc.frequency.linearRampToValueAtTime(f * 0.94, dur);

        filter.type = 'lowpass';
        filter.frequency.value = 2200 + idx * 350;

        gain.gain.setValueAtTime(0.001, 0);
        gain.gain.linearRampToValueAtTime(0.26, 0.03);
        gain.gain.setValueAtTime(0.24, 0.25);
        gain.gain.linearRampToValueAtTime(0.02, 0.3);
        gain.gain.linearRampToValueAtTime(0.28, 0.34);
        gain.gain.setValueAtTime(0.25, dur - 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start(0);
        osc.stop(dur);
      });
      return;
    }

    if (preset === 'buzzer') {
      [110, 146.83, 220].forEach((f) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(f, 0);
        gain.gain.setValueAtTime(0.001, 0);
        gain.gain.linearRampToValueAtTime(0.22, 0.02);
        gain.gain.setValueAtTime(0.22, dur - 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(0);
        osc.stop(dur);
      });
      return;
    }

    if (preset === 'swish-chime') {
      const notes = [587.33, 739.99, 880, 1174.66];
      notes.forEach((f, i) => {
        const start = i * 0.07;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(dur);
      });
      return;
    }

    if (preset === 'charge-organ') {
      const seq = [
        { f: 392, t: 0, d: 0.16 },
        { f: 523.25, t: 0.18, d: 0.16 },
        { f: 659.25, t: 0.36, d: 0.16 },
        { f: 783.99, t: 0.54, d: 0.34 },
        { f: 659.25, t: 0.92, d: 0.18 },
        { f: 783.99, t: 1.14, d: 0.9 },
      ];
      seq.forEach((note) => {
        [1, 2].forEach((mult, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = idx === 0 ? 'sawtooth' : 'triangle';
          osc.frequency.setValueAtTime(note.f * mult, note.t);
          gain.gain.setValueAtTime(0.001, note.t);
          gain.gain.linearRampToValueAtTime(idx === 0 ? 0.22 : 0.12, note.t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, note.t + note.d);
          osc.connect(gain);
          gain.connect(master);
          osc.start(note.t);
          osc.stop(note.t + note.d);
        });
      });
      return;
    }

    if (preset === 'defense-stomp') {
      const hits = [0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1, 2.45];
      hits.forEach((t, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const isClap = idx % 2 === 1;
        if (!isClap) {
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
          gain.gain.setValueAtTime(0.6, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(master);
          osc.start(t);
          osc.stop(t + 0.25);
        } else {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(320, t);
          osc.frequency.exponentialRampToValueAtTime(160, t + 0.1);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          osc.connect(gain);
          gain.connect(master);
          osc.start(t);
          osc.stop(t + 0.15);
        }
      });
      return;
    }

    if (preset === 'sad-trombone') {
      const notes = [
        { f: 311.13, t: 0, d: 0.35 },
        { f: 293.66, t: 0.38, d: 0.35 },
        { f: 277.18, t: 0.76, d: 0.35 },
        { f: 261.63, t: 1.14, d: 0.68 },
      ];
      notes.forEach((n, idx) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(n.f, n.t);
        if (idx === 3) {
          osc.frequency.linearRampToValueAtTime(n.f * 0.85, n.t + n.d);
        }
        filter.type = 'lowpass';
        filter.frequency.value = 1100;
        gain.gain.setValueAtTime(0.001, n.t);
        gain.gain.linearRampToValueAtTime(0.32, n.t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, n.t + n.d);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start(n.t);
        osc.stop(n.t + n.d);
      });
      return;
    }

    if (preset === 'brick-clank') {
      [420, 685, 1140].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'square';
        osc.frequency.setValueAtTime(f, 0);
        osc.frequency.exponentialRampToValueAtTime(f * 0.72, dur);
        gain.gain.setValueAtTime(0.28 / (idx + 1), 0);
        gain.gain.exponentialRampToValueAtTime(0.001, dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(0);
        osc.stop(dur);
      });
      return;
    }

    if (preset === 'hype-siren') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(380, 0);
      osc.frequency.exponentialRampToValueAtTime(920, 0.8);
      osc.frequency.exponentialRampToValueAtTime(420, 1.6);
      osc.frequency.exponentialRampToValueAtTime(960, 2.4);
      osc.frequency.exponentialRampToValueAtTime(340, dur);

      filter.type = 'lowpass';
      filter.frequency.value = 2400;

      gain.gain.setValueAtTime(0.001, 0);
      gain.gain.linearRampToValueAtTime(0.28, 0.1);
      gain.gain.setValueAtTime(0.26, dur - 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(0);
      osc.stop(dur);
      return;
    }

    if (preset === 'walkup-riff') {
      const chords = [
        { f: 220, t: 0, d: 0.45 },
        { f: 261.63, t: 0.5, d: 0.45 },
        { f: 293.66, t: 1.0, d: 0.45 },
        { f: 329.63, t: 1.5, d: 0.85 },
      ];
      chords.forEach((c) => {
        [1, 1.5].forEach((mult) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(c.f * mult, c.t);
          gain.gain.setValueAtTime(0.001, c.t);
          gain.gain.linearRampToValueAtTime(0.18, c.t + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, c.t + c.d);
          osc.connect(gain);
          gain.connect(master);
          osc.start(c.t);
          osc.stop(c.t + c.d);
        });
      });
      return;
    }

    // mvp-fanfare
    [261.63, 329.63, 392.0, 523.25].forEach((f, idx) => {
      const start = idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.24, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(dur);
    });
  }
}

export const soundEngine = new SoundEngine();
