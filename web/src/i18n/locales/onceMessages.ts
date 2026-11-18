const onceMessages = {
  title: 'Nur für dich',
  from: 'Von {{name}}',
  for: 'Für {{name}}',
  singleView: 'Einmal ansehen',
  message: 'Deine Nachricht',
  photo: 'Foto',
  voice: 'Sprachnachricht',
  record: 'Aufnehmen',
  importVoice: 'Audio importieren',
  description: 'Bildbeschreibung (optional)',
  removeMedia: 'Anhang entfernen',
  send: 'Senden',
  sending: 'Wird gesendet …',
  checkSend: 'Versand erneut prüfen',
  sent: 'Gesendet',
  sentLifetime:
    'Einmal öffnen. Ungeöffnet verfällt die Nachricht nach 24 Stunden.',
  back: 'Zurück zu Wir',
  close: 'Schließen',
  loading: 'Wird geladen …',
  refreshFailed: 'Aktualisierung fehlgeschlagen.',
  notification: 'Eine Nachricht wartet auf dich.',
  open: 'Einmal öffnen',
  opening: 'Wird geöffnet …',
  openConsequence:
    'Nach dem Schließen oder Verlassen der App nicht erneut verfügbar. Die Ansicht endet spätestens nach fünf Minuten.',
  copyLimit: 'Kopien lassen sich nicht verhindern.',
  originalDevice:
    'Öffne diese Nachricht auf einem Gerät, auf dem du den Empfang bereits vor dem Versand aktiviert hattest.',
  ended: 'Diese Nachricht ist nicht mehr verfügbar.',
  unavailable:
    'Diese Nachricht ist abgelaufen, zurückgezogen oder bereits geöffnet.',
  reception: 'Empfang',
  consent:
    'Möchtest du Einmalnachrichten empfangen? Sie können intime Texte, Fotos oder Audio enthalten.',
  enable: 'Auf diesem Gerät empfangen',
  enabled: 'Empfang aktiviert',
  disable: 'Empfang ausschalten',
  disableConsequence:
    'Alle noch ausstehenden Einmalnachrichten zwischen euch werden gelöscht. Du kannst den Empfang später wieder aktivieren.',
  discard: 'Verwerfen',
  discardConsequence: 'Die Nachricht wird gelöscht, ohne sie zu öffnen.',
  empty: 'Keine verschlossenen Nachrichten.',
  compose: 'Nachricht schreiben',
  pro: 'Einmalnachrichten senden mit eimir. Pro. Ein Abo gilt für euch beide.',
  discoverPro: 'Pro ansehen',
  noPartner: 'Verbinde dich zuerst mit deinem Partner.',
  partnerConsent:
    'Dein Partner muss den Empfang auf seinem Gerät selbst aktivieren.',
  sendConsequence:
    'Nur für deinen Partner. Einmal öffnen, ungeöffnet 24 Stunden verfügbar. Kopien lassen sich nicht verhindern.',
  withdraw: 'Zurückziehen',
  withdrawn: 'Nachricht zurückgezogen',
  removing: 'Wird entfernt …',
  withdrawConsequence:
    'Der Inhalt wird entfernt. Bereits geöffnete Inhalte oder Kopien lassen sich nicht zurückholen.',
  errors: {
    failed: 'Das hat nicht geklappt. Bitte versuche es erneut.',
    offline: 'Keine Verbindung. Es wurde nichts gesendet.',
    uncertain:
      'Der Versand ist noch nicht bestätigt. Prüfe ihn erneut; dabei wird keine zweite Nachricht gesendet.',
    deviceUnavailable:
      'Der geschützte Gerätespeicher ist nicht verfügbar. Verwende einen unterstützten Browser und versuche es erneut.',
    photoInvalid:
      'Bitte wähle ein JPEG-, PNG- oder WebP-Foto mit höchstens 20 MB.',
    mediaTooLarge: 'Der vorbereitete Anhang darf höchstens 4 MB groß sein.',
    audioInvalid:
      'Wähle eine abspielbare Audiodatei mit höchstens drei Minuten.',
    invalidContent: 'Die Nachricht konnte nicht sicher geöffnet werden.',
    proRequired: 'Zum Senden braucht ihr eimir. Pro.',
    ONCE_RECEPTION_CHANGED:
      'Deine Freigabe hat sich geändert. Bitte lade sie neu und wähle erneut.',
    ONCE_RECEPTION_REQUIRED: 'Aktiviert zuerst beide den Empfang.',
    ONCE_KEY_CHANGED:
      'Die Empfangsgeräte haben sich geändert. Bitte versuche den Versand erneut.',
    ONCE_DEVICE_UNAVAILABLE:
      'Diese Nachricht lässt sich auf diesem Gerät nicht öffnen.',
    ONCE_MESSAGE_UNAVAILABLE: 'Diese Nachricht ist nicht mehr verfügbar.',
    ONCE_CAPACITY_REACHED: 'Bitte versuche es später erneut.',
    ONCE_DEVICE_LIMIT:
      'Es sind zu viele Empfangsgeräte registriert. Schalte den Empfang aus und aktiviere die gewünschten Geräte erneut.',
    ONCE_REQUEST_CONFLICT:
      'Der Versand wurde bereits mit einem anderen Inhalt begonnen. Öffne die Funktion erneut.',
  },
};
export default onceMessages;
