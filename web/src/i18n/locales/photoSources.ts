const photoSources = {
  settingsTitle: 'Medienquellen',
  settingsIntro: 'Verbinde deinen Fotodienst für neue Momente.',
  connected: 'Immich ist verbunden.',
  configureInSettings: 'Verbinde Immich unter Einstellungen › Medienquellen.',
  addMedia: 'Medien hinzufügen',
  mediaLabel: 'Medien',
  deviceMediaHint: 'Fotos und Videos',
  device: 'Vom Gerät auswählen',
  deviceMedia: 'Fotos und Videos gemeinsam auswählen',
  previewFailed: 'Vorschau fehlt',
  videoAvailabilityUnavailable:
    'Videos sind gerade nicht verfügbar. Du kannst Fotos auswählen oder es erneut versuchen.',
  more: 'Andere Fotoquelle',
  title: 'Fotos hinzufügen',
  google: 'Google Fotos',
  immich: 'Immich',
  pro: 'Pro',
  proRequired:
    'Verknüpfe eure Fotodienste und übernimm ausgewählte Fotos mit eimir. Pro.',
  consent:
    'Nur ausgewählte Fotos werden in deinen Entwurf kopiert. Auf diesem Gerät können sie bis zu 7 Tage gesichert werden. Die Sichtbarkeit richtet sich nach deinem Eintrag.',
  googleConsent:
    'Nur ausgewählte Fotos werden in deinen geöffneten Entwurf und in den geschützten Server-Zwischenspeicher kopiert. Auf diesem Gerät werden keine dauerhaften Google-Fotokopien angelegt. Nach einem Neustart müssen nicht mehr verfügbare Fotos erneut ausgewählt werden. Gespeichert wird erst, wenn du deinen Eintrag speicherst; die Sichtbarkeit richtet sich nach deinem Eintrag.',
  accept: 'Ausgewählte Fotos in meinen Entwurf übernehmen',
  continue: 'Weiter zur Auswahl',
  waiting:
    'Wähle deine Fotos im geöffneten Fenster. Kehre anschließend hierher zurück.',
  progress: 'Fotos werden übernommen …',
  reopenGoogle: 'Google-Fenster erneut öffnen',
  reopenFailed:
    'Das Fenster konnte nicht geöffnet werden. Erlaube Pop-ups für diese Seite und versuche es erneut.',
  retryImport_one: '{{count}} Foto erneut laden',
  retryImport_other: '{{count}} Fotos erneut laden',
  selected: '{{count}} ausgewählt',
  import: 'Fotos übernehmen',
  importFailed:
    'Fotos konnten nicht geladen werden. Deine Auswahl bleibt erhalten. Versuche es erneut.',
  limit_one: 'Du kannst noch {{count}} Foto hinzufügen.',
  limit_other: 'Du kannst noch {{count}} Fotos hinzufügen.',
  empty:
    'Hier sind noch keine passenden Fotos. Du kannst weitere Fotos laden oder auf deinem Gerät auswählen.',
  loadMore: 'Weitere Fotos laden',
  photo: 'Foto {{number}}',
  unavailable:
    'Die Fotoquelle ist gerade nicht erreichbar. Dein Eintrag bleibt erhalten. Versuche es erneut oder wähle Fotos auf deinem Gerät.',
  partial_one:
    '{{count}} Foto wurde in deinen Entwurf übernommen. Weitere Fotos konnten nicht geladen werden. Dein bisheriger Eintrag bleibt erhalten.',
  partial_other:
    '{{count}} Fotos wurden in deinen Entwurf übernommen. Weitere Fotos konnten nicht geladen werden. Dein bisheriger Eintrag bleibt erhalten.',
  offline:
    'Für diese Fotoquelle brauchst du eine Internetverbindung. Dein Entwurf bleibt erhalten.',
  link: 'Eigenen Immich-Dienst verknüpfen',
  linkTitle: 'Dein Immich',
  setupHelp: 'So verbindest du Immich',
  setupOpen:
    'Öffne Immich im Browser und melde dich mit deinem eigenen Konto an.',
  setupKey:
    'Öffne Kontoeinstellungen → API-Schlüssel und erstelle einen Schlüssel für eimir.',
  setupPermissions:
    'Wähle die unten genannten Leserechte und kopiere den Schlüssel hierher. Du kannst ihn in Immich jederzeit widerrufen.',
  setupFallback:
    'Keine Zugangsdaten zur Hand? Schließe diese Auswahl und wähle Fotos direkt auf deinem Gerät.',
  keyIsNotPassword:
    'Hier gehört dein Immich-Zugriffsschlüssel hinein, nicht dein Passwort.',

  address: 'Adresse deines Immich-Dienstes',
  addressHint: 'Die erreichbare HTTPS-Adresse, unter der du Immich öffnest.',
  key: 'Immich-Zugriffsschlüssel',
  keyHint:
    'Erstelle in deinem Immich-Konto unter Kontoeinstellungen → API-Schlüssel einen eigenen Schlüssel für eimir. mit den unten genannten Leserechten. Du kannst ihn dort jederzeit widerrufen.',
  permissions:
    'Benötigt: asset.read, asset.view, asset.download und user.read.',
  privateLink:
    'Die Verbindung gehört nur zu deinem Konto. Die Sichtbarkeit gespeicherter Fotos richtet sich nach deinem Eintrag.',
  linkConsent: 'Meinen Immich-Dienst mit meinem Konto verknüpfen',
  connect: 'Verknüpfen',
  connecting: 'Verbindung wird geprüft …',
  connectionChanged:
    'Deine Immich-Verbindung wurde in einem anderen Fenster geändert. Prüfe die aktuelle Verbindung, bevor du fortfährst.',
  disconnect: 'Verbindung trennen',
  disconnected:
    'Verbindung getrennt. Bereits gespeicherte Fotos bleiben erhalten.',
  disconnectedHint:
    'Der eimir.-Schlüssel kann zusätzlich in Immich widerrufen werden.',
  addressUnavailable:
    'Die Verbindung konnte nicht hergestellt werden. Prüfe die erreichbare HTTPS-Adresse und die Leserechte des Schlüssels. Dein Eintrag bleibt erhalten.',
};
export default photoSources;
