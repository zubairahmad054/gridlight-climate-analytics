/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    '/api/analytics': ['./data/reports/analytics.json'],
    '/api/experiments': ['./data/reports/model-study.json'],
  },
}

export default nextConfig
