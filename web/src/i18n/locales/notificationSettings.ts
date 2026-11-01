const notificationSettings = {
  title: 'Welche Nachrichten du bekommst',
  sharedActivityDescription: 'Kommentare und fällige Erinnerungen.',
  closenessDescription: 'Gedanken aneinander, Küsse und Check-ins.',
  individual: 'Einzeln anpassen',
  dates: 'Wichtige Tage',
  mixed:
    'Unterschiedlich eingestellt. Unter „Einzeln anpassen“ siehst du die Auswahl.',
  groupSaving: 'Auswahl wird gespeichert …',
  groupSaved: 'Auswahl gespeichert.',
  groupFailed:
    'Nicht alles wurde gespeichert. Bestätigte Änderungen bleiben erhalten. Prüfe die Auswahl und versuche es erneut.',
  intro: 'Nur für dich. Dein Partner wählt selbst, was ihn erreicht.',
  sharedActivity: 'Gemeinsame Aktivität',
  closeness: 'Nähe',
  comment: 'Kommentare',
  commentDescription: 'Neue Kommentare werden im Posteingang gesammelt.',
  commentPushDescription: 'Höchstens ein neutraler Push pro Stunde.',
  commentEmailDescription: 'Höchstens eine neutrale E-Mail pro Stunde.',
  reminder: 'Fällige Erinnerungen',
  experience: 'Geteilte Momente',
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
  deviceTitle: 'Auf diesem Gerät',
  deviceIntro:
    'Hinweise zeigen keine privaten Inhalte. Für die Zustellung bekommt Google oder dein gewählter Push-Dienst eine Installationskennung und Verbindungsdaten.',
  deviceLoading: 'Push-Einrichtung wird geprüft …',
  deviceUnavailable: 'Push ist auf dieser Installation nicht verfügbar.',
  deviceOff: 'Push ist auf diesem Gerät aus.',
  deviceConnecting: 'Verbindung zum Push-Dienst wird hergestellt …',
  deviceDisconnecting: 'Push wird auf diesem Gerät ausgeschaltet …',
  deviceOn: 'Push ist auf diesem Gerät aktiv.',
  deviceError:
    'Die Verbindung konnte nicht eingerichtet werden. Versuche es erneut.',
  deviceNoDistributor:
    'Es ist noch kein Push-Dienst auf diesem Gerät installiert oder ausgewählt.',
  devicePermissionDenied:
    'Benachrichtigungen sind für eimir. auf diesem Gerät nicht erlaubt.',
  deviceOpenSettings: 'Geräteeinstellungen öffnen',
  deviceUnsupported:
    'Dein Push-Dienst wird von dieser eimir.-Installation nicht unterstützt. Die Person, die eure Installation betreut, kann ihn freigeben.',
  deviceStatusUnavailable:
    'Der Push-Status konnte gerade nicht geprüft werden. Versuche es gleich noch einmal.',
  deviceCleanupPending:
    'Auf diesem Gerät ist Push aus. Die alte Verbindung wird beim nächsten Start entfernt.',
  deviceEnable: 'Auf diesem Gerät aktivieren',
  deviceDisable: 'Auf diesem Gerät deaktivieren',
  policyUnavailable: 'Für diesen Ereignistyp derzeit nicht verfügbar.',
  unavailable: 'Dieser Kanal ist derzeit nicht verfügbar.',
  loading: 'Deine Benachrichtigungen werden geladen …',
  empty: 'Für dich sind noch keine Ereignisse verfügbar.',
  saving: '{{event}}: {{channel}} wird gespeichert …',
  saved: '{{event}}: {{channel}} wurde gespeichert.',
  failed:
    'Änderung nicht gespeichert. Deine bisherige Auswahl bleibt erhalten.',
  quietHoursTitle: 'Ruhezeiten',
  quietHoursIntro:
    'Push- und E-Mail-Nachrichten für Partnergesten warten bis danach. Deine In-App-Auswahl bleibt unverändert; fällige Erinnerungen folgen ihrer gewählten Uhrzeit.',
  quietHoursTimezone: 'Es gilt deine Account-Zeitzone: {{timeZone}}.',
  quietHoursEnable: 'Ruhezeit aktivieren',
  quietHoursStart: 'Von',
  quietHoursEnd: 'Bis',
  quietHoursInvalid: 'Wähle zwei unterschiedliche Uhrzeiten.',
  quietHoursSave: 'Ruhezeit speichern',
  quietHoursSaving: 'Ruhezeit wird gespeichert …',
  quietHoursSaved: 'Ruhezeit gespeichert.',
  quietHoursUnsaved: 'Noch nicht gespeichert.',
  quietHoursActive: 'Täglich {{start}}–{{end}} Uhr.',
  quietHoursOff: 'Ruhezeit ist aus.',
  quietHoursFailed:
    'Ruhezeit nicht gespeichert. Deine Eingabe bleibt erhalten; versuche es erneut.',
  on: 'An',
  off: 'Aus',
} as const;

export default notificationSettings;
