/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@terminal49/sdk'],
  },
};

export default nextConfig;
