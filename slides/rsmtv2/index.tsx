import {
  type DesignSystem,
  type Page,
  type SlideMeta,
  type SlideTransition,
  Step,
  Steps,
  useIsActivePage,
  useSlidePageNumber,
} from '@open-slide/core';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import githubLogo from './assets/github.svg';
import ibmLogo from './assets/ibm.svg';
import javaLogo from './assets/java.svg';

/* ───────────────────────── design ───────────────────────── */

export const design: DesignSystem = {
  palette: { bg: '#03050C', text: '#F3F6FC', accent: '#FF8A4C' },
  fonts: {
    display: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  typeScale: { hero: 136, body: 36 },
  radius: 16,
};

const C = {
  muted: '#A9B7D9',
  dim: '#6E7BA0',
  gold: '#FFC56B',
  teal: '#4FD1C5',
  red: '#FF5D6C',
  amber: '#FFB547',
  green: '#5BE49B',
  panel: 'rgba(255, 255, 255, 0.045)',
  line: 'rgba(169, 183, 217, 0.22)',
};
const mono = '"Departure Mono", ui-monospace, "SF Mono", Menlo, monospace';
const EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
const HOLD: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

/* ───────────────────────── transitions ───────────────────────── */

export const transition: SlideTransition = {
  duration: 260,
  exit: { duration: 260, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 260,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
  },
};

const settle: SlideTransition = {
  duration: 280,
  exit: { duration: 280, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 280,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: 'translateY(12px)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
    ],
  },
};

/* ───────────────────────── shared styles ───────────────────────── */

const fill: CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  background: 'var(--osd-bg)',
  color: 'var(--osd-text)',
  fontFamily: 'var(--osd-font-body)',
  letterSpacing: '-0.01em',
};

const CSS = `
@keyframes rs-rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
@keyframes rs-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes rs-flow { to { stroke-dashoffset: -48; } }
@keyframes rs-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
@keyframes rs-draw { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
@keyframes rs-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(79, 209, 197, 0); } 50% { box-shadow: 0 0 44px 4px rgba(79, 209, 197, 0.32); } }
@keyframes rs-packet { 0% { left: 0; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { left: calc(100% - 30px); opacity: 0; } }
@keyframes rs-drift { from { background-position: 0 0; } to { background-position: 80px 80px; } }
`;

const rise = (active: boolean, delay = 0): CSSProperties =>
  active ? { animation: `rs-rise 700ms ${EASE_OUT} ${delay}ms both` } : {};

/* ───────────────────────── ported from index.html: WebGL glow + ASCII ───────────────────────── */

const VERT = `#version 300 es
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Pass 1: Mandelbrot set -> glow texture.
const FRAG_GLOW = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uDarkBackground;
out vec4 fragColor;

// ── palette (OKLCH), same parameters as the glow variants ──
const float HUE = 0.045;
const float HUE_SPREAD = 0.2;
const float CHROMA = 0.165;
const float LIGHTNESS = 0.6;
const float LIGHT_SWING = 0.208;
const float BAND_FREQ = 0.33;      // colour bands per iteration
const float BAND_DRIFT = 0.55;    // colour flow speed (rad/s)
const float GLOW_RATE = 0.075;            // brightness ramp vs. iteration count
const float VIGNETTE = 0.0558240488;
const float TAU = 6.28318530718;

// OKLCH -> linear RGB
vec3 oklchToLinear(float L, float C, float h) {
  float a = C * cos(h), b = C * sin(h);
  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  vec3 lms = vec3(l_, m_, s_);
  lms = lms * lms * lms;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863,
              -3.3077115913, 2.6097574011, -0.7034186147,
              0.2309699292, -0.3413193965, 1.7076147010) * lms;
}

float blueNoise(vec2 p, float frame) {
  p += 5.588238 * mod(frame, 64.0);
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

// Smooth (continuous) escape count; negative => never escaped (inside the set).
float mandel(vec2 c) {
  // skip the main cardioid and period-2 bulb: they never escape
  float q = (c.x - 0.25) * (c.x - 0.25) + c.y * c.y;
  if (q * (q + (c.x - 0.25)) < 0.25 * c.y * c.y) return -1.0;
  if ((c.x + 1.0) * (c.x + 1.0) + c.y * c.y < 0.0625) return -1.0;
  vec2 z = vec2(0.0);
  for (int i = 0; i < 520; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    float m = dot(z, z);
    if (m > 1.0e4) return float(i) + 1.0 - log2(0.5 * log(m));
  }
  return -1.0;
}

// Escape count -> linear colour "ink" (added over the dark background later).
vec3 shade(float mu, float t) {
  if (mu < 0.0) return vec3(0.0);
  float glow = 1.0 - exp(-max(mu, 0.0) * GLOW_RATE);
  float k = 0.5 + 0.5 * sin(mu * BAND_FREQ - t * BAND_DRIFT);
  float hue0 = HUE * TAU, hue1 = hue0 + HUE_SPREAD * TAU;
  vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
  return tint * glow * (0.55 + 0.75 * k);
}

vec3 finish(vec3 color, vec2 pos) {
  // filmic tone-map (ACES approximation), per-channel gamma, vignette, background lift, dither
  vec3 x = max(color, 0.0);
  color = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  color = pow(clamp(color, 0.0, 1.0), vec3(0.85, 0.92, 0.98));
  color *= 1.0 - smoothstep(0.5, 1.6, length(pos)) * VIGNETTE;
  color = uDarkBackground + color * (1.0 - uDarkBackground);
  color += (blueNoise(gl_FragCoord.xy, floor(iTime * 24.0)) - 0.5) / 255.0;
  return clamp(color, 0.0, 1.0);
}

const vec2 TARGET = vec2(-0.7436447, 0.1318252);   // Seahorse Valley
const float ZOOM_NEAR = 0.045;                     // view height (c-plane units) at the closest point
const float ZOOM_FAR = 0.60;                       // ... and the widest
const float BREATH_RATE = 0.075;                   // rad/s of the zoom oscillation

void main() {
  vec2 R = iResolution.xy;
  vec2 pos = (gl_FragCoord.xy - vec2(0.64, 0.5) * R) / R.y;   // fractal focus sits right of centre, behind the scrim
  float breath = 0.5 + 0.5 * sin(iTime * BREATH_RATE - 1.2);
  float h = exp(mix(log(ZOOM_FAR), log(ZOOM_NEAR), breath));
  float a = 0.35 * sin(iTime * 0.045) + 0.5;                  // gentle sway + fixed tilt
  float ca = cos(a), sa = sin(a);
  vec2 c = TARGET + mat2(ca, sa, -sa, ca) * pos * h;
  fragColor = vec4(finish(shade(mandel(c), iTime), pos), 1.0);
}
`;

// Pass 2: sample the glow in small cells, pick a glyph by brightness, keep 45% of the image underneath.
// (uAscii is the only addition vs. the deck: it lets this demo toggle the layer.)
const FRAG_ASCII = `#version 300 es
precision highp float;

uniform sampler2D tScene;
uniform sampler2D tGlyphs;
uniform vec2 iResolution;
uniform vec3 uDarkBackground;
uniform float uAscii;
out vec4 fragColor;

const float uStrength = 1.29589593;
const float uScale = 1.04066491;
const float uGlyphCount = 10.0;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 sceneInk(vec2 uv) { return texture(tScene, clamp(uv, 0.0, 1.0)).rgb - uDarkBackground; }

void main() {
  vec2 frag = gl_FragCoord.xy;
  if (uAscii < 0.5) { fragColor = vec4(uDarkBackground + sceneInk(frag / iResolution), 1.0); return; }

  vec2 cellPx = vec2(0.62, 1.0) * floor(uScale * 9.0 + 0.5);   // ~5 x 9 px character cell
  vec2 cell = floor(frag / cellPx);
  vec2 centre = (cell + 0.5) * cellPx;
  vec3 ink = vec3(0.0);
  ink += sceneInk(centre / iResolution) * 2.0;                  // centre sample counts double
  ink += sceneInk((centre + cellPx * vec2(0.3, 0.3)) / iResolution);
  ink += sceneInk((centre + cellPx * vec2(-0.3, 0.3)) / iResolution);
  ink += sceneInk((centre + cellPx * vec2(0.3, -0.3)) / iResolution);
  ink += sceneInk((centre + cellPx * vec2(-0.3, -0.3)) / iResolution);
  ink /= 6.0;
  float level = pow(clamp(dot(ink, LUMA) * (0.9 + 0.3 * uStrength), 0.0, 1.0), 0.9);
  float glyph = floor(level * (uGlyphCount - 1.0) + 0.5);       // 0..9 -> index into the ramp
  vec2 local = (frag - cell * cellPx) / cellPx;
  float mask = texture(tGlyphs, vec2((glyph + local.x) / uGlyphCount, local.y)).r;
  vec3 under = sceneInk(frag / iResolution) * 0.45;
  vec3 color = uDarkBackground + clamp(under + ink * mask, 0.0, 1.0);
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const GLYPH_RAMP = ' .:;+*oO8@';
const DARK_BG = [3 / 255, 5 / 255, 12 / 255];

function startGL(host: HTMLElement, reduced: boolean): () => void {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  canvas.style.cssText =
    'width:100%;height:100%;display:block;opacity:0;transition:opacity 350ms cubic-bezier(0,0,0.2,1)';
  host.appendChild(canvas);
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) {
    canvas.remove();
    return () => {};
  }

  const compile = (frag: string): WebGLProgram => {
    const prog = gl.createProgram() as WebGLProgram;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, frag],
    ] as const) {
      const sh = gl.createShader(type) as WebGLShader;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
      gl.attachShader(prog, sh);
      gl.deleteShader(sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    return prog;
  };
  const clampEdge = () => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  let glow: WebGLProgram;
  let ascii: WebGLProgram;
  try {
    glow = compile(FRAG_GLOW);
    ascii = compile(FRAG_ASCII);
  } catch {
    canvas.remove();
    return () => {};
  }
  const W = canvas.width;
  const H = canvas.height;

  const sceneTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  clampEdge();
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const atlas = document.createElement('canvas');
  atlas.width = 480;
  atlas.height = 80;
  const ctx = atlas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, atlas.width, atlas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 62px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  for (let i = 0; i < 10; i++) ctx.fillText(GLYPH_RAMP[i], i * 48 + 24, 43.2);
  const glyphTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glyphTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  clampEdge();

  const u1 = {
    res: gl.getUniformLocation(glow, 'iResolution'),
    time: gl.getUniformLocation(glow, 'iTime'),
    dark: gl.getUniformLocation(glow, 'uDarkBackground'),
  };
  const u2 = {
    res: gl.getUniformLocation(ascii, 'iResolution'),
    dark: gl.getUniformLocation(ascii, 'uDarkBackground'),
    scene: gl.getUniformLocation(ascii, 'tScene'),
    glyphs: gl.getUniformLocation(ascii, 'tGlyphs'),
    on: gl.getUniformLocation(ascii, 'uAscii'),
  };

  const draw = (time: number) => {
    gl.viewport(0, 0, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.useProgram(glow);
    gl.uniform2f(u1.res, W, H);
    gl.uniform1f(u1.time, time);
    gl.uniform3fv(u1.dark, DARK_BG);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(ascii);
    gl.uniform2f(u2.res, W, H);
    gl.uniform3fv(u2.dark, DARK_BG);
    gl.uniform1f(u2.on, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(u2.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, glyphTex);
    gl.uniform1i(u2.glyphs, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let raf = 0;
  let stopped = false;
  if (reduced) {
    draw(2);
  } else {
    let last = 0;
    let t = 0;
    const loop = (now: number) => {
      if (stopped) return;
      t += last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  canvas.style.opacity = '1';

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };
}

/** Live Mandelbrot glow + ASCII layer. Only the page the audience is watching mounts WebGL. */
const GlowCanvas = () => {
  const active = useIsActivePage();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return startGL(ref.current, reduced);
  }, [active]);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse 60% 70% at 72% 50%, rgba(255,138,76,0.28), rgba(255,138,76,0) 70%), #03050C',
      }}
    />
  );
};

/* ───────────────────────── ported from index.html: decode text ───────────────────────── */

const WIDTH_CLASSES = ['ijl', 'frt', 'mw', 'abcdeghknopqsuvxyz', 'IJ1', '023456789', 'MW', 'BEFKLPRSTXYZ', 'ACDGHNOQUV'];
const widthClass = (ch: string) => WIDTH_CLASSES.find((c) => c.includes(ch)) ?? '';
const ROW_STAGGER = 130;
const LEAD_IN = 170;
const ROW_SPREAD = 430;
const JITTER = 55;
const SCRAMBLE_STEP = 42;

const seeded = (seed: number) => () => {
  const s = (seed + 1831565813) | 0;
  seed = s;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type DecodeChar = { ch: string; at: number };

/** Per-character scramble, then lock — the cover's "decode" effect. Newlines start a new row. */
const DecodeText = ({ text, delay = 200 }: { text: string; delay?: number }) => {
  const active = useIsActivePage();
  const [now, setNow] = useState<number>(active ? 0 : Number.POSITIVE_INFINITY);

  const { rows, end, hash } = useMemo(() => {
    let h = 0;
    for (const c of text) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    const rand = seeded(h);
    let maxAt = 0;
    const built: DecodeChar[][] = text.split('\n').map((line, ri) => {
      const len = line.length;
      return Array.from(line).map((ch, ci) => {
        const at =
          delay + ri * ROW_STAGGER + LEAD_IN + (ci / Math.max(1, len - 1)) * ROW_SPREAD + (rand() - 0.5) * 2 * JITTER;
        maxAt = Math.max(maxAt, at);
        return { ch, at };
      });
    });
    return { rows: built, end: maxAt + 80, hash: h };
  }, [text, delay]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduced) {
      setNow(Number.POSITIVE_INFINITY);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (n: number) => {
      const t = n - t0;
      if (t > end) {
        setNow(Number.POSITIVE_INFINITY);
        return;
      }
      setNow(t);
      raf = requestAnimationFrame(tick);
    };
    setNow(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, end]);

  let idx = 0;
  return (
    <>
      {rows.map((row) => (
        <span key={row.map((c) => c.ch).join('')} style={{ display: 'block', whiteSpace: 'nowrap' }}>
          {row.map((c) => {
            const i = idx++;
            if (c.ch === ' ') return ' ';
            if (now >= c.at) return c.ch;
            const cls = widthClass(c.ch);
            const glyph =
              cls && now >= c.at - LEAD_IN
                ? cls[Math.floor(seeded(hash + i * 7919 + Math.floor(now / SCRAMBLE_STEP) * 104729)() * cls.length)]
                : '';
            return (
              <span key={`${i}-${c.ch}`} style={{ position: 'relative' }}>
                <span style={{ visibility: 'hidden' }}>{c.ch}</span>
                <span style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)' }}>{glyph}</span>
              </span>
            );
          })}
        </span>
      ))}
    </>
  );
};

/* ───────────────────────── small building blocks ───────────────────────── */

const CountUp = ({
  to,
  decimals = 0,
  suffix = '',
  duration = 1700,
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
}) => {
  const active = useIsActivePage();
  const [v, setV] = useState(active ? 0 : to);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduced) {
      setV(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (n: number) => {
      const p = Math.min(1, (n - t0) / duration);
      setV(to * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, to, duration]);
  return (
    <>
      {v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  );
};

const Footer = () => {
  const { current, total } = useSlidePageNumber();
  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: 36,
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: mono,
        fontSize: 22,
        letterSpacing: '0.05em',
        color: C.dim,
      }}
    >
      <span>rSMTv2 · IBM US 8,595,468 B2 · co-inventor Daneyand J. Singley</span>
      <span>
        {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </div>
  );
};

const Frame = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) => {
  const active = useIsActivePage();
  return (
    <div style={fill}>
      <style>{CSS}</style>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(169,183,217,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(169,183,217,0.05) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          animation: active ? 'rs-drift 12s linear infinite' : undefined,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 50% 60% at 100% 0%, rgba(255,138,76,0.16), rgba(255,138,76,0) 70%)',
        }}
      />
      <div style={{ position: 'absolute', top: 80, left: 120, right: 120, bottom: 100, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: '0.14em', color: 'var(--osd-accent)', ...rise(active) }}>
          {eyebrow}
        </div>
        <h2
          style={{
            margin: '14px 0 0',
            fontFamily: 'var(--osd-font-display)',
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.035em',
            ...rise(active, 60),
          }}
        >
          {title}
        </h2>
        <div style={{ marginTop: 44, flex: 1, minHeight: 0 }}>{children}</div>
      </div>
      <Footer />
    </div>
  );
};

/* ───────────────────────── 01 cover ───────────────────────── */

const Cover: Page = () => {
  const active = useIsActivePage();
  return (
    <div style={fill}>
      <style>{CSS}</style>
      <GlowCanvas />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(90deg, rgba(3,5,12,0.88) 0%, rgba(3,5,12,0.8) 34%, rgba(3,5,12,0.35) 58%, rgba(3,5,12,0) 76%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '96px 120px 62px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            fontFamily: mono,
            fontSize: 26,
            letterSpacing: '0.05em',
            textShadow: '0 0 12px #03050C, 0 0 4px #03050C',
          }}
        >
          <span>6 NOV 2026</span>
          <span>
            <b>IBM PATENT</b>: US 8,595,468 B2
          </span>
          <span>
            <b>CO-INVENTOR</b>: DANEYAND J. SINGLEY
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36, textShadow: '0 0 40px #03050C' }}>
          <h1
            style={{
              margin: 0,
              maxWidth: 1160,
              fontFamily: 'var(--osd-font-display)',
              fontSize: 'var(--osd-size-hero)',
              fontWeight: 800,
              lineHeight: '134px',
              letterSpacing: '-0.04em',
            }}
          >
            <DecodeText text={'rSMTv2\nOne Thread,\nTwo Cores.'} delay={200} />
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 1100,
              fontSize: 36,
              lineHeight: '50px',
              color: C.muted,
              fontWeight: 600,
              ...rise(active, 900),
            }}
          >
            Reverse Simultaneous Multithreading,{' '}
            <b style={{ color: 'var(--osd-text)' }}>co-invented by Daneyand J. Singley</b> at IBM and rebuilt live in
            Java 21.
          </p>
        </div>
        <div style={{ fontFamily: mono, fontSize: 22, color: 'rgba(169,183,217,0.75)' }}>press → to begin</div>
      </div>
    </div>
  );
};
Cover.transition = settle;

/* ───────────────────────── 02 patent ───────────────────────── */

const InventorCard = ({ name, role, hero = false }: { name: string; role: string; hero?: boolean }) => {
  const active = useIsActivePage();
  return (
    <div
      style={{
        height: 320,
        boxSizing: 'border-box',
        padding: 36,
        borderRadius: 'var(--osd-radius)',
        border: hero ? '2px solid var(--osd-accent)' : `1px solid ${C.line}`,
        background: hero ? 'rgba(255,138,76,0.12)' : C.panel,
        boxShadow: hero ? '0 0 60px rgba(255,138,76,0.22)' : 'none',
        animation: active && hero ? 'rs-pulse 3.2s ease-in-out infinite' : undefined,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: '0.1em', color: hero ? 'var(--osd-accent)' : C.dim }}>
        CO-INVENTOR
      </div>
      <div style={{ marginTop: 16, minHeight: 100, fontSize: 42, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em' }}>
        {name}
      </div>
      <div style={{ marginTop: 16, fontSize: 28, lineHeight: 1.5, color: C.muted }}>{role}</div>
    </div>
  );
};

const Patent: Page = () => (
  <Frame eyebrow="02 · THE PATENT" title="Co-invented by Daneyand J. Singley">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 56 }}>
      <div
        style={{
          fontFamily: 'var(--osd-font-display)',
          fontSize: 104,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '-0.04em',
          color: 'var(--osd-accent)',
        }}
      >
        US 8,595,468 B2
      </div>
      <div style={{ fontSize: 40, lineHeight: 1.4, fontWeight: 600 }}>“Reverse Simultaneous Multi-Threading”</div>
      <div style={{ fontFamily: mono, fontSize: 28, color: C.muted }}>
        Filed Nov 5, 2009 · Granted Nov 26, 2013 · Assignee: IBM
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
      <Steps>
        <Step>
          <InventorCard hero name="Daneyand J. Singley" role="Author of the original rSMT simulator" />
        </Step>
        <Step>
          <InventorCard name="Shawn M. Luke" role="IBM Systems & Technology Group" />
        </Step>
        <Step>
          <InventorCard name="John Sargis, Jr." role="IBM Systems & Technology Group" />
        </Step>
      </Steps>
    </div>
  </Frame>
);

/* ───────────────────────── 03 the idea ───────────────────────── */

const Panel = ({ title, sub, children }: { title: string; sub: string; children: ReactNode }) => (
  <div>
    <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em' }}>{title}</div>
    <div style={{ marginTop: 6, fontSize: 30, lineHeight: 1.4, color: C.muted }}>{sub}</div>
    <div style={{ marginTop: 18 }}>{children}</div>
  </div>
);

const flowLine = (active: boolean, color: string): CSSProperties => ({
  stroke: color,
  strokeWidth: 5,
  strokeDasharray: '10 14',
  fill: 'none',
  animation: active ? 'rs-flow 1.1s linear infinite' : undefined,
});

const SvgText = ({
  x,
  y,
  size = 22,
  fill: f = C.muted,
  anchor = 'middle',
  children,
}: {
  x: number;
  y: number;
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  children: ReactNode;
}) => (
  <text x={x} y={y} fontSize={size} fill={f} textAnchor={anchor} style={{ fontFamily: mono, letterSpacing: '0.06em' }}>
    {children}
  </text>
);

const SmtDiagram = () => {
  const active = useIsActivePage();
  return (
    <svg width={800} height={400} viewBox="0 0 800 400" role="img" aria-label="SMT: two threads share one core">
      <rect x={20} y={70} width={180} height={60} rx={30} fill="rgba(255,138,76,0.14)" stroke="#FF8A4C" strokeWidth={2} />
      <SvgText x={110} y={108} fill="#FF8A4C">THREAD A</SvgText>
      <rect x={20} y={270} width={180} height={60} rx={30} fill="rgba(255,197,107,0.14)" stroke="#FFC56B" strokeWidth={2} />
      <SvgText x={110} y={308} fill="#FFC56B">THREAD B</SvgText>
      <path d="M200 100 C 270 100, 280 150, 350 160" style={flowLine(active, '#FF8A4C')} />
      <path d="M200 300 C 270 300, 280 250, 350 240" style={flowLine(active, '#FFC56B')} />
      <rect x={350} y={50} width={430} height={300} rx={22} fill="rgba(255,255,255,0.04)" stroke={C.muted} strokeWidth={2} />
      <SvgText x={380} y={92} anchor="start">1 PHYSICAL CORE</SvgText>
      <rect x={380} y={120} width={170} height={90} rx={14} fill="rgba(255,138,76,0.22)" stroke="#FF8A4C" strokeWidth={2} />
      <SvgText x={465} y={173} fill="#F3F6FC">FXU</SvgText>
      <rect x={580} y={120} width={170} height={90} rx={14} fill="rgba(255,197,107,0.22)" stroke="#FFC56B" strokeWidth={2} />
      <SvgText x={665} y={173} fill="#F3F6FC">FPU</SvgText>
      <rect x={380} y={235} width={170} height={90} rx={14} fill="rgba(255,138,76,0.22)" stroke="#FF8A4C" strokeWidth={2} />
      <SvgText x={465} y={288} fill="#F3F6FC">LSU</SvgText>
      <rect x={580} y={235} width={170} height={90} rx={14} fill="rgba(255,197,107,0.22)" stroke="#FFC56B" strokeWidth={2} />
      <SvgText x={665} y={288} fill="#F3F6FC">BRANCH</SvgText>
    </svg>
  );
};

const RsmtDiagram = () => {
  const active = useIsActivePage();
  const pulse: CSSProperties = { animation: active ? 'rs-pulse 1.6s ease-in-out infinite' : undefined };
  return (
    <svg width={800} height={400} viewBox="0 0 800 400" role="img" aria-label="rSMT: one thread borrows a second core">
      <rect x={20} y={165} width={200} height={70} rx={35} fill="rgba(255,138,76,0.14)" stroke="#FF8A4C" strokeWidth={2} />
      <SvgText x={120} y={208} fill="#FF8A4C">ONE THREAD</SvgText>
      <path d="M220 200 C 280 200, 290 100, 350 100" style={flowLine(active, '#FF8A4C')} />
      <path d="M220 200 C 280 200, 290 300, 350 300" style={flowLine(active, '#4FD1C5')} />
      <rect x={350} y={10} width={430} height={170} rx={22} fill="rgba(255,255,255,0.04)" stroke={C.muted} strokeWidth={2} />
      <SvgText x={376} y={46} anchor="start">CORE 1 · LOCAL</SvgText>
      <rect x={376} y={68} width={180} height={80} rx={14} fill="rgba(255,138,76,0.22)" stroke="#FF8A4C" strokeWidth={2} />
      <SvgText x={466} y={117} fill="#F3F6FC">FXU0</SvgText>
      <rect x={582} y={68} width={180} height={80} rx={14} fill="rgba(255,197,107,0.22)" stroke="#FFC56B" strokeWidth={2} />
      <SvgText x={672} y={117} fill="#F3F6FC">FPU0</SvgText>
      <rect x={350} y={220} width={430} height={170} rx={22} fill="rgba(79,209,197,0.06)" stroke="#4FD1C5" strokeWidth={2} />
      <SvgText x={376} y={256} anchor="start" fill="#4FD1C5">CORE 0 · BORROWED</SvgText>
      <g style={pulse}>
        <rect x={376} y={278} width={180} height={80} rx={14} fill="rgba(79,209,197,0.28)" stroke="#4FD1C5" strokeWidth={2} />
        <SvgText x={466} y={327} fill="#F3F6FC">FXU1</SvgText>
        <rect x={582} y={278} width={180} height={80} rx={14} fill="rgba(79,209,197,0.28)" stroke="#4FD1C5" strokeWidth={2} />
        <SvgText x={672} y={327} fill="#F3F6FC">FPU1</SvgText>
      </g>
      <path d="M466 148 L466 278" style={flowLine(active, '#4FD1C5')} />
      <path d="M672 148 L672 278" style={flowLine(active, '#4FD1C5')} />
      <SvgText x={569} y={206} fill="#4FD1C5">BUS</SvgText>
    </svg>
  );
};

const Idea: Page = () => (
  <Frame eyebrow="03 · THE BIG IDEA" title="SMT shares a core. rSMT borrows one.">
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80 }}>
      <Steps>
        <Step>
          <Panel title="SMT" sub="One core serves two threads.">
            <SmtDiagram />
          </Panel>
        </Step>
        <Step>
          <Panel title="Reverse SMT" sub="One thread borrows a sibling core’s idle units.">
            <RsmtDiagram />
          </Panel>
        </Step>
      </Steps>
    </div>
  </Frame>
);

/* ───────────────────────── 04 pipeline ───────────────────────── */

const StageBox = ({ n, name, desc }: { n: string; name: string; desc: string }) => (
  <div
    style={{
      width: 330,
      height: 230,
      boxSizing: 'border-box',
      padding: 30,
      borderRadius: 'var(--osd-radius)',
      border: `1px solid ${C.line}`,
      background: 'rgba(10,14,28,0.92)',
      position: 'relative',
      zIndex: 1,
    }}
  >
    <div style={{ fontFamily: mono, fontSize: 22, color: 'var(--osd-accent)' }}>{n}</div>
    <div style={{ marginTop: 10, fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em' }}>{name}</div>
    <div style={{ marginTop: 10, fontSize: 28, lineHeight: 1.4, color: C.muted }}>{desc}</div>
  </div>
);

const Packet = ({ delay }: { delay: number }) => (
  <div
    style={{
      position: 'absolute',
      top: 100,
      width: 30,
      height: 30,
      borderRadius: 8,
      background: 'var(--osd-accent)',
      boxShadow: '0 0 28px 6px rgba(255,138,76,0.6)',
      animation: `rs-packet 4.2s linear ${delay}ms infinite`,
      zIndex: 2,
    }}
  />
);

const Pipeline: Page = () => {
  const active = useIsActivePage();
  return (
    <Frame eyebrow="04 · THE PIPELINE" title="Four stages, one instruction per clock">
      <div style={{ position: 'relative', height: 230, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 114, height: 2, background: C.line }} />
        {active ? <Packet delay={0} /> : null}
        {active ? <Packet delay={1400} /> : null}
        {active ? <Packet delay={2800} /> : null}
        <StageBox n="STAGE 1" name="FETCH" desc="Pull the next instruction. Frozen while a branch is in flight." />
        <StageBox n="STAGE 2" name="DECODE" desc="Decode and classify. Fetch + Decode cost 2 cycles." />
        <StageBox n="STAGE 3" name="ISSUE" desc="Pick a unit. Stalls if it is busy or a hazard blocks it." />
        <StageBox n="STAGE 4" name="EXECUTE" desc="Fixed-latency units: FXU, FPU, Branch, LSU." />
      </div>
      <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', gap: 22, fontSize: 36, lineHeight: 1.4 }}>
        <div style={rise(active, 300)}>
          <b style={{ color: 'var(--osd-accent)' }}>Single issue.</b> Each stage holds at most one instruction.
        </div>
        <div style={rise(active, 450)}>
          <b style={{ color: 'var(--osd-accent)' }}>In order.</b> A PowerPC 600-style model: latencies are known, so
          cross-core dispatch is predictable.
        </div>
        <div style={rise(active, 600)}>
          <b style={{ color: 'var(--osd-accent)' }}>Every stall counted.</b> Structural, data and control.
        </div>
      </div>
    </Frame>
  );
};

/* ───────────────────────── 05 execution units ───────────────────────── */

const UnitCard = ({ name, kind, cycles, remote = false }: { name: string; kind: string; cycles: string; remote?: boolean }) => {
  const active = useIsActivePage();
  return (
    <div
      style={{
        height: 300,
        boxSizing: 'border-box',
        padding: 34,
        borderRadius: 'var(--osd-radius)',
        border: remote ? `2px solid ${C.teal}` : `1px solid ${C.line}`,
        background: remote ? 'rgba(79,209,197,0.08)' : C.panel,
        animation: active && remote ? 'rs-glow 2.6s ease-in-out infinite' : undefined,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: '0.1em', color: remote ? C.teal : C.dim }}>
        {remote ? 'REMOTE CORE' : 'LOCAL CORE'}
      </div>
      <div style={{ marginTop: 10, fontSize: 68, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1 }}>{name}</div>
      <div style={{ marginTop: 6, fontSize: 30, color: C.muted }}>{kind}</div>
      <div style={{ marginTop: 20, fontFamily: mono, fontSize: 36, color: remote ? C.teal : 'var(--osd-accent)' }}>{cycles}</div>
    </div>
  );
};

const Units: Page = () => {
  const active = useIsActivePage();
  return (
    <Frame eyebrow="05 · EXECUTION UNITS" title="Six slots. Two of them live next door.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40, ...rise(active, 200) }}>
        <UnitCard name="FXU0" kind="Integer · ADD SUB MUL DIV" cycles="5 cycles" />
        <UnitCard name="FXU1" kind="Integer · rSMT offload" cycles="5 + delay cycles" remote />
        <UnitCard name="Branch" kind="Conditional branch" cycles="4 cycles" />
        <UnitCard name="FPU0" kind="Float · fADD fSUB fMUL fDIV" cycles="6 cycles" />
        <UnitCard name="FPU1" kind="Float · rSMT offload" cycles="6 + delay cycles" remote />
        <UnitCard name="LSU" kind="Load / Store" cycles="3 cycles" />
      </div>
    </Frame>
  );
};

/* ───────────────────────── 06 hazards ───────────────────────── */

const HazardCard = ({
  tag,
  color,
  name,
  trigger,
  effect,
  from,
  to,
}: {
  tag: string;
  color: string;
  name: string;
  trigger: string;
  effect: string;
  from: string;
  to: string;
}) => (
  <div
    style={{
      height: 540,
      boxSizing: 'border-box',
      padding: 36,
      borderRadius: 'var(--osd-radius)',
      border: `1px solid ${C.line}`,
      borderTop: `6px solid ${color}`,
      background: C.panel,
    }}
  >
    <div
      style={{
        display: 'inline-block',
        padding: '4px 16px',
        borderRadius: 8,
        background: color,
        color: '#03050C',
        fontFamily: mono,
        fontSize: 24,
        fontWeight: 700,
      }}
    >
      {tag}
    </div>
    <div style={{ marginTop: 18, fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em' }}>{name}</div>
    <div style={{ marginTop: 14, fontSize: 28, lineHeight: 1.45, color: C.muted, minHeight: 82 }}>{trigger}</div>
    <div style={{ fontSize: 28, lineHeight: 1.45, minHeight: 82 }}>{effect}</div>
    <div style={{ marginTop: 22, fontFamily: mono, fontSize: 22, color: C.dim }}>CYCLES AT 0% → 100% DEPENDENCY</div>
    <div style={{ marginTop: 6, fontFamily: mono, fontSize: 48, color }}>
      {from} → {to}
    </div>
  </div>
);

const Hazards: Page = () => (
  <Frame eyebrow="06 · HAZARDS" title="Three ways the pipeline stalls">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
      <Steps>
        <Step>
          <HazardCard
            tag="STALL"
            color={C.red}
            name="Structural"
            trigger="The target unit is busy."
            effect="Issue waits in the pipeline until the unit frees up."
            from="1,508"
            to="3,459"
          />
        </Step>
        <Step>
          <HazardCard
            tag="DEP"
            color={C.amber}
            name="Data"
            trigger="A read-after-write hazard, set by the dependency slider."
            effect="Blocks issue to the remote FXU / FPU slot."
            from="0"
            to="773"
          />
        </Step>
        <Step>
          <HazardCard
            tag="BR"
            color={C.gold}
            name="Control"
            trigger="A branch instruction is in flight."
            effect="Fetch is frozen for the branch latency."
            from="144"
            to="220"
          />
        </Step>
      </Steps>
    </div>
  </Frame>
);

/* ───────────────────────── 07 headline result ───────────────────────── */

const CycleBar = ({
  label,
  value,
  pct,
  color,
  delay,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
  delay: number;
}) => {
  const active = useIsActivePage();
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 28, color: C.muted }}>
        <span>{label}</span>
        <span style={{ color: 'var(--osd-text)' }}>{value} cycles</span>
      </div>
      <div style={{ marginTop: 10, height: 64, borderRadius: 12, background: C.panel, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            transformOrigin: 'left',
            animation: active ? `rs-grow 1100ms ${EASE_OUT} ${delay}ms both` : undefined,
          }}
        />
      </div>
    </div>
  );
};

const Result: Page = () => {
  const active = useIsActivePage();
  return (
    <Frame eyebrow="07 · THE RESULT" title="One thread, nearly twice as fast">
      <div style={{ display: 'flex', alignItems: 'center', gap: 80 }}>
        <div
          style={{
            fontFamily: 'var(--osd-font-display)',
            fontSize: 210,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.05em',
            color: 'var(--osd-accent)',
            textShadow: '0 0 80px rgba(255,138,76,0.45)',
            minWidth: 820,
          }}
        >
          <CountUp to={192.7} decimals={1} suffix="%" />
        </div>
        <div style={{ fontSize: 34, lineHeight: 1.5, color: C.muted, ...rise(active, 400) }}>
          GAIN = SMT-OFF cycles ÷ SMT-ON cycles × 100.
          <br />
          Above 100% means rSMT helped.
        </div>
      </div>
      <div style={{ marginTop: 56, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <CycleBar label="rSMT ON" value="2,538" pct={51.9} color="var(--osd-accent)" delay={300} />
        <CycleBar label="rSMT OFF" value="4,891" pct={100} color="#6E7BA0" delay={600} />
      </div>
      <div style={{ marginTop: 40, fontFamily: mono, fontSize: 24, color: C.dim, lineHeight: 1.5 }}>
        1,000 instructions · 80% FXU · 5% FPU · 5% Branch · 5% LSU · rSMT delay 0 · 100% availability · 0% dependency
      </div>
    </Frame>
  );
};

/* ───────────────────────── 08 sweeps ───────────────────────── */

type ChartPoint = { x: number; y: number };
const CW = 810;
const CH = 470;
const PL = 96;
const PR = 36;
const PT = 30;
const PB = 84;

const Chart = ({
  pts,
  xMin,
  xMax,
  xTicks,
  xTitle,
}: {
  pts: ChartPoint[];
  xMin: number;
  xMax: number;
  xTicks: number[];
  xTitle: string;
}) => {
  const active = useIsActivePage();
  const sx = (x: number) => PL + ((x - xMin) / (xMax - xMin)) * (CW - PL - PR);
  const sy = (y: number) => PT + ((200 - y) / 100) * (CH - PT - PB);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ');
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(sx(pts[i].x) - sx(pts[i - 1].x), sy(pts[i].y) - sy(pts[i - 1].y));
  const lineStyle = { '--len': len, animation: active ? `rs-draw 1500ms ${EASE_OUT} 300ms both` : undefined } as CSSProperties;
  return (
    <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label={xTitle}>
      <line x1={PL} x2={CW - PR} y1={sy(200)} y2={sy(200)} stroke={C.line} />
      <line x1={PL} x2={CW - PR} y1={sy(150)} y2={sy(150)} stroke={C.line} />
      <line x1={PL} x2={CW - PR} y1={sy(100)} y2={sy(100)} stroke={C.red} strokeDasharray="8 8" />
      <SvgText x={PL - 14} y={sy(200) + 8} anchor="end">200%</SvgText>
      <SvgText x={PL - 14} y={sy(150) + 8} anchor="end">150%</SvgText>
      <SvgText x={PL - 14} y={sy(100) + 8} anchor="end">100%</SvgText>
      <SvgText x={CW - PR} y={sy(100) + 32} anchor="end" fill={C.red}>no gain</SvgText>
      {xTicks.map((t) => (
        <SvgText key={t} x={sx(t)} y={CH - PB + 38} size={24}>
          {t}
        </SvgText>
      ))}
      <SvgText x={(PL + CW - PR) / 2} y={CH - 14} size={24} fill={C.dim}>{xTitle}</SvgText>
      <path d={d} fill="none" stroke="#FF8A4C" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} style={lineStyle} />
      {pts.map((p, i) => (
        <g key={p.x} style={active ? { animation: `rs-rise 500ms ${EASE_OUT} ${700 + i * 180}ms both` } : undefined}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r={10} fill="#03050C" stroke="#FF8A4C" strokeWidth={4} />
          <SvgText x={sx(p.x)} y={sy(p.y) - 22} size={22} fill="#F3F6FC">{`${p.y.toFixed(0)}%`}</SvgText>
        </g>
      ))}
    </svg>
  );
};

const Sweeps: Page = () => (
  <Frame eyebrow="08 · WHAT ERODES THE GAIN" title="Bus delay and dependencies">
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60 }}>
      <div>
        <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 10 }}>Inter-core delay</div>
        <Chart
          pts={[
            { x: 0, y: 192.6 },
            { x: 2, y: 169.8 },
            { x: 4, y: 157.4 },
            { x: 6, y: 148.1 },
            { x: 8, y: 141.1 },
            { x: 10, y: 136.6 },
          ]}
          xMin={0}
          xMax={10}
          xTicks={[0, 2, 4, 6, 8, 10]}
          xTitle="rSMT delay (extra cycles)"
        />
      </div>
      <div>
        <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 10 }}>Data dependency</div>
        <Chart
          pts={[
            { x: 0, y: 195.0 },
            { x: 25, y: 188.9 },
            { x: 50, y: 176.2 },
            { x: 75, y: 162.0 },
            { x: 100, y: 100.1 },
          ]}
          xMin={0}
          xMax={100}
          xTicks={[0, 25, 50, 75, 100]}
          xTitle="% data dependency"
        />
      </div>
    </div>
  </Frame>
);

/* ───────────────────────── 09 utilization ───────────────────────── */

const UnitBar = ({ label, pct, remote = false, delay }: { label: string; pct: number; remote?: boolean; delay: number }) => {
  const active = useIsActivePage();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ width: 130, fontFamily: mono, fontSize: 28, color: remote ? C.teal : C.muted }}>{label}</div>
      <div style={{ flex: 1, height: 44, borderRadius: 10, background: C.panel, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: remote ? C.teal : 'var(--osd-accent)',
            transformOrigin: 'left',
            animation: active ? `rs-grow 1000ms ${EASE_OUT} ${delay}ms both` : undefined,
          }}
        />
      </div>
      <div style={{ width: 120, textAlign: 'right', fontFamily: mono, fontSize: 28 }}>{pct.toFixed(1)}%</div>
    </div>
  );
};

const StallStat = ({ value, label, color }: { value: number; label: string; color: string }) => (
  <div>
    <div style={{ fontFamily: 'var(--osd-font-display)', fontSize: 96, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.04em', color }}>
      <CountUp to={value} />
    </div>
    <div style={{ marginTop: 6, fontFamily: mono, fontSize: 24, color: C.muted }}>{label}</div>
  </div>
);

const Utilization: Page = () => (
  <Frame eyebrow="09 · UNDER THE HOOD" title="Both integer units stay busy">
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 520px', gap: 120 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <UnitBar label="FXU0" pct={80.4} delay={200} />
        <UnitBar label="FXU1" pct={78.4} remote delay={350} />
        <UnitBar label="FPU0" pct={7.8} delay={500} />
        <UnitBar label="LSU" pct={7.1} delay={650} />
        <UnitBar label="Branch" pct={6.9} delay={800} />
        <UnitBar label="FPU1" pct={1.9} remote delay={950} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: '0.1em', color: C.dim }}>STALL CYCLES · rSMT ON</div>
        <StallStat value={1480} label="STRUCTURAL" color={C.red} />
        <StallStat value={160} label="CONTROL" color={C.gold} />
        <StallStat value={2} label="DATA" color={C.amber} />
      </div>
    </div>
  </Frame>
);

/* ───────────────────────── 10 v1 vs v2 ───────────────────────── */

const CompareRow = ({ k, a, b, delay }: { k: string; a: string; b: string; delay: number }) => {
  const active = useIsActivePage();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr 1fr',
        gap: 32,
        padding: '16px 0',
        borderTop: `1px solid ${C.line}`,
        fontSize: 30,
        lineHeight: 1.4,
        ...rise(active, delay),
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 24, color: C.dim, paddingTop: 4 }}>{k}</div>
      <div style={{ color: C.muted }}>{a}</div>
      <div style={{ fontWeight: 600 }}>{b}</div>
    </div>
  );
};

const Compare: Page = () => (
  <Frame eyebrow="10 · 2009 → TODAY" title="From a Java 5 proof of concept to rSMTv2">
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr 1fr',
        gap: 32,
        paddingBottom: 14,
        fontFamily: mono,
        fontSize: 24,
        letterSpacing: '0.1em',
      }}
    >
      <div />
      <div style={{ color: C.dim }}>rSMT · ORIGINAL</div>
      <div style={{ color: 'var(--osd-accent)' }}>rSMTv2</div>
    </div>
    <CompareRow k="LANGUAGE" a="Java 5 · NetBeans / Ant" b="Java 21 LTS · Maven" delay={100} />
    <CompareRow k="TYPES" a="Raw Vector, int index" b="sealed interface + records" delay={200} />
    <CompareRow k="UNITS" a="FXU×2 · FPU×1 · Branch×1" b="FXU×2 · FPU×2 · Branch×1 · LSU×1" delay={300} />
    <CompareRow k="PIPELINE" a="Flat clock counter" b="Fetch → Decode → Issue → Execute" delay={400} />
    <CompareRow k="HAZARDS" a="Branch stall only" b="Structural, data and control" delay={500} />
    <CompareRow k="INTERFACE" a="Console only" b="JavaFX GUI, rSMT toggle mid-run" delay={600} />
    <CompareRow k="TESTS" a="None" b="19 JUnit 5 tests" delay={700} />
  </Frame>
);

/* ───────────────────────── 11 bugs ───────────────────────── */

const CodeBlock = ({ label, color, code }: { label: string; color: string; code: string }) => (
  <div style={{ padding: '22px 28px', borderRadius: 12, borderLeft: `6px solid ${color}`, background: C.panel }}>
    <div style={{ fontFamily: mono, fontSize: 22, color, letterSpacing: '0.08em' }}>{label}</div>
    <div style={{ marginTop: 8, fontFamily: mono, fontSize: 28, lineHeight: 1.5, whiteSpace: 'pre' }}>{code}</div>
  </div>
);

const Bugs: Page = () => (
  <Frame eyebrow="11 · FIFTEEN YEARS OF WRONG" title="Two bugs the rewrite caught">
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Steps>
          <div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>Inverted dependency check</div>
            <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1.45, color: C.muted }}>
              rSMT.java:311 · issue was never blocked, even at 100% dependency.
            </div>
          </div>
          <Step>
            <CodeBlock label="BEFORE · 2009" color={C.red} code={'return rGen > dependsPercent;'} />
          </Step>
          <Step>
            <CodeBlock label="AFTER · rSMTv2" color={C.green} code={'return rGen <= dependsPercent;'} />
          </Step>
        </Steps>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Steps>
          <div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>FP arithmetic never ran</div>
            <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1.45, color: C.muted }}>
              genInstructions.java:96 · FP checked index 0–3, but FP is 4–7.
            </div>
          </div>
          <Step>
            <CodeBlock label="BEFORE · 2009" color={C.red} code={'if (index >= 0 && index <= 3) {'} />
          </Step>
          <Step>
            <CodeBlock label="AFTER · rSMTv2" color={C.green} code={'case FpuInstruction i -> …'} />
          </Step>
        </Steps>
      </div>
    </div>
  </Frame>
);

/* ───────────────────────── 12 built with ───────────────────────── */

const LogoTile = ({ src, light, name, sub }: { src: string; light: boolean; name: string; sub: string }) => (
  <div style={{ borderRadius: 'var(--osd-radius)', border: `1px solid ${C.line}`, background: C.panel, overflow: 'hidden' }}>
    <div
      style={{
        height: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: light ? '#FFFFFF' : '#0D1117',
      }}
    >
      <img src={src} alt={name} style={{ height: 120, maxWidth: 300 }} />
    </div>
    <div style={{ padding: '24px 30px 28px' }}>
      <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>{name}</div>
      <div style={{ marginTop: 6, fontSize: 28, lineHeight: 1.4, color: C.muted }}>{sub}</div>
    </div>
  </div>
);

const Stack: Page = () => {
  const active = useIsActivePage();
  return (
    <Frame eyebrow="12 · BUILT WITH" title="Java 21, JavaFX, and IBM Bob">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40, ...rise(active, 150) }}>
        <LogoTile src={javaLogo} light name="Java 21 LTS" sub="JavaFX 21 GUI · Maven · JUnit 5" />
        <LogoTile src={ibmLogo} light name="IBM PowerPC" sub="The architecture rSMT was invented for" />
        <LogoTile src={githubLogo} light={false} name="007Style/rSMTv2" sub="Fat JAR plus a macOS .dmg" />
      </div>
      <div
        style={{
          marginTop: 44,
          padding: '28px 40px',
          borderRadius: 'var(--osd-radius)',
          border: '2px solid var(--osd-accent)',
          background: 'rgba(255,138,76,0.1)',
          fontSize: 38,
          lineHeight: 1.45,
          ...rise(active, 450),
        }}
      >
        <b style={{ color: 'var(--osd-accent)' }}>Daneyand J. Singley</b> — co-inventor of the patent and author of the
        original rSMT simulator.
      </div>
    </Frame>
  );
};

/* ───────────────────────── 13 close ───────────────────────── */

const Close: Page = () => {
  const active = useIsActivePage();
  return (
    <div style={fill}>
      <style>{CSS}</style>
      <GlowCanvas />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(90deg, rgba(3,5,12,0.88) 0%, rgba(3,5,12,0.8) 34%, rgba(3,5,12,0.35) 58%, rgba(3,5,12,0) 76%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 40,
          padding: '0 120px',
          textShadow: '0 0 40px #03050C',
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 26, letterSpacing: '0.1em', color: 'var(--osd-accent)' }}>THANK YOU</div>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--osd-font-display)',
            fontSize: 'var(--osd-size-hero)',
            fontWeight: 800,
            lineHeight: '134px',
            letterSpacing: '-0.04em',
          }}
        >
          <DecodeText text={'One idea.\nTwo cores.'} delay={150} />
        </h1>
        <p style={{ margin: 0, maxWidth: 1100, fontSize: 36, lineHeight: '50px', color: C.muted, fontWeight: 600, ...rise(active, 800) }}>
          Reverse SMT was co-invented by <b style={{ color: 'var(--osd-text)' }}>Daneyand J. Singley</b>, Shawn M. Luke
          and John Sargis, Jr. at IBM.
        </p>
        <div style={{ fontFamily: mono, fontSize: 28, color: C.muted, ...rise(active, 1000) }}>
          github.com/007Style/rSMTv2 · US 8,595,468 B2
        </div>
      </div>
    </div>
  );
};
Close.transition = settle;

/* ───────────────────────── deck ───────────────────────── */

export const meta: SlideMeta = {
  title: 'rSMTv2 — One Thread, Two Cores',
  createdAt: '2026-11-07T03:10:00.376Z',
};

export const notes: (string | undefined)[] = [
  `Open on the glow while the title decodes.
rSMT is Reverse Simultaneous Multithreading. Say up front that it was co-invented by Daneyand J. Singley, with Shawn Luke and John Sargis, at IBM.`,
  `US 8,595,468 B2, filed November 2009, granted November 2013.
Reveal the inventors one at a time. Daneyand was also the author of the original rSMT simulator that proved the idea.`,
  `SMT: one core, two threads. rSMT turns that around: one thread borrows idle units on a sibling core.
Reveal SMT first, then rSMT. Point at the dashed bus.`,
  `Fetch, Decode, Issue, Execute. One instruction per stage per clock.
The orange packets are instructions. Fetch plus Decode cost two cycles before Issue.`,
  `Six slots. FXU1 and FPU1 live on the remote core, so they cost the base latency plus the bus delay.
Latencies: FXU 5, FPU 6, Branch 4, LSU 3.`,
  `Three stall types, all counted. Reveal one at a time.
The numbers compare a run at 0% dependency with one at 100%. Data stalls go from 0 to 773.`,
  `The headline: 2,538 cycles with rSMT on against 4,891 off. That is a 192.7% gain.
Config: 1,000 instructions, 80% FXU, delay 0, full availability, no dependencies. Runs are random, so expect small variation.`,
  `Two ways to lose the gain. Bus delay pulls it from about 193% to about 137% at 10 cycles.
Data dependency is gentle until the very end, then it collapses to 100%, meaning no benefit.`,
  `Both integer units run near 80% busy, so the work really is split across two cores.
The structural stalls are what remain once both units are saturated.`,
  `The original was a 2009 Java 5 console program. rSMTv2 keeps the model and adds types, a pipeline, hazards, a GUI, and tests.`,
  `Two bugs found during the rewrite. The dependency check was inverted, and floating point never executed.
Reveal before, then after, in each column.`,
  `Java 21, JavaFX, Maven, JUnit 5. Built in partnership with IBM Bob.
Land the credit: the idea and the patent belong to Daneyand and his co-inventors.`,
  `Close on the glow. Repeat the credit and point people at the repo.`,
];

export default [
  Cover,
  Patent,
  Idea,
  Pipeline,
  Units,
  Hazards,
  Result,
  Sweeps,
  Utilization,
  Compare,
  Bugs,
  Stack,
  Close,
] satisfies Page[];
