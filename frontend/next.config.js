/** @type {import('next').NextConfig} */
// NEXT_OUTPUT=export → static HTML build (served by FastAPI in LITE / Hugging
// Face Spaces mode). Otherwise a standalone server build (for the Docker stack).
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig = {
  output: isExport ? "export" : "standalone",
  trailingSlash: isExport, // so /drift resolves to out/drift/index.html
  images: { unoptimized: true },
  reactStrictMode: true,
};

module.exports = nextConfig;
