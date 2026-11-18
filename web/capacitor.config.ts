import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.eimir.app',
  appName: 'eimir.',
  webDir: 'dist',
  appendUserAgent: 'eimir/1.0 (+https://github.com/baerenmarke90/eimir)',
  android: {
    path: '../android',
    // The product's Chromium floor, the same as the Vite build target (#1613).
    // Below it Capacitor loads `server.errorPath` instead of the app.
    minWebViewVersion: 111,
  },
  ios: {
    path: '../ios',
    handleApplicationNotifications: false,
  },
  server: {
    androidScheme: 'https',
    // Static ES5 notice (#1931): an update request below the WebView floor,
    // otherwise a retry for a failed main-frame load, which Capacitor also
    // routes here.
    errorPath: 'webview-unsupported.html',
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
