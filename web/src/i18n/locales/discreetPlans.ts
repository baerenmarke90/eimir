/**
 * Discreet plans (#1790 F3): a shared visual shield against onlookers. The
 * lock is the only marker outside the editor; there is no visible label.
 */
export default {
  lockLabel: 'Verdeckt',
  fallbackTitle: 'Unser Plan',
  openHint: 'Zum Anzeigen öffnen',
  editor: {
    label: 'Diskret',
    help: 'Vorschauen bleiben verdeckt, bis ihr tippt. Ihr beide seht weiterhin alles.',
    titleChoice: 'Titel in Listen',
    preview: 'Vorschau-Titel',
    original: 'Originaltitel',
    previewTitle: 'Vorschau-Titel',
    previewPlaceholder: 'Unser Plan',
    suggestionsLabel: 'Vorschläge',
    suggestionsHelp:
      'Vorschläge nur aus Tag, Uhrzeit und Dauer. Titel und Beschreibung werden dafür nicht gelesen.',
    originalHelp:
      'Der Titel bleibt überall sichtbar. Beschreibung, Ort und Fotos bleiben verdeckt, bis ihr tippt.',
  },
  detail: {
    concealedBody:
      'Dieser Plan ist verdeckt. Ihr beide könnt ihn jederzeit ansehen. Verdeckt bleibt er nur für Blicke von außen.',
    reveal: 'Anzeigen',
    conceal: 'Wieder verdecken',
    revealed: 'Plan wird angezeigt.',
    concealed: 'Plan ist wieder verdeckt.',
  },
  suggestions: {
    weekend: 'Wochenende zu zweit',
    overnight: 'Auszeit zu zweit',
    MORNING: 'Gemeinsamer Morgen',
    MIDDAY: 'Mittag zu zweit',
    AFTERNOON: 'Gemeinsamer Nachmittag',
    EVENING: 'Date-Abend',
    weekdayPart: {
      MORNING: '{{weekday}}morgen',
      MIDDAY: '{{weekday}}mittag',
      AFTERNOON: '{{weekday}}nachmittag',
      EVENING: '{{weekday}}abend',
    },
    weekday: '{{weekday}} zu zweit',
    together: 'Zeit für uns',
    day: 'Ein Tag für uns',
    plan: 'Unser Plan',
  },
};
