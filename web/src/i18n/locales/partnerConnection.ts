const partnerConnection = {
  eyebrow: 'Partner verbinden',
  title: 'Partner einladen',
  intro:
    'Erstelle einen Einladungslink für genau diesen gemeinsamen Bereich. Sobald dein Partner die Einladung annimmt, wird die Verbindung serverseitig hergestellt.',
  checking: 'Partner-Verbindung wird geprüft …',
  create: 'Einladungslink erstellen',
  creating: 'Einladungslink wird erstellt …',
  refresh: 'Verbindung prüfen',
  refreshing: 'Verbindung wird geprüft …',
  refreshHelp:
    'Hat dein Partner die Einladung bereits angenommen, aktualisiert diese Prüfung den Verbindungsstatus.',
  issuedTitle: 'Einladung wurde erstellt',
  issuedBody:
    'Der geheime Link wird nur jetzt angezeigt. Teile ihn ausschließlich mit deinem Partner; bestehende Einladungen werden später bewusst ohne Token angezeigt.',
  linkLabel: 'Einladungslink',
  copy: 'Link kopieren',
  copied: 'Einladungslink wurde kopiert.',
  copyFailed:
    'Automatisches Kopieren ist hier nicht verfügbar. Markiere den Link und kopiere ihn manuell.',
  hide: 'Link ausblenden',
  loading: 'Offene Einladungen werden geladen …',
  openTitle: 'Offene Einladungen',
  openIntro:
    'Aus Sicherheitsgründen werden bereits ausgestellte Einladungen ohne ihren geheimen Token angezeigt.',
  openEmptyTitle: 'Keine offene Einladung',
  openEmptyBody:
    'Erstelle einen neuen Einladungslink, wenn dein Partner diesem Bereich beitreten soll.',
  invitationLabel: 'Offene Einladung',
  createdAt: 'Erstellt: {{date}}',
  expiresAt: 'Gültig bis: {{date}}',
  revoke: 'Einladung widerrufen',
  revoking: 'Wird widerrufen …',
} as const;

export default partnerConnection;
