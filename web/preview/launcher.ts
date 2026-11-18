import messages from './locales/preview.json';

const language =
  new URLSearchParams(window.location.search).get('lang') === 'en'
    ? 'en'
    : 'de';
const copy = messages[language];

const root = document.getElementById('root');
const start = document.getElementById('start');
const hint = document.querySelector('.launcher-hint');
document.documentElement.lang = language;
document.title = copy.title;
if (start) start.textContent = copy.start;
if (hint) hint.textContent = copy.hint;

// The app (several MB) loads only after a tap, so the start page stays light.
start?.addEventListener(
  'click',
  async () => {
    if (!root) return;
    start.setAttribute('disabled', '');
    start.textContent = copy.loading;
    const { startPreview } = await import('./app');
    root.replaceChildren();
    startPreview(root, language);
  },
  { once: true },
);
