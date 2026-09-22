const dailyQuote = {
  kicker: 'Euer Impuls',
  title: 'Zitat des Tages',
  pro: 'Pro',
  loading: 'Dein Zitat für heute wird geladen …',
  discovery: 'Ein kleiner täglicher Impuls, der zu dir passt.',
  discoveryMeta: 'Mit eimir. Pro verfügbar.',
  empty: 'Heute ist kein Zitat verfügbar.',
  emptyMeta: 'Morgen gibt es wieder einen neuen Impuls.',
  unavailable: 'Das Zitat des Tages ist gerade nicht verfügbar.',
  unavailableOffline:
    'Offline – dein Zitat des Tages wird nach dem Verbinden wieder angezeigt.',
  retry: 'Erneut versuchen',
  settingsAria: 'Deine Einstellungen für das Zitat des Tages öffnen',
  settingsTitle: 'Zitat des Tages',
  settingsIntro:
    'Blende deinen persönlichen täglichen Impuls auf „Wir“ ein oder aus. Rubriken und Quellen bleiben gespeichert.',
  settingsLoading: 'Deine Zitat-Einstellung wird geladen …',
  settingsSaved: 'Gespeichert.',
  enabledLabel: 'Zitat des Tages anzeigen',
  enabledDescription:
    'Wenn du es ausschaltest, verschwindet die Karte auf „Wir“. Deine Auswahl bleibt gespeichert.',
  enabledSettingsDescription:
    'Gilt nur für dich. Dein Partner hat seine eigene Einstellung; Rubriken und Quellen bleiben gespeichert.',
  sheetTitle: 'Dein Zitat des Tages',
  close: 'Zitat-Einstellungen schließen',
  privacy: 'Nur für dich – {{name, firstName}} sieht deine Auswahl nicht.',
  privacyFallback: 'Nur für dich – deine Auswahl bleibt persönlich.',
  categories: 'Rubriken',
  sources: 'Quellen',
  footnote: 'Alle Zitate stammen aus geprüften, gemeinfreien Sammlungen.',
  done: 'Fertig',
  cancel: 'Abbrechen',
  saving: 'Wird gespeichert …',
  preferencesLoading: 'Deine Auswahl wird geladen …',
  preferencesUnavailable: 'Deine Auswahl ist gerade nicht verfügbar.',
  preferencesOffline:
    'Offline – deine Auswahl wird nach dem Verbinden wieder verfügbar.',
  saveError: 'Deine Auswahl konnte nicht gespeichert werden.',
  conflict: 'Deine Auswahl wurde inzwischen auf einem anderen Gerät geändert.',
  reload: 'Aktuelle Auswahl laden',
  quoteAttribution: '— {{author}}, {{source}}',
  quoteAttributionAuthorOnly: '— {{author}}',
} as const;

export default dailyQuote;
