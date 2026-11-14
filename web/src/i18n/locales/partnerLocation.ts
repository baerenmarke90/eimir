const partnerLocation = {
  settingsTitle: 'Standort & Entfernung',
  settingsEyebrow: 'Einstellungen · Beziehung',
  settingsEntryIntro:
    'Zeige auf Wunsch, wie viele Kilometer zwischen euch liegen.',
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
  levelDistanceHint: 'Auf „Wir“ z. B. „340 km zwischen euch“, gerundet.',
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
    '{{partner}} sieht dann auf „Wir“, wie viele Kilometer zwischen euch liegen – gerundet, nie deinen Ort.',
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
    'Mit eimir. Pro kannst du auf Wunsch zeigen, wie viele Kilometer zwischen euch liegen. Jede Person entscheidet selbst, was sie teilt.',
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
  onboardingTitle: 'Wie viele Kilometer liegen gerade zwischen euch?',
  onboardingIntro:
    'Wenn du möchtest, sieht {{partner}} auf „Wir“, wie viele Kilometer zwischen euch liegen.',
  onboardingCoarse: 'Nur eine grobe Entfernung, kein Ort.',
  onboardingEnergy: 'Kein Verlauf, stromsparend, kein GPS.',
  onboardingStop:
    'Erst geteilt, wenn du zustimmst. Jederzeit in den Einstellungen beenden.',
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
  distanceNear: 'Ihr seid gerade ganz nah beieinander',
  distanceBetween: '{{distance}} zwischen euch',
  distanceAsOfToday: 'heute, {{time}}',
  distanceAsOfYesterday: 'gestern, {{time}}',
  distanceAsOfDate: '{{date}}, {{time}}',
  distanceAsOfLabel: 'Stand {{time}}',
  distanceOpenMap: 'Auf der Karte ansehen',
  distanceOwnMissing: 'Dein Standort fehlt',
  distanceOwnMissingAction: 'Einschalten',
  distanceOwnMissingLabel:
    'Dein Standort fehlt. Nur du siehst diesen Hinweis. Einschalten',
  distanceSharing: 'Du teilst deine Entfernung mit {{partner}}',
  distanceSharingLabel:
    'Du teilst deine Entfernung mit {{partner}}. Teilen anpassen',
  wirModuleLabel: 'Entfernung zwischen euch',
  mapTitle: 'Wo wir gerade sind',
  mapShowUs: 'Uns zeigen',
  mapLoading: 'Karte wird geladen …',
  mapPartnerArea: '{{partner}} · ungefährer Bereich',
  mapPartnerAsOf: 'Stand: {{time}}',
  mapYou: 'Du · nur für dich sichtbar',
  mapYouMissing: 'Du · dein Standort fehlt',
  mapOwnSharesMap: '{{partner}} sieht deinen ungefähren Bereich',
  mapOwnSharesDistance: '{{partner}} sieht nur die Entfernung',
  mapOwnSharesNothing: 'Du teilst gerade nichts',
  mapAdjust: 'Mein Teilen anpassen',
  mapUnavailableTitle: 'Gerade ist hier nichts zu sehen',
  mapUnavailableBody:
    'Ein ungefährer Bereich erscheint hier nur, solange er geteilt wird.',
  mapAreaDescription:
    '{{partner}} ist ungefähr in einem Bereich mit {{radius}} Radius. Stand: {{time}}.',
  mapOwnDescription:
    'Dein eigener ungefährer Standort ist nur für dich markiert.',
  mapPeopleLabel: 'Ihr beide auf der Karte',
} as const;

export default partnerLocation;
