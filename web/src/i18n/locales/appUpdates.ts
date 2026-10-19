export default {
  title: 'App-Updates',
  intro: 'Halte deine Testversion aktuell.',
  installed: 'Installiert: {{version}}',
  testVersion: 'Testversion',
  buildInfo: 'Build-Informationen',
  build: 'Build {{code}} · {{revision}}',
  availableVersion: 'Neue Version: {{version}}',
  notes: 'Was ist neu?',
  check: 'Nach Updates suchen',
  download: 'Update herunterladen',
  cancel: 'Download abbrechen',
  install: 'Update installieren',
  allow: 'Installation erlauben',
  installAgain: 'Installation fortsetzen',
  confirm:
    'Die Installation bestätigst du in Android. Speichere vorher offene Eingaben.',
  permission:
    'Erlaube eimir. in Android, App-Updates zu installieren. Kehre danach hierher zurück und tippe erneut auf „Update installieren“.',
  progress: 'Update herunterladen',
  connectionError:
    'Die Updateprüfung ist gerade nicht erreichbar. Du kannst eimir. weiter nutzen und es später erneut versuchen.',
  integrityError:
    'Das Update konnte nicht sicher geprüft werden. Suche erneut nach Updates.',
  actionError:
    'Die Aktion konnte nicht abgeschlossen werden. Versuche es erneut.',
  installError:
    'Android konnte die Installation nicht öffnen. Suche erneut nach Updates und versuche es noch einmal.',
  retry: 'Erneut versuchen',
  phases: {
    idle: 'Du kannst nach einer neuen Testversion suchen.',
    checking: 'Es wird nach Updates gesucht.',
    noRelease: 'Zurzeit ist keine passende Testversion veröffentlicht.',
    current: 'Deine Testversion ist aktuell.',
    available: 'Eine neue Testversion ist verfügbar.',
    downloading: 'Das Update wird heruntergeladen.',
    verifying: 'Das Update wird geprüft.',
    ready: 'Das geprüfte Update ist bereit zur Installation.',
    permissionRequired: 'Android benötigt deine Erlaubnis zur Installation.',
    installerOpened: 'Bestätige die Installation in Android oder kehre zurück.',
    error: 'Die Aktualisierung wurde nicht abgeschlossen.',
    cancelled:
      'Der Vorgang wurde abgebrochen. Deine installierte App bleibt nutzbar.',
  },
};
