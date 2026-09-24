const notificationSettings = {
  title: 'Welche Nachrichten du bekommst',
  intro: 'Nur für dich. Dein Partner wählt selbst, was ihn erreicht.',
  sharedActivity: 'Gemeinsame Aktivität',
  closeness: 'Nähe',
  comment: 'Kommentare',
  commentDescription: 'Neue Kommentare werden im Posteingang gesammelt.',
  reminder: 'Fällige Erinnerungen',
  thinking: 'Ich denke an dich',
  kiss: 'Ein Kuss',
  checkIn: 'Check-in',
  inApp: 'In-App',
  push: 'Push',
  email: 'E-Mail',
  destination: 'E-Mails gehen an {{email}}.',
  noAddress: 'Für E-Mails brauchst du eine bestätigte primäre Account-Adresse.',
  changeAddress: 'Account-E-Mail verwalten',
  transportUnavailable:
    'E-Mail-Versand ist auf dieser Installation nicht verfügbar.',
  endpointMissing: 'Auf diesem Gerät ist noch kein Push-Empfang eingerichtet.',
  pushUnavailable: 'Push ist derzeit nicht verfügbar.',
  policyUnavailable: 'Für diesen Ereignistyp derzeit nicht verfügbar.',
  unavailable: 'Dieser Kanal ist derzeit nicht verfügbar.',
  loading: 'Deine Benachrichtigungen werden geladen …',
  empty: 'Für dich sind noch keine Ereignisse verfügbar.',
  saving: '{{event}}: {{channel}} wird gespeichert …',
  saved: '{{event}}: {{channel}} wurde gespeichert.',
  failed:
    'Änderung nicht gespeichert. Deine bisherige Auswahl bleibt erhalten.',
  on: 'An',
  off: 'Aus',
} as const;

export default notificationSettings;
