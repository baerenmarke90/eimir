const supportReport = {
  action: 'Problem melden',
  entry: {
    title: 'Hilfe & Feedback',
    subtitle: 'Problem melden oder uns etwas sagen',
  },
  title: {
    PROBLEM: 'Problem melden',
    FEEDBACK: 'Hilfe & Feedback',
  },
  kindLabel: 'Worum geht es?',
  kinds: {
    PROBLEM: 'Etwas funktioniert nicht',
    FEEDBACK: 'Feedback / Idee',
  },
  noteLabel: {
    PROBLEM: 'Was ist passiert? (optional)',
    FEEDBACK: 'Was wünschst du dir? Was stört dich?',
  },
  counter: '{{length}} / {{max}}',
  counterLabel: '{{length}} von {{max}} Zeichen',
  noteRequired: 'Schreib ein paar Worte, dann kannst du senden.',
  noteTooLong:
    'Das sind mehr als {{max}} Zeichen. Kürze den Text bitte ein wenig.',
  sentHeading: 'Das senden wir mit',
  items: {
    /**
     * Shown on its own line above the short error code. The sent reference
     * also names the affected feature (its route template), never contents.
     */
    failureLabel: 'Fehler-Code und betroffene Funktion',
    app: 'App-Version und Build',
    device:
      'Gerät und Anzeige: System, Browser, App oder Web, Design (hell/dunkel), Online-Status',
    locale: 'Sprache, Uhrzeit und Zeitzone',
    account: 'Dein Konto, damit wir antworten können',
  },
  never: 'Nie dabei: Inhalte, Fotos, Orte oder Nachrichten.',
  feedbackNoCode: 'Bei Feedback hängen wir keinen Fehler-Code an.',
  send: 'Senden',
  sending: 'Wird gesendet …',
  sendLater: 'Später senden',
  sendNow: 'Jetzt senden',
  offline: {
    title: 'Du bist offline.',
    body: 'Dein Text bleibt gespeichert. Sende ihn, sobald du wieder online bist.',
  },
  failed:
    'Das hat nicht geklappt. Dein Text ist noch da, versuch es gleich noch einmal.',
  rateLimited:
    'Gerade kamen zu viele Meldungen von dir. Dein Text bleibt gespeichert, versuch es später noch einmal.',
  success: {
    title: 'Danke, angekommen.',
    body: 'Wir lesen jede Meldung. Wenn wir etwas zurückschreiben, bekommst du eine Benachrichtigung.',
  },
  reply: {
    title: 'Antwort auf deine Meldung',
    context: 'Zu deiner Meldung',
    contextDated: 'Deine Meldung vom {{date}}',
  },
} as const;

export default supportReport;
