/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable edge runtime
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001'],
    },
  },
}

module.exports = nextConfig 