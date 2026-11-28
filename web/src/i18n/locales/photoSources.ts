const photoSources = {
  settingsTitle: 'Medienquellen',
  settingsIntro: 'Verbinde deinen Fotodienst für neue Momente.',
  connected: 'Immich ist verbunden.',
  configureInSettings: 'Verbinde Immich unter Einstellungen › Medienquellen.',
  addMedia: 'Medien hinzufügen',
  mediaLabel: 'Medien',
  device: 'Dieses Gerät',
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
  waiting:
    'Wähle jetzt deine Fotos bei Google. Danach geht es hier automatisch weiter.',
  signingIn:
    'Melde dich bei Google an und erlaube den Zugriff. Danach öffnet sich die Fotoauswahl.',
  nothingChosen:
    'Keine Fotos ausgewählt. Du kannst Google Fotos jederzeit wieder öffnen.',
  progress: 'Fotos werden übernommen …',
  waitingMedia:
    'Wähle jetzt deine Fotos und Videos bei Google. Danach geht es hier automatisch weiter.',
  resultsLabel: 'Deine Auswahl',
  video: 'Video {{number}}',
  file: 'Datei {{number}}',
  itemWaiting: 'Wartet',
  itemWorking: 'Wird übernommen …',
  itemDone: 'Hinzugefügt',
  itemFailed: 'Das hat nicht geklappt.',
  itemNotReady:
    'Google macht das Video noch fertig. Versuche es gleich noch einmal.',
  itemUnsupported: 'Dieses Format geht hier nicht.',
  itemNoVideo: 'Videos kannst du hier nicht hinzufügen.',
  itemVideoOff: 'Videos sind gerade nicht verfügbar.',
  itemVideoRejected: 'Dieses Video lässt sich nicht übernehmen.',
  itemGone: 'Nicht mehr verfügbar.',
  itemNoRoom: 'Hier ist kein Platz mehr.',
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
    '{{count}} Foto übernommen. Einige Fotos konnten nicht geladen werden.',
  partial_other:
    '{{count}} Fotos übernommen. Einige Fotos konnten nicht geladen werden.',
  offline:
    'Für diese Fotoquelle brauchst du eine Internetverbindung. Dein Entwurf bleibt erhalten.',
  link: 'Immich-Dienst verknüpfen',
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
  addressUnavailable:
    'Die Verbindung konnte nicht hergestellt werden. Prüfe die erreichbare HTTPS-Adresse und die Leserechte des Schlüssels. Dein Eintrag bleibt erhalten.',
  googleAccountLink: 'Google-Konto verknüpfen',
  googleAccountSheetTitle: 'Dein Google-Konto',
  googleAccountEmail: 'E-Mail-Adresse deines Google-Kontos',
  googleAccountLinked: 'Google-Konto verknüpft.',
  googleAccountUnlink: 'Verbindung trennen',
  googleAccountUnlinked: 'Verbindung getrennt.',
  googleAccountInvalid: 'Bitte gib eine gültige E-Mail-Adresse ein.',
  googleAccountChanged:
    'Das Konto wurde in einem anderen Fenster geändert. Bitte prüfe es noch einmal.',
  googleConsentIncomplete:
    'Das Konto ist gemerkt, aber Google hat den Zugriff noch nicht bestätigt.',
  googleConsentConfirm: 'Bei Google bestätigen',
  googleAccountUnavailable:
    'Das hat gerade nicht geklappt. Versuche es noch einmal.',
};
export default photoSources;
