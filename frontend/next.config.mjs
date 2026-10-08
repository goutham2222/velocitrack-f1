const BUILD_TIME = Date.now().toString();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: false, // Prevents double-mounting canvas contexts in dev
  transpilePackages: ['three'],
  generateBuildId: async () => {
    return BUILD_TIME;
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_TIME,
  },
};

export default nextConfig;

