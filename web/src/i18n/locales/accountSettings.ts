export default {
  signInMethodsTitle: 'Anmeldemethoden',
  signInMethodsIntro:
    'So kommst du in dein Konto. Du brauchst immer mindestens eine.',
  signInMethodsLoadFailed: 'Die Anmeldemethoden konnten nicht geladen werden.',
  signInMethodsRetry: 'Erneut versuchen',
  emailLinkTitle: 'E-Mail-Link',
  emailLinkVerified: 'Bestätigt',
  emailLinkNote: 'Link per E-Mail',
  passwordTitle: 'Passwort',
  passwordNote: 'Du meldest dich mit E-Mail und Passwort an.',
  googleTitle: 'Google',
  providerLinked: 'Verknüpft',
  providerNotLinked: 'Nicht verknüpft',
  providerLink: 'Verknüpfen',
  providerUnlink: 'Trennen',
  providerUnlinkConfirm: 'Wirklich trennen',
  providerUnlinked: 'Verknüpfung getrennt.',
  passkeysTitle: 'Passkeys',
  passkeysIntro: 'Mit Fingerabdruck oder Display-Sperre, ohne Passwort.',
  passkeysNone: 'Noch kein Passkey eingerichtet.',
  passkeyAddedOn: 'Hinzugefügt am {{date}}',
  passkeyRemove: 'Entfernen',
  passkeyRemoveConfirm: 'Wirklich entfernen',
  passkeyRemoveCancel: 'Abbrechen',
  passkeyAdd: 'Passkey hinzufügen',
  passkeyAdding: 'Passkey wird eingerichtet …',
  passkeyDefaultName: 'Dieses Gerät',
  passkeyAddedMessage: 'Passkey hinzugefügt.',
  passkeyRemovedMessage: 'Passkey entfernt.',
  passkeyNotOnThisDevice: 'Auf diesem Gerät sind Passkeys nicht verfügbar.',
  passkeyAppNotLinked:
    'Passkeys sind für diese App noch nicht freigeschaltet. Nutze vorerst den E-Mail-Link.',
  passkeyAlreadyOnDevice:
    'Auf diesem Gerät ist für dein Konto schon ein Passkey gespeichert.',
  passkeyServerRejected:
    'Der Server hat den Passkey von dieser App nicht angenommen. Nutze vorerst den E-Mail-Link.',
  lastMethod:
    'Das ist deine einzige Anmeldemethode. Richte zuerst eine andere ein.',
  methodFailed: 'Das hat nicht geklappt. Bitte versuche es noch einmal.',
  title: 'Account',
  intro:
    'Hier verwaltest du Aktionen, die dein persönliches eimir.-Konto betreffen. Beziehung und gemeinsamer Bereich bleiben davon getrennt.',
  dangerEyebrow: 'Sensible Aktion',
  dangerTitle: 'Konto löschen',
  dangerIntro:
    'Die Kontolöschung betrifft dein persönliches Konto. Sie ist nicht dasselbe wie den gemeinsamen Bereich zu verlassen oder eine Beziehung zu beenden.',
  deleteAction: 'Konto löschen',
  demoTitle: 'Kontolöschung in der Demo nicht verfügbar',
  demoBody:
    'Demo-Konten werden von der Demo-Umgebung verwaltet und können hier nicht selbst gelöscht werden.',
  consequencesTitle: 'Folgen der Kontolöschung',
  consequencesIntro:
    'Prüfe diese Folgen, bevor du mit der endgültigen Bestätigung fortfährst.',
  consequenceAccess:
    'Dein Kontozugriff endet und aktive Sitzungen sowie Anmeldedaten werden widerrufen.',
  consequencePrivate:
    'Daten, die nur deinem Konto gehören, werden nach dem verbindlichen Lösch-Lifecycle entfernt.',
  consequenceShared:
    'Gemeinsame Historie folgt den bestehenden Aufbewahrungsregeln. Der gemeinsame Bereich oder die Beziehung wird dadurch nicht automatisch gelöscht.',
  consequenceIrreversible:
    'Sobald der Server die Löschung angenommen hat, ist sie nicht mehr rückgängig zu machen. Die App muss für die weitere Bereinigung nicht geöffnet bleiben.',
  exportBefore: 'Vorher Daten exportieren',
  continueAction: 'Weiter',
  cancelAction: 'Abbrechen',
  reauthEyebrow: 'Sicherheitsprüfung',
  reauthTitle: 'Identität bestätigen',
  reauthIntro:
    'Bestätige deine Identität erneut. Welche Methode verfügbar ist, entscheidet der Server anhand deines aktuellen Kontos und dieser Sitzung.',
  reauthLoading: 'Verfügbare Anmeldemethoden werden geladen …',
  reauthPasswordLabel: 'Aktuelles Passwort',
  reauthPasswordAction: 'Mit Passwort bestätigen',
  reauthPasskeyAction: 'Mit Passkey bestätigen',
  reauthOidcAction: 'Mit {{provider}} erneut anmelden',
  reauthUnavailableTitle: 'Keine Bestätigungsmethode verfügbar',
  reauthUnavailableBody:
    'Für dieses Konto ist aktuell keine Methode zur erneuten Identitätsbestätigung verfügbar. Die Kontolöschung bleibt gesperrt.',
  reauthPending: 'Identität wird bestätigt …',
  finalTitle: 'Kontolöschung bestätigen',
  finalIntro:
    'Deine Identität wurde bestätigt. Diese Aktion kann nach der Annahme durch den Server nicht rückgängig gemacht werden.',
  confirmInstruction:
    'Gib {{phrase}} ein, um dein Konto endgültig zur Löschung freizugeben.',
  confirmLabel: 'Bestätigung',
  confirmPhrase: 'KONTO LÖSCHEN',
  confirmHelp:
    'Die Eingabe muss genau mit dem angezeigten Text übereinstimmen.',
  backAction: 'Zurück',
  submitAction: 'Konto endgültig löschen',
  submitting: 'Kontolöschung wird gestartet …',
} as const;
