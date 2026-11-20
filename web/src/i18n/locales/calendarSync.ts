export default {
  settingsTitle: 'Kalender verbinden',
  settingsIntro:
    'Verbinde einen Kalender, damit eure gemeinsamen Pläne dort automatisch erscheinen.',
  sharedHeading: 'Gemeinsamer Kalender',
  pro: 'Pro',
  sharedIntro:
    'Wählt einen Kalender, den ihr beide schon nutzt. Neue und geänderte Pläne erscheinen dort automatisch – einmal, für euch beide.',
  handoffStaysFree:
    '„In eigenen Kalender übernehmen“ bei einzelnen Plänen bleibt kostenlos.',
  proRequired:
    'Die automatische Synchronisation gehört zu eimir. Pro und gilt für euch beide.',
  unavailable:
    'Die Kalender-Synchronisation ist auf diesem eimir. nicht eingerichtet.',
  loadFailed: 'Die Kalendereinstellungen konnten nicht geladen werden.',
  providers: {
    CALDAV: 'CalDAV',
    CALDAV_hint:
      'Für kompatible Kalender wie Nextcloud, SOGo, Radicale oder Baïkal',
    GOOGLE: 'Google Kalender',
    GOOGLE_hint: 'Sichere Anmeldung direkt bei Google',
  },
  caldav: {
    sheetTitle: 'CalDAV verbinden',
    privateConnection:
      'Die Zugangsdaten gehören nur zu deinem Konto. Dein Partner sieht sie nie.',
    address: 'Serveradresse',
    addressHint:
      'Die Adresse deines Kalenderservers oder direkt die Adresse eines Kalenders, beginnend mit https://.',
    username: 'Benutzername',
    password: 'Passwort oder App-Passwort',
    passwordHint:
      'Ein eigenes App-Passwort ist sicherer und lässt sich jederzeit widerrufen.',
    consent: 'Diesen Kalenderzugang mit meinem eimir.-Konto verbinden',
    check: 'Verbindung prüfen',
    checking: 'Verbindung wird geprüft …',
  },
  choose: {
    title: 'Welcher Kalender soll es sein?',
    readOnly: 'nur lesbar',
    otherConnection: 'Andere Verbindung',
    connect_CALDAV: 'CalDAV verbinden',
    connect_GOOGLE: 'Google Kalender verbinden',
    confirm: 'Als gemeinsamen Kalender verwenden',
    saving: 'Wird eingerichtet …',
  },
  google: {
    confirmTitle: 'Ist das dein Google-Konto?',
    confirmBody:
      '{{label}} – eimir. schreibt eure gemeinsamen Pläne in einen Kalender dieses Kontos, den du gleich auswählst.',
    confirm: 'Bestätigen',
    cancel: 'Abbrechen',
    return: {
      denied:
        'Die Verbindung mit Google wurde abgebrochen. Du kannst es jederzeit erneut versuchen.',
      failed:
        'Die Verbindung mit Google hat nicht geklappt. Versuche es bitte erneut.',
    },
    waiting:
      'Melde dich bei Google an und erlaube den Zugriff. Danach geht es hier weiter.',
  },
  connected: {
    title: 'Kalender verbunden',
  },
  target: {
    via: '{{provider}} · verbunden von {{name}}',
    viaYou: '{{provider}} · von dir verbunden',
    synced_one: '{{count}} Plan steht in eurem Kalender.',
    synced_other: '{{count}} Pläne stehen in eurem Kalender.',
    kept_one:
      '{{count}} Termin blieb im Kalender stehen, weil er dort geändert wurde.',
    kept_other:
      '{{count}} Termine blieben im Kalender stehen, weil sie dort geändert wurden.',
    primaryCalendar: 'Hauptkalender',
    explain:
      'Neue und geänderte Pläne erscheinen hier automatisch – einmal, für euch beide.',
  },
  status: {
    synced: 'Synchronisiert',
    ready: 'Bereit · noch keine Pläne übertragen',
    syncedAt: 'Synchronisiert · {{time}}',
    running: 'Synchronisierung läuft',
    broken: 'Verbindung unterbrochen',
    attention: 'Aufmerksamkeit erforderlich',
    paused: 'Pausiert',
    proPaused: 'Pausiert, bis ihr wieder eimir. Pro habt',
    calendarGone:
      'Der Kalender ist nicht mehr erreichbar oder nicht mehr beschreibbar.',
    brokenHint:
      'Die Zugangsdaten werden nicht mehr akzeptiert. Verbinde den Kalender neu.',
    brokenPartner:
      'Die Verbindung muss von {{name}} erneuert werden. Ihr könnt die Synchronisation jederzeit beenden.',
  },
  conflict: {
    EVENT_CHANGED:
      '„{{title}}“ wurde im Kalender geändert. eimir. überschreibt das nicht ungefragt.',
    EVENT_MISSING:
      '„{{title}}“ wurde im Kalender gelöscht. eimir. legt den Termin nicht ungefragt neu an.',
    unknownPlan: 'Ein Plan',
    overwrite: 'Mit eimir. abgleichen',
    detach: 'Nicht mehr synchronisieren',
  },
  actions: {
    syncNow: 'Jetzt synchronisieren',
    pause: 'Pausieren',
    resume: 'Fortsetzen',
    end: 'Synchronisation beenden',
    endConfirm:
      'Die Synchronisation endet für euch beide. Bereits übertragene Termine bleiben im Kalender.',
    endConfirmAction: 'Beenden',
    keepSyncing: 'Weiter synchronisieren',
    moreOptions: 'Weitere Optionen',
    disconnectProvider: '{{provider}}-Zugang entfernen',
    eventsStay: 'Bereits übertragene Termine bleiben im Kalender.',
    reconnect: 'Neu verbinden',
    changeCalendar: 'Anderen Kalender wählen',
    connectAnother: 'Anderen Kalender verbinden',
  },
  errors: {
    CALENDAR_AUTH_FAILED:
      'Benutzername oder Passwort stimmen nicht. Prüfe sie oder erstelle ein neues App-Passwort.',
    CALENDAR_NOT_FOUND:
      'Unter dieser Adresse wurde kein Kalender gefunden. Versuche die vollständige Kalenderadresse.',
    CALENDAR_NOT_WRITABLE: 'In diesen Kalender darf eimir. nicht schreiben.',
    CALENDAR_ADDRESS_INVALID:
      'Bitte gib eine vollständige Adresse ein, die mit https:// beginnt.',
    CALENDAR_TARGET_BLOCKED:
      'Diese Adresse ist aus Sicherheitsgründen nicht erreichbar.',
    CALENDAR_TLS_INVALID:
      'Die Verbindung ist nicht sicher: Das Zertifikat des Servers wird nicht anerkannt.',
    CALENDAR_UNREACHABLE:
      'Der Kalenderserver ist gerade nicht erreichbar. Versuche es später erneut.',
    CALENDAR_TIMEOUT:
      'Der Kalenderserver hat zu lange gebraucht. Versuche es später erneut.',
    CALENDAR_RATE_LIMITED:
      'Der Kalenderdienst bittet um eine kurze Pause. Versuche es gleich noch einmal.',
    CALENDAR_TARGET_CHANGED:
      'Die Einstellungen wurden gerade geändert. Wir haben den aktuellen Stand geladen.',
    CALENDAR_CONNECTION_LIMIT:
      'Du hast schon mehrere Kalender verbunden. Entferne zuerst einen davon.',
    CALENDAR_GOOGLE_UNAVAILABLE:
      'Google Kalender ist auf diesem eimir. gerade nicht eingerichtet.',
    CALENDAR_GOOGLE_EXPIRED:
      'Die Anmeldung bei Google ist abgelaufen. Bitte verbinde Google Kalender erneut.',
    fallback: 'Das hat nicht geklappt. Versuche es erneut.',
  },
  plan: {
    SYNCED: 'Steht in eurem gemeinsamen Kalender',
    PENDING: 'Wird in euren Kalender übertragen',
    FAILED: 'Konnte nicht übertragen werden',
    CONFLICT: 'Im Kalender geändert',
    DETACHED: 'Wird nicht mehr synchronisiert',
    KEPT: 'Im Kalender behalten',
    paused: 'Kalender-Synchronisation pausiert',
    review: 'Ansehen',
  },
};
