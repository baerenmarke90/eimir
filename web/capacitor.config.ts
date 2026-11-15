import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.eimir.app',
  appName: 'eimir.',
  webDir: 'dist',
  appendUserAgent: 'eimir/1.0 (+https://github.com/baerenmarke90/eimir)',
  android: {
    path: '../android',
    // The product's Chromium floor, the same as the Vite build target (#1613).
    // Below it Capacitor logs "System WebView is not supported"; no in-app
    // notice is configured (`server.errorPath` is unset).
    minWebViewVersion: 111,
  },
  ios: {
    path: '../ios',
    handleApplicationNotifications: false,
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
