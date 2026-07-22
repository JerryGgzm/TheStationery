/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Pixel art assets must never be optimized/smoothed.
  reactStrictMode: true,
};

export default nextConfig;
