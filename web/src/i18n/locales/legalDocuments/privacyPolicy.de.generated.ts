// Generated from legal/de/privacy-policy.md by scripts/generate-legal-documents.mjs. Do not edit.
import type { LegalDocument } from '../../../legal/legalDocument';

export const privacyPolicyDe: LegalDocument = {
  document: 'privacy-policy',
  locale: 'de-DE',
  version: '2026-11-06.draft-2',
  status: 'draft',
  title: 'Datenschutzhinweise für eimir.',
  placeholders: [
    'EFFECTIVE_DATE',
    'PROVIDER_NAME',
    'PROVIDER_ADDRESS',
    'IMPRINT_URL',
    'PRIVACY_CONTACT',
    'DATA_PROTECTION_OFFICER',
    'SPECIAL_CATEGORY_LEGAL_BASIS',
    'GEOCODING_PROVIDER',
    'MAIL_PROVIDER',
    'LOG_RETENTION',
    'BACKUP_RETENTION',
    'PAYMENT_PROVIDER',
    'HOSTING_PROVIDER',
    'PUSH_PROVIDER',
    'SERVER_LOCATION',
    'SUPERVISORY_AUTHORITY',
  ],
  blocks: [
    {
      kind: 'paragraph',
      content: [
        { kind: 'text', text: 'Fassung vom ' },
        { kind: 'placeholder', name: 'EFFECTIVE_DATE' },
      ],
    },
    {
      kind: 'heading',
      id: 'das-wichtigste-in-kurze',
      content: [{ kind: 'text', text: 'Das Wichtigste in Kürze' }],
    },
    {
      kind: 'paragraph',
      content: [
        {
          kind: 'text',
          text: 'Diese Übersicht soll dir den Einstieg erleichtern. Die Einzelheiten stehen in den Abschnitten darunter. Diese Hinweise informieren dich darüber, wie wir mit deinen Daten umgehen. Du musst ihnen nicht zustimmen.',
        },
      ],
    },
    {
      kind: 'list',
      ordered: false,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Wir verarbeiten deine Daten, um eimir. für dich und deinen Partner zu betreiben. Wir zeigen keine Werbung, verkaufen keine Daten, setzen keine Analyse- oder Tracking-Dienste ein und trainieren keine KI-Modelle mit euren Inhalten.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Was ihr „Für uns beide“ speichert, sieht dein Partner. Was du als „Nur für mich“ speicherst, siehst nur du.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Eure Inhalte speichern wir verschlüsselt. Das ist keine Ende-zu-Ende-Verschlüsselung: Damit eimir. funktioniert, kann unser System sie entschlüsseln. Wir sehen sie uns nicht an, außer in den wenigen Fällen, die wir in Abschnitt 5 nennen.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Was ihr festhaltet, kann sehr persönlich sein. Wir nutzen es nur, um eimir. für euch bereitzustellen.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Manche Funktionen nutzen Dienste anderer Anbieter, zum Beispiel Karten, Adresssuche oder Push-Benachrichtigungen. Was diese Anbieter dabei erfahren, erklären wir bei der jeweiligen Funktion.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Du kannst deine Daten jederzeit exportieren und dein Konto jederzeit löschen.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '1-wer-verantwortlich-ist',
      content: [{ kind: 'text', text: '1. Wer verantwortlich ist' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Verantwortlich für die Verarbeitung deiner personenbezogenen Daten in eimir. ist ',
            },
            { kind: 'placeholder', name: 'PROVIDER_NAME' },
            { kind: 'text', text: ', ' },
            { kind: 'placeholder', name: 'PROVIDER_ADDRESS' },
            {
              kind: 'text',
              text: ' („wir“). Die vollständigen Anbieterangaben findest du im Impressum unter ',
            },
            { kind: 'placeholder', name: 'IMPRINT_URL' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Für Fragen zum Datenschutz und um deine Rechte geltend zu machen, erreichst du uns unter ',
            },
            { kind: 'placeholder', name: 'PRIVACY_CONTACT' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Unseren Datenschutzbeauftragten erreichst du unter ',
            },
            { kind: 'placeholder', name: 'DATA_PROTECTION_OFFICER' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '2-wofur-diese-hinweise-gelten',
      content: [{ kind: 'text', text: '2. Wofür diese Hinweise gelten' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Diese Hinweise gelten für eimir. Cloud, den von uns betriebenen Online-Dienst eimir., den du über die Web-App und die offiziellen Apps nutzt. Sie gelten für alle, die eimir. Cloud nutzen, also für dich und deinen Partner gleichermaßen.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'eimir. kann auch auf einem eigenen Server betrieben werden („Self-Hosted“). Für eine solche Installation ist ihr Betreiber verantwortlich, nicht wir. Verbindest du eine offizielle App mit einer Installation, die nicht wir betreiben, gehen deine Daten an diese Installation und nicht an uns.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Lädst du eine offizielle App aus einem App-Store herunter, zum Beispiel bei Google Play, verarbeitet der Betreiber des Stores dabei Daten in eigener Verantwortung.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'eimir. Cloud ist für Erwachsene ab 18 Jahren bestimmt.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '3-dein-konto-und-deine-anmeldung',
      content: [{ kind: 'text', text: '3. Dein Konto und deine Anmeldung' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [{ kind: 'text', text: 'Für dein Konto verarbeiten wir:' }],
          children: [
            [
              {
                kind: 'text',
                text: 'deine E-Mail-Adresse und ob du sie bestätigt hast,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'deinen Anzeigenamen und, wenn du sie angibst, dein Profilbild und deinen Geburtstag,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'deine Einstellungen, zum Beispiel Sprache, Zeitzone, Ruhezeiten und Benachrichtigungen,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'welcher Fassung der Nutzungsbedingungen du wann zugestimmt hast und in welchem Schritt der Registrierung.',
              },
            ],
          ],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Du meldest dich mit einem Link an, den wir dir per E-Mail schicken, oder mit einem Passkey. Ein Anmeldelink gilt 15 Minuten, ein Link zur Bestätigung deiner Adresse 24 Stunden. Forderst du einen Link für ein neues Konto an und erstellst das Konto nicht, löschen wir deine Adresse in der Regel innerhalb von sechs Stunden nach Ablauf des Links.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Nutzt du einen Passkey, bleiben biometrische Daten wie dein Fingerabdruck oder dein Gesicht auf deinem Gerät. Wir speichern nur den öffentlichen Schlüssel des Passkeys, seine Kennung, eine Modellkennung des Geräts oder Passwortmanagers, der ihn verwaltet, den Namen, den du ihm gibst, und wann du ihn zuletzt verwendet hast.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Für jede Anmeldung legen wir eine Sitzung an und speichern dazu die Art der App, ihren Beginn und ihre letzte Nutzung. Zugangsschlüssel speichern wir nur als Prüfwerte. Eine Sitzung endet nach 60 Tagen ohne Nutzung, spätestens aber nach 180 Tagen. Danach meldest du dich neu an.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Wir verarbeiten diese Daten, um den Nutzungsvertrag mit dir zu erfüllen (Art. 6 Abs. 1 lit. b Datenschutz-Grundverordnung, DSGVO). Deine Zustimmung zu den Nutzungsbedingungen halten wir außerdem fest, um den Vertragsschluss belegen zu können (Art. 6 Abs. 1 lit. f DSGVO).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Deine E-Mail-Adresse brauchen wir, um dein Konto anzulegen und dich anzumelden. Ohne sie können wir dir kein Konto bereitstellen. Alle anderen Angaben sind freiwillig.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '4-euer-space-und-eure-inhalte',
      content: [{ kind: 'text', text: '4. Euer Space und eure Inhalte' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'In eurem Space haltet ihr eure gemeinsame Geschichte fest, zum Beispiel mit Erinnerungen, Herzmomenten, Meilensteinen, Wünschen, Plänen, Orten, Listen, Kommentaren, Reaktionen, Fotos, Videos und Sprachnachrichten. Wir speichern und verarbeiten diese Inhalte, um sie euch bereitzustellen, zwischen euren Geräten abzugleichen, sie durchsuchbar zu machen und die Funktionen anzubieten, die ihr nutzt, etwa Rückblicke (Art. 6 Abs. 1 lit. b DSGVO).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Was ihr „Für uns beide“ speichert, seht ihr beide. Gemeinsame Erinnerungen und ähnliche Inhalte kann dein Partner auch bearbeiten und im Datenexport herunterladen, auch wenn du sie erstellt hast.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Was du als „Nur für mich“ speicherst, zum Beispiel private Notizen, Geschenkideen oder private Herzmomente, siehst nur du. Diese Grenze setzen unsere Server durch, nicht nur die Anzeige in der App.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Dein Partner sieht außerdem deinen Anzeigenamen, dein Profilbild und die Angaben, die du in deinem Profil für deinen Partner hinterlegst. Während ihr eimir. nutzt, sieht dein Partner, ob du gerade oder vor Kurzem aktiv warst, aber keine Uhrzeit. Dafür speichern wir nur den Zeitpunkt deiner letzten Aktivität und überschreiben ihn laufend. Diese Anzeige beruht auf unserem und eurem berechtigten Interesse, dass ihr in eimir. merkt, wann der andere da ist (Art. 6 Abs. 1 lit. f DSGVO). Du kannst ihr widersprechen (Abschnitt 24).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Teilst du dein „Gefühl für heute“ oder deinen Akku, speichern wir diese Angaben nur für den aktuellen und den vorherigen Tag und löschen sie danach automatisch. Ob und wann dein Partner sie sieht, folgt den Einstellungen eures Space.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Fotos, Videos und Sprachnachrichten prüfen wir technisch, erzeugen Vorschaubilder und wandeln Videos und Sprachnachrichten in ein einheitliches Format um. Bei Fotos, die du einer Erinnerung oder einem Herzmoment hinzufügst, bleiben lesbare Metadaten in der Originaldatei erhalten, zum Beispiel Aufnahmezeit, Aufnahmeort und Gerätemodell. Wer das Foto sehen darf, kann es mit diesen Metadaten herunterladen. Das gilt auch, wenn du die automatische Ortszuordnung ausgeschaltet hast (Abschnitt 9). Aus allen anderen Fotos, etwa deinem Profilbild, sowie aus Vorschaubildern, Videos und Sprachnachrichten entfernen wir eingebettete Metadaten.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Eine Sprachnachricht nimmst du in eimir. auf, oder du übernimmst eine Audiodatei, in der Android-App auch über die Teilen-Funktion einer anderen App. Das Mikrofon nutzt eimir. nur, während du aufnimmst; dafür fragt dein Browser oder dein Gerät nach der Berechtigung. Sprachnachrichten schreiben wir nicht automatisch ab.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Verlässt du einen Space, löschen wir deine „Nur für mich“-Inhalte aus diesem Space. Gemeinsame Inhalte bleiben für deinen Partner erhalten, auch die, die du erstellt hast. Das beruht auf dem berechtigten Interesse deines Partners, eure gemeinsame Geschichte nicht einseitig zu verlieren (Art. 6 Abs. 1 lit. f DSGVO). Eigene gemeinsame Inhalte kannst du vor dem Verlassen löschen. Sollen andere gemeinsame Inhalte nicht bei deinem Partner bleiben, etwa Fotos von dir, schreib uns (Abschnitt 24). Verlässt auch dein Partner den Space, löschen wir ihn 30 Tage später mit allen Inhalten.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '5-wie-wir-eure-inhalte-schutzen',
      content: [{ kind: 'text', text: '5. Wie wir eure Inhalte schützen' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Die Verbindung zwischen deinem Gerät und unseren Servern ist verschlüsselt (TLS).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Eure Inhalte und alle gespeicherten Fotos, Videos und Sprachnachrichten legen wir zusätzlich verschlüsselt ab. Die Schlüssel verwahren wir getrennt von der Datenbank und vom Medienspeicher. Unverschlüsselt bleiben unter anderem Kennungen, Zeit- und Datumsangaben, die Sichtbarkeit sowie Dateityp und -größe, die unser System zum Zuordnen, Sortieren und Prüfen braucht, außerdem Anzeigenamen und E-Mail-Adressen.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Das ist keine Ende-zu-Ende-Verschlüsselung. Unser System entschlüsselt eure Inhalte, um sie euch anzuzeigen, sie zu durchsuchen und daraus zum Beispiel Rückblicke zu erstellen.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Wir sehen uns eure Inhalte nicht an. Unsere Verwaltungswerkzeuge zeigen nur Kontodaten wie Anzeigename, E-Mail-Adresse, Anmeldemethoden und die Zahl der Sitzungen, keine Inhalte. Auf Inhalte greifen wir nur zu, wenn du uns ausdrücklich darum bittest, wenn wir einem konkreten Hinweis auf einen Rechtsverstoß nachgehen oder wenn wir gesetzlich dazu verpflichtet sind.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '6-einmalnachrichten-nur-fur-dich',
      content: [{ kind: 'text', text: '6. Einmalnachrichten „Nur für dich“' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Mit eimir. Pro kannst du deinem Partner eine Einmalnachricht schicken: einen Text, ein Foto oder eine Sprachnachricht, die dein Partner einmal öffnen kann. Empfangen könnt ihr Einmalnachrichten nur, wenn ihr den Empfang selbst auf eurem Gerät einschaltet.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Schaltest du den Empfang ein, erzeugt eimir. auf deinem Gerät ein Schlüsselpaar. Der private Schlüssel bleibt auf deinem Gerät und lässt sich nicht aus eimir. exportieren; nur der öffentliche Schlüssel geht an uns. Eine Einmalnachricht wird schon auf dem sendenden Gerät für die Empfangsgeräte verschlüsselt, und auf unseren Servern liegt sie nur als verschlüsselter Umschlag. Das ist keine unabhängig geprüfte Ende-zu-Ende-Verschlüsselung: Die öffentlichen Schlüssel verteilen unsere Server, und Bildschirmfotos oder andere Kopien lassen sich nicht verhindern.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Fotos verkleinert eimir. schon auf dem sendenden Gerät und entfernt dabei eingebettete Metadaten.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Ungeöffnete Einmalnachrichten löschen wir nach 24 Stunden. Öffnet dein Partner eine Nachricht, löschen wir den Umschlag; die Ansicht endet mit dem Schließen, spätestens nach fünf Minuten. Du kannst eine Nachricht zurückziehen, und dein Partner kann sie ungeöffnet verwerfen. Schaltet einer von euch den Empfang aus, löschen wir alle ausstehenden Einmalnachrichten zwischen euch.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Einmalnachrichten sind nicht Teil des Datenexports. Sicherungen können den verschlüsselten Umschlag bis zum Ablauf ihrer Aufbewahrungsfrist enthalten. Benachrichtigungen dazu enthalten keine Inhalte, und per E-Mail benachrichtigen wir dich über Einmalnachrichten nicht.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO; für besonders schützenswerte Angaben gilt Abschnitt 7.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '7-besonders-schutzenswerte-angaben',
      content: [{ kind: 'text', text: '7. Besonders schützenswerte Angaben' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Was ihr in eimir. festhaltet, kann viel über euch verraten, zum Beispiel über eure Gesundheit, euer Sexualleben, eure sexuelle Orientierung oder eure religiöse Überzeugung. Das gilt auch indirekt: Schon dass ihr gemeinsam einen Space nutzt, kann etwas über eure sexuelle Orientierung verraten, und euer „Gefühl für heute“ oder euer Akku etwas über eure Gesundheit. Die DSGVO schützt solche Angaben besonders (Art. 9 DSGVO).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Wir verarbeiten sie nur, um eimir. für euch bereitzustellen, wie in diesen Hinweisen beschrieben. Wir durchsuchen eure Inhalte nicht gezielt nach solchen Angaben, leiten daraus keine Diagnosen, Bewertungen oder Persönlichkeitsmerkmale über euch ab und geben sie nicht für andere Zwecke weiter.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Rechtsgrundlage für die Verarbeitung solcher Angaben ist ',
            },
            { kind: 'placeholder', name: 'SPECIAL_CATEGORY_LEGAL_BASIS' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '8-angaben-uber-andere-menschen',
      content: [{ kind: 'text', text: '8. Angaben über andere Menschen' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'In euren Inhalten können andere Menschen vorkommen, etwa auf Fotos, in Texten oder unter „Menschen in eurem Leben“. Dort haltet ihr einen Namen, die Beziehung zu euch und, wenn ihr wollt, einen Geburtstag fest.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Wir verarbeiten diese Angaben nur, um sie euch in eimir. anzuzeigen. Rechtsgrundlage ist das berechtigte Interesse von euch und von uns, eure gemeinsame Geschichte in eimir. festzuhalten (Art. 6 Abs. 1 lit. f DSGVO). Wir nehmen keinen Kontakt zu diesen Menschen auf.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Bitte haltet nur fest, was ihr wirklich braucht, und achtet besonders bei Kindern auf ihre Privatsphäre.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Kommst du in Inhalten eines Paares vor, ohne selbst eimir. zu nutzen, erhalten wir deine Daten von diesem Paar. Deine Rechte aus den Abschnitten 23 und 24 kannst du auch bei uns geltend machen. Weil wir uns Inhalte sonst nicht ansehen, beschreib uns bitte, worum es geht.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '9-orte-karten-und-adresssuche',
      content: [{ kind: 'text', text: '9. Orte, Karten und Adresssuche' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Ihr könnt Orte speichern, auf einer Karte auswählen oder nach einer Adresse suchen. Gespeicherte Orte mit ihren Koordinaten gehören zu euren gemeinsamen Inhalten.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Enthält ein Foto, das du einem gemeinsamen Moment hinzufügst, einen Aufnahmeort, ordnen wir den Moment beim Speichern diesem Ort zu. Das ist voreingestellt. Du kannst es in den Einstellungen unter „Orte aus Fotos“ jederzeit ausschalten; bereits gespeicherte Orte bleiben dann erhalten. Private Herzmomente erzeugen keine gemeinsamen Orte. Rechtsgrundlage ist unser und euer berechtigtes Interesse, Momente ohne zusätzlichen Aufwand ihrem Ort zuzuordnen (Art. 6 Abs. 1 lit. f DSGVO). In der Android-App erhält eimir. den Aufnahmeort eines Fotos nur, wenn du das erlaubst, je nach Android-Version über eine Berechtigung oder in der Fotoauswahl deines Geräts (§ 25 Abs. 1 TDDDG). Erlaubst du es nicht, erhält eimir. deine Fotos aus der Android-App ohne Aufnahmeort.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Für die Adresssuche und um zu gespeicherten Koordinaten einen Ortsnamen und eine Adresse zu ermitteln, nutzen wir den Dienst Photon auf Grundlage von OpenStreetMap, betrieben von ',
            },
            { kind: 'placeholder', name: 'GEOCODING_PROVIDER' },
            {
              kind: 'text',
              text: '. Unser Server übermittelt dafür nur deinen Suchbegriff oder die Koordinaten und die eingestellte Sprache, keine Fotos, Kontodaten oder anderen Inhalte. Der Dienst sieht die IP-Adresse unseres Servers, nicht deine. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für die Suche und Art. 6 Abs. 1 lit. f DSGVO für Orte aus Fotos.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: "Öffnest du eine Karte, lädt eimir. die Kartenbilder direkt von den Servern der OpenStreetMap Foundation, St John's Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Vereinigtes Königreich. Sie erhält dabei deine IP-Adresse, technische Angaben zu deinem Browser oder Gerät, eimir. als aufrufende Seite und die Kartenausschnitte, die du ansiehst. Daraus lässt sich ungefähr ablesen, wo eure Orte liegen. Namen, Texte oder Fotos aus eimir. erhält sie nicht. Die OpenStreetMap Foundation verarbeitet diese Daten in eigener Verantwortung nach ihren ",
            },
            {
              kind: 'link',
              text: 'Datenschutzhinweisen',
              href: 'https://osmfoundation.org/wiki/Privacy_Policy',
            },
            {
              kind: 'text',
              text: '. Rechtsgrundlage ist unser berechtigtes Interesse, euch eure Orte auf einer Karte zu zeigen (Art. 6 Abs. 1 lit. f DSGVO).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Öffnest du einen Ort ausdrücklich in Google Maps, übergibt eimir. die Koordinaten an Google, aber keine Anmeldedaten. Ab dann gelten die Datenschutzhinweise von Google.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'eimir. fragt deinen aktuellen Standort nicht ab, verfolgt ihn nicht und erstellt keinen Bewegungsverlauf.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '10-fotos-aus-anderen-diensten',
      content: [{ kind: 'text', text: '10. Fotos aus anderen Diensten' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Du kannst deinen eigenen Immich-Server mit deinem Konto verbinden. Dafür gibst du die Adresse des Servers und einen API-Schlüssel an, den du dort angelegt hast. Beides speichern wir verschlüsselt und nur für dein Konto; dein Partner kann die Verbindung nicht nutzen. Unser Server ruft damit eine Übersicht deiner Fotos ab, damit du auswählen kannst, und kopiert nur die Fotos nach eimir., die du auswählst. Eine Auswahl verfällt nach zehn Minuten.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Trennst du die Verbindung oder löschst du dein Konto, löschen wir Adresse und Schlüssel. Bereits übernommene Fotos sind Kopien und bleiben in eimir. erhalten. Für deinen Immich-Server ist sein Betreiber verantwortlich, in der Regel du selbst.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Die Übernahme aus Google Fotos ist derzeit nicht verfügbar. Bieten wir sie an, gilt: Du meldest dich bei Google an und erlaubst eimir. nur, die Fotos zu lesen, die du in Google Fotos auswählst. Wir erhalten keinen dauerhaften Zugriff auf deine Mediathek. Für die Anmeldung setzen wir für höchstens zehn Minuten ein technisch notwendiges Cookie. Google verarbeitet die Daten deiner Anmeldung in eigener Verantwortung.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '11-automatische-vorschlage-und-lokale-ki',
      content: [
        { kind: 'text', text: '11. Automatische Vorschläge und lokale KI' },
      ],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Einige Funktionen formulieren Texte oder machen Vorschläge, zum Beispiel Titel und Einleitung eurer Rückblicke, Beobachtungen und Anregungen in „Eure Woche“ oder Schlagwörter für gemeinsame Erinnerungen. Soweit wir dafür ein KI-Sprachmodell einsetzen, läuft es in unserer eigenen Serverumgebung. Eure Inhalte gehen dafür nicht an externe KI-Anbieter.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Das Modell erhält nur gemeinsame Inhalte und nur die Ausschnitte, die für den jeweiligen Vorschlag nötig sind, niemals „Nur für mich“-Inhalte. Für „Eure Woche“ berechnen wir aus euren Einträgen für „Gefühl für heute“ und Akku einfache Beobachtungen, zum Beispiel ob sich eure Energie verändert hat. Das Modell erhält dafür keine Texte, Fotos, Namen oder Orte, sondern nur diese Beobachtungen, und wählt dazu passende Anregungen aus.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Wir trainieren keine KI-Modelle mit euren Inhalten und speichern Eingaben und Ergebnisse des Modells nicht in Protokollen. Vorschläge können trotzdem unzutreffend sein. Prüfe sie, bevor du sie übernimmst oder teilst.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Wir treffen keine Entscheidungen, die ausschließlich automatisiert zustande kommen und dir gegenüber rechtliche Wirkung entfalten oder dich in ähnlicher Weise erheblich beeinträchtigen (Art. 22 DSGVO).',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '12-benachrichtigungen-und-e-mails',
      content: [{ kind: 'text', text: '12. Benachrichtigungen und E-Mails' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Über neue Aktivitäten in eurem Space informieren wir dich in eimir.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Wir schicken dir E-Mails, die für dein Konto nötig sind, zum Beispiel Anmelde- und Bestätigungslinks. Benachrichtigungen per E-Mail bekommst du nur, wenn du sie in den Einstellungen einschaltest. Sie enthalten keine Inhalte aus eurem Space, nur den Hinweis, dass es etwas Neues gibt, und einen Link zu eimir. Für den Versand nutzen wir ',
            },
            { kind: 'placeholder', name: 'MAIL_PROVIDER' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Push-Benachrichtigungen gibt es in der Android-App. Sie sind aus, bis du sie in den Einstellungen einschaltest und dein Gerät sie erlaubt. Für die Zustellung nutzen wir Firebase Cloud Messaging von Google oder, wenn du ihn auf deinem Gerät eingerichtet hast, einen UnifiedPush-Dienst deiner Wahl. Der Zustelldienst erhält nur ein Wecksignal mit einer zufälligen Kennung, keine Inhalte, Namen oder Kontodaten. Die eigentliche Benachrichtigung holt die App danach direkt bei uns ab.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Bei Firebase Cloud Messaging erhält Google die Installationskennung der App (Firebase-Installations-ID), den Zeitpunkt der Zustellung und technische Verbindungsdaten, einschließlich deiner IP-Adresse. Schaltest du Push aus, meldest du dich ab oder löschst du dein Konto, beenden wir die Registrierung und lassen die Installationskennung löschen. Google löscht sie nach eigenen Angaben innerhalb von 180 Tagen auch aus seinen Sicherungen.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Die für Push nötigen Kennungen legen wir auf deinem Gerät ab, weil du diesen Dienst ausdrücklich nutzen möchtest (§ 25 Abs. 2 Nr. 2 TDDDG).',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '13-linkvorschauen',
      content: [{ kind: 'text', text: '13. Linkvorschauen' }],
    },
    {
      kind: 'paragraph',
      content: [
        {
          kind: 'text',
          text: 'Fügst du einen Link ein und lässt dir eine Vorschau anzeigen, ruft unser Server die verlinkte Seite auf und liest Titel und Beschreibung aus. Die verlinkte Website erfährt dabei die IP-Adresse unseres Servers, nicht deine. Die abgerufene Seite speichern wir nicht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.',
        },
      ],
    },
    {
      kind: 'heading',
      id: '14-datenexport',
      content: [{ kind: 'text', text: '14. Datenexport' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Du kannst deine Daten jederzeit kostenlos in den Einstellungen unter „Daten und Portabilität“ exportieren. Der gemeinsame Export enthält die gemeinsamen Inhalte eures Space, auch die deines Partners. Deine „Nur für mich“-Inhalte enthält nur dein persönlicher Export.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Wir erstellen die Exportdatei auf unseren Servern, halten sie 24 Stunden verschlüsselt zum Herunterladen bereit und löschen sie dann. Passkeys, Sitzungen, Zugangsschlüssel und Einmalnachrichten exportieren wir nicht. Hast du die Datei heruntergeladen, liegt sie in deiner Verantwortung.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO sowie dein Recht auf Datenübertragbarkeit (Art. 20 DSGVO).',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '15-speicherung-auf-deinem-gerat',
      content: [{ kind: 'text', text: '15. Speicherung auf deinem Gerät' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'eimir. legt Daten im Speicher deines Browsers oder der App ab, soweit das für die Funktionen nötig ist, die du nutzt (§ 25 Abs. 2 Nr. 2 TDDDG). Wir setzen keine Techniken ein, die dich für Werbung oder Analyse wiedererkennen. Ein Cookie setzen wir nur für die Anmeldung bei Google Fotos (Abschnitt 10).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Im Einzelnen legt eimir. auf deinem Gerät ab:',
            },
          ],
          children: [
            [
              {
                kind: 'text',
                text: 'deine Anmeldung, in der Web-App im Sitzungsspeicher des Browsers, bis du dich abmeldest oder den Tab schließt, und in der Android-App verschlüsselt mit einem Schlüssel aus dem Schlüsselspeicher deines Geräts,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'gemeinsame Inhalte, die du zuletzt angesehen hast, höchstens sieben Tage lang, damit eimir. schnell lädt und sie kurz auch ohne Verbindung lesbar bleiben; „Nur für mich“-Inhalte legt eimir. dort nicht ab,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'Fotos und Videos, die du zuletzt angesehen hast, höchstens sieben Tage lang,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'Entwürfe, die du noch nicht gespeichert hast, einschließlich ausgewählter Fotos, höchstens sieben Tage lang, damit nichts verloren geht,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'für Einmalnachrichten den privaten Schlüssel dieses Geräts, bis du den Empfang ausschaltest oder die Daten im Browser oder in der App löschst; geöffnete Einmalnachrichten hält eimir. nur im Arbeitsspeicher, solange du sie ansiehst,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'Einstellungen wie das helle oder dunkle Design und kleine Merker, etwa dass du einen Hinweis ausgeblendet hast,',
              },
            ],
            [
              {
                kind: 'text',
                text: 'die Programmdateien der Web-App und eine Offline-Seite, damit eimir. wie eine App startet; persönliche Daten sind darin nicht enthalten.',
              },
            ],
          ],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Diese Daten liegen im Browser nicht zusätzlich verschlüsselt. Meldest du dich ab, löscht eimir. deine Anmeldung, zwischengespeicherte Inhalte, Fotos und Entwürfe. Du kannst sie außerdem jederzeit in den Einstellungen deines Browsers oder Geräts löschen. Die Android-App nimmt ihre Daten von den automatischen Sicherungen deines Geräts aus.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '16-protokolle-missbrauchsschutz-und-sicherungen',
      content: [
        {
          kind: 'text',
          text: '16. Protokolle, Missbrauchsschutz und Sicherungen',
        },
      ],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Bei jedem Aufruf von eimir. fallen technische Daten an, zum Beispiel deine IP-Adresse, der Zeitpunkt, die aufgerufene Adresse, der Statuscode und Angaben zu deinem Browser. Unsere Server und die vorgelagerte Infrastruktur unseres Hosting-Anbieters verarbeiten sie, um eimir. auszuliefern, und halten einen Teil davon in Protokollen fest. Das Protokoll unserer Anwendung enthält nur Zeitpunkt, Art und Adresse der Anfrage, den Statuscode und die Dauer, ohne IP-Adresse und ohne Inhalte. Die Adresse kann technische Kennungen enthalten, etwa die eures Space. Protokolle löschen wir nach ',
            },
            { kind: 'placeholder', name: 'LOG_RETENTION' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Um Anmeldung und Registrierung vor Missbrauch zu schützen, begrenzen wir die Zahl der Versuche. Dafür speichern wir einen Prüfwert deiner E-Mail-Adresse oder deiner IP-Adresse, bei IPv6 deines Netzbereichs, mit dem Zeitpunkt des Versuchs und löschen ihn nach einem Tag.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Wir sichern Datenbank und Medien regelmäßig, damit nach einem technischen Fehler nichts verloren geht. Die Sicherungen enthalten eure Inhalte in verschlüsselter Form und werden nach ',
            },
            { kind: 'placeholder', name: 'BACKUP_RETENTION' },
            {
              kind: 'text',
              text: ' gelöscht. Müssen wir eine Sicherung zurückspielen, löschen wir alle Konten, deren Löschung seitdem veranlasst wurde, erneut, bevor eimir. wieder erreichbar ist. Dafür führen wir ein Löschprotokoll mit der Kennung des Kontos und dem Zeitpunkt der Löschung, ohne E-Mail-Adresse und ohne Inhalte, so lange, wie ältere Sicherungen bestehen können.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren, stabilen und vor Missbrauch geschützten Dienst (Art. 6 Abs. 1 lit. f DSGVO).',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '17-kein-tracking-keine-werbung',
      content: [{ kind: 'text', text: '17. Kein Tracking, keine Werbung' }],
    },
    {
      kind: 'paragraph',
      content: [
        {
          kind: 'text',
          text: 'Wir setzen in eimir. keine Analyse-, Tracking- oder Werbedienste ein, weder in der Web-App noch in den Apps. Die Android-App enthält keine Bibliotheken für Analyse, Werbung oder Absturzberichte. Wir verkaufen keine Daten und geben sie nicht für Werbung weiter.',
        },
      ],
    },
    {
      kind: 'heading',
      id: '18-eimir-pro-und-zahlungen',
      content: [{ kind: 'text', text: '18. eimir. Pro und Zahlungen' }],
    },
    {
      kind: 'paragraph',
      content: [
        {
          kind: 'text',
          text: 'eimir. Pro kann derzeit noch nicht gekauft werden. Sobald das möglich ist, gilt:',
        },
      ],
    },
    {
      kind: 'list',
      ordered: false,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Für den Kauf verarbeiten wir, wer Pro für welchen Space gekauft hat, Laufzeit, Status und Rechnungsangaben.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'text', text: 'Die Zahlung wickelt ' },
            { kind: 'placeholder', name: 'PAYMENT_PROVIDER' },
            {
              kind: 'text',
              text: ' ab. Zahlungsdaten wie Kartennummern speichern wir nicht selbst. Kaufst du in einem App-Store, verarbeitet dessen Betreiber die Zahlung in eigener Verantwortung.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Dein Partner sieht, dass Pro für euren Space aktiv ist, aber keine Zahlungsangaben.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Rechnungsdaten bewahren wir auf, solange handels- und steuerrechtliche Pflichten es verlangen, für Rechnungen derzeit acht Jahre, für bestimmte Buchungsunterlagen bis zu zehn Jahre (Art. 6 Abs. 1 lit. c DSGVO).',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '19-wenn-du-uns-schreibst',
      content: [{ kind: 'text', text: '19. Wenn du uns schreibst' }],
    },
    {
      kind: 'paragraph',
      content: [
        {
          kind: 'text',
          text: 'Schreibst du uns, verarbeiten wir deine Nachricht und deine Kontaktdaten, um dir zu antworten (Art. 6 Abs. 1 lit. b oder lit. f DSGVO). Meldest du uns einen rechtswidrigen Inhalt, verarbeiten wir deine Angaben, um den Hinweis zu prüfen (Art. 6 Abs. 1 lit. c DSGVO in Verbindung mit Art. 16 der Verordnung (EU) 2022/2065). Bittest du uns, dafür in deine Inhalte zu sehen, tun wir das nur im nötigen Umfang. Wir löschen deine Nachricht, wenn wir sie nicht mehr brauchen und keine gesetzliche Pflicht entgegensteht.',
        },
      ],
    },
    {
      kind: 'heading',
      id: '20-wer-deine-daten-erhalt',
      content: [{ kind: 'text', text: '20. Wer deine Daten erhält' }],
    },
    {
      kind: 'paragraph',
      content: [{ kind: 'text', text: 'Deine Daten erhalten nur:' }],
    },
    {
      kind: 'list',
      ordered: false,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'dein Partner, soweit ihr Inhalte teilt (Abschnitt 4),',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'unsere Dienstleister, die in unserem Auftrag und nach unseren Weisungen handeln (Art. 28 DSGVO): ',
            },
            { kind: 'placeholder', name: 'HOSTING_PROVIDER' },
            {
              kind: 'text',
              text: ' für Server, Datenbank, Speicher und Sicherungen, ',
            },
            { kind: 'placeholder', name: 'MAIL_PROVIDER' },
            { kind: 'text', text: ' für den E-Mail-Versand und ' },
            { kind: 'placeholder', name: 'PUSH_PROVIDER' },
            {
              kind: 'text',
              text: ' für die Zustellung von Push-Benachrichtigungen über Firebase Cloud Messaging (Abschnitt 12),',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'placeholder', name: 'GEOCODING_PROVIDER' },
            {
              kind: 'text',
              text: ' für Adresssuche und Ortsnamen (Abschnitt 9),',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'die OpenStreetMap Foundation, wenn du eine Karte öffnest (Abschnitt 9),',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Dienste, die du selbst verbindest oder aufrufst, etwa dein Immich-Server, ein UnifiedPush-Dienst, Google Fotos, Google Maps oder eine verlinkte Website (Abschnitte 9, 10, 12 und 13),',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'placeholder', name: 'PAYMENT_PROVIDER' },
            {
              kind: 'text',
              text: ', sobald du eimir. Pro kaufen kannst (Abschnitt 18),',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Behörden und Gerichte, wenn wir gesetzlich dazu verpflichtet sind (Art. 6 Abs. 1 lit. c DSGVO).',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '21-ubermittlung-in-lander-ausserhalb-der-eu',
      content: [
        { kind: 'text', text: '21. Übermittlung in Länder außerhalb der EU' },
      ],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            { kind: 'text', text: 'Unsere Server stehen in ' },
            { kind: 'placeholder', name: 'SERVER_LOCATION' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Google kann die Daten für Push-Benachrichtigungen auch in den USA verarbeiten. Für Unternehmen in den USA, die nach dem EU-U.S. Data Privacy Framework zertifiziert sind, hat die EU-Kommission ein angemessenes Datenschutzniveau festgestellt (Art. 45 DSGVO). Google LLC ist danach zertifiziert.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Die OpenStreetMap Foundation hat ihren Sitz im Vereinigten Königreich. Auch für das Vereinigte Königreich hat die EU-Kommission ein angemessenes Datenschutzniveau festgestellt (Art. 45 DSGVO).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Für Dienste, die du selbst verbindest oder aufrufst, etwa deinen Immich-Server, Google Fotos oder Google Maps, gelten deren Standorte und Datenschutzhinweise.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '22-wie-lange-wir-daten-speichern',
      content: [{ kind: 'text', text: '22. Wie lange wir Daten speichern' }],
    },
    {
      kind: 'paragraph',
      content: [
        {
          kind: 'text',
          text: 'Wir speichern deine Daten nur so lange, wie wir sie für die beschriebenen Zwecke brauchen oder gesetzlich aufbewahren müssen. Im Einzelnen:',
        },
      ],
    },
    {
      kind: 'list',
      ordered: false,
      items: [
        {
          content: [
            { kind: 'strong', text: 'Konto und Profil:' },
            {
              kind: 'text',
              text: ' bis du dein Konto löschst. Dann löschen wir sofort deine E-Mail-Adresse, Passkeys, Sitzungen, dein Profil, deine Zustimmung zu den Nutzungsbedingungen und deine „Nur für mich“-Inhalte.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Gemeinsame Inhalte:' },
            {
              kind: 'text',
              text: ' bis ihr sie löscht. Löschst du dein Konto, bleiben sie für deinen Partner erhalten; du erscheinst dort nur noch als ehemaliges Mitglied. Haben beide den Space verlassen, löschen wir ihn nach 30 Tagen mit allen Inhalten.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Einzelne Inhalte, die ihr löscht:' },
            {
              kind: 'text',
              text: ' sofort aus eimir.; Kopien in Sicherungen mit deren Ablauf.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Einmalnachrichten:' },
            {
              kind: 'text',
              text: ' ungeöffnet 24 Stunden, nach dem Öffnen sofort.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: '„Gefühl für heute“ und Akku:' },
            { kind: 'text', text: ' bis zum Ende des folgenden Tages.' },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Sitzungen:' },
            {
              kind: 'text',
              text: ' bis zu 60 Tage ohne Nutzung, höchstens 180 Tage.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Links:' },
            {
              kind: 'text',
              text: ' Anmeldelinks 15 Minuten, Links zur Bestätigung deiner Adresse 24 Stunden, Einladungen für deinen Partner 14 Tage.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Missbrauchsschutz:' },
            { kind: 'text', text: ' ein Tag.' },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Exportdateien:' },
            { kind: 'text', text: ' 24 Stunden.' },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Auswahl aus anderen Fotodiensten:' },
            { kind: 'text', text: ' zehn Minuten.' },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'strong',
              text: 'Zwischengespeicherte Inhalte, Fotos und Entwürfe auf deinem Gerät:',
            },
            {
              kind: 'text',
              text: ' höchstens sieben Tage, beim Abmelden sofort. Einstellungen und Merker bleiben, bis du sie im Browser oder in der App löschst.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Protokolle:' },
            { kind: 'text', text: ' ' },
            { kind: 'placeholder', name: 'LOG_RETENTION' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Sicherungen:' },
            { kind: 'text', text: ' ' },
            { kind: 'placeholder', name: 'BACKUP_RETENTION' },
            {
              kind: 'text',
              text: '; das Löschprotokoll so lange, wie ältere Sicherungen bestehen können.',
            },
          ],
          children: [],
        },
        {
          content: [
            { kind: 'strong', text: 'Rechnungsdaten für eimir. Pro:' },
            {
              kind: 'text',
              text: ' so lange, wie gesetzliche Aufbewahrungspflichten bestehen.',
            },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '23-deine-rechte',
      content: [{ kind: 'text', text: '23. Deine Rechte' }],
    },
    {
      kind: 'list',
      ordered: true,
      items: [
        {
          content: [
            {
              kind: 'text',
              text: 'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO) und Datenübertragbarkeit (Art. 20 DSGVO). Hast du in eine Verarbeitung eingewilligt, kannst du die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Vieles kannst du direkt in eimir. erledigen: dein Profil und deine Einstellungen ändern, Inhalte löschen, deine Daten unter „Daten und Portabilität“ exportieren und dein Konto unter „App und Konto“ löschen. Für alles andere schreib uns an ',
            },
            { kind: 'placeholder', name: 'PRIVACY_CONTACT' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Gemeinsame Inhalte gehören zu eurer gemeinsamen Geschichte. Betrifft dein Anliegen auch Daten deines Partners, berücksichtigen wir auch dessen Rechte.',
            },
          ],
          children: [],
        },
        {
          content: [
            {
              kind: 'text',
              text: 'Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), insbesondere in dem Mitgliedstaat der EU, in dem du lebst oder arbeitest oder in dem der mutmaßliche Verstoß stattgefunden hat. Für uns zuständig ist ',
            },
            { kind: 'placeholder', name: 'SUPERVISORY_AUTHORITY' },
            { kind: 'text', text: '.' },
          ],
          children: [],
        },
      ],
    },
    {
      kind: 'heading',
      id: '24-dein-widerspruchsrecht',
      content: [{ kind: 'text', text: '24. Dein Widerspruchsrecht' }],
    },
    {
      kind: 'paragraph',
      content: [
        {
          kind: 'strong',
          text: 'Verarbeiten wir Daten auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO), kannst du dieser Verarbeitung jederzeit aus Gründen widersprechen, die sich aus deiner besonderen Situation ergeben (Art. 21 DSGVO).',
        },
        {
          kind: 'text',
          text: ' Wir verarbeiten die Daten dann nicht mehr, es sei denn, wir können zwingende schutzwürdige Gründe nachweisen, die deine Interessen, Rechte und Freiheiten überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen. Das betrifft zum Beispiel die Anzeige, ob du gerade aktiv bist, die Zuordnung von Orten aus Fotos, das Laden von Karten und gemeinsame Inhalte, die nach deinem Verlassen für deinen Partner erhalten bleiben. Die automatische Zuordnung von Orten aus Fotos kannst du jederzeit selbst in den Einstellungen ausschalten. Für deinen Widerspruch genügt eine Nachricht an ',
        },
        { kind: 'placeholder', name: 'PRIVACY_CONTACT' },
        { kind: 'text', text: '.' },
      ],
    },
    {
      kind: 'heading',
      id: '25-anderungen-dieser-hinweise',
      content: [{ kind: 'text', text: '25. Änderungen dieser Hinweise' }],
    },
    {
      kind: 'paragraph',
      content: [
        {
          kind: 'text',
          text: 'Wir passen diese Hinweise an, wenn sich eimir. oder die Rechtslage ändert. Die aktuelle Fassung findest du jederzeit in eimir. Über wesentliche Änderungen informieren wir dich rechtzeitig vorher, zum Beispiel per E-Mail oder in der App.',
        },
      ],
    },
  ],
};
