const motionSettings = {
  hapticsSettings: {
    title: 'Bedienung',
    label: 'Haptisches Feedback',
    hint: 'Eine leichte Vibration beim Wischen, Ablegen und Senden. Gilt nur für dieses Gerät.',
  },
  systemColors: {
    title: 'Systemfarben (Beta)',
    label: 'Systemfarben (Material You, Beta)',
    hint: 'Buttons und Akzente nehmen die Farben deines Android-Hintergrunds an. Sie ersetzen Eure Farben und die Designfarben. Flächen und Hintergründe bleiben unverändert. Gilt nur für dieses Gerät.',
    overrides:
      'Deine Systemfarben ersetzen diese Farben gerade. Wenn du hier etwas änderst und speicherst, werden die Systemfarben ausgeschaltet.',
    unsuitable:
      'Die Systemfarben deines Geräts sind für eimir. nicht kontrastreich genug und werden nicht verwendet.',
  },
};

export default motionSettings;
