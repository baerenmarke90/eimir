import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type {
  AppUpdatesAdapter,
  AppUpdateState,
} from '../../src/client/appUpdates';
import { AppShell } from '../../src/components/AppShell';
import { SettingsPage } from '../../src/components/SettingsPage';
import { initializeTheme, storeThemePreference } from '../../src/theme';
import fixtureCopy from './locales/de';
import '../../src/i18n';
import '../../src/styles.css';
import '../../src/theme.css';
import '../../src/design/product-roles.css';
import '../../src/shell.css';
import '../../src/layout.css';
import '../../src/design/identity-roles.css';
import '../../src/design/identity-components.css';
import '../../src/components/MoreOverviewPage.css';
import '../../src/components/ProfilePage.css';

// Synthetic native transport only. Real SettingsPage/AppShell render unchanged.
const parameters = new URLSearchParams(window.location.search);
storeThemePreference(parameters.get('theme') === 'dark' ? 'dark' : 'light');
initializeTheme();
const listeners = new Set<(next: AppUpdateState) => void>();
let state: AppUpdateState = {
  revision: 1,
  phase: parameters.has('error') ? 'error' : 'idle',
  errorCode: parameters.has('error') ? 'NETWORK' : null,
  busy: false,
  versionName: '0.2.0-test.1',
  versionCode: 1,
  sourceRevision: 'a'.repeat(40),
  progress: 0,
};
const calls: string[] = [];
let finishDownload: ((value: AppUpdateState) => void) | undefined;
function emit(patch: Partial<AppUpdateState>) {
  state = { ...state, ...patch, revision: state.revision + 1 };
  for (const listener of listeners) listener(state);
  return state;
}
const adapter: AppUpdatesAdapter = {
  getState: async () => state,
  addListener: async (_event, listener) => {
    listeners.add(listener);
    return {
      remove: async () => {
        listeners.delete(listener);
      },
    };
  },
  checkIfDue: async () => state,
  check: async () => {
    calls.push('check');
    return emit({
      phase: 'available',
      busy: false,
      errorCode: null,
      available: {
        versionName: '0.2.0-test.2',
        versionCode: 2,
        releaseNotes: parameters.has('long')
          ? fixtureCopy.appUpdates.longNotes.repeat(40)
          : fixtureCopy.appUpdates.notes,
      },
    });
  },
  download: () => {
    calls.push('download');
    emit({ phase: 'downloading', busy: true, progress: 42 });
    return new Promise((resolve) => {
      finishDownload = resolve;
    });
  },
  cancel: async () => {
    calls.push('cancel');
    const result = emit({ phase: 'cancelled', busy: false });
    finishDownload?.(result);
    finishDownload = undefined;
    return result;
  },
  install: async () => {
    calls.push('install');
    return emit({
      phase:
        state.phase === 'permissionRequired'
          ? 'installerOpened'
          : 'permissionRequired',
      busy: false,
    });
  },
};
Object.assign(window, {
  updatesFixture: {
    calls,
    finish: () => {
      const next = emit({ phase: 'ready', busy: false, progress: 100 });
      finishDownload?.(next);
      finishDownload = undefined;
    },
  },
});
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
const props = {
  apiBaseUrl: 'https://api.eimir-fixture.test',
  accessToken: 'synthetic-ui-proof-token',
  account: { id: '00000000-0000-4000-8000-000000000001', displayName: 'Lea' },
  spaceId: '00000000-0000-4000-8000-000000000010',
};
const root = document.getElementById('root');
if (!root) throw new Error('Missing updater fixture root');
createRoot(root).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/more/settings']}>
      <QueryClientProvider client={queryClient}>
        <AppShell {...props} onLogout={() => undefined}>
          <Routes>
            <Route
              path="/more/settings"
              element={<SettingsPage {...props} updatesAdapter={adapter} />}
            />
            <Route
              path="/more/settings/:settingsCategory"
              element={<SettingsPage {...props} updatesAdapter={adapter} />}
            />
          </Routes>
        </AppShell>
      </QueryClientProvider>
    </MemoryRouter>
  </StrictMode>,
);
