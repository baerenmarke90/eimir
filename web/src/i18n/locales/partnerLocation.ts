const partnerLocation = {
  settingsTitle: 'Standort & Entfernung',
  settingsEyebrow: 'Einstellungen · Beziehung',
  settingsEntryIntro:
    'Auf Wunsch seht ihr, wie weit ihr ungefähr voneinander entfernt seid.',
  pro: 'Pro',
  partnerFallback: 'dein Partner',
  loading: 'Einstellungen werden geladen …',
  loadFailed: 'Die Einstellungen konnten nicht geladen werden.',
  levelTitle: 'Was {{partner}} sehen darf',
  levelIntro:
    'Du entscheidest das für dich – {{partner}} entscheidet selbst, was du siehst.',
  levelOff: 'Aus',
  levelOffHint: 'Es wird nichts geteilt.',
  levelDistance: 'Nur Entfernung',
  levelDistanceHint: 'Eine grobe Spanne auf „Wir“, z. B. „ca. 340 km“.',
  levelMap: 'Entfernung und Kartenbereich',
  levelMapHint:
    'Zusätzlich ein ungefährer Bereich auf eurer Karte, kein genauer Punkt.',
  levelMapShort: 'Auch auf der Karte',
  statusActiveUntil: 'Wird geteilt · bis {{end}}',
  statusActiveIndefinite: 'Wird geteilt · bis du es beendest',
  statusExpired: 'Die gewählte Zeit ist vorbei. Es wird nichts mehr geteilt.',
  statusSuspended:
    'Pausiert, weil eimir. Pro gerade nicht aktiv ist. Es wird nichts geteilt.',
  statusSuspendedConfirm:
    'Pausiert. Es wird nichts geteilt, bis du dein Teilen erneut bestätigst.',
  statusPartnerChanged:
    'Deine Freigabe galt einer früheren Verbindung. Es wird nichts geteilt.',
  statusStopPending: 'Wird beendet, sobald du wieder verbunden bist.',
  endToday: 'heute, {{time}}',
  endTomorrow: 'morgen, {{time}}',
  changeDuration: 'Dauer ändern',
  stop: 'Teilen beenden',
  shareAgain: 'Wieder teilen',
  shared: 'Du teilst jetzt die Entfernung.',
  sharedMap: 'Du teilst jetzt Entfernung und Kartenbereich.',
  durationSaved: 'Dauer gespeichert.',
  levelSaved: 'Auswahl gespeichert.',
  stopped: 'Teilen beendet.',
  writeFailed: 'Das hat nicht geklappt. Versuche es bitte noch einmal.',
  durationLegend: 'Wie lange',
  durationHour: '1 Stunde',
  durationEvening: 'Bis heute Abend',
  durationIndefinite: 'Dauerhaft',
  durationIndefiniteHint: 'Läuft, bis du es hier beendest.',
  levelLegend: 'Was geteilt wird',
  confirmDistanceTitle: 'Entfernung teilen?',
  confirmDistanceBody:
    '{{partner}} sieht dann auf „Wir“ ungefähr, wie weit ihr auseinander seid – nie deinen Ort.',
  confirmMapTitle: 'Auch auf der Karte zeigen?',
  confirmMapBody:
    'Neu sichtbar wird ein ungefährer Bereich von mindestens 1,5 km auf eurer Karte – kein genauer Punkt und kein Verlauf.',
  confirmShare: 'Entfernung teilen',
  confirmShareMap: 'Bereich zeigen',
  durationTitle: 'Wie lange teilen?',
  durationSave: 'Dauer speichern',
  permissionNeeded:
    'Ohne Standortfreigabe kann eimir. keine Entfernung teilen. Es wurde nichts geteilt.',
  locationUnavailable:
    'Dein Standort ist gerade nicht verfügbar. eimir. versucht es beim nächsten Öffnen erneut.',
  proTitle: 'Gehört zu eimir. Pro',
  proBody:
    'Mit eimir. Pro könnt ihr auf Wunsch sehen, wie weit ihr ungefähr voneinander entfernt seid. Jede Person entscheidet selbst, was sie teilt.',
  proAction: 'eimir. Pro ansehen',
  unavailable: 'Gerade nicht verfügbar.',
  deviceTitleApp: 'Auf diesem Handy',
  deviceTitleBrowser: 'In diesem Browser',
  backgroundLabel: 'Auch aktuell halten, wenn eimir. zu ist',
  backgroundHint:
    'Nutzt nur Standorte, die dein Handy ohnehin ermittelt. Kein zusätzliches GPS.',
  backgroundNeedsSharing: 'Verfügbar, solange du teilst.',
  backgroundDenied:
    'Android erlaubt den Standort nur beim Öffnen. Wähle in den Android-Einstellungen „Immer zulassen“, wenn du das möchtest.',
  backgroundOn: 'Bleibt aktuell, auch wenn eimir. zu ist.',
  backgroundOff: 'Wird nur noch beim Öffnen aktualisiert.',
  permissionGranted: 'Ungefährer Standort erlaubt',
  permissionDenied: 'Standort nicht erlaubt',
  permissionPrompt: 'Standort noch nicht erlaubt',
  permissionUnsupported: 'Auf diesem Gerät nicht verfügbar',
  permissionChangeApp: 'In den Android-Einstellungen ändern',
  permissionChangeBrowser:
    'Änderbar in den Website-Einstellungen deines Browsers.',
  permissionAllow: 'Standort erlauben',
  onboardingTitle: 'Wie weit seid ihr gerade voneinander entfernt?',
  onboardingIntro:
    'Wenn du möchtest, sieht {{partner}} auf „Wir“ ungefähr, wie weit ihr auseinander seid. Bis du zustimmst, wird nichts geteilt.',
  onboardingCoarse: 'Nur eine grobe Entfernung, kein Ort.',
  onboardingEnergy: 'Kein Verlauf, stromsparend, kein GPS.',
  onboardingStop: 'Jederzeit in den Einstellungen beenden.',
  onboardingShare: 'Entfernung teilen',
  onboardingLater: 'Nicht jetzt',
  onboardingOffline: 'Du bist offline. Versuche es, sobald du verbunden bist.',
  disclosureTitle: 'Auch aktuell, wenn eimir. geschlossen ist?',
  disclosureBody:
    'eimir. erfasst dann deinen ungefähren Standort im Hintergrund, auch wenn die App geschlossen ist oder nicht verwendet wird, damit {{partner}} eure Entfernung aktuell sieht.',
  disclosureBodyMap:
    'eimir. erfasst dann deinen ungefähren Standort im Hintergrund, auch wenn die App geschlossen ist oder nicht verwendet wird, damit {{partner}} eure Entfernung und deinen ungefähren Bereich aktuell sieht.',
  disclosurePassive:
    'Nur Standorte, die dein Handy sowieso kennt. Kein GPS, kaum Akku.',
  disclosurePurpose:
    'Nur für die Entfernung zu {{partner}}, nie für Werbung, kein Verlauf.',
  disclosureStop: 'Jederzeit hier ausschalten.',
  disclosureAndroidHint:
    'Android zeigt danach „Immer zulassen“. Wähle dort diese Option.',
  disclosureContinue: 'Weiter zu den Einstellungen',
  disclosureForegroundOnly: 'Nur beim Öffnen',
} as const;

export default partnerLocation;
