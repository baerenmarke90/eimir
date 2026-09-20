const de = {
  common: {
    cancel: 'Abbrechen',
    retry: 'Erneut versuchen',
    refresh: 'Aktualisieren',
    refreshing: 'Aktualisiert …',
    backToStart: 'Zur Startseite',
    edit: 'Bearbeiten',
    saving: 'Wird gespeichert …',
  },
  navigation: {
    skipToContent: 'Zum Inhalt springen',
    primary: 'Hauptnavigation',
    story: 'Momente',
    newMemory: 'Neue Erinnerung',
  },
  more: {
    eyebrow: 'Mehr',
    title: 'Alles Weitere',
    intro:
      'Dein Profil, persönliche Bereiche, gemeinsame Organisation und die Einstellungen von eimir. an einem verlässlichen Ort.',
    groups: {
      personal: 'Für dich',
      shared: 'Gemeinsam organisieren',
      utility: 'App und Konto',
    },
    people: {
      title: 'Menschen',
      description:
        'Personen, die euch wichtig sind, mit Geburtstagen und Jahrestagen.',
    },
    places: {
      title: 'Orte',
      description: 'Eure liebsten Orte, Cafés und Reiseziele auf einen Blick.',
    },
    collections: {
      title: 'Gemeinsame Listen',
      description: 'Packlisten, Ideen und Sammlungen für euch beide.',
    },
    private: {
      title: 'Nur für mich',
      description:
        'Notizen, Geschenkideen und Gedanken, die ausschließlich für dich bestimmt sind.',
    },
    notifications: {
      title: 'Benachrichtigungen',
      description: 'Was es seit deinem letzten Besuch Neues für dich gibt.',
    },
    activity: {
      description:
        'Gemeinsame Änderungen und Aktionen in zeitlicher Reihenfolge.',
    },
    profile: {
      title: 'Profil',
      description: 'Dein Profilbild, Anzeigename und persönliche Vorlieben.',
    },
    settings: {
      title: 'Einstellungen',
      description: 'Darstellung, Verbindung, Privatsphäre und Datenexport.',
    },
  },
  states: {
    loading: {
      title: 'Wird geladen …',
    },
    validation: {
      title: 'Einige Angaben passen noch nicht.',
      body: 'Bitte prüfe deine Eingaben und versuche es erneut.',
    },
    session: {
      title: 'Deine Sitzung ist nicht mehr gültig.',
      body: 'Bitte melde dich erneut an.',
    },
    permission: {
      title: 'Dieser Inhalt ist nicht verfügbar.',
      body: 'Du kannst diesen Inhalt mit deinem aktuellen Zugriff nicht öffnen.',
    },
    conflict: {
      title: 'Die Daten haben sich inzwischen geändert.',
      body: 'Lade den aktuellen Stand neu und wiederhole deine Änderung.',
    },
    rateLimit: {
      title: 'Das waren zu viele Anfragen in kurzer Zeit.',
      body: 'Warte einen Moment und versuche es dann erneut.',
    },
    offline: {
      title: 'Du bist gerade offline.',
      body: 'Stelle die Verbindung wieder her und versuche es erneut.',
      banner:
        'Offline – Änderungen und neue Inhalte benötigen eine Verbindung.',
    },
    server: {
      title: 'eimir. ist gerade nicht erreichbar.',
      body: 'Versuche es in einem Moment erneut.',
    },
    unknown: {
      title: 'Etwas ist schiefgegangen.',
      body: 'Bitte versuche es erneut.',
    },
    unexpected: {
      title: 'Diese Ansicht konnte nicht angezeigt werden.',
      body: 'Öffne die Ansicht erneut. Deine gespeicherten Inhalte bleiben unverändert.',
    },
  },
  theme: {
    label: 'Darstellung',
    system: 'System',
    light: 'Hell',
    dark: 'Dunkel',
  },
  brand: {
    homeAria: 'eimir. – zum gemeinsamen Ort',
  },
  spaceContext: {
    eyebrow: 'Gemeinsamer Bereich',
    loading: 'Euer gemeinsamer Bereich wird geladen …',
    emptyTitle: 'Noch kein gemeinsamer Bereich',
    emptyBody:
      'Für dieses Konto ist noch kein aktiver gemeinsamer Bereich verbunden. Nimm eine Einladung an oder richte euren gemeinsamen Bereich ein.',
    pickerTitle: 'Welchen Bereich möchtest du öffnen?',
    pickerBody:
      'Wähle den gemeinsamen Bereich, mit dem du fortfahren möchtest.',
    pickerAria: 'Gemeinsamen Bereich auswählen',
    spaceFallback: 'Gemeinsamer Bereich {{index}}',
    createFirstSpaceEyebrow: 'Euer gemeinsamer Ort',
    createFirstSpaceTitle: 'Euren gemeinsamen Ort erstellen',
    createFirstSpaceBody:
      'Hier beginnt eure gemeinsame Geschichte. Erstellt euren privaten Raum für Erinnerungen, Momente und Pläne – privat und nur für euch beide.',
    createFirstSpaceSubmit: 'Gemeinsamen Ort erstellen',
    createFirstSpacePending: 'Gemeinsamer Ort wird erstellt …',
  },
  identity: {
    entryAria: 'Zugang zu eimir.',
    invitationEyebrow: 'Einladung zu eimir.',
    invitationTitle:
      'Dein Partner hat einen gemeinsamen Ort für euch vorbereitet.',
    invitationBody:
      'Erstelle dein Profil, um gemeinsam Erinnerungen, Meilensteine und Wünsche für die Zukunft festzuhalten. Privat und nur für euch.',
    invitationExistingAccountBody:
      'Melde dich mit deinem bestehenden Konto an, um diese Einladung anzunehmen.',
    createAccount: 'Neues Konto erstellen',
    registrationCheckingTitle: 'Registrierung wird geprüft',
    registrationCheckingBody:
      'Die Anmeldung mit einem bestehenden Konto bleibt verfügbar. Ob ein neues Konto erstellt werden kann, wird gerade geprüft.',
    registrationDisabledTitle: 'Neue Konten sind deaktiviert',
    registrationDisabledBody:
      'Der ServerAdmin hat neue Registrierungen deaktiviert. Bestehende Konten können sich weiterhin anmelden.',
    maintenanceTitle: 'Wartungsmodus ist aktiv',
    maintenanceBody:
      'Während der Wartung werden keine neuen Konten erstellt. Bestehende Konten und der ServerAdmin-Zugang bleiben erreichbar.',
    registrationStatusUnavailableTitle: 'Registrierungsstatus nicht erreichbar',
    registrationStatusUnavailableBody:
      'Der Serverstatus konnte nicht geprüft werden. Deshalb wird keine neue Registrierung angeboten; die Anmeldung mit einem bestehenden Konto kann weiterhin versucht werden.',
    registrationUnavailable:
      'Ein neues Konto kann derzeit nicht erstellt werden. Bitte nutze ein bestehendes Konto oder versuche es später erneut.',
    registerTitle: 'Dein Konto erstellen',
    registerBody:
      'Dein neues Konto wird direkt mit dem eingeladenen gemeinsamen Bereich verbunden.',
    displayName: 'Anzeigename',
    registerSubmit: 'Konto erstellen und beitreten',
    registerPending: 'Konto wird erstellt …',
    haveAccount: 'Ich habe bereits ein Konto',
    invitationMissing: 'Diese Einladung ist nicht mehr verfügbar.',
    forgotPassword: 'Passwort vergessen?',
    newPassword: 'Neues Passwort',
    passwordConfirmation: 'Passwort wiederholen',
    passwordMismatch: 'Die beiden Passwörter stimmen nicht überein.',
    recoveryEyebrow: 'Kontozugang wiederherstellen',
    recoveryTitle: 'Neues Passwort festlegen',
    recoveryBody:
      'Lege ein neues Passwort fest. Aus Sicherheitsgründen werden deine bisherigen Sitzungen beendet.',
    recoverySave: 'Passwort speichern und anmelden',
    recoverySaving: 'Passwort wird gespeichert …',
    recoveryMissing: 'Dieser Wiederherstellungslink ist nicht mehr verfügbar.',
    recoveryRequestEyebrow: 'Kontozugang wiederherstellen',
    recoveryRequestTitle: 'Passwort zurücksetzen',
    recoveryRequestBody:
      'Gib deine E-Mail-Adresse ein. Wenn dafür ein lokales eimir.-Konto existiert, erhältst du einen zeitlich begrenzten Link.',
    recoveryRequestSubmit: 'Wiederherstellungslink anfordern',
    recoveryRequestPending: 'Anfrage wird gesendet …',
    mailRequestedTitle: 'Prüfe dein Postfach',
    mailRequestedBody:
      'Wenn die Adresse für diesen Zugang verwendet werden kann, wurde ein zeitlich begrenzter Link gesendet.',
    backToSignIn: 'Zur Anmeldung',
    useMagicLink: 'Anmeldelink per E-Mail',
    magicLinkEyebrow: 'Anmelden ohne Passwort',
    magicLinkTitle: 'Anmeldelink anfordern',
    magicLinkBody:
      'Wir senden dir einen einmal verwendbaren, zeitlich begrenzten Link, sofern die Adresse für diese Anmeldeart verwendet werden kann.',
    magicLinkRequestSubmit: 'Anmeldelink anfordern',
    magicLinkRequestPending: 'Anfrage wird gesendet …',
    magicLinkOpening: 'Anmeldelink wird geprüft …',
    magicLinkFailedTitle: 'Dieser Anmeldelink funktioniert nicht mehr.',
    magicLinkFailedBody:
      'Fordere bei Bedarf einen neuen Anmeldelink an oder melde dich mit deinem Passwort an.',
    startTogether: 'Gemeinsam starten',
    startTogetherEyebrow: 'Neu bei eimir.',
    startTogetherTitle: 'Gemeinsam starten',
    startTogetherBody:
      'Erstellt euer privates Zuhause für Erinnerungen, Wünsche und Momente. Nur für euch zwei.',
    startTogetherSubmit: 'Gemeinsam starten',
    startTogetherPending: 'Anfrage wird gesendet …',
    alreadyRegistered: 'Bereits registriert? Anmelden',
    signupOpening: 'Registrierung wird bestätigt …',
    signupFailedTitle: 'Dieser Registrierungslink funktioniert nicht mehr.',
    signupFailedBody:
      'Der Registrierungslink ist möglicherweise abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Link an.',
    entryModesAria: 'Zugangsart wählen',
    verificationOpening: 'E-Mail-Adresse wird bestätigt …',
    verificationCompleteTitle: 'E-Mail-Adresse bestätigt',
    verificationCompleteBody: 'Deine E-Mail-Adresse ist jetzt bestätigt.',
    verificationFailedTitle:
      'Die E-Mail-Adresse konnte nicht bestätigt werden.',
    verificationFailedBody:
      'Der Bestätigungslink ist möglicherweise abgelaufen oder wurde bereits verwendet.',
  },
  login: {
    introHeading: 'Euer Ort für das, was euch verbindet.',
    introBody:
      'Erinnerungen, Wünsche und Pläne an einem ruhigen gemeinsamen Ort.',
    eyebrow: 'Willkommen zurück',
    heading: 'Anmelden',
    body: 'Melde dich an und geh zurück zu eurem gemeinsamen Ort.',
    email: 'E-Mail',
    password: 'Passwort',
    submit: 'Anmelden',
    pending: 'Anmeldung läuft …',
    errorFallback:
      'Anmeldung fehlgeschlagen. Bitte prüfe deine Zugangsdaten und versuche es erneut.',
    assurance: 'Deine Anmeldung führt dich direkt zurück zu eimir.',
  },
  story: {
    savedTitle: 'Erinnerung gespeichert.',
    savedBody: 'Sie ist jetzt Teil eurer gemeinsamen Geschichte.',
    eyebrow: 'Momente & Erinnerungen',
    title: 'Unsere Momente',
    intro:
      'Erinnerungen, Herzensmomente und Meilensteine – euer ruhiges Zuhause für die Dinge, die bleiben.',
    timelineTitle: 'Momente',
    timelineIntro: 'Unsere besonderen Augenblicke – für immer festgehalten.',
    addMemory: 'Erinnerung',
    timelineKicker: 'Zeitleiste',
    timelineHeading: 'Gemeinsame Geschichte',
    discoverKicker: 'Entdecken',
    discoverHeading: 'Momente zum Wiederentdecken',
    discoverSubhead: 'Kleine Momente, die für immer geblieben sind.',
    tabDiscover: 'Entdecken',
    tabTimeline: 'Zeitleiste',
    viewToggleAria: 'Ansicht wählen',
    browseTitle: 'Durchstöbern',
    browseMilestones: 'Meilensteine',
    browseChapters: 'Kapitel',
    browseYears: 'Jahre',
    streamAll: 'Alle in der Zeitleiste ansehen →',
    featuredHighlight: 'Besonderer Moment',
    featuredKicker: 'Aus euren Momenten',
    onThisDay_one: 'Heute vor einem Jahr',
    onThisDay_other: 'Heute vor {{count}} Jahren',
    milestonesTitle: 'Meilensteine & gemeinsame Schritte',
    milestonesDesc: 'Große und kleine Stationen eurer gemeinsamen Geschichte.',
    chaptersTitle: 'Kapitel unserer Geschichte',
    chaptersDesc:
      'Gemeinsame Erlebnisse und Reisen nach Lebensabschnitten bündeln.',
    yearArchiveTitle: 'Unsere Jahre',
    yearArchiveSubtitle: 'Eure gemeinsamen Momente, Jahr für Jahr.',
    yearArchiveAll: 'Alle Jahre ansehen →',
    loadingAria: 'Momente werden geladen',
    loadErrorTitle: 'Die Momente konnten nicht geladen werden.',
    loadErrorFallback: 'Bitte versuche es erneut.',
    emptyTitle: 'Eure Story beginnt hier.',
    emptyBody: 'Haltet euren ersten gemeinsamen Moment fest.',
    emptyAction: 'Ersten Moment festhalten',
    aria: 'Gemeinsame Story',
    byAuthor: 'von {{author}}',
    authorSelf: 'dir',
    kind: {
      memory: 'Erinnerung',
      heartMoment: 'Herzmoment',
      milestone: 'Meilenstein',
    },
    emotion: {
      loved: 'Geliebt',
      seen: 'Gesehen',
      appreciated: 'Wertgeschätzt',
      supported: 'Unterstützt',
      grateful: 'Dankbar',
      happy: 'Glücklich',
      fallback: 'Herzmoment',
    },
    shared: 'Für uns beide',
    photos_one: '{{count}} Foto',
    photos_other: '{{count}} Fotos',
  },
  storyYears: {
    backToMoments: '← Zurück zu Momente',
    backToYears: '← Unsere Jahre',
    eyebrow: 'Jahresarchiv',
    title: 'Unsere Jahre',
    intro: 'Eure gemeinsame Geschichte, Jahr für Jahr.',
    listAria: 'Gemeinsame Jahre',
    currentYearLabel: 'Unser Jahr bisher',
    currentYearHint: 'Die Momente, die ihr dieses Jahr festgehalten habt.',
    pastYearLabel: 'Unser Jahr {{year}}',
    pastYearHint: 'Gemeinsame Momente aus diesem Jahr.',
    openYear: 'Unser Jahr {{year}} öffnen',
    detailTitle: 'Unser Jahr {{year}}',
    currentYearIntro:
      'Die Momente, die ihr {{year}} bisher miteinander festgehalten habt.',
    pastYearIntro:
      'Die gemeinsamen Momente, die ihr {{year}} festgehalten habt.',
    emptyTitle: 'Noch keine gemeinsamen Jahre',
    emptyBody:
      'Sobald ihr gemeinsame Momente festhaltet, findet ihr sie hier nach Jahren wieder.',
    unavailableTitle: 'Dieses Jahr ist noch leer',
    unavailableBody:
      'Für {{year}} gibt es keine gemeinsamen Momente in eurer Jahreschronik.',
    invalidTitle: 'Jahr nicht gefunden',
    invalidBody: 'Diese Jahresansicht ist nicht verfügbar.',
    loadMore: 'Weitere Momente laden',
    loadingMore: 'Weitere Momente werden geladen …',
    offline: 'Offline – zuletzt gespeicherte Jahreschronik',
  },
  memory: {
    backToStory: '← Zurück zu Momente',
    eyebrow: 'Moment festhalten',
    heading: 'Neue Erinnerung',
    intro:
      'Foto oder ein paar Worte reichen. Titel und weitere Details sind optional.',
    formAria: 'Erinnerung erstellen',
    titleLabel: 'Titel',
    titleLabelOptional: 'Titel (optional)',
    titlePlaceholder: 'Zum Beispiel: Unser Tag am See',
    bodyLabel: 'Erinnerung',
    bodyPlaceholder: 'Was möchtet ihr von diesem Moment behalten?',
    dateLabel: 'Datum',
    dateHelp: 'Optional – wenn der Moment an einem bestimmten Tag war.',
    dateChangeAction: 'Ändern',
    photoLabel: 'Fotos',
    photoSelected: 'Foto ausgewählt',
    photoSelect: 'Fotos auswählen',
    photoAddMore: 'Weitere Fotos auswählen',
    photoFormats: 'JPG, PNG, WebP, HEIC oder HEIF',
    photoDraftsAria: 'Ausgewählte Fotos',
    photoLocalPreview: 'Lokale Vorschau',
    photoPreviewAlt: 'Lokale Vorschau für {{name}}',
    photoUploading: 'Wird hochgeladen …',
    photoValidating: 'Wird geprüft …',
    photoReady: 'Bereit zum Speichern',
    photoFailed: 'Upload fehlgeschlagen',
    photoFailedNotSaved:
      'Dieses Foto wird nicht gespeichert, solange der Upload fehlgeschlagen ist.',
    photoRemove: 'Entfernen',
    photoPendingSave:
      'Warte, bis alle laufenden Foto-Uploads abgeschlossen sind.',
    photoLimitReached_one:
      'Ein Foto wurde nicht hinzugefügt, weil das Limit pro Erinnerung erreicht ist.',
    photoLimitReached_other:
      '{{count}} Fotos wurden nicht hinzugefügt, weil das Limit pro Erinnerung erreicht ist.',
    visibilityAria: 'Sichtbarkeit',
    sharedTitle: 'Für euch beide sichtbar',
    sharedBody:
      'Diese Erinnerung ist für beide Personen in eurem gemeinsamen Space sichtbar.',
    save: 'Erinnerung speichern',
    saving: 'Wird gespeichert …',
    processing: 'Erinnerung wird gespeichert und die Story aktualisiert …',
    saveErrorTitle: 'Die Erinnerung konnte nicht gespeichert werden.',
    saveErrorFallback: 'Bitte prüfe deine Verbindung und versuche es erneut.',
    imageRequired: 'Bitte wähle ein Bild aus.',
  },
  header: {
    sharedArea: 'Gemeinsamer Bereich',
    logout: 'Abmelden',
  },
  media: {
    unavailable: 'Foto derzeit nicht verfügbar',
    loading: 'Foto wird geladen',
    alt: 'Foto zu dieser Erinnerung',
  },
  flow: {
    uploadFailed: 'Bild-Upload fehlgeschlagen',
    processingStatus: 'Medienverarbeitung beendet mit Status {{status}}.',
    processingTimeout:
      'Medienverarbeitung hat das READY-Fenster nicht rechtzeitig erreicht.',
    imageLoadFailed: 'Bild konnte nicht geladen werden',
    signInFailed: 'Anmeldung fehlgeschlagen.',
    imageOnly: 'S8 akzeptiert ausschließlich Bilder.',
    imageEmpty: 'Das ausgewählte Bild ist leer.',
    saveFailed: 'Erinnerung konnte nicht gespeichert werden.',
  },
} as const;

export default de;
