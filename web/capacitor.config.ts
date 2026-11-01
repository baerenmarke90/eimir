import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.eimir.app',
  appName: 'eimir.',
  webDir: 'dist',
  appendUserAgent: 'eimir/1.0 (+https://github.com/baerenmarke90/eimir)',
  android: {
    path: '../android',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SystemBars: {
      insetsHandling: 'css',
    },
  },
};

export default config;
