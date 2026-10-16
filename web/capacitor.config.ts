import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.sidebyside.app',
  appName: 'eimir.',
  webDir: 'dist',
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
