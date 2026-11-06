# Daneyand-openSlide

![Status](https://img.shields.io/badge/status-early%20stages-orange)
![Built on](https://img.shields.io/badge/built%20on-open--slide-3b82d4)
![Canvas](https://img.shields.io/badge/canvas-1920%C3%971080-7c5cd8)
![WebGL2](https://img.shields.io/badge/WebGL2-shaders-lightgrey)

**Daneyand's Open Slide template.**

A style template for presentations, built entirely on [**open-slide**](https://github.com/open-slide/open-slide), the React-based slide framework where you write slides and the framework handles the Vite/React stack, layout, navigation, hot reload and fullscreen play mode.

You are welcome to take this, fork it, and tweak it to make it your own.

> **Early stages.** This is a work in progress and will grow into a full template over the next several days. Expect things to move, change and break.

---

## What this is

Everything here is intended to be **open-slide based**. Slides are authored the open-slide way:

- Each slide lives at `slides/<kebab-case-id>/index.tsx` and default-exports an array of `Page` components.
- Every page renders into a fixed **1920×1080** canvas that the framework scales to fit.
- The framework provides the home page, viewer, thumbnail rail, keyboard navigation and presenter mode.

Learn more, install it and read the docs at **https://github.com/open-slide/open-slide**
(npm: [`@open-slide/core`](https://www.npmjs.com/package/@open-slide/core)).

---

## What's in here so far

### `PLAY/` – animated cover-slide experiments

A sandbox for an animated, mathematical cover slide. Each file is a standalone page you can open directly in a browser (no build step). All of them share the same 1920×1080 design canvas, a WebGL2 shader for the underlying graphic, an ASCII-glyph post-process layer, and a per-character "decode" text reveal.

| File | Underlying graphic |
|---|---|
| `index.html` | Original flowing, breathing OKLCH ribbon glow (the reference) |
| `index2.html` | **Ember** – warm amber to magenta ribbons |
| `index3.html` | **Aurora** – green, cyan and blue, more warp |
| `index4.html` | **Ultraviolet** – deep blue, violet and hot pink, higher contrast |
| `index5.html` | **Mandelbrot Ember** – Mandelbrot set, breathing zoom through Seahorse Valley, Ember palette |
| `index6.html` | **Mandelbrot Ultraviolet** – same fractal animation, Ultraviolet palette |
| `index7.html` | **Infinite Mandelbrot zoom** – endless self-similar zoom into the Misiurewicz point `c = i` |

**Keys:** `R` replay the text decode · `.` skip it · `A` toggle the ASCII layer.

**How the infinite zoom loops:** at `c = i` the Mandelbrot set is self-similar, so zooming by about 5.66× while rotating 45° per cycle gives a seamless loop. The escape count shifts by a constant 2 per cycle, which the shader subtracts. Two layers one cycle apart are cross-faded to hide the small leftover error.

`PLAY/tmp/gen_mandel.py` regenerates `index5.html`, `index6.html` and `index7.html` from `index.html`, so palettes and speeds are quick to tweak.

---

## Running the experiments

Open any `PLAY/index*.html` file in a modern browser with WebGL2 support (Chrome, Edge, Safari, Firefox). A GPU is recommended: the Mandelbrot variants are shader-heavy.

---

## Roadmap

- [ ] Port the chosen cover into an open-slide `Page` component (`.tsx`)
- [ ] Set up the open-slide workspace (`slides/`, `themes/`)
- [ ] Define the theme: palette, typography, layout, fixed Title/Footer components
- [ ] Add content-page layouts to match the cover
- [ ] Document how to use the template

---

*From the minds of IBM Bob & Daneyand*
