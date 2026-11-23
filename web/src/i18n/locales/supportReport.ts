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
    failure: 'Fehler-Code: {{reference}}',
    app: 'App-Version und Build',
    device: 'Gerät: System und Browser',
    locale: 'Sprache, Uhrzeit und Zeitzone',
    account: 'Dein Konto, damit wir antworten können',
  },
  never: 'Nie dabei: Inhalte, Fotos, Orte oder Nachrichten.',
  send: 'Senden',
  sending: 'Wird gesendet …',
  sendLater: 'Später senden',
  sendNow: 'Jetzt senden',
  retry: 'Erneut versuchen',
  offline: {
    title: 'Du bist offline.',
    body: 'Dein Text bleibt gespeichert. Wir senden ihn, sobald du wieder online bist.',
  },
  failed:
    'Das hat nicht geklappt. Dein Text ist noch da, versuch es gleich noch einmal.',
  rateLimited:
    'Gerade kamen zu viele Meldungen von dir. Dein Text bleibt gespeichert, versuch es später noch einmal.',
  success: {
    title: 'Danke, angekommen.',
    body: 'Wir lesen jede Meldung. Wenn wir etwas zurückschreiben, bekommst du eine Benachrichtigung.',
    done: 'Fertig',
  },
  reply: {
    title: 'Antwort auf deine Meldung',
    context: 'Zu deiner Meldung',
    loading: 'Antwort wird geladen …',
  },
} as const;

export default supportReport;
