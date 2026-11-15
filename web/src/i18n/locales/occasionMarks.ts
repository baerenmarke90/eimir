/**
 * #1907 F2: a quiet line on a memory that happened on one of the couple's
 * occasions. German ordinals only need the `other` category; `one` is
 * present because the pack check expects every cardinal category per group.
 */
const occasionMarks = {
  anniversary_ordinal_one: 'An eurem {{count}}. Jahrestag',
  anniversary_ordinal_other: 'An eurem {{count}}. Jahrestag',
  relationshipStart: 'Am Tag, an dem alles begann',
  ownBirthday: 'An deinem Geburtstag',
  partnerBirthday: 'Am Geburtstag von {{name}}',
  more_one: 'und ein weiterer Anlass',
  more_other: 'und {{count}} weitere Anlässe',
};

export default occasionMarks;
