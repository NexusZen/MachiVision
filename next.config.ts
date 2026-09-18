import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.NODE_ENV === 'production' ? '.next-production' : '.next',
  devIndicators: false,
};
export default config;
