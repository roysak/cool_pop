/*************************************************************************
 * 1. YOUTUBE PLAYABLES SDK WRAPPER & FALLBACK MOCK
 *    Integrates official ytgame methods (firstFrameReady, gameReady,
 *    saveData, loadData, sendScore, system pause/audio) while supporting
 *    standalone web play.
 *************************************************************************/
const YTPlayables = (() => {
  let isNativeSDK = false;
  let audioEnabledByPlatform = true;
  let onPauseCallback = null;
  let onResumeCallback = null;
  let onAudioChangeCallback = null;

  function init({ onPause, onResume, onAudioChange, onCloudDataLoaded }) {
    onPauseCallback = onPause;
    onResumeCallback = onResume;
    onAudioChangeCallback = onAudioChange;

    const statusDot = document.getElementById('sdkStatusDot');
    const statusText = document.getElementById('sdkStatusText');

    if (typeof window.ytgame !== 'undefined' && window.ytgame.IN_PLAYABLES_ENV) {
      isNativeSDK = true;
      try {
        window.ytgame.game.firstFrameReady();

        // Register lifecycle hooks
        if (window.ytgame.system) {
          window.ytgame.system.onPause(() => {
            if (onPauseCallback) onPauseCallback();
          });
          window.ytgame.system.onResume(() => {
            if (onResumeCallback) onResumeCallback();
          });
          window.ytgame.system.onAudioEnabledChange((isEnabled) => {
            audioEnabledByPlatform = Boolean(isEnabled);
            if (onAudioChangeCallback) onAudioChangeCallback(audioEnabledByPlatform);
          });
          if (typeof window.ytgame.system.isAudioEnabled === 'function') {
            audioEnabledByPlatform = Boolean(window.ytgame.system.isAudioEnabled());
            if (onAudioChangeCallback) onAudioChangeCallback(audioEnabledByPlatform);
          }
        }

        // Load cloud data from YouTube Playables before signaling gameReady
        if (typeof window.ytgame.game.loadData === 'function') {
          window.ytgame.game.loadData().then((dataStr) => {
            if (dataStr && onCloudDataLoaded) {
              try {
                const parsed = JSON.parse(dataStr);
                onCloudDataLoaded(parsed);
              } catch (e) {}
            }
          }).catch(() => {}).finally(() => {
            window.ytgame.game.gameReady();
          });
        } else {
          window.ytgame.game.gameReady();
        }

        statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        statusText.textContent = 'YouTube Playables';
      } catch (err) {
        console.warn('YT Playables SDK init fallback:', err);
      }
    } else {
      // Graceful standalone browser mock matching official ytgame API surface
      window.ytgame = {
        IN_PLAYABLES_ENV: false,
        game: {
          firstFrameReady: () => {},
          gameReady: () => {},
          saveData: (dataStr) => Promise.resolve(),
          loadData: () => Promise.resolve('')
        },
        engagement: {
          sendScore: (payload) => Promise.resolve()
        },
        system: {
          isAudioEnabled: () => audioEnabledByPlatform,
          onAudioEnabledChange: () => {},
          onPause: () => {},
          onResume: () => {}
        }
      };
      window.ytgame.game.firstFrameReady();
      window.ytgame.game.gameReady();
      statusDot.className = 'w-2 h-2 rounded-full bg-sky-500';
      statusText.textContent = 'Made for a little play';
    }

    // Also pause automatically if browser tab loses visibility
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && onPauseCallback) {
        onPauseCallback();
      }
    });
  }

  function sendScore(scoreValue) {
    const numericScore = Math.max(0, Math.floor(scoreValue));
    try {
      if (window.ytgame && window.ytgame.engagement && typeof window.ytgame.engagement.sendScore === 'function') {
        window.ytgame.engagement.sendScore({ value: numericScore });
      }
    } catch (err) {
      console.warn('Failed to send score to YT SDK:', err);
    }
  }

  function saveCloudData(bestScoreValue) {
    try {
      if (window.ytgame && window.ytgame.game && typeof window.ytgame.game.saveData === 'function') {
        const payload = JSON.stringify({ bestScore: Math.max(0, Math.floor(bestScoreValue)) });
        window.ytgame.game.saveData(payload).catch(() => {});
      }
    } catch (err) {}
  }

  return {
    init,
    sendScore,
    saveCloudData,
    isNative: () => isNativeSDK
  };
})();

/*************************************************************************
 * 2. SYNTHESIZED WEB AUDIO API SOUND ENGINE
 *    Crisp glassy marimba pops for safe tiles, low buzz/thud for red tiles,
 *    and harmonic level-up chimes. Zero external audio assets needed.
 *************************************************************************/
const SoundFX = (() => {
  let ctx = null;
  let userMuted = false;
  let platformAudioEnabled = true;

  // Pentatonic cool frequencies for combo progression
  const COMBO_SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function canPlay() {
    return !userMuted && platformAudioEnabled;
  }

  function playSafeTap(comboCount = 1) {
    if (!canPlay()) return;
    ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const noteIndex = Math.min(comboCount - 1, COMBO_SCALE.length - 1);
    const baseFreq = COMBO_SCALE[Math.max(0, noteIndex)];

    // A short filtered rush of water beneath the pitched pop.
    const water = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.15), ctx.sampleRate);
    const samples = water.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const spray = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const sprayGain = ctx.createGain();
    spray.buffer = water;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3800, now);
    filter.frequency.exponentialRampToValueAtTime(650, now + 0.15);
    sprayGain.gain.setValueAtTime(0.11, now);
    sprayGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    spray.connect(filter);
    filter.connect(sprayGain);
    sprayGain.connect(ctx.destination);
    spray.start(now);

    // Primary sine-triangle glassy pop
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 0.92, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.18, now + 0.065);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.17);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);

    // Harmonic sparkle overtone
    const over = ctx.createOscillator();
    const overGain = ctx.createGain();
    over.type = 'sine';
    over.frequency.setValueAtTime(baseFreq * 2, now);
    overGain.gain.setValueAtTime(0.08, now);
    overGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);

    over.connect(overGain);
    overGain.connect(ctx.destination);
    over.start(now);
    over.stop(now + 0.12);
  }

  function playHazardHit() {
    if (!canPlay()) return;
    ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Low sawtooth/triangle dissonant thud
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(155, now);
    osc1.frequency.exponentialRampToValueAtTime(52, now + 0.28);

    osc2.frequency.setValueAtTime(118, now);
    osc2.frequency.exponentialRampToValueAtTime(42, now + 0.28);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.31);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.32);
    osc2.stop(now + 0.32);
  }

  function playSpeedUp() {
    if (!canPlay()) return;
    ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [587.33, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      gain.gain.setValueAtTime(0.001, now + idx * 0.055);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.055 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.055 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.19);
    });
  }

  function playSlowDown() {
    if (!canPlay()) return;
    ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [880, 659.25, 523.25].forEach((freq, idx) => {
      const start = now + idx * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.10, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.26);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.27);
    });
  }

  function playGameOver() {
    if (!canPlay()) return;
    ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [440, 392, 349.23, 293.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.15, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.25);
    });
  }

  function toggleUserMute() {
    userMuted = !userMuted;
    ensureContext();
    return userMuted;
  }

  function setPlatformAudio(enabled) {
    platformAudioEnabled = enabled;
  }

  function isMuted() {
    return userMuted || !platformAudioEnabled;
  }

  return {
    playSafeTap,
    playHazardHit,
    playSpeedUp,
    playSlowDown,
    playGameOver,
    toggleUserMute,
    setPlatformAudio,
    isMuted,
    ensureContext
  };
})();

/*************************************************************************
 * 3. COOL WATER BALLOON & HAZARD PALETTES
 *************************************************************************/
// Gameplay uses the supplied balloon artwork; palette colors drive splash FX and labels.
const COOL_SAFE_PALETTES = [
  {
    name: 'Cool Cyan',
    image: 'assets/balloons/b-cyan.webp',
    top: '#20D8DF',
    base: '#20BBDF',
    lip: '#2065DF',
    border: '#79DAE7',
    shadow: 'rgba(32, 164, 186, 0.34)',
    particle: '#20BBDF'
  },
  {
    name: 'Ocean Blue',
    image: 'assets/balloons/b-blue.webp',
    top: '#20BADF',
    base: '#336EE2',
    lip: '#491BBB',
    border: '#8DCDEC',
    shadow: 'rgba(27, 124, 174, 0.34)',
    particle: '#336EE2'
  },
  {
    name: 'Blue Green',
    image: 'assets/balloons/b-blue-green.webp',
    top: '#27D7C5',
    base: '#18B9B0',
    lip: '#087D83',
    border: '#8DE7DD',
    shadow: 'rgba(24, 185, 176, 0.34)',
    particle: '#18B9B0'
  },
  {
    name: 'Fresh Green',
    image: 'assets/balloons/b-green.webp',
    top: '#82DB42',
    base: '#4FC12D',
    lip: '#267E29',
    border: '#A8E58D',
    shadow: 'rgba(79, 193, 45, 0.34)',
    particle: '#4FC12D'
  },
  {
    name: 'Sunshine Yellow',
    image: 'assets/balloons/b-yellow.webp',
    top: '#F2E64B',
    base: '#DFC620',
    lip: '#A66D16',
    border: '#F5E892',
    shadow: 'rgba(223, 198, 32, 0.34)',
    particle: '#DFC620'
  },
  {
    name: 'Juicy Orange',
    image: 'assets/balloons/b-orange.webp',
    top: '#F7A944',
    base: '#E77B22',
    lip: '#A94718',
    border: '#F4C58D',
    shadow: 'rgba(231, 123, 34, 0.34)',
    particle: '#E77B22'
  },
  {
    name: 'Soft Violet',
    image: 'assets/balloons/b-purple.webp',
    top: '#D64FE6',
    base: '#A220DF',
    lip: '#5A19AE',
    border: '#B0BBF1',
    shadow: 'rgba(117, 119, 223, 0.34)',
    particle: '#A220DF'
  },
  {
    name: 'Deep Indigo',
    image: 'assets/balloons/b-indigo.webp',
    top: '#7377EC',
    base: '#5156D8',
    lip: '#30328F',
    border: '#AEB0F4',
    shadow: 'rgba(81, 86, 216, 0.34)',
    particle: '#5156D8'
  },
  {
    name: 'Rose Pop',
    image: 'assets/balloons/b-rose.webp',
    top: '#F06BA8',
    base: '#DE448B',
    lip: '#9E2B68',
    border: '#F4ACCD',
    shadow: 'rgba(222, 68, 139, 0.34)',
    particle: '#DE448B'
  }
];

const HAZARD_PALETTE = {
  name: 'Crimson Hazard',
  image: 'assets/balloons/b-red.webp',
  top: '#E75A71',
  base: '#E23350',
  lip: '#A6183C',
  border: '#F2AFB7',
  shadow: 'rgba(221, 86, 109, 0.42)',
  particle: '#DD566D'
};

const RAINBOW_COLORS = ['#E23350', '#DF8F20', '#DFC620', '#62CE1D', '#20BBDF', '#336EE2', '#A220DF'];
const RAINBOW_PALETTE = {
  name: 'Rainbow',
  image: 'assets/balloons/b-rainbow.webp',
  top: '#D64FE6',
  base: '#A220DF',
  lip: '#5A19AE',
  particle: RAINBOW_COLORS
};

const SLOW_PALETTE = {
  name: 'Frost',
  image: 'assets/balloons/b-blue.webp',
  top: '#8CEBFF',
  base: '#35C9F2',
  lip: '#155A9B',
  particle: ['#B9F5FF', '#5EDBF4', '#FFFFFF']
};

/*************************************************************************
 * 4. PARTICLE & FLOATING SCORE FX ENGINE (2D CANVAS)
 *************************************************************************/
const FXEngine = (() => {
  const canvas = document.getElementById('fxCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let ripples = [];
  let floatingTexts = [];
  let splashes = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resize);
  resize();

  function spawnBurst(x, y, color, isHazard = false) {
    const colors = Array.isArray(color) ? color : [color];
    // The water first spreads as an irregular sheet, then separates into droplets.
    const radius = Math.min(65, window.innerWidth * 0.14);
    splashes.push({ x, y, color: colors[0], age: 0, radius,
      lobes: Array.from({ length: 12 }, () => .65 + Math.random() * .55) });
    for (let i = 0; i < (reducedMotion.matches ? 1 : 2); i++) {
      ripples.push({ x, y, radius: 9 + i * 7, maxRadius: radius * (1.15 + i * .3),
        alpha: .5 - i * .13, color: colors[i % colors.length], lineWidth: 2 - i * .5 });
    }
    const count = reducedMotion.matches ? 0 : (isHazard ? 23 : 19);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
      const speed = 2.5 + Math.random() * 4.2;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.1,
        size: 2.5 + Math.random() * 4,
        alpha: .85,
        color: colors[i % colors.length],
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.2
      });
    }
  }

  function spawnFloatingText(x, y, text, color = '#1B7CAE', isLarge = false) {
    floatingTexts.push({
      x,
      y,
      text,
      color,
      alpha: 1,
      vy: -1.35,
      scale: isLarge ? 1.15 : 1
    });
  }

  function updateAndDraw(dt = 16.667) {
    const step = Math.min(3, dt / 16.667);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.age += dt;
      const progress = s.age / (reducedMotion.matches ? 150 : 360);
      if (progress >= 1) { splashes.splice(i, 1); continue; }
      const radius = s.radius * (.15 + .85 * (1 - Math.pow(1 - progress, 3)));
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.beginPath();
      for (let j = 0; j <= 120; j++) {
        const a = j / 120 * Math.PI * 2;
        const lobe = s.lobes[Math.floor(j / 10) % 12];
        const r = radius * (.73 + Math.sin(a * 12) * .16 * lobe);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * .78;
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.globalAlpha = (1 - progress) * .42;
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.globalAlpha = (1 - progress) * .65;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }

    // Draw ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.radius += (r.maxRadius - r.radius) * (1 - Math.pow(.88, step));
      r.alpha -= 0.018 * step;
      if (r.alpha <= 0.01) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.radius, r.radius * .65, 0, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.alpha);
      ctx.lineWidth = r.lineWidth;
      ctx.stroke();
      ctx.restore();
    }

    // Translucent water droplets stretch along their trajectory and fall with gravity.
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += 0.16 * step;
      p.vx *= Math.pow(.98, step);
      p.alpha -= .021 * step;

      if (p.alpha <= 0.01) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.25, p.size * .65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-p.size * .25, -p.size * .2, p.size * .45, p.size * .18, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffffbd';
      ctx.fill();
      ctx.restore();
    }

    // Draw floating score popups
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y += ft.vy * step * (reducedMotion.matches ? 0 : 1);
      ft.alpha -= .022 * step;
      if (ft.alpha <= 0.01) {
        floatingTexts.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = `800 ${Math.round(40 * ft.scale)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const halfWidth = ctx.measureText(ft.text).width / 2;
      const drawX = Math.max(halfWidth + 6, Math.min(window.innerWidth - halfWidth - 6, ft.x));
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = 'rgba(16, 56, 85, 0.35)';
      ctx.shadowBlur = 7;
      ctx.shadowOffsetY = 2;
      ctx.strokeText(ft.text, drawX, ft.y);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, drawX, ft.y);
      ctx.restore();
    }
  }

  return {
    spawnBurst,
    spawnFloatingText,
    updateAndDraw,
    clear() { particles = []; ripples = []; splashes = []; floatingTexts = []; }
  };
})();

/*************************************************************************
 * 5. CORE GAME CONTROLLER (6x6 INVISIBLE GRID + PROGRESSIVE DIFFICULTY)
 *************************************************************************/
const Game = (() => {
  const TOTAL_CELLS = 25;
  const MAX_LIVES = 3;
  const RAINBOW_CHANCE = 0.03; // 3% of safe spawns.
  const SLOW_CHANCE = 0.035;
  const SLOW_RELIEF_MS = 17000; // Rewind one speed level; the ramp resumes from there.
  const SLOW_SPAWN_COOLDOWN_MS = 25000;
  const STORAGE_KEY = 'cool_pop_yt_best_v1';
  const PREVIOUS_STORAGE_KEY = 'prism_tap_yt_best_v1';

  // DOM Elements
  const gridArena = document.getElementById('gridArena');
  const scoreDisplay = document.getElementById('scoreDisplay');
  const comboBadge = document.getElementById('comboBadge');
  const livesContainer = document.getElementById('livesContainer');
  const speedBadge = document.getElementById('speedBadge');
  const bestScoreHud = document.getElementById('bestScoreHud');
  const strictMissToggle = document.getElementById('strictMissToggle');
  const strictRuleDesc = document.getElementById('strictRuleDesc');
  const liveRuleHint = document.getElementById('liveRuleHint');
  const hazardFlashOverlay = document.getElementById('hazardFlashOverlay');
  const mainShakeContainer = document.getElementById('mainShakeContainer');

  // Modals
  const modalBackdrop = document.getElementById('modalBackdrop');
  const startModal = document.getElementById('startModal');
  const pauseModal = document.getElementById('pauseModal');
  const gameOverModal = document.getElementById('gameOverModal');

  // Summary elements
  const finalScoreText = document.getElementById('finalScoreText');
  const newRecordBadge = document.getElementById('newRecordBadge');
  const summaryBestScore = document.getElementById('summaryBestScore');
  const summaryMaxCombo = document.getElementById('summaryMaxCombo');
  const summaryAccuracy = document.getElementById('summaryAccuracy');
  const summaryPeakSpeed = document.getElementById('summaryPeakSpeed');

  // State variables
  let cellElements = [];
  let activeTiles = new Map(); // cellIndex -> tileData
  let state = 'IDLE'; // 'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
  let score = 0;
  let bestScore = 0;
  let roundBestScore = 0;
  let lives = MAX_LIVES;
  let combo = 0;
  let maxCombo = 0;
  let safeTappedCount = 0;
  let safeMissedCount = 0;
  let currentSpeedLevel = 1;
  let peakSpeedLevel = 1;
  let strictMissMode = false;

  // Timing variables
  let elapsedPlayTimeMs = 0;
  let difficultyTimeMs = 0;
  let lastSlowSpawnAtMs = -SLOW_SPAWN_COOLDOWN_MS;
  let lastFrameTime = performance.now();
  let spawnAccumulatorMs = 0;
  let tileUidCounter = 0;
  let gameOverTimer = null;

  function setScreen(screen) {
    document.body.dataset.screen = screen;
    const modalOpen = screen !== 'play';
    document.querySelector('header').inert = modalOpen;
    mainShakeContainer.inert = modalOpen;
    document.querySelector('footer').inert = modalOpen;
  }

  // Load persisted high score safely
  function loadBestScore() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(PREVIOUS_STORAGE_KEY);
      bestScore = saved ? parseInt(saved, 10) || 0 : 0;
      if (saved && localStorage.getItem(STORAGE_KEY) === null) {
        localStorage.setItem(STORAGE_KEY, String(bestScore));
      }
    } catch (e) {
      bestScore = 0;
    }
    bestScoreHud.textContent = bestScore.toLocaleString();
  }

  function saveBestScore(newBest) {
    bestScore = Math.max(bestScore, newBest);
    try {
      localStorage.setItem(STORAGE_KEY, String(bestScore));
    } catch (e) {}
    YTPlayables.saveCloudData(bestScore);
    bestScoreHud.textContent = bestScore.toLocaleString();
  }

  // Build the 36 completely invisible cells in the 6x6 grid
  function buildGrid() {
    gridArena.innerHTML = '';
    cellElements = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.index = i;
      gridArena.appendChild(cell);
      cellElements.push(cell);
    }
  }

  // Render the 3 sleek heart/shield indicators in the top HUD
  function renderLives(lostLifeIndex = -1) {
    livesContainer.setAttribute('aria-label', `${lives} lives remaining`);
    livesContainer.innerHTML = '';
    for (let i = 0; i < MAX_LIVES; i++) {
      const isAlive = i < lives;
      const wrapper = document.createElement('div');
      wrapper.className = `w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center transition-all duration-200 ${
        isAlive
          ? 'border border-rose-200/90 text-rose-500 shadow-sm'
          : 'bg-slate-100/80 border border-slate-200/60 text-slate-300 scale-90'
      } ${i === lostLifeIndex ? 'life-lost-anim' : ''}`;

      wrapper.innerHTML = `
        <svg class="w-4 h-4 sm:w-[18px] sm:h-[18px]" viewBox="0 0 24 24" fill="${isAlive ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      `;
      livesContainer.appendChild(wrapper);
    }
  }

  /**
   * Calculates difficulty from the play-time ramp. Slow balloons rewind this
   * clock so the pace eases back and then rises gradually again.
   */
  function getDifficultyParams() {
    // Nine level steps spread across 150 seconds of effective play time.
    const progress = Math.min(1, difficultyTimeMs / 150000);

    // Speed level from 1 to 10
    const level = Math.min(10, 1 + Math.floor(progress * 9));

    // Spawn interval shortens from 880ms down to 300ms.
    const spawnInterval = Math.round(880 - progress * 580);

    // Tile lifetime shortens from 2250ms down to 950ms.
    const tileStayDuration = Math.round(2250 - progress * 1300);

    // Max simultaneous tiles scales from 3 to 8.
    const maxSimultaneous = 3 + Math.floor(progress * 5);

    // Red hazard spawn probability scales from 20% to 30%.
    const hazardChance = 0.20 + progress * 0.10;

    return {
      level,
      spawnInterval,
      tileStayDuration,
      maxSimultaneous,
      hazardChance
    };
  }

  function updateHUD() {
    scoreDisplay.textContent = score.toLocaleString();

    if (combo > 1) {
      comboBadge.classList.remove('hidden');
      comboBadge.textContent = `x${Math.min(8, 1 + Math.floor(combo / 5))}`;
    } else {
      comboBadge.classList.add('hidden');
    }

    const diff = getDifficultyParams();
    if (diff.level > currentSpeedLevel) {
      SoundFX.playSpeedUp();
      speedBadge.classList.add('text-sky-600', 'scale-110');
      setTimeout(() => speedBadge.classList.remove('text-sky-600', 'scale-110'), 350);
    }
    currentSpeedLevel = diff.level;
    peakSpeedLevel = Math.max(peakSpeedLevel, diff.level);
    speedBadge.textContent = `LVL ${diff.level}`;
  }

  /**
   * Spawns a glossy water balloon in a random empty cell.
   */
  function spawnRandomTile() {
    const diff = getDifficultyParams();
    if (activeTiles.size >= diff.maxSimultaneous) return;

    // Collect all currently empty cell indices
    const emptyIndices = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!activeTiles.has(i)) emptyIndices.push(i);
    }
    if (emptyIndices.length === 0) return;

    // Count how many red hazard tiles are currently active so board doesn't flood with only red
    let currentHazards = 0;
    activeTiles.forEach((t) => {
      if (t.isHazard) currentHazards++;
    });

    const isHazard =
      currentHazards < Math.ceil(diff.maxSimultaneous * 0.45) &&
      Math.random() < diff.hazardChance;
    const isRainbow = !isHazard &&
      !Array.from(activeTiles.values()).some((tile) => tile.isRainbow) &&
      Math.random() < RAINBOW_CHANCE;
    const isSlow = !isHazard && !isRainbow && diff.level > 1 &&
      elapsedPlayTimeMs - lastSlowSpawnAtMs >= SLOW_SPAWN_COOLDOWN_MS &&
      !Array.from(activeTiles.values()).some((tile) => tile.isSlow) &&
      Math.random() < SLOW_CHANCE;
    if (isSlow) lastSlowSpawnAtMs = elapsedPlayTimeMs;

    const cellIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    const palette = isHazard
      ? HAZARD_PALETTE
      : isRainbow ? RAINBOW_PALETTE
      : isSlow ? SLOW_PALETTE
      : COOL_SAFE_PALETTES[Math.floor(Math.random() * COOL_SAFE_PALETTES.length)];

    // Red tiles stay slightly shorter so they clear out crisply
    const duration = isHazard
      ? Math.round(diff.tileStayDuration * 0.88)
      : diff.tileStayDuration;

    const uid = ++tileUidCounter;
    const tileEl = document.createElement('button');
    tileEl.type = 'button';
    tileEl.className = `balloon-tile ${isHazard ? 'tile-hazard' : isRainbow ? 'tile-safe tile-rainbow' : isSlow ? 'tile-safe tile-slow' : 'tile-safe'}`;
    tileEl.setAttribute('aria-label', isHazard ? 'Red balloon — avoid' : isRainbow ? 'Rainbow balloon — double points for this pop' : isSlow ? 'Frost balloon — slow the game down' : `${palette.name} balloon — pop`);

    // Palette variables still support particle colors and the rainbow glow, while
    // the visible balloon itself comes from assets/balloons.
    tileEl.style.setProperty('--balloon-top', palette.top);
    const hex = palette.base.slice(1);
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
    tileEl.style.setProperty('--balloon-rgb', rgb);
    const dark = palette.lip.slice(1);
    tileEl.style.setProperty('--balloon-dark', [0, 2, 4].map((i) => parseInt(dark.slice(i, i + 2), 16)).join(', '));

    // Inner SVG shrinking perimeter progress ring + center icon/pip
    const centerGraphic = isHazard
      ? `<svg class="hazard w-6 h-6 sm:w-6 sm:h-6 text-white drop-shadow pointer-events-none relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.6">
           <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
         </svg>`
      : isRainbow ? `<span class="rainbow-label" aria-hidden="true">×2</span>`
      : isSlow ? `<span class="slow-label" aria-hidden="true">❄</span>`
      : `<div class="safe-pip pointer-events-none"></div>`;

    tileEl.innerHTML = `
      <img class="balloon-art" src="${palette.image}" alt="" aria-hidden="true" draggable="false">
      <svg class="tile-timer-ring" viewBox="0 0 44 44">
        <circle class="timer-circle" cx="22" cy="22" r="17"
                fill="none"
                stroke="rgba(255, 255, 255, 0.8)"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-dasharray="106.8"
                stroke-dashoffset="0"></circle>
      </svg>
      ${centerGraphic}
    `;

    const timerCircle = tileEl.querySelector('.timer-circle');

    // Bind immediate pointerdown for ultra-responsive mobile & mouse reflex action
    tileEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      handleTileTap(cellIndex, uid);
    });
    tileEl.addEventListener('click', (e) => {
      if (e.detail === 0) handleTileTap(cellIndex, uid);
    });

    const cellEl = cellElements[cellIndex];
    cellEl.appendChild(tileEl);

    // Inflate the balloon on the next frame.
    requestAnimationFrame(() => {
      if (tileEl.isConnected) {
        tileEl.classList.add('tile-active');
      }
    });

    activeTiles.set(cellIndex, {
      uid,
      cellIndex,
      el: tileEl,
      timerCircle,
      isHazard,
      isRainbow,
      isSlow,
      palette,
      duration,
      elapsed: 0
    });
  }

  /**
   * Pops an active balloon and releases a water splash.
   */
  function handleTileTap(cellIndex, uid) {
    if (state !== 'PLAYING') return;
    const tile = activeTiles.get(cellIndex);
    if (!tile || tile.uid !== uid) return;

    // Remove from active map immediately so it cannot be double-tapped
    activeTiles.delete(cellIndex);

    // Get screen center coordinates of the cell for particle burst
    const rect = tile.el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Briefly squash the balloon as its water bursts outward.
    tile.el.classList.remove('tile-active');
    tile.el.classList.add('tile-pressed');
    setTimeout(() => {
      if (tile.el.isConnected) tile.el.remove();
    }, 160);

    if (tile.isHazard) {
      // TAPPED RED TILE -> LOSE 1 LIFE!
      combo = 0;
      SoundFX.playHazardHit();
      FXEngine.spawnBurst(centerX, centerY, HAZARD_PALETTE.particle, true);
      FXEngine.spawnFloatingText(centerX, centerY - 8, '-1 LIFE!', '#C83656', true);

      triggerHazardFeedback();
      deductLife();
    } else {
      // TAPPED COOL SAFE TILE -> SCORE POINTS & BUILD COMBO!
      safeTappedCount++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;

      // Quick-tap bonus is deliberately modest so each pop earns fewer points.
      const remainingRatio = Math.max(0, 1 - tile.elapsed / tile.duration);
      const speedBonus = Math.round(remainingRatio * 4);
      const multiplier = Math.min(8, 1 + Math.floor(combo / 5));
      // Rainbow doubles only this pop's points, never the accumulated score.
      const pointsEarned = (6 + speedBonus) * multiplier * (tile.isRainbow ? 2 : 1);

      score += pointsEarned;
      if (tile.isSlow) difficultyTimeMs = Math.max(0, difficultyTimeMs - SLOW_RELIEF_MS);
      if (score > bestScore) {
        saveBestScore(score);
      }

      SoundFX.playSafeTap(combo);
      if (tile.isRainbow) SoundFX.playSpeedUp();
      if (tile.isSlow) SoundFX.playSlowDown();
      FXEngine.spawnBurst(centerX, centerY, tile.palette.particle, false);
      FXEngine.spawnFloatingText(
        centerX,
        centerY - 6,
        tile.isRainbow ? `2× POP! +${pointsEarned}` : tile.isSlow ? `SLOW DOWN! +${pointsEarned}` : multiplier > 1 ? `+${pointsEarned} (x${multiplier})` : `+${pointsEarned}`,
        tile.isRainbow ? '#6E19AE' : tile.palette.lip,
        tile.isRainbow || tile.isSlow || multiplier > 2
      );

      updateHUD();
    }
  }

  /**
   * Handles a tile expiring naturally when its countdown runs out.
   */
  function expireTile(cellIndex) {
    const tile = activeTiles.get(cellIndex);
    if (!tile) return;
    activeTiles.delete(cellIndex);

    tile.el.classList.remove('tile-active');
    tile.el.classList.add('tile-expired');
    setTimeout(() => {
      if (tile.el.isConnected) tile.el.remove();
    }, 170);

    if (!tile.isHazard) {
      // Player missed a safe tile
      safeMissedCount++;
      if (combo > 0) {
        combo = 0;
        updateHUD();
      }
      if (strictMissMode) {
        const rect = tile.el.getBoundingClientRect();
        FXEngine.spawnFloatingText(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          'MISSED! -1 LIFE',
          '#C83656',
          false
        );
        SoundFX.playHazardHit();
        triggerHazardFeedback();
        deductLife();
      }
    }
    // If it WAS a red hazard tile, letting it expire naturally is completely safe!
  }

  function triggerHazardFeedback() {
    // Red vignette flash
    hazardFlashOverlay.style.opacity = '1';
    setTimeout(() => {
      hazardFlashOverlay.style.opacity = '0';
    }, 240);

    // Screen shake
    mainShakeContainer.classList.remove('shake-screen');
    void mainShakeContainer.offsetWidth; // force reflow
    mainShakeContainer.classList.add('shake-screen');
  }

  function deductLife() {
    const lostIndex = lives - 1;
    lives = Math.max(0, lives - 1);
    renderLives(lostIndex);
    updateHUD();

    if (lives <= 0) {
      endGame();
    }
  }

  /**
   * Starts a fresh round.
   */
  function startGame() {
    SoundFX.ensureContext();
    clearTimeout(gameOverTimer);
    FXEngine.clear();
    roundBestScore = bestScore;
    setScreen('play');

    // Clear any leftover tiles
    activeTiles.forEach((t) => {
      if (t.el.isConnected) t.el.remove();
    });
    activeTiles.clear();

    syncDifficulty();

    score = 0;
    lives = MAX_LIVES;
    combo = 0;
    maxCombo = 0;
    safeTappedCount = 0;
    safeMissedCount = 0;
    currentSpeedLevel = 1;
    peakSpeedLevel = 1;
    elapsedPlayTimeMs = 0;
    difficultyTimeMs = 0;
    lastSlowSpawnAtMs = -SLOW_SPAWN_COOLDOWN_MS;
    spawnAccumulatorMs = 500; // Spawn first tile quickly

    renderLives();
    updateHUD();

    modalBackdrop.classList.add('hidden');
    startModal.classList.add('hidden');
    pauseModal.classList.add('hidden');
    gameOverModal.classList.add('hidden');

    state = 'PLAYING';
    lastFrameTime = performance.now();
    document.getElementById('pauseBtn').focus({ preventScroll: true });
  }

  function pauseGame() {
    if (state !== 'PLAYING') return;
    state = 'PAUSED';
    setScreen('pause');
    modalBackdrop.classList.remove('hidden');
    startModal.classList.add('hidden');
    gameOverModal.classList.add('hidden');
    pauseModal.classList.remove('hidden');
    document.getElementById('resumeGameBtn').focus({ preventScroll: true });
  }

  function resumeGame() {
    if (state !== 'PAUSED') return;
    modalBackdrop.classList.add('hidden');
    pauseModal.classList.add('hidden');
    state = 'PLAYING';
    setScreen('play');
    lastFrameTime = performance.now();
    document.getElementById('pauseBtn').focus({ preventScroll: true });
  }

  function endGame() {
    state = 'GAMEOVER';
    SoundFX.playGameOver();

    // Clear remaining active tiles gently
    activeTiles.forEach((tile) => {
      tile.el.classList.remove('tile-active');
      tile.el.classList.add('tile-expired');
      setTimeout(() => {
        if (tile.el.isConnected) tile.el.remove();
      }, 170);
    });
    activeTiles.clear();

    const isNewBest = score > 0 && score > roundBestScore;
    if (isNewBest) {
      saveBestScore(score);
      newRecordBadge.classList.remove('hidden');
    } else {
      newRecordBadge.classList.add('hidden');
    }

    // Send final score to YouTube Playables SDK
    YTPlayables.sendScore(score);

    // Populate Game Over summary card
    finalScoreText.textContent = score.toLocaleString();
    summaryBestScore.textContent = bestScore.toLocaleString();
    summaryMaxCombo.textContent = String(maxCombo);
    document.getElementById('resultMessage').textContent = isNewBest
      ? 'Your best splash yet. Can you top it?'
      : score > 0 ? 'Every pop counts. Ready to dive back in?' : 'Let the red ones float by. You’ve got this!';
    document.getElementById('sdkScoreSubmittedNotice').textContent = YTPlayables.isNative()
      ? 'Played on YouTube Playables' : 'Your personal best stays with you';

    const totalSafeOpportunities = safeTappedCount + safeMissedCount;
    const accuracyPercent =
      totalSafeOpportunities > 0
        ? Math.round((safeTappedCount / totalSafeOpportunities) * 100)
        : 0;
    summaryAccuracy.textContent = `${accuracyPercent}%`;
    summaryPeakSpeed.textContent = `LVL ${peakSpeedLevel}`;

    gameOverTimer = setTimeout(() => {
      if (state !== 'GAMEOVER') return;
      setScreen('over');
      modalBackdrop.classList.remove('hidden');
      startModal.classList.add('hidden');
      pauseModal.classList.add('hidden');
      gameOverModal.classList.remove('hidden');
      document.getElementById('playAgainBtn').focus({ preventScroll: true });
    }, 480);
  }

  /**
   * Main 60fps requestAnimationFrame loop.
   */
  function tick(now) {
    const dt = Math.min(100, now - lastFrameTime);
    lastFrameTime = now;

    if (state === 'PLAYING') {
      elapsedPlayTimeMs += dt;
      difficultyTimeMs += dt;
      spawnAccumulatorMs += dt;

      const diff = getDifficultyParams();
      if (diff.level !== currentSpeedLevel) updateHUD();
      if (spawnAccumulatorMs >= diff.spawnInterval) {
        spawnAccumulatorMs = 0;
        spawnRandomTile();

        // At higher speed levels, occasionally spawn a twin tile for intense reflex bursts
        if (diff.level >= 4 && Math.random() < 0.28) {
          spawnRandomTile();
        }
      }

      // Update active tiles and their shrinking SVG progress rings
      const circumference = 106.8;
      activeTiles.forEach((tile, cellIndex) => {
        tile.elapsed += dt;
        const progress = Math.min(1, tile.elapsed / tile.duration);
        if (tile.timerCircle) {
          tile.timerCircle.style.strokeDashoffset = String(progress * circumference);
        }
        if (tile.elapsed >= tile.duration) {
          expireTile(cellIndex);
        }
      });
    }

    FXEngine.updateAndDraw(dt);
    requestAnimationFrame(tick);
  }

  function syncDifficulty() {
    strictMissMode = strictMissToggle.checked;
    strictRuleDesc.textContent = strictMissMode
      ? 'Miss a cool balloon and lose a life, too.'
      : 'Missed balloons only reset your combo.';
    liveRuleHint.innerHTML = strictMissMode
      ? 'Hard mode • <span class="text-rose-500">Red pops &amp; misses cost a life</span>'
      : 'Pop cool balloons • <span class="text-rose-500">Let red float by</span>';
  }

  // Wire UI Controls & Listeners
  function bindEvents() {
    document.querySelectorAll('.home-button').forEach((button) => button.addEventListener('click', () => {
      clearTimeout(gameOverTimer);
      activeTiles.forEach((tile) => tile.el.remove());
      activeTiles.clear();
      FXEngine.clear();
      state = 'IDLE';
      setScreen('start');
      startModal.classList.remove('hidden');
      pauseModal.classList.add('hidden');
      gameOverModal.classList.add('hidden');
      modalBackdrop.classList.remove('hidden');
      document.getElementById('startGameBtn').focus({ preventScroll: true });
    }));
    document.getElementById('startGameBtn').addEventListener('click', startGame);
    document.getElementById('playAgainBtn').addEventListener('click', startGame);
    document.getElementById('pauseBtn').addEventListener('click', () => {
      if (state === 'PLAYING') pauseGame();
      else if (state === 'PAUSED') resumeGame();
    });
    document.getElementById('resumeGameBtn').addEventListener('click', resumeGame);
    document.getElementById('restartFromPauseBtn').addEventListener('click', startGame);

    const muteBtn = document.getElementById('muteBtn');
    const soundOnIcon = document.getElementById('soundOnIcon');
    const soundOffIcon = document.getElementById('soundOffIcon');

    function syncAudioIcons() {
      const muted = SoundFX.isMuted();
      soundOnIcon.classList.toggle('hidden', muted);
      soundOffIcon.classList.toggle('hidden', !muted);
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    }

    muteBtn.addEventListener('click', () => {
      SoundFX.toggleUserMute();
      syncAudioIcons();
    });

    strictMissToggle.addEventListener('change', syncDifficulty);

    // Keyboard shortcut (Space/Enter to start or resume, Escape/P to pause)
    // NOTE: Never call e.preventDefault() on Escape per YouTube Playables certification rules
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !modalBackdrop.classList.contains('hidden')) {
        const visibleModal = [startModal, pauseModal, gameOverModal].find((el) => !el.classList.contains('hidden'));
        const controls = visibleModal.querySelectorAll('button, input');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || !visibleModal.contains(document.activeElement))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !visibleModal.contains(document.activeElement))) {
          e.preventDefault(); first.focus();
        }
      }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (state === 'PLAYING') pauseGame();
        else if (state === 'PAUSED') resumeGame();
      } else if (e.key === ' ' || e.key === 'Enter') {
        if (e.target.closest('button, input')) return;
        if (state === 'IDLE' || state === 'GAMEOVER') {
          e.preventDefault();
          startGame();
        }
      }
    });

    // Initialize YouTube Playables SDK hooks
    YTPlayables.init({
      onPause: () => {
        if (state === 'PLAYING') pauseGame();
      },
      onResume: () => {
        // Keep pause modal visible so player isn't caught off-guard, or let them tap Resume
      },
      onAudioChange: (enabled) => {
        SoundFX.setPlatformAudio(enabled);
        syncAudioIcons();
      },
      onCloudDataLoaded: (cloudObj) => {
        if (cloudObj && typeof cloudObj.bestScore === 'number' && cloudObj.bestScore > bestScore) {
          saveBestScore(cloudObj.bestScore);
        }
      }
    });
  }

  function init() {
    loadBestScore();
    buildGrid();
    renderLives();
    bindEvents();
    setScreen('start');
    requestAnimationFrame(tick);
  }

  return { init };
})();

window.onload = function () {
  Game.init();
};
