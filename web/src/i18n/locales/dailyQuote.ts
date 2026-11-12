const dailyQuote = {
  quoteText: '„{{text}}“',
  originalLanguage: 'Original auf {{language}}',
  catalog: {
    categories: {
      love: 'Liebe & Beziehung',
      life: 'Leben & Weisheit',
      philosophy: 'Philosophie',
      mindfulness: 'Achtsamkeit',
      serenity: 'Gelassenheit',
      motivation: 'Mut & Motivation',
    },
    sources: {
      classic_literature: {
        name: 'Klassische Literatur',
        description: 'Werke der klassischen Weltliteratur (gemeinfrei).',
      },
      stoic_philosophy: {
        name: 'Antike Philosophie',
        description:
          'Schriften der antiken und stoischen Philosophie (gemeinfrei).',
      },
      poetic_wisdom: {
        name: 'Poesie & Lebensweisheiten',
        description:
          'Gemeinfreie Aphorismen, poetische Gedanken und traditionelle Sprichwörter.',
      },
    },
  },
  kicker: 'Euer Impuls',
  title: 'Spruch des Tages',
  pro: 'Pro',
  loading: 'Dein Spruch für heute wird geladen …',
  discovery: 'Ein kleiner täglicher Impuls, der zu dir passt.',
  discoveryMeta: 'Mit eimir. Pro verfügbar.',
  empty: 'Heute ist kein Spruch verfügbar.',
  emptyMeta: 'Morgen gibt es wieder einen neuen Spruch.',
  unavailable: 'Der Spruch des Tages ist gerade nicht verfügbar.',
  unavailableOffline:
    'Offline – dein Spruch des Tages wird nach dem Verbinden wieder angezeigt.',
  retry: 'Erneut versuchen',
  settingsAria: 'Deine Einstellungen für den Spruch des Tages öffnen',
  settingsTitle: 'Spruch des Tages',
  selectionAction: 'Rubriken und Quellen',
  settingsIntro:
    'Blende deinen Spruch des Tages auf „Wir“ ein oder aus. Rubriken und Quellen bleiben gespeichert.',
  settingsLoading: 'Deine Einstellung für den Spruch des Tages wird geladen …',
  settingsSaved: 'Gespeichert.',
  enabledLabel: 'Spruch des Tages anzeigen',
  enabledDescription:
    'Wenn du es ausschaltest, verschwindet die Karte auf „Wir“. Deine Auswahl bleibt gespeichert.',
  enabledSettingsDescription:
    'Gilt nur für dich. Dein Partner hat seine eigene Einstellung; Rubriken und Quellen bleiben gespeichert.',
  sheetTitle: 'Dein Spruch des Tages',
  close: 'Einstellungen für den Spruch des Tages schließen',
  privacy: 'Nur für dich – {{name, firstName}} sieht deine Auswahl nicht.',
  privacyResolved: 'Nur für dich – {{name}} sieht deine Auswahl nicht.',
  privacyFallback: 'Nur für dich – deine Auswahl bleibt persönlich.',
  categories: 'Rubriken',
  sources: 'Quellen',
  footnote:
    'Die Texte stammen aus gemeinfreien Werken und historischen Sprichwortsammlungen.',
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
