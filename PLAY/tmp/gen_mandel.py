"""Generate index5/6/7.html from index.html by swapping out the pass-1 (glow) fragment shader
for Mandelbrot-based ones. Everything else (ASCII layer, decode text, stage scaling) is unchanged."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = (ROOT / "index.html").read_text()

# ── Shared GLSL ──
COMMON = r"""#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uDarkBackground;
out vec4 fragColor;

// ── palette (OKLCH), same parameters as the glow variants ──
const float HUE = @HUE@;
const float HUE_SPREAD = @HUE_SPREAD@;
const float CHROMA = @CHROMA@;
const float LIGHTNESS = @LIGHTNESS@;
const float LIGHT_SWING = @LIGHT_SWING@;
const float BAND_FREQ = @BAND_FREQ@;      // colour bands per iteration
const float BAND_DRIFT = @BAND_DRIFT@;    // colour flow speed (rad/s)
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
@PRECHECK@
  vec2 z = vec2(0.0);
  for (int i = 0; i < @MAX_ITER@; i++) {
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
"""

# ── Static-camera Mandelbrot: slow breathing zoom through Seahorse Valley ──
MAIN_STATIC = r"""
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
"""

# ── Infinite zoom: self-similar at the Misiurewicz point c0 = i ──
#    M(c0 + d / LAMBDA) looks like M(c0 + d), with the escape count shifted by +2 (verified numerically).
#    So zooming by |LAMBDA| while rotating by arg(LAMBDA) and subtracting 2 from the escape count per
#    cycle gives a perfect loop. Two layers one cycle apart are cross-faded to hide the small residual.
MAIN_ZOOM = r"""
const vec2 C0 = vec2(0.0, 1.0);                    // Misiurewicz point i
const float LAMBDA_LEN = 5.65685424949;            // |4 + 4i|
const float LAMBDA_ARG = 0.78539816340;            // arg(4 + 4i) = 45 degrees
const float BASE_HEIGHT = 0.0035;                  // view height (c-plane units) at level 0
const float CYCLE_SECONDS = @CYCLE@;               // seconds per 5.66x zoom

vec3 layer(vec2 pos, float level) {
  float a = -LAMBDA_ARG * level;
  float ca = cos(a), sa = sin(a);
  vec2 c = C0 + mat2(ca, sa, -sa, ca) * pos * (BASE_HEIGHT * exp(-level * log(LAMBDA_LEN)));
  float mu = mandel(c);
  if (mu >= 0.0) mu -= 2.0 * level;                 // undo the +2 per cycle so every level shares one palette phase
  return shade(mu, iTime);
}

void main() {
  vec2 R = iResolution.xy;
  vec2 pos = (gl_FragCoord.xy - vec2(0.64, 0.5) * R) / R.y;
  float level = iTime / CYCLE_SECONDS;
  float phi = fract(level);
  float w = smoothstep(0.0, 1.0, phi);
  vec3 ink = mix(layer(pos, phi), layer(pos, phi - 1.0), w);
  fragColor = vec4(finish(ink, pos), 1.0);
}
"""


@dataclass
class Variant:
    out: str
    label: str
    blurb: str
    main: str
    max_iter: int
    precheck: bool
    hue: float
    hue_spread: float
    chroma: float
    lightness: float
    light_swing: float
    band_freq: float
    band_drift: float
    cycle: float = 14.0


VARIANTS = [
    Variant("index5.html", "Mandelbrot Ember",
            "Mandelbrot set, Seahorse Valley breathing zoom, Ember palette (index2.html colours)",
            MAIN_STATIC, 520, True, 0.045, 0.2, 0.165, 0.60, 0.208, 0.33, 0.55),
    Variant("index6.html", "Mandelbrot Ultraviolet",
            "Mandelbrot set, Seahorse Valley breathing zoom, Ultraviolet palette (index4.html colours)",
            MAIN_STATIC, 520, True, 0.63, 0.3, 0.17, 0.55, 0.26, 0.33, 0.55),
    Variant("index7.html", "Infinite Mandelbrot Zoom",
            "Endless self-similar Mandelbrot zoom into the Misiurewicz point i (5.66x + 45 deg per cycle), Aurora palette",
            MAIN_ZOOM, 320, False, 0.36, 0.24, 0.15, 0.58, 0.208, 0.42, 0.6),
]

PRECHECK = """  // skip the main cardioid and period-2 bulb: they never escape
  float q = (c.x - 0.25) * (c.x - 0.25) + c.y * c.y;
  if (q * (q + (c.x - 0.25)) < 0.25 * c.y * c.y) return -1.0;
  if ((c.x + 1.0) * (c.x + 1.0) + c.y * c.y < 0.0625) return -1.0;"""

BLOCK = re.compile(r"(// Pass 1:.*?\nconst FRAG_GLOW = `)(.*?)(`;\n)", re.S)
assert BLOCK.search(SRC), "FRAG_GLOW block not found in index.html"


def build(v: Variant) -> str:
    glsl = COMMON + v.main.replace("@CYCLE@", f"{v.cycle:.1f}")
    for key, val in {
        "HUE": v.hue, "HUE_SPREAD": v.hue_spread, "CHROMA": v.chroma, "LIGHTNESS": v.lightness,
        "LIGHT_SWING": v.light_swing, "BAND_FREQ": v.band_freq, "BAND_DRIFT": v.band_drift,
    }.items():
        glsl = glsl.replace(f"@{key}@", repr(float(val)))
    glsl = glsl.replace("@MAX_ITER@", str(v.max_iter)).replace("@PRECHECK@", PRECHECK if v.precheck else "")
    html = BLOCK.sub(lambda m: m.group(1).replace(
        "// Pass 1: layered, warped, folded glow. Constants are the (slider-tuned looking) values from the deck.",
        "// Pass 1: Mandelbrot set -> glow texture.") + glsl + m.group(3), SRC, count=1)
    html = re.sub(r"<title>.*?</title>", f"<title>Inference Stack cover – {v.label}</title>", html, count=1)
    html = html.replace("<!--\n  Standalone port", f"<!--\n  {v.blurb}.\n  Standalone port", 1)
    return html


for v in VARIANTS:
    (ROOT / v.out).write_text(build(v))
    print("wrote", v.out)
