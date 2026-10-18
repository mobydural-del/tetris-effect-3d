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
      name: 'Abismo Bioluminiscente',
      bg: 0x020814,
      fog: 0x020a16,
      fogDensity: 0.020,
      ambient: 0x072238,
      directional: 0x00d4ff,
      frameColor: 0x00e5ff,
      gridColor: [0.08, 0.45, 0.55],
      accentColor: 0xff00a0
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
      this.buildStage0Abismo();
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
        // Target width 11.4 units ensures maximum scale without lateral clipping
        this.camera.fov = 38;
        this.camera.updateProjectionMatrix();
        const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
        const targetW = 11.4;
        const targetH = 23.0;
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

          // Deep high-contrast obsidian backing for supreme block readability
          vec4 baseColor = vec4(0.012 + zebra, 0.018 + zebra * 1.2, 0.035 + zebra * 1.5, 0.94);

          // Dynamic grid line color modulated by Stage, Beat & Zone
          vec3 neonColor = uGridColor;
          if (uZoneMode > 0.0) {
            vec3 zoneGold = vec3(1.0, 0.85, 0.28);
            neonColor = mix(neonColor, zoneGold, uZoneMode);
            baseColor = mix(baseColor, vec4(0.02, 0.01, 0.04, 0.96), uZoneMode);
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

          gl_FragColor = vec4(rgb, baseColor.a);
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

    buildStage0ProceduralTextures() {
      const textures = {};

      // ------------------------------------------------------------------------
      // A. SEABED TERRAIN TEXTURE (Rippled Current Sand, Basalt & Bio-Filaments)
      // ------------------------------------------------------------------------
      const sbSize = 256;
      const sbCanvas = document.createElement('canvas');
      sbCanvas.width = sbSize;
      sbCanvas.height = sbSize;
      const sbCtx = sbCanvas.getContext('2d');

      const sbHeightCanvas = document.createElement('canvas');
      sbHeightCanvas.width = sbSize;
      sbHeightCanvas.height = sbSize;
      const sbHCtx = sbHeightCanvas.getContext('2d');

      const sbEmissiveCanvas = document.createElement('canvas');
      sbEmissiveCanvas.width = sbSize;
      sbEmissiveCanvas.height = sbSize;
      const sbECtx = sbEmissiveCanvas.getContext('2d');

      const sbImg = sbCtx.createImageData(sbSize, sbSize);
      const sbHImg = sbHCtx.createImageData(sbSize, sbSize);
      const sbEImg = sbECtx.createImageData(sbSize, sbSize);

      for (let y = 0; y < sbSize; y++) {
        for (let x = 0; x < sbSize; x++) {
          const u = (x / sbSize) * Math.PI * 2;
          const v = (y / sbSize) * Math.PI * 2;

          // Current sand ripples + basalt rock fractures
          const ripple = Math.sin(u * 14.0 + Math.sin(v * 4.0) * 1.8) * 0.5 + 0.5;
          const microRipple = Math.sin(u * 38.0 - v * 12.0) * 0.25 + 0.25;
          const rockNoise = Math.sin(u * 5.0 + Math.cos(v * 6.0) * 2.2) * Math.cos(v * 5.0 - Math.sin(u * 4.0) * 1.9);
          const ridge = Math.pow(Math.max(0, rockNoise), 1.6);

          // Bioluminescent abyssal cracks & filaments
          const veinRaw = Math.abs(Math.sin(u * 6.0 + Math.sin(v * 5.0) * 2.4) * Math.cos(v * 6.0 + Math.cos(u * 4.0) * 2.0));
          const vein = Math.pow(Math.max(0, 1.0 - veinRaw * 6.5), 2.5);

          const heightVal = Math.min(1.0, Math.max(0.0, ripple * 0.45 + microRipple * 0.2 + ridge * 0.55 - vein * 0.25));
          const hByte = Math.floor(heightVal * 255);

          const idx = (y * sbSize + x) * 4;
          // Deep abyssal slate-indigo sand with turquoise/magenta mineral tint
          const baseR = 4 + Math.floor(heightVal * 16 + vein * 10);
          const baseG = 16 + Math.floor(heightVal * 38 + vein * 210);
          const baseB = 34 + Math.floor(heightVal * 56 + vein * 195);

          sbImg.data[idx]     = Math.min(255, baseR);
          sbImg.data[idx + 1] = Math.min(255, baseG);
          sbImg.data[idx + 2] = Math.min(255, baseB);
          sbImg.data[idx + 3] = 255;

          sbHImg.data[idx] = sbHImg.data[idx + 1] = sbHImg.data[idx + 2] = hByte;
          sbHImg.data[idx + 3] = 255;

          // Emissive bioluminescent filaments & caustic veins
          const isMagentaVein = Math.sin(u * 3.0 - v * 2.0) > 0.45;
          sbEImg.data[idx]     = Math.floor(vein * (isMagentaVein ? 245 : 0));
          sbEImg.data[idx + 1] = Math.floor(vein * (isMagentaVein ? 30 : 245));
          sbEImg.data[idx + 2] = Math.floor(vein * (isMagentaVein ? 185 : 220));
          sbEImg.data[idx + 3] = 255;
        }
      }
      sbCtx.putImageData(sbImg, 0, 0);
      sbHCtx.putImageData(sbHImg, 0, 0);
      sbECtx.putImageData(sbEImg, 0, 0);

      textures.seabedMap = new THREE.CanvasTexture(sbCanvas);
      textures.seabedMap.wrapS = textures.seabedMap.wrapT = THREE.RepeatWrapping;
      textures.seabedMap.repeat.set(6, 5);

      textures.seabedEmissive = new THREE.CanvasTexture(sbEmissiveCanvas);
      textures.seabedEmissive.wrapS = textures.seabedEmissive.wrapT = THREE.RepeatWrapping;
      textures.seabedEmissive.repeat.set(6, 5);

      textures.seabedNormal = this.generateStage0NormalMap(sbHeightCanvas, 4.2);
      textures.seabedNormal.repeat.set(6, 5);

      // ------------------------------------------------------------------------
      // B. BRAIN CORAL LABYRINTH TEXTURE (Turing Reaction-Diffusion Pattern)
      // ------------------------------------------------------------------------
      const bcSize = 256;
      const bcCanvas = document.createElement('canvas');
      bcCanvas.width = bcSize;
      bcCanvas.height = bcSize;
      const bcCtx = bcCanvas.getContext('2d');

      const bcHeightCanvas = document.createElement('canvas');
      bcHeightCanvas.width = bcSize;
      bcHeightCanvas.height = bcSize;
      const bcHCtx = bcHeightCanvas.getContext('2d');

      const bcImg = bcCtx.createImageData(bcSize, bcSize);
      const bcHImg = bcHCtx.createImageData(bcSize, bcSize);

      for (let y = 0; y < bcSize; y++) {
        for (let x = 0; x < bcSize; x++) {
          const u = (x / bcSize) * Math.PI * 2;
          const v = (y / bcSize) * Math.PI * 2;
          const w1 = Math.sin(u * 8.0 + Math.sin(v * 6.0) * 2.5);
          const w2 = Math.cos(v * 8.0 - Math.sin(u * 7.0) * 2.5);
          const w3 = Math.sin((u + v) * 6.0 + Math.cos(u * 5.0 - v * 4.0) * 2.0);
          const turing = Math.sin((w1 + w2 + w3) * 2.6) * 0.5 + 0.5;

          const hByte = Math.floor(turing * 255);
          const idx = (y * bcSize + x) * 4;

          // Glowing cyan-emerald valleys and magenta-coral ridges
          bcImg.data[idx]     = Math.floor(20 + turing * 210);
          bcImg.data[idx + 1] = Math.floor(195 - turing * 85);
          bcImg.data[idx + 2] = Math.floor(215 - turing * 40);
          bcImg.data[idx + 3] = 255;

          bcHImg.data[idx] = bcHImg.data[idx + 1] = bcHImg.data[idx + 2] = hByte;
          bcHImg.data[idx + 3] = 255;
        }
      }
      bcCtx.putImageData(bcImg, 0, 0);
      bcHCtx.putImageData(bcHImg, 0, 0);

      textures.brainCoralMap = new THREE.CanvasTexture(bcCanvas);
      textures.brainCoralMap.wrapS = textures.brainCoralMap.wrapT = THREE.RepeatWrapping;
      textures.brainCoralNormal = this.generateStage0NormalMap(bcHeightCanvas, 4.5);

      // ------------------------------------------------------------------------
      // C. MANTA RAY SKIN TEXTURE (Mobula birostris Bioluminescent Markings)
      // ------------------------------------------------------------------------
      const mrSize = 256;
      const mrCanvas = document.createElement('canvas');
      mrCanvas.width = mrSize;
      mrCanvas.height = mrSize;
      const mrCtx = mrCanvas.getContext('2d');

      // Deep midnight dorsal skin gradient
      const mrGrad = mrCtx.createRadialGradient(mrSize * 0.5, mrSize * 0.45, 20, mrSize * 0.5, mrSize * 0.5, mrSize * 0.55);
      mrGrad.addColorStop(0, '#071b34');
      mrGrad.addColorStop(0.6, '#040e20');
      mrGrad.addColorStop(1, '#020710');
      mrCtx.fillStyle = mrGrad;
      mrCtx.fillRect(0, 0, mrSize, mrSize);

      // Symmetrical shoulder patches & bioluminescent V-chevrons
      mrCtx.save();
      mrCtx.strokeStyle = '#00f5d4';
      mrCtx.shadowColor = '#00f5d4';
      mrCtx.shadowBlur = 0;
      mrCtx.lineWidth = 6;

      // Dorsal spine ridge line
      mrCtx.beginPath();
      mrCtx.moveTo(mrSize * 0.5, mrSize * 0.08);
      mrCtx.lineTo(mrSize * 0.5, mrSize * 0.92);
      mrCtx.stroke();

      // Symmetrical wing neural circuits & Mobula shoulder arches
      for (let side of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          mrCtx.strokeStyle = k % 2 === 0 ? '#00f5d4' : '#ff00a0';
          mrCtx.shadowColor = mrCtx.strokeStyle;
          mrCtx.lineWidth = 4.5 - k * 0.5;
          mrCtx.beginPath();
          const startY = mrSize * (0.24 + k * 0.12);
          mrCtx.moveTo(mrSize * 0.5 + side * 12, startY);
          mrCtx.quadraticCurveTo(
            mrSize * (0.5 + side * (0.18 + k * 0.04)),
            startY - 28,
            mrSize * (0.5 + side * (0.36 - k * 0.03)),
            startY + 24
          );
          mrCtx.stroke();
        }
      }

      // Ventral gill slit accents & glowing dermal denticle spots
      for (let i = 0; i < 95; i++) {
        const sx = mrSize * (0.15 + Math.random() * 0.7);
        const sy = mrSize * (0.15 + Math.random() * 0.7);
        const rad = 1.5 + Math.random() * 3.2;
        mrCtx.fillStyle = i % 3 === 0 ? '#ff2a9d' : '#00f5d4';
        mrCtx.beginPath();
        mrCtx.arc(sx, sy, rad, 0, Math.PI * 2);
        mrCtx.fill();
      }
      mrCtx.restore();

      textures.mantaMap = new THREE.CanvasTexture(mrCanvas);
      textures.mantaNormal = this.generateStage0NormalMap(mrCanvas, 2.8);

      // ------------------------------------------------------------------------
      // D. JELLYFISH TRANSLUCENT BELL TEXTURE (Radial Canals & Bioluminescent Nodes)
      // ------------------------------------------------------------------------
      const jfSize = 256;
      const jfCanvas = document.createElement('canvas');
      jfCanvas.width = jfSize;
      jfCanvas.height = jfSize;
      const jfCtx = jfCanvas.getContext('2d');

      const jfGrad = jfCtx.createLinearGradient(0, 0, 0, jfSize);
      jfGrad.addColorStop(0.0, '#ffffff');
      jfGrad.addColorStop(0.25, '#00f5d4');
      jfGrad.addColorStop(0.65, '#7b2cbf');
      jfGrad.addColorStop(0.92, '#ff00a0');
      jfGrad.addColorStop(1.0, '#00f5d4');
      jfCtx.fillStyle = jfGrad;
      jfCtx.fillRect(0, 0, jfSize, jfSize);

      // 16 Radial gastrovascular striations along UV.x
      for (let i = 0; i < 16; i++) {
        const rx = (i / 16) * jfSize;
        jfCtx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(0,245,212,0.7)';
        jfCtx.lineWidth = i % 2 === 0 ? 5 : 3;
        jfCtx.beginPath();
        jfCtx.moveTo(rx, 0);
        jfCtx.lineTo(rx, jfSize);
        jfCtx.stroke();
      }

      // Concentric rhopalia ring dots near bell margin
      for (let i = 0; i < 64; i++) {
        const px = (i / 64) * jfSize + 4;
        const py = jfSize * (0.78 + (i % 3) * 0.05);
        jfCtx.fillStyle = '#ffffff';
        jfCtx.beginPath();
        jfCtx.arc(px, py, 3.5, 0, Math.PI * 2);
        jfCtx.fill();
      }

      textures.jellyMap = new THREE.CanvasTexture(jfCanvas);
      textures.jellyMap.wrapS = THREE.RepeatWrapping;
      textures.jellyNormal = this.generateStage0NormalMap(jfCanvas, 2.4);
      textures.jellyNormal.wrapS = THREE.RepeatWrapping;

      // ------------------------------------------------------------------------
      // E. HUMPBACK LEVIATHAN WHALE TEXTURE (Ventral Grooves, Barnacles & Bio-Runes)
      // ------------------------------------------------------------------------
      const whSize = 256;
      const whCanvas = document.createElement('canvas');
      whCanvas.width = whSize;
      whCanvas.height = whSize;
      const whCtx = whCanvas.getContext('2d');

      const whEmissiveCanvas = document.createElement('canvas');
      whEmissiveCanvas.width = whSize;
      whEmissiveCanvas.height = whSize;
      const whECtx = whEmissiveCanvas.getContext('2d');

      const whGrad = whCtx.createLinearGradient(0, 0, 0, whSize);
      whGrad.addColorStop(0.0, '#061428');
      whGrad.addColorStop(0.55, '#0b223e');
      whGrad.addColorStop(0.85, '#193b5c');
      whGrad.addColorStop(1.0, '#2c5878');
      whCtx.fillStyle = whGrad;
      whCtx.fillRect(0, 0, whSize, whSize);

      whECtx.fillStyle = '#000000';
      whECtx.fillRect(0, 0, whSize, whSize);

      // Ventral throat pleats (rorqual grooves)
      whCtx.strokeStyle = '#040b16';
      whCtx.lineWidth = 3;
      for (let g = 0; g < 28; g++) {
        const gx = (g / 28) * whSize;
        whCtx.beginPath();
        whCtx.moveTo(gx, whSize * 0.55);
        whCtx.lineTo(gx, whSize * 0.98);
        whCtx.stroke();
      }

      // Bioluminescent celestial runes & lateral line markings along whale flanks
      whECtx.strokeStyle = '#00f5d4';
      whECtx.shadowColor = '#00f5d4';
      whECtx.shadowBlur = 0;
      whECtx.lineWidth = 5;
      for (let r = 0; r < 8; r++) {
        const yPos = whSize * (0.22 + (r % 4) * 0.14);
        const xStart = (r / 8) * whSize;
        whECtx.beginPath();
        whECtx.arc(xStart + 32, yPos, 18, 0, Math.PI * 1.4);
        whECtx.stroke();

        whCtx.strokeStyle = '#00f5d4';
        whCtx.lineWidth = 3;
        whCtx.beginPath();
        whCtx.arc(xStart + 32, yPos, 18, 0, Math.PI * 1.4);
        whCtx.stroke();
      }

      // Glowing dermal nodules
      for (let d = 0; d < 70; d++) {
        const dx = Math.random() * whSize;
        const dy = Math.random() * whSize * 0.7;
        whECtx.fillStyle = d % 3 === 0 ? '#ff00a0' : '#00f5d4';
        whECtx.beginPath();
        whECtx.arc(dx, dy, 2.8, 0, Math.PI * 2);
        whECtx.fill();
      }

      textures.whaleMap = new THREE.CanvasTexture(whCanvas);
      textures.whaleMap.wrapS = textures.whaleMap.wrapT = THREE.RepeatWrapping;
      textures.whaleEmissive = new THREE.CanvasTexture(whEmissiveCanvas);
      textures.whaleEmissive.wrapS = textures.whaleEmissive.wrapT = THREE.RepeatWrapping;
      textures.whaleNormal = this.generateStage0NormalMap(whCanvas, 3.5);
      textures.whaleNormal.wrapS = textures.whaleNormal.wrapT = THREE.RepeatWrapping;

      // ------------------------------------------------------------------------
      // F. SEA TURTLE CARAPACE TEXTURE (Hexagonal Scute Plates + Sobel Normal)
      // ------------------------------------------------------------------------
      const ttSize = 256;
      const ttCanvas = document.createElement('canvas');
      ttCanvas.width = ttSize;
      ttCanvas.height = ttSize;
      const ttCtx = ttCanvas.getContext('2d');

      ttCtx.fillStyle = '#06262e';
      ttCtx.fillRect(0, 0, ttSize, ttSize);

      // Draw hexagonal scute mosaic
      const hexRadius = 28;
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
          const cx = col * hexRadius * 1.65 + (row % 2) * hexRadius * 0.82;
          const cy = row * hexRadius * 1.45;

          const scuteGrad = ttCtx.createRadialGradient(cx, cy, 2, cx, cy, hexRadius);
          scuteGrad.addColorStop(0, '#16697a');
          scuteGrad.addColorStop(0.65, '#0b3c49');
          scuteGrad.addColorStop(0.92, '#041820');
          scuteGrad.addColorStop(1.0, '#00f5d4');

          ttCtx.fillStyle = scuteGrad;
          ttCtx.strokeStyle = '#00f5d4';
          ttCtx.lineWidth = 2.2;
          ttCtx.beginPath();
          for (let s = 0; s < 6; s++) {
            const ang = (s / 6) * Math.PI * 2 + Math.PI / 6;
            const vx = cx + Math.cos(ang) * (hexRadius - 2);
            const vy = cy + Math.sin(ang) * (hexRadius - 2);
            if (s === 0) ttCtx.moveTo(vx, vy);
            else ttCtx.lineTo(vx, vy);
          }
          ttCtx.closePath();
          ttCtx.fill();
          ttCtx.stroke();
        }
      }

      textures.turtleMap = new THREE.CanvasTexture(ttCanvas);
      textures.turtleNormal = this.generateStage0NormalMap(ttCanvas, 4.0);

      // ------------------------------------------------------------------------
      // G. IRIDESCENT ABYSSAL FISH SCALES TEXTURE
      // ------------------------------------------------------------------------
      const fsSize = 128;
      const fsCanvas = document.createElement('canvas');
      fsCanvas.width = fsSize;
      fsCanvas.height = fsSize;
      const fsCtx = fsCanvas.getContext('2d');

      const fsGrad = fsCtx.createLinearGradient(0, 0, fsSize, fsSize);
      fsGrad.addColorStop(0, '#00f5d4');
      fsGrad.addColorStop(0.5, '#0077ff');
      fsGrad.addColorStop(1, '#ff00a0');
      fsCtx.fillStyle = fsGrad;
      fsCtx.fillRect(0, 0, fsSize, fsSize);

      fsCtx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      fsCtx.lineWidth = 1.6;
      for (let ry = 0; ry < 8; ry++) {
        for (let rx = 0; rx < 8; rx++) {
          const sx = rx * 16 + (ry % 2) * 8;
          const sy = ry * 16;
          fsCtx.beginPath();
          fsCtx.arc(sx, sy, 9, 0, Math.PI);
          fsCtx.stroke();
        }
      }

      textures.fishMap = new THREE.CanvasTexture(fsCanvas);
      textures.fishMap.wrapS = textures.fishMap.wrapT = THREE.RepeatWrapping;
      textures.fishNormal = this.generateStage0NormalMap(fsCanvas, 2.5);
      textures.fishNormal.wrapS = textures.fishNormal.wrapT = THREE.RepeatWrapping;

      return textures;
    }

    // ==========================================================================
    // 2. STAGE 0 SCENE CONSTRUCTION: ABISMO BIOLUMINISCENTE
    // ==========================================================================
    buildStage0Abismo() {
      this.stage0Group = new THREE.Group();
      this.worldGroup.add(this.stage0Group);

      // Initialize holder arrays
      this.stage0GodRays = [];
      this.stage0MantaRays = [];
      this.stage0Jellyfish = [];
      this.stage0Whales = [];
      this.stage0Turtles = [];
      this.stage0FishSchool = [];
      this.stage0Corals = [];
      this.stage0Anemones = [];
      this.stage0Bubbles = [];
      this.stage0Flora = [];
      this.stage0Vents = [];
      this.stage0Lights = [];

      // Generate procedural Canvas 2D Albedo, Emissive & Sobel Normal Maps
      this.stage0Textures = this.buildStage0ProceduralTextures();

      // ------------------------------------------------------------------------
      // 1. DYNAMIC UNDERWATER POINT LIGHTS (Illuminate Sobel Normal Relief)
      // ------------------------------------------------------------------------
      const lightConfigs = [
        { color: 0x00f5d4, intensity: 3.2, dist: 55, pos: new THREE.Vector3(-16, -5, -10), phase: 0.0 },
        { color: 0xff00a0, intensity: 2.8, dist: 55, pos: new THREE.Vector3(16, -4, -12),  phase: 2.1 },
        { color: 0x0077ff, intensity: 3.0, dist: 65, pos: new THREE.Vector3(0, -9, -20),   phase: 4.2 }
      ];

      lightConfigs.forEach(cfg => {
        const pLight = new THREE.PointLight(cfg.color, cfg.intensity, cfg.dist, 1.4);
        pLight.position.copy(cfg.pos);
        this.stage0Group.add(pLight);
        this.stage0Lights.push({
          light: pLight,
          basePos: cfg.pos.clone(),
          baseIntensity: cfg.intensity,
          phase: cfg.phase
        });
      });

      // ------------------------------------------------------------------------
      // 2. 3D ABYSSAL SEABED TERRAIN (Dunes, Canyons, Sobel Normal + Caustics)
      // ------------------------------------------------------------------------
      const seabedGeo = new THREE.PlaneGeometry(160, 120, 96, 96);
      const sbPos = seabedGeo.attributes.position;

      for (let i = 0; i < sbPos.count; i++) {
        const vx = sbPos.getX(i);
        const vy = sbPos.getY(i);

        // Fractal multi-octave topography: submarine dunes, abyssal trench & flanking ridges
        const dune = Math.sin(vx * 0.08 + Math.cos(vy * 0.07) * 1.5) * 1.4 +
                     Math.cos(vy * 0.14 - Math.sin(vx * 0.09) * 1.2) * 0.85;
        const microRipple = Math.sin(vx * 0.45 + vy * 0.35) * 0.22;

        // Keep central corridor below the Tetris pedestal gently carved, flanking canyon walls higher
        const absX = Math.abs(vx);
        const canyonWall = absX > 11.0
          ? Math.pow((absX - 11.0) * 0.065, 1.45) * (3.2 + Math.sin(vy * 0.12 + vx * 0.08) * 1.4)
          : -Math.cos((absX / 11.0) * Math.PI * 0.5) * 1.6;

        sbPos.setZ(i, dune + microRipple + canyonWall);
      }
      seabedGeo.computeVertexNormals();

      this.stage0SeabedMat = new THREE.MeshStandardMaterial({
        map: this.stage0Textures.seabedMap,
        normalMap: this.stage0Textures.seabedNormal,
        normalScale: new THREE.Vector2(2.2, 2.2),
        emissive: new THREE.Color(0x00e5ff),
        emissiveMap: this.stage0Textures.seabedEmissive,
        emissiveIntensity: 0.35,
        roughness: 0.55,
        metalness: 0.18
      });

      this.stage0SeabedMesh = new THREE.Mesh(seabedGeo, this.stage0SeabedMat);
      this.stage0SeabedMesh.rotation.x = -Math.PI / 2;
      this.stage0SeabedMesh.position.set(0, -14.2, -18);
      this.stage0Group.add(this.stage0SeabedMesh);

      // ------------------------------------------------------------------------
      // 3. GERSTNER WAVE & VORONOI CAUSTICS BIOLUMINESCENT WATER LAYER
      // ------------------------------------------------------------------------
      const waterGeo = new THREE.PlaneGeometry(160, 120, 96, 96);

      const waterVert = `
        uniform float uTime;
        uniform float uBeatPulse;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vWaveHeight;

        vec3 gerstnerWave(vec2 dir, float steepness, float wavelength, inout vec3 tangent, inout vec3 binormal, vec3 pos, float time) {
          float k = 2.0 * 3.14159265 / wavelength;
          float c = sqrt(9.8 / k);
          vec2 d = normalize(dir);
          float f = k * (dot(d, pos.xy) - c * time);
          float a = steepness / k;

          tangent += vec3(-d.x * d.x * (steepness * sin(f)), -d.x * d.y * (steepness * sin(f)), d.x * (steepness * cos(f)));
          binormal += vec3(-d.x * d.y * (steepness * sin(f)), -d.y * d.y * (steepness * sin(f)), d.y * (steepness * cos(f)));

          return vec3(d.x * (a * cos(f)), d.y * (a * cos(f)), a * sin(f));
        }

        void main() {
          vUv = uv;
          vec3 pos = position;

          vec3 tangent = vec3(1.0, 0.0, 0.0);
          vec3 binormal = vec3(0.0, 1.0, 0.0);

          vec3 waveOffset = vec3(0.0);
          waveOffset += gerstnerWave(vec2(1.0, 0.35), 0.16, 22.0, tangent, binormal, pos, uTime * 1.3);
          waveOffset += gerstnerWave(vec2(-0.6, 0.8), 0.13, 14.0, tangent, binormal, pos, uTime * 1.7);
          waveOffset += gerstnerWave(vec2(0.3, -1.0), 0.10, 9.0, tangent, binormal, pos, uTime * 2.1);

          float distCenter = length(pos.xy);
          float ripple = sin(distCenter * 0.85 - uTime * 3.6) * exp(-distCenter * 0.04) * (0.35 + uBeatPulse * 0.55);
          waveOffset.z += ripple;

          pos += waveOffset;
          vWaveHeight = pos.z;

          vec3 normal = normalize(cross(tangent, binormal));
          vNormal = normal;

          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `;

      const waterFrag = `
        uniform float uTime;
        uniform float uBeatPulse;
        uniform vec3 uDeepColor;
        uniform vec3 uTurquoiseColor;
        uniform vec3 uFoamColor;
        uniform vec3 uMagentaFoam;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vWaveHeight;

        vec2 hash2(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
        }

        float voronoi(vec2 p) {
          vec2 n = floor(p);
          vec2 f = fract(p);
          float md = 8.0;
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 g = vec2(float(i), float(j));
              vec2 o = hash2(n + g);
              vec2 r = g + o - f;
              float d = dot(r, r);
              md = min(md, d);
            }
          }
          return sqrt(md);
        }

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(cameraPosition - vWorldPos);

          vec2 cUv = vWorldPos.xz * 0.16;
          float c1 = voronoi(cUv + vec2(uTime * 0.07, uTime * 0.05));
          float c2 = voronoi(cUv * 1.65 - vec2(uTime * 0.05, -uTime * 0.06));
          float causticPattern = pow(1.0 - (c1 + c2) * 0.5, 3.1) * 2.5;

          float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 3.2);
          vec3 waterBase = mix(uDeepColor, uTurquoiseColor, fresnel * 0.72 + 0.18);

          vec3 caustics = mix(uTurquoiseColor, uMagentaFoam, sin(vWorldPos.x * 0.08 + uTime * 0.5) * 0.5 + 0.5)
                          * causticPattern * (0.72 + uBeatPulse * 0.55);
          waterBase += caustics;

          float foamFactor = smoothstep(0.32, 0.75, vWaveHeight + uBeatPulse * 0.25);
          vec3 crestFoam = mix(uFoamColor, uMagentaFoam, sin(vWorldPos.x * 0.25 + uTime) * 0.5 + 0.5);
          vec3 finalColor = mix(waterBase, crestFoam, foamFactor * 0.85);

          vec3 lightDir = normalize(vec3(0.4, 0.8, 0.5));
          vec3 halfVec = normalize(lightDir + viewDir);
          float spec = pow(max(0.0, dot(normal, halfVec)), 48.0) * 1.2;
          finalColor += vec3(spec);

          float dist = length(vWorldPos.xz - vec2(0.0, -14.0));
          float distFade = smoothstep(74.0, 32.0, dist);

          gl_FragColor = vec4(finalColor, 0.74 * distFade);
        }
      `;

      this.stage0WaterMat = new THREE.ShaderMaterial({
        vertexShader: waterVert,
        fragmentShader: waterFrag,
        uniforms: {
          uTime: { value: 0.0 },
          uBeatPulse: { value: 0.0 },
          uDeepColor: { value: new THREE.Color(0x020b18) },
          uTurquoiseColor: { value: new THREE.Color(0x00f5d4) },
          uFoamColor: { value: new THREE.Color(0xdffffd) },
          uMagentaFoam: { value: new THREE.Color(0xff00a0) }
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      this.stage0WaterMesh = new THREE.Mesh(waterGeo, this.stage0WaterMat);
      this.stage0WaterMesh.rotation.x = -Math.PI / 2;
      this.stage0WaterMesh.position.set(0, -11.5, -14);
      this.stage0Group.add(this.stage0WaterMesh);

      // ------------------------------------------------------------------------
      // 4. HIGH-GEOMETRY CORAL REEFS (Brain Corals, Staghorn Tubes, Anemones)
      // ------------------------------------------------------------------------
      // 4A. Turing Labyrinth Brain Corals (SphereGeometry 48x36 sculpted + Normal Map)
      const brainCoralPositions = [
        { x: -16.5, y: -12.6, z: -11.0, r: 1.85, color: 0x00f5d4, emissive: 0x00a896 },
        { x:  16.0, y: -12.4, z: -12.5, r: 2.05, color: 0xff2a85, emissive: 0xc9184a },
        { x: -23.0, y: -11.8, z: -18.5, r: 2.35, color: 0xc77dff, emissive: 0x7b2cbf },
        { x:  22.5, y: -11.9, z: -19.0, r: 2.20, color: 0x00f566, emissive: 0x00b4d8 },
        { x: -12.0, y: -13.0, z: -15.5, r: 1.55, color: 0xfee440, emissive: 0xff9e00 },
        { x:  12.8, y: -12.9, z: -16.0, r: 1.65, color: 0x00f5d4, emissive: 0x0077b6 }
      ];

      brainCoralPositions.forEach((bc, idx) => {
        const bcGeo = new THREE.SphereGeometry(bc.r, 48, 36);
        const pos = bcGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let vx = pos.getX(i);
          let vy = pos.getY(i);
          let vz = pos.getZ(i);
          // Flatten underside & sculpt organic cerebriform lobes
          if (vy < 0) vy *= 0.45;
          const lobe = 1.0 + 0.08 * Math.sin(vx * 3.8 + idx) * Math.cos(vz * 3.8 - idx) +
                       0.04 * Math.sin(vy * 6.0);
          pos.setXYZ(i, vx * lobe, vy * lobe, vz * lobe);
        }
        bcGeo.computeVertexNormals();

        const bcMat = new THREE.MeshStandardMaterial({
          color: bc.color,
          map: this.stage0Textures.brainCoralMap,
          normalMap: this.stage0Textures.brainCoralNormal,
          normalScale: new THREE.Vector2(2.4, 2.4),
          emissive: bc.emissive,
          emissiveMap: this.stage0Textures.brainCoralMap,
          emissiveIntensity: 0.65,
          roughness: 0.35,
          metalness: 0.15
        });

        const bcMesh = new THREE.Mesh(bcGeo, bcMat);
        bcMesh.position.set(bc.x, bc.y, bc.z);
        this.stage0Group.add(bcMesh);
        this.stage0Corals.push({ mesh: bcMesh, mat: bcMat, baseEmissive: 0.65, phase: idx * 1.1 });
      });

      // 4B. Branched Staghorn Corals (Smooth 3D CatmullRom TubeGeometry Branches)
      const staghornClusters = [
        { x: -14.2, y: -12.8, z: -10.2, color: 0xff2a85, tipColor: 0x00f5d4 },
        { x:  14.5, y: -12.7, z: -10.8, color: 0x00f5d4, tipColor: 0xfee440 },
        { x: -20.0, y: -12.0, z: -15.0, color: 0x3a86ff, tipColor: 0x00f5d4 },
        { x:  19.8, y: -12.1, z: -15.5, color: 0xc77dff, tipColor: 0xff2a85 },
        { x: -10.5, y: -13.1, z: -18.0, color: 0x00f566, tipColor: 0x00f5d4 },
        { x:  10.8, y: -13.0, z: -18.5, color: 0xff9e00, tipColor: 0xff00a0 }
      ];

      staghornClusters.forEach((sc, cIdx) => {
        const clusterGroup = new THREE.Group();
        clusterGroup.position.set(sc.x, sc.y, sc.z);

        const branchMat = new THREE.MeshStandardMaterial({
          color: sc.color,
          normalMap: this.stage0Textures.brainCoralNormal,
          normalScale: new THREE.Vector2(1.2, 1.2),
          emissive: sc.tipColor,
          emissiveIntensity: 0.55,
          roughness: 0.28,
          metalness: 0.2
        });

        const branchesPerCluster = 6;
        for (let b = 0; b < branchesPerCluster; b++) {
          const ang = (b / branchesPerCluster) * Math.PI * 2 + cIdx * 0.4;
          const spread = 0.7 + (b % 2) * 0.55;
          const height = 2.4 + (b % 3) * 0.85;

          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(Math.cos(ang) * spread * 0.45, height * 0.38, Math.sin(ang) * spread * 0.45),
            new THREE.Vector3(Math.cos(ang + 0.25) * spread * 0.9, height * 0.75, Math.sin(ang + 0.25) * spread * 0.9),
            new THREE.Vector3(Math.cos(ang + 0.1) * spread * 1.25, height, Math.sin(ang + 0.1) * spread * 1.25)
          ]);
          const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.13, 12, false);
          const branchMesh = new THREE.Mesh(tubeGeo, branchMat);
          clusterGroup.add(branchMesh);

          // Glowing polyp tip bulb
          const tipGeo = new THREE.SphereGeometry(0.16, 16, 12);
          const tipMat = new THREE.MeshBasicMaterial({ color: sc.tipColor });
          const tipMesh = new THREE.Mesh(tipGeo, tipMat);
          tipMesh.position.copy(curve.getPoint(1.0));
          clusterGroup.add(tipMesh);

          // Secondary fork sub-branch
          const midPt = curve.getPoint(0.55);
          const forkCurve = new THREE.CatmullRomCurve3([
            midPt,
            midPt.clone().add(new THREE.Vector3(Math.cos(ang - 0.7) * 0.5, height * 0.25, Math.sin(ang - 0.7) * 0.5)),
            midPt.clone().add(new THREE.Vector3(Math.cos(ang - 0.9) * 0.85, height * 0.48, Math.sin(ang - 0.9) * 0.85))
          ]);
          const forkGeo = new THREE.TubeGeometry(forkCurve, 12, 0.09, 10, false);
          const forkMesh = new THREE.Mesh(forkGeo, branchMat);
          clusterGroup.add(forkMesh);
        }

        this.stage0Group.add(clusterGroup);
        this.stage0Corals.push({ mesh: clusterGroup, mat: branchMat, baseEmissive: 0.55, phase: cIdx * 0.9 });
      });

      // 4C. Bioluminescent Sea Anemones with Waving Tentacle Crowns
      const anemoneSpots = [
        { x: -13.0, y: -12.7, z: -11.5, color: 0x00f5d4, tip: 0xff00a0 },
        { x:  13.2, y: -12.6, z: -11.8, color: 0xff00a0, tip: 0xfee440 },
        { x: -18.5, y: -12.2, z: -14.0, color: 0xc77dff, tip: 0x00f5d4 },
        { x:  18.2, y: -12.2, z: -14.2, color: 0x00f566, tip: 0x00f5d4 }
      ];

      anemoneSpots.forEach((an, aIdx) => {
        const anemGroup = new THREE.Group();
        anemGroup.position.set(an.x, an.y, an.z);

        // Fleshy pedal column
        const baseGeo = new THREE.CylinderGeometry(0.65, 0.85, 0.85, 24, 8);
        const baseMat = new THREE.MeshStandardMaterial({
          color: an.color,
          emissive: an.color,
          emissiveIntensity: 0.45,
          roughness: 0.35
        });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        anemGroup.add(baseMesh);

        const tentacles = [];
        const tentacleCount = 18;
        const tentGeo = new THREE.CylinderGeometry(0.025, 0.075, 1.35, 10, 10);
        tentGeo.translate(0, 0.675, 0);
        const tentMat = new THREE.MeshStandardMaterial({
          color: an.color,
          emissive: an.tip,
          emissiveIntensity: 0.85,
          roughness: 0.2
        });

        for (let t = 0; t < tentacleCount; t++) {
          const tAngle = (t / tentacleCount) * Math.PI * 2;
          const ringRadius = 0.28 + (t % 2) * 0.24;
          const tMesh = new THREE.Mesh(tentGeo, tentMat);
          tMesh.position.set(Math.cos(tAngle) * ringRadius, 0.35, Math.sin(tAngle) * ringRadius);
          const tilt = 0.25 + (t % 2) * 0.22;
          tMesh.rotation.z = -Math.cos(tAngle) * tilt;
          tMesh.rotation.x = Math.sin(tAngle) * tilt;
          anemGroup.add(tMesh);
          tentacles.push({
            mesh: tMesh,
            baseRotX: tMesh.rotation.x,
            baseRotZ: tMesh.rotation.z,
            phase: t * 0.5 + aIdx
          });
        }

        this.stage0Group.add(anemGroup);
        this.stage0Anemones.push({ group: anemGroup, tentacles });
      });

      // ------------------------------------------------------------------------
      // 5. VOLUMETRIC MULTI-LAYER CAUSTIC GOD-RAYS & PLANKTON FIELD
      // ------------------------------------------------------------------------
      const godRayGeo = new THREE.PlaneGeometry(7.5, 28.0);
      const godRayVert = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;
      const godRayFrag = `
        uniform float uTime;
        uniform float uBeatPulse;
        uniform vec3 uRayColorA;
        uniform vec3 uRayColorB;
        varying vec2 vUv;
        void main() {
          float shimmer = sin(vUv.x * 18.0 + uTime * 1.4) * sin(vUv.x * 9.0 - uTime * 1.1);
          float causticBands = pow(sin(vUv.x * 24.0 + sin(vUv.y * 8.0 + uTime)) * 0.5 + 0.5, 2.5);
          float spine = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
          float vertFade = pow(1.0 - vUv.y, 1.3) * smoothstep(0.0, 0.12, 1.0 - vUv.y);

          vec3 rayColor = mix(uRayColorA, uRayColorB, vUv.y + shimmer * 0.15);
          float alpha = (spine * 0.20 + causticBands * spine * 0.12 + shimmer * 0.05) * vertFade * (0.68 + uBeatPulse * 0.45);

          gl_FragColor = vec4(rayColor, max(0.0, alpha));
        }
      `;

      for (let g = 0; g < 10; g++) {
        const isMagentaAccent = g % 3 === 1;
        const gMat = new THREE.ShaderMaterial({
          vertexShader: godRayVert,
          fragmentShader: godRayFrag,
          uniforms: {
            uTime: { value: 0.0 },
            uBeatPulse: { value: 0.0 },
            uRayColorA: { value: new THREE.Color(isMagentaAccent ? 0x00e5ff : 0x00f5d4) },
            uRayColorB: { value: new THREE.Color(isMagentaAccent ? 0xff00a0 : 0x0077ff) }
          },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const gMesh = new THREE.Mesh(godRayGeo, gMat);
        const gx = -26.0 + g * 5.8 + (Math.random() - 0.5) * 2.0;
        const gz = -13.0 - (g % 3) * 4.5;
        gMesh.position.set(gx, 5.2, gz);
        gMesh.rotation.z = -0.14 + (Math.random() - 0.5) * 0.1;
        gMesh.rotation.y = (Math.random() - 0.5) * 0.28;
        this.stage0Group.add(gMesh);
        this.stage0GodRays.push({ mesh: gMesh, mat: gMat });
      }

      // ------------------------------------------------------------------------
      // 6. HIGH-GEOMETRY BIOLUMINESCENT JELLYFISH (64-Segment Bell & 3D Tubes)
      // ------------------------------------------------------------------------
      const numJellies = 8;
      const bellPoints = [];
      const profileSteps = 32;
      for (let p = 0; p <= profileSteps; p++) {
        const t = p / profileSteps;
        // Smooth dome umbrella with flared marginal lip & subumbrella thickness curve
        const rad = Math.sin(t * Math.PI * 0.58) * 1.48 + Math.sin(t * Math.PI * 3.0) * 0.05;
        const yVal = -Math.cos(t * Math.PI * 0.58) * 1.38 + 0.32;
        bellPoints.push(new THREE.Vector2(Math.max(0.001, rad), yVal));
      }
      const bellGeo = new THREE.LatheGeometry(bellPoints, 64);

      // Sculpt 16 organic marginal lappets (scalloped lobes) around bell rim
      const bellPos = bellGeo.attributes.position;
      for (let i = 0; i < bellPos.count; i++) {
        const vx = bellPos.getX(i);
        const vy = bellPos.getY(i);
        const vz = bellPos.getZ(i);
        const angle = Math.atan2(vz, vx);
        const rimFactor = THREE.MathUtils.smoothstep(vy, 0.0, -0.75);
        const lappetWave = Math.sin(angle * 16.0) * 0.08 * rimFactor;
        const radialRib = 1.0 + Math.cos(angle * 16.0) * 0.025 * (1.0 - rimFactor * 0.5);
        bellPos.setXYZ(i, vx * radialRib, vy + lappetWave, vz * radialRib);
      }
      bellGeo.computeVertexNormals();

      const coreGeo = new THREE.SphereGeometry(0.5, 32, 24);
      const gonadRingGeo = new THREE.TorusGeometry(0.32, 0.07, 16, 36);

      for (let i = 0; i < numJellies; i++) {
        const jellyGroup = new THREE.Group();
        const isCyan = i % 2 === 0;

        const bellMat = new THREE.MeshStandardMaterial({
          color: isCyan ? 0x00f5ea : 0xff2a9d,
          map: this.stage0Textures.jellyMap,
          normalMap: this.stage0Textures.jellyNormal,
          normalScale: new THREE.Vector2(1.4, 1.4),
          emissive: isCyan ? 0x00d2c0 : 0xd80075,
          emissiveMap: this.stage0Textures.jellyMap,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.84,
          roughness: 0.16,
          metalness: 0.1,
          side: THREE.DoubleSide
        });

        const bellMesh = new THREE.Mesh(bellGeo, bellMat);
        jellyGroup.add(bellMesh);

        // Inner glowing gastrovascular core & horseshoe gonad ring
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: isCyan ? 0x00f5d4 : 0xff66cc,
          emissiveIntensity: 1.5,
          transparent: true,
          opacity: 0.92,
          roughness: 0.1
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.set(0, -0.15, 0);
        jellyGroup.add(coreMesh);

        const gonadRing = new THREE.Mesh(gonadRingGeo, coreMat);
        gonadRing.rotation.x = Math.PI / 2;
        gonadRing.position.set(0, -0.25, 0);
        jellyGroup.add(gonadRing);

        // 4 Frilled 3D Helical Oral Arms (TubeGeometry along CatmullRomCurve3)
        const oralArms = [];
        const armMat = new THREE.MeshStandardMaterial({
          color: isCyan ? 0x80ffea : 0xff99dd,
          emissive: isCyan ? 0x00f5d4 : 0xff1493,
          emissiveIntensity: 0.85,
          transparent: true,
          opacity: 0.82,
          roughness: 0.25
        });

        for (let a = 0; a < 4; a++) {
          const armPts = [];
          const armSegs = 18;
          for (let s = 0; s < armSegs; s++) {
            const t = s / (armSegs - 1);
            const angle = s * 0.52 + (a * Math.PI * 0.5);
            const radius = 0.18 + Math.sin(t * Math.PI) * 0.24;
            armPts.push(new THREE.Vector3(
              Math.cos(angle) * radius,
              -0.25 - t * 3.8,
              Math.sin(angle) * radius
            ));
          }
          const armCurve = new THREE.CatmullRomCurve3(armPts);
          const armTubeGeo = new THREE.TubeGeometry(armCurve, 28, 0.065, 8, false);
          const armMesh = new THREE.Mesh(armTubeGeo, armMat);
          jellyGroup.add(armMesh);
          oralArms.push({ mesh: armMesh, baseRotY: (a * Math.PI) / 2 });
        }

        // 16 Smooth 3D Tubular Tentacles around bell margin
        const tentacles = [];
        const numTentacles = 16;
        const tentSegs = 16;
        const tentMat = new THREE.MeshStandardMaterial({
          color: isCyan ? 0x00f5ff : 0xff66cc,
          emissive: isCyan ? 0x00e5ff : 0xff00a0,
          emissiveIntensity: 0.95,
          transparent: true,
          opacity: 0.78,
          roughness: 0.2
        });

        for (let t = 0; t < numTentacles; t++) {
          const tGeo = new THREE.CylinderGeometry(0.022, 0.008, 4.8, 6, tentSegs);
          tGeo.translate(0, -2.4, 0);
          const origPos = tGeo.attributes.position.clone();
          tGeo.userData = { origPos };

          const tentMesh = new THREE.Mesh(tGeo, tentMat);
          const angle = (t / numTentacles) * Math.PI * 2;
          tentMesh.position.set(Math.cos(angle) * 1.28, -0.58, Math.sin(angle) * 1.28);
          jellyGroup.add(tentMesh);
          tentacles.push(tentMesh);
        }

        const sideSign = i % 2 === 0 ? -1 : 1;
        const jx = sideSign * (9.5 + (i * 2.3) % 14.0);
        const jy = -12.0 + (i / numJellies) * 24.0;
        const jz = (i < 2) ? (4.5 + i * 2.2) : (-8.0 - (i % 4) * 5.2);
        jellyGroup.position.set(jx, jy, jz);

        this.stage0Group.add(jellyGroup);
        this.stage0Jellyfish.push({
          group: jellyGroup,
          bell: bellMesh,
          core: coreMesh,
          oralArms,
          tentacles,
          speedY: 0.85 + (i % 3) * 0.35,
          swimOffset: i * 0.95,
          baseScale: 0.72 + (i % 3) * 0.16,
          initialX: jx
        });
      }

      // ------------------------------------------------------------------------
      // 7. SCULPTED 3D BIOLUMINESCENT MANTA RAYS (Mobula birostris 48x36)
      // ------------------------------------------------------------------------
      const numMantas = 4;
      const wingW = 6.2;
      const wingL = 5.0;

      for (let m = 0; m < numMantas; m++) {
        const mantaGroup = new THREE.Group();

        // High-density 48x36 sculpted batoid body + wings geometry
        const mGeo = new THREE.PlaneGeometry(wingW, wingL, 48, 36);
        const mPos = mGeo.attributes.position;

        for (let i = 0; i < mPos.count; i++) {
          const ux = mPos.getX(i) / (wingW * 0.5); // -1..1 left-right
          const uy = mPos.getY(i) / (wingL * 0.5); // -1..1 tail-head
          const absX = Math.abs(ux);

          // Authentic swept-wing Mobula planform envelope
          const leadingEdgeY = Math.cos(absX * Math.PI * 0.48) * 0.95 - Math.pow(absX, 1.6) * 0.25;
          const trailingEdgeY = -0.92 + Math.pow(absX, 0.82) * 0.88;
          const normalizedY = (uy + 1.0) * 0.5;
          const shapedY = THREE.MathUtils.lerp(trailingEdgeY, leadingEdgeY, normalizedY) * (wingL * 0.5);
          const shapedX = ux * (wingW * 0.5);

          // Dorso-ventral 3D body arch & central spine ridge
          const bodyArch = Math.exp(-absX * absX * 4.5) * Math.cos(uy * 1.1) * 0.38;
          const dorsalRidge = Math.exp(-absX * absX * 28.0) * 0.14 * (1.0 - Math.abs(uy) * 0.5);
          // Ventral gill slits indentation
          const gillGrooves = absX > 0.08 && absX < 0.26 && uy > -0.2 && uy < 0.45
            ? Math.sin(uy * 36.0) * 0.035
            : 0.0;

          mPos.setXYZ(i, shapedX, shapedY, bodyArch + dorsalRidge + gillGrooves);
        }
        mGeo.computeVertexNormals();
        mGeo.userData = { origPos: mGeo.attributes.position.clone() };

        const isCyanManta = m % 2 === 0;
        const mMat = new THREE.MeshStandardMaterial({
          color: isCyanManta ? 0x0cf5e4 : 0xb538ff,
          map: this.stage0Textures.mantaMap,
          normalMap: this.stage0Textures.mantaNormal,
          normalScale: new THREE.Vector2(1.8, 1.8),
          emissive: isCyanManta ? 0x00b4d8 : 0x7209b7,
          emissiveMap: this.stage0Textures.mantaMap,
          emissiveIntensity: 0.85,
          roughness: 0.26,
          metalness: 0.22,
          side: THREE.DoubleSide
        });

        const mantaMesh = new THREE.Mesh(mGeo, mMat);
        mantaMesh.rotation.x = -Math.PI / 2;
        mantaGroup.add(mantaMesh);

        // Ventral bioluminescent underbelly layer for volumetric thickness
        const bellyMat = new THREE.MeshStandardMaterial({
          color: 0xd8ffff,
          emissive: isCyanManta ? 0x00f5d4 : 0xff00a0,
          emissiveIntensity: 0.45,
          roughness: 0.3
        });
        const torsoCoreGeo = new THREE.SphereGeometry(0.68, 24, 18);
        torsoCoreGeo.scale(1.15, 0.32, 2.3);
        const torsoCoreMesh = new THREE.Mesh(torsoCoreGeo, bellyMat);
        torsoCoreMesh.position.set(0, -0.06, 0.15);
        mantaGroup.add(torsoCoreMesh);

        // 2 Curved 3D Cephalic Fins (Horns) + Lateral Bioluminescent Eyes
        for (let side of [-1, 1]) {
          const hornCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * 0.48, 0.02, 1.65),
            new THREE.Vector3(side * 0.62, -0.04, 2.25),
            new THREE.Vector3(side * 0.42, -0.10, 2.75)
          ]);
          const hornGeo = new THREE.TubeGeometry(hornCurve, 16, 0.11, 10, false);
          const hornMesh = new THREE.Mesh(hornGeo, mMat);
          mantaGroup.add(hornMesh);

          const eyeGeo = new THREE.SphereGeometry(0.09, 14, 12);
          const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
          eyeMesh.position.set(side * 0.62, 0.06, 1.78);
          mantaGroup.add(eyeMesh);
        }

        // Dorsal fin + Long whip-like tail
        const tailCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.04, -1.7),
          new THREE.Vector3(0, 0.0, -3.4),
          new THREE.Vector3(0, -0.05, -5.2)
        ]);
        const tailGeo = new THREE.TubeGeometry(tailCurve, 16, 0.055, 8, false);
        const tailMesh = new THREE.Mesh(tailGeo, mMat);
        mantaGroup.add(tailMesh);

        const orbitOffset = (m / numMantas) * Math.PI * 2;
        mantaGroup.position.set(Math.cos(orbitOffset) * 20.0, -3.0 + m * 2.2, -13.0 + Math.sin(orbitOffset) * 14.0);

        this.stage0Group.add(mantaGroup);
        this.stage0MantaRays.push({
          group: mantaGroup,
          mesh: mantaMesh,
          tail: tailMesh,
          geo: mGeo,
          orbitOffset,
          speed: 0.30 + m * 0.05
        });
      }

      // ------------------------------------------------------------------------
      // 8. 3D BIOLUMINESCENT HUMPBACK LEVIATHAN WHALE (64x48 Sculpted Anatomy)
      // ------------------------------------------------------------------------
      const whaleGroup = new THREE.Group();

      // Sculpted 64x48 hydro-streamlined whale body
      const whaleBodyGeo = new THREE.SphereGeometry(1.0, 64, 48);
      const wPos = whaleBodyGeo.attributes.position;
      for (let i = 0; i < wPos.count; i++) {
        let vx = wPos.getX(i);
        let vy = wPos.getY(i);
        let vz = wPos.getZ(i); // -1 (tail) to +1 (rostrum/head)

        // Elongate along Z axis (total body length ~12.5 units)
        const zNorm = vz;
        let widthProfile = 1.0;
        let heightProfile = 1.0;

        if (zNorm > 0.0) {
          // Broad rostrum & arched cranium with ventral throat pouch
          widthProfile = 1.35 * Math.cos(zNorm * Math.PI * 0.46);
          heightProfile = vy < 0
            ? 1.45 * Math.cos(zNorm * Math.PI * 0.44) // Deep pleated throat pouch
            : 0.95 * Math.cos(zNorm * Math.PI * 0.48);
        } else {
          // Sleek tapering caudal peduncle toward tail fluke
          const tailT = Math.abs(zNorm);
          widthProfile = 1.35 * Math.pow(1.0 - tailT * 0.88, 1.5);
          heightProfile = 1.15 * Math.pow(1.0 - tailT * 0.84, 1.3);
        }

        // Rostral tubercles & dorsal ridge hump
        const dorsalArch = (vy > 0 && zNorm < -0.15 && zNorm > -0.55)
          ? Math.exp(-Math.pow((zNorm + 0.35) * 6.5, 2.0)) * 0.35
          : 0.0;
        // Ventral rorqual throat grooves
        const throatGrooves = (vy < -0.15 && zNorm > -0.1 && zNorm < 0.85)
          ? Math.sin(vx * 28.0) * 0.045
          : 0.0;

        wPos.setXYZ(
          i,
          vx * widthProfile * 1.45,
          vy * heightProfile * 1.35 + dorsalArch + throatGrooves,
          vz * 6.2
        );
      }
      whaleBodyGeo.computeVertexNormals();
      whaleBodyGeo.userData = { origPos: whaleBodyGeo.attributes.position.clone() };

      const whaleMat = new THREE.MeshStandardMaterial({
        color: 0x0d2847,
        map: this.stage0Textures.whaleMap,
        normalMap: this.stage0Textures.whaleNormal,
        normalScale: new THREE.Vector2(2.2, 2.2),
        emissive: 0x00f5d4,
        emissiveMap: this.stage0Textures.whaleEmissive,
        emissiveIntensity: 0.95,
        roughness: 0.35,
        metalness: 0.25
      });

      const whaleBodyMesh = new THREE.Mesh(whaleBodyGeo, whaleMat);
      whaleGroup.add(whaleBodyMesh);

      // Sculpted Humpback Pectoral Flippers (ExtrudeGeometry with scalloped leading edge)
      const flipperShape = new THREE.Shape();
      flipperShape.moveTo(0, 0);
      flipperShape.bezierCurveTo(1.2, 0.45, 2.8, 0.25, 4.2, -0.55);
      flipperShape.bezierCurveTo(3.4, -0.95, 1.8, -0.85, 0, -0.55);
      flipperShape.closePath();

      const flipperGeo = new THREE.ExtrudeGeometry(flipperShape, {
        depth: 0.14,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 2,
        bevelSize: 0.08,
        bevelThickness: 0.08
      });

      const leftFlipper = new THREE.Mesh(flipperGeo, whaleMat);
      leftFlipper.position.set(1.35, -0.55, 1.1);
      leftFlipper.rotation.set(0.25, -0.25, -0.35);
      whaleGroup.add(leftFlipper);

      const rightFlipper = new THREE.Mesh(flipperGeo, whaleMat);
      rightFlipper.scale.x = -1;
      rightFlipper.position.set(-1.35, -0.55, 1.1);
      rightFlipper.rotation.set(0.25, 0.25, 0.35);
      whaleGroup.add(rightFlipper);

      // Articulated Double-Lobed Tail Fluke (ExtrudeGeometry)
      const flukeGroup = new THREE.Group();
      flukeGroup.position.set(0, 0.05, -5.95);

      const flukeShape = new THREE.Shape();
      flukeShape.moveTo(0, 0);
      flukeShape.bezierCurveTo(1.1, 0.15, 2.2, -0.25, 2.85, -0.95);
      flukeShape.bezierCurveTo(1.8, -0.9, 0.7, -0.55, 0, -0.72);
      flukeShape.bezierCurveTo(-0.7, -0.55, -1.8, -0.9, -2.85, -0.95);
      flukeShape.bezierCurveTo(-2.2, -0.25, -1.1, 0.15, 0, 0);

      const flukeGeo = new THREE.ExtrudeGeometry(flukeShape, {
        depth: 0.1,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.06,
        bevelThickness: 0.06
      });
      const flukeMesh = new THREE.Mesh(flukeGeo, whaleMat);
      flukeMesh.rotation.x = Math.PI / 2;
      flukeGroup.add(flukeMesh);
      whaleGroup.add(flukeGroup);

      // Glowing Leviathan Eyes
      for (let side of [-1, 1]) {
        const eyeMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x00f5d4 })
        );
        eyeMesh.position.set(side * 1.52, 0.08, 2.65);
        whaleGroup.add(eyeMesh);
      }

      whaleGroup.position.set(-24.0, 5.5, -26.0);
      this.stage0Group.add(whaleGroup);
      this.stage0Whales.push({
        group: whaleGroup,
        bodyGeo: whaleBodyGeo,
        mat: whaleMat,
        leftFlipper,
        rightFlipper,
        flukeGroup,
        orbitPhase: 0.4
      });

      // ------------------------------------------------------------------------
      // 9. 3D SEA TURTLES WITH HEXAGONAL SCUTE CARAPACE & ARTICULATED FLIPPERS
      // ------------------------------------------------------------------------
      const numTurtles = 3;
      const shellGeo = new THREE.SphereGeometry(1.15, 48, 32);
      const sPos = shellGeo.attributes.position;
      for (let i = 0; i < sPos.count; i++) {
        let vx = sPos.getX(i);
        let vy = sPos.getY(i);
        let vz = sPos.getZ(i);
        // Flatten plastron & sculpt domed marginal ridge carapace
        if (vy < 0) vy *= 0.28;
        else vy *= 0.58;
        // Heart-shaped taper toward rear pygal scute
        const taper = 1.0 + vz * 0.14;
        sPos.setXYZ(i, vx * 0.92 * taper, vy, vz * 1.25);
      }
      shellGeo.computeVertexNormals();

      const turtleFlipperGeo = new THREE.SphereGeometry(0.45, 24, 16);
      turtleFlipperGeo.scale(2.1, 0.14, 0.58);
      turtleFlipperGeo.translate(0.75, 0, 0);

      for (let t = 0; t < numTurtles; t++) {
        const turtleGroup = new THREE.Group();

        const shellMat = new THREE.MeshStandardMaterial({
          color: 0x00d2c0,
          map: this.stage0Textures.turtleMap,
          normalMap: this.stage0Textures.turtleNormal,
          normalScale: new THREE.Vector2(2.4, 2.4),
          emissive: 0x008b8b,
          emissiveMap: this.stage0Textures.turtleMap,
          emissiveIntensity: 0.65,
          roughness: 0.3,
          metalness: 0.2
        });

        const shellMesh = new THREE.Mesh(shellGeo, shellMat);
        turtleGroup.add(shellMesh);

        // Sculpted turtle head + eyes
        const headGeo = new THREE.SphereGeometry(0.32, 24, 18);
        headGeo.scale(0.85, 0.78, 1.25);
        const headMesh = new THREE.Mesh(headGeo, shellMat);
        headMesh.position.set(0, -0.04, 1.52);
        turtleGroup.add(headMesh);

        // 4 Articulated Flippers (Front & Rear pairs)
        const flFrontL = new THREE.Mesh(turtleFlipperGeo, shellMat);
        flFrontL.position.set(0.85, -0.1, 0.65);
        turtleGroup.add(flFrontL);

        const flFrontR = new THREE.Mesh(turtleFlipperGeo, shellMat);
        flFrontR.scale.x = -1;
        flFrontR.position.set(-0.85, -0.1, 0.65);
        turtleGroup.add(flFrontR);

        const flRearL = new THREE.Mesh(turtleFlipperGeo, shellMat);
        flRearL.scale.set(0.55, 0.55, 0.55);
        flRearL.position.set(0.68, -0.12, -0.95);
        flRearL.rotation.y = -0.55;
        turtleGroup.add(flRearL);

        const flRearR = new THREE.Mesh(turtleFlipperGeo, shellMat);
        flRearR.scale.set(-0.55, 0.55, 0.55);
        flRearR.position.set(-0.68, -0.12, -0.95);
        flRearR.rotation.y = 0.55;
        turtleGroup.add(flRearR);

        const tScale = 0.72 + t * 0.14;
        turtleGroup.scale.set(tScale, tScale, tScale);

        this.stage0Group.add(turtleGroup);
        this.stage0Turtles.push({
          group: turtleGroup,
          flFrontL,
          flFrontR,
          flRearL,
          flRearR,
          orbitPhase: (t / numTurtles) * Math.PI * 2 + 1.2,
          speed: 0.36 + t * 0.06,
          radiusX: 16.0 + t * 3.5,
          radiusZ: 10.0 + t * 2.5,
          baseY: -6.5 + t * 3.2
        });
      }

      // ------------------------------------------------------------------------
      // 10. SCHOOL OF 25 BIOLUMINESCENT ABYSSAL FISH (3D Fusiform + Tail Fin)
      // ------------------------------------------------------------------------
      const numFish = 25;
      const fishBodyGeo = new THREE.SphereGeometry(0.32, 24, 16);
      fishBodyGeo.scale(0.42, 0.72, 1.75);

      const fishTailShape = new THREE.Shape();
      fishTailShape.moveTo(0, 0);
      fishTailShape.lineTo(0, 0.32);
      fishTailShape.lineTo(-0.38, 0.12);
      fishTailShape.lineTo(0, -0.32);
      fishTailShape.closePath();
      const fishTailGeo = new THREE.ShapeGeometry(fishTailShape);
      fishTailGeo.rotateY(Math.PI / 2);

      const fishMatCyan = new THREE.MeshStandardMaterial({
        color: 0x00f5d4,
        map: this.stage0Textures.fishMap,
        normalMap: this.stage0Textures.fishNormal,
        emissive: 0x00d4ff,
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.45,
        side: THREE.DoubleSide
      });

      const fishMatMagenta = new THREE.MeshStandardMaterial({
        color: 0xff2a85,
        map: this.stage0Textures.fishMap,
        normalMap: this.stage0Textures.fishNormal,
        emissive: 0xff00a0,
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.45,
        side: THREE.DoubleSide
      });

      for (let f = 0; f < numFish; f++) {
        const fishGroup = new THREE.Group();
        const fMat = f % 3 === 0 ? fishMatMagenta : fishMatCyan;

        const bodyMesh = new THREE.Mesh(fishBodyGeo, fMat);
        fishGroup.add(bodyMesh);

        const tailMesh = new THREE.Mesh(fishTailGeo, fMat);
        tailMesh.position.set(0, 0, -0.52);
        fishGroup.add(tailMesh);

        const fScale = 0.65 + (f % 5) * 0.14;
        fishGroup.scale.set(fScale, fScale, fScale);

        this.stage0Group.add(fishGroup);
        this.stage0FishSchool.push({
          group: fishGroup,
          tail: tailMesh,
          offsetAngle: (f / numFish) * Math.PI * 0.65,
          localOffset: new THREE.Vector3(
            ((f % 5) - 2) * 1.15,
            (Math.floor(f / 5) - 2) * 0.75,
            ((f * 7) % 5 - 2) * 1.1
          ),
          swimPhase: f * 0.6
        });
      }

      // ------------------------------------------------------------------------
      // 11. HYDROTHERMAL VENTS, RISING BUBBLE STREAMS & SWAYING KELP FORESTS
      // ------------------------------------------------------------------------
      const ventCount = 4;
      for (let v = 0; v < ventCount; v++) {
        const ventGroup = new THREE.Group();
        const vHeight = 4.8 + (v % 2) * 1.8;
        const vGeo = new THREE.CylinderGeometry(0.38, 0.88, vHeight, 24, 16);
        // Sculpt craggy volcanic chimney surface
        const vp = vGeo.attributes.position;
        for (let i = 0; i < vp.count; i++) {
          const vx = vp.getX(i);
          const vy = vp.getY(i);
          const vz = vp.getZ(i);
          const crag = 1.0 + 0.15 * Math.sin(vy * 3.2 + vx * 4.0) * Math.cos(vz * 4.0);
          vp.setXYZ(i, vx * crag, vy, vz * crag);
        }
        vGeo.computeVertexNormals();

        const vMat = new THREE.MeshStandardMaterial({
          color: 0x16202e,
          normalMap: this.stage0Textures.seabedNormal,
          normalScale: new THREE.Vector2(2.0, 2.0),
          roughness: 0.75,
          metalness: 0.25
        });
        const vMesh = new THREE.Mesh(vGeo, vMat);
        ventGroup.add(vMesh);

        const rimGeo = new THREE.TorusGeometry(0.4, 0.09, 12, 24);
        const rimMat = new THREE.MeshBasicMaterial({ color: v % 2 === 0 ? 0x00f5d4 : 0xff00a0 });
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);
        rimMesh.rotation.x = Math.PI / 2;
        rimMesh.position.set(0, vHeight * 0.5, 0);
        ventGroup.add(rimMesh);

        const vx = -21 + v * 14;
        const vz = -15 - (v % 2) * 6;
        ventGroup.position.set(vx, -12.2 + vHeight * 0.5, vz);

        this.stage0Group.add(ventGroup);
        this.stage0Vents.push({ group: ventGroup, tipY: -12.2 + vHeight, vx, vz });
      }

      // Rising Bubble Streams (75 glossy bubbles)
      const numBubbles = 75;
      const bubbleGeo = new THREE.SphereGeometry(0.2, 14, 12);
      const bubbleMat = new THREE.MeshStandardMaterial({
        color: 0x90f5ff,
        emissive: 0x00acc1,
        emissiveIntensity: 0.55,
        roughness: 0.08,
        metalness: 0.15,
        transparent: true,
        opacity: 0.55
      });

      for (let b = 0; b < numBubbles; b++) {
        const bMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
        const bx = (Math.random() - 0.5) * 40;
        const by = -16 + Math.random() * 32;
        const bz = (b < 22) ? (3.2 + Math.random() * 5.5) : (-4 - Math.random() * 24);
        bMesh.position.set(bx, by, bz);
        const bScale = 0.4 + Math.random() * 0.9;
        bMesh.scale.set(bScale, bScale, bScale);

        this.stage0Group.add(bMesh);
        this.stage0Bubbles.push({
          mesh: bMesh,
          speed: 1.3 + Math.random() * 2.1,
          wobbleOffset: Math.random() * Math.PI * 2,
          baseX: bx
        });
      }

      // Detailed Abyssal Kelp Forests (Segmented Stalks + Frond Leaves)
      const floraCount = 22;
      const leafGeo = new THREE.PlaneGeometry(0.42, 1.15, 4, 8);
      leafGeo.translate(0.22, 0, 0);

      for (let f = 0; f < floraCount; f++) {
        const kelpGroup = new THREE.Group();
        const kelpH = 6.2 + (f % 4) * 1.4;
        const floraGeo = new THREE.CylinderGeometry(0.06, 0.20, kelpH, 12, 16);
        const isEmerald = f % 3 !== 0;
        const floraMat = new THREE.MeshStandardMaterial({
          color: isEmerald ? 0x004d40 : 0x1a1b4b,
          emissive: isEmerald ? 0x00f59b : 0x00d4ff,
          emissiveIntensity: 0.68,
          roughness: 0.28,
          side: THREE.DoubleSide
        });

        const stalkMesh = new THREE.Mesh(floraGeo, floraMat);
        kelpGroup.add(stalkMesh);

        // Attach 6 Bioluminescent Kelp Frond Blades along the stalk
        for (let l = 0; l < 6; l++) {
          const frond = new THREE.Mesh(leafGeo, floraMat);
          const ly = -kelpH * 0.35 + (l / 5) * (kelpH * 0.75);
          frond.position.set(0, ly, 0);
          frond.rotation.y = l * 1.15;
          frond.rotation.z = (l % 2 === 0 ? 1 : -1) * 0.45;
          kelpGroup.add(frond);
        }

        const side = f % 2 === 0 ? -1 : 1;
        const fx = side * (9.5 + (f / floraCount) * 18.0);
        const fy = -13.2 + kelpH * 0.35;
        const fz = -9.5 - (f % 5) * 3.4;
        kelpGroup.position.set(fx, fy, fz);

        this.stage0Group.add(kelpGroup);
        this.stage0Flora.push({
          mesh: kelpGroup,
          offset: f * 0.7,
          rotZBase: (Math.random() - 0.5) * 0.18
        });
      }
    }

    // ==========================================================================
    // 3. STAGE 0 FRAME-BY-FRAME ANIMATION UPDATE (Inside updateEnvironments)
    // ==========================================================================
    updateStage0Abismo(dt, elapsed) {
      if (!this.stage0Group || !this.stage0Group.visible) return;

      const pulse = this.beatPulseValue || 0.0;

      // 1. Dynamic Underwater Point Lights Pulsing with BPM & Orbiting Slowly
      if (this.stage0Lights && this.stage0Lights.length) {
        this.stage0Lights.forEach((lObj, idx) => {
          lObj.light.intensity = lObj.baseIntensity + pulse * 2.4 + Math.sin(elapsed * 2.2 + lObj.phase) * 0.45;
          lObj.light.position.x = lObj.basePos.x + Math.sin(elapsed * 0.7 + lObj.phase) * 4.5;
          lObj.light.position.y = lObj.basePos.y + Math.cos(elapsed * 0.9 + lObj.phase) * 2.0;
        });
      }

      // 2. Seabed Caustic Filaments & Coral Reef BPM Glow
      if (this.stage0SeabedMat) {
        this.stage0SeabedMat.emissiveIntensity = 0.68 + pulse * 0.85 + Math.sin(elapsed * 1.8) * 0.12;
        if (this.stage0Textures && this.stage0Textures.seabedEmissive) {
          this.stage0Textures.seabedEmissive.offset.x = Math.sin(elapsed * 0.15) * 0.08;
          this.stage0Textures.seabedEmissive.offset.y = elapsed * 0.03;
        }
      }

      if (this.stage0Corals && this.stage0Corals.length) {
        this.stage0Corals.forEach(c => {
          c.mat.emissiveIntensity = c.baseEmissive + pulse * 0.75 + Math.sin(elapsed * 2.5 + c.phase) * 0.15;
        });
      }

      if (this.stage0Anemones && this.stage0Anemones.length) {
        this.stage0Anemones.forEach(an => {
          an.tentacles.forEach(t => {
            t.mesh.rotation.x = t.baseRotX + Math.sin(elapsed * 2.8 + t.phase) * 0.18;
            t.mesh.rotation.z = t.baseRotZ + Math.cos(elapsed * 2.4 + t.phase) * 0.18;
          });
        });
      }

      // 3. GLSL Ocean Water & Volumetric God-Rays
      if (this.stage0WaterMat) {
        this.stage0WaterMat.uniforms.uTime.value = elapsed;
        this.stage0WaterMat.uniforms.uBeatPulse.value = pulse;
      }

      this.stage0GodRays.forEach(g => {
        g.mat.uniforms.uTime.value = elapsed;
        g.mat.uniforms.uBeatPulse.value = pulse;
      });

      // 4. Sculpted 3D Bioluminescent Manta Rays (Preserving 3D Body Thickness)
      this.stage0MantaRays.forEach((ray, rIdx) => {
        const t = elapsed * ray.speed + ray.orbitOffset;
        const isFg = (rIdx % 2 === 0);
        const zCenter = isFg ? -4.5 : -14.5;
        const zAmp = isFg ? 11.5 : 12.0; // Sweeps up to Z = +7.0 in front of the Tetris box!
        const rx = Math.sin(t) * 16.5 + Math.cos(t * 2.0) * 2.5;
        const rz = zCenter + Math.cos(t) * zAmp;
        const ry = -3.2 + Math.sin(t * 1.5) * 4.5;
        ray.group.position.set(rx, ry, rz);

        const nextT = t + 0.05;
        const nx = Math.sin(nextT) * 16.5 + Math.cos(nextT * 2.0) * 2.5;
        const nz = zCenter + Math.cos(nextT) * zAmp;
        const ny = -3.2 + Math.sin(nextT * 1.5) * 4.5;
        ray.group.lookAt(nx, ny, nz);

        // Graceful travelling wave wing kinematics
        const posAttr = ray.geo.attributes.position;
        const orig = ray.geo.userData.origPos;
        for (let i = 0; i < posAttr.count; i++) {
          const ox = orig.getX(i);
          const oy = orig.getY(i);
          const oz = orig.getZ(i);
          const spanDist = Math.abs(ox);
          const flap = Math.sin(elapsed * 3.4 - spanDist * 0.75 - oy * 0.35 + ray.orbitOffset)
                       * Math.pow(spanDist * 0.32, 1.35) * 0.95;
          posAttr.setZ(i, oz + flap);
        }
        posAttr.needsUpdate = true;

        if (ray.tail) {
          ray.tail.rotation.y = Math.sin(elapsed * 3.4 + ray.orbitOffset) * 0.14;
        }

        if (Math.random() < 0.25 && this.particlePool) {
          this.particlePool.spawn(
            rx + (Math.random() > 0.5 ? 2.6 : -2.6), ry, rz,
            (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4,
            0.0, 0.96, 0.83,
            0.6, 1.2, 0.96
          );
        }
      });

      // 5. High-Geometry 64-Segment Jellyfish with 3D Tubular Tentacles & Oral Arms
      this.stage0Jellyfish.forEach(j => {
        const swimPhase = (elapsed * 2.2 + j.swimOffset) % (Math.PI * 2);
        const stroke = Math.sin(swimPhase);

        const scaleY = j.baseScale * (stroke > 0 ? 1.0 + stroke * 0.32 : 1.0 + stroke * 0.14);
        const scaleXZ = j.baseScale * (stroke > 0 ? 1.0 - stroke * 0.22 : 1.0 - stroke * 0.10);
        j.bell.scale.set(scaleXZ, scaleY, scaleXZ);

        j.bell.material.emissiveIntensity = 0.8 + (stroke > 0 ? stroke * 0.45 : 0) + pulse * 0.85;

        j.group.position.y += j.speedY * dt * (stroke > 0 ? 1.6 : 0.7);
        j.group.position.x = j.initialX + Math.sin(elapsed * 0.65 + j.swimOffset) * 0.85;
        if (j.group.position.y > 18) {
          j.group.position.y = -18;
        }

        if (j.oralArms) {
          j.oralArms.forEach((arm, aIdx) => {
            arm.mesh.rotation.y = arm.baseRotY + Math.sin(elapsed * 1.8 + aIdx) * 0.25;
            arm.mesh.rotation.z = Math.cos(elapsed * 2.1 + aIdx) * 0.08;
          });
        }

        j.tentacles.forEach((tMesh, tidx) => {
          const posAttr = tMesh.geometry.attributes.position;
          const orig = tMesh.geometry.userData.origPos;
          for (let v = 0; v < posAttr.count; v++) {
            const ox = orig.getX(v);
            const oy = orig.getY(v);
            const oz = orig.getZ(v);
            const depthRatio = Math.min(1.0, Math.abs(oy) / 4.8);
            const waveX = Math.sin(elapsed * 3.1 - depthRatio * 4.2 + tidx * 0.5) * (depthRatio * 0.38);
            const waveZ = Math.cos(elapsed * 2.7 - depthRatio * 3.8 + tidx * 0.5) * (depthRatio * 0.35);
            posAttr.setXYZ(v, ox + waveX, oy, oz + waveZ);
          }
          posAttr.needsUpdate = true;
        });
      });

      // 6. 3D Humpback Leviathan Whale Majestic Abyssal Swim & BPM Bioluminescence
      if (this.stage0Whales && this.stage0Whales.length) {
        this.stage0Whales.forEach(w => {
          const wt = elapsed * 0.14 + w.orbitPhase;
          const wx = Math.sin(wt) * 29.0;
          const wz = -24.0 + Math.cos(wt) * 11.0;
          const wy = 4.2 + Math.sin(wt * 2.0) * 3.2;
          w.group.position.set(wx, wy, wz);

          const nextWt = wt + 0.03;
          w.group.lookAt(
            Math.sin(nextWt) * 29.0,
            4.2 + Math.sin(nextWt * 2.0) * 3.2,
            -24.0 + Math.cos(nextWt) * 11.0
          );

          // Caudal spine & tail fluke vertical undulation
          const flukeBeat = Math.sin(elapsed * 2.1);
          w.flukeGroup.rotation.x = flukeBeat * 0.38;
          w.flukeGroup.position.y = 0.05 + Math.cos(elapsed * 2.1) * 0.22;

          w.leftFlipper.rotation.z = -0.35 + Math.sin(elapsed * 1.6) * 0.18;
          w.rightFlipper.rotation.z = 0.35 - Math.sin(elapsed * 1.6) * 0.18;
          w.mat.emissiveIntensity = 0.85 + pulse * 1.35 + Math.sin(elapsed * 2.0) * 0.2;
        });
      }

      // 7. 3D Sea Turtles Graceful Hydrofoil Flipper Stroke
      if (this.stage0Turtles && this.stage0Turtles.length) {
        this.stage0Turtles.forEach((tr, idx) => {
          const tt = elapsed * tr.speed + tr.orbitPhase;
          const isFg = (idx === 0);
          const radX = isFg ? 13.5 : tr.radiusX;
          const zMid = isFg ? -3.0 : -13.5;
          const radZ = isFg ? 10.2 : tr.radiusZ; // Reaches Z = +7.2 in front of the Tetris box!
          const tx = Math.cos(tt) * radX;
          const tz = zMid + Math.sin(tt) * radZ;
          const ty = tr.baseY + Math.sin(tt * 1.8) * 1.8;
          tr.group.position.set(tx, ty, tz);

          const nextTt = tt + 0.04;
          tr.group.lookAt(
            Math.cos(nextTt) * radX,
            tr.baseY + Math.sin(nextTt * 1.8) * 1.8,
            zMid + Math.sin(nextTt) * radZ
          );

          const stroke = Math.sin(elapsed * 3.2 + idx * 1.4);
          tr.flFrontL.rotation.z = stroke * 0.48;
          tr.flFrontL.rotation.y = Math.cos(elapsed * 3.2 + idx * 1.4) * 0.22;
          tr.flFrontR.rotation.z = -stroke * 0.48;
          tr.flFrontR.rotation.y = -Math.cos(elapsed * 3.2 + idx * 1.4) * 0.22;
        });
      }

      // 8. Cohesive School of 25 Bioluminescent Abyssal Fish
      if (this.stage0FishSchool && this.stage0FishSchool.length) {
        const schoolT = elapsed * 0.48;
        this.stage0FishSchool.forEach((fish, fIdx) => {
          const t = schoolT - fish.offsetAngle * 0.25;
          const centerX = Math.cos(t) * 13.5 + Math.sin(t * 2.0) * 2.5;
          const centerY = -0.5 + Math.sin(t * 1.5) * 4.8;
          const centerZ = -3.5 + Math.sin(t) * 10.8; // Sweeps up to Z = +7.3 in front of the board!

          const fx = centerX + fish.localOffset.x + Math.sin(elapsed * 2.5 + fish.swimPhase) * 0.35;
          const fy = centerY + fish.localOffset.y + Math.cos(elapsed * 2.1 + fish.swimPhase) * 0.25;
          const fz = centerZ + fish.localOffset.z;
          fish.group.position.set(fx, fy, fz);

          const nt = t + 0.05;
          const ncx = Math.cos(nt) * 13.5 + Math.sin(nt * 2.0) * 2.5 + fish.localOffset.x;
          const ncy = -0.5 + Math.sin(nt * 1.5) * 4.8 + fish.localOffset.y;
          const ncz = -3.5 + Math.sin(nt) * 10.8 + fish.localOffset.z;
          fish.group.lookAt(ncx, ncy, ncz);

          fish.tail.rotation.y = Math.sin(elapsed * 12.0 + fish.swimPhase) * 0.45;
        });
      }

      // 9. Hydrothermal Vent Plumes, Bubbles & Kelp Forest Sway
      this.stage0Vents.forEach(v => {
        if (Math.random() < 0.24 && this.particlePool) {
          this.particlePool.spawn(
            v.vx + (Math.random() - 0.5) * 0.6, v.tipY, v.vz + (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 0.6, 2.6 + Math.random() * 3.0, (Math.random() - 0.5) * 0.6,
            0.0, 0.96, 0.83,
            0.8, 1.8, 0.98
          );
        }
      });

      this.stage0Bubbles.forEach(b => {
        b.mesh.position.y += b.speed * dt;
        b.mesh.position.x = b.baseX + Math.sin(elapsed * 2.0 + b.wobbleOffset) * 0.45;
        if (b.mesh.position.y > 17) {
          b.mesh.position.y = -16;
        }
      });

      this.stage0Flora.forEach(f => {
        f.mesh.rotation.z = f.rotZBase + Math.sin(elapsed * 1.5 + f.offset) * 0.16;
        f.mesh.rotation.x = Math.cos(elapsed * 1.2 + f.offset) * 0.08;
      });
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
      // Stage 0: Bioluminescent Ocean Abyss (3D Seabed, Marine Fauna & Dynamic Lights)
      if (this.stage0Group && this.stage0Group.visible) {
        this.updateStage0Abismo(dt, elapsed);
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
