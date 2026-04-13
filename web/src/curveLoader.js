/**
 * curveLoader.js — Mathematical curve animations (inspired by math-curve-loaders)
 * Parametric SVG curves with particle trails, breathing, and optional rotation.
 */

/* ── Curve definitions ── */
const CURVES = {
  /** Rose / Rhodonea — r = a·cos(kθ) */
  rose: {
    point(t, ds) {
      const a = 38 * ds, k = 5;
      const θ = t * Math.PI * 2 * 3;
      const r = a * Math.cos(k * θ);
      return { x: 50 + r * Math.cos(θ), y: 50 + r * Math.sin(θ) };
    },
    particles: 80, trail: 0.28, dur: 6000, pulse: 4000, stroke: 0.7,
  },
  /** Lissajous — x=sin(at+δ), y=sin(bt) */
  lissajous: {
    point(t, ds) {
      const a = 3, b = 2, δ = Math.PI / 2;
      return {
        x: 50 + 38 * ds * Math.sin(a * t * Math.PI * 2 + δ),
        y: 50 + 38 * ds * Math.sin(b * t * Math.PI * 2),
      };
    },
    particles: 60, trail: 0.22, dur: 5000, pulse: 3500, stroke: 0.8,
  },
  /** Lemniscate of Bernoulli — ∞ shape */
  lemniscate: {
    point(t, ds) {
      const θ = t * Math.PI * 2;
      const s = 42 * ds;
      const d = 1 + Math.sin(θ) ** 2;
      return {
        x: 50 + (s * Math.cos(θ)) / d,
        y: 50 + (s * Math.sin(θ) * Math.cos(θ)) / d,
      };
    },
    particles: 48, trail: 0.25, dur: 4500, pulse: 3000, stroke: 0.8,
  },
  /** Cardioid — r = a(1+cos θ) */
  cardioid: {
    point(t, ds) {
      const a = 20 * ds;
      const θ = t * Math.PI * 2;
      const r = a * (1 + Math.cos(θ));
      return { x: 50 + r * Math.cos(θ) - a * 0.5, y: 50 + r * Math.sin(θ) };
    },
    particles: 56, trail: 0.24, dur: 5000, pulse: 3800, stroke: 0.7,
  },
  /** Hypotrochoid (spirograph) */
  hypotrochoid: {
    point(t, ds) {
      const R = 28 * ds, r = 10 * ds, d = 18 * ds;
      const θ = t * Math.PI * 2 * 4;
      const x = (R - r) * Math.cos(θ) + d * Math.cos(((R - r) / r) * θ);
      const y = (R - r) * Math.sin(θ) - d * Math.sin(((R - r) / r) * θ);
      return { x: 50 + x, y: 50 + y };
    },
    particles: 100, trail: 0.2, dur: 7000, pulse: 4200, stroke: 0.6,
  },
  /** Butterfly — r = e^sin(θ) - 2cos(4θ) + sin^5((2θ-π)/24) */
  butterfly: {
    point(t, ds) {
      const θ = t * Math.PI * 2 * 3;
      const r = 14 * ds * (
        Math.exp(Math.sin(θ)) - 2 * Math.cos(4 * θ) +
        Math.sin((2 * θ - Math.PI) / 24) ** 5
      );
      return { x: 50 + r * Math.cos(θ), y: 50 + r * Math.sin(θ) };
    },
    particles: 90, trail: 0.22, dur: 8000, pulse: 4500, stroke: 0.5,
  },
};

/* ── Helpers ── */
function buildPath(curveCfg, ds, steps = 480) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const p = curveCfg.point(i / steps, ds);
    d += `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
  }
  return d;
}

function detailScale(time, pulseDur) {
  const angle = ((time % pulseDur) / pulseDur) * Math.PI * 2;
  return 0.52 + ((Math.sin(angle + 0.55) + 1) / 2) * 0.48;
}

function ns(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ── Public API ── */

/**
 * Create a math-curve SVG animation.
 * @param {HTMLElement} container - DOM element to mount into
 * @param {string} curveType - key from CURVES (rose, lissajous, lemniscate, cardioid, hypotrochoid, butterfly)
 * @param {object} opts
 * @param {number} [opts.size=100] - SVG size in px
 * @param {string} [opts.color] - stroke/particle color (CSS color string)
 * @param {string} [opts.label] - optional label text below
 * @param {boolean} [opts.rotate=false] - continuous rotation
 * @param {number} [opts.rotateDur=20000] - rotation period ms
 * @returns {{ el: HTMLElement, start(): void, stop(): void, destroy(): void }}
 */
export function createCurveLoader(container, curveType = 'lissajous', opts = {}) {
  const cfg = CURVES[curveType] || CURVES.lissajous;
  const size = opts.size || 100;
  const color = opts.color || 'currentColor';
  const rotate = opts.rotate ?? false;
  const rotateDur = opts.rotateDur || 20000;

  // Wrapper
  const wrap = document.createElement('div');
  wrap.className = 'curve-loader';

  // SVG
  const svg = ns('svg', {
    viewBox: '0 0 100 100',
    width: String(size),
    height: String(size),
    fill: 'none',
  });
  svg.style.color = color;

  // Group (for rotation)
  const g = ns('g');
  svg.appendChild(g);

  // Path
  const path = ns('path', {
    stroke: 'currentColor',
    'stroke-width': String(cfg.stroke),
    'stroke-linecap': 'round',
    opacity: '0.18',
  });
  g.appendChild(path);

  // Particles
  const circles = [];
  for (let i = 0; i < cfg.particles; i++) {
    const c = ns('circle', {
      r: String(cfg.stroke * 0.8),
      fill: 'currentColor',
    });
    g.appendChild(c);
    circles.push(c);
  }

  wrap.appendChild(svg);

  // Label
  if (opts.label) {
    const lbl = document.createElement('span');
    lbl.className = 'curve-loader-label';
    lbl.textContent = opts.label;
    wrap.appendChild(lbl);
  }

  container.appendChild(wrap);

  // Animation state
  let raf = null;
  let startTime = null;

  function tick(now) {
    if (!startTime) startTime = now;
    const elapsed = now - startTime;
    const ds = detailScale(elapsed, cfg.pulse);

    // Rebuild path each frame (breathing)
    path.setAttribute('d', buildPath(cfg, ds));

    // Position particles along trail
    const progress = (elapsed % cfg.dur) / cfg.dur;
    for (let i = 0; i < circles.length; i++) {
      const tailOff = (i / circles.length) * cfg.trail;
      let t = progress - tailOff;
      if (t < 0) t += 1;
      const pt = cfg.point(t, ds);
      circles[i].setAttribute('cx', pt.x.toFixed(2));
      circles[i].setAttribute('cy', pt.y.toFixed(2));
      circles[i].setAttribute('opacity', String(Math.pow(1 - i / circles.length, 0.56).toFixed(3)));
    }

    // Optional rotation
    if (rotate) {
      const deg = ((elapsed % rotateDur) / rotateDur) * 360;
      g.setAttribute('transform', `rotate(${deg.toFixed(1)} 50 50)`);
    }

    raf = requestAnimationFrame(tick);
  }

  return {
    el: wrap,
    start() {
      if (!raf) {
        startTime = null;
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      wrap.remove();
    },
  };
}

/** Available curve type names */
export const CURVE_TYPES = Object.keys(CURVES);
