/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Prevents double-mounting canvas contexts in dev
  transpilePackages: ['three'],
};

export default nextConfig;

