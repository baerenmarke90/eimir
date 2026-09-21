const dailyEnergy = {
  question: 'Wie voll ist dein Akku heute?',
  voluntary: 'Freiwillig und nur für heute.',
  selectLegend: 'Akku für heute auswählen',
  changeLegend: 'Akku für heute ändern',
  ownLabel: 'Dein Akku heute',
  badgePrompt: 'Akku',
  badgeAriaEmpty: 'Akku für heute setzen',
  badgeAriaValue: 'Dein Akku heute: {{value}} Prozent. Wert ändern',
  popoverTitle: 'Akku heute',
  scaleLow: 'Ganz wenig',
  scaleHigh: 'Voll dabei',
  notSet: 'Noch nicht gesetzt',
  change: 'Ändern',
  remove: 'Entfernen',
  saving: 'Wird gespeichert …',
  percentage: '{{value}} %',
  optionAria: '{{value}} Prozent',
  partnerStateAria: 'Akku-Check-in deines Partners',
  partnerLabel: 'Akku von {{name}} heute',
  partnerFallback: 'Partner-Akku heute',
  noCheckIn: 'Heute noch kein Check-in',
  hiddenTitle: 'Partner-Akku noch verborgen',
  hiddenBody: 'Nach deinem Check-in wird der heutige Wert sichtbar.',
  loading: 'Akku-Check-in wird geladen …',
  unavailable: 'Der heutige Akku-Check-in ist gerade nicht verfügbar.',
  unavailableOffline:
    'Offline – der heutige Akku-Stand wird erst nach dem Verbinden wieder angezeigt.',
  contextUnavailable:
    'Der heutige Check-in ist gerade nicht verfügbar. Bitte versuche es später erneut.',
  saveError: 'Dein Akku-Stand konnte nicht gespeichert werden.',
} as const;

export default dailyEnergy;
