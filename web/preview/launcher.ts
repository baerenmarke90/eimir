const COPY = {
  de: {
    start: 'Vorschau starten',
    loading: 'Wird geladen …',
    hint: 'Wir, Momente und Eure Geschichte mit Beispieldaten. Nichts wird gespeichert.',
  },
  en: {
    start: 'Start preview',
    loading: 'Loading …',
    hint: 'Us, Moments and Our story with sample data. Nothing is saved.',
  },
};
const language =
  new URLSearchParams(window.location.search).get('lang') === 'en'
    ? 'en'
    : 'de';
const copy = COPY[language];

const root = document.getElementById('root');
const start = document.getElementById('start');
const hint = document.querySelector('.launcher-hint');
document.documentElement.lang = language;
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
