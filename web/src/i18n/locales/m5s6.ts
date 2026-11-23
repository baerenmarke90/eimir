const m5s6 = {
  cacheRuntime: {
    warmOverview:
      'Gespeicherte Übersicht vom {{timestamp}} · Schreibgeschützt, bis die aktuellen Daten geladen sind.',
    cachedBanner:
      'Offline-Ansicht: Du siehst einen schreibgeschützten Stand vom {{timestamp}}. Änderungen sind erst wieder mit Verbindung möglich.',
  },
  transfer: {
    eyebrow: 'Daten übertragen',
    title: 'Export und Import',
    intro:
      'Bevor etwas übernommen wird, siehst du, was die Datei enthält. Ein Import ergänzt nur und löscht nichts.',
    export: {
      heading: 'Export',
      scopeLabel: 'Was soll in die Datei?',
      shared: 'Gemeinsame Daten',
      sharedHelp: 'Nur, was ihr beide miteinander teilt.',
      personal: 'Meine Daten',
      personalHelp:
        'Das Gemeinsame und zusätzlich deine eigenen privaten Inhalte.',
      start: 'Export erstellen',
      starting: 'Export wird angefordert …',
      expires: 'Die Datei steht 24 Stunden zum Herunterladen bereit.',
      download: 'Export herunterladen',
      downloading: 'Download wird vorbereitet …',
      statusLabel: 'Stand',
      status: {
        QUEUED: 'Wartet auf Verarbeitung',
        RUNNING: 'Wird erstellt',
        READY: 'Bereit zum Herunterladen',
      },
    },
    import: {
      heading: 'Import',
      fileLabel: 'Datei aus einem eimir.-Export',
      fileHelp: 'Wähle die ZIP-Datei, die du bei einem Export bekommen hast.',
      upload: 'Datei prüfen',
      uploading: 'Datei wird hochgeladen …',
      statusLabel: 'Stand',
      status: {
        QUEUED: 'Wartet auf die Prüfung',
        VALIDATING: 'Datei wird geprüft …',
        READY_TO_APPLY: 'Geprüft · 24 Stunden bereit',
        APPLYING: 'Wird übernommen …',
        COMPLETED: 'Import abgeschlossen',
      },
      checkingHint: 'Noch wird nichts übernommen.',
      applyingHint: 'Du kannst die App weiter benutzen.',
      lead_one: 'Diese Datei bringt {{count}} Eintrag mit.',
      lead_other: 'Diese Datei bringt {{count}} Einträge mit.',
      media_one: 'Dazu gehört {{count}} Foto oder Video.',
      media_other: 'Dazu gehören {{count}} Fotos und Videos.',
      present_one: '{{count}} davon habt ihr schon. Es bleibt, wie es ist.',
      present_other:
        '{{count}} davon habt ihr schon. Sie bleiben, wie sie sind.',
      storage: 'Braucht {{needed}}, frei sind {{available}}.',
      additive: 'Der Import ergänzt nur. Er ersetzt oder löscht nichts.',
      confirm: 'Ich möchte diese Inhalte zusätzlich übernehmen.',
      confirmWithoutVideos:
        'Ich möchte diese Inhalte ohne die Videos zusätzlich übernehmen.',
      apply: 'Importieren',
      applyWithoutVideos: 'Ohne Videos importieren',
      applying: 'Wird übernommen …',
      videosNeedPro: {
        title: 'Videos gibt es mit eimir. Pro',
        body_one:
          'Du kannst alles andere jetzt übernehmen. Das Video merkt sich eimir., und du kannst es später aus derselben Datei nachholen.',
        body_other:
          'Du kannst alles andere jetzt übernehmen. Die {{count}} Videos merkt sich eimir., und du kannst sie später aus derselben Datei nachholen.',
      },
      noRoom: {
        title: 'Dafür reicht euer Speicher nicht',
        body: 'Die Datei braucht {{needed}}, frei sind {{available}}. Es wurde nichts übernommen. Schafft Platz oder nutzt Pro, dann kannst du dieselbe Datei hier übernehmen.',
      },
      fitsWithoutVideos: {
        title: 'Mit Videos reicht der Speicher nicht',
        body_one:
          'Ohne das Video passt die Datei: Sie braucht dann {{needed}}, frei sind {{available}}. Das Video kannst du später nachholen, wenn wieder Platz ist.',
        body_other:
          'Ohne die {{count}} Videos passt die Datei: Sie braucht dann {{needed}}, frei sind {{available}}. Die Videos kannst du später nachholen, wenn wieder Platz ist.',
      },
      roomTaken: {
        title: 'Inzwischen ist weniger Platz frei',
        body: 'Während des Imports wurde Speicher belegt. Es wurde nichts übernommen; die Datei bleibt bereit.',
      },
      morePro: 'Mehr Platz mit eimir. Pro',
      discoverPro: 'Mit eimir. Pro entdecken',
      viewMedia: 'Fotos und Videos ansehen',
      completed: {
        title: 'Import abgeschlossen',
        body: 'Die übernommenen Inhalte findest du bei euren Momenten.',
        skipped_one: '{{count}} Video wurde übersprungen.',
        skipped_other: '{{count}} Videos wurden übersprungen.',
        recovered_one: '{{count}} Video nachgeholt.',
        recovered_other: '{{count}} Videos nachgeholt.',
        unrecovered_one:
          '{{count}} Video passte nicht mehr in seine Galerie und bleibt gemerkt.',
        unrecovered_other:
          '{{count}} Videos passten nicht mehr in ihre Galerie und bleiben gemerkt.',
        toMoments: 'Zu euren Momenten',
      },
      offline: {
        title: 'Keine Verbindung',
        body: 'Ohne Internet lässt sich nichts importieren. Es wurde nichts geändert.',
      },
      recover: {
        lead_one: 'In dieser Datei steckt {{count}} übersprungenes Video.',
        lead_other: 'In dieser Datei stecken {{count}} übersprungene Videos.',
        none: 'In dieser Datei stecken keine übersprungenen Videos. Wähle die Datei aus dem früheren Import.',
        storage: 'Braucht {{needed}}, frei sind {{available}}.',
        noRoom:
          'Die Videos brauchen {{needed}}, frei sind {{available}}. Schafft Platz oder nutzt Pro, dann kannst du sie nachholen.',
        action_one: 'Video nachholen',
        action_other: '{{count}} Videos nachholen',
      },
    },
    skipped: {
      heading: 'Übersprungene Videos',
      lead_one:
        '{{count}} Video aus einem früheren Import fehlt noch ({{size}}).',
      lead_other:
        '{{count}} Videos aus einem früheren Import fehlen noch ({{size}}).',
      bodyPro:
        'Wähle dieselbe Datei noch einmal. eimir. fügt dann nur diese Videos dort ein, wo sie hingehören. Sonst ändert sich nichts.',
      bodyFree: 'Mit eimir. Pro kannst du sie aus derselben Datei nachholen.',
      recover: 'Videos nachholen',
      dismiss: 'Hinweis ausblenden',
      dismissTitle: 'Hinweis ausblenden?',
      dismissBody:
        'Danach lassen sich diese Videos nicht mehr nachholen. Eure Erinnerungen und die Datei bleiben, wie sie sind.',
      dismissConfirm: 'Ausblenden',
      dismissCancel: 'Abbrechen',
    },
    failure: {
      exportTooLarge: {
        title: 'Der Export ist zu groß',
        body: 'Eure Fotos und Videos passen nicht in eine einzelne Datei. Es wurde nichts geändert.',
      },
      exportFailed: {
        title: 'Der Export hat nicht geklappt',
        body: 'Er konnte nicht erstellt werden. Versuche es gleich noch einmal. Es wurde nichts geändert.',
      },
      exportGeneric: {
        title: 'Das hat nicht geklappt',
        body: 'Es wurde nichts geändert.',
      },
      exportExpired: {
        title: 'Die Datei ist abgelaufen',
        body: 'Erstelle den Export noch einmal.',
      },
      importTooLarge: {
        title: 'Die Datei ist zu groß',
        body: 'Eine so große Datei kann eimir. nicht auf einmal übernehmen. Es wurde nichts geändert.',
      },
      formatUnsupported: {
        title: 'Die Datei passt nicht zu dieser Version',
        body: 'Sie stammt aus einer anderen eimir.-Version. Es wurde nichts geändert.',
      },
      fileInvalid: {
        title: 'Die Datei ist nicht in Ordnung',
        body: 'Sie ist beschädigt oder unvollständig. Lade den Export noch einmal herunter und wähle ihn erneut aus. Es wurde nichts geändert.',
      },
      members: {
        title: 'Die Personen in der Datei passen nicht zu euch',
        body: 'Sie lassen sich euch nicht zuordnen. Es wurde nichts geändert.',
      },
      privacy: {
        title: 'Die Datei enthält Privates',
        body: 'Eine gemeinsame Datei darf nichts Privates enthalten. Es wurde nichts übernommen.',
      },
      importFailed: {
        title: 'Das hat nicht geklappt',
        body: 'Die Datei konnte nicht übernommen werden. Es wurde nichts geändert.',
      },
      importExpired: {
        title: 'Die geprüfte Datei ist abgelaufen',
        body: 'Wähle die Datei noch einmal aus, um sie zu übernehmen.',
      },
    },
  },
};

export default m5s6;
