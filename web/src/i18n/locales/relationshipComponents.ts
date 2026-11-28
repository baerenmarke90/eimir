const relationshipComponents = {
  partnerAvatarConnected: '{{user}} und {{partner}}',
  partnerAvatarWaiting: '{{user}} (Wartet auf Partner)',
  partnerAvatarInvite: 'Partner einladen',

  couplePresenceActive: 'Gerade hier',
  couplePresenceRecent: 'Vor Kurzem hier',
  couplePresencePartnerActive: '{{name}} ist gerade hier',
  couplePresencePartnerRecent: '{{name}} war vor Kurzem hier',
  couplePresenceWaiting: 'Wartet auf Partner',
  couplePresenceDurationAction: 'Beziehungsdetails ansehen',
  couplePresenceYouFallback: 'Du',
  couplePresencePartnerFallback: 'Dein Partner',
  formerMemberLabel: 'Ehemaliges Mitglied',

  partnerQuickActions: {
    trigger: 'Aktionen für {{partner}} öffnen',
    title: 'Für {{partner}}',
    thinking: 'Ich denke an dich',
    kiss: 'Kuss schicken',
    checkIn: 'Wie geht’s dir?',
    pro: 'Pro',
    premiumHint: 'Mit eimir. Pro verfügbar.',
    premiumAction: 'eimir. Pro ansehen',
    loadingPremium: 'Pro-Aktionen werden geprüft …',
    unavailablePremium: 'Pro-Aktionen konnten gerade nicht geprüft werden.',
    retryPremium: 'Erneut prüfen',
    sendingThinking: 'Dein Gruß wird gesendet …',
    sendingKiss: 'Dein Kuss wird gesendet …',
    sendingCheckIn: 'Dein Check-in wird gesendet …',
    offline:
      'Keine Verbindung. Bitte versuche es noch einmal. Wir senden später nicht automatisch.',
    sentThinking: 'Dein Gruß ist unterwegs.',
    sentKiss: 'Dein Kuss ist unterwegs.',
    sentCheckIn: 'Dein Check-in ist unterwegs.',
    cooldown: 'Später wieder möglich.',
    sendError:
      'Das Senden konnte nicht bestätigt werden. Bitte versuche es noch einmal.',
  },

  partnerGestureReceipt: {
    label: 'Geste von {{name}}',
    labelAnon: 'Geste von deinem Partner',
    thinking: {
      title: '{{name}} denkt gerade an dich',
      titleAnon: 'Jemand denkt gerade an dich',
      detail: 'Ein kleiner Gruß nur für dich.',
      reply: 'Zurückschicken',
    },
    kiss: {
      title: 'Ein Kuss von {{name}}',
      titleAnon: 'Ein Kuss für dich',
      detail: 'Für dich.',
      reply: 'Kuss zurückschicken',
    },
    checkIn: {
      title: '{{name}} möchte wissen, wie es dir geht',
      titleAnon: 'Dein Partner möchte wissen, wie es dir geht',
      detail: 'Nur wenn du magst.',
      reply: 'Gefühl teilen',
    },
  },

  visibilityShared: 'Mit Partner geteilt',
  visibilityPrivate: 'Nur für mich',
  visibilityTemporary: 'Zeitlich geteilt',
} as const;

export default relationshipComponents;
