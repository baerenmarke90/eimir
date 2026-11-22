/** Cloud storage per Space (#2141 Q5): the Data page section and refused uploads. */
const storageQuota = {
  heading: 'Speicher',
  used: '{{used}} von {{quota}} belegt',
  counts:
    'Fotos, Videos, Sprachnachrichten und PDFs zählen. Vorschaubilder und dein Profilbild zählen nicht.',
  free: 'Noch {{available}} frei.',
  proIncluded: 'Mit eimir. Pro habt ihr {{quota}}.',
  almostFull: {
    title: 'Bald ist euer Speicher voll',
    body: 'Danach lassen sich keine neuen Fotos oder Videos mehr hinzufügen. Alles, was ihr schon habt, bleibt.',
  },
  full: {
    title: 'Euer Speicher ist voll',
    body: 'Neue Fotos, Videos, Sprachnachrichten und PDFs lassen sich erst wieder hinzufügen, wenn ihr Platz schafft oder Pro nutzt. Alles Bestehende bleibt erhalten und lässt sich weiter ansehen, bearbeiten und exportieren.',
    bodyPro:
      'Neue Fotos, Videos, Sprachnachrichten und PDFs lassen sich erst wieder hinzufügen, wenn ihr Platz schafft. Alles Bestehende bleibt erhalten und lässt sich weiter ansehen, bearbeiten und exportieren.',
  },
  viewMedia: 'Fotos und Videos ansehen',
  morePro: 'Mehr Platz mit eimir. Pro',
  uploadRefused:
    'Das passt nicht mehr in euren Speicher. Schafft Platz oder nutzt Pro, dann kannst du es noch einmal hinzufügen.',
};

export default storageQuota;
