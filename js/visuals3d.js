/**
 * ============================================================================
 * SYNTHESIA VISUALS 3D - High-Performance WebGL Synesthetic Renderer
 * Optimized for Intel HD Graphics 5500 / Crostini Linux (60 FPS locked)
 * Zero external assets - 100% Procedural Geometries, Shaders & Particle Systems
 * ============================================================================
 */

(function () {
  'use strict';

  // --- Color Palette Constants & Helpers ---
  const TETRIS_COLORS = {
    I: '#00f5d4', // Cyan Laser
    O: '#fee440', // Solar Gold
    T: '#c77dff', // Amethyst Plasma
    S: '#00f566', // Bioluminescent Emerald
    Z: '#ff2a85', // Crimson Neon
    J: '#3a86ff', // Deep Cobalt
    L: '#ff9e00', // Amber Flare
    DEFAULT: '#00f5d4'
  };

  const STAGE_THEMES = [
    {
      name: 'Atardecer en la Alhambra de Granada',
      bg: 0x240e1e,
      fog: 0x5a1827,
      fogDensity: 0.016,
      ambient: 0x773344,
      directional: 0xffaa44,
      frameColor: 0xff8c00,
      gridColor: [1.0, 0.65, 0.2],
      accentColor: 0xff8c00,
      accent: '#ff8c00'
    },
    {
      name: 'Cyberpunk Synthwave',
      bg: 0x090018,
      fog: 0x0d0022,
      fogDensity: 0.018,
      ambient: 0x220038,
      directional: 0xff0077,
      frameColor: 0xff0099,
      gridColor: [0.55, 0.08, 0.65],
      accentColor: 0x00f0ff
    },
    {
      name: 'Nebulosa Cósmica',
      bg: 0x010008,
      fog: 0x030010,
      fogDensity: 0.015,
      ambient: 0x120028,
      directional: 0xa855f7,
      frameColor: 0xb388ff,
      gridColor: [0.35, 0.20, 0.65],
      accentColor: 0xffd700
    }
  ];

  function hexToRgb(hex) {
    if (typeof hex !== 'string') return [0, 0.96, 0.83];
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    if (isNaN(num)) return [0, 0.96, 0.83];
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255
    ];
  }

  // --- High-Performance Particle Pool ---
  class SynesthesiaParticlePool {
    constructor(scene, maxParticles = 1400) {
      this.scene = scene;
      this.maxParticles = maxParticles;
      this.particles = [];
      this.activeCount = 0;

      // Single preallocated BufferGeometry for zero GC overhead
      this.geometry = new THREE.BufferGeometry();
      this.positions = new Float32Array(maxParticles * 3);
      this.colors = new Float32Array(maxParticles * 3);
      this.sizes = new Float32Array(maxParticles);

      this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
      this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
      this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

      // Procedural soft-glow circular particle shader
      const vertexShader = `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (260.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `;

      const fragmentShader = `
        varying vec3 vColor;
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;
          // Smooth diamond-like particle falloff with hot white core
          float intensity = smoothstep(0.5, 0.0, dist);
          float core = smoothstep(0.18, 0.0, dist) * 0.75;
          vec3 finalColor = vColor + vec3(core);
          gl_FragColor = vec4(finalColor, intensity);
        }
      `;

      this.material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      this.pointsMesh = new THREE.Points(this.geometry, this.material);
      this.scene.add(this.pointsMesh);

      // Preallocate particle records
      for (let i = 0; i < maxParticles; i++) {
        this.particles.push({
          active: false,
          x: 0, y: 0, z: 0,
          vx: 0, vy: 0, vz: 0,
          ax: 0, ay: 0, az: 0,
          drag: 0.98,
          r: 1, g: 1, b: 1,
          size: 1,
          life: 0,
          maxLife: 1,
          gravityHole: null
        });
      }
    }

    spawn(x, y, z, vx, vy, vz, r, g, b, size, maxLife, drag = 0.98, gravityHole = null) {
      if (this.activeCount >= this.maxParticles) return null;
      let p = null;
      for (let i = 0; i < this.maxParticles; i++) {
        if (!this.particles[i].active) {
          p = this.particles[i];
          break;
        }
      }
      if (!p) return null;

      p.active = true;
      p.x = x; p.y = y; p.z = z;
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.ax = 0; p.ay = 0; p.az = 0;
      p.r = r; p.g = g; p.b = b;
      p.size = size;
      p.life = 0;
      p.maxLife = maxLife;
      p.drag = drag;
      p.gravityHole = gravityHole;
      this.activeCount++;
      return p;
    }

    update(dt, blackHolePos = null, isStage2 = false) {
      let renderIndex = 0;

      for (let i = 0; i < this.maxParticles; i++) {
        const p = this.particles[i];
        if (!p.active) continue;

        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          this.activeCount--;
          continue;
        }

        const lifeRatio = p.life / p.maxLife;

        // Stage 2 Gravitational pull towards Black Hole
        if (isStage2 && blackHolePos && p.gravityHole) {
          const dx = blackHolePos.x - p.x;
          const dy = blackHolePos.y - p.y;
          const dz = blackHolePos.z - p.z;
          const distSq = dx * dx + dy * dy + dz * dz + 4.0;
          const force = (95.0 / distSq) * dt;
          p.vx += dx * force;
          p.vy += dy * force;
          p.vz += dz * force;
          // Spiral swirl component
          p.vx += -dz * force * 0.4;
          p.vz += dx * force * 0.4;
        }

        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vz *= p.drag;

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;

        // Dynamic fade and shrink
        const fade = Math.sin(lifeRatio * Math.PI);
        const curSize = p.size * (1.0 - lifeRatio * 0.5) * fade;

        const i3 = renderIndex * 3;
        this.positions[i3] = p.x;
        this.positions[i3 + 1] = p.y;
        this.positions[i3 + 2] = p.z;

        this.colors[i3] = p.r * fade;
        this.colors[i3 + 1] = p.g * fade;
        this.colors[i3 + 2] = p.b * fade;

        this.sizes[renderIndex] = Math.max(0.001, curSize);
        renderIndex++;
      }

      this.geometry.setDrawRange(0, renderIndex);
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
    }
  }

  // ==========================================================================
  // MAIN CLASS: SynesthesiaVisuals3D
  // ==========================================================================
  class SynesthesiaVisuals3D {
    constructor(containerEl) {
      this.container = typeof containerEl === 'string'
        ? document.querySelector(containerEl)
        : (containerEl || document.body);

      // Core Three.js components
      this.scene = null;
      this.camera = null;
      this.renderer = null;

      // Scene hierarchy
      this.worldGroup = null;
      this.boardGroup = null;
      this.boardBlocksMesh = null;
      this.boardEdgesMesh = null;
      this.backboardMesh = null;
      this.frameGroup = null;
      this.pedestalGroup = null;
      this.innerWallsGroup = null;
      this.dropGuideGroup = null;
      this.activePieceGroup = null;
      this.ghostPieceGroup = null;
      this.dropCurtainMesh = null;
      this.resonanceRingMesh = null;

      // Stage groups
      this.stage0Group = null;
      this.stage1Group = null;
      this.stage2Group = null;

      // Lights
      this.ambientLight = null;
      this.directionalLight = null;
      this.boardSpotLight = null;

      // Particle system pool
      this.particlePool = null;

      // State & Animation parameters
      this.currentStage = 0;
      this.targetStage = 0;
      this.stageTransitionProgress = 1.0;
      this.timeScale = 1.0;
      this.cameraSweepEnabled = true;

      // Shockwave shader uniforms state
      this.shockwaveState = {
        center: new THREE.Vector2(0.5, 0.5),
        time: 99.0,
        intensity: 0.0
      };

      // Beat resonance state
      this.beatPulseValue = 0.0;
      this.resonanceRingState = {
        radius: 0.1,
        maxRadius: 24.0,
        opacity: 0.0,
        color: new THREE.Color(0x00ffff)
      };

      // Board recoil physics (Spring-Damper)
      this.recoil = {
        y: 0.0,
        velY: 0.0,
        rotX: 0.0,
        velRotX: 0.0,
        k: 120.0,
        damping: 14.0
      };

      // Active piece deformation juice
      this.activeSquash = new THREE.Vector3(1, 1, 1);
      this.activeLean = 0.0;
      this.activeLeanTarget = 0.0;

      // Camera Parallax & Sweep
      this.baseCameraPos = new THREE.Vector3(0, 0.3, 38.0);
      this.mouseTarget = new THREE.Vector2(0, 0);
      this.mouseLerp = new THREE.Vector2(0, 0);
      this.pieceOffsetX = 0.0;
      this.cameraSweep = {
        active: false,
        time: 0.0,
        duration: 1.4,
        startAngle: 0.0,
        targetAngle: Math.PI * 0.45
      };

      // Zone mode state
      this.zoneActive = false;
      this.zoneProgress = 0.0;

      // Stage animated objects holders
      // Stage 0: Water, God-Rays, Manta Rays, Jellyfish, Seabed
      this.stage0WaterMesh = null;
      this.stage0WaterMat = null;
      this.stage0GodRays = [];
      this.stage0MantaRays = [];
      this.stage0Jellyfish = [];
      this.stage0Bubbles = [];
      this.stage0Flora = [];
      this.stage0Vents = [];

      // Stage 1: Wet highway terrain, Skyline, Mecha Sub-Woofers, Spinners
      this.stage1TerrainMat = null;
      this.stage1SunMat = null;
      this.stage1Buildings = [];
      this.stage1Monoliths = [];
      this.stage1Spinners = [];
      this.stage1Lasers = [];

      // Stage 2: Black Hole with Lensing & Jets, Gyroscope Armillary, Asteroids
      this.stage2BlackHole = null;
      this.stage2AccretionMat = null;
      this.stage2EinsteinMat = null;
      this.stage2GalaxyPoints = null;
      this.stage2GyroRings = [];
      this.stage2Asteroids = [];
      this.blackHolePos = new THREE.Vector3(0, 1.5, -34);

      // Floor Pedestal & Columns
      this.landingPadMaterials = [];
      this.subwooferCones = [];
      this.eqBars = [];

      // Drop guide filaments and lasers
      this.dropGuideLeftBeam = null;
      this.dropGuideRightBeam = null;
      this.dropFilaments = [];
      this.dropFilamentMats = [];

      // Preallocated block structures
      this.activeBlocks = [];
      this.activeBlockMaterials = [];
      this.ghostBlocks = [];
      this.ghostMaterials = [];
      this.ghostPlates = [];
      this.tempMatrix = new THREE.Matrix4();
      this.tempColor = new THREE.Color();
      this.tempVector = new THREE.Vector3();

      // Timing
      this.clock = new THREE.Clock();
      this.prevTime = performance.now();
      this.isDestroyed = false;

      // Bind methods
      this.animate = this.animate.bind(this);
      this.onWindowResize = this.onWindowResize.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
    }

    // ========================================================================
    // INITIALIZATION & CAMERA FRAMING
    // ========================================================================
    init() {
      // 1. Scene & Camera
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(STAGE_THEMES[0].bg);
      this.scene.fog = new THREE.FogExp2(STAGE_THEMES[0].fog, STAGE_THEMES[0].fogDensity);

      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      this.camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 550);

      // Dynamically calculate camera Z so that world height 26.5 ALWAYS fits generously
      this.updateCameraFraming(width, height);
      this.camera.position.copy(this.baseCameraPos);
      this.camera.lookAt(0, 0.2, 0);

      // 2. WebGL Renderer with Crostini / Intel HD 5500 optimization
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      if ('outputColorSpace' in this.renderer) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.container.appendChild(this.renderer.domElement);

      // 3. Lighting Rig
      this.setupLighting();

      // 4. World Groups
      this.worldGroup = new THREE.Group();
      this.scene.add(this.worldGroup);

      this.boardGroup = new THREE.Group();
      this.worldGroup.add(this.boardGroup);

      // 5. Build 3D Board (10x20 centered at origin)
      this.buildBackboardGrid();
      this.buildInnerSideWalls();
      this.buildBoardFrame();
      this.buildFloorPedestal();
      this.buildBoardBlockSystem();
      this.buildActivePieceSystem();
      this.buildGhostPieceSystem();
      this.buildDropGuideSystem();
      this.buildDropCurtain();
      this.buildResonanceRing();

      // 6. Particle Systems Pool
      this.particlePool = new SynesthesiaParticlePool(this.scene, 1400);

      // 7. Build 3 Journey Environments
      this.buildStage0Alhambra();
      this.buildStage1Synthwave();
      this.buildStage2Cosmic();

      // Set initial stage
      this.setStage(0, true);

      // 8. Event Listeners
      window.addEventListener('resize', this.onWindowResize);
      window.addEventListener('pointermove', this.onPointerMove);

      // Start Render Loop
      this.clock.start();
      requestAnimationFrame(this.animate);

      return this;
    }

    updateCameraFraming(w, h) {
      const width = w || (this.container ? this.container.clientWidth : window.innerWidth) || window.innerWidth;
      const height = h || (this.container ? this.container.clientHeight : window.innerHeight) || window.innerHeight;
      const aspect = Math.max(0.1, width / height);

      this.camera.aspect = aspect;

      if (aspect < 1.0) {
        // Mobile portrait mode: board width is 10 units (-5 to +5).
        // Target dimensions +15% distance ensures board does not occlude the background sunset & Alhambra
        this.camera.fov = 38;
        this.camera.updateProjectionMatrix();
        const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
        const targetW = 13.0;
        const targetH = 26.5;
        const zDistH = (targetH * 0.5) / Math.tan(vFovRad * 0.5);
        const hFovRad = 2.0 * Math.atan(Math.tan(vFovRad * 0.5) * aspect);
        const zDistW = (targetW * 0.5) / Math.tan(hFovRad * 0.5);

        this.baseCameraPos.z = Math.max(zDistH, zDistW);
        // Slightly lower camera center so board sits nicely between top HUD and bottom thumb zone
        this.baseCameraPos.y = -0.6;
        this.baseCameraPos.x = 0.0;
      } else {
        // Desktop / Landscape mode
        this.camera.fov = 34; // Telephoto perspective eliminates wide-angle distortion at edges
        this.camera.updateProjectionMatrix();
        const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
        const targetH = 26.5;
        const targetW = 16.5;
        const zDistH = (targetH * 0.5) / Math.tan(vFovRad * 0.5);
        const hFovRad = 2.0 * Math.atan(Math.tan(vFovRad * 0.5) * aspect);
        const zDistW = (targetW * 0.5) / Math.tan(hFovRad * 0.5);

        this.baseCameraPos.z = Math.max(zDistH, zDistW);
        this.baseCameraPos.y = 0.3;
        this.baseCameraPos.x = 0.0;
      }
    }

    // ========================================================================
    // LIGHTING RIG
    // ========================================================================
    setupLighting() {
      this.ambientLight = new THREE.AmbientLight(STAGE_THEMES[0].ambient, 1.35);
      this.scene.add(this.ambientLight);

      this.directionalLight = new THREE.DirectionalLight(STAGE_THEMES[0].directional, 1.85);
      this.directionalLight.position.set(10, 16, 22);
      this.scene.add(this.directionalLight);

      // Board rim fill light
      this.boardSpotLight = new THREE.PointLight(0x00f5d4, 2.6, 38, 1.5);
      this.boardSpotLight.position.set(0, 0.5, 14);
      this.scene.add(this.boardSpotLight);
    }

    // ========================================================================
    // 3D TETRIS BOARD BACKBOARD (Zebra Contrast, Active Corridor, Shockwaves)
    // ========================================================================
    buildBackboardGrid() {
      // Board spans X from -5 to +5 (width 10), Y from +10 down to -10 (height 20)
      // Placed flush at Z = -0.42 to eliminate parallax separation from blocks at Z = 0
      const planeGeo = new THREE.PlaneGeometry(10, 20, 64, 128);

      const vertexShader = `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        uniform vec2 uShockCenter;
        uniform float uShockTime;
        uniform float uShockIntensity;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // Radial 3D wave displacement on board mesh itself
          vec2 centeredUv = uv - uShockCenter;
          centeredUv.y *= 2.0;
          float dist = length(centeredUv);

          float waveRadius = uShockTime * 2.5;
          float waveWidth = 0.18;
          float waveDist = abs(dist - waveRadius);
          float wave = exp(-pow(waveDist / waveWidth, 2.0)) * uShockIntensity * max(0.0, 1.0 - uShockTime * 1.6);

          pos.z += sin(dist * 25.0 - uShockTime * 15.0) * wave * 0.45;

          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `;

      const fragmentShader = `
        varying vec2 vUv;
        varying vec3 vWorldPosition;

        uniform float uTime;
        uniform vec2 uShockCenter;
        uniform float uShockTime;
        uniform float uShockIntensity;
        uniform float uBeatPulse;
        uniform float uZoneMode;
        uniform int uStage;
        uniform vec3 uGridColor;
        uniform float uActiveColMin;
        uniform float uActiveColMax;

        void main() {
          // Board 10 columns x 20 rows
          vec2 toCenter = vUv - uShockCenter;
          toCenter.y *= 2.0;
          float dist = length(toCenter);

          // Radial chromatic shockwave distortion
          float waveSpeed = 2.4;
          float waveRadius = uShockTime * waveSpeed;
          float waveWidth = 0.16;
          float waveDist = abs(dist - waveRadius);
          float waveFactor = exp(-pow(waveDist / waveWidth, 2.0)) * uShockIntensity * max(0.0, 1.0 - uShockTime * 1.5);

          vec2 disp = (dist > 0.001) ? normalize(toCenter) * waveFactor * 0.05 : vec2(0.0);
          disp.y *= 0.5;

          vec2 distortedUv = vUv - disp;
          vec2 gridUV = distortedUv * vec2(10.0, 20.0);

          // Subtle alternating vertical column zebra lanes (col 0..9)
          float colIdx = floor(gridUV.x);
          float zebra = mod(colIdx, 2.0) * 0.038;

          // Crisp neon grid lines
          vec2 cell = fract(gridUV);
          vec2 cellEdge = abs(cell - 0.5);
          float lineThick = 0.038;
          float lineX = smoothstep(0.5 - lineThick, 0.5, cellEdge.x);
          float lineY = smoothstep(0.5 - lineThick * 0.5, 0.5, cellEdge.y);
          float gridLine = max(lineX, lineY);

          // Translucent smoked glass backing (~42%) allowing background vista to show through
          vec4 baseColor = vec4(0.012 + zebra, 0.018 + zebra * 1.2, 0.035 + zebra * 1.5, 0.42);

          // Dynamic grid line color modulated by Stage, Beat & Zone
          vec3 neonColor = uGridColor;
          if (uZoneMode > 0.0) {
            vec3 zoneGold = vec3(1.0, 0.85, 0.28);
            neonColor = mix(neonColor, zoneGold, uZoneMode);
            baseColor = mix(baseColor, vec4(0.12, 0.08, 0.02, 0.50), uZoneMode);
          }

          // Active Piece Vertical Drop Corridor illumination
          if (uActiveColMin >= 0.0 && gridUV.x >= uActiveColMin && gridUV.x <= uActiveColMax) {
            float corridorFade = smoothstep(0.0, 0.12, gridUV.x - uActiveColMin) *
                                 smoothstep(0.0, 0.12, uActiveColMax - gridUV.x);
            vec3 corridorGlow = mix(neonColor, vec3(0.9, 1.0, 1.0), 0.35) * (0.16 + uBeatPulse * 0.08) * corridorFade;
            baseColor.rgb += corridorGlow;
          }

          // Beat pulse flash on intersections
          float dotGrid = smoothstep(0.40, 0.49, cellEdge.x) * smoothstep(0.40, 0.49, cellEdge.y);
          vec3 finalGrid = neonColor * (gridLine * 0.70 + dotGrid * (0.55 + uBeatPulse * 0.95));

          // Shockwave chromatic rim glow
          if (waveFactor > 0.002) {
            vec3 shockR = vec3(1.0, 0.1, 0.5);
            vec3 shockB = vec3(0.0, 0.9, 1.0);
            vec3 shockCol = mix(shockB, shockR, sin(dist * 30.0 - uTime * 8.0) * 0.5 + 0.5);
            if (uZoneMode > 0.5) shockCol = vec3(1.0, 0.95, 0.5);
            finalGrid += shockCol * waveFactor * 2.8;
          }

          vec3 rgb = mix(baseColor.rgb, finalGrid, clamp(gridLine + dotGrid + waveFactor * 1.5, 0.0, 1.0));

          // Board border edge vignette
          float borderVig = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) *
                            smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
          rgb *= (0.45 + 0.55 * borderVig);

          // Sharp neon grid lines and shockwave flashes with translucent ~42% smoked glass base
          float finalAlpha = clamp(baseColor.a + gridLine * 0.45 + dotGrid * 0.45 + waveFactor * 1.2, 0.0, 1.0);
          gl_FragColor = vec4(rgb, finalAlpha);
        }
      `;

      this.backboardMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0.0 },
          uShockCenter: { value: this.shockwaveState.center },
          uShockTime: { value: this.shockwaveState.time },
          uShockIntensity: { value: this.shockwaveState.intensity },
          uBeatPulse: { value: 0.0 },
          uZoneMode: { value: 0.0 },
          uStage: { value: 0 },
          uGridColor: { value: new THREE.Vector3(...STAGE_THEMES[0].gridColor) },
          uActiveColMin: { value: -1.0 },
          uActiveColMax: { value: -1.0 }
        },
        transparent: true,
        depthWrite: false
      });

      this.backboardMesh = new THREE.Mesh(planeGeo, this.backboardMaterial);
      this.backboardMesh.position.set(0, 0, -0.42);
      this.boardGroup.add(this.backboardMesh);
    }

    // ========================================================================
    // CRISP 3D INNER SIDE WALLS & ROW NOTCHES (Eliminates Parallax Distortion)
    // ========================================================================
    buildInnerSideWalls() {
      this.innerWallsGroup = new THREE.Group();
      this.boardGroup.add(this.innerWallsGroup);

      // Deep obsidian side walls flush with X = -5.0 and X = +5.0 spanning Z = -0.45 to +0.48
      const wallThickness = 0.08;
      const wallHeight = 20.0;
      const wallDepth = 0.93; // -0.45 to +0.48
      const wallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, wallDepth);

      this.innerWallMat = new THREE.MeshStandardMaterial({
        color: 0x050d18,
        roughness: 0.25,
        metalness: 0.88
      });

      // Left Wall
      const leftWall = new THREE.Mesh(wallGeo, this.innerWallMat);
      leftWall.position.set(-5.04, 0, 0.015);
      this.innerWallsGroup.add(leftWall);

      // Right Wall
      const rightWall = new THREE.Mesh(wallGeo, this.innerWallMat);
      rightWall.position.set(5.04, 0, 0.015);
      this.innerWallsGroup.add(rightWall);

      // 20 Horizontal Row Notch Dividers (r = 0..19) along both side walls
      const notchGeo = new THREE.BoxGeometry(0.04, 0.04, 0.88);
      this.notchMat = new THREE.MeshBasicMaterial({
        color: STAGE_THEMES[0].frameColor,
        transparent: true,
        opacity: 0.75
      });

      for (let r = 0; r < 20; r++) {
        const rowY = 9.5 - r;

        // Left wall notch
        const leftNotch = new THREE.Mesh(notchGeo, this.notchMat);
        leftNotch.position.set(-4.99, rowY, 0.015);
        this.innerWallsGroup.add(leftNotch);

        // Right wall notch
        const rightNotch = new THREE.Mesh(notchGeo, this.notchMat);
        rightNotch.position.set(4.99, rowY, 0.015);
        this.innerWallsGroup.add(rightNotch);
      }
    }

    // ========================================================================
    // OUTER 3D GLOWING FRAME & NEON RAILS
    // ========================================================================
    buildBoardFrame() {
      this.frameGroup = new THREE.Group();
      this.boardGroup.add(this.frameGroup);

      // Neon rails material
      this.frameMaterial = new THREE.MeshStandardMaterial({
        color: STAGE_THEMES[0].frameColor,
        emissive: STAGE_THEMES[0].frameColor,
        emissiveIntensity: 0.85,
        roughness: 0.25,
        metalness: 0.8
      });

      const railThick = 0.24;
      const railDepth = 1.1;

      // Left Rail
      const vRailGeo = new THREE.BoxGeometry(railThick, 20.48, railDepth);
      const leftRail = new THREE.Mesh(vRailGeo, this.frameMaterial);
      leftRail.position.set(-5.12, 0, 0.015);
      this.frameGroup.add(leftRail);

      // Right Rail
      const rightRail = new THREE.Mesh(vRailGeo, this.frameMaterial);
      rightRail.position.set(5.12, 0, 0.015);
      this.frameGroup.add(rightRail);

      // Bottom Rail
      const hRailGeo = new THREE.BoxGeometry(10.48, railThick, railDepth);
      const bottomRail = new THREE.Mesh(hRailGeo, this.frameMaterial);
      bottomRail.position.set(0, -10.12, 0.015);
      this.frameGroup.add(bottomRail);

      // Top Rail Header
      const topRail = new THREE.Mesh(hRailGeo, this.frameMaterial);
      topRail.position.set(0, 10.12, 0.015);
      this.frameGroup.add(topRail);

      // 4 Cyberpunk Bevel Corner Brackets
      const cornerGeo = new THREE.BoxGeometry(0.55, 0.55, railDepth * 1.2);
      this.cornerMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: STAGE_THEMES[0].frameColor,
        emissiveIntensity: 1.2,
        roughness: 0.1,
        metalness: 0.95
      });

      const corners = [
        [-5.12, 10.12],
        [5.12, 10.12],
        [-5.12, -10.12],
        [5.12, -10.12]
      ];

      corners.forEach(([cx, cy]) => {
        const cMesh = new THREE.Mesh(cornerGeo, this.cornerMaterial);
        cMesh.position.set(cx, cy, 0.015);
        this.frameGroup.add(cMesh);
      });
    }

    // ========================================================================
    // 3D HI-FI ARCADE / SUB-WOOFER FLOOR PEDESTAL (Y = -10.0 to -11.8)
    // ========================================================================
    buildFloorPedestal() {
      this.pedestalGroup = new THREE.Group();
      this.boardGroup.add(this.pedestalGroup);

      // 1. Upper deck plate directly under the bottom rail
      const upperGeo = new THREE.BoxGeometry(11.8, 0.22, 1.4);
      const upperMat = new THREE.MeshStandardMaterial({
        color: 0x0b1424,
        roughness: 0.2,
        metalness: 0.92
      });
      const upperMesh = new THREE.Mesh(upperGeo, upperMat);
      upperMesh.position.set(0, -10.14, 0.015);
      this.pedestalGroup.add(upperMesh);

      // Main console chassis body (Y = -10.25 down to -11.75)
      const consoleGeo = new THREE.BoxGeometry(12.4, 1.45, 1.6);
      const consoleMat = new THREE.MeshStandardMaterial({
        color: 0x050c18,
        roughness: 0.28,
        metalness: 0.88
      });
      const consoleMesh = new THREE.Mesh(consoleGeo, consoleMat);
      consoleMesh.position.set(0, -10.98, 0.015);
      this.pedestalGroup.add(consoleMesh);

      // Outer neon frame edge outline on chassis
      const consoleEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(consoleGeo),
        new THREE.LineBasicMaterial({ color: STAGE_THEMES[0].frameColor, transparent: true, opacity: 0.75 })
      );
      consoleMesh.add(consoleEdges);
      this.pedestalEdges = consoleEdges;

      // 2. 10 Landing Pad Tiles on upper floor surface (col 0..9 at Y = -10.02, X = c - 4.5)
      this.landingPadMaterials = [];
      const padGeo = new THREE.BoxGeometry(0.88, 0.06, 0.88);

      for (let c = 0; c < 10; c++) {
        const padMat = new THREE.MeshStandardMaterial({
          color: STAGE_THEMES[0].frameColor,
          emissive: STAGE_THEMES[0].frameColor,
          emissiveIntensity: 0.15,
          roughness: 0.2,
          metalness: 0.8
        });
        const padMesh = new THREE.Mesh(padGeo, padMat);
        padMesh.position.set(c - 4.5, -10.02, 0.0);
        this.pedestalGroup.add(padMesh);
        this.landingPadMaterials.push(padMat);
      }

      // 3. 2 Flanking 3D Sub-Woofer Speaker Cones (X = -5.6 and X = +5.6 at Y = -10.9)
      this.subwooferCones = [];
      const speakerXPositions = [-5.6, 5.6];

      const rimGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.18, 64);
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x162234,
        roughness: 0.2,
        metalness: 0.95
      });
      const coneGeo = new THREE.ConeGeometry(0.46, 0.28, 64, 1, true);
      const coneMat = new THREE.MeshStandardMaterial({
        color: 0x050a12,
        roughness: 0.45,
        metalness: 0.6
      });
      const capGeo = new THREE.SphereGeometry(0.18, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0x00f5d4,
        emissive: 0x00f5d4,
        emissiveIntensity: 0.7,
        roughness: 0.15,
        metalness: 0.85
      });

      speakerXPositions.forEach(sx => {
        const sGroup = new THREE.Group();
        sGroup.position.set(sx, -10.95, 0.76);

        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.x = Math.PI / 2;
        sGroup.add(rim);

        // Glowing neon LED bezel ring
        const ringGeo = new THREE.RingGeometry(0.52, 0.57, 96);
        const ringMat = new THREE.MeshBasicMaterial({
          color: STAGE_THEMES[0].frameColor,
          side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0, 0.1);
        sGroup.add(ring);

        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.rotation.x = -Math.PI / 2;
        cone.position.set(0, 0, -0.05);
        sGroup.add(cone);

        const cap = new THREE.Mesh(capGeo, capMat);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(0, 0, 0.06);
        sGroup.add(cap);

        this.pedestalGroup.add(sGroup);
        this.subwooferCones.push({ group: sGroup, cone, cap, ringMat });
      });

      // 4. 10-bar 3D LED Equalizer Strip across the front of the pedestal
      this.eqBars = [];
      const barGeo = new THREE.BoxGeometry(0.68, 0.52, 0.08);

      for (let c = 0; c < 10; c++) {
        const barMat = new THREE.MeshBasicMaterial({
          color: STAGE_THEMES[0].accentColor,
          transparent: true,
          opacity: 0.92
        });
        const barMesh = new THREE.Mesh(barGeo, barMat);
        const barX = (c - 4.5) * 0.86;
        barMesh.position.set(barX, -10.9, 0.84);
        this.pedestalGroup.add(barMesh);
        this.eqBars.push({ mesh: barMesh, mat: barMat, baseX: barX, col: c });
      }
    }

    // ========================================================================
    // LOCKED BOARD BLOCKS (Comic/Cel Jewel Core + Crisp Edge Outlines)
    // ========================================================================
    buildBoardBlockSystem() {
      // 200 possible board cells (10x20)
      const maxBlocks = 200;
      this.blockBodyGeo = new THREE.BoxGeometry(0.92, 0.92, 0.84);
      this.blockEdgesGeo = new THREE.EdgesGeometry(this.blockBodyGeo);

      this.boardBlockMaterial = new THREE.MeshStandardMaterial({
        roughness: 0.16,
        metalness: 0.42,
        transparent: true,
        opacity: 0.98
      });

      this.boardEdgesMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        linewidth: 2
      });

      this.boardBlocksMesh = new THREE.InstancedMesh(this.blockBodyGeo, this.boardBlockMaterial, maxBlocks);
      this.boardBlocksMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.boardBlocksMesh.count = 0;
      this.boardGroup.add(this.boardBlocksMesh);

      this.boardEdgesMesh = new THREE.InstancedMesh(this.blockEdgesGeo, this.boardEdgesMaterial, maxBlocks);
      this.boardEdgesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.boardEdgesMesh.count = 0;
      this.boardGroup.add(this.boardEdgesMesh);
    }

    // ========================================================================
    // ACTIVE PIECE SYSTEM (Dedicated Group for Squash & Stretch Juice)
    // ========================================================================
    buildActivePieceSystem() {
      this.activePieceGroup = new THREE.Group();
      this.boardGroup.add(this.activePieceGroup);

      this.activeBlockMaterials = [];
      this.activeBlocks = [];

      for (let i = 0; i < 4; i++) {
        const mat = new THREE.MeshStandardMaterial({
          roughness: 0.12,
          metalness: 0.48,
          emissiveIntensity: 0.75,
          transparent: true,
          opacity: 0.99
        });
        const mesh = new THREE.Mesh(this.blockBodyGeo, mat);

        const edgeMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          linewidth: 2,
          transparent: true,
          opacity: 1.0
        });
        const edgeMesh = new THREE.LineSegments(this.blockEdgesGeo, edgeMat);
        mesh.add(edgeMesh);

        mesh.visible = false;
        this.activeBlocks.push(mesh);
        this.activeBlockMaterials.push(mat);
        this.activePieceGroup.add(mesh);
      }
    }

    // ========================================================================
    // GHOST PIECE SYSTEM (High-Contrast Wireframe + Glowing Landing Plates)
    // ========================================================================
    buildGhostPieceSystem() {
      this.ghostPieceGroup = new THREE.Group();
      this.boardGroup.add(this.ghostPieceGroup);

      this.ghostBlocks = [];
      this.ghostMaterials = [];
      this.ghostPlates = [];

      const plateGeo = new THREE.PlaneGeometry(0.92, 0.92);

      for (let i = 0; i < 4; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x00f5d4,
          emissive: 0x00f5d4,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.24,
          roughness: 0.4,
          wireframe: false
        });
        const mesh = new THREE.Mesh(this.blockBodyGeo, mat);

        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x00f5d4,
          transparent: true,
          opacity: 0.88,
          linewidth: 2
        });
        const edgeMesh = new THREE.LineSegments(this.blockEdgesGeo, edgeMat);
        mesh.add(edgeMesh);

        // Bright Glowing Landing Top Plate
        const topPlateMat = new THREE.MeshBasicMaterial({
          color: 0x00f5d4,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        });
        const topPlate = new THREE.Mesh(plateGeo, topPlateMat);
        topPlate.rotation.x = -Math.PI / 2;
        topPlate.position.set(0, 0.42, 0);
        mesh.add(topPlate);

        // Glowing Landing Bottom Plate
        const botPlateMat = new THREE.MeshBasicMaterial({
          color: 0x00f5d4,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        });
        const botPlate = new THREE.Mesh(plateGeo, botPlateMat);
        botPlate.rotation.x = Math.PI / 2;
        botPlate.position.set(0, -0.42, 0);
        mesh.add(botPlate);

        mesh.visible = false;
        this.ghostBlocks.push(mesh);
        this.ghostMaterials.push(mat);
        this.ghostPlates.push({ top: topPlateMat, bot: botPlateMat, edge: edgeMat });
        this.ghostPieceGroup.add(mesh);
      }
    }

    // ========================================================================
    // DROP GUIDE SYSTEM (Active Piece Laser Corridor & Drop Filaments)
    // ========================================================================
    buildDropGuideSystem() {
      this.dropGuideGroup = new THREE.Group();
      this.boardGroup.add(this.dropGuideGroup);

      const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 24);

      // 1. Left Vertical Laser Boundary Beam
      this.dropGuideLeftMat = new THREE.MeshBasicMaterial({
        color: 0x00f5d4,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      });
      this.dropGuideLeftBeam = new THREE.Mesh(beamGeo, this.dropGuideLeftMat);
      this.dropGuideLeftBeam.visible = false;
      this.dropGuideGroup.add(this.dropGuideLeftBeam);

      // 2. Right Vertical Laser Boundary Beam
      this.dropGuideRightMat = new THREE.MeshBasicMaterial({
        color: 0x00f5d4,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      });
      this.dropGuideRightBeam = new THREE.Mesh(beamGeo, this.dropGuideRightMat);
      this.dropGuideRightBeam.visible = false;
      this.dropGuideGroup.add(this.dropGuideRightBeam);

      // 3. 4 Vertical Drop Filaments connecting each active block to ghost block
      this.dropFilaments = [];
      this.dropFilamentMats = [];

      for (let i = 0; i < 4; i++) {
        const fMat = new THREE.MeshBasicMaterial({
          color: 0x00f5d4,
          transparent: true,
          opacity: 0.38,
          blending: THREE.AdditiveBlending
        });
        const fMesh = new THREE.Mesh(beamGeo, fMat);
        fMesh.visible = false;
        this.dropFilaments.push(fMesh);
        this.dropFilamentMats.push(fMat);
        this.dropGuideGroup.add(fMesh);
      }
    }

    // ========================================================================
    // HARD DROP LIGHT CURTAIN RIBBON
    // ========================================================================
    buildDropCurtain() {
      const curtainGeo = new THREE.PlaneGeometry(1.0, 1.0);
      const vertexShader = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;
      const fragmentShader = `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uAlpha;
        void main() {
          float spine = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
          float vertFade = pow(vUv.y, 1.6);
          gl_FragColor = vec4(uColor + vec3(spine * 0.8), uAlpha * spine * (0.3 + 0.7 * vertFade));
        }
      `;

      this.dropCurtainMat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Vector3(0, 1, 1) },
          uAlpha: { value: 0.0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      this.dropCurtainMesh = new THREE.Mesh(curtainGeo, this.dropCurtainMat);
      this.dropCurtainMesh.visible = false;
      this.boardGroup.add(this.dropCurtainMesh);
    }

    // ========================================================================
    // EXPANDING BEAT RESONANCE RING (Sync with Music / Player Drops)
    // ========================================================================
    buildResonanceRing() {
      const ringGeo = new THREE.RingGeometry(0.2, 0.65, 128);
      this.resonanceRingMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.resonanceRingMesh = new THREE.Mesh(ringGeo, this.resonanceRingMat);
      this.resonanceRingMesh.position.set(0, 0, -0.4);
      this.resonanceRingMesh.visible = false;
      this.boardGroup.add(this.resonanceRingMesh);
    }


    // ==========================================================================
    // 1. SOBEL NORMAL MAP GENERATOR & PROCEDURAL CANVAS 2D TEXTURE SUITE
    // ==========================================================================
    generateStage0NormalMap(sourceCanvas, strength = 3.0) {
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      const srcCtx = sourceCanvas.getContext('2d');
      const srcData = srcCtx.getImageData(0, 0, w, h).data;

      const normalCanvas = document.createElement('canvas');
      normalCanvas.width = w;
      normalCanvas.height = h;
      const nCtx = normalCanvas.getContext('2d');
      const outImg = nCtx.createImageData(w, h);
      const dstData = outImg.data;

      const lumAt = (x, y) => {
        const cx = (x + w) % w;
        const cy = (y + h) % h;
        const idx = (cy * w + cx) * 4;
        return (srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114) / 255.0;
      };

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const tl = lumAt(x - 1, y - 1);
          const t  = lumAt(x,     y - 1);
          const tr = lumAt(x + 1, y - 1);
          const l  = lumAt(x - 1, y);
          const r  = lumAt(x + 1, y);
          const bl = lumAt(x - 1, y + 1);
          const b  = lumAt(x,     y + 1);
          const br = lumAt(x + 1, y + 1);

          const dX = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
          const dY = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);

          let nx = -dX * strength;
          let ny = -dY * strength;
          let nz = 1.0;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
          nx /= len;
          ny /= len;
          nz /= len;

          const idx = (y * w + x) * 4;
          dstData[idx]     = Math.floor((nx * 0.5 + 0.5) * 255);
          dstData[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
          dstData[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
          dstData[idx + 3] = 255;
        }
      }

      nCtx.putImageData(outImg, 0, 0);
      const tex = new THREE.CanvasTexture(normalCanvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    // ==========================================================================
    // 1. PROCEDURAL TEXTURES FOR LA ALHAMBRA DE GRANADA
    // ==========================================================================
    buildStage0AlhambraTextures() {
      const textures = {};

      // ------------------------------------------------------------------------
      // 1. TAPIAL CALICOSTRADO NAZARÍ ("LA ROJA" / AL-HAMRA) - 512x512
      // ------------------------------------------------------------------------
      // Encofrado tradicional andalusí de tapia calicostrada con cajones de ~80cm,
      // tongadas horizontales de apisonado, vetas de costra de cal apagada y gravilla de la Sabika.
      const tapialCanvas = document.createElement('canvas');
      tapialCanvas.width = 512;
      tapialCanvas.height = 512;
      const tpCtx = tapialCanvas.getContext('2d');

      const tapialHeightCanvas = document.createElement('canvas');
      tapialHeightCanvas.width = 512;
      tapialHeightCanvas.height = 512;
      const tpHCtx = tapialHeightCanvas.getContext('2d');

      // Base: Arcilla roja bermeja de la colina de la Sabika
      tpCtx.fillStyle = '#9c3b21';
      tpCtx.fillRect(0, 0, 512, 512);
      tpHCtx.fillStyle = '#808080';
      tpHCtx.fillRect(0, 0, 512, 512);

      // Cajones de tapia (4 cursos de encofrado de 128px de altura)
      const cajonTones = ['#a84326', '#91331c', '#b85433', '#9c3b21'];
      for (let c = 0; c < 4; c++) {
        const cY = c * 128;
        tpCtx.fillStyle = cajonTones[c];
        tpCtx.fillRect(0, cY, 512, 128);

        // Tongadas horizontales de apisonado (compactación con pisón de madera)
        for (let t = 0; t < 6; t++) {
          const tY = cY + t * 21;
          const bandAlpha = (t % 2 === 0) ? 0.08 : 0.04;
          tpCtx.fillStyle = (t % 2 === 0) ? `rgba(0,0,0,${bandAlpha})` : `rgba(235,170,120,${bandAlpha})`;
          tpCtx.fillRect(0, tY, 512, 21);

          // Variación ondulada en el apisonado
          tpCtx.beginPath();
          tpCtx.moveTo(0, tY);
          for (let x = 0; x <= 512; x += 32) {
            const wave = Math.sin((x + c * 40) * 0.05) * 2.5;
            tpCtx.lineTo(x, tY + wave);
          }
          tpCtx.lineTo(512, tY + 12);
          tpCtx.lineTo(0, tY + 12);
          tpCtx.closePath();
          tpCtx.fillStyle = `rgba(145, 51, 28, 0.15)`;
          tpCtx.fill();
        }

        // Costra de cal apagada (calicostrado): lechada de cal vertida junto a las tablas del tapial
        for (let v = 0; v < 3; v++) {
          const vY = cY + 18 + v * 38;
          tpCtx.beginPath();
          tpCtx.moveTo(0, vY);
          for (let x = 0; x <= 512; x += 16) {
            const offset = Math.sin(x * 0.03 + v * 2) * 5 + Math.cos(x * 0.08) * 3;
            tpCtx.lineTo(x, vY + offset);
          }
          tpCtx.lineWidth = 3 + (v % 2) * 2.5;
          tpCtx.strokeStyle = (v % 2 === 0) ? 'rgba(232, 196, 162, 0.42)' : 'rgba(217, 160, 122, 0.35)';
          tpCtx.stroke();

          // También añadir relieve en el mapa de altura
          tpHCtx.beginPath();
          tpHCtx.moveTo(0, vY);
          for (let x = 0; x <= 512; x += 16) {
            const offset = Math.sin(x * 0.03 + v * 2) * 5 + Math.cos(x * 0.08) * 3;
            tpHCtx.lineTo(x, vY + offset);
          }
          tpHCtx.lineWidth = 4;
          tpHCtx.strokeStyle = 'rgba(165, 165, 165, 0.35)';
          tpHCtx.stroke();
        }

        // Juntas horizontales entre cajones de tapia (rehundido de los tablones)
        tpCtx.fillStyle = '#42140a';
        tpCtx.fillRect(0, cY + 126, 512, 2);
        tpCtx.fillStyle = 'rgba(240, 215, 190, 0.35)';
        tpCtx.fillRect(0, cY, 512, 1.5);

        // Hendidura en el mapa de altura para normal pronunciada
        tpHCtx.fillStyle = '#222222';
        tpHCtx.fillRect(0, cY + 125, 512, 3);
        tpHCtx.fillStyle = '#d0d0d0';
        tpHCtx.fillRect(0, cY, 512, 2);

        // Mechinales (orificios de las agujas de madera del encofrado nazarí)
        const mechinalX = [64 + (c % 2) * 64, 320 + (c % 2) * 64];
        mechinalX.forEach(mx => {
          tpCtx.fillStyle = '#220804';
          tpCtx.fillRect(mx - 4, cY + 118, 9, 7);
          tpCtx.fillStyle = 'rgba(232, 196, 162, 0.4)';
          tpCtx.fillRect(mx - 6, cY + 125, 13, 2);

          tpHCtx.fillStyle = '#101010';
          tpHCtx.fillRect(mx - 4, cY + 118, 9, 7);
        });
      }

      // Inclusiones de gravilla y cantos rodados de la Sabika (áridos de cuarzo y caliza)
      let rngSeed = 42;
      const pseudoRng = () => {
        rngSeed = (rngSeed * 9301 + 49297) % 233280;
        return rngSeed / 233280;
      };

      const pebbleColors = ['#dfd8cf', '#9b8f83', '#5a4f47', '#c8a87a', '#eee5da'];
      for (let p = 0; p < 180; p++) {
        const px = pseudoRng() * 512;
        const py = pseudoRng() * 512;
        const pr = 1.2 + pseudoRng() * 3.6;
        const pCol = pebbleColors[Math.floor(pseudoRng() * pebbleColors.length)];

        // Sombra arrojada del canto
        tpCtx.beginPath();
        tpCtx.arc(px + 1, py + 1, pr, 0, Math.PI * 2);
        tpCtx.fillStyle = 'rgba(30, 8, 4, 0.45)';
        tpCtx.fill();

        // Canto de gravilla
        tpCtx.beginPath();
        tpCtx.arc(px, py, pr, 0, Math.PI * 2);
        tpCtx.fillStyle = pCol;
        tpCtx.fill();

        // Brillo superior
        tpCtx.beginPath();
        tpCtx.arc(px - pr * 0.3, py - pr * 0.3, pr * 0.45, 0, Math.PI * 2);
        tpCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        tpCtx.fill();

        // Relieve en heightmap
        tpHCtx.beginPath();
        tpHCtx.arc(px, py, pr, 0, Math.PI * 2);
        tpHCtx.fillStyle = '#e5e5e5';
        tpHCtx.fill();
      }

      // Textura granular per-pixel de porosidad mineral
      const tpImg = tpCtx.getImageData(0, 0, 512, 512);
      const tpHImg = tpHCtx.getImageData(0, 0, 512, 512);
      for (let i = 0; i < tpImg.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 26;
        tpImg.data[i]     = Math.max(0, Math.min(255, tpImg.data[i] + n * 1.2));
        tpImg.data[i + 1] = Math.max(0, Math.min(255, tpImg.data[i + 1] + n * 0.7));
        tpImg.data[i + 2] = Math.max(0, Math.min(255, tpImg.data[i + 2] + n * 0.5));

        const hn = (Math.random() - 0.5) * 16;
        tpHImg.data[i]     = Math.max(0, Math.min(255, tpHImg.data[i] + hn));
        tpHImg.data[i + 1] = tpHImg.data[i];
        tpHImg.data[i + 2] = tpHImg.data[i];
      }
      tpCtx.putImageData(tpImg, 0, 0);
      tpHCtx.putImageData(tpHImg, 0, 0);

      textures.tapialMap = new THREE.CanvasTexture(tapialCanvas);
      textures.tapialMap.wrapS = THREE.RepeatWrapping;
      textures.tapialMap.wrapT = THREE.RepeatWrapping;
      textures.tapialNormal = this.generateStage0NormalMap(tapialHeightCanvas, 3.6);


      // ------------------------------------------------------------------------
      // 2. ALMOHADILLADO RENACENTISTA DEL PALACIO DE CARLOS V - 512x512
      // ------------------------------------------------------------------------
      // Diseño de Pedro Machuca: sillares almohadillados en piedra arenisca dorada
      // de Santa Pudia, con profundas juntas rehundidas en V y almohadillas convexas.
      const carlosCanvas = document.createElement('canvas');
      carlosCanvas.width = 512;
      carlosCanvas.height = 512;
      const cCtx = carlosCanvas.getContext('2d');

      const carlosHeightCanvas = document.createElement('canvas');
      carlosHeightCanvas.width = 512;
      carlosHeightCanvas.height = 512;
      const cHCtx = carlosHeightCanvas.getContext('2d');

      const cImg = cCtx.createImageData(512, 512);
      const cHImg = cHCtx.createImageData(512, 512);
      const cData = cImg.data;
      const cHData = cHImg.data;

      // Cálculo geométrico de almohadillado con junta en V y domo convexo continuo
      for (let y = 0; y < 512; y++) {
        const ry = Math.floor(y / 128);
        const ly = y % 128;
        const distY = Math.min(ly, 128 - ly);
        const isOddRow = (ry % 2 === 1);
        const offsetX = isOddRow ? 128 : 0;

        for (let x = 0; x < 512; x++) {
          const lx = (x + 512 - offsetX) % 256;
          const distX = Math.min(lx, 256 - lx);
          const edgeDist = Math.min(distX, distY);

          const idx = (y * 512 + x) * 4;

          let r, g, b, hVal;

          if (edgeDist < 5) {
            // Fondo de la junta rehundida en V (mortero profundo en sombra)
            r = 45; g = 28; b = 18;
            hVal = 18;
          } else if (edgeDist < 28) {
            // Bisel perimetral inclinado a 45 grados
            const t = (edgeDist - 5) / 23.0;
            hVal = Math.floor(25 + t * 175);

            // Dirección del bisel respecto a la luz crepuscular (luz desde superior izquierda)
            const isTopOrLeft = (ly < 28) || (lx < 28);
            if (isTopOrLeft) {
              // Faceta orientada al sol poniente: oro cálido brillante
              r = Math.floor(215 + t * 15);
              g = Math.floor(175 + t * 15);
              b = Math.floor(125 + t * 15);
            } else {
              // Faceta en sombra propia inferior/derecha
              r = Math.floor(125 + t * 45);
              g = Math.floor(88 + t * 35);
              b = Math.floor(52 + t * 25);
            }
          } else {
            // Almohadilla convexa central (domo redondeado de Pedro Machuca)
            const u = (distX - 28) / (128 - 28);
            const v = (distY - 28) / (64 - 28);
            const cushion = Math.sin(Math.min(1.0, u) * Math.PI * 0.5) * Math.sin(Math.min(1.0, v) * Math.PI * 0.5);
            hVal = Math.floor(200 + cushion * 50);

            // Arenisca de Santa Pudia con suave gradiente de relieve
            const lightFactor = 0.90 + cushion * 0.18 + ((ly < 64 ? 1 : -0.5) * 0.06);
            r = Math.floor(Math.min(255, 194 * lightFactor));
            g = Math.floor(Math.min(255, 148 * lightFactor));
            b = Math.floor(Math.min(255, 98 * lightFactor));
          }

          // Grano fino de arenisca (porosidad calcarenita de Santa Pudia)
          const grain = (Math.random() - 0.5) * 18;
          cData[idx]     = Math.max(0, Math.min(255, r + grain * 1.1));
          cData[idx + 1] = Math.max(0, Math.min(255, g + grain * 0.8));
          cData[idx + 2] = Math.max(0, Math.min(255, b + grain * 0.6));
          cData[idx + 3] = 255;

          const hGrain = (Math.random() - 0.5) * 10;
          const finalH = Math.max(0, Math.min(255, hVal + hGrain));
          cHData[idx]     = finalH;
          cHData[idx + 1] = finalH;
          cHData[idx + 2] = finalH;
          cHData[idx + 3] = 255;
        }
      }

      cCtx.putImageData(cImg, 0, 0);
      cHCtx.putImageData(cHImg, 0, 0);

      // Incrustaciones de microfósiles y marcas de gradina / bujardado
      cCtx.fillStyle = 'rgba(250, 240, 225, 0.45)';
      for (let f = 0; f < 120; f++) {
        const fx = Math.random() * 512;
        const fy = Math.random() * 512;
        cCtx.fillRect(fx, fy, 2, 1.5);
      }

      textures.carlosVMap = new THREE.CanvasTexture(carlosCanvas);
      textures.carlosVMap.wrapS = THREE.RepeatWrapping;
      textures.carlosVMap.wrapT = THREE.RepeatWrapping;
      textures.carlosVNormal = this.generateStage0NormalMap(carlosHeightCanvas, 4.4);


      // ------------------------------------------------------------------------
      // 3. TEJA ÁRABE NAZARÍ (CUBIERTAS DE TEJA CURVA A CUATRO AGUAS) - 256x256
      // ------------------------------------------------------------------------
      // Hiladas longitudinales de teja curva árabe (canales y cobijas) con gradientes
      // cilíndricos de sombra, variaciones tonales de cocción de horno cerámico,
      // marcas de envejecimiento y pátinas minerales.
      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = 256;
      tileCanvas.height = 256;
      const tCtx = tileCanvas.getContext('2d');

      const tileHeightCanvas = document.createElement('canvas');
      tileHeightCanvas.width = 256;
      tileHeightCanvas.height = 256;
      const tHCtx = tileHeightCanvas.getContext('2d');

      const tImg = tCtx.createImageData(256, 256);
      const tHImg = tHCtx.createImageData(256, 256);
      const tData = tImg.data;
      const tHData = tHImg.data;

      // 8 columnas de teja (32px de ancho cada una) y 4 hiladas de solape longitudinal (64px)
      const tileBakeTones = [
        [184, 71, 35],  // #b84723
        [217, 101, 59], // #d9653b
        [138, 43, 16],  // #8a2b10
        [204, 88, 41],  // #cc5829
        [224, 122, 74], // #e07a4a
        [160, 52, 22],  // #a03416
        [196, 78, 38],  // #c44e26
        [148, 46, 18]   // #942e12
      ];

      for (let y = 0; y < 256; y++) {
        const course = Math.floor(y / 64);
        const ly = y % 64;
        const isOverlapLip = (ly >= 58);
        const isOverlapShadow = (ly < 6);

        for (let x = 0; x < 256; x++) {
          const col = Math.floor(x / 32);
          const lx = x % 32;
          const ang = (lx / 32) * Math.PI;
          const curve = Math.sin(ang);

          const tileSeed = (course * 8 + col) % tileBakeTones.length;
          const baseRgb = tileBakeTones[tileSeed];

          // Sombreado cilíndrico direccional (luz crepuscular desde superior izquierda)
          let shade = 0.50 + curve * 0.70;
          if (lx < 16) {
            shade += (1.0 - lx / 16) * 0.25;
          } else {
            shade -= ((lx - 16) / 16) * 0.35;
          }

          if (isOverlapShadow) {
            shade *= (0.45 + (ly / 6) * 0.50);
          } else if (isOverlapLip) {
            shade *= 1.15;
          }

          let r = Math.floor(Math.max(0, Math.min(255, baseRgb[0] * shade)));
          let g = Math.floor(Math.max(0, Math.min(255, baseRgb[1] * shade)));
          let b = Math.floor(Math.max(0, Math.min(255, baseRgb[2] * shade)));

          // Pátina de musgo seco / líquen en el canal cóncavo (acumulación de humedad)
          if (curve < 0.28) {
            const mossFactor = (0.28 - curve) / 0.28;
            r = Math.floor(r * (1.0 - mossFactor * 0.45) + 88 * mossFactor * 0.45);
            g = Math.floor(g * (1.0 - mossFactor * 0.50) + 102 * mossFactor * 0.50);
            b = Math.floor(b * (1.0 - mossFactor * 0.45) + 48 * mossFactor * 0.45);
          }

          const noise = (Math.random() - 0.5) * 14;
          const idx = (y * 256 + x) * 4;
          tData[idx]     = Math.max(0, Math.min(255, r + noise));
          tData[idx + 1] = Math.max(0, Math.min(255, g + noise * 0.7));
          tData[idx + 2] = Math.max(0, Math.min(255, b + noise * 0.5));
          tData[idx + 3] = 255;

          // Heightmap: perfil semicilíndrico acanalado con solape
          let h = curve * 190 + (isOverlapLip ? 35 : 0) - (isOverlapShadow ? 45 : 0);
          h = Math.max(10, Math.min(255, h + (Math.random() - 0.5) * 8));
          tHData[idx]     = h;
          tHData[idx + 1] = h;
          tHData[idx + 2] = h;
          tHData[idx + 3] = 255;
        }
      }

      tCtx.putImageData(tImg, 0, 0);
      tHCtx.putImageData(tHImg, 0, 0);

      textures.tileMap = new THREE.CanvasTexture(tileCanvas);
      textures.tileMap.wrapS = THREE.RepeatWrapping;
      textures.tileMap.wrapT = THREE.RepeatWrapping;
      textures.tileNormal = this.generateStage0NormalMap(tileHeightCanvas, 4.2);


      // ------------------------------------------------------------------------
      // 4. ARQUERÍA NAZARÍ Y CELOSÍAS (AJIMEZ / VENTANAS DE COMARES Y EL PARTAL) - 256x256
      // ------------------------------------------------------------------------
      // Arco de herradura apuntado andalusí con dovelas de yesería labrada y celosía
      // geométrica islámica (lazos de 8 / estrellas) sobre fondo oscuro, con reborde dorado al atardecer.
      const ajimezCanvas = document.createElement('canvas');
      ajimezCanvas.width = 256;
      ajimezCanvas.height = 256;
      const aCtx = ajimezCanvas.getContext('2d');

      // Fondo transparente
      aCtx.clearRect(0, 0, 256, 256);

      // Alfiz exterior (moldura rectangular de yesería nazarí)
      aCtx.fillStyle = '#dfcfba';
      aCtx.fillRect(16, 16, 224, 224);

      // Borde exterior del alfiz con relieve sombreado
      aCtx.lineWidth = 4;
      aCtx.strokeStyle = '#8a6e55';
      aCtx.strokeRect(18, 18, 220, 220);

      aCtx.lineWidth = 2;
      aCtx.strokeStyle = '#fff0dc';
      aCtx.strokeRect(22, 22, 212, 212);

      // Albanegas / Enjutas con motivos arabescos / ataurique
      aCtx.fillStyle = '#cbb396';
      aCtx.fillRect(24, 24, 208, 60);

      // Vaciado del arco de herradura túmido apuntado nazarí
      const drawHorseshoePath = (ctx, cx, cy, r, bottomY) => {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.75, bottomY);
        ctx.bezierCurveTo(cx - r * 1.05, bottomY - 20, cx - r * 1.02, cy, cx - r, cy - 25);
        ctx.bezierCurveTo(cx - r * 0.6, cy - 65, cx - 12, cy - 88, cx, cy - 92);
        ctx.bezierCurveTo(cx + 12, cy - 88, cx + r * 0.6, cy - 65, cx + r, cy - 25);
        ctx.bezierCurveTo(cx + r * 1.02, cy, cx + r * 1.05, bottomY - 20, cx + r * 0.75, bottomY);
        ctx.closePath();
      };

      // Interior oscuro crepuscular (penumbra del palacio)
      drawHorseshoePath(aCtx, 128, 140, 72, 230);
      aCtx.fillStyle = 'rgba(20, 9, 8, 0.94)';
      aCtx.fill();

      // Dovelas radiantes en el intradós del arco
      const numDovelas = 17;
      for (let d = 0; d < numDovelas; d++) {
        const theta = Math.PI + 0.35 + (d / (numDovelas - 1)) * (Math.PI - 0.70);
        const rIn = 72;
        const rOut = 84;
        const x1 = 128 + Math.cos(theta) * rIn;
        const y1 = 138 + Math.sin(theta) * (rIn * 1.15);
        const x2 = 128 + Math.cos(theta) * rOut;
        const y2 = 138 + Math.sin(theta) * (rOut * 1.15);

        aCtx.beginPath();
        aCtx.moveTo(x1, y1);
        aCtx.lineTo(x2, y2);
        aCtx.lineWidth = 3.5;
        aCtx.strokeStyle = (d % 2 === 0) ? '#f2e5d3' : '#cca983';
        aCtx.stroke();
      }

      // Reborde dorado crepuscular andalusí (resplandor del atardecer en la yesería)
      drawHorseshoePath(aCtx, 128, 140, 72, 230);
      aCtx.lineWidth = 3;
      aCtx.strokeStyle = '#ffd166';
      aCtx.stroke();

      // Celosía geométrica islámica (lazo de 8 puntas / estrellas khatam)
      aCtx.save();
      drawHorseshoePath(aCtx, 128, 140, 70, 228);
      aCtx.clip();

      const drawIslamicStar8 = (ctx, sx, sy, radius) => {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 1.8;
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const angle = (pass * Math.PI / 4) + (i * Math.PI / 2);
            const px = Math.cos(angle) * radius;
            const py = Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          ctx.moveTo(Math.cos(a) * (radius * 0.5), Math.sin(a) * (radius * 0.5));
          ctx.lineTo(Math.cos(a) * (radius * 1.3), Math.sin(a) * (radius * 1.3));
        }
        ctx.strokeStyle = '#c68a4c';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      };

      drawIslamicStar8(aCtx, 128, 120, 24);
      drawIslamicStar8(aCtx, 96, 168, 18);
      drawIslamicStar8(aCtx, 160, 168, 18);
      drawIslamicStar8(aCtx, 128, 70, 15);
      drawIslamicStar8(aCtx, 128, 212, 18);

      aCtx.beginPath();
      for (let diag = 60; diag <= 200; diag += 24) {
        aCtx.moveTo(diag - 50, 60);
        aCtx.lineTo(diag + 50, 230);
        aCtx.moveTo(diag + 50, 60);
        aCtx.lineTo(diag - 50, 230);
      }
      aCtx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
      aCtx.lineWidth = 1.0;
      aCtx.stroke();

      aCtx.restore();

      textures.ajimezMap = new THREE.CanvasTexture(ajimezCanvas);


      // ------------------------------------------------------------------------
      // 5. MADERA DE CEDRO TALLADA (ALEROS Y CANECILLOS DE COMARES) - 128x128
      // ------------------------------------------------------------------------
      // Madera oscura andalusí de cedro del Atlas con vetas longitudinales y modillones de canecillo.
      const woodCanvas = document.createElement('canvas');
      woodCanvas.width = 128;
      woodCanvas.height = 128;
      const wdCtx = woodCanvas.getContext('2d');

      // Base: Cedro oscuro andalusí
      wdCtx.fillStyle = '#381c0f';
      wdCtx.fillRect(0, 0, 128, 128);

      // Vetas longitudinales de la madera
      for (let y = 0; y < 128; y += 2) {
        const vAlpha = 0.08 + Math.sin(y * 0.15) * 0.06;
        wdCtx.fillStyle = (y % 4 === 0) ? `rgba(77, 39, 22, ${vAlpha})` : `rgba(28, 12, 6, ${vAlpha})`;
        wdCtx.fillRect(0, y, 128, 2);
      }

      // Canecillos / Modillones tallados en voladizo (4 modillones espaciados cada 32px)
      for (let m = 0; m < 4; m++) {
        const mx = m * 32 + 8;

        // Cassetón rehundido entre canecillos (artesonado en sombra)
        wdCtx.fillStyle = '#220d06';
        wdCtx.fillRect(m * 32, 20, 8, 108);

        // Cuerpo del canecillo / modillón de lóbulos
        const grad = wdCtx.createLinearGradient(mx, 0, mx + 16, 0);
        grad.addColorStop(0.0, '#5a2e19');
        grad.addColorStop(0.3, '#743d22');
        grad.addColorStop(0.8, '#4a2312');
        grad.addColorStop(1.0, '#260f06');
        wdCtx.fillStyle = grad;
        wdCtx.fillRect(mx, 12, 16, 116);

        // Molduras escalonadas (lóbulos y nacelas nazaríes)
        wdCtx.fillStyle = '#1c0a04';
        wdCtx.fillRect(mx, 36, 16, 3);
        wdCtx.fillRect(mx, 64, 16, 4);
        wdCtx.fillRect(mx, 92, 16, 3);

        wdCtx.fillStyle = '#8a4c2a';
        wdCtx.fillRect(mx, 39, 16, 1.5);
        wdCtx.fillRect(mx, 68, 16, 1.5);
        wdCtx.fillRect(mx, 95, 16, 1.5);

        // Roseta tallada central en el modillón
        wdCtx.beginPath();
        wdCtx.arc(mx + 8, 80, 3.5, 0, Math.PI * 2);
        wdCtx.fillStyle = '#9e5932';
        wdCtx.fill();
        wdCtx.lineWidth = 1;
        wdCtx.strokeStyle = '#260e06';
        wdCtx.stroke();
      }

      // Viga corrida superior (platabanda del alero)
      wdCtx.fillStyle = '#4d2716';
      wdCtx.fillRect(0, 0, 128, 12);
      wdCtx.fillStyle = '#7a4224';
      wdCtx.fillRect(0, 10, 128, 2);
      wdCtx.fillStyle = '#1c0a04';
      wdCtx.fillRect(0, 12, 128, 2);

      // Micrograno de madera
      const wdImg = wdCtx.getImageData(0, 0, 128, 128);
      for (let i = 0; i < wdImg.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 16;
        wdImg.data[i]     = Math.max(0, Math.min(255, wdImg.data[i] + n));
        wdImg.data[i + 1] = Math.max(0, Math.min(255, wdImg.data[i + 1] + n * 0.6));
        wdImg.data[i + 2] = Math.max(0, Math.min(255, wdImg.data[i + 2] + n * 0.4));
      }
      wdCtx.putImageData(wdImg, 0, 0);

      textures.woodMap = new THREE.CanvasTexture(woodCanvas);
      textures.woodMap.wrapS = THREE.RepeatWrapping;
      textures.woodMap.wrapT = THREE.RepeatWrapping;


      // ------------------------------------------------------------------------
      // 6. HALO SOLAR Y PARTÍCULAS CREPUSCULARES (ATMÓSFERA DE LA SABIKA)
      // ------------------------------------------------------------------------
      const sunCanvas = document.createElement('canvas');
      sunCanvas.width = 256;
      sunCanvas.height = 256;
      const sCtx = sunCanvas.getContext('2d');
      const sGrad = sCtx.createRadialGradient(128, 128, 6, 128, 128, 126);
      sGrad.addColorStop(0.0, 'rgba(255, 255, 240, 1.0)');
      sGrad.addColorStop(0.18, 'rgba(255, 215, 80, 0.95)');
      sGrad.addColorStop(0.42, 'rgba(255, 107, 53, 0.70)');
      sGrad.addColorStop(0.72, 'rgba(215, 48, 30, 0.28)');
      sGrad.addColorStop(1.0, 'rgba(90, 18, 35, 0.0)');
      sCtx.fillStyle = sGrad;
      sCtx.fillRect(0, 0, 256, 256);
      textures.sunHaloMap = new THREE.CanvasTexture(sunCanvas);

      const dotCanvas = document.createElement('canvas');
      dotCanvas.width = 64;
      dotCanvas.height = 64;
      const dCtx = dotCanvas.getContext('2d');
      const dGrad = dCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
      dGrad.addColorStop(0, 'rgba(255, 255, 230, 1.0)');
      dGrad.addColorStop(0.3, 'rgba(255, 195, 70, 0.85)');
      dGrad.addColorStop(0.65, 'rgba(255, 110, 35, 0.35)');
      dGrad.addColorStop(1.0, 'rgba(255, 60, 20, 0.0)');
      dCtx.fillStyle = dGrad;
      dCtx.fillRect(0, 0, 64, 64);
      textures.emberMap = new THREE.CanvasTexture(dotCanvas);

      // Cal y yesería blanca (Generalife y pórtico del Partal)
      const plasterCanvas = document.createElement('canvas');
      plasterCanvas.width = 128;
      plasterCanvas.height = 128;
      const pCtx = plasterCanvas.getContext('2d');
      pCtx.fillStyle = '#f0e6dc';
      pCtx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 400; i++) {
        pCtx.fillStyle = (Math.random() > 0.5) ? 'rgba(255,255,255,0.25)' : 'rgba(180,160,140,0.18)';
        pCtx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
      }
      textures.whitePlasterMap = new THREE.CanvasTexture(plasterCanvas);

      // Alberca del Partal (Agua con reflejo crepuscular y ondas sutiles)
      const waterCanvas = document.createElement('canvas');
      waterCanvas.width = 128;
      waterCanvas.height = 128;
      const wtCtx = waterCanvas.getContext('2d');
      const wtGrad = wtCtx.createLinearGradient(0, 0, 128, 128);
      wtGrad.addColorStop(0, '#0f3832');
      wtGrad.addColorStop(0.4, '#175249');
      wtGrad.addColorStop(0.7, '#246b5a');
      wtGrad.addColorStop(1, '#ffaa44'); // Reflejo dorado del sol poniente
      wtCtx.fillStyle = wtGrad;
      wtCtx.fillRect(0, 0, 128, 128);
      wtCtx.strokeStyle = 'rgba(255, 230, 180, 0.25)';
      wtCtx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        wtCtx.beginPath();
        wtCtx.moveTo(0, i * 22);
        wtCtx.bezierCurveTo(40, i * 22 + 10, 80, i * 22 - 10, 128, i * 22 + 5);
        wtCtx.stroke();
      }
      textures.waterMap = new THREE.CanvasTexture(waterCanvas);
      textures.waterMap.wrapS = THREE.RepeatWrapping;
      textures.waterMap.wrapT = THREE.RepeatWrapping;

      // Compatibilidad con referencias previas
      textures.wallMap = textures.tapialMap;
      textures.wallNormal = textures.tapialNormal;

      return textures;
    }

    // ==========================================================================
    // 2. STAGE 0 SCENE CONSTRUCTION: ATARDECER EN LA ALHAMBRA DE GRANADA
    // ==========================================================================
    buildStage0Alhambra() {
      this.stage0Group = new THREE.Group();
      this.worldGroup.add(this.stage0Group);

      // Holders for animated elements
      this.stage0GodRays = [];
      this.stage0Swifts = [];
      this.stage0Embers = null;
      this.stage0Bell = null;
      this.stage0Flag = null;
      this.stage0Sun = null;
      this.stage0SunHalo = null;
      this.stage0Water = null;
      this.stage0Lights = [];

      this.stage0Textures = this.buildStage0AlhambraTextures();

      // ======================================================================
      // A. CIELO Y GRAN SOL PONIENTE EN EL OESTE (FLANCO DERECHO)
      // ======================================================================

      // 1. Sky Gradient Backdrop (Granadino Twilight)
      const skyGeo = new THREE.PlaneGeometry(240, 150);
      const skyMat = new THREE.ShaderMaterial({
        uniforms: {
          uTopColor:    { value: new THREE.Color(0x240e1e) }, // Cielo crepuscular granadino
          uMidColor:    { value: new THREE.Color(0x781d38) }, // Púrpura rojizo
          uOrangeColor: { value: new THREE.Color(0xe05615) }, // Naranja atardecer andaluz
          uGoldColor:   { value: new THREE.Color(0xffd166) }, // Oro crepuscular
          uBottomColor: { value: new THREE.Color(0x280e1a) }  // Horizonte bajo
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform vec3 uTopColor;
          uniform vec3 uMidColor;
          uniform vec3 uOrangeColor;
          uniform vec3 uGoldColor;
          uniform vec3 uBottomColor;
          void main() {
            float y = clamp(vUv.y, 0.0, 1.0);
            vec3 col;
            if (y > 0.62) {
              col = mix(uMidColor, uTopColor, (y - 0.62) / 0.38);
            } else if (y > 0.35) {
              col = mix(uOrangeColor, uMidColor, (y - 0.35) / 0.27);
            } else if (y > 0.14) {
              col = mix(uGoldColor, uOrangeColor, (y - 0.14) / 0.21);
            } else {
              col = mix(uBottomColor, uGoldColor, y / 0.14);
            }
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        depthWrite: false
      });
      const skyMesh = new THREE.Mesh(skyGeo, skyMat);
      skyMesh.position.set(0, 14, -62);
      this.stage0Group.add(skyMesh);

      // 2. Gran Sol Poniente en el OESTE (Flanco Derecho superior)
      const sunPos = new THREE.Vector3(16.5, 8.5, -54);
      const sunGeo = new THREE.SphereGeometry(6.6, 32, 24);
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
      const sunMesh = new THREE.Mesh(sunGeo, sunMat);
      sunMesh.position.copy(sunPos);
      this.stage0Group.add(sunMesh);
      this.stage0Sun = sunMesh;

      // 3. Corona / Halo Semitransparente Ámbar / Carmesí
      const haloGeo = new THREE.PlaneGeometry(52, 52);
      const haloMat = new THREE.MeshBasicMaterial({
        map: this.stage0Textures.sunHaloMap,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.95
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.position.copy(sunPos);
      haloMesh.position.z += 0.4;
      this.stage0Group.add(haloMesh);
      this.stage0SunHalo = haloMesh;

      // 4. Rayos Crepusculares (God-Rays) emanando del sol hacia el oeste y sur
      const rayAngles = [-150, -135, -120, -105, -92, -78, -65, -165, -178, 170];
      rayAngles.forEach((angDeg, idx) => {
        const ang = THREE.MathUtils.degToRad(angDeg);
        const len = 75 + (idx % 3) * 15;
        const widthTop = 1.4;
        const widthBottom = 16 + (idx % 4) * 4;

        const rayGeo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
          -widthTop * 0.5, 0, 0,
           widthTop * 0.5, 0, 0,
          -widthBottom * 0.5, -len, 0,
           widthBottom * 0.5, -len, 0
        ]);
        const indices = [0, 2, 1, 1, 2, 3];
        const uvs = new Float32Array([
          0.5, 1,
          0.5, 1,
          0.0, 0,
          1.0, 0
        ]);
        rayGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        rayGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        rayGeo.setIndex(indices);

        const baseOpacity = 0.16 + (idx % 3) * 0.06;
        const rayMat = new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: new THREE.Color(0xffb044) },
            uOpacity: { value: baseOpacity }
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform vec3 uColor;
            uniform float uOpacity;
            void main() {
              float edgeFade = smoothstep(0.0, 0.45, vUv.x) * smoothstep(1.0, 0.55, vUv.x);
              float lenFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
              gl_FragColor = vec4(uColor, uOpacity * edgeFade * lenFade);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        });

        const rayMesh = new THREE.Mesh(rayGeo, rayMat);
        rayMesh.position.copy(sunPos);
        rayMesh.position.z += 0.8;
        rayMesh.rotation.z = ang;
        this.stage0Group.add(rayMesh);
        this.stage0GodRays.push({
          mesh: rayMesh,
          mat: rayMat,
          baseOpacity,
          baseRotZ: ang,
          phase: idx * 0.85
        });
      });

      // ======================================================================
      // B. CUMBRES DE SIERRA NEVADA (ALPENGLOW DORADO Y ROSÁCEO)
      // ======================================================================

      // Capa 1: Cumbres lejanas (Veleta y Mulhacén elevándose tras la colina) en Z = -48
      const snFarVertices = [];
      const snFarColors = [];
      const snFarIndices = [];
      // Perfil exacto mirando al Sur: Mulhacén en X ≈ -17.5, Veleta en X ≈ -6.5
      const snFarPoints = [
        [-75, -6], [-62, 5], [-50, 9], [-38, 12], [-28, 14.5],
        [-17.5, 18.2], // Pico Mulhacén (la mayor altitud de la península)
        [-11.5, 13.5],
        [-6.5, 16.8],  // Pico Veleta (su icónica silueta piramidal)
        [2, 11.5], [10, 13.2], [22, 10.0], [34, 12.0], [48, 8.5], [62, 4.0], [75, -6]
      ];

      for (let i = 0; i < snFarPoints.length; i++) {
        const pt = snFarPoints[i];
        snFarVertices.push(pt[0], pt[1], 0);
        if (pt[1] > 14.0) {
          snFarColors.push(0.98, 0.90, 0.82); // Nieve dorada al atardecer
        } else if (pt[1] > 8.0) {
          snFarColors.push(0.74, 0.38, 0.52); // Alpenglow rosado
        } else {
          snFarColors.push(0.36, 0.14, 0.30); // Púrpura de umbría
        }

        snFarVertices.push(pt[0], -18, 0);
        snFarColors.push(0.16, 0.06, 0.15); // Base violeta oscuro
      }

      for (let i = 0; i < snFarPoints.length - 1; i++) {
        const top1 = i * 2;
        const bot1 = i * 2 + 1;
        const top2 = (i + 1) * 2;
        const bot2 = (i + 1) * 2 + 1;
        snFarIndices.push(top1, bot1, top2);
        snFarIndices.push(top2, bot1, bot2);
      }

      const snFarGeo = new THREE.BufferGeometry();
      snFarGeo.setAttribute('position', new THREE.Float32BufferAttribute(snFarVertices, 3));
      snFarGeo.setAttribute('color', new THREE.Float32BufferAttribute(snFarColors, 3));
      snFarGeo.setIndex(snFarIndices);
      snFarGeo.computeVertexNormals();

      const snFarMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide
      });
      const snFarMesh = new THREE.Mesh(snFarGeo, snFarMat);
      snFarMesh.position.set(0, 0, -48);
      this.stage0Group.add(snFarMesh);

      // Capa 2: Cresta intermedia en Z = -44
      const snMidVertices = [];
      const snMidColors = [];
      const snMidIndices = [];
      const snMidPoints = [
        [-70, -6], [-54, 3], [-42, 7.5], [-26, 8.5], [-14, 9.8],
        [-2, 7.2], [12, 8.5], [26, 6.2], [44, 7.4], [58, 2.5], [70, -6]
      ];
      for (let i = 0; i < snMidPoints.length; i++) {
        const pt = snMidPoints[i];
        snMidVertices.push(pt[0], pt[1], 0);
        snMidColors.push(0.44, 0.16, 0.29);
        snMidVertices.push(pt[0], -18, 0);
        snMidColors.push(0.18, 0.07, 0.16);
      }
      for (let i = 0; i < snMidPoints.length - 1; i++) {
        const t1 = i * 2;
        const b1 = i * 2 + 1;
        const t2 = (i + 1) * 2;
        const b2 = (i + 1) * 2 + 1;
        snMidIndices.push(t1, b1, t2);
        snMidIndices.push(t2, b1, b2);
      }
      const snMidGeo = new THREE.BufferGeometry();
      snMidGeo.setAttribute('position', new THREE.Float32BufferAttribute(snMidVertices, 3));
      snMidGeo.setAttribute('color', new THREE.Float32BufferAttribute(snMidColors, 3));
      snMidGeo.setIndex(snMidIndices);
      const snMidMesh = new THREE.Mesh(snMidGeo, snFarMat);
      snMidMesh.position.set(0, 0, -44);
      this.stage0Group.add(snMidMesh);

      // ======================================================================
      // C. COLINA DE LA SABIKA (LADERA ROCOSA BERMEJA Y BOSQUE DE CIPRESES)
      // ======================================================================

      const hillGeo = new THREE.BufferGeometry();
      const hillVertices = [];
      const hillColors = [];
      const hillIndices = [];
      // Perfil de la Sabika: descendiendo hacia el Darro y subiendo a la Alcazaba y Generalife
      const hillProfile = [
        [-36, -14], [-28, -7.5], [-20, -3.8], [-12, -2.6], [-4, -2.1],
        [4, -2.4], [12, -1.8], [18, -2.2], [26, -5.5], [34, -9.5], [40, -15]
      ];
      for (let i = 0; i < hillProfile.length; i++) {
        const p = hillProfile[i];
        hillVertices.push(p[0], p[1], (Math.random() - 0.5) * 1.5);
        hillColors.push(0.38, 0.19, 0.12); // Tierra arcillosa bermeja
        hillVertices.push(p[0], -20, 3.0);
        hillColors.push(0.19, 0.09, 0.06); // Sombra del cañón del Darro
      }
      for (let i = 0; i < hillProfile.length - 1; i++) {
        const t1 = i * 2;
        const b1 = i * 2 + 1;
        const t2 = (i + 1) * 2;
        const b2 = (i + 1) * 2 + 1;
        hillIndices.push(t1, b1, t2);
        hillIndices.push(t2, b1, b2);
      }
      hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(hillVertices, 3));
      hillGeo.setAttribute('color', new THREE.Float32BufferAttribute(hillColors, 3));
      hillGeo.setIndex(hillIndices);
      hillGeo.computeVertexNormals();

      const hillMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.04
      });
      const hillMesh = new THREE.Mesh(hillGeo, hillMat);
      hillMesh.position.set(0, 0, -29);
      this.stage0Group.add(hillMesh);

      // Bosque de la Sabika: Cipreses Andaluces (Cupressus sempervirens) y Pinos
      const forestGroup = new THREE.Group();
      const cypressConeGeo = new THREE.ConeGeometry(0.52, 4.4, 7);
      const pineGeo = new THREE.SphereGeometry(1.2, 8, 6);
      const trunkGeo = new THREE.CylinderGeometry(0.10, 0.14, 1.4, 5);

      const foliageMatDark = new THREE.MeshStandardMaterial({
        color: 0x122615,
        roughness: 0.88,
        metalness: 0.05
      });
      const foliageMatMid = new THREE.MeshStandardMaterial({
        color: 0x18341b,
        roughness: 0.88,
        metalness: 0.05
      });
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x24160e,
        roughness: 0.92
      });

      const cypressPositions = [
        // Jardines del Generalife y laderas este (Izquierda)
        [-22.5, 0.5, -30.0, 1.2], [-21.2, -1.0, -29.5, 1.05], [-19.8, 1.5, -30.2, 1.3],
        [-18.5, -0.5, -29.0, 1.15], [-17.2, -2.0, -28.5, 1.0], [-16.0, -3.2, -27.8, 1.25],
        // Alberca del Partal (4 cipreses emblemáticos flanqueando la alberca)
        [-12.2, -1.5, -24.8, 1.25], [-12.2, -1.5, -27.2, 1.25],
        [-6.5, -1.5, -24.8, 1.25], [-6.5, -1.5, -27.2, 1.25],
        // Laderas bajo Comares y Palacios Nazaríes (Centro)
        [-4.8, -4.5, -25.2, 1.1], [-3.5, -5.2, -25.0, 0.95], [-0.8, -4.8, -25.4, 1.2],
        [0.5, -5.5, -25.8, 1.0], [2.2, -4.6, -25.2, 1.15], [3.8, -5.0, -25.5, 0.9],
        // Bosque de la Alcazaba y Jardín de los Adarves (Derecha)
        [6.2, -4.2, -25.8, 1.2], [7.8, -5.2, -26.0, 1.0], [9.5, -3.8, -25.2, 1.3],
        [11.0, -2.8, -24.5, 1.1], [12.5, -3.2, -24.8, 1.2], [14.0, -4.5, -25.5, 0.95],
        [17.5, -4.8, -26.2, 1.15], [19.2, -6.0, -26.8, 1.0]
      ];

      cypressPositions.forEach((pos, idx) => {
        const cTree = new THREE.Group();
        const sc = pos[3];

        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.7 * sc;
        trunk.scale.set(sc, sc, sc);
        cTree.add(trunk);

        const canopy = new THREE.Mesh(cypressConeGeo, (idx % 2 === 0) ? foliageMatDark : foliageMatMid);
        canopy.position.y = (0.7 + 2.2) * sc;
        canopy.scale.set(sc, sc, sc);
        cTree.add(canopy);

        cTree.position.set(pos[0], pos[1], pos[2]);
        forestGroup.add(cTree);
      });

      const pinePositions = [
        [-20.5, -2.5, -29.2, 1.2], [-14.5, -4.8, -27.5, 1.1],
        [-1.5, -6.2, -26.0, 1.2], [5.2, -5.8, -26.2, 1.15],
        [13.2, -5.0, -26.0, 1.1], [18.2, -6.5, -27.2, 1.2]
      ];
      pinePositions.forEach(pos => {
        const pTree = new THREE.Group();
        const sc = pos[3];
        const pTrunk = new THREE.Mesh(trunkGeo, trunkMat);
        pTrunk.position.y = 1.0 * sc;
        pTrunk.rotation.z = (Math.random() - 0.5) * 0.15;
        pTrunk.scale.set(sc * 1.2, sc * 1.5, sc * 1.2);
        pTree.add(pTrunk);

        const pCanopy = new THREE.Mesh(pineGeo, foliageMatMid);
        pCanopy.position.y = 2.4 * sc;
        pCanopy.scale.set(sc * 1.4, sc * 0.7, sc * 1.4);
        pTree.add(pCanopy);

        pTree.position.set(pos[0], pos[1], pos[2]);
        forestGroup.add(pTree);
      });
      this.stage0Group.add(forestGroup);

      // Materiales arquitectónicos compartidos
      const stoneMat = new THREE.MeshStandardMaterial({
        map: this.stage0Textures.tapialMap,
        normalMap: this.stage0Textures.tapialNormal,
        color: 0xba5a31,
        roughness: 0.78,
        metalness: 0.10
      });

      const roofMat = new THREE.MeshStandardMaterial({
        map: this.stage0Textures.tileMap,
        normalMap: this.stage0Textures.tileNormal,
        color: 0xbd4c22,
        roughness: 0.65,
        metalness: 0.10
      });

      const woodMat = new THREE.MeshStandardMaterial({
        map: this.stage0Textures.woodMap,
        color: 0x4a2818,
        roughness: 0.85
      });

      const plasterMat = new THREE.MeshStandardMaterial({
        map: this.stage0Textures.whitePlasterMap,
        color: 0xf5ece4,
        roughness: 0.82
      });

      const carlosVMat = new THREE.MeshStandardMaterial({
        map: this.stage0Textures.carlosVMap,
        normalMap: this.stage0Textures.carlosVNormal,
        color: 0xbf955b,
        roughness: 0.72,
        metalness: 0.12
      });

      const ajimezMat = new THREE.MeshBasicMaterial({
        map: this.stage0Textures.ajimezMap
      });

      const merlonGeo = new THREE.BoxGeometry(0.75, 0.75, 0.45);

      // ======================================================================
      // D. A LA IZQUIERDA (ESTE): EL PARTAL Y GENERALIFE
      // ======================================================================

      // 1. Generalife en el Cerro del Sol (Silueta lejana y escalonada)
      const generalifeGroup = new THREE.Group();
      generalifeGroup.position.set(-20.5, 2.8, -31.5);

      // Pabellón Principal del Generalife (Paredes blancas de cal y arquería)
      const genMainGeo = new THREE.BoxGeometry(6.5, 3.6, 4.0);
      const genMain = new THREE.Mesh(genMainGeo, plasterMat);
      genMain.position.y = 1.8;
      generalifeGroup.add(genMain);

      const genRoofGeo = new THREE.ConeGeometry(4.8, 1.6, 4);
      genRoofGeo.rotateY(Math.PI / 4);
      const genRoof = new THREE.Mesh(genRoofGeo, roofMat);
      genRoof.position.set(0, 4.4, 0);
      generalifeGroup.add(genRoof);

      // Galería de arcos mirador del Generalife
      const genArcGeo = new THREE.BoxGeometry(4.8, 1.2, 0.2);
      const genArcMat = new THREE.MeshBasicMaterial({ color: 0x221008 });
      const genArc = new THREE.Mesh(genArcGeo, genArcMat);
      genArc.position.set(0, 2.4, 2.05);
      generalifeGroup.add(genArc);

      // Pabellón inferior escalonado
      const genLowGeo = new THREE.BoxGeometry(4.5, 2.4, 3.5);
      const genLow = new THREE.Mesh(genLowGeo, plasterMat);
      genLow.position.set(4.0, -0.6, 1.0);
      generalifeGroup.add(genLow);

      const genLowRoof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.2, 4), roofMat);
      genLowRoof.rotation.y = Math.PI / 4;
      genLowRoof.position.set(4.0, 1.2, 1.0);
      generalifeGroup.add(genLowRoof);

      this.stage0Group.add(generalifeGroup);

      // 2. Muralla Oriental y Torre de los Picos
      const eastWallGroup = new THREE.Group();
      eastWallGroup.position.set(-14.2, -1.8, -27.2);

      const picosBody = new THREE.Mesh(new THREE.BoxGeometry(3.6, 7.8, 3.6), stoneMat);
      picosBody.position.set(0, 3.9, 0);
      eastWallGroup.add(picosBody);

      const picosRoof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.4, 4), roofMat);
      picosRoof.rotation.y = Math.PI / 4;
      picosRoof.position.set(0, 8.5, 0);
      eastWallGroup.add(picosRoof);

      const eWall = new THREE.Mesh(new THREE.BoxGeometry(5.0, 5.5, 1.6), stoneMat);
      eWall.position.set(-3.5, 2.75, -0.2);
      eastWallGroup.add(eWall);

      this.stage0Group.add(eastWallGroup);

      // 3. El Partal, Torre de las Damas y Alberca Reflectante
      const partalGroup = new THREE.Group();
      partalGroup.position.set(-9.2, -2.5, -26.0);

      // Torre de las Damas (Cuerpo de torre nazarí coronada en tejado piramidal)
      const damasGeo = new THREE.BoxGeometry(3.6, 7.5, 3.6);
      const damasBody = new THREE.Mesh(damasGeo, stoneMat);
      damasBody.position.set(0, 3.75, -1.2);
      partalGroup.add(damasBody);

      const damasRoofGeo = new THREE.ConeGeometry(2.9, 1.6, 4);
      damasRoofGeo.rotateY(Math.PI / 4);
      const damasRoof = new THREE.Mesh(damasRoofGeo, roofMat);
      damasRoof.position.set(0, 8.3, -1.2);
      partalGroup.add(damasRoof);

      // Ventana ajimez en la Torre de las Damas
      const damasWinGeo = new THREE.PlaneGeometry(1.0, 1.8);
      const damasWin = new THREE.Mesh(damasWinGeo, ajimezMat);
      damasWin.position.set(0, 5.2, 0.62);
      partalGroup.add(damasWin);

      // Pórtico del Partal (Pabellón frontal con 5 arcos nazaríes y columnas)
      const porticoRoof = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.35, 2.2), roofMat);
      porticoRoof.position.set(0, 3.8, 1.1);
      partalGroup.add(porticoRoof);

      const porticoCeiling = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 2.0), woodMat);
      porticoCeiling.position.set(0, 3.55, 1.1);
      partalGroup.add(porticoCeiling);

      // Columnas del pórtico
      const colGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8);
      const colMat = new THREE.MeshStandardMaterial({ color: 0xf0ece5, roughness: 0.6 });
      [-2.3, -1.15, 0.0, 1.15, 2.3].forEach(cx => {
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(cx, 2.2, 2.1);
        partalGroup.add(col);
      });

      // Muro posterior enyesado del pórtico
      const porticoBack = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.8, 0.2), plasterMat);
      porticoBack.position.set(0, 2.3, 0.3);
      partalGroup.add(porticoBack);

      // Alberca Reflectante del Partal
      const poolFrameGeo = new THREE.BoxGeometry(5.6, 0.4, 3.2);
      const poolFrameMat = new THREE.MeshStandardMaterial({ color: 0x8a705a, roughness: 0.8 });
      const poolFrame = new THREE.Mesh(poolFrameGeo, poolFrameMat);
      poolFrame.position.set(0, 0.2, 4.2);
      partalGroup.add(poolFrame);

      const poolWaterGeo = new THREE.PlaneGeometry(5.2, 2.8);
      const poolWaterMat = new THREE.MeshStandardMaterial({
        map: this.stage0Textures.waterMap,
        roughness: 0.15,
        metalness: 0.85,
        color: 0x2ddbb4
      });
      const poolWater = new THREE.Mesh(poolWaterGeo, poolWaterMat);
      poolWater.rotation.x = -Math.PI / 2;
      poolWater.position.set(0, 0.42, 4.2);
      partalGroup.add(poolWater);
      this.stage0Water = poolWater;

      this.stage0Group.add(partalGroup);

      // ======================================================================
      // E. EN EL CENTRO: TORRE DE COMARES, PALACIOS NAZARÍES Y CARLOS V
      // ======================================================================

      // 1. Torre de Comares (La torre más monumental e icónica de los Palacios)
      const comaresGroup = new THREE.Group();
      comaresGroup.position.set(-2.2, -2.2, -25.5);

      // Cubo masivo de Comares (16m de base, 45m de altura escalada)
      const comaresBodyGeo = new THREE.BoxGeometry(5.6, 10.2, 5.6);
      const comaresBody = new THREE.Mesh(comaresBodyGeo, stoneMat);
      comaresBody.position.y = 5.1;
      comaresGroup.add(comaresBody);

      // Ajimeces (ventanas geminadas de arcos de herradura) en la fachada norte
      const ajimezComares1 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), ajimezMat);
      ajimezComares1.position.set(-1.3, 6.2, 2.82);
      comaresGroup.add(ajimezComares1);

      const ajimezComares2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), ajimezMat);
      ajimezComares2.position.set(1.3, 6.2, 2.82);
      comaresGroup.add(ajimezComares2);

      // Ventanas altas menores (celosías)
      const upperWinGeo = new THREE.PlaneGeometry(0.7, 0.9);
      const uWin1 = new THREE.Mesh(upperWinGeo, ajimezMat);
      uWin1.position.set(-1.3, 8.4, 2.82);
      comaresGroup.add(uWin1);
      const uWin2 = new THREE.Mesh(upperWinGeo, ajimezMat);
      uWin2.position.set(1.3, 8.4, 2.82);
      comaresGroup.add(uWin2);

      // El Gran Tejaroz Nazarí de madera de cedro sobresaliendo con canecillos
      const tejarozGeo = new THREE.BoxGeometry(6.6, 0.4, 6.6);
      const tejaroz = new THREE.Mesh(tejarozGeo, woodMat);
      tejaroz.position.set(0, 10.3, 0);
      comaresGroup.add(tejaroz);

      // Canecillos (corbels) esculpidos bajo el alero
      const canecilloGeo = new THREE.BoxGeometry(0.2, 0.35, 0.45);
      for (let cx = -2.6; cx <= 2.6; cx += 0.65) {
        const caneFront = new THREE.Mesh(canecilloGeo, woodMat);
        caneFront.position.set(cx, 10.0, 2.95);
        comaresGroup.add(caneFront);
      }

      // Tejado a cuatro aguas de teja árabe
      const comaresRoofGeo = new THREE.ConeGeometry(4.6, 2.2, 4);
      comaresRoofGeo.rotateY(Math.PI / 4);
      const comaresRoof = new THREE.Mesh(comaresRoofGeo, roofMat);
      comaresRoof.position.set(0, 11.4, 0);
      comaresGroup.add(comaresRoof);

      this.stage0Group.add(comaresGroup);

      // 2. Tejados a cuatro aguas y salas de los Palacios Nazaríes (Arrayanes y Leones)
      const nasridPalaces = new THREE.Group();
      nasridPalaces.position.set(-4.5, -2.4, -26.8);

      // Sala de la Barca y antesala
      const barcaBody = new THREE.Mesh(new THREE.BoxGeometry(4.4, 5.2, 3.8), stoneMat);
      barcaBody.position.set(0, 2.6, 0);
      nasridPalaces.add(barcaBody);

      const barcaRoof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.6, 4), roofMat);
      barcaRoof.rotation.y = Math.PI / 4;
      barcaRoof.position.set(0, 6.0, 0);
      nasridPalaces.add(barcaRoof);

      // Ala lateral del Patio de los Arrayanes
      const arrayanesWing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.2, 5.5), stoneMat);
      arrayanesWing.position.set(3.2, 2.1, -1.8);
      nasridPalaces.add(arrayanesWing);

      const arrayanesRoof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.5, 4), roofMat);
      arrayanesRoof.rotation.y = Math.PI / 4;
      arrayanesRoof.position.set(3.2, 5.0, -1.8);
      nasridPalaces.add(arrayanesRoof);

      this.stage0Group.add(nasridPalaces);

      // 3. Palacio de Carlos V (Mole renacentista elevándose detrás de los Palacios)
      const carlosVGroup = new THREE.Group();
      carlosVGroup.position.set(1.5, -1.6, -28.2);

      // Doble cuerpo renacentista (9.8m de ancho x 8.4m de profundidad x 8.0m de alto)
      const cBlockGeo = new THREE.BoxGeometry(9.8, 7.8, 8.4);
      const cBlock = new THREE.Mesh(cBlockGeo, carlosVMat);
      cBlock.position.y = 3.9;
      carlosVGroup.add(cBlock);

      // Cornisa corrida intermedia
      const cCorniceGeo = new THREE.BoxGeometry(10.2, 0.45, 8.8);
      const cCornice = new THREE.Mesh(cCorniceGeo, carlosVMat);
      cCornice.position.y = 4.2;
      carlosVGroup.add(cCornice);

      // Balaustrada superior renacentista
      const balustradeGeo = new THREE.BoxGeometry(10.0, 0.7, 8.6);
      const balustrade = new THREE.Mesh(balustradeGeo, carlosVMat);
      balustrade.position.y = 8.15;
      carlosVGroup.add(balustrade);

      this.stage0Group.add(carlosVGroup);

      // 4. Campanario de Santa María de la Alhambra
      const churchGroup = new THREE.Group();
      churchGroup.position.set(4.2, -1.0, -30.0);

      const churchTowerGeo = new THREE.BoxGeometry(2.0, 11.2, 2.0);
      const churchTower = new THREE.Mesh(churchTowerGeo, stoneMat);
      churchTower.position.y = 5.6;
      churchGroup.add(churchTower);

      // Campanario con huecos de medio punto
      const belfryOpenGeo = new THREE.BoxGeometry(2.2, 1.8, 2.2);
      const belfryOpenMat = new THREE.MeshBasicMaterial({ color: 0x1f0e08 });
      const belfryOpen = new THREE.Mesh(belfryOpenGeo, belfryOpenMat);
      belfryOpen.position.y = 9.8;
      churchGroup.add(belfryOpen);

      // Chapitel piramidal
      const churchSpireGeo = new THREE.ConeGeometry(1.6, 2.4, 4);
      churchSpireGeo.rotateY(Math.PI / 4);
      const churchSpire = new THREE.Mesh(churchSpireGeo, roofMat);
      churchSpire.position.y = 12.4;
      churchGroup.add(churchSpire);

      this.stage0Group.add(churchGroup);

      // ======================================================================
      // F. A LA DERECHA (OESTE): RECINTO MILITAR DE LA ALCAZABA
      // ======================================================================

      // 1. Torre del Homenaje (La más alta del interior de la Alcazaba)
      const homenajeGroup = new THREE.Group();
      homenajeGroup.position.set(8.2, -1.4, -27.2);

      const homBody = new THREE.Mesh(new THREE.BoxGeometry(4.6, 10.5, 4.6), stoneMat);
      homBody.position.y = 5.25;
      homenajeGroup.add(homBody);

      // Almenas escalonadas perimetrales
      for (let i = -1.8; i <= 1.8; i += 1.2) {
        const m1 = new THREE.Mesh(merlonGeo, stoneMat);
        m1.position.set(i, 10.85, 2.1);
        homenajeGroup.add(m1);
        const m2 = new THREE.Mesh(merlonGeo, stoneMat);
        m2.position.set(i, 10.85, -2.1);
        homenajeGroup.add(m2);
      }
      this.stage0Group.add(homenajeGroup);

      // 2. Torre de las Armas (Bajando hacia el río Darro)
      const armasGroup = new THREE.Group();
      armasGroup.position.set(7.0, -3.8, -24.2);

      const armasBody = new THREE.Mesh(new THREE.BoxGeometry(3.8, 6.6, 3.8), stoneMat);
      armasBody.position.y = 3.3;
      armasGroup.add(armasBody);

      // Almenas
      [-1.4, 0, 1.4].forEach(ax => {
        const m = new THREE.Mesh(merlonGeo, stoneMat);
        m.position.set(ax, 6.9, 1.7);
        armasGroup.add(m);
      });
      this.stage0Group.add(armasGroup);

      // 3. Lienzos de Muralla y Adarves de la Alcazaba
      const wallAlcazaba1 = new THREE.Mesh(new THREE.BoxGeometry(5.2, 6.4, 1.8), stoneMat);
      wallAlcazaba1.position.set(11.8, 1.5, -26.2);
      wallAlcazaba1.rotation.y = 0.12;
      this.stage0Group.add(wallAlcazaba1);

      const wallAlcazaba2 = new THREE.Mesh(new THREE.BoxGeometry(4.8, 5.2, 1.8), stoneMat);
      wallAlcazaba2.position.set(5.5, 0.4, -26.5);
      wallAlcazaba2.rotation.y = -0.15;
      this.stage0Group.add(wallAlcazaba2);

      // Aspilleras en los lienzos defensivos
      const slitMat = new THREE.MeshBasicMaterial({ color: 0x140502 });
      const slitGeo = new THREE.BoxGeometry(0.18, 0.9, 0.2);
      [
        [10.8, 2.6, -25.2], [12.4, 2.6, -25.2], [5.6, 1.4, -25.5],
        [8.2, 4.0, -24.8], [8.2, 6.5, -24.8]
      ].forEach(sp => {
        const slit = new THREE.Mesh(slitGeo, slitMat);
        slit.position.set(sp[0], sp[1], sp[2]);
        this.stage0Group.add(slit);
      });

      // 4. TORRE DE LA VELA (Presidiendo el espolón occidental en el extremo derecho)
      const velaGroup = new THREE.Group();
      velaGroup.position.set(15.5, -2.2, -25.2);

      // Gran torre cuadrada masiva (16x16m a escala)
      const velaBodyGeo = new THREE.BoxGeometry(5.8, 8.8, 5.8);
      const velaBody = new THREE.Mesh(velaBodyGeo, stoneMat);
      velaBody.position.y = 4.4;
      velaGroup.add(velaBody);

      // Almenas perimetrales en el amplio adarve
      const velaMerlonPositions = [
        [-2.4, 9.15, 2.7], [-1.2, 9.15, 2.7], [0.0, 9.15, 2.7], [1.2, 9.15, 2.7], [2.4, 9.15, 2.7],
        [-2.4, 9.15, -2.7], [-1.2, 9.15, -2.7], [0.0, 9.15, -2.7], [1.2, 9.15, -2.7], [2.4, 9.15, -2.7],
        [-2.7, 9.15, -1.2], [-2.7, 9.15, 1.2],
        [2.7, 9.15, -1.2], [2.7, 9.15, 1.2]
      ];
      velaMerlonPositions.forEach(mp => {
        const m = new THREE.Mesh(merlonGeo, stoneMat);
        m.position.set(mp[0], mp[1], mp[2]);
        if (Math.abs(mp[0]) > 2.5) m.rotation.y = Math.PI / 2;
        velaGroup.add(m);
      });

      // Espadaña Renacentista en la esquina superior del adarve
      const belfryGroup = new THREE.Group();
      belfryGroup.position.set(-1.8, 8.8, 1.8);

      const pillarGeo = new THREE.BoxGeometry(0.38, 2.2, 0.38);
      const pLeft = new THREE.Mesh(pillarGeo, stoneMat);
      pLeft.position.set(-0.7, 1.1, 0);
      belfryGroup.add(pLeft);

      const pRight = new THREE.Mesh(pillarGeo, stoneMat);
      pRight.position.set(0.7, 1.1, 0);
      belfryGroup.add(pRight);

      const bRoofGeo = new THREE.ConeGeometry(1.2, 0.9, 4);
      bRoofGeo.rotateY(Math.PI / 4);
      const bRoof = new THREE.Mesh(bRoofGeo, roofMat);
      bRoof.position.set(0, 2.5, 0);
      belfryGroup.add(bRoof);

      // Campana de bronce de la Vela oscilando con el compás
      const bellGeo = new THREE.CylinderGeometry(0.15, 0.42, 0.72, 12);
      const bellMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37, // Bronce dorado
        metalness: 0.92,
        roughness: 0.22
      });
      const bellMesh = new THREE.Mesh(bellGeo, bellMat);
      bellMesh.position.set(0, -0.36, 0);

      const bellPivot = new THREE.Group();
      bellPivot.position.set(0, 1.6, 0);
      bellPivot.add(bellMesh);
      belfryGroup.add(bellPivot);
      this.stage0Bell = bellPivot;

      velaGroup.add(belfryGroup);

      // Mástil y Banderas ondeando
      const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.4, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(1.5, 10.8, -1.2);
      velaGroup.add(pole);

      const flagGeo = new THREE.PlaneGeometry(2.0, 1.2, 10, 6);
      const flagMat = new THREE.MeshBasicMaterial({
        color: 0x008844, // Verde andaluz
        side: THREE.DoubleSide
      });
      const flagMesh = new THREE.Mesh(flagGeo, flagMat);
      flagMesh.position.set(1.5 + 1.0, 12.2, -1.2);
      velaGroup.add(flagMesh);
      this.stage0Flag = flagMesh;

      this.stage0Group.add(velaGroup);

      // ======================================================================
      // G. PUNTOS DE LUZ CÁLIDA CREPUSCULAR (ILUMINACIÓN MONUMENTAL)
      // ======================================================================

      const warmLightConfigs = [
        { color: 0xffaa44, intensity: 2.6, dist: 40, pos: new THREE.Vector3(15.5, 3.5, -20.0), phase: 0.0 }, // Vela
        { color: 0xff7722, intensity: 2.8, dist: 42, pos: new THREE.Vector3(-2.2, 4.0, -20.0), phase: 1.8 }, // Comares
        { color: 0xffcc66, intensity: 2.2, dist: 35, pos: new THREE.Vector3(-9.2, 1.0, -21.0), phase: 3.2 }, // Partal
        { color: 0xff8833, intensity: 2.4, dist: 38, pos: new THREE.Vector3(1.5, 3.2, -22.0), phase: 4.5 }   // Carlos V
      ];
      warmLightConfigs.forEach(cfg => {
        const pLight = new THREE.PointLight(cfg.color, cfg.intensity, cfg.dist, 1.6);
        pLight.position.copy(cfg.pos);
        this.stage0Group.add(pLight);
        this.stage0Lights.push({
          light: pLight,
          basePos: cfg.pos.clone(),
          baseIntensity: cfg.intensity,
          phase: cfg.phase
        });
      });

      // ======================================================================
      // H. ATMÓSFERA Y PULSO MUSICAL
      // ======================================================================

      // 1. Pavesas Doradas / Motas de Polvo Crepusculares
      const emberCount = 180;
      const emberGeo = new THREE.BufferGeometry();
      const emberPos = new Float32Array(emberCount * 3);
      const emberColors = new Float32Array(emberCount * 3);
      const emberSizes = new Float32Array(emberCount);
      const emberData = [];

      for (let i = 0; i < emberCount; i++) {
        const x = (Math.random() - 0.5) * 44;
        const y = -10 + Math.random() * 24;
        const z = -6 - Math.random() * 28;

        emberPos[i * 3]     = x;
        emberPos[i * 3 + 1] = y;
        emberPos[i * 3 + 2] = z;

        const isGold = Math.random() > 0.35;
        emberColors[i * 3]     = 1.0;
        emberColors[i * 3 + 1] = isGold ? 0.75 + Math.random() * 0.2 : 0.45;
        emberColors[i * 3 + 2] = isGold ? 0.25 : 0.12;

        const baseSize = 0.8 + Math.random() * 1.4;
        emberSizes[i] = baseSize;

        emberData.push({
          x, y, z,
          baseSize,
          speedY: 0.25 + Math.random() * 0.45,
          driftSpeed: 0.4 + Math.random() * 0.6,
          phase: Math.random() * Math.PI * 2
        });
      }

      emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
      emberGeo.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));
      emberGeo.setAttribute('size', new THREE.BufferAttribute(emberSizes, 1));

      const emberMat = new THREE.PointsMaterial({
        size: 1.4,
        map: this.stage0Textures.emberMap,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.85
      });

      const emberPoints = new THREE.Points(emberGeo, emberMat);
      this.stage0Group.add(emberPoints);
      this.stage0Embers = {
        mesh: emberPoints,
        geo: emberGeo,
        data: emberData,
        positions: emberPos,
        sizes: emberSizes
      };

      // 2. Vuelo de Vencejos / Golondrinas lejanas (Swifts)
      const swiftCount = 16;
      const swiftBodyGeo = new THREE.ConeGeometry(0.12, 0.9, 5);
      swiftBodyGeo.rotateX(Math.PI / 2);

      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(-1.1, -0.45);
      wingShape.lineTo(-0.9, -0.6);
      wingShape.lineTo(0, -0.2);
      wingShape.closePath();
      const wingGeo = new THREE.ShapeGeometry(wingShape);

      const swiftMat = new THREE.MeshBasicMaterial({
        color: 0x1f0d1a, // Silueta crepuscular
        side: THREE.DoubleSide
      });

      for (let i = 0; i < swiftCount; i++) {
        const sGroup = new THREE.Group();

        const sBody = new THREE.Mesh(swiftBodyGeo, swiftMat);
        sGroup.add(sBody);

        const leftWing = new THREE.Mesh(wingGeo, swiftMat);
        leftWing.position.set(-0.06, 0, 0.1);
        sGroup.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeo, swiftMat);
        rightWing.scale.x = -1;
        rightWing.position.set(0.06, 0, 0.1);
        sGroup.add(rightWing);

        const orbitRadius = 14 + Math.random() * 16;
        const orbitCenterY = 4 + Math.random() * 8;
        const orbitSpeed = 0.55 + Math.random() * 0.45;
        const orbitTilt = (Math.random() - 0.5) * 0.4;
        const phase = (i / swiftCount) * Math.PI * 2;

        sGroup.scale.set(0.85, 0.85, 0.85);
        this.stage0Group.add(sGroup);

        this.stage0Swifts.push({
          group: sGroup,
          leftWing,
          rightWing,
          radius: orbitRadius,
          centerY: orbitCenterY,
          speed: orbitSpeed,
          tilt: orbitTilt,
          phase
        });
      }
    }

    // ==========================================================================
    // 3. STAGE 0 ANIMATION UPDATE (updateStage0Alhambra)
    // ==========================================================================
    updateStage0Alhambra(dt, elapsed) {
      if (!this.stage0Group || !this.stage0Group.visible) return;

      const pulse = this.beatPulseValue || 0.0;

      // 1. Sol Crepuscular y Corona con respiración rítmica
      if (this.stage0SunHalo) {
        const haloScale = 1.0 + pulse * 0.18 + Math.sin(elapsed * 1.5) * 0.04;
        this.stage0SunHalo.scale.set(haloScale, haloScale, 1.0);
        this.stage0SunHalo.material.opacity = 0.85 + pulse * 0.35;
      }

      // 2. God-Rays Ondulantes y pulsantes con el BPM
      if (this.stage0GodRays && this.stage0GodRays.length) {
        this.stage0GodRays.forEach(ray => {
          const sway = Math.sin(elapsed * 1.2 + ray.phase) * 0.04;
          ray.mesh.rotation.z = ray.baseRotZ + sway;
          const targetOpacity = ray.baseOpacity + pulse * 0.22 + Math.sin(elapsed * 2.0 + ray.phase) * 0.05;
          ray.mat.uniforms.uOpacity.value = THREE.MathUtils.clamp(targetOpacity, 0.0, 0.8);
        });
      }

      // 3. Campana de la Vela oscilando con el compás
      if (this.stage0Bell) {
        this.stage0Bell.rotation.z = Math.sin(elapsed * 2.4) * 0.22 + pulse * 0.18;
      }

      // 4. Bandera ondeando en la brisa de Sierra Nevada
      if (this.stage0Flag) {
        const flagPos = this.stage0Flag.geometry.attributes.position;
        for (let i = 0; i < flagPos.count; i++) {
          const u = flagPos.getX(i);
          const amp = Math.max(0.0, (u + 1.0) / 2.0);
          const wave = Math.sin(elapsed * 6.5 - u * 3.5) * amp * 0.22 +
                       Math.cos(elapsed * 4.2 - u * 2.0) * amp * 0.10;
          flagPos.setZ(i, wave);
        }
        flagPos.needsUpdate = true;
      }

      // 5. Alberca del Partal con suave ondulación crepuscular
      if (this.stage0Water && this.stage0Water.material.map) {
        this.stage0Water.material.map.offset.y = (elapsed * 0.04) % 1.0;
      }

      // 6. Luces cálidas en los muros de la Alhambra
      if (this.stage0Lights && this.stage0Lights.length) {
        this.stage0Lights.forEach(l => {
          l.light.intensity = l.baseIntensity + pulse * 1.8 + Math.sin(elapsed * 2.0 + l.phase) * 0.3;
        });
      }

      // 7. Pavesas Doradas flotando suavemente (Thermal convection & BPM pulse)
      if (this.stage0Embers) {
        const { positions, data, geo, sizes } = this.stage0Embers;
        const count = data.length;
        for (let i = 0; i < count; i++) {
          const p = data[i];
          p.y += p.speedY * dt;
          p.x += Math.sin(elapsed * p.driftSpeed + p.phase) * dt * 0.8;

          if (p.y > 15.0) {
            p.y = -10.0;
            p.x = (Math.random() - 0.5) * 44;
          }

          positions[i * 3]     = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;

          sizes[i] = p.baseSize * (1.0 + pulse * 0.7);
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.size.needsUpdate = true;
      }

      // 8. Vuelo de Vencejos / Golondrinas cruzando el atardecer
      if (this.stage0Swifts && this.stage0Swifts.length) {
        this.stage0Swifts.forEach(swift => {
          const t = elapsed * swift.speed + swift.phase;
          const x = Math.cos(t) * swift.radius;
          const z = -26.0 + Math.sin(t) * (swift.radius * 0.65);
          const y = swift.centerY + Math.sin(t * 2.0) * 2.5 + Math.cos(t) * swift.tilt * 4.0;

          swift.group.position.set(x, y, z);

          const nextT = t + 0.05;
          const nx = Math.cos(nextT) * swift.radius;
          const nz = -26.0 + Math.sin(nextT) * (swift.radius * 0.65);
          const ny = swift.centerY + Math.sin(nextT * 2.0) * 2.5 + Math.cos(nextT) * swift.tilt * 4.0;
          swift.group.lookAt(nx, ny, nz);

          const turnRate = -Math.sin(t);
          swift.group.rotation.z += turnRate * 0.45;

          const flap = Math.sin(elapsed * 9.0 + swift.phase * 3.0);
          swift.leftWing.rotation.z = flap * 0.45;
          swift.rightWing.rotation.z = -flap * 0.45;
        });
      }
    }

    buildStage0Abismo() {
      this.buildStage0Alhambra();
    }

    updateStage0Abismo(dt, elapsed) {
      this.updateStage0Alhambra(dt, elapsed);
    }


    // ==========================================================================
    // 1. PROCEDURAL PBR TEXTURES (FACADE WINDOWS + NORMAL MAP + HOLOGRAM ADS)
    // ==========================================================================
    createCyberpunkFacadeTextures() {
      // Shared procedural PBR textures for the 24 Mega-Skyscrapers
      const width = 512;
      const height = 1024;

      // --- A. Albedo & Emissive Window Grid Canvas ---
      const albedoCanvas = document.createElement('canvas');
      albedoCanvas.width = width;
      albedoCanvas.height = height;
      const ctx = albedoCanvas.getContext('2d');

      // Deep metallic obsidian base
      ctx.fillStyle = '#05030c';
      ctx.fillRect(0, 0, width, height);

      // Industrial horizontal structural floor bands & vertical mullions
      ctx.fillStyle = '#0d091c';
      for (let y = 0; y < height; y += 32) {
        ctx.fillRect(0, y, width, 5);
      }
      for (let x = 0; x < width; x += 64) {
        ctx.fillRect(x, 0, 6, height);
      }

      // Emissive Canvas (strictly glowing windows and neon trim)
      const emissiveCanvas = document.createElement('canvas');
      emissiveCanvas.width = width;
      emissiveCanvas.height = height;
      const eCtx = emissiveCanvas.getContext('2d');
      eCtx.fillStyle = '#000000';
      eCtx.fillRect(0, 0, width, height);

      // Normal & Roughness Map Canvas (window recesses + metallic mullions)
      const normalCanvas = document.createElement('canvas');
      normalCanvas.width = width;
      normalCanvas.height = height;
      const nCtx = normalCanvas.getContext('2d');
      // Flat normal (128, 128, 255)
      nCtx.fillStyle = 'rgb(128, 128, 255)';
      nCtx.fillRect(0, 0, width, height);

      const windowColors = [
        '#00f5ff', // Cyber Cyan
        '#ff007f', // Neon Magenta
        '#ffae00', // Sodium Amber
        '#e0f7ff', // Pure Clinical White-Blue
        '#9d4edd'  // Synth Purple
      ];

      const cols = 32;
      const rows = 64;
      const padX = 3;
      const padY = 4;
      const cellW = width / cols;
      const cellH = height / rows;

      for (let r = 0; r < rows; r++) {
        // Occasional dark mechanical floor
        const isMechFloor = (r % 12 === 0);
        const floorPaletteIdx = Math.floor((r * 7) % windowColors.length);

        for (let c = 0; c < cols; c++) {
          const wx = Math.floor(c * cellW + padX);
          const wy = Math.floor(r * cellH + padY);
          const ww = Math.floor(cellW - padX * 2);
          const wh = Math.floor(cellH - padY * 2);

          // Normal map bevel for every window pane (recessed glass)
          nCtx.fillStyle = 'rgb(95, 160, 255)'; // Top-left bevel
          nCtx.fillRect(wx - 1, wy - 1, ww + 2, 2);
          nCtx.fillStyle = 'rgb(160, 95, 255)'; // Bottom-right bevel
          nCtx.fillRect(wx - 1, wy + wh - 1, ww + 2, 2);
          nCtx.fillStyle = 'rgb(128, 128, 255)'; // Smooth glass interior
          nCtx.fillRect(wx, wy, ww, wh);

          if (isMechFloor) {
            ctx.fillStyle = '#140f29';
            ctx.fillRect(wx, wy, ww, wh);
            continue;
          }

          // Pseudo-random deterministic lighting pattern
          const seed = Math.sin(r * 19.37 + c * 43.11) * 10000;
          const rand = seed - Math.floor(seed);

          if (rand > 0.44) {
            const colChoice = rand > 0.85
              ? windowColors[(floorPaletteIdx + 1) % windowColors.length]
              : windowColors[floorPaletteIdx];
            const brightness = 0.55 + (rand - 0.44) * 0.8;

            ctx.fillStyle = colChoice;
            ctx.globalAlpha = brightness;
            ctx.fillRect(wx, wy, ww, wh);
            ctx.globalAlpha = 1.0;

            eCtx.fillStyle = colChoice;
            eCtx.globalAlpha = brightness;
            eCtx.fillRect(wx, wy, ww, wh);
            ctx.globalAlpha = 1.0;
          } else {
            // Dark reflective window glass
            ctx.fillStyle = '#090c1a';
            ctx.fillRect(wx, wy, ww, wh);
          }
        }
      }

      // Vertical neon accent strips on building corners/channels
      eCtx.fillStyle = '#00f5ff';
      eCtx.fillRect(2, 0, 3, height);
      eCtx.fillStyle = '#ff007f';
      eCtx.fillRect(width - 5, 0, 3, height);

      const createTex = (canvas, isColor = true) => {
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        if (isColor && 'colorSpace' in tex) {
          tex.colorSpace = THREE.SRGBColorSpace;
        }
        tex.needsUpdate = true;
        return tex;
      };

      // --- B. Procedural Hologram Billboard Texture (Neo-Tokyo / Blade Runner) ---
      const holoCanvas = document.createElement('canvas');
      holoCanvas.width = 256;
      holoCanvas.height = 512;
      const hCtx = holoCanvas.getContext('2d');

      hCtx.clearRect(0, 0, 256, 512);
      const grad = hCtx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, 'rgba(0, 245, 255, 0.88)');
      grad.addColorStop(0.5, 'rgba(255, 0, 128, 0.78)');
      grad.addColorStop(1.0, 'rgba(255, 190, 0, 0.88)');

      // Glowing border frame
      hCtx.strokeStyle = grad;
      hCtx.lineWidth = 8;
      hCtx.strokeRect(10, 10, 236, 492);

      // Scanline background fill
      for (let y = 14; y < 498; y += 6) {
        hCtx.fillStyle = (y % 12 === 0) ? 'rgba(0, 240, 255, 0.16)' : 'rgba(255, 0, 128, 0.08)';
        hCtx.fillRect(14, y, 228, 3);
      }

      // Stylized cyber glyphs & geometric emblems
      hCtx.fillStyle = '#00f5ff';
      hCtx.font = 'bold 44px monospace';
      hCtx.textAlign = 'center';
      const glyphs = ['電', '脳', '都', '市', '零', '壱', '光', '音'];
      for (let i = 0; i < glyphs.length; i++) {
        hCtx.fillStyle = (i % 2 === 0) ? '#00f5ff' : '#ff2a85';
        hCtx.fillText(glyphs[i], 128, 72 + i * 54);
      }

      // Circular cybernetic target seal at bottom
      hCtx.beginPath();
      hCtx.arc(128, 455, 26, 0, Math.PI * 2);
      hCtx.strokeStyle = '#fee440';
      hCtx.lineWidth = 4;
      hCtx.stroke();

      // --- C. Helipad Rooftop Texture ---
      const heliCanvas = document.createElement('canvas');
      heliCanvas.width = 256;
      heliCanvas.height = 256;
      const hlCtx = heliCanvas.getContext('2d');
      hlCtx.fillStyle = '#080612';
      hlCtx.fillRect(0, 0, 256, 256);

      hlCtx.strokeStyle = '#00f5ff';
      hlCtx.lineWidth = 10;
      hlCtx.beginPath();
      hlCtx.arc(128, 128, 106, 0, Math.PI * 2);
      hlCtx.stroke();

      hlCtx.setLineDash([18, 12]);
      hlCtx.strokeStyle = '#ff007f';
      hlCtx.lineWidth = 6;
      hlCtx.beginPath();
      hlCtx.arc(128, 128, 86, 0, Math.PI * 2);
      hlCtx.stroke();
      hlCtx.setLineDash([]);

      hlCtx.fillStyle = '#00f5ff';
      hlCtx.font = 'bold 110px sans-serif';
      hlCtx.textAlign = 'center';
      hlCtx.textBaseline = 'middle';
      hlCtx.fillText('H', 128, 132);

      return {
        albedoMap: createTex(albedoCanvas, true),
        emissiveMap: createTex(emissiveCanvas, true),
        normalMap: createTex(normalCanvas, false),
        holoMap: createTex(holoCanvas, true),
        helipadMap: createTex(heliCanvas, true)
      };
    }

    // ==========================================================================
    // 2. BUILD STAGE 1: CYBERPUNK SYNTHWAVE METROPOLIS
    // ==========================================================================
    buildStage1Synthwave() {
      this.stage1Group = new THREE.Group();
      this.worldGroup.add(this.stage1Group);

      // Generate shared procedural PBR textures
      this.stage1Textures = this.createCyberpunkFacadeTextures();
      this.stage1Skybridges = [];
      this.stage1HighwayLights = [];

      // ------------------------------------------------------------------------
      // 1. HIGH-RESOLUTION CYBER-GRID TERRAIN & ELEVATED HIGHWAY CORRIDOR
      // ------------------------------------------------------------------------
      const terrainGeo = new THREE.PlaneGeometry(110, 140, 96, 96);
      const posAttr = terrainGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        let z = 0;
        const absX = Math.abs(x);

        // Central highway deck (absX <= 8.5) is flat & slightly crowned;
        // Lateral cyber-canyons rise into terraced synthwave ridges
        if (absX > 8.5) {
          const distOut = absX - 8.5;
          const terrace = Math.floor(distOut / 4.5) * 1.4;
          const wave = Math.sin(x * 0.28) * Math.cos(y * 0.16) * (distOut * 0.42);
          const spirePeak = Math.pow(Math.max(0, Math.sin(x * 0.55 + y * 0.22)), 3.0) * (distOut * 0.35);
          z = terrace + wave + spirePeak;
        } else {
          // Subtle highway crown
          z = Math.cos((x / 8.5) * Math.PI * 0.5) * 0.25;
        }
        posAttr.setZ(i, z);
      }
      terrainGeo.computeVertexNormals();

      const terrainVert = `
        varying vec2 vUv;
        varying float vHeight;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vHeight = position.z;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `;

      const terrainFrag = `
        varying vec2 vUv;
        varying float vHeight;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uBeatPulse;
        uniform vec3 uGridColor;
        uniform vec3 uTerrainBg;

        void main() {
          // High-precision scrolling synthwave grid
          vec2 uvScroll = vUv;
          uvScroll.y = fract(uvScroll.y * 36.0 - uTime * uSpeed * 1.35);
          uvScroll.x = fract(uvScroll.x * 28.0);

          vec2 cellEdge = abs(uvScroll - 0.5);
          float line = max(smoothstep(0.465, 0.5, cellEdge.x), smoothstep(0.465, 0.5, cellEdge.y));

          // Central highway lane markers
          float absWorldX = abs(vWorldPos.x);
          float isHighway = step(absWorldX, 8.5);
          float laneDash = step(0.5, fract(vUv.y * 48.0 - uTime * uSpeed * 2.5));
          float centerStripes = (smoothstep(0.22, 0.0, abs(absWorldX - 2.8)) + smoothstep(0.25, 0.0, abs(absWorldX - 8.2))) * laneDash * isHighway;

          // Animated bass ripple rings expanding on the wet highway
          float distBoard = length(vWorldPos.xz - vec2(0.0, -12.0));
          float ripple = sin(distBoard * 1.1 - uTime * 6.5) * exp(-distBoard * 0.045) * uBeatPulse;

          vec3 base = mix(uTerrainBg, vec3(0.02, 0.01, 0.08), isHighway * 0.6);
          vec3 grid = mix(uGridColor, vec3(0.0, 0.98, 1.0), clamp(vHeight * 0.07 + isHighway * 0.35, 0.0, 1.0));
          vec3 finalRgb = mix(base, grid, clamp(line * 0.88 + ripple * 0.55, 0.0, 1.0));
          finalRgb += vec3(0.0, 0.95, 1.0) * centerStripes * (0.8 + uBeatPulse * 0.5);

          // Smooth horizon & edge fade
          float distFade = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
          gl_FragColor = vec4(finalRgb, distFade * 0.97);
        }
      `;

      this.stage1TerrainMat = new THREE.ShaderMaterial({
        vertexShader: terrainVert,
        fragmentShader: terrainFrag,
        uniforms: {
          uTime: { value: 0.0 },
          uSpeed: { value: 0.42 },
          uBeatPulse: { value: 0.0 },
          uGridColor: { value: new THREE.Vector3(1.0, 0.0, 0.72) },
          uTerrainBg: { value: new THREE.Vector3(0.04, 0.0, 0.11) }
        },
        transparent: true
      });

      const terrainMesh = new THREE.Mesh(terrainGeo, this.stage1TerrainMat);
      terrainMesh.rotation.x = -Math.PI / 2 + 0.05;
      terrainMesh.position.set(0, -11.5, -38);
      this.stage1Group.add(terrainMesh);

      // Highway Elevated Guardrails, Support Pillars (64-seg rings) & Laser Streetlights
      const pillarGeo = new THREE.CylinderGeometry(0.42, 0.55, 8.0, 64);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x100820,
        roughness: 0.25,
        metalness: 0.9
      });
      const pillarRingGeo = new THREE.TorusGeometry(0.52, 0.06, 24, 64);
      const archLampGeo = new THREE.TorusGeometry(8.6, 0.09, 24, 96, Math.PI);

      for (let p = 0; p < 8; p++) {
        const pz = -14.0 - p * 8.5;
        const py = -11.2 - p * 0.35;

        [-8.6, 8.6].forEach((px, sIdx) => {
          const pGroup = new THREE.Group();
          pGroup.position.set(px, py, pz);

          const colMesh = new THREE.Mesh(pillarGeo, pillarMat);
          colMesh.position.y = -2.5;
          pGroup.add(colMesh);

          const neonColor = (p + sIdx) % 2 === 0 ? 0x00f5ff : 0xff007f;
          const ringMat = new THREE.MeshBasicMaterial({ color: neonColor });
          const ringMesh = new THREE.Mesh(pillarRingGeo, ringMat);
          ringMesh.rotation.x = Math.PI / 2;
          ringMesh.position.y = 1.2;
          pGroup.add(ringMesh);

          // Streetlight glowing orb (high-geo 32x32 sphere)
          const lampOrb = new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 32, 32),
            ringMat
          );
          lampOrb.position.set(sIdx === 0 ? 0.6 : -0.6, 2.4, 0);
          pGroup.add(lampOrb);

          this.stage1Group.add(pGroup);
          this.stage1HighwayLights.push({ mat: ringMat, phase: p * 0.6 + sIdx });
        });

        // Every 2 pillars, span a circular neon highway arch across the road
        if (p % 2 === 1) {
          const archMat = new THREE.MeshBasicMaterial({
            color: p % 4 === 1 ? 0x00f5ff : 0xff0099,
            transparent: true,
            opacity: 0.75
          });
          const archMesh = new THREE.Mesh(archLampGeo, archMat);
          archMesh.position.set(0, py + 1.2, pz);
          this.stage1Group.add(archMesh);
        }
      }

      // Continuous glowing guardrails along the highway corridor
      const railGeo = new THREE.CylinderGeometry(0.08, 0.08, 76, 32);
      railGeo.rotateX(Math.PI / 2);
      const leftRail = new THREE.Mesh(railGeo, new THREE.MeshBasicMaterial({ color: 0x00f5ff }));
      leftRail.position.set(-8.5, -10.2, -44);
      this.stage1Group.add(leftRail);

      const rightRail = new THREE.Mesh(railGeo, new THREE.MeshBasicMaterial({ color: 0xff007f }));
      rightRail.position.set(8.5, -10.2, -44);
      this.stage1Group.add(rightRail);

      // ------------------------------------------------------------------------
      // 2. PERFECT 128-SEGMENT SYNTHWAVE RETRO-SUN & 3D CORONAL RINGS
      // ------------------------------------------------------------------------
      const sunGroup = new THREE.Group();
      sunGroup.position.set(0, 4.8, -62);
      this.stage1Group.add(sunGroup);

      // High-geometry CircleGeometry (128 segments) for a razor-sharp circular silhouette
      const sunGeo = new THREE.CircleGeometry(19.5, 128);
      const sunVert = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;

      const sunFrag = `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uBeatPulse;

        void main() {
          vec2 uv = vUv - 0.5;
          float dist = length(uv);
          if (dist > 0.5) discard;

          vec3 topColor = vec3(1.0, 0.96, 0.25);
          vec3 midColor = vec3(1.0, 0.22, 0.45);
          vec3 botColor = vec3(0.85, 0.0, 0.65);
          vec3 sunRgb = mix(botColor, mix(midColor, topColor, smoothstep(0.3, 0.9, vUv.y)), vUv.y);

          // Classic Outrun horizontal scanline cuts in lower 68%
          float scanlineCount = 22.0;
          float scanY = fract(vUv.y * scanlineCount - uTime * 0.18);
          float cutThreshold = mix(0.08, 0.58, 1.0 - vUv.y);

          if (vUv.y < 0.68 && scanY < cutThreshold) {
            discard;
          }

          // Smooth anti-aliased rim glow
          float rim = smoothstep(0.45, 0.5, dist);
          sunRgb += vec3(1.0, 0.5, 0.8) * rim * 0.45;
          sunRgb += vec3(0.22, 0.12, 0.28) * uBeatPulse;

          gl_FragColor = vec4(sunRgb, 1.0);
        }
      `;

      this.stage1SunMat = new THREE.ShaderMaterial({
        vertexShader: sunVert,
        fragmentShader: sunFrag,
        uniforms: {
          uTime: { value: 0.0 },
          uBeatPulse: { value: 0.0 }
        },
        transparent: true
      });

      const sunMesh = new THREE.Mesh(sunGeo, this.stage1SunMat);
      sunGroup.add(sunMesh);

      // High-geometry 128-segment concentric 3D neon solar rings framing the sun
      const outerSolarRing = new THREE.Mesh(
        new THREE.TorusGeometry(20.2, 0.16, 32, 128),
        new THREE.MeshBasicMaterial({ color: 0xff2a85, transparent: true, opacity: 0.85 })
      );
      sunGroup.add(outerSolarRing);

      const outerSolarRing2 = new THREE.Mesh(
        new THREE.TorusGeometry(21.6, 0.09, 24, 128),
        new THREE.MeshBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.6 })
      );
      sunGroup.add(outerSolarRing2);
      this.stage1SunRings = [outerSolarRing, outerSolarRing2];

      // ------------------------------------------------------------------------
      // 3. 24 MULTI-TIERED ARCHITECTURAL MEGA-SKYSCRAPERS WITH PBR FACADES
      // ------------------------------------------------------------------------
      this.stage1Buildings = [];
      const numBuildings = 24;

      // Shared high-geometry rooftop props
      const domeGeoHigh = new THREE.SphereGeometry(1.0, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const dishGeoHigh = new THREE.CylinderGeometry(0.65, 0.12, 0.35, 64, 1, true);
      const coolingTowerGeo = new THREE.CylinderGeometry(0.48, 0.62, 1.4, 64);
      const helipadGeo = new THREE.CylinderGeometry(1.35, 1.35, 0.14, 64);
      const helipadRingGeo = new THREE.TorusGeometry(1.38, 0.05, 24, 64);

      for (let b = 0; b < numBuildings; b++) {
        const bGroup = new THREE.Group();
        const side = b % 2 === 0 ? -1 : 1;
        const rowIdx = Math.floor(b / 2); // 0..11 depth rows on each side
        const primaryColor = (b % 3 === 0) ? 0x00f5ff : (b % 3 === 1 ? 0xff007f : 0xffaa00);
        const secondaryColor = side === -1 ? 0x00f5ff : 0xff0099;

        // Deterministic pseudo-random architectural dimensions
        const seed = Math.sin((b + 1) * 78.233) * 43758.5453;
        const r1 = seed - Math.floor(seed);
        const r2 = (seed * 1.7) - Math.floor(seed * 1.7);

        const baseW = 4.2 + r1 * 2.8;
        const baseD = 4.2 + r2 * 2.8;
        const totalH = 16.0 + r1 * 22.0 + (rowIdx % 3) * 4.5;

        const tier1H = totalH * 0.42;
        const tier2H = totalH * 0.36;
        const tier3H = totalH * 0.22;

        const bMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: this.stage1Textures.albedoMap,
          normalMap: this.stage1Textures.normalMap,
          normalScale: new THREE.Vector2(0.85, 0.85),
          emissive: 0xffffff,
          emissiveMap: this.stage1Textures.emissiveMap,
          emissiveIntensity: 0.95,
          roughness: 0.24,
          metalness: 0.88
        });

        const darkTrimMat = new THREE.MeshStandardMaterial({
          color: 0x0b0718,
          roughness: 0.28,
          metalness: 0.92
        });

        const neonEdgeMat = new THREE.LineBasicMaterial({
          color: primaryColor,
          transparent: true,
          opacity: 0.8
        });

        // --- TIER 1: Heavy Podium Base with Corner Buttresses ---
        const tier1Geo = new THREE.BoxGeometry(baseW, tier1H, baseD);
        const tier1Mesh = new THREE.Mesh(tier1Geo, bMat);
        tier1Mesh.position.y = tier1H * 0.5;
        bGroup.add(tier1Mesh);

        const tier1Edges = new THREE.LineSegments(new THREE.EdgesGeometry(tier1Geo), neonEdgeMat);
        tier1Edges.position.y = tier1H * 0.5;
        bGroup.add(tier1Edges);

        // 4 Corner Structural Buttresses on Podium
        const buttressGeo = new THREE.BoxGeometry(0.45, tier1H * 0.92, 0.45);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([cx, cz]) => {
          const buttress = new THREE.Mesh(buttressGeo, darkTrimMat);
          buttress.position.set(cx * (baseW * 0.5), tier1H * 0.46, cz * (baseD * 0.5));
          bGroup.add(buttress);
        });

        // --- TIER 2: Mid-Tower Setback Shaft ---
        const midW = baseW * 0.78;
        const midD = baseD * 0.78;
        const tier2Y = tier1H + tier2H * 0.5;

        let tier2Geo;
        if (b % 4 === 0) {
          // High-geometry 64-segment cylindrical corporate mega-shaft
          tier2Geo = new THREE.CylinderGeometry(midW * 0.52, midW * 0.56, tier2H, 64);
        } else if (b % 4 === 2) {
          // Octagonal beveled tower shaft
          tier2Geo = new THREE.CylinderGeometry(midW * 0.54, midW * 0.54, tier2H, 8);
        } else {
          tier2Geo = new THREE.BoxGeometry(midW, tier2H, midD);
        }

        const tier2Mesh = new THREE.Mesh(tier2Geo, bMat);
        tier2Mesh.position.y = tier2Y;
        bGroup.add(tier2Mesh);

        // Glowing horizontal neon separator ring between Tier 1 and Tier 2
        const sepRingGeo = new THREE.TorusGeometry(midW * 0.58, 0.08, 24, 64);
        const sepRing = new THREE.Mesh(sepRingGeo, new THREE.MeshBasicMaterial({ color: secondaryColor }));
        sepRing.rotation.x = Math.PI / 2;
        sepRing.position.y = tier1H;
        bGroup.add(sepRing);

        // --- TIER 3: Upper Crown (64-Segment Cylinder, Pyramid or Beveled Penthouse) ---
        const topW = midW * 0.68;
        const topD = midD * 0.68;
        const tier3Y = tier1H + tier2H + tier3H * 0.5;
        const roofTopY = tier1H + tier2H + tier3H;

        let tier3Geo;
        if (b % 3 === 0) {
          // Smooth 64-segment cylindrical crown
          tier3Geo = new THREE.CylinderGeometry(topW * 0.48, topW * 0.55, tier3H, 64);
        } else if (b % 3 === 1) {
          // Tapered pyramidal obelisk crown
          tier3Geo = new THREE.CylinderGeometry(topW * 0.25, topW * 0.62, tier3H, 4);
          tier3Geo.rotateY(Math.PI * 0.25);
        } else {
          tier3Geo = new THREE.BoxGeometry(topW, tier3H, topD);
        }

        const tier3Mesh = new THREE.Mesh(tier3Geo, bMat);
        tier3Mesh.position.y = tier3Y;
        bGroup.add(tier3Mesh);

        // --- ROOFTOP DETAILS: Helipads, 64-Seg Geodesic Domes, Cooling Towers & Dishes ---
        const roofFeatureType = b % 3;
        if (roofFeatureType === 0) {
          // Illuminated Circular Helipad (64 segments)
          const hPad = new THREE.Mesh(
            helipadGeo,
            new THREE.MeshBasicMaterial({ map: this.stage1Textures.helipadMap })
          );
          hPad.position.y = roofTopY + 0.08;
          bGroup.add(hPad);

          const hRing = new THREE.Mesh(
            helipadRingGeo,
            new THREE.MeshBasicMaterial({ color: 0x00f5ff })
          );
          hRing.rotation.x = Math.PI / 2;
          hRing.position.y = roofTopY + 0.12;
          bGroup.add(hRing);
        } else if (roofFeatureType === 1) {
          // High-geometry 64-segment Specular Cyber-Dome
          const domeMesh = new THREE.Mesh(
            domeGeoHigh,
            new THREE.MeshStandardMaterial({
              color: primaryColor,
              emissive: primaryColor,
              emissiveIntensity: 0.65,
              roughness: 0.1,
              metalness: 0.9,
              transparent: true,
              opacity: 0.88
            })
          );
          domeMesh.scale.set(topW * 0.42, topW * 0.42, topW * 0.42);
          domeMesh.position.y = roofTopY;
          bGroup.add(domeMesh);

          // Equator neon collar around dome
          const domeCollar = new THREE.Mesh(
            new THREE.TorusGeometry(topW * 0.42, 0.06, 24, 64),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
          );
          domeCollar.rotation.x = Math.PI / 2;
          domeCollar.position.y = roofTopY + 0.04;
          bGroup.add(domeCollar);
        } else {
          // Twin Cylindrical Cooling Towers (64 segments) + Parabolic Dish
          [-0.55, 0.55].forEach(ox => {
            const cTower = new THREE.Mesh(coolingTowerGeo, darkTrimMat);
            cTower.position.set(ox * topW * 0.45, roofTopY + 0.7, 0);
            bGroup.add(cTower);

            const cRim = new THREE.Mesh(
              new THREE.TorusGeometry(0.48, 0.05, 16, 64),
              new THREE.MeshBasicMaterial({ color: 0xffae00 })
            );
            cRim.rotation.x = Math.PI / 2;
            cRim.position.set(ox * topW * 0.45, roofTopY + 1.4, 0);
            bGroup.add(cRim);
          });

          const dishMesh = new THREE.Mesh(
            dishGeoHigh,
            new THREE.MeshStandardMaterial({ color: 0x00f5ff, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide })
          );
          dishMesh.position.set(0, roofTopY + 1.1, topD * 0.3);
          dishMesh.rotation.x = 0.6;
          bGroup.add(dishMesh);
        }

        // High-geometry 32-segment Spire Antenna + 32x32 Warning Beacon Sphere
        const spireH = 3.2 + r2 * 4.5;
        const spireGeo = new THREE.CylinderGeometry(0.04, 0.14, spireH, 32);
        const spireMesh = new THREE.Mesh(spireGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        spireMesh.position.set(0, roofTopY + spireH * 0.5, 0);
        bGroup.add(spireMesh);

        const beaconGeo = new THREE.SphereGeometry(0.22, 32, 32);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(0, roofTopY + spireH, 0);
        bGroup.add(beaconMesh);

        // --- HOLOGRAPHIC VERTICAL BILLBOARD AD (Neo-Tokyo / Blade Runner) ---
        let holoMesh = null;
        if (b % 2 === 0 || rowIdx < 6) {
          const holoW = 2.1;
          const holoH = 6.8;
          const holoGeo = new THREE.PlaneGeometry(holoW, holoH);
          const holoMat = new THREE.MeshBasicMaterial({
            map: this.stage1Textures.holoMap,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
          });
          holoMesh = new THREE.Mesh(holoGeo, holoMat);
          // Mount on inward-facing side toward the highway corridor
          const inwardX = -side * (midW * 0.5 + 1.35);
          holoMesh.position.set(inwardX, tier1H + tier2H * 0.45, 0);
          holoMesh.rotation.y = side === -1 ? Math.PI * 0.12 : -Math.PI * 0.12;
          bGroup.add(holoMesh);
        }

        // Position skyscraper along a dense multi-layered metropolitan canyon
        const laneTier = rowIdx % 2; // Inner row vs outer tall row
        const bx = side * (11.6 + laneTier * 3.8 + (rowIdx * 0.65) + r1 * 1.0);
        const bz = -16.0 - rowIdx * 4.6 - r2 * 2.0;
        const by = -11.5;
        bGroup.position.set(bx, by, bz);

        this.stage1Group.add(bGroup);
        this.stage1Buildings.push({
          group: bGroup,
          beaconMat,
          holoMesh,
          phase: b * 0.55,
          bx,
          by,
          bz,
          totalH
        });
      }

      // ------------------------------------------------------------------------
      // 4. ELEVATED SKYBRIDGES & FIBER-OPTIC TUBE CABLES CONNECTING TOWERS
      // ------------------------------------------------------------------------
      for (let i = 0; i < this.stage1Buildings.length - 2; i += 2) {
        const bA = this.stage1Buildings[i];
        const bB = this.stage1Buildings[i + 2];
        if (!bA || !bB) continue;

        const bridgeY = -11.5 + Math.min(bA.totalH, bB.totalH) * 0.52;
        const pStart = new THREE.Vector3(bA.bx, bridgeY, bA.bz);
        const pEnd = new THREE.Vector3(bB.bx, bridgeY, bB.bz);
        const dist = pStart.distanceTo(pEnd);

        if (dist < 18.0) {
          // Enclosed Glass & Neon Skybridge Walkway
          const bridgeGeo = new THREE.CylinderGeometry(0.45, 0.45, dist, 32, 1, false);
          bridgeGeo.rotateX(Math.PI / 2);
          const bridgeMat = new THREE.MeshStandardMaterial({
            color: 0x0b0718,
            emissive: i % 4 === 0 ? 0x00f5ff : 0xff007f,
            emissiveIntensity: 0.65,
            roughness: 0.2,
            metalness: 0.9
          });
          const bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
          bridgeMesh.position.copy(pStart).lerp(pEnd, 0.5);
          bridgeMesh.lookAt(pEnd);
          this.stage1Group.add(bridgeMesh);

          // Hanging CatmullRom Fiber-Optic Power Conduit (TubeGeometry, 64 tubular segments)
          const midPt = pStart.clone().lerp(pEnd, 0.5);
          midPt.y -= 2.2;
          const curve = new THREE.CatmullRomCurve3([pStart, midPt, pEnd]);
          const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.09, 24, false);
          const tubeMat = new THREE.MeshBasicMaterial({
            color: i % 4 === 0 ? 0xff007f : 0x00f5ff
          });
          const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
          this.stage1Group.add(tubeMesh);
          this.stage1Skybridges.push({ bridgeMat, tubeMat, phase: i * 0.4 });
        }
      }

      // ------------------------------------------------------------------------
      // 5. 2 UPGRADED MECHA SUB-WOOFER MONOLITHS & HOLOGRAPHIC DRONES (X = ±16.5)
      // ------------------------------------------------------------------------
      this.stage1Monoliths = [];
      const monolithX = [-16.5, 16.5];

      monolithX.forEach((mx, mIdx) => {
        const mGroup = new THREE.Group();
        mGroup.position.set(mx, -2.0, -10.0);

        // Multi-layered Heavy Mecha Chassis
        const chassisGeo = new THREE.BoxGeometry(4.8, 16.4, 5.2);
        const chassisMat = new THREE.MeshStandardMaterial({
          color: 0x0d061a,
          roughness: 0.22,
          metalness: 0.94
        });
        const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
        mGroup.add(chassisMesh);

        // Chamfered side armor plates (32-segment cylinders)
        const armorGeo = new THREE.CylinderGeometry(0.45, 0.45, 16.0, 32);
        [[-2.4, 2.6], [2.4, 2.6], [-2.4, -2.6], [2.4, -2.6]].forEach(([ax, az]) => {
          const armorCol = new THREE.Mesh(armorGeo, chassisMat);
          armorCol.position.set(ax, 0, az);
          mGroup.add(armorCol);
        });

        // Neon wireframe hazard borders
        const hazardEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(chassisGeo),
          new THREE.LineBasicMaterial({ color: mIdx === 0 ? 0x00f5ff : 0xff0077, transparent: true, opacity: 0.85 })
        );
        mGroup.add(hazardEdges);

        // 3 Stacked High-Geometry 64-Segment Sub-Woofer Cones & 128-Segment Floating Acoustic Rings
        const turbines = [];
        const wooferCones = [];
        const acousticRings = [];
        const turbineY = [-4.8, 0.0, 4.8];

        turbineY.forEach((ty, tIdx) => {
          const tGroup = new THREE.Group();
          tGroup.position.set(0, ty, 2.65);

          // Outer machined speaker bezel (64 radial segments)
          const housingGeo = new THREE.CylinderGeometry(1.55, 1.55, 0.38, 64);
          const housingMat = new THREE.MeshStandardMaterial({
            color: 0x18092c,
            roughness: 0.18,
            metalness: 0.95
          });
          const housing = new THREE.Mesh(housingGeo, housingMat);
          housing.rotation.x = Math.PI / 2;
          tGroup.add(housing);

          // Deep acoustic sub-woofer cone (open Cylinder 64 radial segments)
          const coneGeo = new THREE.CylinderGeometry(1.38, 0.42, 0.65, 64, 1, true);
          const coneMat = new THREE.MeshStandardMaterial({
            color: 0x090414,
            emissive: tIdx === 1 ? 0xff007f : 0x00f5ff,
            emissiveIntensity: 0.45,
            roughness: 0.3,
            metalness: 0.85,
            side: THREE.DoubleSide
          });
          const coneMesh = new THREE.Mesh(coneGeo, coneMat);
          coneMesh.rotation.x = Math.PI / 2;
          coneMesh.position.z = 0.1;
          tGroup.add(coneMesh);

          // Central dust-cap dome (64x32 sphere)
          const capGeo = new THREE.SphereGeometry(0.46, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5);
          const capMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: tIdx === 1 ? 0xff007f : 0x00f5ff,
            emissiveIntensity: 1.1,
            roughness: 0.1,
            metalness: 0.9
          });
          const capMesh = new THREE.Mesh(capGeo, capMat);
          capMesh.rotation.x = Math.PI / 2;
          capMesh.position.z = 0.22;
          tGroup.add(capMesh);

          wooferCones.push({ cone: coneMesh, cap: capMesh, baseZ: 0.22 });

          // 8 Curved Turbine Fan Blades
          const fanGroup = new THREE.Group();
          fanGroup.position.z = 0.26;
          const bladeGeo = new THREE.BoxGeometry(0.18, 2.5, 0.06);
          const bladeMat = new THREE.MeshBasicMaterial({
            color: tIdx % 2 === 0 ? 0x00f5ff : 0xff0099
          });

          for (let k = 0; k < 8; k++) {
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.rotation.z = (k / 8) * Math.PI;
            fanGroup.add(blade);
          }
          tGroup.add(fanGroup);
          turbines.push(fanGroup);

          // Concentric Floating 128-Segment Neon Ring in front of each Sub-Woofer
          const ringGeo = new THREE.TorusGeometry(1.52, 0.065, 32, 128);
          const ringMat = new THREE.MeshBasicMaterial({
            color: tIdx === 1 ? 0xff007f : 0x00f5ff
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.position.z = 0.42;
          tGroup.add(ringMesh);
          acousticRings.push({ mesh: ringMesh, baseZ: 0.42, idx: tIdx });

          mGroup.add(tGroup);
        });

        // 4 Chrome Hydraulic Equalizer Pistons (32 radial segments + 64-seg collar)
        const pistons = [];
        const pistonX = [-2.55, 2.55];
        const pistonZ = [-1.6, 1.6];

        pistonX.forEach(px => {
          pistonZ.forEach(pz => {
            const pGeo = new THREE.CylinderGeometry(0.22, 0.22, 4.8, 32);
            const pMat = new THREE.MeshStandardMaterial({
              color: 0xe0f7ff,
              emissive: 0xff0099,
              emissiveIntensity: 0.5,
              roughness: 0.1,
              metalness: 0.98
            });
            const pMesh = new THREE.Mesh(pGeo, pMat);
            pMesh.position.set(px, 0, pz);
            mGroup.add(pMesh);

            // Glowing collar ring on piston
            const collar = new THREE.Mesh(
              new THREE.TorusGeometry(0.28, 0.05, 16, 64),
              new THREE.MeshBasicMaterial({ color: 0x00f5ff })
            );
            collar.rotation.x = Math.PI / 2;
            pMesh.add(collar);

            pistons.push({ mesh: pMesh, baseY: 0 });
          });
        });

        // Braided Energy Power Cables (TubeGeometry, 64 segments) feeding the Monolith
        const cableCurves = [
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, -8.0, -2.2),
            new THREE.Vector3(mIdx === 0 ? -3.8 : 3.8, -5.0, -1.0),
            new THREE.Vector3(mIdx === 0 ? -2.4 : 2.4, 1.5, 0.5),
            new THREE.Vector3(0, 6.5, -1.5)
          ]),
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, -7.5, 1.8),
            new THREE.Vector3(mIdx === 0 ? -3.2 : 3.2, -1.5, 2.2),
            new THREE.Vector3(0, 5.0, 1.8)
          ])
        ];
        cableCurves.forEach((cCurve, cIdx) => {
          const cGeo = new THREE.TubeGeometry(cCurve, 64, 0.14, 24, false);
          const cMat = new THREE.MeshStandardMaterial({
            color: 0x111122,
            emissive: cIdx === 0 ? 0x00f5ff : 0xff007f,
            emissiveIntensity: 0.7,
            roughness: 0.3,
            metalness: 0.85
          });
          mGroup.add(new THREE.Mesh(cGeo, cMat));
        });

        // High-Density Rotating Holographic Drone Sphere hovering above each Monolith
        const holoDroneGroup = new THREE.Group();
        holoDroneGroup.position.set(0, 10.6, 0.5);

        const coreSphere = new THREE.Mesh(
          new THREE.SphereGeometry(1.15, 64, 64),
          new THREE.MeshStandardMaterial({
            color: mIdx === 0 ? 0x00f5ff : 0xff007f,
            emissive: mIdx === 0 ? 0x00b4d8 : 0xff0055,
            emissiveIntensity: 0.9,
            roughness: 0.1,
            metalness: 0.9,
            wireframe: true
          })
        );
        holoDroneGroup.add(coreSphere);

        // 2 Gimbal 128-segment orbital rings around the drone sphere
        const gimbal1 = new THREE.Mesh(
          new THREE.TorusGeometry(1.65, 0.05, 24, 128),
          new THREE.MeshBasicMaterial({ color: 0x00f5ff })
        );
        const gimbal2 = new THREE.Mesh(
          new THREE.TorusGeometry(1.95, 0.04, 24, 128),
          new THREE.MeshBasicMaterial({ color: 0xff0099 })
        );
        gimbal2.rotation.x = Math.PI * 0.35;
        holoDroneGroup.add(gimbal1);
        holoDroneGroup.add(gimbal2);
        mGroup.add(holoDroneGroup);

        this.stage1Group.add(mGroup);
        this.stage1Monoliths.push({
          group: mGroup,
          turbines,
          wooferCones,
          acousticRings,
          pistons,
          holoDroneGroup,
          gimbal1,
          gimbal2
        });
      });

      // ------------------------------------------------------------------------
      // 6. 8 HIGH-GEOMETRY FLYING CYBER-SPINNERS (4 VECTOR THRUSTERS + CANOPY)
      // ------------------------------------------------------------------------
      this.stage1Spinners = [];
      const numSpinners = 8;

      // Shared high-geometry components for Cyber-Spinners
      // Aerodynamic beveled fuselage profile extruded in 3D
      const hullShape = new THREE.Shape();
      hullShape.moveTo(-1.7, -0.18);
      hullShape.lineTo(1.4, -0.18);
      hullShape.lineTo(1.85, 0.02);
      hullShape.lineTo(0.95, 0.26);
      hullShape.lineTo(-1.25, 0.28);
      hullShape.lineTo(-1.8, 0.08);
      hullShape.closePath();

      const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
        depth: 1.5,
        bevelEnabled: true,
        bevelSegments: 8,
        steps: 2,
        bevelSize: 0.12,
        bevelThickness: 0.12
      });
      hullGeo.center();
      // Orient length along Z axis (nose at +Z, tail at -Z)
      hullGeo.rotateY(-Math.PI / 2);

      const canopyGeo = new THREE.SphereGeometry(0.62, 48, 32);
      canopyGeo.scale(0.82, 0.48, 1.85);

      const thrusterHousingGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.4, 32);
      const thrusterRingGeo = new THREE.TorusGeometry(0.32, 0.05, 16, 48);
      const thrusterCoreGeo = new THREE.CircleGeometry(0.25, 32);
      thrusterCoreGeo.rotateX(Math.PI / 2);

      // Additive gradient canvas for dual plasma light trails
      const trailCanvas = document.createElement('canvas');
      trailCanvas.width = 128;
      trailCanvas.height = 32;
      const tCtx = trailCanvas.getContext('2d');
      const tGrad = tCtx.createLinearGradient(0, 0, 128, 0);
      tGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
      tGrad.addColorStop(0.25, 'rgba(0, 245, 255, 0.75)');
      tGrad.addColorStop(0.7, 'rgba(255, 0, 128, 0.35)');
      tGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      tCtx.fillStyle = tGrad;
      tCtx.fillRect(0, 0, 128, 32);
      const trailTex = new THREE.CanvasTexture(trailCanvas);

      for (let s = 0; s < numSpinners; s++) {
        const sGroup = new THREE.Group();
        const isPoliceOrInterceptor = (s % 3 === 0);
        const accentHex = s % 2 === 0 ? 0x00f5ff : 0xff007f;

        // 1. Beveled Aerodynamic Fuselage
        const bodyMat = new THREE.MeshStandardMaterial({
          color: isPoliceOrInterceptor ? 0x101528 : 0x160926,
          roughness: 0.18,
          metalness: 0.92
        });
        const bodyMesh = new THREE.Mesh(hullGeo, bodyMat);
        sGroup.add(bodyMesh);

        // 2. Specular Bubble Glass Cockpit Canopy (48x32 sphere)
        const canopyMat = new THREE.MeshStandardMaterial({
          color: 0x051824,
          emissive: accentHex,
          emissiveIntensity: 0.35,
          roughness: 0.05,
          metalness: 0.98,
          transparent: true,
          opacity: 0.92
        });
        const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
        canopyMesh.position.set(0, 0.24, 0.15);
        sGroup.add(canopyMesh);

        // Forward split nose pontoons (Blade Runner Spinner style)
        const pontoonGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.35, 32);
        pontoonGeo.rotateX(Math.PI / 2);
        [-0.52, 0.52].forEach(px => {
          const pontoon = new THREE.Mesh(pontoonGeo, bodyMat);
          pontoon.position.set(px, -0.04, 1.35);
          sGroup.add(pontoon);
        });

        // Rear aerodynamic twin tail fins
        const finGeo = new THREE.BoxGeometry(0.08, 0.48, 0.85);
        [-0.62, 0.62].forEach(fx => {
          const fin = new THREE.Mesh(finGeo, bodyMat);
          fin.position.set(fx, 0.28, -1.35);
          fin.rotation.z = fx > 0 ? -0.22 : 0.22;
          sGroup.add(fin);
        });

        // 3. 4 Circular Vector Thrusters (32-seg Cylinder + 48-seg Torus + Plasma Core)
        const thrusters = [];
        const thrusterOffsets = [
          [-0.98, -0.05, 0.95],
          [0.98, -0.05, 0.95],
          [-0.98, -0.05, -1.05],
          [0.98, -0.05, -1.05]
        ];
        const ringMat = new THREE.MeshBasicMaterial({ color: accentHex });
        const coreMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide
        });

        thrusterOffsets.forEach(([tx, ty, tz]) => {
          const thGroup = new THREE.Group();
          thGroup.position.set(tx, ty, tz);

          const thHousing = new THREE.Mesh(thrusterHousingGeo, bodyMat);
          thGroup.add(thHousing);

          const thRing = new THREE.Mesh(thrusterRingGeo, ringMat);
          thRing.rotation.x = Math.PI / 2;
          thRing.position.y = -0.18;
          thGroup.add(thRing);

          const thCore = new THREE.Mesh(thrusterCoreGeo, coreMat);
          thCore.position.y = -0.19;
          thGroup.add(thCore);

          sGroup.add(thGroup);
          thrusters.push(thGroup);
        });

        // 4. Twin High-Intensity Headlights & Taillight Bars + Dual Plasma Light Trails
        const hlGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.42, 32);
        hlGeo.rotateZ(Math.PI / 2);
        const hlMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
        [-0.52, 0.52].forEach(hx => {
          const hlMesh = new THREE.Mesh(hlGeo, hlMat);
          hlMesh.position.set(hx, -0.04, 2.02);
          sGroup.add(hlMesh);
        });

        const tlGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.35, 32);
        tlGeo.rotateZ(Math.PI / 2);
        const tlMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
        const tlMesh = new THREE.Mesh(tlGeo, tlMat);
        tlMesh.position.set(0, 0.05, -1.85);
        sGroup.add(tlMesh);

        // Dual Additive Light Trails streaming behind the Spinner
        const trailGeo = new THREE.PlaneGeometry(5.8, 0.28);
        trailGeo.rotateY(Math.PI / 2);
        trailGeo.translate(0, 0, -4.75);

        const trailMat = new THREE.MeshBasicMaterial({
          map: trailTex,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        });

        [-0.52, 0.52].forEach(trx => {
          const trPlane = new THREE.Mesh(trailGeo, trailMat);
          trPlane.position.set(trx, 0.02, 0);
          sGroup.add(trPlane);

          // Cross-plane for volumetric 3D trail visibility from all angles
          const trPlaneCross = new THREE.Mesh(trailGeo, trailMat);
          trPlaneCross.rotation.z = Math.PI / 2;
          trPlaneCross.position.set(trx, 0.02, 0);
          sGroup.add(trPlaneCross);
        });

        // Distribute 8 Spinners across multi-altitude traffic lanes
        const dir = s % 2 === 0 ? 1 : -1;
        const isFgSpinner = (s < 3);
        const laneZ = isFgSpinner ? (4.8 + s * 1.5) : (-17.0 - s * 4.5);
        const laneY = isFgSpinner ? (-5.2 + s * 5.2) : (-2.5 + (s % 4) * 4.4 + (s >= 4 ? 2.2 : 0.0));
        const startX = -42.0 + (s * 11.5) % 84.0;

        sGroup.position.set(startX, laneY, laneZ);
        sGroup.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;

        this.stage1Group.add(sGroup);
        this.stage1Spinners.push({
          group: sGroup,
          thrusters,
          trailMat,
          speed: (15.0 + (s % 4) * 4.5) * dir,
          laneZ,
          laneY,
          dir,
          phase: s * 0.85
        });
      }

      // ------------------------------------------------------------------------
      // 7. BPM-SYNCED HIGH-GEOMETRY LASER BEAMS (32 Radial Segments)
      // ------------------------------------------------------------------------
      this.stage1Lasers = [];
      const laserGeo = new THREE.CylinderGeometry(0.11, 0.16, 68, 32);
      for (let l = 0; l < 8; l++) {
        const laserMat = new THREE.MeshBasicMaterial({
          color: l % 2 === 0 ? 0x00ffff : 0xff00a0,
          transparent: true,
          opacity: 0.48,
          blending: THREE.AdditiveBlending
        });
        const laserMesh = new THREE.Mesh(laserGeo, laserMat);
        const lx = (l - 3.5) * 6.8;
        laserMesh.position.set(lx, 11, -44);
        laserMesh.rotation.z = (l % 2 === 0 ? 1 : -1) * (0.14 + (l % 3) * 0.08);
        this.stage1Group.add(laserMesh);
        this.stage1Lasers.push({
          mesh: laserMesh,
          mat: laserMat,
          baseOpacity: 0.38,
          baseRotZ: laserMesh.rotation.z,
          phase: l * 0.7
        });
      }
    }

    // ==========================================================================
    // 3. UPDATE STAGE 1 ENVIRONMENT (FOR updateEnvironments(dt, elapsed))
    // ==========================================================================
    updateStage1Synthwave(dt, elapsed) {
      if (!this.stage1Group || !this.stage1Group.visible) return;

      const pulse = this.beatPulseValue || 0.0;

      // 1. Cyber-Grid Terrain & Sun Shaders
      if (this.stage1TerrainMat) {
        this.stage1TerrainMat.uniforms.uTime.value = elapsed;
        this.stage1TerrainMat.uniforms.uBeatPulse.value = pulse;
      }
      if (this.stage1SunMat) {
        this.stage1SunMat.uniforms.uTime.value = elapsed;
        this.stage1SunMat.uniforms.uBeatPulse.value = pulse;
      }
      if (this.stage1SunRings) {
        this.stage1SunRings[0].scale.setScalar(1.0 + pulse * 0.04);
        this.stage1SunRings[1].scale.setScalar(1.0 + Math.sin(elapsed * 2.0) * 0.02 + pulse * 0.06);
      }

      // 2. Mega-Skyscrapers: Blinking Beacons & Floating Hologram Billboards
      this.stage1Buildings.forEach(b => {
        const blink = Math.sin(elapsed * 4.5 + b.phase) > 0.15 ? 1.0 : 0.18;
        b.beaconMat.color.setRGB(blink + pulse * 0.5, 0.05, 0.35);

        if (b.holoMesh) {
          b.holoMesh.position.y += Math.sin(elapsed * 2.2 + b.phase) * 0.004;
          b.holoMesh.material.opacity = 0.72 + Math.sin(elapsed * 5.0 + b.phase) * 0.15 + pulse * 0.2;
        }
      });

      // 3. Mecha Sub-Woofer Monoliths: 64-Seg Cones, 128-Seg Rings, Pistons & Holo-Drones
      this.stage1Monoliths.forEach((m, mIdx) => {
        m.turbines.forEach((t, tIdx) => {
          t.rotation.z += dt * (2.2 + pulse * 3.5) * (tIdx % 2 === 0 ? 1 : -1);
        });

        if (m.wooferCones) {
          m.wooferCones.forEach(wc => {
            const pump = 1.0 + pulse * 0.22;
            wc.cone.scale.set(pump, 1.0 + pulse * 0.35, pump);
            wc.cap.position.z = wc.baseZ + pulse * 0.18;
          });
        }

        if (m.acousticRings) {
          m.acousticRings.forEach(ar => {
            const wave = Math.sin(elapsed * 5.0 - ar.idx * 0.8) * 0.08 + pulse * 0.28;
            ar.mesh.position.z = ar.baseZ + wave;
            const sc = 1.0 + pulse * 0.12;
            ar.mesh.scale.set(sc, sc, 1.0);
          });
        }

        m.pistons.forEach((p, pIdx) => {
          const alt = Math.sin(elapsed * 6.0 + pIdx * 1.5) * 0.25;
          p.mesh.position.y = p.baseY + alt + pulse * 1.45;
        });

        if (m.holoDroneGroup) {
          m.holoDroneGroup.rotation.y += dt * (0.85 + pulse * 1.5) * (mIdx === 0 ? 1 : -1);
          m.holoDroneGroup.position.y = 10.6 + Math.sin(elapsed * 2.4 + mIdx) * 0.35;
          m.gimbal1.rotation.x += dt * 1.6;
          m.gimbal2.rotation.y -= dt * 2.1;
        }
      });

      // 4. 8 Flying Cyber-Spinners with Vector Thruster Pitching & Banking
      this.stage1Spinners.forEach(s => {
        s.group.position.x += s.speed * dt;
        if (s.dir === 1 && s.group.position.x > 46.0) {
          s.group.position.x = -46.0;
        } else if (s.dir === -1 && s.group.position.x < -46.0) {
          s.group.position.x = 46.0;
        }

        // Smooth aerodynamic hover bobbing & subtle banking roll
        const hover = Math.sin(elapsed * 3.2 + s.phase);
        s.group.position.y = s.laneY + hover * 0.32;
        s.group.rotation.z = hover * 0.08 * s.dir;

        // Vector thrusters articulate dynamically
        if (s.thrusters) {
          const tilt = Math.cos(elapsed * 3.2 + s.phase) * 0.18 + pulse * 0.2;
          s.thrusters.forEach(th => {
            th.rotation.x = tilt;
          });
        }

        if (s.trailMat) {
          s.trailMat.opacity = 0.75 + pulse * 0.25;
        }
      });

      // 5. BPM-Synced Lasers Sweep & Decay
      this.stage1Lasers.forEach(l => {
        l.mesh.rotation.z = l.baseRotZ + Math.sin(elapsed * 1.4 + l.phase) * 0.12;
        if (l.mat.opacity > l.baseOpacity) {
          l.mat.opacity *= Math.max(0, 1.0 - dt * 4.0);
        }
      });
    }




    // ==========================================================================
    // 1. SOBEL NORMAL MAP GENERATOR (Tangent-Space RGB from Height ImageData)
    // ==========================================================================
    createSobelNormalTexture(heightData, strength = 3.0) {
      const width = heightData.width;
      const height = heightData.height;
      const src = heightData.data;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const normalImg = ctx.createImageData(width, height);
      const dst = normalImg.data;

      const getH = (x, y) => {
        // Seamless horizontal wrapping (equirectangular longitude) & clamped latitude
        const px = (x + width) % width;
        const py = Math.max(0, Math.min(height - 1, y));
        return src[(py * width + px) * 4] / 255.0;
      };

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const tl = getH(x - 1, y - 1);
          const t  = getH(x,     y - 1);
          const tr = getH(x + 1, y - 1);
          const l  = getH(x - 1, y);
          const r  = getH(x + 1, y);
          const bl = getH(x - 1, y + 1);
          const b  = getH(x,     y + 1);
          const br = getH(x + 1, y + 1);

          const dX = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
          const dY = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);

          let nx = -dX * strength;
          let ny = -dY * strength;
          let nz = 1.0;

          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
          nx /= len;
          ny /= len;
          nz /= len;

          const idx = (y * width + x) * 4;
          dst[idx]     = Math.floor((nx * 0.5 + 0.5) * 255);
          dst[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
          dst[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
          dst[idx + 3] = 255;
        }
      }

      ctx.putImageData(normalImg, 0, 0);
      const normalTex = new THREE.CanvasTexture(canvas);
      normalTex.wrapS = THREE.RepeatWrapping;
      normalTex.wrapT = THREE.ClampToEdgeWrapping;
      if ('colorSpace' in normalTex) {
        normalTex.colorSpace = THREE.NoColorSpace;
      }
      return normalTex;
    }

    // ==========================================================================
    // 2. FRESNEL ATMOSPHERIC HALO SHADER (BPM-Reactive Rim Glow)
    // ==========================================================================
    createFresnelAtmosphereMaterial(colorHex = 0x00b4ff, power = 2.8, intensity = 1.15) {
      const vertexShader = `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `;

      const fragmentShader = `
        uniform vec3 uColor;
        uniform float uPower;
        uniform float uIntensity;
        uniform float uBeatPulse;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float viewDot = abs(dot(normal, viewDir));
          float fresnel = pow(clamp(1.0 - viewDot, 0.0, 1.0), uPower);
          float pulseBoost = 1.0 + uBeatPulse * 0.65;
          vec3 finalColor = uColor * (uIntensity * pulseBoost);
          gl_FragColor = vec4(finalColor, fresnel * (0.82 + uBeatPulse * 0.18));
        }
      `;

      return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(colorHex) },
          uPower: { value: power },
          uIntensity: { value: intensity },
          uBeatPulse: { value: 0.0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide
      });
    }

    // ==========================================================================
    // 3. PROCEDURAL EQUIRECTANGULAR PLANETARY PBR TEXTURE GENERATOR (Canvas 2D)
    // ==========================================================================
    generatePlanetPBRMaps(type, width = 512, height = 256) {
      const albedoCanvas = document.createElement('canvas');
      albedoCanvas.width = width;
      albedoCanvas.height = height;
      const ctxA = albedoCanvas.getContext('2d');

      const heightCanvas = document.createElement('canvas');
      heightCanvas.width = width;
      heightCanvas.height = height;
      const ctxH = heightCanvas.getContext('2d');

      const roughCanvas = document.createElement('canvas');
      roughCanvas.width = width;
      roughCanvas.height = height;
      const ctxR = roughCanvas.getContext('2d');

      const imgA = ctxA.createImageData(width, height);
      const imgH = ctxH.createImageData(width, height);
      const imgR = ctxR.createImageData(width, height);

      const dataA = imgA.data;
      const dataH = imgH.data;
      const dataR = imgR.data;

      // Fast deterministic 3D hash & FBM noise on unit sphere so longitude wraps seamlessly
      const hash3 = (x, y, z) => {
        let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) * 2.3283064365386963e-10;
      };

      const noise3D = (x, y, z) => {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        const fx = x - ix, fy = y - iy, fz = z - iz;
        const ux = fx * fx * (3.0 - 2.0 * fx);
        const uy = fy * fy * (3.0 - 2.0 * fy);
        const uz = fz * fz * (3.0 - 2.0 * fz);

        const n000 = hash3(ix, iy, iz);
        const n100 = hash3(ix + 1, iy, iz);
        const n010 = hash3(ix, iy + 1, iz);
        const n110 = hash3(ix + 1, iy + 1, iz);
        const n001 = hash3(ix, iy, iz + 1);
        const n101 = hash3(ix + 1, iy, iz + 1);
        const n011 = hash3(ix, iy + 1, iz + 1);
        const n111 = hash3(ix + 1, iy + 1, iz + 1);

        const nx00 = n000 + (n100 - n000) * ux;
        const nx10 = n010 + (n110 - n010) * ux;
        const nx01 = n001 + (n101 - n001) * ux;
        const nx11 = n011 + (n111 - n011) * ux;

        const nxy0 = nx00 + (nx10 - nx00) * uy;
        const nxy1 = nx01 + (nx11 - nx01) * uy;

        return nxy0 + (nxy1 - nxy0) * uz;
      };

      const fbm3 = (x, y, z, octaves = 4) => {
        let val = 0.0;
        let amp = 0.5;
        let freq = 1.0;
        for (let i = 0; i < octaves; i++) {
          val += noise3D(x * freq, y * freq, z * freq) * amp;
          freq *= 2.05;
          amp *= 0.5;
        }
        return val;
      };

      const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
      const smoothstep = (e0, e1, x) => {
        const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
        return t * t * (3.0 - 2.0 * t);
      };

      // Pre-generate crater centers for rocky bodies (Moon, Mercury, Mars)
      const craters = [];
      if (type === 'moon' || type === 'mercury' || type === 'mars') {
        const numCraters = type === 'mars' ? 28 : 55;
        for (let c = 0; c < numCraters; c++) {
          const cTheta = hash3(c, 1.1, 2.2) * Math.PI * 2;
          const cPhi = Math.acos(2.0 * hash3(c, 3.3, 4.4) - 1.0);
          craters.push({
            cx: Math.sin(cPhi) * Math.cos(cTheta),
            cy: Math.cos(cPhi),
            cz: Math.sin(cPhi) * Math.sin(cTheta),
            rad: 0.06 + Math.pow(hash3(c, 5.5, 6.6), 2.2) * 0.22,
            depth: 0.4 + hash3(c, 7.7, 8.8) * 0.6
          });
        }
      }

      let normalStrength = 2.5;

      for (let y = 0; y < height; y++) {
        const v = y / (height - 1);          // 0 (North Pole) -> 1 (South Pole)
        const phi = v * Math.PI;             // Latitude angle [0, PI]
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const lat = (0.5 - v) * 2.0;         // +1 North, 0 Equator, -1 South
        const absLat = Math.abs(lat);

        for (let x = 0; x < width; x++) {
          const u = x / width;               // [0, 1)
          const theta = u * Math.PI * 2.0;   // Longitude angle [0, 2PI)
          const sx = sinPhi * Math.cos(theta);
          const sy = cosPhi;
          const sz = sinPhi * Math.sin(theta);

          let r = 128, g = 128, b = 128;
          let hVal = 0.5;
          let roughVal = 0.7;

          if (type === 'jupiter') {
            normalStrength = 1.4;
            // Turbulent zonal wind bands + Kelvin-Helmholtz swirls
            const turb = fbm3(sx * 3.5, sy * 6.0, sz * 3.5, 4) * 0.14;
            const swirl = Math.sin(theta * 6.0 + fbm3(sx * 5.0, sy * 5.0, sz * 5.0, 3) * 5.0) * 0.025;
            const yCoord = lat + turb + swirl;

            // Zonal palette: cream, ochre, sienna, dark espresso brown
            const bandWave = Math.sin(yCoord * 22.0) * 0.5 + 0.5;
            const fineBand = Math.cos(yCoord * 52.0 + turb * 12.0) * 0.5 + 0.5;

            // Base colors
            let cr = lerp(115, 244, bandWave);
            let cg = lerp(62, 224, bandWave);
            let cb = lerp(38, 192, bandWave);

            // Warm ochre/sienna equatorial & tropical belts
            const eqBelt = smoothstep(0.35, 0.0, Math.abs(yCoord - 0.12)) + smoothstep(0.32, 0.0, Math.abs(yCoord + 0.22));
            cr = lerp(cr, 208, eqBelt * 0.65);
            cg = lerp(cg, 108, eqBelt * 0.65);
            cb = lerp(cb, 54, eqBelt * 0.65);

            // Fine darker brown streaks
            cr = lerp(cr, 88, fineBand * 0.25);
            cg = lerp(cg, 48, fineBand * 0.25);
            cb = lerp(cb, 30, fineBand * 0.25);

            // Great Red Spot (Gran Mancha Roja) at southern tropical latitude (v ~ 0.63, u ~ 0.52)
            let du = u - 0.52;
            if (du > 0.5) du -= 1.0;
            if (du < -0.5) du += 1.0;
            const dv = (v - 0.63) * 1.85;
            const grsDist = Math.sqrt((du * 5.5) * (du * 5.5) + (dv * 9.5) * (dv * 9.5));

            if (grsDist < 1.35) {
              const grsFactor = smoothstep(1.35, 0.15, grsDist);
              const vortexAngle = Math.atan2(dv, du) + (1.35 - grsDist) * 4.5;
              const vortexSpiral = Math.sin(vortexAngle * 3.0 + grsDist * 10.0) * 0.5 + 0.5;
              const spotR = lerp(185, 238, vortexSpiral);
              const spotG = lerp(42, 82, vortexSpiral);
              const spotB = lerp(24, 48, vortexSpiral);
              // Dark eye rim
              const rimDark = smoothstep(0.3, 0.9, grsDist) * smoothstep(1.3, 0.9, grsDist);
              cr = lerp(cr, spotR * (1.0 - rimDark * 0.25), grsFactor);
              cg = lerp(cg, spotG * (1.0 - rimDark * 0.35), grsFactor);
              cb = lerp(cb, spotB * (1.0 - rimDark * 0.35), grsFactor);
            }

            // White oval storms
            let du2 = (u - 0.22 + 1.0) % 1.0 - 0.5;
            const dv2 = v - 0.74;
            const ovalDist = Math.sqrt(du2 * du2 * 95.0 + dv2 * dv2 * 320.0);
            if (ovalDist < 1.0) {
              const ovalF = smoothstep(1.0, 0.1, ovalDist);
              cr = lerp(cr, 250, ovalF * 0.85);
              cg = lerp(cg, 244, ovalF * 0.85);
              cb = lerp(cb, 235, ovalF * 0.85);
            }

            r = cr; g = cg; b = cb;
            hVal = 0.45 + bandWave * 0.25 + fineBand * 0.15 + (grsDist < 1.2 ? (1.2 - grsDist) * 0.25 : 0);
            roughVal = 0.55;

          } else if (type === 'saturn') {
            normalStrength = 1.1;
            // Smooth golden/amber/butterscotch bands
            const turb = fbm3(sx * 2.5, sy * 8.0, sz * 2.5, 3) * 0.05;
            const yCoord = lat + turb;
            const band1 = Math.sin(yCoord * 28.0) * 0.5 + 0.5;
            const band2 = Math.cos(yCoord * 64.0) * 0.5 + 0.5;

            r = lerp(188, 245, band1 * 0.75 + band2 * 0.25);
            g = lerp(142, 214, band1 * 0.75 + band2 * 0.25);
            b = lerp(78, 152, band1 * 0.75 + band2 * 0.25);

            // Polar hexagonal warm bronze tint
            if (absLat > 0.78) {
              const polarF = smoothstep(0.78, 0.96, absLat);
              r = lerp(r, 145, polarF * 0.6);
              g = lerp(g, 112, polarF * 0.6);
              b = lerp(b, 75, polarF * 0.6);
            }
            hVal = 0.5 + band1 * 0.18 + band2 * 0.08;
            roughVal = 0.52;

          } else if (type === 'earth') {
            normalStrength = 3.6;
            // Continents via multi-octave FBM + tectonic warping
            const warpX = fbm3(sx * 2.2, sy * 2.2, sz * 2.2, 3) * 0.45;
            const warpY = fbm3(sx * 2.2 + 5.2, sy * 2.2 + 1.3, sz * 2.2 + 3.7, 3) * 0.45;
            const contNoise = fbm3(sx * 2.4 + warpX, sy * 2.4 + warpY, sz * 2.4, 5);
            const detailNoise = fbm3(sx * 9.0, sy * 9.0, sz * 9.0, 3);

            // Polar ice caps
            const iceCap = smoothstep(0.76, 0.88, absLat + (detailNoise - 0.5) * 0.12);

            const seaLevel = 0.505;
            if (iceCap > 0.5) {
              r = lerp(225, 250, iceCap);
              g = lerp(240, 253, iceCap);
              b = lerp(250, 255, iceCap);
              hVal = 0.55 + iceCap * 0.15;
              roughVal = 0.35;
            } else if (contNoise < seaLevel) {
              // Deep ocean to shallow turquoise shelf
              const shelf = smoothstep(seaLevel - 0.08, seaLevel, contNoise);
              r = lerp(6, 22, shelf);
              g = lerp(34, 138, shelf);
              b = lerp(78, 178, shelf);
              hVal = 0.15; // Flat water surface
              roughVal = 0.14; // Highly specular ocean!
            } else {
              // Landmass: coastal green -> lush forest -> arid ochre desert -> alpine mountains
              const elev = (contNoise - seaLevel) / (1.0 - seaLevel);
              const aridity = smoothstep(0.05, 0.42, Math.abs(lat) - 0.18) * (1.0 - smoothstep(0.42, 0.7, absLat));
              const humid = fbm3(sx * 4.5 + 9.1, sy * 4.5, sz * 4.5, 3);

              // Base vegetation green
              let lr = lerp(34, 78, detailNoise);
              let lg = lerp(98, 148, detailNoise);
              let lb = lerp(44, 62, detailNoise);

              // Desert / savannah ochre in subtropical belts
              const desertMask = Math.max(0, Math.min(1, (1.0 - humid * 1.2) + aridity * 0.55));
              lr = lerp(lr, 206, desertMask);
              lg = lerp(lg, 168, desertMask);
              lb = lerp(lb, 102, desertMask);

              // High mountain ranges & snow peaks
              if (elev > 0.42) {
                const mtnF = smoothstep(0.42, 0.75, elev);
                lr = lerp(lr, 118, mtnF);
                lg = lerp(lg, 104, mtnF);
                lb = lerp(lb, 94, mtnF);
                if (elev > 0.72) {
                  const snowF = smoothstep(0.72, 0.92, elev);
                  lr = lerp(lr, 248, snowF);
                  lg = lerp(lg, 250, snowF);
                  lb = lerp(lb, 255, snowF);
                }
              }

              r = lr; g = lg; b = lb;
              hVal = 0.25 + elev * 0.75 + detailNoise * 0.12;
              roughVal = 0.84;
            }

          } else if (type === 'earth_clouds') {
            normalStrength = 1.0;
            // Swirling trade winds & cyclone cloud bands
            const swirlX = fbm3(sx * 3.2, sy * 3.2, sz * 3.2, 4) * 0.65;
            const clouds = fbm3(sx * 4.2 + swirlX, sy * 6.5, sz * 4.2 - swirlX, 5);
            const alpha = smoothstep(0.47, 0.74, clouds);
            r = 250; g = 253; b = 255;
            const idx = (y * width + x) * 4;
            dataA[idx] = r;
            dataA[idx + 1] = g;
            dataA[idx + 2] = b;
            dataA[idx + 3] = Math.floor(alpha * 235);
            continue;

          } else if (type === 'moon' || type === 'mercury') {
            normalStrength = type === 'mercury' ? 4.8 : 4.2;
            const baseFbm = fbm3(sx * 3.5, sy * 3.5, sz * 3.5, 5);
            const micro = fbm3(sx * 14.0, sy * 14.0, sz * 14.0, 3);

            // Lunar Maria (dark basaltic plains)
            const maria = smoothstep(0.48, 0.34, baseFbm);
            let craterH = 0.0;
            let ejecta = 0.0;

            for (let c = 0; c < craters.length; c++) {
              const cr = craters[c];
              const dx = sx - cr.cx, dy = sy - cr.cy, dz = sz - cr.cz;
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (d < cr.rad * 1.45) {
                const normD = d / cr.rad;
                if (normD < 0.82) {
                  // Bowl depression
                  const bowl = (1.0 - (normD / 0.82) * (normD / 0.82));
                  craterH -= bowl * 0.35 * cr.depth;
                } else if (normD < 1.15) {
                  // Raised rim wall
                  const rim = Math.sin(((normD - 0.82) / 0.33) * Math.PI);
                  craterH += rim * 0.24 * cr.depth;
                  ejecta += rim * 0.35;
                } else {
                  // Ejecta blanket falloff
                  const ej = 1.0 - (normD - 1.15) / 0.3;
                  ejecta += ej * 0.15;
                }
              }
            }

            hVal = Math.max(0.05, Math.min(0.98, 0.5 + (baseFbm - 0.5) * 0.4 + micro * 0.15 + craterH));
            const shade = lerp(type === 'mercury' ? 142 : 168, type === 'mercury' ? 76 : 86, maria) + ejecta * 42 + (micro - 0.5) * 28;
            r = shade * (type === 'mercury' ? 1.02 : 0.98);
            g = shade * (type === 'mercury' ? 0.99 : 0.99);
            b = shade * (type === 'mercury' ? 0.95 : 1.03);
            roughVal = 0.92;

          } else if (type === 'mars') {
            normalStrength = 4.2;
            const continent = fbm3(sx * 2.6, sy * 2.6, sz * 2.6, 5);
            const detail = fbm3(sx * 10.0, sy * 10.0, sz * 10.0, 3);

            // Syrtis Major dark basaltic shield & rusty iron-oxide highlands
            const darkBasalt = smoothstep(0.46, 0.32, continent);
            let cr = lerp(218, 92, darkBasalt) + (detail - 0.5) * 35;
            let cg = lerp(96, 42, darkBasalt) + (detail - 0.5) * 22;
            let cb = lerp(42, 26, darkBasalt) + (detail - 0.5) * 15;

            // Olympus Mons caldera at (u ~ 0.38, v ~ 0.42)
            let du = Math.abs(u - 0.38);
            const dv = Math.abs(v - 0.42);
            const olympusDist = Math.sqrt(du * du * 36.0 + dv * dv * 36.0);
            let mtnH = 0.0;
            if (olympusDist < 1.0) {
              mtnH = (1.0 - olympusDist) * 0.42;
              if (olympusDist < 0.2) mtnH -= (0.2 - olympusDist) * 0.6; // Summit caldera
              cr += mtnH * 55;
              cg += mtnH * 30;
            }

            // Craters
            let craterH = 0.0;
            for (let c = 0; c < craters.length; c++) {
              const ct = craters[c];
              const dx = sx - ct.cx, dy = sy - ct.cy, dz = sz - ct.cz;
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (d < ct.rad) {
                const nd = d / ct.rad;
                craterH += (nd < 0.8 ? -(1.0 - nd) * 0.22 : 0.14);
              }
            }

            // Polar CO2 ice caps
            const polarCap = smoothstep(0.82, 0.91, absLat + (detail - 0.5) * 0.08);
            cr = lerp(cr, 248, polarCap);
            cg = lerp(cg, 242, polarCap);
            cb = lerp(cb, 238, polarCap);

            r = cr; g = cg; b = cb;
            hVal = Math.max(0.05, Math.min(0.98, 0.45 + (continent - 0.5) * 0.45 + detail * 0.15 + mtnH + craterH));
            roughVal = lerp(0.88, 0.4, polarCap);

          } else if (type === 'neptune') {
            normalStrength = 1.3;
            // Deep cobalt & ultramarine zonal flow + Great Dark Spot + white methane cirrus streaks
            const turb = fbm3(sx * 3.0, sy * 6.5, sz * 3.0, 4) * 0.09;
            const yCoord = lat + turb;
            const band = Math.sin(yCoord * 20.0) * 0.5 + 0.5;

            let cr = lerp(14, 38, band);
            let cg = lerp(52, 112, band);
            let cb = lerp(168, 242, band);

            // Great Dark Spot (Gran Mancha Oscura) at (u ~ 0.48, v ~ 0.6)
            const du = u - 0.48;
            const dv = (v - 0.60) * 1.7;
            const gdsDist = Math.sqrt((du * 6.5) * (du * 6.5) + (dv * 10.0) * (dv * 10.0));
            if (gdsDist < 1.0) {
              const gdsF = smoothstep(1.0, 0.2, gdsDist);
              cr = lerp(cr, 8, gdsF * 0.8);
              cg = lerp(cg, 22, gdsF * 0.8);
              cb = lerp(cb, 95, gdsF * 0.8);
            }

            // High-altitude bright white methane cirrus companion clouds
            const cirrusNoise = fbm3(sx * 8.5, sy * 22.0, sz * 8.5, 3);
            const cirrus = smoothstep(0.68, 0.82, cirrusNoise) * (1.0 - absLat * 0.6);
            cr = lerp(cr, 224, cirrus);
            cg = lerp(cg, 246, cirrus);
            cb = lerp(cb, 255, cirrus);

            r = cr; g = cg; b = cb;
            hVal = 0.5 + band * 0.15 + cirrus * 0.25;
            roughVal = 0.42;

          } else if (type === 'uranus') {
            normalStrength = 1.0;
            // Aquamarine / turquoise ice giant with subtle polar hood
            const band = Math.sin((lat + fbm3(sx * 2.5, sy * 5.0, sz * 2.5, 3) * 0.04) * 14.0) * 0.5 + 0.5;
            const polarHood = smoothstep(0.62, 0.92, absLat);
            r = lerp(lerp(76, 118, band), 168, polarHood * 0.45);
            g = lerp(lerp(196, 228, band), 242, polarHood * 0.45);
            b = lerp(lerp(218, 245, band), 252, polarHood * 0.45);
            hVal = 0.5 + band * 0.1;
            roughVal = 0.40;

          } else if (type === 'venus') {
            normalStrength = 1.8;
            // Dense sulfuric acid clouds with V-shaped chevron super-rotation waves in gold/cream
            const chevron = Math.cos(theta * 2.0 - Math.abs(lat) * 6.5 + fbm3(sx * 3.5, sy * 3.5, sz * 3.5, 4) * 3.5) * 0.5 + 0.5;
            const swirl = fbm3(sx * 5.0, sy * 8.0, sz * 5.0, 4);
            const mixVal = chevron * 0.55 + swirl * 0.45;

            r = lerp(184, 248, mixVal);
            g = lerp(124, 218, mixVal);
            b = lerp(46, 152, mixVal);
            hVal = 0.4 + mixVal * 0.35;
            roughVal = 0.58;
          }

          const idx = (y * width + x) * 4;
          dataA[idx]     = Math.max(0, Math.min(255, Math.floor(r)));
          dataA[idx + 1] = Math.max(0, Math.min(255, Math.floor(g)));
          dataA[idx + 2] = Math.max(0, Math.min(255, Math.floor(b)));
          dataA[idx + 3] = 255;

          const hByte = Math.max(0, Math.min(255, Math.floor(hVal * 255)));
          dataH[idx] = dataH[idx + 1] = dataH[idx + 2] = hByte;
          dataH[idx + 3] = 255;

          const rByte = Math.max(0, Math.min(255, Math.floor(roughVal * 255)));
          dataR[idx] = dataR[idx + 1] = dataR[idx + 2] = rByte;
          dataR[idx + 3] = 255;
        }
      }

      ctxA.putImageData(imgA, 0, 0);

      const albedoTex = new THREE.CanvasTexture(albedoCanvas);
      albedoTex.wrapS = THREE.RepeatWrapping;
      albedoTex.wrapT = THREE.ClampToEdgeWrapping;
      if ('colorSpace' in albedoTex) {
        albedoTex.colorSpace = THREE.SRGBColorSpace;
      } else if ('encoding' in albedoTex) {
        albedoTex.encoding = THREE.sRGBEncoding;
      }

      if (type === 'earth_clouds') {
        return { albedoTex, normalTex: null, roughTex: null };
      }

      ctxH.putImageData(imgH, 0, 0);
      ctxR.putImageData(imgR, 0, 0);

      const normalTex = this.createSobelNormalTexture(imgH, normalStrength);

      const roughTex = new THREE.CanvasTexture(roughCanvas);
      roughTex.wrapS = THREE.RepeatWrapping;
      roughTex.wrapT = THREE.ClampToEdgeWrapping;
      if ('colorSpace' in roughTex) {
        roughTex.colorSpace = THREE.NoColorSpace;
      }

      return { albedoTex, normalTex, roughTex };
    }

    // ==========================================================================
    // 4. ULTRA-ROUND RADIAL RING GEOMETRY & CASSINI/ENCKE TEXTURE GENERATOR
    // ==========================================================================
    createRadialRingGeometry(innerRadius, outerRadius, thetaSegments = 128, phiSegments = 8) {
      // Perfectly round 128-segment RingGeometry with radial UVs (u = normalized radius, v = angle)
      const geo = new THREE.RingGeometry(innerRadius, outerRadius, thetaSegments, phiSegments);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const v3 = new THREE.Vector3();

      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        const r = Math.sqrt(v3.x * v3.x + v3.y * v3.y);
        const u = (r - innerRadius) / Math.max(0.0001, outerRadius - innerRadius);
        const angle = (Math.atan2(v3.y, v3.x) + Math.PI) / (Math.PI * 2.0);
        uv.setXY(i, u, angle);
      }
      uv.needsUpdate = true;
      return geo;
    }

    generatePlanetRingTexture(type = 'saturn', width = 512, height = 64) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(width, height);
      const data = img.data;

      for (let x = 0; x < width; x++) {
        const u = x / (width - 1); // 0 = inner edge, 1 = outer edge
        let r = 220, g = 195, b = 150, alpha = 0.0;

        if (type === 'saturn') {
          // Fine harmonic ringlets
          const ringlets = Math.sin(u * 190.0) * 0.12 + Math.cos(u * 420.0) * 0.08 + Math.sin(u * 45.0) * 0.15;

          if (u > 0.03 && u < 0.22) {
            // C Ring (Crepe Ring - faint translucent inner ring)
            const t = (u - 0.03) / 0.19;
            r = 165; g = 145; b = 120;
            alpha = (0.18 + t * 0.25) * (0.85 + ringlets);
          } else if (u >= 0.22 && u < 0.61) {
            // B Ring (Brightest, densest golden-ivory main ring)
            const t = (u - 0.22) / 0.39;
            r = 235 + ringlets * 35;
            g = 205 + ringlets * 30;
            b = 158 + ringlets * 25;
            alpha = (0.78 + Math.sin(t * Math.PI) * 0.18) * (0.9 + ringlets * 0.4);
          } else if (u >= 0.61 && u < 0.675) {
            // Cassini Division (Prominent dark gap)
            const edgeFade = Math.min(Math.abs(u - 0.61), Math.abs(u - 0.675)) / 0.0325;
            r = 90; g = 80; b = 70;
            alpha = 0.05 * (1.0 - edgeFade * 0.85);
          } else if (u >= 0.675 && u < 0.94) {
            // A Ring (Warm champagne outer ring with Encke Gap at u ~ 0.865)
            const enckeDist = Math.abs(u - 0.865);
            if (enckeDist < 0.014) {
              // Encke Division
              alpha = 0.06;
            } else {
              r = 212 + ringlets * 28;
              g = 188 + ringlets * 24;
              b = 152 + ringlets * 20;
              alpha = 0.64 * (0.9 + ringlets * 0.35);
            }
          } else if (u >= 0.96 && u < 0.985) {
            // F Ring (Narrow braided outer ringlet)
            r = 240; g = 220; b = 185;
            alpha = 0.55;
          }
        } else if (type === 'uranus') {
          // Narrow icy cyan/silver rings (6, 5, 4, Alpha, Beta, Eta, Gamma, Delta, Epsilon)
          const ringPeaks = [0.15, 0.28, 0.42, 0.58, 0.72, 0.91];
          for (let p = 0; p < ringPeaks.length; p++) {
            const d = Math.abs(u - ringPeaks[p]);
            const w = p === 5 ? 0.045 : 0.022;
            if (d < w) {
              alpha = Math.max(alpha, (1.0 - d / w) * (p === 5 ? 0.75 : 0.42));
            }
          }
          r = 160; g = 235; b = 250;
        }

        const aByte = Math.max(0, Math.min(255, Math.floor(alpha * 255)));
        for (let y = 0; y < height; y++) {
          const azim = 0.94 + 0.06 * Math.sin((y / height) * Math.PI * 4.0);
          const idx = (y * width + x) * 4;
          data[idx]     = Math.max(0, Math.min(255, Math.floor(r * azim)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.floor(g * azim)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.floor(b * azim)));
          data[idx + 3] = aByte;
        }
      }

      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      if ('colorSpace' in tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
      } else if ('encoding' in tex) {
        tex.encoding = THREE.sRGBEncoding;
      }
      return tex;
    }

    // ==========================================================================
    // 5. STAGE 2 BUILDER: NEBULOSA CÓSMICA & SISTEMA SOLAR COMPLETO
    // ==========================================================================
    buildStage2Cosmic() {
      this.stage2Group = new THREE.Group();
      this.worldGroup.add(this.stage2Group);

      // Dedicated Solar System Lighting inside stage2Group so planetary PBR normals & oceans shine
      this.stage2SolarLight = new THREE.PointLight(0xfff5e4, 2.6, 160, 1.2);
      this.stage2SolarLight.position.set(0, 6.0, 18.0);
      this.stage2Group.add(this.stage2SolarLight);

      this.stage2RimLight = new THREE.DirectionalLight(0x7dd3fc, 1.25);
      this.stage2RimLight.position.set(-22, 14, -10);
      this.stage2Group.add(this.stage2RimLight);

      // ------------------------------------------------------------------------
      // 1. Swirling 3D Spiral Galaxy Particles (1800 stars)
      // ------------------------------------------------------------------------
      const starCount = 1800;
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(starCount * 3);
      const starColors = new Float32Array(starCount * 3);
      this.starOrbitData = [];

      for (let s = 0; s < starCount; s++) {
        const armIndex = s % 2;
        const dist = 3.5 + Math.pow(Math.random(), 0.7) * 42;
        const angle = dist * 0.28 + armIndex * Math.PI + (Math.random() - 0.5) * 0.6;
        const y = (Math.random() - 0.5) * (14.0 / (dist * 0.15 + 1.0));

        const sx = Math.cos(angle) * dist;
        const sz = Math.sin(angle) * dist;

        const s3 = s * 3;
        starPos[s3] = sx;
        starPos[s3 + 1] = y;
        starPos[s3 + 2] = sz;

        const c = new THREE.Color(0x00f0ff);
        const rVal = Math.random();
        if (rVal < 0.35) c.setHex(0xb388ff);
        else if (rVal < 0.65) c.setHex(0xffd700);
        else if (rVal < 0.85) c.setHex(0xffffff);

        starColors[s3] = c.r;
        starColors[s3 + 1] = c.g;
        starColors[s3 + 2] = c.b;

        this.starOrbitData.push({
          radius: dist,
          angle: angle,
          speed: (1.2 / Math.sqrt(dist)) * 0.3,
          y: y
        });
      }

      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

      const starMat = new THREE.PointsMaterial({
        size: 0.6,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      this.stage2GalaxyPoints = new THREE.Points(starGeo, starMat);
      this.stage2GalaxyPoints.position.copy(this.blackHolePos);
      this.stage2GalaxyPoints.rotation.x = 0.55;
      this.stage2Group.add(this.stage2GalaxyPoints);

      // ------------------------------------------------------------------------
      // 2. Supermassive Black Hole Singularity & Gravitational Lensing (Ultra-Round)
      // ------------------------------------------------------------------------
      const bhGroup = new THREE.Group();
      bhGroup.position.copy(this.blackHolePos);

      // Event Horizon: Ultra-round 128x96 pitch-black sphere
      const sphereGeo = new THREE.SphereGeometry(3.6, 128, 96);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const singularityMesh = new THREE.Mesh(sphereGeo, sphereMat);
      bhGroup.add(singularityMesh);

      // Photon Sphere Fresnel Rim on Event Horizon (96x64)
      const photonRimGeo = new THREE.SphereGeometry(3.72, 96, 64);
      const photonRimMat = this.createFresnelAtmosphereMaterial(0x00f0ff, 3.5, 1.6);
      const photonRimMesh = new THREE.Mesh(photonRimGeo, photonRimMat);
      bhGroup.add(photonRimMesh);

      // Gravitational Lensing Einstein Ring Billboard Halo
      const einsteinGeo = new THREE.PlaneGeometry(28, 28);
      const einsteinVert = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;
      const einsteinFrag = `
        uniform float uTime;
        uniform float uBeatPulse;
        varying vec2 vUv;
        void main() {
          vec2 pos = vUv - 0.5;
          float r = length(pos) * 2.0;

          // Einstein ring at photon sphere boundary r ~ 0.52
          float ring = exp(-pow((r - 0.52) / 0.045, 2.0)) * 1.9;
          float halo = pow(0.52 / max(0.01, r), 3.2) * 0.12;

          vec3 ringColor = mix(vec3(0.0, 0.95, 1.0), vec3(1.0, 0.72, 0.2), clamp((r - 0.48) * 5.0, 0.0, 1.0));
          float edgeFade = smoothstep(0.95, 0.62, r);
          float alpha = (ring + halo) * edgeFade * (0.85 + uBeatPulse * 0.45);

          gl_FragColor = vec4(ringColor * (1.2 + uBeatPulse * 0.4), alpha);
        }
      `;

      this.stage2EinsteinMat = new THREE.ShaderMaterial({
        vertexShader: einsteinVert,
        fragmentShader: einsteinFrag,
        uniforms: {
          uTime: { value: 0.0 },
          uBeatPulse: { value: 0.0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const einsteinMesh = new THREE.Mesh(einsteinGeo, this.stage2EinsteinMat);
      einsteinMesh.position.set(0, 0, -0.2);
      bhGroup.add(einsteinMesh);

      // Accretion Disk (Ultra-round 160-segment RingGeometry with Relativistic Doppler Beaming)
      const diskGeo = new THREE.RingGeometry(4.0, 14.5, 160, 8);
      const diskVert = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;

      const diskFrag = `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uBeatPulse;

        void main() {
          vec2 pos = vUv - 0.5;
          float dist = length(pos) * 2.0;
          float angle = atan(pos.y, pos.x);

          float spiral = sin(angle * 4.0 - dist * 12.0 + uTime * 3.5);
          float intensity = smoothstep(0.28, 0.45, dist) * smoothstep(1.0, 0.55, dist);

          float doppler = sin(angle + 0.3) * 0.5 + 0.5;
          vec3 blueShift = vec3(0.0, 0.9, 1.0) * 1.8;
          vec3 redShift = vec3(1.0, 0.25, 0.05) * 0.7;
          vec3 plasma = mix(redShift, blueShift, doppler);

          float innerCore = smoothstep(0.38, 0.30, dist) * 2.5;
          plasma += vec3(innerCore);

          plasma *= (0.7 + 0.3 * spiral) + uBeatPulse * 0.4;
          gl_FragColor = vec4(plasma, intensity * 0.9);
        }
      `;

      this.stage2AccretionMat = new THREE.ShaderMaterial({
        vertexShader: diskVert,
        fragmentShader: diskFrag,
        uniforms: {
          uTime: { value: 0.0 },
          uBeatPulse: { value: 0.0 }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const accretionMesh = new THREE.Mesh(diskGeo, this.stage2AccretionMat);
      accretionMesh.rotation.x = 1.15;
      accretionMesh.rotation.y = 0.25;
      bhGroup.add(accretionMesh);

      // Twin Polar Relativistic Plasma Jets (Smooth 32-segment cylinders)
      const jetGeo = new THREE.CylinderGeometry(0.25, 2.2, 28, 32, 1, true);
      const jetMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const northJet = new THREE.Mesh(jetGeo, jetMat);
      northJet.position.set(0, 15.0, 0);
      bhGroup.add(northJet);

      const southJet = new THREE.Mesh(jetGeo, jetMat);
      southJet.position.set(0, -15.0, 0);
      southJet.rotation.x = Math.PI;
      bhGroup.add(southJet);

      this.stage2Group.add(bhGroup);
      this.stage2BlackHole = bhGroup;

      // ------------------------------------------------------------------------
      // 3. Giant 3D Celestial Armillary Sphere / Astral Gyroscope (Ultra-Round Torus 32x160)
      // ------------------------------------------------------------------------
      this.stage2GyroRings = [];
      const gyroRadii = [22.0, 17.5, 13.5];
      const gyroColors = [0xb388ff, 0x00f5d4, 0xffd700];

      gyroRadii.forEach((rad, gIdx) => {
        const ringGeo = new THREE.TorusGeometry(rad, 0.20 - gIdx * 0.03, 32, 160);
        const ringMat = new THREE.MeshStandardMaterial({
          color: gyroColors[gIdx],
          emissive: gyroColors[gIdx],
          emissiveIntensity: 0.75,
          roughness: 0.2,
          metalness: 0.95
        });
        const rMesh = new THREE.Mesh(ringGeo, ringMat);
        rMesh.position.set(0, 0.5, -18.0);

        // 12 Ultra-round glowing star nodes around ring
        const nodeGeo = new THREE.SphereGeometry(0.32, 32, 24);
        const nodeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let s = 0; s < 12; s++) {
          const sAngle = (s / 12) * Math.PI * 2;
          const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
          nodeMesh.position.set(Math.cos(sAngle) * rad, Math.sin(sAngle) * rad, 0);
          rMesh.add(nodeMesh);
        }

        this.stage2Group.add(rMesh);
        this.stage2GyroRings.push({
          mesh: rMesh,
          speedX: (gIdx === 0 ? 0.16 : 0.08) * (gIdx % 2 === 0 ? 1 : -1),
          speedY: (gIdx === 1 ? 0.22 : 0.10) * (gIdx % 2 === 0 ? -1 : 1),
          speedZ: (gIdx === 2 ? 0.26 : 0.07)
        });
      });

      // ------------------------------------------------------------------------
      // 4. SOLAR SYSTEM PLANETS (96x64 & 128x96 Spheres + Canvas 2D Sobel PBR + Fresnel)
      // Framed in 3D space around the board (X in ±10..±28, Z in -14..-34)
      // ------------------------------------------------------------------------
      this.stage2Planets = [];
      this.stage2AtmosphereMats = [photonRimMat];

      const planetConfigs = [
        {
          name: 'jupiter',
          radius: 3.25,
          segments: [128, 96],
          texSize: [320, 160],
          basePos: new THREE.Vector3(-17.8, 5.4, -24.0),
          orbitAmp: new THREE.Vector3(1.6, 0.9, 1.8),
          orbitSpeed: 0.22,
          orbitPhase: 0.0,
          rotSpeed: 0.38,
          tilt: new THREE.Vector3(0.18, 0.0, 0.06),
          atmoColor: 0xffb76b,
          atmoPower: 3.0,
          atmoIntensity: 0.85,
          normalScale: 0.85,
          moons: [
            { name: 'io', radius: 0.28, dist: 4.4, speed: 1.45, phase: 0.4, color: 0xffd13b, emissive: 0xff7700 },
            { name: 'europa', radius: 0.25, dist: 5.3, speed: 0.95, phase: 2.5, color: 0xb8f2ff, emissive: 0x38bdf8 }
          ]
        },
        {
          name: 'saturn',
          radius: 2.75,
          segments: [128, 96],
          texSize: [320, 160],
          basePos: new THREE.Vector3(18.2, 4.8, -25.0),
          orbitAmp: new THREE.Vector3(1.5, 0.85, 1.6),
          orbitSpeed: 0.18,
          orbitPhase: 1.4,
          rotSpeed: 0.34,
          tilt: new THREE.Vector3(0.46, 0.0, -0.32), // Iconic 26.7° tilt showcasing Cassini/Encke rings
          atmoColor: 0xffe099,
          atmoPower: 2.9,
          atmoIntensity: 0.9,
          normalScale: 0.7,
          hasSaturnRings: true,
          moons: [
            { name: 'titan', radius: 0.38, dist: 8.2, speed: 0.72, phase: 1.1, color: 0xf59e0b, emissive: 0xd97706 },
            { name: 'enceladus', radius: 0.22, dist: 4.1, speed: 1.65, phase: 3.8, color: 0xf0f9ff, emissive: 0x7dd3fc }
          ]
        },
        {
          name: 'earth',
          radius: 2.05,
          segments: [128, 96],
          texSize: [320, 160],
          basePos: new THREE.Vector3(-11.8, -3.8, -15.5),
          orbitAmp: new THREE.Vector3(1.1, 0.7, 1.2),
          orbitSpeed: 0.28,
          orbitPhase: 2.2,
          rotSpeed: 0.26,
          tilt: new THREE.Vector3(0.22, 0.0, 0.41), // 23.4° axial tilt
          atmoColor: 0x00b4ff,
          atmoPower: 2.5,
          atmoIntensity: 1.35,
          normalScale: 1.45,
          hasClouds: true,
          hasLunarMoon: true
        },
        {
          name: 'mars',
          radius: 1.35,
          segments: [96, 64],
          texSize: [320, 160],
          basePos: new THREE.Vector3(0.0, -4.5, -5.0),
          orbitAmp: new THREE.Vector3(12.5, 1.8, 10.8),
          orbitSpeed: 0.38,
          orbitPhase: 3.6,
          rotSpeed: 0.25,
          tilt: new THREE.Vector3(0.25, 0.0, -0.38),
          atmoColor: 0xff5a26,
          atmoPower: 3.2,
          atmoIntensity: 0.75,
          normalScale: 1.65
        },
        {
          name: 'uranus',
          radius: 2.1,
          segments: [96, 64],
          texSize: [320, 160],
          basePos: new THREE.Vector3(-15.2, -7.8, -22.5),
          orbitAmp: new THREE.Vector3(1.4, 0.9, 1.5),
          orbitSpeed: 0.16,
          orbitPhase: 4.5,
          rotSpeed: -0.30,
          tilt: new THREE.Vector3(0.15, 0.0, 1.52), // ~98° vertical axial tilt!
          atmoColor: 0x5ce1e6,
          atmoPower: 2.7,
          atmoIntensity: 1.05,
          normalScale: 0.65,
          hasUranusRings: true
        },
        {
          name: 'neptune',
          radius: 2.15,
          segments: [96, 64],
          texSize: [320, 160],
          basePos: new THREE.Vector3(24.5, -8.0, -30.5),
          orbitAmp: new THREE.Vector3(1.4, 0.9, 1.5),
          orbitSpeed: 0.15,
          orbitPhase: 5.4,
          rotSpeed: 0.32,
          tilt: new THREE.Vector3(0.32, 0.0, -0.42),
          atmoColor: 0x2563eb,
          atmoPower: 2.5,
          atmoIntensity: 1.35,
          normalScale: 0.85
        },
        {
          name: 'venus',
          radius: 1.60,
          segments: [96, 64],
          texSize: [320, 160],
          basePos: new THREE.Vector3(11.8, 9.2, -20.0),
          orbitAmp: new THREE.Vector3(0.95, 0.6, 1.0),
          orbitSpeed: 0.35,
          orbitPhase: 0.9,
          rotSpeed: -0.14, // Retrograde rotation
          tilt: new THREE.Vector3(0.08, 0.0, 0.05),
          atmoColor: 0xfbbf24,
          atmoPower: 2.4,
          atmoIntensity: 1.15,
          normalScale: 0.95
        },
        {
          name: 'mercury',
          radius: 1.08,
          segments: [96, 64],
          texSize: [320, 160],
          basePos: new THREE.Vector3(-10.8, 9.5, -19.0),
          orbitAmp: new THREE.Vector3(0.85, 0.55, 0.95),
          orbitSpeed: 0.42,
          orbitPhase: 2.9,
          rotSpeed: 0.12,
          tilt: new THREE.Vector3(0.05, 0.0, 0.02),
          atmoColor: 0x94a3b8,
          atmoPower: 3.6,
          atmoIntensity: 0.65,
          normalScale: 1.85
        }
      ];

      planetConfigs.forEach(cfg => {
        const orbitGroup = new THREE.Group();
        orbitGroup.position.copy(cfg.basePos);

        // Tilted axial frame for planet + rings + moons
        const tiltGroup = new THREE.Group();
        tiltGroup.rotation.set(cfg.tilt.x, cfg.tilt.y, cfg.tilt.z);
        orbitGroup.add(tiltGroup);

        // Generate Equirectangular Albedo + Sobel Normal Map + Roughness Map
        const maps = this.generatePlanetPBRMaps(cfg.name, cfg.texSize[0], cfg.texSize[1]);

        // Ultra-Round Planetary Sphere (96x64 or 128x96)
        const planetGeo = new THREE.SphereGeometry(cfg.radius, cfg.segments[0], cfg.segments[1]);
        const planetMat = new THREE.MeshStandardMaterial({
          map: maps.albedoTex,
          normalMap: maps.normalTex,
          normalScale: new THREE.Vector2(cfg.normalScale, cfg.normalScale),
          roughnessMap: maps.roughTex,
          roughness: 1.0,
          metalness: 0.04,
          emissiveMap: maps.albedoTex,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0.24 // Preserves vivid planetary colors on shadow side
        });

        const planetMesh = new THREE.Mesh(planetGeo, planetMat);
        tiltGroup.add(planetMesh);

        // Fresnel Atmospheric Halo Sphere (96x64)
        const atmoGeo = new THREE.SphereGeometry(cfg.radius * 1.06, 96, 64);
        const atmoMat = this.createFresnelAtmosphereMaterial(cfg.atmoColor, cfg.atmoPower, cfg.atmoIntensity);
        const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
        tiltGroup.add(atmoMesh);
        this.stage2AtmosphereMats.push(atmoMat);

        // Earth Independent Swirling Cloud Sphere (radius * 1.02, 96x64)
        let cloudMesh = null;
        if (cfg.hasClouds) {
          const cloudMaps = this.generatePlanetPBRMaps('earth_clouds', 320, 160);
          const cloudGeo = new THREE.SphereGeometry(cfg.radius * 1.02, 96, 64);
          const cloudMat = new THREE.MeshStandardMaterial({
            map: cloudMaps.albedoTex,
            transparent: true,
            opacity: 0.88,
            roughness: 0.9,
            metalness: 0.0,
            emissive: new THREE.Color(0xdbeafe),
            emissiveIntensity: 0.18,
            depthWrite: false
          });
          cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
          tiltGroup.add(cloudMesh);
        }

        // Earth's Moon (La Luna) with Crater Sobel Normal Map
        const moonEntries = [];
        if (cfg.hasLunarMoon) {
          const moonPivot = new THREE.Group();
          const moonMaps = this.generatePlanetPBRMaps('moon', 192, 96);
          const moonGeo = new THREE.SphereGeometry(0.54, 64, 48);
          const moonMat = new THREE.MeshStandardMaterial({
            map: moonMaps.albedoTex,
            normalMap: moonMaps.normalTex,
            normalScale: new THREE.Vector2(1.75, 1.75),
            roughnessMap: moonMaps.roughTex,
            roughness: 1.0,
            metalness: 0.05,
            emissiveMap: moonMaps.albedoTex,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 0.22
          });
          const moonMesh = new THREE.Mesh(moonGeo, moonMat);
          const moonDist = 3.65;
          moonMesh.position.set(moonDist, 0.25, 0);
          moonPivot.add(moonMesh);

          // Subtle ultra-round lunar orbital ring path (TorusGeometry 32x160)
          const moonOrbitGeo = new THREE.TorusGeometry(moonDist, 0.015, 16, 160);
          const moonOrbitMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.22,
            blending: THREE.AdditiveBlending
          });
          const moonOrbitRing = new THREE.Mesh(moonOrbitGeo, moonOrbitMat);
          moonOrbitRing.rotation.x = Math.PI * 0.5;
          tiltGroup.add(moonOrbitRing);

          tiltGroup.add(moonPivot);
          moonEntries.push({ pivot: moonPivot, mesh: moonMesh, speed: 0.85, angle: 0.8 });
        }

        // Saturn's Concentric Ring System (128-segment Radial RingGeometry + Cassini & Encke Divisions)
        if (cfg.hasSaturnRings) {
          const satRingGeo = this.createRadialRingGeometry(3.45, 7.25, 128, 8);
          const satRingTex = this.generatePlanetRingTexture('saturn', 512, 64);
          const satRingMat = new THREE.MeshStandardMaterial({
            map: satRingTex,
            transparent: true,
            side: THREE.DoubleSide,
            roughness: 0.65,
            metalness: 0.1,
            emissiveMap: satRingTex,
            emissive: new THREE.Color(0xffe4b5),
            emissiveIntensity: 0.32,
            depthWrite: false
          });
          const satRingMesh = new THREE.Mesh(satRingGeo, satRingMat);
          satRingMesh.rotation.x = Math.PI * 0.5;
          tiltGroup.add(satRingMesh);

          // Ultra-round Golden Torus accent on outer ring boundary (32x160)
          const cassiniTorusGeo = new THREE.TorusGeometry(5.82, 0.025, 32, 160);
          const cassiniTorusMat = new THREE.MeshBasicMaterial({
            color: 0xffd700,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending
          });
          const cassiniTorus = new THREE.Mesh(cassiniTorusGeo, cassiniTorusMat);
          cassiniTorus.rotation.x = Math.PI * 0.5;
          tiltGroup.add(cassiniTorus);
        }

        // Uranus's Vertical Tilted Ring System (128-segment Radial RingGeometry + Epsilon Torus 32x160)
        if (cfg.hasUranusRings) {
          const uraRingGeo = this.createRadialRingGeometry(2.65, 3.85, 128, 8);
          const uraRingTex = this.generatePlanetRingTexture('uranus', 256, 32);
          const uraRingMat = new THREE.MeshStandardMaterial({
            map: uraRingTex,
            transparent: true,
            side: THREE.DoubleSide,
            roughness: 0.5,
            metalness: 0.2,
            emissive: new THREE.Color(0x67e8f9),
            emissiveIntensity: 0.35,
            depthWrite: false
          });
          const uraRingMesh = new THREE.Mesh(uraRingGeo, uraRingMat);
          uraRingMesh.rotation.x = Math.PI * 0.5;
          tiltGroup.add(uraRingMesh);

          const epsTorusGeo = new THREE.TorusGeometry(3.72, 0.028, 32, 160);
          const epsTorusMat = new THREE.MeshBasicMaterial({
            color: 0x67e8f9,
            transparent: true,
            opacity: 0.52,
            blending: THREE.AdditiveBlending
          });
          const epsTorus = new THREE.Mesh(epsTorusGeo, epsTorusMat);
          epsTorus.rotation.x = Math.PI * 0.5;
          tiltGroup.add(epsTorus);
        }

        // Additional Planetary Moons (Io, Europa, Titan, Enceladus)
        if (cfg.moons && cfg.moons.length) {
          cfg.moons.forEach(mCfg => {
            const mPivot = new THREE.Group();
            mPivot.rotation.y = mCfg.phase;
            const mGeo = new THREE.SphereGeometry(mCfg.radius, 64, 48);
            const mMat = new THREE.MeshStandardMaterial({
              color: mCfg.color,
              emissive: mCfg.emissive,
              emissiveIntensity: 0.45,
              roughness: 0.6,
              metalness: 0.1
            });
            const mMesh = new THREE.Mesh(mGeo, mMat);
            mMesh.position.set(mCfg.dist, 0, 0);
            mPivot.add(mMesh);
            tiltGroup.add(mPivot);
            moonEntries.push({ pivot: mPivot, mesh: mMesh, speed: mCfg.speed, angle: mCfg.phase });
          });
        }

        this.stage2Group.add(orbitGroup);
        this.stage2Planets.push({
          name: cfg.name,
          orbitGroup,
          tiltGroup,
          planetMesh,
          planetMat,
          cloudMesh,
          atmoMat,
          basePos: cfg.basePos,
          orbitAmp: cfg.orbitAmp,
          orbitSpeed: cfg.orbitSpeed,
          orbitPhase: cfg.orbitPhase,
          rotSpeed: cfg.rotSpeed,
          moons: moonEntries
        });
      });

      // ------------------------------------------------------------------------
      // 5. High-Geometry Cratered Rocky Asteroid Belt (PBR Normal Mapped)
      // ------------------------------------------------------------------------
      this.stage2Asteroids = [];
      const numAsteroids = 12;
      const astMaps = this.generatePlanetPBRMaps('mercury', 192, 96);

      for (let a = 0; a < numAsteroids; a++) {
        const aGroup = new THREE.Group();
        const aRadius = 0.38 + (a % 3) * 0.14;
        const aGeo = new THREE.IcosahedronGeometry(aRadius, 4);
        const aPos = aGeo.attributes.position;
        for (let i = 0; i < aPos.count; i++) {
          const vx = aPos.getX(i), vy = aPos.getY(i), vz = aPos.getZ(i);
          const def = 1.0 + 0.16 * Math.sin(vx * 3.5 + a) * Math.cos(vy * 3.2 - a);
          aPos.setXYZ(i, vx * def * 1.25, vy * def * 0.78, vz * def * 0.92);
        }
        aGeo.computeVertexNormals();

        const aMat = new THREE.MeshStandardMaterial({
          map: astMaps.albedoTex,
          normalMap: astMaps.normalTex,
          normalScale: new THREE.Vector2(1.8, 1.8),
          roughnessMap: astMaps.roughTex,
          roughness: 0.88,
          metalness: 0.18
        });
        const aMesh = new THREE.Mesh(aGeo, aMat);
        aGroup.add(aMesh);

        const orbitDist = 15.0 + (a % 4) * 2.5;
        const orbitAngle = (a / numAsteroids) * Math.PI * 2;
        const ax = Math.cos(orbitAngle) * orbitDist;
        const ay = ((a % 5) - 2) * 2.2;
        const az = -24.0 + Math.sin(orbitAngle) * orbitDist * 0.45;
        aGroup.position.set(ax, ay, az);

        this.stage2Group.add(aGroup);
        this.stage2Asteroids.push({
          group: aGroup,
          rotX: (Math.random() - 0.5) * 0.8,
          rotY: (Math.random() - 0.5) * 0.8,
          rotZ: (Math.random() - 0.5) * 0.8,
          orbitDist,
          orbitAngle,
          orbitSpeed: 0.14 + (a % 4) * 0.04,
          baseY: ay
        });
      }
    }

    updateStage2Cosmic(dt, elapsed) {
      if (!this.stage2Group || !this.stage2Group.visible) return;

      if (this.stage2AccretionMat) {
        this.stage2AccretionMat.uniforms.uTime.value = elapsed;
        this.stage2AccretionMat.uniforms.uBeatPulse.value = this.beatPulseValue;
      }
      if (this.stage2EinsteinMat) {
        this.stage2EinsteinMat.uniforms.uTime.value = elapsed;
        this.stage2EinsteinMat.uniforms.uBeatPulse.value = this.beatPulseValue;
      }

      // Update BPM-reactive Fresnel atmospheric halos
      if (this.stage2AtmosphereMats && this.stage2AtmosphereMats.length) {
        for (let i = 0; i < this.stage2AtmosphereMats.length; i++) {
          this.stage2AtmosphereMats[i].uniforms.uBeatPulse.value = this.beatPulseValue;
        }
      }

      // Update Solar System Planets: Axial Rotation, Cloud Rotation, Moon Orbits & Gentle 3D Orbital Drift
      if (this.stage2Planets && this.stage2Planets.length) {
        for (let i = 0; i < this.stage2Planets.length; i++) {
          const p = this.stage2Planets[i];

          // Axial rotation of planet surface
          p.planetMesh.rotation.y += p.rotSpeed * dt;

          // Independent atmospheric cloud rotation on Earth
          if (p.cloudMesh) {
            p.cloudMesh.rotation.y += (p.rotSpeed * 1.45) * dt;
            p.cloudMesh.rotation.z = Math.sin(elapsed * 0.25) * 0.04;
          }

          // Subtle emissive pulse on BPM
          if (p.planetMat) {
            p.planetMat.emissiveIntensity = 0.24 + this.beatPulseValue * 0.14;
          }

          // Smooth 3D orbital translation around framed anchor coordinates
          const t = elapsed * p.orbitSpeed + p.orbitPhase;
          p.orbitGroup.position.set(
            p.basePos.x + Math.cos(t) * p.orbitAmp.x,
            p.basePos.y + Math.sin(t * 0.85) * p.orbitAmp.y,
            p.basePos.z + Math.sin(t) * p.orbitAmp.z
          );

          // Orbiting Moons (Earth's Moon, Io, Europa, Titan, Enceladus)
          if (p.moons && p.moons.length) {
            for (let m = 0; m < p.moons.length; m++) {
              const moon = p.moons[m];
              moon.angle += moon.speed * dt;
              moon.pivot.rotation.y = moon.angle;
              moon.mesh.rotation.y += 0.5 * dt;
            }
          }
        }
      }

      // Armillary Gyroscope Concentric Rings
      if (this.stage2GyroRings) {
        this.stage2GyroRings.forEach(r => {
          r.mesh.rotation.x += r.speedX * dt;
          r.mesh.rotation.y += r.speedY * dt;
          r.mesh.rotation.z += r.speedZ * dt;
        });
      }

      // Floating Crystalline Asteroids
      if (this.stage2Asteroids) {
        this.stage2Asteroids.forEach((a, aIdx) => {
          a.orbitAngle += a.orbitSpeed * dt * (aIdx < 5 ? 0.65 : 0.35);
          const isFgAst = (aIdx < 5);
          a.group.position.x = Math.cos(a.orbitAngle) * (isFgAst ? 12.5 : a.orbitDist);
          a.group.position.z = (isFgAst ? -4.5 : -24.0) + Math.sin(a.orbitAngle) * (isFgAst ? 11.5 : a.orbitDist * 0.55); // Sweeps up to Z = +7.0 in front of the board!
          a.group.position.y = a.baseY + Math.sin(elapsed * 1.2 + a.orbitAngle) * 0.8;
          a.group.rotation.x += a.rotX * dt;
          a.group.rotation.y += a.rotY * dt;
          a.group.rotation.z += a.rotZ * dt;
        });
      }

      // Stars orbit in logarithmic spiral arms
      if (this.stage2GalaxyPoints && this.starOrbitData) {
        const starPos = this.stage2GalaxyPoints.geometry.attributes.position;
        for (let s = 0; s < this.starOrbitData.length; s++) {
          const o = this.starOrbitData[s];
          o.angle += o.speed * dt;
          const sx = Math.cos(o.angle) * o.radius;
          const sz = Math.sin(o.angle) * o.radius;
          const s3 = s * 3;
          starPos.array[s3] = sx;
          starPos.array[s3 + 1] = o.y;
          starPos.array[s3 + 2] = sz;
        }
        starPos.needsUpdate = true;
      }
    }


    // ========================================================================
    // STAGE TRANSITION MANAGER
    // ========================================================================
    setStage(stageIndex, immediate = false) {
      if (stageIndex < 0 || stageIndex >= STAGE_THEMES.length) return;
      this.targetStage = stageIndex;
      if (immediate) {
        this.currentStage = stageIndex;
        this.stageTransitionProgress = 1.0;
        this.applyStageVisuals(stageIndex);
      } else {
        this.stageTransitionProgress = 0.0;
        if (this.cameraSweepEnabled) {
          this.triggerCinematicCameraSweep('stageUp');
        }
      }
    }

    applyStageVisuals(stageIndex) {
      const theme = STAGE_THEMES[stageIndex];

      // Update fog & clear color
      this.scene.background.setHex(theme.bg);
      this.scene.fog.color.setHex(theme.fog);
      this.scene.fog.density = theme.fogDensity;

      // Update lights
      this.ambientLight.color.setHex(theme.ambient);
      this.directionalLight.color.setHex(theme.directional);

      // Update frame rails & corners
      this.frameMaterial.color.setHex(theme.frameColor);
      this.frameMaterial.emissive.setHex(theme.frameColor);
      if (this.cornerMaterial) {
        this.cornerMaterial.emissive.setHex(theme.frameColor);
      }
      if (this.notchMat) {
        this.notchMat.color.setHex(theme.frameColor);
      }
      if (this.pedestalEdges) {
        this.pedestalEdges.material.color.setHex(theme.frameColor);
      }

      // Update backboard shader uniforms
      if (this.backboardMaterial) {
        this.backboardMaterial.uniforms.uStage.value = stageIndex;
        this.backboardMaterial.uniforms.uGridColor.value.set(...theme.gridColor);
      }

      // Group visibilities
      this.stage0Group.visible = stageIndex === 0;
      this.stage1Group.visible = stageIndex === 1;
      this.stage2Group.visible = stageIndex === 2;
    }

    // ========================================================================
    // BOARD & PIECE RENDERING (updateBoardState)
    // ========================================================================
    updateBoardState(grid, activePiece, ghostPiece, zoneRows = []) {
      if (!this.boardBlocksMesh) return;

      // 1. Update Locked Board Blocks (InstancedMesh)
      let instanceIdx = 0;

      if (grid && Array.isArray(grid)) {
        for (let r = 0; r < 20; r++) {
          const row = grid[r];
          if (!row) continue;
          const isZoneRow = zoneRows.includes(r);

          for (let c = 0; c < 10; c++) {
            const cell = row[c];
            if (!cell) continue;

            const bx = c - 4.5;
            const by = 9.5 - r;

            this.tempMatrix.makeTranslation(bx, by, 0);
            this.boardBlocksMesh.setMatrixAt(instanceIdx, this.tempMatrix);
            this.boardEdgesMesh.setMatrixAt(instanceIdx, this.tempMatrix);

            let colHex = cell.color || (typeof cell === 'string' ? cell : TETRIS_COLORS[cell.type] || TETRIS_COLORS.DEFAULT);
            if (isZoneRow || cell.zoneLocked) {
              colHex = '#ffd700';
            }
            this.tempColor.set(colHex);
            this.boardBlocksMesh.setColorAt(instanceIdx, this.tempColor);

            instanceIdx++;
            if (instanceIdx >= 200) break;
          }
          if (instanceIdx >= 200) break;
        }
      }

      this.boardBlocksMesh.count = instanceIdx;
      this.boardEdgesMesh.count = instanceIdx;
      this.boardBlocksMesh.instanceMatrix.needsUpdate = true;
      this.boardEdgesMesh.instanceMatrix.needsUpdate = true;
      if (this.boardBlocksMesh.instanceColor) {
        this.boardBlocksMesh.instanceColor.needsUpdate = true;
      }

      // Compute active piece bounding columns for drop laser corridor & floor pads
      let minCol = 10, maxCol = -1;
      let activeWorldY = 0;
      let pRows = 3, pCols = 3;

      // 2. Update Active Piece (Dedicated 4 blocks with centered squash & stretch juice)
      if (activePiece && activePiece.matrix) {
        let bIdx = 0;
        const pMat = activePiece.matrix;
        const pColor = activePiece.color || TETRIS_COLORS[activePiece.type] || TETRIS_COLORS.DEFAULT;
        this.tempColor.set(pColor);

        pCols = pMat[0] ? pMat[0].length : 3;
        pRows = pMat.length;

        const pieceCenterX = activePiece.x + pCols * 0.5 - 5.0;
        const pieceCenterY = 10.0 - (activePiece.y + pRows * 0.5);
        activeWorldY = pieceCenterY;

        this.activePieceGroup.position.set(pieceCenterX, pieceCenterY, 0);
        this.pieceOffsetX = pieceCenterX * 0.08;

        for (let r = 0; r < pRows; r++) {
          for (let c = 0; c < pCols; c++) {
            if (pMat[r][c] && bIdx < 4) {
              const globalCol = activePiece.x + c;
              if (globalCol < minCol) minCol = globalCol;
              if (globalCol > maxCol) maxCol = globalCol;

              const mesh = this.activeBlocks[bIdx];
              const relX = c - pCols * 0.5 + 0.5;
              const relY = pRows * 0.5 - 0.5 - r;

              mesh.position.set(relX, relY, 0);
              this.activeBlockMaterials[bIdx].color.copy(this.tempColor);
              this.activeBlockMaterials[bIdx].emissive.copy(this.tempColor);
              mesh.visible = true;
              bIdx++;
            }
          }
        }
        for (let i = bIdx; i < 4; i++) {
          this.activeBlocks[i].visible = false;
        }
      } else {
        for (let i = 0; i < 4; i++) {
          this.activeBlocks[i].visible = false;
        }
      }

      // 3. Update Ghost Piece (Holographic wireframe + landing plates)
      let ghostWorldY = activeWorldY;
      if (ghostPiece && ghostPiece.matrix) {
        let gIdx = 0;
        const gMat = ghostPiece.matrix;
        const gColor = ghostPiece.color || TETRIS_COLORS[ghostPiece.type] || TETRIS_COLORS.DEFAULT;
        this.tempColor.set(gColor);

        const gCols = gMat[0] ? gMat[0].length : 3;
        const gRows = gMat.length;
        const ghostCenterX = ghostPiece.x + gCols * 0.5 - 5.0;
        const ghostCenterY = 10.0 - (ghostPiece.y + gRows * 0.5);
        ghostWorldY = ghostCenterY;
        this.ghostPieceGroup.position.set(ghostCenterX, ghostCenterY, 0);

        for (let r = 0; r < gRows; r++) {
          for (let c = 0; c < gCols; c++) {
            if (gMat[r][c] && gIdx < 4) {
              const mesh = this.ghostBlocks[gIdx];
              const relX = c - gCols * 0.5 + 0.5;
              const relY = gRows * 0.5 - 0.5 - r;

              mesh.position.set(relX, relY, 0);
              this.ghostMaterials[gIdx].color.copy(this.tempColor);
              this.ghostMaterials[gIdx].emissive.copy(this.tempColor);

              // Update landing plates
              const plates = this.ghostPlates[gIdx];
              if (plates) {
                plates.top.color.copy(this.tempColor);
                plates.bot.color.copy(this.tempColor);
                plates.edge.color.copy(this.tempColor);
              }

              mesh.visible = true;
              gIdx++;
            }
          }
        }
        for (let i = gIdx; i < 4; i++) {
          this.ghostBlocks[i].visible = false;
        }
      } else {
        for (let i = 0; i < 4; i++) {
          this.ghostBlocks[i].visible = false;
        }
      }

      // 4. Update Drop Guide Laser Corridor & Drop Filaments
      if (activePiece && activePiece.matrix && ghostPiece && ghostPiece.matrix && maxCol >= 0) {
        let minActiveRow = 20, maxGhostRow = 0;
        for (let r = 0; r < activePiece.matrix.length; r++) {
          for (let c = 0; c < activePiece.matrix[r].length; c++) {
            if (activePiece.matrix[r][c]) {
              if (activePiece.y + r < minActiveRow) minActiveRow = activePiece.y + r;
              if (ghostPiece.y + r > maxGhostRow) maxGhostRow = ghostPiece.y + r;
            }
          }
        }
        const topY = 10.0 - minActiveRow;
        const botY = 9.0 - maxGhostRow;
        const laserH = Math.max(0.1, topY - botY);
        const midY = (topY + botY) * 0.5;

        // Left Boundary Laser Beam
        const leftX = minCol - 5.0;
        this.dropGuideLeftBeam.position.set(leftX, midY, 0.0);
        this.dropGuideLeftBeam.scale.set(1.0, laserH, 1.0);
        this.dropGuideLeftMat.color.copy(this.tempColor);
        this.dropGuideLeftBeam.visible = true;

        // Right Boundary Laser Beam
        const rightX = maxCol + 1.0 - 5.0;
        this.dropGuideRightBeam.position.set(rightX, midY, 0.0);
        this.dropGuideRightBeam.scale.set(1.0, laserH, 1.0);
        this.dropGuideRightMat.color.copy(this.tempColor);
        this.dropGuideRightBeam.visible = true;

        // 4 Vertical Drop Filaments
        let fIdx = 0;
        for (let r = 0; r < activePiece.matrix.length; r++) {
          for (let c = 0; c < activePiece.matrix[r].length; c++) {
            if (activePiece.matrix[r][c] && fIdx < 4) {
              const fx = activePiece.x + c - 4.5;
              const fStartY = 9.5 - (activePiece.y + r) - 0.45;
              const fEndY = 9.5 - (ghostPiece.y + r) + 0.45;

              if (fStartY > fEndY + 0.05) {
                const fH = fStartY - fEndY;
                const fMidY = (fStartY + fEndY) * 0.5;
                const fMesh = this.dropFilaments[fIdx];
                fMesh.position.set(fx, fMidY, 0.0);
                fMesh.scale.set(0.65, fH, 0.65);
                this.dropFilamentMats[fIdx].color.copy(this.tempColor);
                fMesh.visible = true;
              } else {
                this.dropFilaments[fIdx].visible = false;
              }
              fIdx++;
            }
          }
        }
        for (let i = fIdx; i < 4; i++) {
          this.dropFilaments[i].visible = false;
        }

        // Update Backboard Corridor Uniforms
        if (this.backboardMaterial) {
          this.backboardMaterial.uniforms.uActiveColMin.value = minCol;
          this.backboardMaterial.uniforms.uActiveColMax.value = maxCol + 1;
        }
      } else {
        if (this.dropGuideLeftBeam) this.dropGuideLeftBeam.visible = false;
        if (this.dropGuideRightBeam) this.dropGuideRightBeam.visible = false;
        this.dropFilaments.forEach(f => { f.visible = false; });
        if (this.backboardMaterial) {
          this.backboardMaterial.uniforms.uActiveColMin.value = -1.0;
          this.backboardMaterial.uniforms.uActiveColMax.value = -1.0;
        }
      }

      // 5. Update Floor Pedestal Landing Pad Tiles
      for (let c = 0; c < 10; c++) {
        const isColActive = (c >= minCol && c <= maxCol);
        const padMat = this.landingPadMaterials[c];
        if (padMat) {
          if (isColActive && activePiece) {
            padMat.color.copy(this.tempColor);
            padMat.emissive.copy(this.tempColor);
            padMat.emissiveIntensity = 2.0;
          } else {
            padMat.color.setHex(STAGE_THEMES[this.currentStage].frameColor);
            padMat.emissive.setHex(STAGE_THEMES[this.currentStage].frameColor);
            padMat.emissiveIntensity = 0.15 + this.beatPulseValue * 0.25;
          }
        }
      }
    }

    // ========================================================================
    // CASCADE DEFORMATION & JUICE TRIGGERS
    // ========================================================================
    triggerRotateJuice(piece, dir = 1) {
      this.activeSquash.set(1.28, 0.76, 1.22);

      if (piece && piece.matrix) {
        const rgb = hexToRgb(piece.color || TETRIS_COLORS[piece.type] || TETRIS_COLORS.DEFAULT);
        for (let r = 0; r < piece.matrix.length; r++) {
          for (let c = 0; c < piece.matrix[r].length; c++) {
            if (piece.matrix[r][c]) {
              const wx = piece.x + c - 4.5;
              const wy = 9.5 - (piece.y + r);
              for (let k = 0; k < 6; k++) {
                const ang = (k / 6) * Math.PI * 2;
                this.particlePool.spawn(
                  wx, wy, 0.2,
                  Math.cos(ang) * 2.5 * dir, Math.sin(ang) * 2.5, (Math.random() - 0.5) * 1.5,
                  rgb[0], rgb[1], rgb[2],
                  0.75, 0.45, 0.92
                );
              }
            }
          }
        }
      }
    }

    triggerMoveTrail(piece, dir = 1) {
      this.activeLeanTarget = dir * 0.12;

      if (piece && piece.matrix) {
        const rgb = hexToRgb(piece.color || TETRIS_COLORS[piece.type] || TETRIS_COLORS.DEFAULT);
        for (let r = 0; r < piece.matrix.length; r++) {
          for (let c = 0; c < piece.matrix[r].length; c++) {
            if (piece.matrix[r][c]) {
              const wx = piece.x + c - 4.5;
              const wy = 9.5 - (piece.y + r);
              this.particlePool.spawn(
                wx - dir * 0.4, wy, 0.0,
                -dir * 1.2, 0, 0,
                rgb[0], rgb[1], rgb[2],
                0.55, 0.28, 0.88
              );
            }
          }
        }
      }
    }

    triggerHardDropTrail(piece, fromY, toY, onBeat = false) {
      if (piece && piece.matrix) {
        let minC = 10, maxC = -1, minR = 10, maxR = -1;
        for (let r = 0; r < piece.matrix.length; r++) {
          for (let c = 0; c < piece.matrix[r].length; c++) {
            if (piece.matrix[r][c]) {
              if (c < minC) minC = c;
              if (c > maxC) maxC = c;
              if (r < minR) minR = r;
              if (r > maxR) maxR = r;
            }
          }
        }
        const pieceWidth = Math.max(1, maxC - minC + 1);
        const centerX = piece.x + (minC + maxC + 1) * 0.5 - 5.0;
        const startY = 10.0 - (fromY + minR);
        const endY = 9.0 - (toY + maxR);
        const height = Math.abs(startY - endY) + 1.0;
        const midY = (startY + endY) * 0.5;

        this.dropCurtainMesh.scale.set(pieceWidth * 1.1, height, 1.0);
        this.dropCurtainMesh.position.set(centerX, midY, -0.2);

        const col = hexToRgb(piece.color || TETRIS_COLORS[piece.type] || TETRIS_COLORS.DEFAULT);
        this.dropCurtainMat.uniforms.uColor.value.set(col[0], col[1], col[2]);
        this.dropCurtainMat.uniforms.uAlpha.value = 1.0;
        this.dropCurtainMesh.visible = true;

        // Physical recoil clamped
        const dropDist = Math.max(1, Math.abs(toY - fromY));
        const recoilImpulse = Math.min(18.0, 8.0 + dropDist * 0.8);
        this.recoil.velY -= recoilImpulse;
        this.recoil.velRotX += 0.18;

        const impactCol = piece.x + pieceWidth * 0.5;
        const impactRow = toY + piece.matrix.length * 0.5;
        const isHeavy = piece.type === 'I' || piece.type === 'O';
        const shockIntensity = (isHeavy ? 2.0 : 1.3) * (onBeat ? 1.5 : 1.0);
        this.triggerShockwave(impactCol, impactRow, shockIntensity);

        for (let i = 0; i < 28; i++) {
          const ang = Math.PI * 0.15 + Math.random() * Math.PI * 0.7;
          const spd = 4.0 + Math.random() * 8.0;
          this.particlePool.spawn(
            centerX + (Math.random() - 0.5) * pieceWidth, endY - 0.5, 0.2,
            Math.cos(ang) * spd, Math.sin(ang) * spd, (Math.random() - 0.5) * 3.0,
            col[0], col[1], col[2],
            0.8, 0.55, 0.94
          );
        }

        if (this.currentStage === 0) {
          for (let b = 0; b < 12; b++) {
            this.particlePool.spawn(
              centerX + (Math.random() - 0.5) * pieceWidth, endY, 0.1,
              (Math.random() - 0.5) * 2.0, 3.0 + Math.random() * 4.0, (Math.random() - 0.5) * 2.0,
              0.4, 0.9, 1.0,
              0.9, 1.2, 0.96
            );
          }
        }
      }
    }

    triggerShockwave(gridCol, gridRow, intensity = 1.0) {
      const uvX = Math.max(0.0, Math.min(1.0, gridCol / 10.0));
      const uvY = Math.max(0.0, Math.min(1.0, 1.0 - gridRow / 20.0));

      this.shockwaveState.center.set(uvX, uvY);
      this.shockwaveState.time = 0.0;
      this.shockwaveState.intensity = intensity;

      if (this.backboardMaterial) {
        this.backboardMaterial.uniforms.uShockCenter.value.copy(this.shockwaveState.center);
        this.backboardMaterial.uniforms.uShockTime.value = 0.0;
        this.backboardMaterial.uniforms.uShockIntensity.value = intensity;
      }
    }

    // ========================================================================
    // PARTICLE SYSTEMS & GAMEPLAY EVENTS
    // ========================================================================
    triggerLineClearEffect(rowIndices, lineCount, isTSpin = false, combo = 0) {
      if (!Array.isArray(rowIndices) || rowIndices.length === 0) return;

      const isTetris = lineCount >= 4;
      const isCosmic = this.currentStage === 2;

      let totalShards = 45;
      if (lineCount === 2 || lineCount === 3) totalShards = 110;
      if (isTetris || isTSpin) totalShards = 280;

      const shardsPerRow = Math.ceil(totalShards / rowIndices.length);

      rowIndices.forEach(row => {
        const wy = 9.5 - row;

        const beamGeo = new THREE.PlaneGeometry(12, 0.65);
        const beamMat = new THREE.MeshBasicMaterial({
          color: isTetris ? 0xffea00 : (isTSpin ? 0xff00d4 : 0x00f0ff),
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending
        });
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.set(0, wy, 0.3);
        this.boardGroup.add(beamMesh);

        let beamLife = 0.28;
        const beamInterval = () => {
          beamLife -= 0.035;
          beamMesh.scale.x += 0.2;
          beamMat.opacity = Math.max(0, beamLife / 0.28);
          if (beamLife <= 0) {
            this.boardGroup.remove(beamMesh);
            beamGeo.dispose();
            beamMat.dispose();
          } else {
            requestAnimationFrame(beamInterval);
          }
        };
        requestAnimationFrame(beamInterval);

        for (let i = 0; i < shardsPerRow; i++) {
          const wx = -4.5 + Math.random() * 9.0;
          const ang = Math.random() * Math.PI * 2;
          const spd = 4.0 + Math.random() * (isTetris ? 16.0 : 9.0);
          const vz = (Math.random() - 0.35) * (isTetris ? 15.0 : 8.0);

          let r = 0, g = 0.9, b = 1;
          if (isTetris) {
            r = 1.0; g = 0.85 + Math.random() * 0.15; b = 0.1;
          } else if (isTSpin) {
            r = 0.9; g = 0.1; b = 1.0;
          }

          this.particlePool.spawn(
            wx, wy, 0.1,
            Math.cos(ang) * spd, Math.sin(ang) * spd, vz,
            r, g, b,
            0.9 + Math.random() * 0.7,
            isCosmic ? 2.5 : 1.2,
            0.96,
            isCosmic ? this.blackHolePos : null
          );
        }
      });

      if ((isTetris || isTSpin || combo >= 4) && this.cameraSweepEnabled) {
        this.triggerCinematicCameraSweep('tetris');
      }

      if (isTetris || isTSpin) {
        this.recoil.velY -= 16.0;
        this.triggerShockwave(5.0, rowIndices[0], 2.4);
      }
    }

    triggerComboAura(piece, comboCount, isTSpin = false) {
      if ((comboCount < 2 && !isTSpin) || !piece || !piece.matrix) return;

      const rgb = isTSpin
        ? [1.0, 0.1, 0.9]
        : (comboCount >= 6 ? [1.0, 0.85, 0.1] : [0.1, 0.9, 1.0]);

      for (let r = 0; r < piece.matrix.length; r++) {
        for (let c = 0; c < piece.matrix[r].length; c++) {
          if (piece.matrix[r][c]) {
            const wx = piece.x + c - 4.5;
            const wy = 9.5 - (piece.y + r);

            const count = Math.min(8, comboCount * 2);
            for (let k = 0; k < count; k++) {
              const ang = Math.random() * Math.PI * 2;
              this.particlePool.spawn(
                wx + Math.cos(ang) * 0.6, wy + Math.sin(ang) * 0.6, 0.2,
                -Math.sin(ang) * 3.0, Math.cos(ang) * 3.0, (Math.random() - 0.5) * 1.5,
                rgb[0], rgb[1], rgb[2],
                0.75, 0.45, 0.92
              );
            }
          }
        }
      }
    }

    triggerBeatPulse(beatIndex = 0, intensity = 1.0, isPlayerSync = false) {
      this.beatPulseValue = intensity;

      if (this.stage1Lasers && this.stage1Lasers.length) {
        this.stage1Lasers.forEach(l => {
          l.mat.opacity = 0.95 * intensity;
        });
      }

      if (isPlayerSync) {
        this.resonanceRingState.radius = 0.5;
        this.resonanceRingState.opacity = 1.0;
        this.resonanceRingMesh.position.set(0, 0, -0.4);
        this.resonanceRingMesh.scale.set(1, 1, 1);
        this.resonanceRingMesh.visible = true;

        const pulseColor = (this.currentStage === 1) ? 0xff00a0 : 0x00f0ff;
        this.resonanceRingMat.color.setHex(pulseColor);
      }
    }

    // ========================================================================
    // CINEMATIC CAMERA SWEEP
    // ========================================================================
    triggerCinematicCameraSweep(reason = 'tetris') {
      if (!this.cameraSweepEnabled || this.cameraSweep.active) return;
      this.cameraSweep.active = true;
      this.cameraSweep.time = 0.0;
      this.cameraSweep.duration = (reason === 'stageUp') ? 1.8 : 1.35;
      this.cameraSweep.startAngle = 0.0;
      this.cameraSweep.targetAngle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.42);
    }

    // ========================================================================
    // ZONE MODE VISUALS
    // ========================================================================
    setZoneVisuals(active, progress0to1 = 0.0) {
      this.zoneActive = active;
      this.zoneProgress = Math.max(0.0, Math.min(1.0, progress0to1));
      this.timeScale = active ? 0.12 : 1.0;

      const zoneCol = active ? 0xffd700 : STAGE_THEMES[this.currentStage].frameColor;
      this.frameMaterial.color.setHex(zoneCol);
      this.frameMaterial.emissive.setHex(zoneCol);
      this.frameMaterial.emissiveIntensity = active ? 1.5 : 0.85;
      if (this.cornerMaterial) {
        this.cornerMaterial.emissive.setHex(zoneCol);
      }

      if (this.backboardMaterial) {
        this.backboardMaterial.uniforms.uZoneMode.value = active ? 1.0 : 0.0;
      }
    }

    triggerZoneExplosion(linesCleared = 0) {
      this.setZoneVisuals(false, 0.0);
      this.recoil.velY -= 20.0;

      const count = Math.min(450, 280 + linesCleared * 25);
      for (let i = 0; i < count; i++) {
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.acos(2.0 * Math.random() - 1.0);
        const spd = 6.0 + Math.random() * 22.0;

        const vx = Math.sin(theta) * Math.cos(phi) * spd;
        const vy = Math.sin(theta) * Math.sin(phi) * spd;
        const vz = Math.cos(theta) * spd;

        this.particlePool.spawn(
          (Math.random() - 0.5) * 8.0, (Math.random() - 0.5) * 16.0, 0.0,
          vx, vy, vz,
          1.0, 0.88 + Math.random() * 0.12, 0.25,
          1.1 + Math.random() * 0.8,
          2.0,
          0.97
        );
      }

      this.triggerShockwave(5.0, 10.0, 3.0);
      if (this.cameraSweepEnabled) {
        this.triggerCinematicCameraSweep('zoneEnd');
      }
    }

    // ========================================================================
    // INPUT & WINDOW EVENT LISTENERS
    // ========================================================================
    onWindowResize() {
      if (!this.container || !this.camera || !this.renderer) return;
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      this.updateCameraFraming(width, height);
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    }

    onPointerMove(e) {
      const halfW = window.innerWidth * 0.5;
      const halfH = window.innerHeight * 0.5;
      this.mouseTarget.x = (e.clientX - halfW) / halfW;
      this.mouseTarget.y = (e.clientY - halfH) / halfH;
    }

    // ========================================================================
    // MAIN ANIMATION & RENDER LOOP
    // ========================================================================
    animate(timestamp) {
      if (this.isDestroyed) return;
      requestAnimationFrame(this.animate);

      const rawDt = Math.min(0.1, this.clock.getDelta());
      const dt = rawDt * this.timeScale;
      const elapsed = this.clock.getElapsedTime();

      // 1. Update Board Shockwave Uniforms
      if (this.shockwaveState.intensity > 0.001) {
        this.shockwaveState.time += rawDt;
        this.shockwaveState.intensity *= Math.max(0, 1.0 - rawDt * 1.8);
        if (this.backboardMaterial) {
          this.backboardMaterial.uniforms.uShockTime.value = this.shockwaveState.time;
          this.backboardMaterial.uniforms.uShockIntensity.value = this.shockwaveState.intensity;
        }
      }

      // 2. Update Beat Pulse Decay & Dynamic Lights
      if (this.beatPulseValue > 0.001) {
        this.beatPulseValue *= Math.max(0, 1.0 - rawDt * 5.5);
      }
      if (this.backboardMaterial) {
        this.backboardMaterial.uniforms.uTime.value = elapsed;
        this.backboardMaterial.uniforms.uBeatPulse.value = this.beatPulseValue;
      }
      if (this.frameMaterial) {
        this.frameMaterial.emissiveIntensity = (this.zoneActive ? 1.5 : 0.85) + this.beatPulseValue * 0.7;
      }
      if (this.boardSpotLight) {
        this.boardSpotLight.intensity = 2.5 + this.beatPulseValue * 1.8;
      }

      // Update Sub-Woofer Speakers & Equalizer Strip
      if (this.subwooferCones && this.subwooferCones.length) {
        const pulse = this.beatPulseValue;
        this.subwooferCones.forEach(sw => {
          sw.cone.scale.set(1.0 + pulse * 0.16, 1.0 + pulse * 0.16, 1.0 + pulse * 0.28);
          sw.cap.position.z = 0.06 + pulse * 0.08;
          sw.cap.material.emissiveIntensity = 0.7 + pulse * 1.5;
        });
      }

      if (this.eqBars && this.eqBars.length) {
        const pulse = this.beatPulseValue;
        this.eqBars.forEach(b => {
          const wave = Math.sin(elapsed * 6.0 + b.col * 0.75) * 0.35 + 0.5;
          const barH = Math.max(0.12, wave * 0.45 + pulse * (0.8 + 0.35 * Math.sin(b.col * 1.2)));
          b.mesh.scale.y = barH;
          b.mesh.position.y = -10.9 + (barH - 1.0) * 0.26;
        });
      }

      // 3. Update Drop Light Curtain Fade
      if (this.dropCurtainMat && this.dropCurtainMat.uniforms.uAlpha.value > 0.001) {
        this.dropCurtainMat.uniforms.uAlpha.value *= Math.max(0, 1.0 - rawDt * 7.0);
        if (this.dropCurtainMat.uniforms.uAlpha.value <= 0.01) {
          this.dropCurtainMesh.visible = false;
        }
      }

      // 4. Update Expanding Resonance Ring
      if (this.resonanceRingState.opacity > 0.01) {
        this.resonanceRingState.radius += rawDt * 28.0;
        this.resonanceRingState.opacity *= Math.max(0, 1.0 - rawDt * 3.8);
        const sc = this.resonanceRingState.radius;
        this.resonanceRingMesh.scale.set(sc, sc, 1.0);
        this.resonanceRingMat.opacity = this.resonanceRingState.opacity;
        if (this.resonanceRingState.opacity <= 0.01) {
          this.resonanceRingMesh.visible = false;
        }
      }

      // 5. Board Spring-Damper Physics Recoil (Clamped so floor is never pushed off-screen)
      const accelY = -this.recoil.k * this.recoil.y - this.recoil.damping * this.recoil.velY;
      this.recoil.velY += accelY * rawDt;
      this.recoil.y += this.recoil.velY * rawDt;
      this.recoil.y = Math.max(-0.6, Math.min(0.6, this.recoil.y));
      this.boardGroup.position.y = this.recoil.y;

      const accelRot = -this.recoil.k * this.recoil.rotX - this.recoil.damping * this.recoil.velRotX;
      this.recoil.velRotX += accelRot * rawDt;
      this.recoil.rotX += this.recoil.velRotX * rawDt;
      this.boardGroup.rotation.x = this.recoil.rotX;

      // 6. Active Piece Squash & Stretch Spring
      this.activeSquash.x += (1.0 - this.activeSquash.x) * rawDt * 14.0;
      this.activeSquash.y += (1.0 - this.activeSquash.y) * rawDt * 14.0;
      this.activeSquash.z += (1.0 - this.activeSquash.z) * rawDt * 14.0;
      this.activePieceGroup.scale.copy(this.activeSquash);

      this.activeLeanTarget += (0.0 - this.activeLeanTarget) * rawDt * 10.0;
      this.activeLean += (this.activeLeanTarget - this.activeLean) * rawDt * 16.0;
      this.activePieceGroup.rotation.z = this.activeLean;

      // 7. Update Active Journey Environments
      this.updateEnvironments(dt, elapsed);

      // 8. Update High-Performance Particle Pool
      this.particlePool.update(dt, this.blackHolePos, this.currentStage === 2);

      // 9. Camera Orbit / Sweep / Parallax
      this.updateCamera(rawDt);

      // 10. Render Frame
      this.renderer.render(this.scene, this.camera);
    }

    // ========================================================================
    // ENVIRONMENT ANIMATIONS (Water, Rays, Skyline, Monoliths, Gyroscope)
    // ========================================================================
    updateEnvironments(dt, elapsed) {
      // Stage 0: Atardecer en la Alhambra de Granada
      if (this.stage0Group && this.stage0Group.visible) {
        this.updateStage0Alhambra(dt, elapsed);
      }

      // Stage 1: Synthwave Outrun & High-Geometry Cyberpunk Metropolis
      if (this.stage1Group && this.stage1Group.visible) {
        this.updateStage1Synthwave(dt, elapsed);
      }

      // Stage 2: Cosmic Black Hole, Solar System Planets & Armillary Gyroscope
      if (this.stage2Group && this.stage2Group.visible) {
        this.updateStage2Cosmic(dt, elapsed);
      }

      // Smooth Stage Cross-Fade
      if (this.stageTransitionProgress < 1.0) {
        this.stageTransitionProgress += dt * 0.85;
        if (this.stageTransitionProgress >= 1.0) {
          this.stageTransitionProgress = 1.0;
          this.currentStage = this.targetStage;
          this.applyStageVisuals(this.currentStage);
        }
      }
    }

    // ========================================================================
    // CINEMATIC CAMERA & PARALLAX
    // ========================================================================
    updateCamera(dt) {
      // 1. Mouse & Active Piece Parallax (Reduced to eliminate column grid shift)
      this.mouseLerp.x += (this.mouseTarget.x - this.mouseLerp.x) * dt * 4.0;
      this.mouseLerp.y += (this.mouseTarget.y - this.mouseLerp.y) * dt * 4.0;

      const parallaxX = this.mouseLerp.x * 0.25 + this.pieceOffsetX * 0.2;
      const parallaxY = -this.mouseLerp.y * 0.25;

      // 2. Cinematic Camera Sweep (Orbit on Tetris / Stage Up)
      if (this.cameraSweep.active) {
        this.cameraSweep.time += dt;
        const sweepProgress = Math.min(1.0, this.cameraSweep.time / this.cameraSweep.duration);
        const sweepAngle = Math.sin(sweepProgress * Math.PI) * this.cameraSweep.targetAngle;

        const radius = this.baseCameraPos.z;
        this.camera.position.x = Math.sin(sweepAngle) * radius + parallaxX;
        this.camera.position.z = Math.cos(sweepAngle) * radius;
        this.camera.position.y = this.baseCameraPos.y + parallaxY + Math.sin(sweepProgress * Math.PI) * 2.2;
        this.camera.lookAt(0, 0.2, 0);

        if (sweepProgress >= 1.0) {
          this.cameraSweep.active = false;
        }
      } else {
        // Normal frontal view with stable framing looking at (0, 0.2, 0)
        this.camera.position.x += (this.baseCameraPos.x + parallaxX - this.camera.position.x) * dt * 5.0;
        this.camera.position.y += (this.baseCameraPos.y + parallaxY - this.camera.position.y) * dt * 5.0;
        this.camera.position.z += (this.baseCameraPos.z - this.camera.position.z) * dt * 5.0;
        this.camera.lookAt(0, 0.2, 0);
      }
    }

    // ========================================================================
    // CLEANUP & DISPOSAL
    // ========================================================================
    destroy() {
      this.isDestroyed = true;
      window.removeEventListener('resize', this.onWindowResize);
      window.removeEventListener('pointermove', this.onPointerMove);
      if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }

  // Expose globally
  window.SynesthesiaVisuals3D = SynesthesiaVisuals3D;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SynesthesiaVisuals3D;
  }
})();
