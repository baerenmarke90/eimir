import { renderToStaticMarkup } from 'react-dom/server';
import { Snackbar } from './Snackbar';

describe('Snackbar', () => {
  it('renders nothing until a confirmation is posted', () => {
    // The window-event-reactive half (postSnackbar -> visible message) is
    // not covered here: this suite renders via renderToStaticMarkup, which
    // never runs effects, the same reason AppShell's own online/cache-event
    // hooks (useOnlineStatus, useCachedReadTimestamp) are not exercised by
    // AppShell.test.tsx either. That would need a browser DOM test
    // environment this project does not currently depend on.
    expect(renderToStaticMarkup(<Snackbar />)).toBe('');
  });
});
