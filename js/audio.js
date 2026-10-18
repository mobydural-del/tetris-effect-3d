/**
 * Synesthesia Audio Engine - Tetris Effect 3D
 * 100% Procedural Web Audio API Synthesis Engine
 * 
 * Features:
 * - Zero external audio files: Pure Web Audio API oscillators, envelopes, filters, and algorithmic impulse responses.
 * - Master DynamicsCompressor limiter, master BiquadFilterNode (lowpass 19000Hz -> 360Hz Q=4.5 Zone Mode).
 * - Stereo Ping-Pong Delay and Algorithmic Convolution Reverb.
 * - 3 Journey Stages with distinct musical keys, scales, BPMs, and multi-layered backing tracks:
 *     Stage 0: "Abismo Bioluminiscente" (110 BPM, D Dorian)
 *     Stage 1: "Cyberpunk Synthwave" (128 BPM, A Minor / Synthwave)
 *     Stage 2: "Nebulosa Cósmica" (138 BPM, F# Lydian Cosmic)
 * - Sample-accurate lookahead beat scheduler with beat phase detection, beat window queries, and onBeat callbacks.
 * - Synesthetic quantized player sound actions: playMove, playRotate, playSoftDrop, playHardDrop, playLock,
 *   playHold, playLineClear, setZoneMode, triggerZoneRelease, setDangerLevel.
 */

(function (global) {
  'use strict';

  // --- Musical Utilities ---
  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // --- Stage Definitions ---
  const STAGES = [
    {
      id: 0,
      name: 'Atardecer en la Alhambra',
      sub: '105 BPM · Modo Frigio Andalusí',
      bpm: 105,
      rootMidi: 50, // D3 (146.83 Hz)
      // D Dorian scale: D, E, F, G, A, B, C (intervals from D)
      scale: [0, 2, 3, 5, 7, 9, 10],
      // 4-bar chord progression: Dm9, G9/D, Cmaj9, Dm11
      chords: [
        [0, 3, 7, 10, 14], // Dm9 (D, F, A, C, E)
        [0, 5, 9, 12, 15], // G9/D (D, G, B, D, F)
        [-2, 2, 5, 9, 12], // Cmaj9 (C, E, G, B, D)
        [0, 3, 7, 10, 17]  // Dm11 (D, F, A, C, G)
      ],
      bassPattern: [0, -7, -2, 0], // D2, G1, C2, D2
      leadTimbre: 'kalimba',
      padTimbre: 'underwater_pad',
      bubbleRate: 0.35
    },
    {
      id: 1,
      name: 'Cyberpunk Synthwave',
      bpm: 128,
      rootMidi: 45, // A2 (110 Hz)
      // A Minor / Synthwave scale: A, B, C, D, E, F, G
      scale: [0, 2, 3, 5, 7, 8, 10],
      // 4-bar progression: Am7, Fmaj7, Cmaj7, G7/sus4
      chords: [
        [0, 3, 7, 10, 12], // Am7
        [-4, 0, 3, 7, 12], // Fmaj7
        [-9, -5, -2, 2, 7],// Cmaj7
        [-2, 2, 5, 9, 12]  // G7
      ],
      bassPattern: [0, -4, -9, -2], // A1, F1, C1, G1
      leadTimbre: 'analog_brass',
      padTimbre: 'synthwave_swell',
      bubbleRate: 0.0
    },
    {
      id: 2,
      name: 'Nebulosa Cósmica',
      bpm: 138,
      rootMidi: 42, // F#2 (92.5 Hz)
      // F# Lydian Cosmic scale: F#, G#, A#, B# (C), C#, D#, E# (F)
      scale: [0, 2, 4, 6, 7, 9, 11],
      // 4-bar progression: F#maj7#11, G#add9, A#m9, C#sus4/6
      chords: [
        [0, 4, 7, 11, 18], // F#maj7#11
        [2, 6, 9, 14, 16], // G#add9
        [4, 7, 11, 14, 18],// A#m9
        [7, 11, 14, 18, 23] // C#6
      ],
      bassPattern: [0, 2, 4, 7], // F#1, G#1, A#1, C#2
      leadTimbre: 'cosmic_bell',
      padTimbre: 'celestial_choir',
      bubbleRate: 0.25
    }
  ];

  class SynesthesiaAudioEngine {
    constructor() {
      this.ctx = null;
      this.isInitialized = false;
      this.isPlaying = false;
      this.isMuted = false;
      this.volume = 0.85;

      // Stage & Beat tracking
      this.currentStageIndex = 0;
      this.currentStage = STAGES[0];
      this.currentBpm = this.currentStage.bpm;
      if (this.isInitialized) this._syncExternalTrackPlayback();
      this.musicStartTime = 0;
      this.current16thNote = 0;
      this.nextNoteTime = 0;
      this.schedulerTimer = null;
      this.lookahead = 25.0; // ms
      this.scheduleAheadTime = 0.12; // seconds

      // Callbacks
      this.beatCallbacks = [];

      // Audio Graph Nodes
      this.masterGain = null;
      this.masterLimiter = null;
      this.masterFilter = null;
      this.dryBus = null;
      this.musicBus = null;
      this.drumBus = null;
      this.sfxBus = null;
      this.reverbSendBus = null;
      this.delaySendBus = null;

      // Effects Nodes
      this.reverbNode = null;
      this.reverbGain = null;
      this.delayLeft = null;
      this.delayRight = null;
      this.delayFeedback = null;
      this.delayFilter = null;
      this.delayPanLeft = null;
      this.delayPanRight = null;

      // Noise & IR Buffers
      this.whiteNoiseBuffer = null;
      this.pinkNoiseBuffer = null;
      this.reverbIRBuffer = null;

      // Danger layer
      this.dangerGain = null;
      this.dangerOsc1 = null;
      this.dangerOsc2 = null;
      this.dangerFilter = null;
      this.dangerLevel = 0.0;

      // Zone mode state
      this.inZone = false;

      // Player action arpeggio state
      this.lastRotateTime = 0;
      this.rotationCycleIndex = 0;

      // External Suno MP3 tracks in audio_tracks/
      this.externalTrackFiles = [
        "audio_tracks/Bioluminescent%20Abyss.mp3",
        "audio_tracks/Neon%20Arpeggio.mp3",
        "audio_tracks/Transcendental%20Cosmic%20Trance.mp3"
      ];
      this.externalTracks = [null, null, null];
      this.externalTrackGains = [null, null, null];
      this.externalTrackReady = [false, false, false];
      this.activeExternalAudio = null;
    }

    /**
     * Initializes the Web Audio API context and all procedural sound routing graphs.
     * Safe to call multiple times; will not reinitialize if already ready.
     */
    init() {
      if (this.isInitialized) return this;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('Web Audio API not supported in this browser.');
        return this;
      }

      this.ctx = new AudioContextClass();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);

      // Master Dynamics Compressor (Limiter)
      this.masterLimiter = this.ctx.createDynamicsCompressor();
      this.masterLimiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
      this.masterLimiter.knee.setValueAtTime(8.0, this.ctx.currentTime);
      this.masterLimiter.ratio.setValueAtTime(6.0, this.ctx.currentTime);
      this.masterLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.masterLimiter.release.setValueAtTime(0.12, this.ctx.currentTime);

      // Master BiquadFilter (Lowpass for zone underwater time-stop)
      this.masterFilter = this.ctx.createBiquadFilter();
      this.masterFilter.type = 'lowpass';
      this.masterFilter.frequency.setValueAtTime(19000, this.ctx.currentTime);
      this.masterFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

      // Routing Master: Filter -> Limiter -> MasterGain -> Destination
      this.masterFilter.connect(this.masterLimiter);
      this.masterLimiter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Sub-Buses
      this.dryBus = this.ctx.createGain();
      this.dryBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.dryBus.connect(this.masterFilter);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.setValueAtTime(0.62, this.ctx.currentTime);
      this.musicBus.connect(this.dryBus);

      this.drumBus = this.ctx.createGain();
      this.drumBus.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.drumBus.connect(this.dryBus);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.setValueAtTime(0.75, this.ctx.currentTime);
      this.sfxBus.connect(this.dryBus);

      // --- Delay and Reverb Aux Buses ---
      this.reverbSendBus = this.ctx.createGain();
      this.reverbSendBus.gain.setValueAtTime(0.5, this.ctx.currentTime);

      this.delaySendBus = this.ctx.createGain();
      this.delaySendBus.gain.setValueAtTime(0.42, this.ctx.currentTime);

      this._buildStereoPingPongDelay();
      this._buildAlgorithmicReverb();
      this._generateNoiseBuffers();
      this._buildDangerDrone();

      this.isInitialized = true;
      this._probeExternalSunoTracks();
      return this;
    }

    _probeExternalSunoTracks() {
      if (!this.ctx || typeof Audio === "undefined") return;
      this.externalTrackFiles.forEach((url, idx) => {
        if (this.externalTracks[idx]) return;
        const audioEl = new Audio(url);
        audioEl.loop = true;
        audioEl.preload = "auto";
        const mediaSource = this.ctx.createMediaElementSource(audioEl);
        const trackGain = this.ctx.createGain();
        trackGain.gain.setValueAtTime(idx === this.currentStageIndex ? 0.95 : 0.0001, this.ctx.currentTime);
        mediaSource.connect(trackGain);
        trackGain.connect(this.musicBus);
        this.externalTracks[idx] = audioEl;
        this.externalTrackGains[idx] = trackGain;
        this.externalTrackReady[idx] = true;
      });
    }

    _syncExternalTrackPlayback() {
      const idx = this.currentStageIndex;
      this.externalTracks.forEach((el, i) => {
        if (!el) return;
        const g = this.externalTrackGains[i];
        if (this.isPlaying && i === idx && this.externalTrackReady[i]) {
          if (g && this.ctx) {
            g.gain.cancelScheduledValues(this.ctx.currentTime);
            g.gain.setValueAtTime(0.95, this.ctx.currentTime);
          }
          el.play().catch(() => {});
          this.activeExternalAudio = el;
        } else if (!this.isPlaying) {
          el.pause();
          if (g && this.ctx) {
            g.gain.cancelScheduledValues(this.ctx.currentTime);
            g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
          }
        }
      });
    }

    /**
     * Resumes AudioContext on user interaction (clicks, keypresses) to satisfy browser autoplay policy.
     */
    async resume() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (e) {
          console.warn('AudioContext resume error:', e);
        }
      }
      return this;
    }

    // ==========================================
    // FX Building (Reverb, Ping-Pong Delay, Noise)
    // ==========================================

    _buildStereoPingPongDelay() {
      const t = this.ctx.currentTime;
      this.delayLeft = this.ctx.createDelay(1.5);
      this.delayRight = this.ctx.createDelay(1.5);

      const beatSec = 60.0 / this.currentBpm;
      this.delayLeft.delayTime.setValueAtTime(beatSec * 0.5, t); // 8th note
      this.delayRight.delayTime.setValueAtTime(beatSec * 0.75, t); // Dotted 8th note

      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.setValueAtTime(0.28, t);

      this.delayFilter = this.ctx.createBiquadFilter();
      this.delayFilter.type = 'lowpass';
      this.delayFilter.frequency.setValueAtTime(2200, t);
      this.delayFilter.Q.setValueAtTime(0.7, t);

      // Stereo panning for delay taps
      this.delayPanLeft = this._createPanner(-0.7);
      this.delayPanRight = this._createPanner(0.7);

      // Ping-pong routing:
      // Input -> delayLeft
      this.delaySendBus.connect(this.delayLeft);

      // Left branch: Input -> delayLeft -> delayPanLeft -> dryBus
      this.delayLeft.connect(this.delayPanLeft);
      this.delayPanLeft.connect(this.dryBus);

      // delayLeft -> delayFilter (lowpass 2200Hz, Q 0.7) -> delayFeedback (gain 0.28) -> delayRight
      this.delayLeft.connect(this.delayFilter);
      this.delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayRight);

      // Right branch: delayRight -> delayPanRight -> dryBus
      this.delayRight.connect(this.delayPanRight);
      this.delayPanRight.connect(this.dryBus);

      // delayRight -> delayFilter -> delayFeedback (gain 0.28) -> delayLeft
      this.delayRight.connect(this.delayFilter);
      this.delayFeedback.connect(this.delayLeft);
    }

    _buildAlgorithmicReverb() {
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 2.5; // 2.5 seconds tail
      const decay = 0.85;
      const buffer = this.ctx.createBuffer(2, length, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      // Procedural synthetic impulse response with early reflections and dampened tail
      let lastL = 0;
      let lastR = 0;
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t / decay);
        // Early reflections in the first 80ms
        const early = t < 0.08 ? (Math.random() * 2 - 1) * Math.sin(t * 800) * 0.6 : 0;
        // Diffuse noise with lowpass smoothing to simulate room absorption
        const rawL = (Math.random() * 2 - 1) * env + early;
        const rawR = (Math.random() * 2 - 1) * env + early;
        lastL = lastL * 0.35 + rawL * 0.65;
        lastR = lastR * 0.35 + rawR * 0.65;
        left[i] = lastL;
        right[i] = lastR;
      }

      this.reverbIRBuffer = buffer;
      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this.reverbIRBuffer;

      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.setValueAtTime(0.55, this.ctx.currentTime);

      this.reverbSendBus.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.dryBus);
    }

    _generateNoiseBuffers() {
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 2.0;

      // 1. White Noise
      this.whiteNoiseBuffer = this.ctx.createBuffer(2, length, sampleRate);
      const wL = this.whiteNoiseBuffer.getChannelData(0);
      const wR = this.whiteNoiseBuffer.getChannelData(1);
      for (let i = 0; i < length; i++) {
        wL[i] = Math.random() * 2 - 1;
        wR[i] = Math.random() * 2 - 1;
      }

      // 2. Pink Noise (Paul Kellet's filter)
      this.pinkNoiseBuffer = this.ctx.createBuffer(2, length, sampleRate);
      const pL = this.pinkNoiseBuffer.getChannelData(0);
      const pR = this.pinkNoiseBuffer.getChannelData(1);
      let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0, b6L = 0;
      let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0, b6R = 0;
      for (let i = 0; i < length; i++) {
        const whiteL = Math.random() * 2 - 1;
        b0L = 0.99886 * b0L + whiteL * 0.0555179;
        b1L = 0.99332 * b1L + whiteL * 0.0750759;
        b2L = 0.96900 * b2L + whiteL * 0.1538520;
        b3L = 0.86650 * b3L + whiteL * 0.3104856;
        b4L = 0.55000 * b4L + whiteL * 0.5329522;
        b5L = -0.7616 * b5L - whiteL * 0.0168980;
        pL[i] = (b0L + b1L + b2L + b3L + b4L + b5L + b6L + whiteL * 0.5362) * 0.11;
        b6L = whiteL * 0.115926;

        const whiteR = Math.random() * 2 - 1;
        b0R = 0.99886 * b0R + whiteR * 0.0555179;
        b1R = 0.99332 * b1R + whiteR * 0.0750759;
        b2R = 0.96900 * b2R + whiteR * 0.1538520;
        b3R = 0.86650 * b3R + whiteR * 0.3104856;
        b4R = 0.55000 * b4R + whiteR * 0.5329522;
        b5R = -0.7616 * b5R - whiteR * 0.0168980;
        pR[i] = (b0R + b1R + b2R + b3R + b4R + b5R + b6R + whiteR * 0.5362) * 0.11;
        b6R = whiteR * 0.115926;
      }
    }

    _buildDangerDrone() {
      this.dangerGain = this.ctx.createGain();
      this.dangerGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.dangerFilter = this.ctx.createBiquadFilter();
      this.dangerFilter.type = 'bandpass';
      this.dangerFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
      this.dangerFilter.Q.setValueAtTime(3.2, this.ctx.currentTime);

      // Low tension cluster oscillators
      this.dangerOsc1 = this.ctx.createOscillator();
      this.dangerOsc1.type = 'sawtooth';
      this.dangerOsc1.frequency.setValueAtTime(58.27, this.ctx.currentTime); // Bb1 tension drone

      this.dangerOsc2 = this.ctx.createOscillator();
      this.dangerOsc2.type = 'sine';
      this.dangerOsc2.frequency.setValueAtTime(61.74, this.ctx.currentTime); // B1 minor second dissonance

      this.dangerOsc1.connect(this.dangerFilter);
      this.dangerOsc2.connect(this.dangerFilter);
      this.dangerFilter.connect(this.dangerGain);
      this.dangerGain.connect(this.dryBus);

      this.dangerOsc1.start();
      this.dangerOsc2.start();
    }

    _createPanner(panValue = 0) {
      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(clamp(panValue, -1, 1), this.ctx.currentTime);
        return panner;
      }
      // Fallback gain node if StereoPanner is not supported
      const gain = this.ctx.createGain();
      gain.pan = { setValueAtTime: () => {} };
      return gain;
    }

    // ==========================================
    // BPM & Beat Synchronization API
    // ==========================================

    getBPM() {
      return this.currentBpm;
    }

    getBeatPhase() {
      if (!this.ctx || !this.isPlaying) return 0.0;
      const spb = 60.0 / this.currentBpm;
      const elapsed = Math.max(0, this.ctx.currentTime - this.musicStartTime);
      return (elapsed % spb) / spb;
    }

    isOnBeatWindow(tolerance = 0.24) {
      const phase = this.getBeatPhase();
      return phase < tolerance || phase > (1.0 - tolerance);
    }

    onBeat(callback) {
      if (typeof callback === 'function') {
        this.beatCallbacks.push(callback);
      }
      return () => {
        const idx = this.beatCallbacks.indexOf(callback);
        if (idx !== -1) this.beatCallbacks.splice(idx, 1);
      };
    }

    // ==========================================
    // Music Playback & Stage Control
    // ==========================================

    startMusic(stageIndex = 0) {
      this.init();
      this.resume();
      if (!this.ctx) return this;

      const targetStage = clamp(Math.floor(stageIndex), 0, STAGES.length - 1);

      if (this.isPlaying) {
        if (this.currentStageIndex !== targetStage) {
          this.crossfadeToStage(targetStage, 2.8);
        }
        return this;
      }

      this.currentStageIndex = targetStage;
      this.currentStage = STAGES[targetStage];
      this.currentBpm = this.currentStage.bpm;

      // Update delay times smoothly to match new BPM
      if (this.delayLeft && this.ctx) {
        const beatSec = 60.0 / this.currentBpm;
        const now = this.ctx.currentTime;
        this.delayLeft.delayTime.setTargetAtTime(beatSec * 0.5, now, 0.2);
        this.delayRight.delayTime.setTargetAtTime(beatSec * 0.75, now, 0.2);
      }

      this.isPlaying = true;
      this.musicStartTime = this.ctx.currentTime;
      this.current16thNote = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.05;

      this._syncExternalTrackPlayback();
      this._runScheduler();
      return this;
    }

    stopMusic() {
      this.isPlaying = false;
      this._syncExternalTrackPlayback();
      if (this.schedulerTimer) {
        clearTimeout(this.schedulerTimer);
        this.schedulerTimer = null;
      }
      return this;
    }

    setStage(stageIndex) {
      const idx = clamp(Math.floor(stageIndex), 0, STAGES.length - 1);
      if (this.isPlaying) {
        this.crossfadeToStage(idx, 2.8);
      } else {
        this.currentStageIndex = idx;
        this.currentStage = STAGES[idx];
        this.currentBpm = this.currentStage.bpm;

        // Update delay times smoothly to match new BPM
        if (this.delayLeft && this.ctx) {
          const beatSec = 60.0 / this.currentBpm;
          const now = this.ctx.currentTime;
          this.delayLeft.delayTime.setTargetAtTime(beatSec * 0.5, now, 0.2);
          this.delayRight.delayTime.setTargetAtTime(beatSec * 0.75, now, 0.2);
        }
      }
      return this;
    }

    crossfadeToStage(newStageIndex, durationSec = 2.8) {
      const nextIdx = clamp(Math.floor(newStageIndex), 0, STAGES.length - 1);
      const prevIdx = this.currentStageIndex;

      if (prevIdx === nextIdx) {
        if (this.isPlaying) {
          const track = this.externalTracks[nextIdx];
          const gain = this.externalTrackGains[nextIdx];
          if (track) track.play().catch(() => {});
          if (gain && this.ctx) {
            gain.gain.cancelScheduledValues(this.ctx.currentTime);
            gain.gain.setValueAtTime(0.95, this.ctx.currentTime);
          }
        }
        return this;
      }

      this.currentStageIndex = nextIdx;
      this.currentStage = STAGES[nextIdx];
      this.currentBpm = this.currentStage.bpm;

      // Update delay times smoothly to match new BPM
      if (this.delayLeft && this.ctx) {
        const beatSec = 60.0 / this.currentBpm;
        const now = this.ctx.currentTime;
        this.delayLeft.delayTime.setTargetAtTime(beatSec * 0.5, now, 0.2);
        this.delayRight.delayTime.setTargetAtTime(beatSec * 0.75, now, 0.2);
      }

      const currTrack = this.externalTracks[prevIdx];
      const currGain = this.externalTrackGains[prevIdx];
      const nextTrack = this.externalTracks[nextIdx];
      const nextGain = this.externalTrackGains[nextIdx];

      this.activeExternalAudio = nextTrack;

      if (this.ctx) {
        const now = this.ctx.currentTime;

        if (nextTrack) {
          // Sincroniza la posición temporal ("misma etapa")
          let progress = (currTrack && currTrack.duration > 0) ? (currTrack.currentTime / currTrack.duration) % 1.0 : 0.0;
          if (nextTrack.duration > 0) {
            nextTrack.currentTime = (progress * nextTrack.duration) % nextTrack.duration;
          } else {
            nextTrack.currentTime = currTrack ? (currTrack.currentTime % 180) : 0;
          }

          nextTrack.play().catch(() => {});

          if (nextGain) {
            nextGain.gain.cancelScheduledValues(now);
            nextGain.gain.setValueAtTime(Math.max(0.0001, nextGain.gain.value), now);
            nextGain.gain.linearRampToValueAtTime(0.95, now + durationSec);
          }
        }

        if (currGain) {
          currGain.gain.cancelScheduledValues(now);
          currGain.gain.setValueAtTime(currGain.gain.value, now);
          currGain.gain.linearRampToValueAtTime(0.0001, now + durationSec);
        }

        setTimeout(() => {
          if (currTrack && this.currentStageIndex !== prevIdx) {
            currTrack.pause();
          }
        }, durationSec * 1000 + 100);
      }

      return this;
    }

    setMuted(muted) {
      this.isMuted = !!muted;
      if (!this.masterGain || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0.0001 : this.volume, now, 0.05);
    }

    toggleMute() {
      this.setMuted(!this.isMuted);
      return this.isMuted;
    }

    setVolume(val) {
      this.volume = clamp(val, 0.0, 1.0);
      if (!this.masterGain || !this.ctx || this.isMuted) return;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.volume, now, 0.05);
    }

    // ==========================================
    // Lookahead Scheduler
    // ==========================================

    _runScheduler() {
      if (!this.isPlaying || !this.ctx) return;

      while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
        this._schedule16thStep(this.current16thNote, this.nextNoteTime);
        this._advance16thStep();
      }

      this.schedulerTimer = setTimeout(() => {
        this._runScheduler();
      }, this.lookahead);
    }

    _advance16thStep() {
      const secondsPer16th = (60.0 / this.currentBpm) / 4.0;
      this.nextNoteTime += secondsPer16th;
      this.current16thNote++;
    }

    _schedule16thStep(step, time) {
      const stage = this.currentStage;
      const stepInBar = step % 16;
      const barIndex = Math.floor(step / 16);
      const isQuarterBeat = step % 4 === 0;
      const beatIndex = Math.floor(step / 4);

      // 1. Dispatch quarter-note beat callbacks
      if (isQuarterBeat) {
        const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
        setTimeout(() => {
          if (!this.isPlaying) return;
          for (let i = 0; i < this.beatCallbacks.length; i++) {
            try {
              this.beatCallbacks[i](beatIndex, this.currentBpm, this.currentStageIndex);
            } catch (err) {
              console.error('Beat callback error:', err);
            }
          }
        }, delayMs);
      }

      // 2. Play Stage Backing Track Layers (only if external Suno MP3 is not active for this stage)
      const hasSunoTrack = this.externalTrackReady && this.externalTrackReady[this.currentStageIndex];
      if (!hasSunoTrack) switch (this.currentStageIndex) {
        case 0:
          this._scheduleStage0(stepInBar, barIndex, time);
          break;
        case 1:
          this._scheduleStage1(stepInBar, barIndex, time);
          break;
        case 2:
          this._scheduleStage2(stepInBar, barIndex, time);
          break;
      }

      // 3. Danger Pulse (when dangerLevel > 0.45)
      if (this.dangerLevel > 0.45 && step % 2 === 0) {
        this._playDangerPulse(time);
      }
    }

    // ==========================================
    // Procedural Backing Track Synthesis by Stage
    // ==========================================

    /**
     * Stage 0: "Abismo Bioluminiscente" (110 BPM, D Dorian)
     * Deep oceanic sub-bass pulse, warm underwater pad chords, bioluminescent bubble chimes.
     */
    _scheduleStage0(stepInBar, barIndex, time) {
      const stage = this.currentStage;
      const chord = stage.chords[barIndex % stage.chords.length];

      // Pad chord (every 16 steps = start of bar)
      if (stepInBar === 0) {
        this._playUnderwaterPad(chord, stage.rootMidi, time, 4.2);
      }

      // Oceanic Sub-Bass Pulse (Beat 1, 2+, 3, 4+)
      if (stepInBar === 0 || stepInBar === 6 || stepInBar === 8 || stepInBar === 14) {
        const bassMidi = stage.rootMidi - 12 + stage.bassPattern[barIndex % stage.bassPattern.length];
        this._playOceanSubBass(bassMidi, time, 0.48);
      }

      // Percussion: Oceanic sub kick on 0 & 8, soft splash on 4 & 12
      if (stepInBar === 0 || stepInBar === 8) {
        this._playOceanKick(time);
      } else if (stepInBar === 4 || stepInBar === 12) {
        this._playOceanSplash(time);
      }

      // Bioluminescent bubble chime (subtle random probability)
      if (Math.random() < stage.bubbleRate && stepInBar % 4 !== 0) {
        const noteIdx = Math.floor(Math.random() * stage.scale.length);
        const midi = stage.rootMidi + 24 + stage.scale[noteIdx];
        this._playBubblePing(midi, time);
      }
    }

    /**
     * Stage 1: "Cyberpunk Synthwave" (128 BPM, A Minor)
     * Driving 16th-note saw/square bass arpeggio, punchy kick & gated snare, vocoder swells.
     */
    _scheduleStage1(stepInBar, barIndex, time) {
      const stage = this.currentStage;
      const chord = stage.chords[barIndex % stage.chords.length];
      const rootOffset = stage.bassPattern[barIndex % stage.bassPattern.length];

      // 16th-note driving rolling bass arpeggio
      // Octave jump pattern: Root, Root, Octave, Root, 5th, Root, Octave...
      const octaveOffsets = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 10, 7, 12, 0];
      const bassMidi = stage.rootMidi - 12 + rootOffset + octaveOffsets[stepInBar];
      this._playSynthwaveBass(bassMidi, time, 0.14);

      // Kick on every beat (4-on-the-floor)
      if (stepInBar % 4 === 0) {
        this._playSynthKick(time);
      }

      // Gated Snare on beats 2 and 4 (step 4 and 12)
      if (stepInBar === 4 || stepInBar === 12) {
        this._playGatedSnare(time);
      }

      // Synthwave hi-hat on offbeat 16ths (steps 2, 6, 10, 14)
      if (stepInBar % 2 === 0 && stepInBar % 4 !== 0) {
        this._playSynthHiHat(time, 0.04);
      }

      // Retro Saw Chord Swells on step 0 and step 8
      if (stepInBar === 0 || stepInBar === 8) {
        this._playSynthwaveChords(chord, stage.rootMidi, time, 1.8);
      }
    }

    /**
     * Stage 2: "Nebulosa Cósmica" (138 BPM, F# Lydian)
     * Shimmering celestial choir pads, cosmic bell arpeggios, deep pulsar bass.
     */
    _scheduleStage2(stepInBar, barIndex, time) {
      const stage = this.currentStage;
      const chord = stage.chords[barIndex % stage.chords.length];

      // Celestial Choir Pad (start of bar)
      if (stepInBar === 0) {
        this._playCelestialChoir(chord, stage.rootMidi, time, 4.0);
      }

      // Pulsar Sub-Bass on syncopated cosmic steps: 0, 3, 6, 8, 11, 14
      if ([0, 3, 6, 8, 11, 14].includes(stepInBar)) {
        const rootOffset = stage.bassPattern[barIndex % stage.bassPattern.length];
        const bassMidi = stage.rootMidi - 12 + rootOffset;
        this._playPulsarBass(bassMidi, time, 0.28);
      }

      // Cosmic Bell Arpeggio on every 16th note
      const bellNote = chord[stepInBar % chord.length];
      const bellMidi = stage.rootMidi + 24 + bellNote;
      this._playCosmicBell(bellMidi, time, 0.16);

      // Deep pulsar kick on beat 1 and 3 (0 and 8)
      if (stepInBar === 0 || stepInBar === 8) {
        this._playPulsarKick(time);
      }
      // Cosmic reverse swoosh snare on beat 2 and 4 (4 and 12)
      if (stepInBar === 4 || stepInBar === 12) {
        this._playCosmicSnare(time);
      }
      // Stardust shimmer hi-hats
      if (stepInBar % 2 === 1) {
        this._playStardustHiHat(time);
      }
    }

    // ==========================================
    // Procedural Voice Synthesizers
    // ==========================================

    // --- Underwater / Stage 0 Voices ---
    _playOceanSubBass(midi, time, duration) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(midi), time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, time);
      filter.Q.setValueAtTime(2.0, time);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.45, time + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);

      osc.start(time);
      osc.stop(time + duration);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    }

    _playUnderwaterPad(chordIntervals, rootMidi, time, duration) {
      if (!this.ctx) return;
      for (let i = 0; i < chordIntervals.length; i++) {
        const midi = rootMidi + 12 + chordIntervals[i];
        const freq = midiToFreq(midi);

        // Dual detuned oscillators for lush warmth
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, time);
        osc2.frequency.setValueAtTime(freq * 1.002, time); // Subtle warm detune

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(650, time);
        filter.frequency.exponentialRampToValueAtTime(420, time + duration);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(0.08 / chordIntervals.length, time + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicBus);
        gain.connect(this.reverbSendBus);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);

        const cleanup = () => {
          osc1.disconnect();
          osc2.disconnect();
          filter.disconnect();
          gain.disconnect();
        };
        osc1.onended = cleanup;
      }
    }

    _playOceanKick(time) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, time);
      osc.frequency.exponentialRampToValueAtTime(36, time + 0.16);

      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

      osc.connect(gain);
      gain.connect(this.drumBus);
      osc.start(time);
      osc.stop(time + 0.23);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    _playOceanSplash(time) {
      if (!this.ctx || !this.pinkNoiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.pinkNoiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, time);
      filter.Q.setValueAtTime(1.8, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.28, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.drumBus);
      gain.connect(this.reverbSendBus);

      src.start(time);
      src.stop(time + 0.2);
      src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    _playBubblePing(midi, time) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this._createPanner((Math.random() * 1.4) - 0.7);

      osc.type = 'sine';
      const baseFreq = midiToFreq(midi);
      osc.frequency.setValueAtTime(baseFreq * 0.75, time);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, time + 0.09); // Rising bubble chirp

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.musicBus);
      panner.connect(this.delaySendBus);

      osc.start(time);
      osc.stop(time + 0.15);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); };
    }

    // --- Synthwave / Stage 1 Voices ---
    _playSynthwaveBass(midi, time, duration) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(midiToFreq(midi), time);

      filter.type = 'lowpass';
      filter.Q.setValueAtTime(3.8, time);
      // Snappy filter envelope
      filter.frequency.setValueAtTime(1600, time);
      filter.frequency.exponentialRampToValueAtTime(140, time + duration);

      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);

      osc.start(time);
      osc.stop(time + duration);
      osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    _playSynthKick(time) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.11);

      gain.gain.setValueAtTime(0.85, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

      osc.connect(gain);
      gain.connect(this.drumBus);
      osc.start(time);
      osc.stop(time + 0.19);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    _playGatedSnare(time) {
      if (!this.ctx || !this.whiteNoiseBuffer) return;
      // Tone body
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, time);
      osc.frequency.exponentialRampToValueAtTime(110, time + 0.08);
      oscGain.gain.setValueAtTime(0.4, time);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
      osc.connect(oscGain);
      oscGain.connect(this.drumBus);
      osc.start(time);
      osc.stop(time + 0.13);

      // Gated Noise
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.whiteNoiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, time);
      filter.Q.setValueAtTime(1.5, time);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.55, time);
      // Gated cutoff: sharp cut at 0.16s
      noiseGain.gain.setValueAtTime(0.45, time + 0.12);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.drumBus);
      noiseGain.connect(this.reverbSendBus);

      noise.start(time);
      noise.stop(time + 0.17);
      noise.onended = () => {
        osc.disconnect();
        oscGain.disconnect();
        noise.disconnect();
        filter.disconnect();
        noiseGain.disconnect();
      };
    }

    _playSynthHiHat(time, duration = 0.04) {
      if (!this.ctx || !this.whiteNoiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(8000, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.drumBus);

      src.start(time);
      src.stop(time + duration);
      src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    _playSynthwaveChords(chordIntervals, rootMidi, time, duration) {
      if (!this.ctx) return;
      for (let i = 0; i < chordIntervals.length; i++) {
        const midi = rootMidi + 12 + chordIntervals[i];
        const freq = midiToFreq(midi);

        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.Q.setValueAtTime(2.2, time);
        filter.frequency.setValueAtTime(500, time);
        filter.frequency.linearRampToValueAtTime(2200, time + 0.35);
        filter.frequency.exponentialRampToValueAtTime(700, time + duration);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(0.07 / chordIntervals.length, time + 0.25);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicBus);
        gain.connect(this.delaySendBus);

        osc.start(time);
        osc.stop(time + duration);
        osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
      }
    }

    // --- Cosmic / Stage 2 Voices ---
    _playPulsarBass(midi, time, duration) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      const panner = this._createPanner(Math.sin(time * 3.5) * 0.5);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(midiToFreq(midi), time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, time);
      filter.Q.setValueAtTime(2.8, time);

      gain.gain.setValueAtTime(0.42, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.musicBus);

      osc.start(time);
      osc.stop(time + duration);
      osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); };
    }

    _playCelestialChoir(chordIntervals, rootMidi, time, duration) {
      if (!this.ctx) return;
      for (let i = 0; i < chordIntervals.length; i++) {
        const midi = rootMidi + 24 + chordIntervals[i];
        const freq = midiToFreq(midi);

        // Vocal formant emulation via dual detuned oscillators + bandpass
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(freq * 0.998, time);
        osc2.frequency.setValueAtTime(freq * 1.002, time);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1250, time); // Formant center
        filter.Q.setValueAtTime(2.2, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(0.06 / chordIntervals.length, time + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicBus);
        gain.connect(this.reverbSendBus);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
        osc1.onended = () => { osc1.disconnect(); osc2.disconnect(); filter.disconnect(); gain.disconnect(); };
      }
    }

    _playCosmicBell(midi, time, duration) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const panner = this._createPanner(Math.sin(midi) * 0.6);

      const freq = midiToFreq(midi);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(freq * 2.756, time); // Bell inharmonicity

      gain.gain.setValueAtTime(0.09, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(gain);
      overtone.connect(gain);
      gain.connect(panner);
      panner.connect(this.musicBus);
      panner.connect(this.delaySendBus);

      osc.start(time);
      overtone.start(time);
      osc.stop(time + duration);
      overtone.stop(time + duration);
      osc.onended = () => { osc.disconnect(); overtone.disconnect(); gain.disconnect(); panner.disconnect(); };
    }

    _playPulsarKick(time) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, time);
      osc.frequency.exponentialRampToValueAtTime(32, time + 0.16);

      gain.gain.setValueAtTime(0.85, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);

      osc.connect(gain);
      gain.connect(this.drumBus);
      osc.start(time);
      osc.stop(time + 0.25);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    _playCosmicSnare(time) {
      if (!this.ctx || !this.pinkNoiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.pinkNoiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1900, time);
      filter.Q.setValueAtTime(2.0, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.4, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.drumBus);
      gain.connect(this.reverbSendBus);

      src.start(time);
      src.stop(time + 0.25);
      src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    _playStardustHiHat(time) {
      if (!this.ctx || !this.whiteNoiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.whiteNoiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(9500, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.drumBus);

      src.start(time);
      src.stop(time + 0.06);
      src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    _playDangerPulse(time) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, time); // B5 alarm tick

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.15 * this.dangerLevel, time + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

      osc.connect(gain);
      gain.connect(this.dangerGain);
      osc.start(time);
      osc.stop(time + 0.05);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    // ==========================================
    // Synesthetic Player Action Sounds API
    // ==========================================

    /**
     * Plays a delicate quantized note from current scale, stereo-panned by column (0..9).
     * @param {number} dir - Movement direction (-1 = left, +1 = right, 0 = neutral)
     * @param {number} col - Column index (0..9)
     */
    playMove(dir = 0, col = 5) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const stage = this.currentStage;
      const now = this.ctx.currentTime;

      // Pan calculation: 0 = far left (-0.8), 9 = far right (+0.8)
      const clampedCol = clamp(col, 0, 9);
      const pan = ((clampedCol - 4.5) / 4.5) * 0.78;
      const panner = this._createPanner(pan);

      // Quantized note in scale
      const noteDegree = clampedCol % stage.scale.length;
      const octaveShift = Math.floor(clampedCol / stage.scale.length) * 12;
      const midi = stage.rootMidi + 24 + stage.scale[noteDegree] + octaveShift;
      const freq = midiToFreq(midi);

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (stage.id === 0) {
        // Kalimba pluck (crystalline sine + 2nd harmonic)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      } else if (stage.id === 1) {
        // Synth pluck (saw wave + lowpass sweep)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2200, now);
        f.frequency.exponentialRampToValueAtTime(260, now + 0.08);
        osc.connect(f);
        f.connect(gain);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      } else {
        // Cosmic bell ping
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      }

      if (stage.id !== 1) osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.sfxBus);
      panner.connect(this.delaySendBus);

      osc.start(now);
      osc.stop(now + 0.12);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        panner.disconnect();
      };
    }

    /**
     * Plays an ascending arpeggio note in current scale.
     * Consecutive rotations within 600ms advance rotationCycleIndex creating a fluid musical arpeggio!
     * @param {number} dir - Rotation direction (1 = CW, -1 = CCW)
     * @param {number} rotationStep - Piece rotation state (0..3)
     * @param {number} combo - Current combo count
     */
    playRotate(dir = 1, rotationStep = 0, combo = 0) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const stage = this.currentStage;
      const now = this.ctx.currentTime;
      const perfNow = performance.now();

      // Fluid arpeggio tracking
      if (perfNow - this.lastRotateTime < 600) {
        this.rotationCycleIndex = (this.rotationCycleIndex + 1) % 8;
      } else {
        this.rotationCycleIndex = 0;
      }
      this.lastRotateTime = perfNow;

      // Note selection: Ascending scale intervals across 2 octaves
      const arpSteps = [0, 2, 4, 7, 9, 12, 14, 16];
      const scaleDegree = arpSteps[this.rotationCycleIndex];
      const octave = Math.floor(scaleDegree / 7);
      const degreeInScale = scaleDegree % stage.scale.length;
      const midi = stage.rootMidi + 24 + stage.scale[degreeInScale] + (octave * 12);
      const freq = midiToFreq(midi);

      const panner = this._createPanner(dir < 0 ? -0.25 : 0.25);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (stage.id === 0) {
        // Crystalline marimba / aquatic harp
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      } else if (stage.id === 1) {
        // Analog brass lead arpeggio
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(3.5, now);
        filter.frequency.setValueAtTime(2600, now);
        filter.frequency.exponentialRampToValueAtTime(450, now + 0.14);
        osc.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      } else {
        // Cosmic bell chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      }

      if (stage.id !== 1) osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.sfxBus);
      panner.connect(this.reverbSendBus);

      osc.start(now);
      osc.stop(now + 0.22);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); };
    }

    /**
     * Subtle pitched harmonic tick that rises in pitch as row increases.
     * @param {number} row - Board row index (0..19)
     */
    playSoftDrop(row = 0) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Pitch rises exponentially with row index
      const baseFreq = 340;
      const freq = baseFreq * Math.pow(1.038, clamp(row, 0, 20));

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(gain);
      gain.connect(this.sfxBus);

      osc.start(now);
      osc.stop(now + 0.04);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    /**
     * Deep sub-bass impact + chord stab; adds a bright resonant fifth/octave shimmer if onBeat is true.
     * @param {number} distance - Drop distance in cells
     * @param {string} pieceType - Tetrimino type ('I', 'O', 'T', 'S', 'Z', 'J', 'L')
     * @param {boolean} onBeat - Whether drop hit cleanly within on-beat tolerance
     */
    playHardDrop(distance = 10, pieceType = 'I', onBeat = false) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const stage = this.currentStage;
      const now = this.ctx.currentTime;

      // 1. Deep Sub-Bass Impact (Pitch dive 140Hz -> 35Hz)
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.2);
      subGain.gain.setValueAtTime(0.75, now);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      subOsc.connect(subGain);
      subGain.connect(this.sfxBus);
      subOsc.start(now);
      subOsc.stop(now + 0.3);
      subOsc.onended = () => { subOsc.disconnect(); subGain.disconnect(); };

      // 2. Tactile Click Transient
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(420, now);
      clickOsc.frequency.exponentialRampToValueAtTime(60, now + 0.03);
      clickGain.gain.setValueAtTime(0.35, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      clickOsc.connect(clickGain);
      clickGain.connect(this.sfxBus);
      clickOsc.start(now);
      clickOsc.stop(now + 0.045);
      clickOsc.onended = () => { clickOsc.disconnect(); clickGain.disconnect(); };

      // 3. Resonant Chord Stab
      const chordMidi1 = stage.rootMidi + 12;
      const chordMidi2 = stage.rootMidi + 19; // Perfect 5th
      [chordMidi1, chordMidi2].forEach(midi => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(midiToFreq(midi), now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(now);
        osc.stop(now + 0.19);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      });

      // 4. ON-BEAT BONUS: Bright resonant fifth/octave shimmer cascade!
      if (onBeat) {
        const shimmerMidi1 = stage.rootMidi + 31; // High 5th
        const shimmerMidi2 = stage.rootMidi + 36; // 3 Octaves up
        [shimmerMidi1, shimmerMidi2].forEach((midi, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const panner = this._createPanner(idx === 0 ? -0.4 : 0.4);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(midiToFreq(midi), now + 0.02);

          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(0.25, now + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

          osc.connect(gain);
          gain.connect(panner);
          panner.connect(this.sfxBus);
          panner.connect(this.delaySendBus);
          panner.connect(this.reverbSendBus);

          osc.start(now + 0.02);
          osc.stop(now + 0.46);
          osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); };
        });
      }
    }

    /**
     * Warm tactile crystal/synth lock click.
     * @param {string} pieceType - Tetrimino type
     * @param {number} row - Board landing row
     */
    playLock(pieceType = 'T', row = 18) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const stage = this.currentStage;
      const now = this.ctx.currentTime;

      // Resonant body tone in key
      const bodyOsc = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      const midi = stage.rootMidi + 12 + (stage.scale[row % stage.scale.length]);

      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(midiToFreq(midi), now);
      bodyGain.gain.setValueAtTime(0.22, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      bodyOsc.connect(bodyGain);
      bodyGain.connect(this.sfxBus);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.09);
      bodyOsc.onended = () => { bodyOsc.disconnect(); bodyGain.disconnect(); };

      // High transient snap click
      if (this.whiteNoiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.whiteNoiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3200, now);
        filter.Q.setValueAtTime(4.0, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.sfxBus);

        noise.start(now);
        noise.stop(now + 0.03);
        noise.onended = () => { noise.disconnect(); filter.disconnect(); noiseGain.disconnect(); };
      }
    }

    /**
     * Smooth upward/downward filter whoosh.
     */
    playHold() {
      if (!this.ctx || this.ctx.state !== 'running' || !this.pinkNoiseBuffer) return;
      const now = this.ctx.currentTime;

      // Filtered whoosh sweep
      const src = this.ctx.createBufferSource();
      src.buffer = this.pinkNoiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(3.2, now);
      filter.frequency.setValueAtTime(350, now);
      filter.frequency.exponentialRampToValueAtTime(2600, now + 0.18);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.32, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxBus);

      // Pitch glide sine voice
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(740, now + 0.18);
      oscGain.gain.setValueAtTime(0.15, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      osc.connect(oscGain);
      oscGain.connect(this.sfxBus);

      src.start(now);
      src.stop(now + 0.23);
      osc.start(now);
      osc.stop(now + 0.23);

      src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
      osc.onended = () => { osc.disconnect(); oscGain.disconnect(); };
    }

    /**
     * Synesthetic Line Clear Fanfares:
     * - 1 line: Elegant 3-note harp/synth shimmer.
     * - 2-3 lines: Lush rising chord arpeggio.
     * - 4 lines (TETRIS) or isTSpin: Massive euphoric multi-octave chord progression + stardust shimmer sweep!
     * @param {number} lines - Number of lines cleared (1..4)
     * @param {boolean} isTSpin - Whether clear was executed via T-Spin
     * @param {number} combo - Consecutive combo counter
     * @param {boolean} inZone - Whether clear occurred during Zone Mode
     */
    playLineClear(lines = 1, isTSpin = false, combo = 0, inZone = false) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const stage = this.currentStage;
      const now = this.ctx.currentTime;

      if (lines === 1 && !isTSpin) {
        // --- 1 Line: Elegant 3-Note Shimmer ---
        const notes = [0, 4, 7]; // Root, 3rd, 5th
        notes.forEach((interval, i) => {
          const t = now + i * 0.06;
          const midi = stage.rootMidi + 24 + interval;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const panner = this._createPanner((i - 1) * 0.35);

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(midiToFreq(midi), t);

          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.28, t + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

          osc.connect(gain);
          gain.connect(panner);
          panner.connect(this.sfxBus);
          panner.connect(this.delaySendBus);

          osc.start(t);
          osc.stop(t + 0.36);
          osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); };
        });

      } else if ((lines === 2 || lines === 3) && !isTSpin) {
        // --- 2-3 Lines: Lush Rising Chord Arpeggio ---
        const notes = [0, 3, 7, 10, 14, 17]; // Lush minor/dorian/lydian 9th/11th
        const count = lines === 2 ? 4 : 5;
        for (let i = 0; i < count; i++) {
          const t = now + i * 0.05;
          const midi = stage.rootMidi + 24 + notes[i];
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const panner = this._createPanner(((i / count) * 1.4) - 0.7);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(midiToFreq(midi), t);

          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

          osc.connect(gain);
          gain.connect(panner);
          panner.connect(this.sfxBus);
          panner.connect(this.delaySendBus);
          panner.connect(this.reverbSendBus);

          osc.start(t);
          osc.stop(t + 0.46);
          osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); };
        }

        // Sub bass lift
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(stage.rootMidi > 45 ? 110 : 85, now);
        subGain.gain.setValueAtTime(0.4, now);
        subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        sub.connect(subGain);
        subGain.connect(this.sfxBus);
        sub.start(now);
        sub.stop(now + 0.36);
        sub.onended = () => { sub.disconnect(); subGain.disconnect(); };

      } else {
        // --- 4 Lines (TETRIS) or T-Spin: Massive Euphoric Multi-Octave Explosion ---
        // 1. Multi-octave chord progression (6 voices across 3 octaves)
        const chordVoices = isTSpin
          ? [0, 6, 10, 15, 18, 22] // Exotic diminished/augmented T-Spin coloration
          : [0, 7, 12, 16, 19, 24]; // Majestic euphoric major/dorian spread

        chordVoices.forEach((interval, i) => {
          const t = now + i * 0.035;
          const midi = stage.rootMidi + 12 + interval;
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const gain = this.ctx.createGain();
          const panner = this._createPanner((Math.random() * 1.2) - 0.6);

          osc1.type = 'sawtooth';
          osc2.type = 'sine';
          const freq = midiToFreq(midi);
          osc1.frequency.setValueAtTime(freq * 0.999, t);
          osc2.frequency.setValueAtTime(freq * 1.001, t);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(3800, t);
          filter.Q.setValueAtTime(1.8, t);

          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.38 / chordVoices.length, t + 0.06);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

          osc1.connect(filter);
          osc2.connect(filter);
          filter.connect(gain);
          gain.connect(panner);
          panner.connect(this.sfxBus);
          panner.connect(this.delaySendBus);
          panner.connect(this.reverbSendBus);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 1.25);
          osc2.stop(t + 1.25);
          osc1.onended = () => {
            osc1.disconnect();
            osc2.disconnect();
            filter.disconnect();
            gain.disconnect();
            panner.disconnect();
          };
        });

        // 2. Sub-Bass Swell
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(120, now);
        sub.frequency.exponentialRampToValueAtTime(32, now + 0.6);
        subGain.gain.setValueAtTime(0.85, now);
        subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
        sub.connect(subGain);
        subGain.connect(this.sfxBus);
        sub.start(now);
        sub.stop(now + 0.86);
        sub.onended = () => { sub.disconnect(); subGain.disconnect(); };

        // 3. Stardust Shimmer Sweep (White noise sweep + high bell cascade)
        if (this.whiteNoiseBuffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = this.whiteNoiseBuffer;
          const nFilter = this.ctx.createBiquadFilter();
          nFilter.type = 'bandpass';
          nFilter.Q.setValueAtTime(4.5, now);
          nFilter.frequency.setValueAtTime(600, now);
          nFilter.frequency.exponentialRampToValueAtTime(8000, now + 0.6);

          const nGain = this.ctx.createGain();
          nGain.gain.setValueAtTime(0.0001, now);
          nGain.gain.linearRampToValueAtTime(0.4, now + 0.1);
          nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

          noise.connect(nFilter);
          nFilter.connect(nGain);
          nGain.connect(this.sfxBus);
          nGain.connect(this.reverbSendBus);

          noise.start(now);
          noise.stop(now + 0.8);
          noise.onended = () => { noise.disconnect(); nFilter.disconnect(); nGain.disconnect(); };
        }
      }
    }

    /**
     * Ramps master lowpass filter to 360Hz with Q=4.5 during Zone Mode for the underwater time-stop effect.
     * When deactivated, smoothly restores filter to 19000Hz with Q=0.7.
     * @param {boolean} active
     */
    setZoneMode(active) {
      this.inZone = !!active;
      if (!this.masterFilter || !this.ctx) return;
      const now = this.ctx.currentTime;

      this.masterFilter.frequency.cancelScheduledValues(now);
      this.masterFilter.Q.cancelScheduledValues(now);
      this.delayFeedback.gain.cancelScheduledValues(now);
      this.drumBus.gain.cancelScheduledValues(now);

      if (this.inZone) {
        // Underwater time-dilation: Muffled 360Hz with high resonant Q
        this.masterFilter.frequency.setTargetAtTime(360, now, 0.18);
        this.masterFilter.Q.setTargetAtTime(4.5, now, 0.18);
        // Feedback capped at 0.30
        this.delayFeedback.gain.setTargetAtTime(0.30, now, 0.18);
        // Muffle drums into a distant heartbeat
        this.drumBus.gain.setTargetAtTime(0.18, now, 0.18);
      } else {
        // Restore wide dynamic spectrum
        this.masterFilter.frequency.setTargetAtTime(19000, now, 0.14);
        this.masterFilter.Q.setTargetAtTime(0.7, now, 0.14);
        this.delayFeedback.gain.setTargetAtTime(0.28, now, 0.14);
        this.drumBus.gain.setTargetAtTime(0.85, now, 0.14);
      }
    }

    /**
     * Sweeps filter frequency from 360Hz to 19000Hz with an epic bass drop and polyphonic
     * choir/synth chord explosion scaled by linesCleared!
     * @param {number} linesCleared - Total lines accumulated during Zone Mode
     */
    triggerZoneRelease(linesCleared = 4) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const stage = this.currentStage;
      const now = this.ctx.currentTime;

      // 1. Master Filter Sweep (360Hz -> 19000Hz over 1.2s)
      this.masterFilter.frequency.cancelScheduledValues(now);
      this.masterFilter.Q.cancelScheduledValues(now);
      this.masterFilter.frequency.setValueAtTime(360, now);
      this.masterFilter.frequency.exponentialRampToValueAtTime(19000, now + 1.2);
      this.masterFilter.Q.setValueAtTime(4.5, now);
      this.masterFilter.Q.exponentialRampToValueAtTime(0.7, now + 1.2);

      // Restore drum bus and delay feedback
      this.delayFeedback.gain.setTargetAtTime(0.28, now, 0.4);
      this.drumBus.gain.setTargetAtTime(0.85, now, 0.4);
      this.inZone = false;

      // 2. Epic Sub-Bass Drop (160Hz -> 30Hz)
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(160, now);
      sub.frequency.exponentialRampToValueAtTime(30, now + 1.2);
      subGain.gain.setValueAtTime(0.95, now);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      sub.connect(subGain);
      subGain.connect(this.sfxBus);
      sub.start(now);
      sub.stop(now + 1.45);
      sub.onended = () => { sub.disconnect(); subGain.disconnect(); };

      // 3. Polyphonic Choir/Synth Chord Explosion (scaled by linesCleared)
      const count = clamp(Math.floor(4 + linesCleared * 0.75), 4, 14);
      const baseScale = [0, 2, 4, 7, 9, 11, 14, 16, 19, 23, 26, 28, 31, 36];
      for (let i = 0; i < count; i++) {
        const interval = baseScale[i % baseScale.length];
        const t = now + i * 0.04;
        const midi = stage.rootMidi + 12 + interval;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const panner = this._createPanner(((i / count) * 1.6) - 0.8);

        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(midiToFreq(midi), t);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.36 / Math.sqrt(count), t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);

        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.sfxBus);
        panner.connect(this.delaySendBus);
        panner.connect(this.reverbSendBus);

        osc.start(t);
        osc.stop(t + 1.7);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); };
      }

      // 4. White Noise Stardust Blast
      if (this.whiteNoiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.whiteNoiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(9000, now + 1.2);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.0001, now);
        nGain.gain.linearRampToValueAtTime(0.5, now + 0.1);
        nGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.sfxBus);
        nGain.connect(this.reverbSendBus);

        noise.start(now);
        noise.stop(now + 1.35);
        noise.onended = () => { noise.disconnect(); filter.disconnect(); nGain.disconnect(); };
      }
    }

    /**
     * Smoothly increases the volume of an ethereal choir/tension pad layer and subtle rapid pulse
     * as the stack approaches the top of the board.
     * @param {number} level0to1 - Stack danger ratio (0.0 = safe, 1.0 = top out imminent)
     */
    setDangerLevel(level0to1) {
      const clamped = clamp(level0to1, 0.0, 1.0);
      this.dangerLevel = clamped;
      if (!this.dangerGain || !this.ctx) return;
      const now = this.ctx.currentTime;
      // When dangerLevel <= 0.02, gain strictly drops to 0.0 to eliminate continuous hum
      const targetGain = clamped <= 0.02 ? 0.0 : Math.pow(clamped, 1.8) * 0.42;
      this.dangerGain.gain.cancelScheduledValues(now);
      this.dangerGain.gain.setTargetAtTime(targetGain, now, 0.1);
    }
  }

  // Expose as window.SynesthesiaAudioEngine and export for module systems
  global.SynesthesiaAudioEngine = SynesthesiaAudioEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SynesthesiaAudioEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
