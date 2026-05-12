/** @type {import('next').NextConfig} */
// NEXT_OUTPUT=export → static build (LITE / HF Space); else standalone (compose).
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig = {
  output: isExport ? "export" : "standalone",
  trailingSlash: isExport, // /drift → out/drift/index.html
  images: { unoptimized: true },
  reactStrictMode: true,
};

module.exports = nextConfig;
