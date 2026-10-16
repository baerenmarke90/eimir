const m5s6 = {
  cacheRuntime: {
    cachedBanner:
      'Offline-Ansicht: Du siehst einen schreibgeschützten Stand vom {{timestamp}}. Änderungen sind erst wieder mit Verbindung möglich.',
  },
  transfer: {
    eyebrow: 'Daten übertragen',
    title: 'Export und Import',
    intro:
      'Exportiere eure gemeinsamen Daten oder zusätzlich deine eigenen privaten Inhalte. Importe werden zuerst geprüft und erst nach deiner Bestätigung angewendet.',
    export: {
      heading: 'Export',
      scopeLabel: 'Umfang',
      shared: 'Gemeinsame Daten',
      sharedHelp: 'Enthält nur Daten, die im Space geteilt sind.',
      personal: 'Meine Daten',
      personalHelp:
        'Enthält die gemeinsamen Daten und zusätzlich nur deine eigenen privaten Inhalte.',
      start: 'Export erstellen',
      starting: 'Export wird angefordert …',
      expires: 'Die Exportdatei ist 24 Stunden verfügbar.',
      download: 'Export herunterladen',
      downloading: 'Download wird vorbereitet …',
      statusLabel: 'Exportstatus',
      status: {
        QUEUED: 'Wartet auf Verarbeitung',
        RUNNING: 'Wird erstellt',
        READY: 'Bereit zum Download',
        FAILED: 'Export fehlgeschlagen',
        EXPIRED: 'Export abgelaufen',
      },
    },
    import: {
      heading: 'Import',
      fileLabel: 'eimir. Transfer Bundle',
      fileHelp: 'Wähle genau eine ZIP-Datei aus einem eimir.-Export.',
      upload: 'Datei prüfen',
      uploading: 'Datei wird hochgeladen …',
      statusLabel: 'Importstatus',
      status: {
        QUEUED: 'Wartet auf Prüfung',
        VALIDATING: 'Wird geprüft',
        READY_TO_APPLY: 'Geprüft und bereit',
        APPLYING: 'Wird importiert',
        COMPLETED: 'Import abgeschlossen',
        FAILED: 'Import fehlgeschlagen',
        EXPIRED: 'Import abgelaufen',
      },
      summaryHeading: 'Geprüfter Inhalt',
      scope: 'Umfang',
      members: 'Quellpersonen',
      records: 'Datensätze',
      media: 'Medien',
      confirm:
        'Ich habe die Zusammenfassung geprüft und möchte diese Daten zusätzlich in den aktuellen Space importieren.',
      apply: 'Import anwenden',
      applying: 'Import wird angewendet …',
      additive:
        'Der Import ergänzt neue Einträge. Er ersetzt oder löscht keine bestehenden Daten.',
    },
    genericFailure:
      'Der Vorgang konnte nicht abgeschlossen werden. Es wurden keine privaten Archivinhalte in der Fehlermeldung angezeigt.',
  },
};

export default m5s6;
