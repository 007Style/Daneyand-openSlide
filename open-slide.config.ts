import type { OpenSlideConfig } from '@open-slide/core';

declare const process: { env: Record<string, string | undefined> };

const openSlideConfig: OpenSlideConfig = {
  // GitHub Pages serves this project under /Daneyand-openSlide/.
  // GITHUB_ACTIONS is set automatically in CI, so Netlify/Vercel/local keep "/".
  ...(process.env.GITHUB_ACTIONS ? { base: '/Daneyand-openSlide/' } : {}),
};

export default openSlideConfig;
