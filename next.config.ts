import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
const config = (phase: string): NextConfig => ({
  // Development must not overwrite the files served by `next start`.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  devIndicators: false,
});
export default config;
