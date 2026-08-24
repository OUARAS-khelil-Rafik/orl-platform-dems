import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // `standalone` is for Docker/self-hosted. Vercel ignores it but we disable on Vercel
  // to avoid extra tracing overhead. Keep standalone locally if you use Docker.
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  transpilePackages: ['motion'],
  turbopack: {},
  allowedDevOrigins: ['192.168.100.78', '192.168.100.78:3000'],
  async redirects() {
    return [
      {
        source: '/tarifs',
        destination: '/pricing',
        permanent: true,
      },
      {
        source: '/specialites',
        destination: '/specialties',
        permanent: true,
      },
      {
        source: '/specialites/:slug',
        destination: '/specialties/:slug',
        permanent: true,
      },
      {
        source: '/planner',
        destination: '/planning?tab=agenda',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    // Plus de rewrites nécessaires : routing natif
    //   /videos/:id       -> pages/videos/[id].tsx
    //   /specialties/:slug-> pages/specialties/[slug].tsx
    //   /checkout/:type   -> pages/checkout/[type].tsx
    //   /checkout/subscription -> pages/checkout/subscription.tsx
    return [];
  },
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify; file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
