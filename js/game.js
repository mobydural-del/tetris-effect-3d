/**
 * ============================================================================
 * TETRIS EFFECT: SYNESTHESIA JOURNEY 3D
 * js/game.js — Master Tetris Guideline Engine, Zone Time-Stop Mechanic,
 * Beat-Sync Judge, 2D Next/Hold Previews & Audiovisual Orchestrator
 * ============================================================================
 */

(function (global) {
  'use strict';

  // ==========================================================================
  // 1. Guideline Constants & Tetromino Definitions
  // ==========================================================================

  const BOARD_COLS = 10;
  const BOARD_ROWS = 20;

  // Vibrant high-contrast neon palette matching spec
  const PIECE_COLORS = {
    I: '#00f5d4', // Cyan Laser
    O: '#fee440', // Solar Gold
    T: '#c77dff', // Amethyst Plasma
    S: '#00f566', // Bioluminescent Emerald
    Z: '#ff2a85', // Crimson Neon
    J: '#3a86ff', // Deep Cobalt
    L: '#ff9e00'  // Amber Flare
  };

  // Tetromino matrices (0 / 1) in spawn orientation (Rotation 0)
  const PIECE_MATRICES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    O: [
      [1, 1],
      [1, 1]
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0]
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0]
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0]
    ]
  };

  // Standard Guideline Super Rotation System (SRS) Wall Kick Tables
  // Offset pairs: [dx, dy] where +dx is right, +dy is DOWN in grid coordinates
  const SRS_KICKS_JLSTZ = {
    '0->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3->2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3->0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
  };

  const SRS_KICKS_I = {
    '0->1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1->0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1->2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2->1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2->3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3->2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3->0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0->3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
  };

  const STAGES_DATA = [
    {
      id: 0,
      name: 'Abismo Bioluminiscente',
      sub: '110 BPM · D Dorian',
      bpm: 110,
      linesThreshold: 10
    },
    {
      id: 1,
      name: 'Cyberpunk Synthwave',
      sub: '128 BPM · A Minor',
      bpm: 128,
      linesThreshold: 20
    },
    {
      id: 2,
      name: 'Nebulosa Cósmica',
      sub: '138 BPM · F# Lydian',
      bpm: 138,
      linesThreshold: Infinity
    }
  ];

  // Helper: Rotate 2D square matrix
  function rotateMatrix(matrix, dir = 1) {
    const N = matrix.length;
    const result = Array.from({ length: N }, () => Array(N).fill(0));
    if (dir === 1) {
      // Clockwise
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          result[c][N - 1 - r] = matrix[r][c];
        }
      }
    } else {
      // Counter-Clockwise
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          result[N - 1 - c][r] = matrix[r][c];
        }
      }
    }
    return result;
  }

  // Helper: Safe requestAnimationFrame
  const safeRAF = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb => setTimeout(() => cb(Date.now()), 16));

  // ==========================================================================
  // 2. Master Game Engine Class
  // ==========================================================================

  class TetrisEffectGame {
    constructor() {
      // Audiovisual sub-systems
      this.audio = null;
      this.visuals = null;

      // Board Grid (20 rows x 10 cols)
      this.grid = this.createEmptyGrid();

      // Active & Preview State
      this.activePiece = null;
      this.holdPiece = null;
      this.canHold = true;
      this.bag = [];
      this.nextQueue = [];

      // Scoring, Level & Journey Progression
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.combo = -1;
      this.maxCombo = 0;
      this.backToBack = false;
      this.stageIndex = 0;

      // Gravity & Lock Delay
      this.gravityTimer = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.isLocking = false;
      this.lockDelayMs = 500;
      this.maxLockResets = 15;
      this.lastFallRow = 0;

      // Beat Synchronization Tracking
      this.beatCounter = 0;
      this.perfectBeatsCount = 0;
      this.totalJudgedActions = 0;
      this.syncBonusTotal = 0;
      this.syncFeedbackTimer = null;

      // Rotation Arpeggio Tracker
      this.rotationCycleIndex = 0;
      this.lastRotateTime = 0;
      this.lastActionWasRotate = false;

      // Zone Mechanic (Time-Stop Mode)
      this.zoneCharge = 50; // Starts at 50% for instant fun
      this.isZoneActive = false;
      this.zoneTimer = 0;
      this.zoneDuration = 0;
      this.zoneLinesCount = 0;
      this.zoneRows = [];

      // Game Loop & Input
      this.isRunning = false;
      this.isPaused = false;
      this.isGameOver = false;
      this.lastTimestamp = 0;
      this.keysDown = {};
      this.dasTimers = {};

      // DOM Elements Cache
      this.dom = {};
      this.cacheDOMElements();

      // Initialize Audiovisual Layers & Listeners
      this.initSubsystems();
      this.bindEvents();

      // Initial Previews & Board Setup
      this.refillBag();
      this.updateHUD();
      this.renderHoldPreview();
      this.renderNextPreview();

      // Send initial board state to 3D renderer
      if (this.visuals) {
        this.visuals.updateBoardState(this.grid, null, null, this.zoneRows);
      }
    }

    createEmptyGrid() {
      return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
    }

    cacheDOMElements() {
      const get = id => document.getElementById(id);
      this.dom = {
        canvasContainer: get('canvas-3d-container'),
        // Top bar
        stageBadge: get('hud-stage-badge'),
        stageName: get('hud-stage-name'),
        stageSub: get('hud-stage-sub'),
        btnStage0: get('btn-stage-0'),
        btnStage1: get('btn-stage-1'),
        btnStage2: get('btn-stage-2'),
        btnDemoCam: get('btn-demo-camera'),
        btnToggleCamFx: get('btn-toggle-cam-fx'),
        camFxLabel: get('cam-fx-label'),
        btnMute: get('btn-mute'),
        muteIcon: get('mute-icon'),
        muteLabel: get('mute-label'),
        btnPause: get('btn-pause'),
        // Left HUD
        holdCanvas: get('hold-canvas'),
        zoneFillBar: get('zone-fill-bar'),
        zonePercent: get('zone-percent'),
        zoneTimerText: get('zone-timer-text'),
        btnActivateZone: get('btn-activate-zone'),
        hudBpm: get('hud-bpm'),
        beatPulseDot: get('beat-pulse-dot'),
        syncFeedbackBanner: get('sync-feedback-banner'),
        // Center overlay
        actionCallout: get('action-callout'),
        zoneOverlayBanner: get('zone-overlay-banner'),
        // Right HUD
        nextCanvas: get('next-canvas'),
        hudScore: get('hud-score'),
        hudLines: get('hud-lines'),
        hudLevel: get('hud-level'),
        hudCombo: get('hud-combo'),
        hudSyncRate: get('hud-sync-rate'),
        // Mobile Dedicated HUD & Touch
        mobileTopBar: get('mobile-top-bar'),
        mobileScore: get('mobile-hud-score'),
        mobileLines: get('mobile-hud-lines'),
        mobileLevel: get('mobile-hud-level'),
        mobileStageBadge: get('mobile-stage-badge'),
        mobileBtnPause: get('mobile-btn-pause'),
        mobileBtnMute: get('mobile-btn-mute'),
        mobileBpm: get('mobile-hud-bpm'),
        mobileBeatPulseDot: get('mobile-beat-pulse-dot'),
        mobileZoneBtn: get('mobile-zone-thumb-btn'),
        mobileZonePct: get('mobile-zone-charge-pct'),
        touchGestureLayer: get('touch-gesture-layer'),
        touchEffectsOverlay: get('touch-effects-overlay'),
        holdCard: document.querySelector('.hold-card'),
        // Modals
        startModal: get('start-modal'),
        btnStartJourney: get('btn-start-journey'),
        pauseModal: get('pause-modal'),
        btnResume: get('btn-resume'),
        btnRestartPause: get('btn-restart-pause'),
        gameoverModal: get('gameover-modal'),
        finalScore: get('final-score'),
        finalLines: get('final-lines'),
        finalMaxCombo: get('final-max-combo'),
        finalSyncBonus: get('final-sync-bonus'),
        btnPlayAgain: get('btn-play-again')
      };
    }

    // ==========================================================================
    // 3. Subsystem Initialization (Audio & 3D Visuals)
    // ==========================================================================

    initSubsystems() {
      // 1. Procedural Audio Engine
      try {
        if (typeof global.SynesthesiaAudioEngine === 'function') {
          this.audio = new global.SynesthesiaAudioEngine();
          global.synesthesiaAudio = this.audio;

          // Wire BPM quarter-note callback for pulse effects
          this.audio.onBeat((beatIndex, bpm, stageIndex) => {
            this.beatCounter = beatIndex;
            // Visual pulse on the desktop HUD beat dot
            if (this.dom.beatPulseDot) {
              this.dom.beatPulseDot.classList.remove('pulsing');
              void this.dom.beatPulseDot.offsetWidth; // Reflow
              this.dom.beatPulseDot.classList.add('pulsing');
            }
            // Visual pulse on the mobile HUD beat dot
            if (this.dom.mobileBeatPulseDot) {
              this.dom.mobileBeatPulseDot.classList.remove('pulsing');
              void this.dom.mobileBeatPulseDot.offsetWidth; // Reflow
              this.dom.mobileBeatPulseDot.classList.add('pulsing');
            }
            // Background 3D ripple
            if (this.visuals) {
              this.visuals.triggerBeatPulse(beatIndex, 1.0, false);
            }
          });
        }
      } catch (err) {
        console.warn('[TetrisGame] Could not initialize audio engine:', err);
        this.audio = null;
      }

      // 2. Three.js 3D Visuals Engine
      try {
        if (typeof global.SynesthesiaVisuals3D === 'function' && this.dom.canvasContainer) {
          const viz = new global.SynesthesiaVisuals3D(this.dom.canvasContainer);
          viz.init();
          this.visuals = viz;
          global.synesthesiaVisuals = this.visuals;
        }
      } catch (err) {
        console.warn('[TetrisGame] Could not initialize 3D visuals engine:', err);
        this.visuals = null;
      }
    }

    // ==========================================================================
    // 4. User Input & Interactive Event Listeners
    // ==========================================================================

    bindEvents() {
      // Keyboard input
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('keydown', e => this.handleKeyDown(e));
        window.addEventListener('keyup', e => this.handleKeyUp(e));
      }

      // Modal buttons
      if (this.dom.btnStartJourney) {
        this.dom.btnStartJourney.addEventListener('click', () => this.startGame());
      }
      if (this.dom.btnResume) {
        this.dom.btnResume.addEventListener('click', () => this.togglePause());
      }
      if (this.dom.btnRestartPause) {
        this.dom.btnRestartPause.addEventListener('click', () => {
          this.togglePause();
          this.restartGame();
        });
      }
      if (this.dom.btnPlayAgain) {
        this.dom.btnPlayAgain.addEventListener('click', () => this.restartGame());
      }

      // Top bar utility buttons
      if (this.dom.btnPause) {
        this.dom.btnPause.addEventListener('click', () => this.togglePause());
      }
      if (this.dom.btnMute) {
        this.dom.btnMute.addEventListener('click', () => this.toggleMute());
      }
      if (this.dom.btnDemoCam) {
        this.dom.btnDemoCam.addEventListener('click', () => {
          if (this.visuals) {
            this.visuals.triggerCinematicCameraSweep('manual');
          }
        });
      }
      if (this.dom.btnToggleCamFx) {
        this.dom.btnToggleCamFx.addEventListener('click', () => this.toggleCameraFx());
      }

      // Zone activation button
      if (this.dom.btnActivateZone) {
        this.dom.btnActivateZone.addEventListener('click', () => {
          if (this.isZoneActive) {
            this.deactivateZone();
          } else if (this.zoneCharge >= 25) {
            this.activateZone();
          }
        });
      }

      // Quick stage switch buttons (Top bar)
      [0, 1, 2].forEach(stageId => {
        const btn = document.getElementById(`btn-stage-${stageId}`);
        if (btn) {
          btn.addEventListener('click', () => this.setStage(stageId, true));
        }
      });

      // Stage selector cards inside Start Modal
      document.querySelectorAll('.stage-select-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const target = e.currentTarget;
          const stageId = parseInt(target.getAttribute('data-stage'), 10);
          if (!isNaN(stageId)) {
            this.setStage(stageId, false);
          }
        });
      });

      // Window blur pauses game
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('blur', () => {
          if (this.isRunning && !this.isPaused && !this.isGameOver) {
            this.togglePause();
          }
        });
      }

      // Initialize Fullscreen Mobile Touch Gesture Controls
      this.initTouchControls();
    }

    triggerHaptic(pattern = 10) {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(pattern);
        } catch (_) {}
      }
    }

    triggerTouchRipple(clientX, clientY) {
      if (!this.dom.touchEffectsOverlay) return;
      const ripple = document.createElement('div');
      ripple.className = 'touch-ripple';
      ripple.style.left = `${clientX}px`;
      ripple.style.top = `${clientY}px`;
      this.dom.touchEffectsOverlay.appendChild(ripple);
      setTimeout(() => {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 420);
    }

    initTouchControls() {
      const surface = this.dom.touchGestureLayer;
      if (!surface) return;

      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let lastDragX = 0;
      let lastDragY = 0;
      let hasDragged = false;
      let multiTouchActive = false;

      // Thresholds tuned for responsive tactile mobile gameplay
      const DRAG_COL_PX = 26; // Pixels per horizontal column shift
      const DRAG_ROW_PX = 28; // Pixels per soft drop step

      surface.addEventListener('touchstart', e => {
        if (!this.isRunning || this.isPaused || this.isGameOver) return;
        e.preventDefault();

        if (e.touches.length >= 2) {
          multiTouchActive = true;
          // Two-finger tap: Counter-Clockwise Rotation (CCW)
          this.rotatePiece(-1);
          this.triggerHaptic(14);
          this.triggerTouchRipple(e.touches[0].clientX, e.touches[0].clientY);
          return;
        }

        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        lastDragX = t.clientX;
        lastDragY = t.clientY;
        hasDragged = false;
        touchStartTime = performance.now();

        this.triggerTouchRipple(t.clientX, t.clientY);
      }, { passive: false });

      surface.addEventListener('touchmove', e => {
        if (!this.isRunning || this.isPaused || this.isGameOver) return;
        e.preventDefault();
        if (multiTouchActive) return;

        const t = e.touches[0];
        const dx = t.clientX - lastDragX;
        const dy = t.clientY - lastDragY;
        const totalDistX = t.clientX - touchStartX;
        const totalDistY = t.clientY - touchStartY;

        if (Math.abs(totalDistX) > 12 || Math.abs(totalDistY) > 12) {
          hasDragged = true;
        }

        // Horizontal stepping
        if (Math.abs(dx) >= DRAG_COL_PX) {
          const stepDir = dx > 0 ? 1 : -1;
          const steps = Math.floor(Math.abs(dx) / DRAG_COL_PX);
          for (let s = 0; s < steps; s++) {
            this.moveHorizontal(stepDir);
            this.triggerHaptic(8);
          }
          lastDragX += stepDir * steps * DRAG_COL_PX;
        }

        // Downward dragging for soft drop
        if (dy >= DRAG_ROW_PX) {
          const steps = Math.floor(dy / DRAG_ROW_PX);
          for (let s = 0; s < steps; s++) {
            this.softDrop();
            this.triggerHaptic(6);
          }
          lastDragY += steps * DRAG_ROW_PX;
        }
      }, { passive: false });

      surface.addEventListener('touchend', e => {
        if (!this.isRunning || this.isPaused || this.isGameOver) return;
        e.preventDefault();

        if (multiTouchActive) {
          if (e.touches.length === 0) multiTouchActive = false;
          return;
        }

        const endTime = performance.now();
        const duration = endTime - touchStartTime;
        const change = e.changedTouches[0];
        if (!change) return;

        const totalDistX = change.clientX - touchStartX;
        const totalDistY = change.clientY - touchStartY;

        // 1. TAP DETECTION: Quick tap with minimal displacement -> Rotate Clockwise (CW)
        if (!hasDragged && duration < 280 && Math.abs(totalDistX) < 18 && Math.abs(totalDistY) < 18) {
          this.rotatePiece(1);
          this.triggerHaptic(12);
          this.triggerTouchRipple(change.clientX, change.clientY);
          return;
        }

        // 2. SWIPE UP: Fast upward gesture -> HOLD piece
        if (totalDistY < -42 && Math.abs(totalDistX) < 50 && duration < 340) {
          this.hold();
          this.triggerHaptic([15, 20, 15]);
          this.triggerTouchRipple(change.clientX, change.clientY);
          return;
        }

        // 3. FAST FLICK DOWN: Quick hard swipe downwards -> HARD DROP
        const velocityY = totalDistY / Math.max(1, duration);
        if (totalDistY > 62 && velocityY > 0.40 && Math.abs(totalDistX) < 60) {
          this.hardDrop();
          this.triggerHaptic(28);
          this.triggerTouchRipple(change.clientX, change.clientY);
          return;
        }
      }, { passive: false });

      // Direct tap on mini HOLD card in mobile
      if (this.dom.holdCard) {
        this.dom.holdCard.addEventListener('click', e => {
          if (!this.isRunning || this.isPaused || this.isGameOver) return;
          e.stopPropagation();
          this.hold();
          this.triggerHaptic([15, 20, 15]);
        });
      }

      // Mobile Thumb Zone Button
      if (this.dom.mobileZoneBtn) {
        this.dom.mobileZoneBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (this.isZoneActive) {
            this.deactivateZone();
            this.triggerHaptic([30, 20, 40]);
          } else if (this.zoneCharge >= 25) {
            this.activateZone();
            this.triggerHaptic([60, 40, 90]);
          } else {
            this.triggerHaptic(10);
          }
        });
      }

      // Mobile Top Bar buttons
      if (this.dom.mobileBtnPause) {
        this.dom.mobileBtnPause.addEventListener('click', e => {
          e.stopPropagation();
          this.togglePause();
        });
      }
      if (this.dom.mobileBtnMute) {
        this.dom.mobileBtnMute.addEventListener('click', e => {
          e.stopPropagation();
          this.toggleMute();
        });
      }
    }

    handleKeyDown(e) {
      // Don't intercept when modal active or focused on form fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const code = e.code;

      // Handle pause toggles
      if (code === 'KeyP' || code === 'Escape') {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (!this.isRunning || this.isPaused || this.isGameOver) return;

      if (!this.keysDown[code]) {
        this.keysDown[code] = true;

        switch (code) {
          case 'ArrowLeft':
            e.preventDefault();
            this.moveHorizontal(-1);
            this.startDAS('ArrowLeft', -1);
            break;

          case 'ArrowRight':
            e.preventDefault();
            this.moveHorizontal(1);
            this.startDAS('ArrowRight', 1);
            break;

          case 'ArrowDown':
            e.preventDefault();
            this.softDrop();
            this.startDAS('ArrowDown', 'down');
            break;

          case 'ArrowUp':
          case 'KeyX':
          case 'KeyW':
            e.preventDefault();
            this.rotatePiece(1);
            break;

          case 'KeyZ':
            e.preventDefault();
            // In Tetris Effect: 'Z' toggles Zone Mode when charge >= 25% or active;
            // otherwise performs CCW rotation so the key is never wasted!
            if (this.isZoneActive) {
              this.deactivateZone();
            } else if (this.zoneCharge >= 25) {
              this.activateZone();
            } else {
              this.rotatePiece(-1);
            }
            break;

          case 'ControlLeft':
          case 'ControlRight':
          case 'KeyA':
          case 'KeyQ':
            e.preventDefault();
            this.rotatePiece(-1);
            break;

          case 'Space':
            e.preventDefault();
            this.hardDrop();
            break;

          case 'KeyC':
          case 'ShiftLeft':
          case 'ShiftRight':
            e.preventDefault();
            this.hold();
            break;
        }
      }
    }

    handleKeyUp(e) {
      const code = e.code;
      this.keysDown[code] = false;
      if (this.dasTimers[code]) {
        clearTimeout(this.dasTimers[code].initialTimer);
        clearInterval(this.dasTimers[code].repeatTimer);
        delete this.dasTimers[code];
      }
    }

    startDAS(code, dir) {
      // Guideline DAS: ~160ms initial delay, ~35ms repeat interval
      const initialDelay = 160;
      const repeatInterval = 35;

      if (this.dasTimers[code]) {
        clearTimeout(this.dasTimers[code].initialTimer);
        clearInterval(this.dasTimers[code].repeatTimer);
      }

      this.dasTimers[code] = {
        initialTimer: setTimeout(() => {
          this.dasTimers[code].repeatTimer = setInterval(() => {
            if (!this.isRunning || this.isPaused || this.isGameOver) return;
            if (dir === 'down') {
              this.softDrop();
            } else {
              this.moveHorizontal(dir);
            }
          }, repeatInterval);
        }, initialDelay),
        repeatTimer: null
      };
    }

    // ==========================================================================
    // 5. Piece Generation & 7-Bag Randomizer
    // ==========================================================================

    refillBag() {
      while (this.nextQueue.length < 7) {
        if (this.bag.length === 0) {
          const pieces = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
          // Fisher-Yates shuffle
          for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
          }
          this.bag = pieces;
        }
        this.nextQueue.push(this.bag.pop());
      }
    }

    spawnNextPiece() {
      this.refillBag();
      const type = this.nextQueue.shift();
      this.refillBag();
      this.renderNextPreview();
      this.spawnPiece(type, true);
    }

    spawnPiece(type, resetCanHold = false) {
      const matrix = PIECE_MATRICES[type].map(row => [...row]);
      const color = PIECE_COLORS[type];

      // Guideline spawn offsets
      let spawnX = 3;
      let spawnY = 0;

      if (type === 'I') {
        spawnX = 3;
        spawnY = -1; // Center row 1 sits on row 0
      } else if (type === 'O') {
        spawnX = 4;
        spawnY = 0;
      }

      this.activePiece = {
        type,
        matrix,
        x: spawnX,
        y: spawnY,
        color,
        rotation: 0
      };

      if (resetCanHold) {
        this.canHold = true;
      }
      this.isLocking = false;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lastFallRow = spawnY;
      this.lastActionWasRotate = false;

      // Check immediate collision at spawn
      if (!this.isValidPosition(this.activePiece.matrix, this.activePiece.x, this.activePiece.y)) {
        // In Zone Mode, topping out ends Zone mode as an emergency lifesaver!
        if (this.isZoneActive) {
          this.deactivateZone();
          if (!this.isValidPosition(this.activePiece.matrix, this.activePiece.x, this.activePiece.y)) {
            this.triggerGameOver();
          }
        } else {
          this.triggerGameOver();
        }
      }

      this.renderHoldPreview();
      this.syncVisualBoard();
    }

    // ==========================================================================
    // 6. Movement, Collision & Guideline SRS
    // ==========================================================================

    isValidPosition(matrix, px, py) {
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c]) {
            const worldX = px + c;
            const worldY = py + r;

            // Lateral bounds
            if (worldX < 0 || worldX >= BOARD_COLS) return false;
            // Bottom bound
            if (worldY >= BOARD_ROWS) return false;

            // Grid collision (allow buffer rows y < 0)
            if (worldY >= 0 && this.grid[worldY][worldX] !== null) {
              return false;
            }
          }
        }
      }
      return true;
    }

    moveHorizontal(dir) {
      if (!this.activePiece) return;
      const targetX = this.activePiece.x + dir;
      if (this.isValidPosition(this.activePiece.matrix, targetX, this.activePiece.y)) {
        this.activePiece.x = targetX;
        this.lastActionWasRotate = false;

        // Reset lock timer if grounded (extended placement up to 15 resets)
        if (this.isLocking && this.lockResets < this.maxLockResets) {
          this.lockTimer = 0;
          this.lockResets++;
        }

        // Synesthetic audio & visual feedback
        if (this.audio) {
          this.audio.playMove(dir, this.activePiece.x);
        }
        if (this.visuals) {
          this.visuals.triggerMoveTrail(this.activePiece, dir);
        }

        this.syncVisualBoard();
      }
    }

    rotatePiece(dir = 1) {
      if (!this.activePiece || this.activePiece.type === 'O') return;

      const type = this.activePiece.type;
      const currentRot = this.activePiece.rotation;
      const nextRot = (currentRot + (dir === 1 ? 1 : 3)) % 4;
      const rotatedMatrix = rotateMatrix(this.activePiece.matrix, dir);

      // Super Rotation System (SRS) Wall Kick Tests
      const kickKey = `${currentRot}->${nextRot}`;
      const kickTable = (type === 'I') ? SRS_KICKS_I[kickKey] : SRS_KICKS_JLSTZ[kickKey];

      let kickSuccess = false;
      let finalX = this.activePiece.x;
      let finalY = this.activePiece.y;
      let kickIndexUsed = 0;

      if (kickTable) {
        for (let i = 0; i < kickTable.length; i++) {
          const [dx, dy] = kickTable[i];
          const testX = this.activePiece.x + dx;
          const testY = this.activePiece.y + dy;

          if (this.isValidPosition(rotatedMatrix, testX, testY)) {
            kickSuccess = true;
            finalX = testX;
            finalY = testY;
            kickIndexUsed = i;
            break;
          }
        }
      } else {
        // Fallback test
        if (this.isValidPosition(rotatedMatrix, finalX, finalY)) {
          kickSuccess = true;
        }
      }

      if (kickSuccess) {
        this.activePiece.matrix = rotatedMatrix;
        this.activePiece.x = finalX;
        this.activePiece.y = finalY;
        this.activePiece.rotation = nextRot;
        this.activePiece.lastKickIndex = kickIndexUsed;
        this.lastActionWasRotate = true;

        // Lock delay reset if grounded
        if (this.isLocking && this.lockResets < this.maxLockResets) {
          this.lockTimer = 0;
          this.lockResets++;
        }

        // Beat-Sync Judge on rotation
        const onBeat = this.checkBeatSync('rotate');

        // Rapid rotation arpeggios in current stage musical scale
        const now = performance.now();
        if (now - this.lastRotateTime < 650) {
          this.rotationCycleIndex = (this.rotationCycleIndex + 1) % 8;
        } else {
          this.rotationCycleIndex = 0;
        }
        this.lastRotateTime = now;

        if (this.audio) {
          this.audio.playRotate(dir, this.rotationCycleIndex, Math.max(0, this.combo));
        }
        if (this.visuals) {
          this.visuals.triggerRotateJuice(this.activePiece, dir);
        }

        this.syncVisualBoard();
      }
    }

    softDrop() {
      if (!this.activePiece) return;
      if (this.isValidPosition(this.activePiece.matrix, this.activePiece.x, this.activePiece.y + 1)) {
        this.activePiece.y += 1;
        this.score += 1; // 1 point per soft drop row
        this.lastActionWasRotate = false;

        // Reset lock timer counter if dropped to a new lowest depth
        if (this.activePiece.y > this.lastFallRow) {
          this.lastFallRow = this.activePiece.y;
          this.lockResets = 0;
          this.lockTimer = 0;
        }

        if (this.audio) {
          this.audio.playSoftDrop(this.activePiece.y);
        }
        this.updateHUD();
        this.syncVisualBoard();
      } else {
        // Grounded
        this.isLocking = true;
      }
    }

    hardDrop() {
      if (!this.activePiece) return;

      const fromY = this.activePiece.y;
      const ghostY = this.getGhostY();
      const distance = Math.max(0, ghostY - fromY);

      this.activePiece.y = ghostY;
      this.score += distance * 2; // 2 points per hard drop row

      // Beat-Sync Judge on Hard Drop
      const onBeat = this.checkBeatSync('hardDrop');

      if (this.audio) {
        this.audio.playHardDrop(distance, this.activePiece.type, onBeat);
      }
      if (this.visuals) {
        this.visuals.triggerHardDropTrail(this.activePiece, fromY, ghostY, onBeat);
      }

      this.lockPiece();
    }

    getGhostY() {
      if (!this.activePiece) return 0;
      let testY = this.activePiece.y;
      while (this.isValidPosition(this.activePiece.matrix, this.activePiece.x, testY + 1)) {
        testY++;
      }
      return testY;
    }

    getGhostPiece() {
      if (!this.activePiece) return null;
      return {
        type: this.activePiece.type,
        matrix: this.activePiece.matrix,
        x: this.activePiece.x,
        y: this.getGhostY(),
        color: this.activePiece.color
      };
    }

    // ==========================================================================
    // 7. Hold Mechanic
    // ==========================================================================

    hold() {
      if (!this.activePiece || !this.canHold || this.isGameOver) return;

      this.canHold = false;
      const currentType = this.activePiece.type;

      if (this.audio) {
        this.audio.playHold();
      }

      if (this.holdPiece === null) {
        this.holdPiece = currentType;
        this.refillBag();
        const nextType = this.nextQueue.shift();
        this.refillBag();
        this.renderNextPreview();
        this.spawnPiece(nextType, false);
      } else {
        const swapType = this.holdPiece;
        this.holdPiece = currentType;
        this.spawnPiece(swapType, false);
      }

      this.canHold = false;
      this.renderHoldPreview();
    }

    // ==========================================================================
    // 8. T-Spin Detection, Piece Locking & Line Clears
    // ==========================================================================

    detectTSpin() {
      if (!this.activePiece || this.activePiece.type !== 'T' || !this.lastActionWasRotate) {
        return { isTSpin: false, isMini: false };
      }

      const cx = this.activePiece.x + 1;
      const cy = this.activePiece.y + 1;

      // Check the 4 diagonal corners around T center
      const corners = [
        { x: cx - 1, y: cy - 1, name: 'NW' },
        { x: cx + 1, y: cy - 1, name: 'NE' },
        { x: cx - 1, y: cy + 1, name: 'SW' },
        { x: cx + 1, y: cy + 1, name: 'SE' }
      ];

      let occupiedCount = 0;
      const occupiedMap = {};

      corners.forEach(corner => {
        let isOccupied = false;
        if (corner.x < 0 || corner.x >= BOARD_COLS || corner.y >= BOARD_ROWS) {
          isOccupied = true;
        } else if (corner.y >= 0 && this.grid[corner.y][corner.x] !== null) {
          isOccupied = true;
        }
        if (isOccupied) {
          occupiedCount++;
          occupiedMap[corner.name] = true;
        }
      });

      // Standard Guideline 3-Corner Rule
      if (occupiedCount < 3) {
        return { isTSpin: false, isMini: false };
      }

      // Check facing (front) corners for T-Spin Mini distinction
      const rot = this.activePiece.rotation;
      let frontCornersOccupied = 0;

      if (rot === 0) { // Pointing UP
        if (occupiedMap.NW) frontCornersOccupied++;
        if (occupiedMap.NE) frontCornersOccupied++;
      } else if (rot === 1) { // Pointing RIGHT
        if (occupiedMap.NE) frontCornersOccupied++;
        if (occupiedMap.SE) frontCornersOccupied++;
      } else if (rot === 2) { // Pointing DOWN
        if (occupiedMap.SW) frontCornersOccupied++;
        if (occupiedMap.SE) frontCornersOccupied++;
      } else if (rot === 3) { // Pointing LEFT
        if (occupiedMap.NW) frontCornersOccupied++;
        if (occupiedMap.SW) frontCornersOccupied++;
      }

      // If both front corners are occupied or kick #5 was used -> Full T-Spin
      if (frontCornersOccupied === 2 || this.activePiece.lastKickIndex === 4) {
        return { isTSpin: true, isMini: false };
      } else {
        return { isTSpin: true, isMini: true };
      }
    }

    lockPiece() {
      if (!this.activePiece) return;

      const piece = this.activePiece;
      const tspin = this.detectTSpin();

      // Write piece cells into grid
      for (let r = 0; r < piece.matrix.length; r++) {
        for (let c = 0; c < piece.matrix[r].length; c++) {
          if (piece.matrix[r][c]) {
            const gx = piece.x + c;
            const gy = piece.y + r;
            if (gy >= 0 && gy < BOARD_ROWS && gx >= 0 && gx < BOARD_COLS) {
              this.grid[gy][gx] = {
                type: piece.type,
                color: piece.color,
                zoneLocked: false
              };
            }
          }
        }
      }

      // Play lock sound
      if (this.audio) {
        this.audio.playLock(piece.type, piece.y);
      }

      // Find filled rows
      const filledRows = [];
      for (let r = 0; r < BOARD_ROWS; r++) {
        if (this.grid[r].every(cell => cell !== null && !cell.zoneLocked)) {
          filledRows.push(r);
        }
      }

      const linesCount = filledRows.length;

      // Handle Line Clears differently for Normal vs Zone Mode
      if (this.isZoneActive) {
        this.processZoneLineClears(filledRows, tspin);
      } else {
        this.processNormalLineClears(filledRows, tspin);
      }

      // Update Danger Level based on highest occupied block row
      this.updateDangerLevel();

      // Clear active piece and spawn next
      this.activePiece = null;
      this.spawnNextPiece();
    }

    processNormalLineClears(filledRows, tspin) {
      const linesCount = filledRows.length;

      if (linesCount > 0) {
        // Combo increment
        this.combo++;
        if (this.combo > this.maxCombo) {
          this.maxCombo = this.combo;
        }

        // Clear completed rows from grid
        filledRows.forEach(rowIdx => {
          this.grid.splice(rowIdx, 1);
          this.grid.unshift(Array(BOARD_COLS).fill(null));
        });

        this.lines += linesCount;

        // Score calculation (Guideline standards)
        let baseScore = 0;
        let calloutMain = '';
        let calloutSub = '';
        let isDifficult = false;

        if (tspin.isTSpin) {
          isDifficult = true;
          if (tspin.isMini) {
            baseScore = linesCount === 1 ? 200 : 100;
            calloutMain = linesCount === 1 ? 'T-SPIN MINI SINGLE!' : 'T-SPIN MINI!';
          } else {
            if (linesCount === 1) {
              baseScore = 800;
              calloutMain = 'T-SPIN SINGLE!';
            } else if (linesCount === 2) {
              baseScore = 1200;
              calloutMain = 'T-SPIN DOUBLE!';
            } else if (linesCount === 3) {
              baseScore = 1600;
              calloutMain = 'T-SPIN TRIPLE!';
            } else {
              baseScore = 400;
              calloutMain = 'T-SPIN!';
            }
          }
        } else {
          switch (linesCount) {
            case 1:
              baseScore = 100;
              calloutMain = 'SINGLE';
              break;
            case 2:
              baseScore = 300;
              calloutMain = 'DOUBLE';
              break;
            case 3:
              baseScore = 500;
              calloutMain = 'TRIPLE';
              break;
            case 4:
              baseScore = 800;
              calloutMain = 'TETRIS!';
              isDifficult = true;
              break;
          }
        }

        // Back-to-Back bonus (1.5x)
        if (isDifficult) {
          if (this.backToBack) {
            baseScore = Math.floor(baseScore * 1.5);
            calloutMain = 'B2B ' + calloutMain;
          }
          this.backToBack = true;
        } else {
          this.backToBack = false;
        }

        // Combo bonus (+50 * combo * level)
        const comboBonus = this.combo > 0 ? 50 * this.combo * this.level : 0;
        const totalLineScore = (baseScore * this.level) + comboBonus;
        this.score += totalLineScore;

        calloutSub = `+${totalLineScore.toLocaleString()} PTS`;
        if (this.combo > 0) {
          calloutSub += ` · COMBO x${this.combo}`;
        }

        this.showActionCallout(calloutMain, calloutSub);

        // Charge Zone Meter (+12% per line, +35% per Tetris/T-Spin)
        if (linesCount === 4 || tspin.isTSpin) {
          this.addZoneCharge(35);
        } else {
          this.addZoneCharge(linesCount * 12);
        }

        // Level & Journey Stage progression (every 10 lines)
        this.level = Math.floor(this.lines / 10) + 1;
        this.checkStageProgression();

        // Audio & Visual line clear triggers
        if (this.audio) {
          this.audio.playLineClear(linesCount, tspin.isTSpin, this.combo, false);
        }
        if (this.visuals) {
          this.visuals.triggerLineClearEffect(filledRows, linesCount, tspin.isTSpin, this.combo);
          if (this.combo >= 2 || tspin.isTSpin) {
            this.visuals.triggerComboAura(this.activePiece, this.combo, tspin.isTSpin);
          }
        }
      } else {
        // No lines cleared -> reset combo
        this.combo = -1;
        if (tspin.isTSpin) {
          const tspinScore = (tspin.isMini ? 100 : 400) * this.level;
          this.score += tspinScore;
          this.showActionCallout(tspin.isMini ? 'T-SPIN MINI' : 'T-SPIN', `+${tspinScore} PTS`);
          this.addZoneCharge(15);
        }
      }

      this.updateHUD();
    }

    // ==========================================================================
    // 9. Zone Mechanic (Time-Stop Mode)
    // ==========================================================================

    addZoneCharge(amount) {
      if (this.isZoneActive) return;
      this.zoneCharge = Math.min(100, Math.max(0, this.zoneCharge + amount));
      this.updateZoneUI();
    }

    updateZoneUI() {
      if (this.dom.zoneFillBar) {
        this.dom.zoneFillBar.style.width = `${this.zoneCharge}%`;
      }
      if (this.dom.zonePercent) {
        this.dom.zonePercent.textContent = `${Math.round(this.zoneCharge)}%`;
      }
      if (this.dom.mobileZonePct) {
        this.dom.mobileZonePct.textContent = `${Math.round(this.zoneCharge)}%`;
      }
      if (this.dom.btnActivateZone) {
        const canActivate = this.zoneCharge >= 25;
        this.dom.btnActivateZone.disabled = !canActivate && !this.isZoneActive;
        this.dom.btnActivateZone.classList.toggle('ready', canActivate && !this.isZoneActive);
      }
      if (this.dom.mobileZoneBtn) {
        const canActivate = this.zoneCharge >= 25 || this.isZoneActive;
        this.dom.mobileZoneBtn.classList.toggle('charged', canActivate);
      }
    }

    activateZone() {
      if (this.isZoneActive || this.zoneCharge < 25) return;

      this.isZoneActive = true;
      // Duration scales with charge: 100% = 16 seconds; 25% = 4 seconds
      this.zoneDuration = (this.zoneCharge / 100) * 16.0;
      this.zoneTimer = this.zoneDuration;
      this.zoneLinesCount = 0;
      this.zoneRows = [];

      document.body.classList.add('zone-active');

      if (this.dom.zoneOverlayBanner) {
        this.dom.zoneOverlayBanner.classList.remove('hidden');
      }
      if (this.dom.zoneTimerText) {
        this.dom.zoneTimerText.textContent = `${this.zoneTimer.toFixed(1)}s`;
      }

      // Audiovisual transition into underwater time-dilation
      if (this.audio) {
        this.audio.setZoneMode(true);
      }
      if (this.visuals) {
        this.visuals.setZoneVisuals(true, 1.0);
      }

      this.showActionCallout('⏳ MODO ZONA!', 'TIEMPO DETENIDO');
      this.updateZoneUI();
    }

    deactivateZone() {
      if (!this.isZoneActive) return;

      this.isZoneActive = false;
      document.body.classList.remove('zone-active');

      if (this.dom.zoneOverlayBanner) {
        this.dom.zoneOverlayBanner.classList.add('hidden');
      }
      if (this.dom.zoneTimerText) {
        this.dom.zoneTimerText.textContent = 'LISTO';
      }

      // 1. Audio Release Sweep & Visual Supernova
      if (this.audio) {
        this.audio.setZoneMode(false);
        this.audio.triggerZoneRelease(this.zoneLinesCount);
      }
      if (this.visuals) {
        this.visuals.triggerZoneExplosion(this.zoneLinesCount);
        this.visuals.setZoneVisuals(false, 0.0);
      }

      // 2. Clear all accumulated golden Zone rows from board!
      this.clearZoneLockedRows();

      // 3. Reset Zone Gauge to 0%
      this.zoneCharge = 0;
      this.updateZoneUI();
      this.updateHUD();
      this.syncVisualBoard();
    }

    processZoneLineClears(filledRows, tspin) {
      if (filledRows.length === 0) return;

      // In Zone Mode, completed lines do NOT vanish immediately.
      // Instead, they turn golden, sink to the bottom of the board, and stack upwards!
      const activeRows = [];
      const newZoneRows = [];

      for (let r = 0; r < BOARD_ROWS; r++) {
        if (filledRows.includes(r)) {
          const goldenRow = this.grid[r].map(cell => ({
            type: cell ? cell.type : 'I',
            color: '#ffd700',
            zoneLocked: true
          }));
          newZoneRows.push(goldenRow);
        } else {
          activeRows.push(this.grid[r]);
        }
      }

      // Recombine: active rows on top, all zone locked rows at the bottom
      this.grid = [...activeRows, ...newZoneRows];
      this.zoneLinesCount += newZoneRows.length;

      // Track zone row indices (the bottom zoneLinesCount rows)
      this.zoneRows = [];
      for (let r = BOARD_ROWS - this.zoneLinesCount; r < BOARD_ROWS; r++) {
        if (r >= 0) this.zoneRows.push(r);
      }

      // Zone Line Callouts
      let zoneTitle = `ZONA: ${this.zoneLinesCount} LÍNEAS`;
      if (this.zoneLinesCount >= 20) zoneTitle = '👑 ULTIMATRIS!';
      else if (this.zoneLinesCount >= 18) zoneTitle = '💎 PERFECTRIS!';
      else if (this.zoneLinesCount >= 16) zoneTitle = '🔮 DECAHEXATRIS!';
      else if (this.zoneLinesCount >= 12) zoneTitle = '🌟 DODECATRIS!';
      else if (this.zoneLinesCount >= 8) zoneTitle = '✨ OCTORIS!';
      else if (this.zoneLinesCount >= 4) zoneTitle = '⚡ TETRIS ZONA!';

      this.showActionCallout(zoneTitle, `${this.zoneLinesCount} LÍNEAS ACUMULADAS`);

      if (this.audio) {
        this.audio.playLineClear(filledRows.length, tspin.isTSpin, this.zoneLinesCount, true);
      }
      if (this.visuals) {
        this.visuals.triggerLineClearEffect(this.zoneRows, filledRows.length, tspin.isTSpin, this.zoneLinesCount);
      }
    }

    clearZoneLockedRows() {
      if (this.zoneLinesCount === 0) return;

      // Remove all zoneLocked rows from the bottom of the grid
      const cleanedGrid = [];
      let removedCount = 0;

      for (let r = 0; r < BOARD_ROWS; r++) {
        const isLockedRow = this.grid[r].some(cell => cell && cell.zoneLocked);
        if (isLockedRow) {
          removedCount++;
        } else {
          cleanedGrid.push(this.grid[r]);
        }
      }

      // Add empty rows at top to maintain 20 rows
      while (cleanedGrid.length < BOARD_ROWS) {
        cleanedGrid.unshift(Array(BOARD_COLS).fill(null));
      }
      this.grid = cleanedGrid;

      // Calculate massive Zone Release score bonus
      const count = this.zoneLinesCount;
      this.lines += count;

      let zoneBasePoints = count * 1000;
      if (count >= 20) zoneBasePoints = 250000;
      else if (count >= 18) zoneBasePoints = 180000;
      else if (count >= 16) zoneBasePoints = 120000;
      else if (count >= 12) zoneBasePoints = 60000;
      else if (count >= 8) zoneBasePoints = 25000;
      else if (count >= 4) zoneBasePoints = 8000;

      const totalZoneScore = Math.floor(zoneBasePoints * this.level);
      this.score += totalZoneScore;

      // Callout for the entire Zone accomplishment
      let releaseTitle = `LIBERACIÓN: ${count} LÍNEAS`;
      if (count >= 20) releaseTitle = '👑 ULTIMATRIS';
      else if (count >= 18) releaseTitle = '💎 PERFECTRIS';
      else if (count >= 16) releaseTitle = '🔮 DECAHEXATRIS';
      else if (count >= 12) releaseTitle = '🌟 DODECATRIS';
      else if (count >= 8) releaseTitle = '✨ OCTORIS';
      else if (count >= 4) releaseTitle = '⚡ TETRIS ZONA';

      this.showActionCallout(releaseTitle, `+${totalZoneScore.toLocaleString()} PTS`);

      this.zoneLinesCount = 0;
      this.zoneRows = [];

      // Level check
      this.level = Math.floor(this.lines / 10) + 1;
      this.checkStageProgression();
    }

    // ==========================================================================
    // 10. Synesthetic Beat-Sync Judge
    // ==========================================================================

    checkBeatSync(actionType) {
      this.totalJudgedActions++;

      // Check audio engine beat window (default tolerance ±24% of quarter-note beat)
      let onBeat = false;
      if (this.audio && typeof this.audio.isOnBeatWindow === 'function') {
        onBeat = this.audio.isOnBeatWindow(0.24);
      }

      if (onBeat) {
        this.perfectBeatsCount++;
        const bonus = 50 * this.level;
        this.syncBonusTotal += bonus;
        this.score += bonus;

        // Extra +6% charge to Zone Gauge on beat!
        this.addZoneCharge(6);

        // Visual flash in 3D background
        if (this.visuals) {
          this.visuals.triggerBeatPulse(this.beatCounter, 1.4, true);
        }

        // Subtly flash the HUD feedback banner
        this.showSyncFeedback(`⚡ AL RITMO DEL BEAT! +${bonus}`);
      }

      this.updateSyncRateHUD();
      return onBeat;
    }

    showSyncFeedback(text) {
      if (!this.dom.syncFeedbackBanner) return;
      const textEl = this.dom.syncFeedbackBanner.querySelector('.sync-banner-text') || this.dom.syncFeedbackBanner;
      textEl.textContent = text;
      this.dom.syncFeedbackBanner.classList.add('flash-perfect');

      if (this.syncFeedbackTimer) clearTimeout(this.syncFeedbackTimer);
      this.syncFeedbackTimer = setTimeout(() => {
        if (this.dom.syncFeedbackBanner) {
          this.dom.syncFeedbackBanner.classList.remove('flash-perfect');
          textEl.textContent = 'SINCRONÍA RÍTMICA';
        }
      }, 700);
    }

    updateSyncRateHUD() {
      if (this.dom.hudSyncRate) {
        if (this.totalJudgedActions === 0) {
          this.dom.hudSyncRate.textContent = '100%';
        } else {
          const rate = Math.round((this.perfectBeatsCount / this.totalJudgedActions) * 100);
          this.dom.hudSyncRate.textContent = `${rate}%`;
        }
      }
    }

    // ==========================================================================
    // 11. Journey Mode Progression & Stage Transitions
    // ==========================================================================

    checkStageProgression() {
      let targetStage = 0;
      if (this.lines >= 20 || this.level >= 7) {
        targetStage = 2;
      } else if (this.lines >= 10 || this.level >= 4) {
        targetStage = 1;
      }

      if (targetStage !== this.stageIndex) {
        this.setStage(targetStage, false);
      }
    }

    setStage(stageId, isManual = false) {
      if (stageId < 0 || stageId >= STAGES_DATA.length) return;

      this.stageIndex = stageId;
      const stage = STAGES_DATA[stageId];

      // Update Body Theme
      document.body.setAttribute('data-stage', stageId);

      // Update Top Stage Quick Buttons & Modal Buttons
      [0, 1, 2].forEach(i => {
        const topBtn = document.getElementById(`btn-stage-${i}`);
        if (topBtn) topBtn.classList.toggle('active', i === stageId);
        const modalBtn = document.querySelector(`.stage-select-btn[data-stage="${i}"]`);
        if (modalBtn) modalBtn.classList.toggle('active', i === stageId);
      });

      // Update HUD Labels
      if (this.dom.stageBadge) this.dom.stageBadge.textContent = `FASE ${stageId + 1}`;
      if (this.dom.stageName) this.dom.stageName.textContent = stage.name;
      if (this.dom.stageSub) this.dom.stageSub.textContent = stage.sub;
      if (this.dom.hudBpm) this.dom.hudBpm.textContent = `${stage.bpm} BPM`;
      if (this.dom.mobileStageBadge) this.dom.mobileStageBadge.textContent = `F${stageId + 1}`;
      if (this.dom.mobileBpm) this.dom.mobileBpm.textContent = `${stage.bpm}`;

      // Propagate to Audio Synthesizer & 3D Visualizer
      if (this.audio) {
        this.audio.setStage(stageId);
      }
      if (this.visuals) {
        this.visuals.setStage(stageId);
        this.visuals.triggerCinematicCameraSweep(isManual ? 'manual' : 'stageUp');
      }

      this.showActionCallout(`FASE ${stageId + 1}`, stage.name);
    }

    updateDangerLevel() {
      // Find highest occupied block row (min row index)
      let highestOccupiedRow = BOARD_ROWS;
      for (let r = 0; r < BOARD_ROWS; r++) {
        if (this.grid[r].some(cell => cell !== null)) {
          highestOccupiedRow = r;
          break;
        }
      }

      // Danger scales from 0.0 at row 15+ to 1.0 at row 4 or higher
      const dangerRatio = Math.max(0.0, Math.min(1.0, (14 - highestOccupiedRow) / 10.0));
      if (this.audio) {
        this.audio.setDangerLevel(dangerRatio);
      }
    }

    // ==========================================================================
    // 12. 2D Canvas Previews (Hold & Next Queue)
    // ==========================================================================

    renderHoldPreview() {
      const canvas = this.dom.holdCanvas;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!this.holdPiece) return;

      const type = this.holdPiece;
      const matrix = PIECE_MATRICES[type];
      const color = PIECE_COLORS[type];

      ctx.save();
      // If already held this turn, draw slightly dimmed
      if (!this.canHold) {
        ctx.globalAlpha = 0.45;
      }

      // Responsive block size: smaller for mobile mini-pods
      const isMobileMini = canvas.clientHeight < 80 || canvas.width < 80;
      const blockSize = isMobileMini ? 10 : 16;
      this.drawCenteredPiece(ctx, matrix, color, canvas.width / 2, canvas.height / 2, blockSize);
      ctx.restore();
    }

    renderNextPreview() {
      const canvas = this.dom.nextCanvas;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isMobileMini = canvas.clientHeight < 80 || canvas.height < 100;

      if (isMobileMini) {
        // Mobile portrait mode: render the immediate next piece prominently centered
        if (this.nextQueue.length > 0) {
          const type = this.nextQueue[0];
          const matrix = PIECE_MATRICES[type];
          const color = PIECE_COLORS[type];
          this.drawCenteredPiece(ctx, matrix, color, canvas.width / 2, canvas.height / 2, 10);
        }
      } else {
        // Desktop / Large screen: render top 3 pieces in vertical queue
        const slotY = [40, 118, 196];
        for (let i = 0; i < 3 && i < this.nextQueue.length; i++) {
          const type = this.nextQueue[i];
          const matrix = PIECE_MATRICES[type];
          const color = PIECE_COLORS[type];
          this.drawCenteredPiece(ctx, matrix, color, canvas.width / 2, slotY[i], 16);
        }
      }
    }

    drawCenteredPiece(ctx, matrix, color, centerX, centerY, blockSize = 16) {
      // Calculate true bounding box of active cells
      let minR = matrix.length, maxR = -1;
      let minC = matrix[0].length, maxC = -1;

      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c]) {
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
          }
        }
      }

      const trueW = (maxC - minC + 1) * blockSize;
      const trueH = (maxR - minR + 1) * blockSize;
      const startX = centerX - trueW / 2 - minC * blockSize;
      const startY = centerY - trueH / 2 - minR * blockSize;

      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c]) {
            const bx = startX + c * blockSize;
            const by = startY + r * blockSize;

            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.fillStyle = color;

            // Rounded block
            const pad = 1.5;
            const w = blockSize - pad * 2;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(bx + pad, by + pad, w, w, 3);
            } else {
              ctx.rect(bx + pad, by + pad, w, w);
            }
            ctx.fill();

            // Inner gloss highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(bx + pad + 1, by + pad + 1, w - 2, 2);

            ctx.restore();
          }
        }
      }
    }

    // ==========================================================================
    // 13. UI HUD Readouts & Kinetic Callouts
    // ==========================================================================

    updateHUD() {
      if (this.dom.hudScore) this.dom.hudScore.textContent = this.score.toLocaleString();
      if (this.dom.hudLines) this.dom.hudLines.textContent = this.lines.toString();
      if (this.dom.hudLevel) this.dom.hudLevel.textContent = this.level.toString();
      if (this.dom.mobileScore) this.dom.mobileScore.textContent = this.score.toLocaleString();
      if (this.dom.mobileLines) this.dom.mobileLines.textContent = this.lines.toString();
      if (this.dom.mobileLevel) this.dom.mobileLevel.textContent = this.level.toString();
      if (this.dom.hudCombo) {
        this.dom.hudCombo.textContent = this.combo > 0 ? `${this.combo}x` : '0x';
      }
      this.updateSyncRateHUD();
      this.updateZoneUI();
    }

    showActionCallout(mainText, subText = '') {
      if (!this.dom.actionCallout) return;

      const mainEl = this.dom.actionCallout.querySelector('.callout-main-text');
      const subEl = this.dom.actionCallout.querySelector('.callout-sub-text');

      if (mainEl) mainEl.textContent = mainText;
      if (subEl) subEl.textContent = subText;

      this.dom.actionCallout.classList.remove('hidden');

      // Restart CSS animation
      this.dom.actionCallout.style.animation = 'none';
      void this.dom.actionCallout.offsetWidth; // Reflow
      this.dom.actionCallout.style.animation = '';

      if (this.calloutTimer) clearTimeout(this.calloutTimer);
      this.calloutTimer = setTimeout(() => {
        if (this.dom.actionCallout) {
          this.dom.actionCallout.classList.add('hidden');
        }
      }, 1300);
    }

    syncVisualBoard() {
      if (this.visuals) {
        this.visuals.updateBoardState(
          this.grid,
          this.activePiece,
          this.getGhostPiece(),
          this.zoneRows
        );
      }
    }

    // ==========================================================================
    // 14. Game Loop & State Control
    // ==========================================================================

    getGravityInterval() {
      // While in Zone Mode, gravity is frozen (no automatic drops)
      if (this.isZoneActive) return Infinity;

      // Guideline gravity curve (ms per row drop)
      const lvl = Math.min(15, this.level);
      return Math.max(70, Math.pow(0.8 - ((lvl - 1) * 0.007), lvl - 1) * 1000);
    }

    startGame() {
      // Hide start modal
      if (this.dom.startModal) {
        this.dom.startModal.classList.add('hidden');
      }

      this.isRunning = true;
      this.isPaused = false;
      this.isGameOver = false;

      // Start Procedural Audio Context & Synthesizer on user gesture
      if (this.audio) {
        this.audio.startMusic(this.stageIndex);
      }

      this.spawnNextPiece();
      this.lastTimestamp = performance.now();
      safeRAF(ts => this.loop(ts));
    }

    restartGame() {
      // Clear game over & pause modals
      if (this.dom.gameoverModal) this.dom.gameoverModal.classList.add('hidden');
      if (this.dom.pauseModal) this.dom.pauseModal.classList.add('hidden');

      this.grid = this.createEmptyGrid();
      this.activePiece = null;
      this.holdPiece = null;
      this.canHold = true;
      this.bag = [];
      this.nextQueue = [];

      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.combo = -1;
      this.maxCombo = 0;
      this.backToBack = false;

      this.zoneCharge = 50;
      this.isZoneActive = false;
      this.zoneTimer = 0;
      this.zoneLinesCount = 0;
      this.zoneRows = [];

      this.perfectBeatsCount = 0;
      this.totalJudgedActions = 0;
      this.syncBonusTotal = 0;

      document.body.classList.remove('zone-active');
      if (this.dom.zoneOverlayBanner) this.dom.zoneOverlayBanner.classList.add('hidden');

      this.refillBag();
      this.updateHUD();
      this.renderHoldPreview();
      this.renderNextPreview();

      this.startGame();
    }

    togglePause() {
      if (!this.isRunning || this.isGameOver) return;

      this.isPaused = !this.isPaused;

      if (this.isPaused) {
        if (this.dom.pauseModal) this.dom.pauseModal.classList.remove('hidden');
        if (this.audio) this.audio.stopMusic();
      } else {
        if (this.dom.pauseModal) this.dom.pauseModal.classList.add('hidden');
        if (this.audio) this.audio.startMusic(this.stageIndex);
        this.lastTimestamp = performance.now();
        safeRAF(ts => this.loop(ts));
      }
    }

    toggleMute() {
      if (!this.audio) return;
      const isMuted = this.audio.toggleMute();
      if (this.dom.muteIcon) this.dom.muteIcon.textContent = isMuted ? '🔇' : '🔊';
      if (this.dom.muteLabel) this.dom.muteLabel.textContent = isMuted ? 'Silencio' : 'Audio';
      if (this.dom.btnMute) this.dom.btnMute.classList.toggle('active', !isMuted);
    }

    toggleCameraFx() {
      if (!this.visuals) return;
      this.visuals.cameraSweepEnabled = !this.visuals.cameraSweepEnabled;
      const enabled = this.visuals.cameraSweepEnabled;
      if (this.dom.btnToggleCamFx) {
        this.dom.btnToggleCamFx.classList.toggle('active', enabled);
      }
      if (this.dom.camFxLabel) {
        this.dom.camFxLabel.textContent = `Cámara Dinámica: ${enabled ? 'ON' : 'OFF'}`;
      }
    }

    triggerGameOver() {
      this.isRunning = false;
      this.isGameOver = true;

      if (this.audio) {
        this.audio.stopMusic();
      }

      // Populate game over modal
      if (this.dom.finalScore) this.dom.finalScore.textContent = this.score.toLocaleString();
      if (this.dom.finalLines) this.dom.finalLines.textContent = this.lines.toString();
      if (this.dom.finalMaxCombo) this.dom.finalMaxCombo.textContent = `${this.maxCombo}x`;
      if (this.dom.finalSyncBonus) {
        this.dom.finalSyncBonus.textContent = `+${this.syncBonusTotal.toLocaleString()} PTS`;
      }

      if (this.dom.gameoverModal) {
        this.dom.gameoverModal.classList.remove('hidden');
      }
    }

    loop(timestamp) {
      if (!this.isRunning || this.isPaused || this.isGameOver) return;

      const dt = Math.min(100, timestamp - this.lastTimestamp);
      this.lastTimestamp = timestamp;

      // 1. Zone Mode Countdown
      if (this.isZoneActive) {
        this.zoneTimer -= dt / 1000.0;
        if (this.dom.zoneTimerText) {
          this.dom.zoneTimerText.textContent = `${Math.max(0, this.zoneTimer).toFixed(1)}s`;
        }

        const remainingRatio = Math.max(0, this.zoneTimer / this.zoneDuration);
        if (this.dom.zoneFillBar) {
          this.dom.zoneFillBar.style.width = `${remainingRatio * 100}%`;
        }
        if (this.visuals) {
          this.visuals.setZoneVisuals(true, remainingRatio);
        }

        // Zone timer exhausted
        if (this.zoneTimer <= 0) {
          this.deactivateZone();
        }
      }

      // 2. Normal Gravity (Disabled in Zone Mode)
      if (!this.isZoneActive && this.activePiece) {
        this.gravityTimer += dt;
        const gravityInterval = this.getGravityInterval();

        if (this.gravityTimer >= gravityInterval) {
          this.gravityTimer = 0;
          if (this.isValidPosition(this.activePiece.matrix, this.activePiece.x, this.activePiece.y + 1)) {
            this.activePiece.y++;
            this.lastActionWasRotate = false;
            this.isLocking = false;
            this.syncVisualBoard();
          } else {
            this.isLocking = true;
          }
        }
      }

      // 3. Lock Delay Check (500ms when grounded)
      if (this.activePiece) {
        const isGrounded = !this.isValidPosition(this.activePiece.matrix, this.activePiece.x, this.activePiece.y + 1);
        if (isGrounded) {
          this.isLocking = true;
          this.lockTimer += dt;
          if (this.lockTimer >= this.lockDelayMs || this.lockResets >= this.maxLockResets) {
            this.lockPiece();
          }
        } else {
          this.isLocking = false;
          this.lockTimer = 0;
        }
      }

      safeRAF(ts => this.loop(ts));
    }
  }

  // Expose as window.TetrisEffectGame
  global.TetrisEffectGame = TetrisEffectGame;

  // Initialize on DOM load cleanly
  function onReady() {
    if (!global.tetrisGame) {
      global.tetrisGame = new TetrisEffectGame();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

})(typeof window !== 'undefined' ? window : globalThis);
