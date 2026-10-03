export interface TrainingZoneInfo {
  code: 'GA1' | 'GA2' | 'SA';
  name: string;
  intensityPercent: string;
  description: string;
  heartRateGuide: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
}

export const TRAINING_ZONES: Record<'GA1' | 'GA2' | 'SA', TrainingZoneInfo> = {
  GA1: {
    code: 'GA1',
    name: 'Grundlagenausdauer 1',
    intensityPercent: '50 - 60%',
    description: 'Extensives Ausdauertraining zur Fettstoffwechsel- und Kapillarisierungsförderung. Lockeres bis zügiges Dauertempo.',
    heartRateGuide: 'ca. 120 - 140 bpm (aerob)',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    badgeBg: 'bg-emerald-100 text-emerald-800'
  },
  GA2: {
    code: 'GA2',
    name: 'Grundlagenausdauer 2',
    intensityPercent: '75 - 85%',
    description: 'Intensives Ausdauertraining an der anaeroben Schwelle zur Steigerung der wettkampfspezifischen Ermüdungswiderstandsfähigkeit.',
    heartRateGuide: 'ca. 150 - 170 bpm (aerob-anaerober Übergang)',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    badgeBg: 'bg-blue-100 text-blue-800'
  },
  SA: {
    code: 'SA',
    name: 'Schnelligkeitsausdauer',
    intensityPercent: '90 - 100%',
    description: 'Maximale bis submaximale Intervalle und Sprints zur Ausbildung der Laktattoleranz, Startsprungkraft und Prüfungsschnelligkeit.',
    heartRateGuide: 'ca. 175 - 195+ bpm (maximal / anaerob-laktazid)',
    color: 'text-rose-700',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    badgeBg: 'bg-rose-100 text-rose-800'
  }
};

export interface WarmupOption {
  id: string;
  key: string;
  title: string;
  distance: number;
  items: string[];
}

export interface TrainingWeekPlan {
  week: number;
  phase: string;
  title: string;
  trainingZone: 'GA1' | 'GA2' | 'SA';
  mainSetDistance: number;
  estimatedTotalDistance: number; // 200m ein + 400m technik + 200m tauchen + mainSet + 200m aus
  summary: string;
  mainSet: {
    series: string; // e.g. "4x300m"
    intensity: string; // e.g. "50-60%"
    pause: string; // e.g. "Pause 20sec"
    exercises: string[];
    tips?: string[];
  };
}

export const COMMON_EINSCHWIMMPROGRAMM = {
  step1: {
    number: '1',
    title: 'Einschwimmen',
    distance: 200,
    text: '200m beliebig einschwimmen (GSA locker zur Erwärmung)'
  },
  step2Options: [
    {
      id: '2a',
      key: '2a',
      title: '2a. 8x50m Mini Lagen (400m)',
      distance: 400,
      description: '8x50m Lagenreihenfolge (Delfin/Rücken, Rücken/Brust, Brust/Kraul etc.)'
    },
    {
      id: '2b',
      key: '2b',
      title: '2b. 8x50m Technische Übungen (400m)',
      distance: 400,
      description: 'Beliebige Lagen (Wechselzüge, Antriebsübungen, Kontraste etc.)'
    },
    {
      id: '2c',
      key: '2c',
      title: '2c. 4x100m Kraul Technische Übungen (400m)',
      distance: 400,
      description: 'Je 100m aufgeteilt in 4x25m Schwerpunkte:',
      drills: [
        '25m Wechselzug (Aufholkraul / Einerzug)',
        '25m Fingerspitzen übers Wasser (hoher Ellenbogen)',
        '25m Faust (Wassergefühl / Handflächenkontrast)',
        '25m GSA (Gesamtschwimmart sauber)'
      ]
    }
  ],
  step3: {
    number: '3',
    title: '8x25m Tauchserie mit Vorbelastung (200m)',
    distance: 200,
    text: 'Streckentauchen unter Vorbelastung: Abtauchen an Beckenwand, nach dem Auftauchen 2x einatmen, dann Streckentauchen (8x25m, Pause: je 15 sec).'
  },
  step5: {
    number: '5',
    title: 'Ausschwimmen',
    distance: 200,
    text: '200m ausschwimmen (locker, Regeneration und Laktatabbau)'
  }
};

export const TRAINING_PLAN_WEEKS: TrainingWeekPlan[] = [
  {
    week: 1,
    phase: 'Grundlagenaufbau & Technik',
    title: 'Woche 1: Grundlagenausdauer & Wechselzüge (GA1)',
    trainingZone: 'GA1',
    mainSetDistance: 1200,
    estimatedTotalDistance: 2200,
    summary: '4x300m GA1 mit Lagenwechseln, Brustgleitphase, Kraulbeinen und Kleidung',
    mainSet: {
      series: '4x300m',
      intensity: '50 - 60%',
      pause: 'Pause 20 sec',
      exercises: [
        '1. Durchgang (300m): 50m Rücken, 50m Kraul im Wechsel',
        '2. Durchgang (300m): Brust gleiten (lange Gleitphasen nach jedem Beinstoß)',
        '3. Durchgang (300m): 50m Kraulbeine, 50m Kraul GSA im Wechsel',
        '4. Durchgang (300m): Kraul mit Kleidung (Gewöhnung an den Wasserwiderstand)'
      ],
      tips: [
        'Gleichmäßiges, ökonomisches Tempo anschlagen (Puls ca. 120-135 bpm).',
        'Beim Kleiderschwimmen auf eine ruhige Wasserlage achten.'
      ]
    }
  },
  {
    week: 2,
    phase: 'Grundlagenaufbau & Technik',
    title: 'Woche 2: Kraul-Schwerpunkt & Kraftausdauer (GA2)',
    trainingZone: 'GA2',
    mainSetDistance: 1600,
    estimatedTotalDistance: 2600,
    summary: '8x200m Kraul (80%) mit Beine/Brett, Arme/Pullbuoy und GSA',
    mainSet: {
      series: '8x200m Kraul',
      intensity: '80%',
      pause: 'Pause 30 sec',
      exercises: [
        'Jeder 200m-Block unterteilt in:',
        '• 50m Beine mit Brett (kräftiger Abdruck aus der Hüfte)',
        '• 50m Arme mit Pullbuoy (saubere Unterwasser-Zugphase & Druckphase)',
        '• 100m GSA (Gesamtschwimmart mit hoher Körperspannung)'
      ],
      tips: [
        'Konstante Intervallzeiten halten über alle 8 Wiederholungen.',
        'Pullbuoy hilft, die hohe Wasserlage und den Armzug isoliert zu trainieren.'
      ]
    }
  },
  {
    week: 3,
    phase: 'Rettungsschwimm-Spezifik',
    title: 'Woche 3: Rettungsspezifische Serie & Delphin (GA2)',
    trainingZone: 'GA2',
    mainSetDistance: 1200,
    estimatedTotalDistance: 2200,
    summary: '8x150m (80%) mit Brust, Delphin-Übungsreihe 3 und Puppenschleppen',
    mainSet: {
      series: '8x150m',
      intensity: '80%',
      pause: 'Pause 60 sec',
      exercises: [
        'Jeder 150m-Block unterteilt in:',
        '• 50m Brust (kraftvoll mit sauberer Schwunggrätsche)',
        '• 50m Delfin Übungsreihe 3 (Kombinationsbewegungen / Delphinbewegung)',
        '• 50m Abschleppen mit Puppe (realistische Rettungslast)'
      ],
      tips: [
        '60 Sekunden Pause bewusst nutzen, um vor dem Schleppen durchzuatmen.',
        'Beim Schleppen der Puppe Kopf über Wasser halten und korrekten Schleppgriff anwenden.'
      ]
    }
  },
  {
    week: 4,
    phase: 'Ausdauer & Kleiderschwimmen',
    title: 'Woche 4: Kleiderschwimmen & Extensive Ausdauer (GA1)',
    trainingZone: 'GA1',
    mainSetDistance: 1200,
    estimatedTotalDistance: 2200,
    summary: '3x400m (50%) Kleiderschwimmen in beliebigen Lagen',
    mainSet: {
      series: '3x400m',
      intensity: '50%',
      pause: 'Pause 15 sec',
      exercises: [
        '3x400m in vollständiger Sportkleidung (lange Hose + Jacke/Shirt)',
        'Schwimmart: Beliebige Lagen (Brust, Kraul, Rücken)',
        'Fokus auf gleichmäßiges Gleiten und kontrollierte Atmung'
      ],
      tips: [
        'Direkte Vorbereitung auf die 300m-Kleider-Prüfungsnorm (max. 6:00 Min.).',
        'Kurze Pause (15s) trainiert die langanhaltende Ausdauer bei hohem Wasserwiderstand.'
      ]
    }
  },
  {
    week: 5,
    phase: 'Lagenkoordination & Belastung',
    title: 'Woche 5: Lagenkombinationen & Tempohärte (GA2)',
    trainingZone: 'GA2',
    mainSetDistance: 900,
    estimatedTotalDistance: 1900,
    summary: '6x150m (80%) Lagenkombis & beliebige Schwimmart',
    mainSet: {
      series: '6x150m',
      intensity: '80%',
      pause: 'Pause 30 sec',
      exercises: [
        'Jeder 150m-Block unterteilt in:',
        '• 75m Lagenkombis (z.B. 25m Schmetterling, 25m Rücken, 25m Brust)',
        '• 75m beliebig (z.B. Kraul zügig oder aktive Erholung)'
      ],
      tips: [
        'Die Lagenwechsel schulen die koordinative Flexibilität unter Laktat.',
        'Auf saubere Wenden und Abstoßphasen nach jedem 25m-Abschnitt achten.'
      ]
    }
  },
  {
    week: 6,
    phase: 'Schnelligkeit & Tauchen',
    title: 'Woche 6: Tauchphasen & Sprintausdauer (SA)',
    trainingZone: 'SA',
    mainSetDistance: 600,
    estimatedTotalDistance: 1600,
    summary: '12x50m (90%, Startzeit 1:10-1:40 min) Tauchphase + Sprint + Altdeutsch',
    mainSet: {
      series: '12x50m',
      intensity: '90%',
      pause: 'Startzeit 1:10 - 1:40 min (Abgangszeit)',
      exercises: [
        'Jede 50m-Wiederholung zusammengesetzt aus:',
        '• 10m Tauchphase (explosiver Abstoß unter Wasser)',
        '• 15m Sprint (maximale Frequenz bis zur Wand / 25m-Marke)',
        '• 25m Rücken altdeutsch locker (Gleichschlag, aktive Erholung vor nächstem Start)'
      ],
      tips: [
        'Startzeit-Training: Starte alle 70 bis 100 Sekunden auf die Sekunde genau.',
        '15m Sprint mit 100% Krafteinsatz durchziehen, Rücken altdeutsch zur Erholung nutzen.'
      ]
    }
  },
  {
    week: 7,
    phase: 'Beinschlag & Kraftausdauer',
    title: 'Woche 7: Lagenbeine & Beinkraft (GA2)',
    trainingZone: 'GA2',
    mainSetDistance: 1600,
    estimatedTotalDistance: 2600,
    summary: '8x200m (80%) Lagenbeine ohne und mit Schwimmbrett',
    mainSet: {
      series: '8x200m',
      intensity: '80%',
      pause: 'Pause 30 sec',
      exercises: [
        'Jeder 200m-Block = 4x50m Lagenbeine:',
        '• 50m Delfinbeine ohne Brett (Körperwelle aus dem Rumpf)',
        '• 50m Rückenbeine ohne Brett (Arme in Vorhalte / Streamline)',
        '• 50m Brustbeine mit Brett (maximaler Wasserdruck nach hinten)',
        '• 50m Kraulbeine mit Brett (hohe Frequenz, gestreckte Fußspitzen)'
      ],
      tips: [
        'Isoliertes Beintraining stärkt die Grundgeschwindigkeit für Startsprünge und Wenden.',
        'Auf feste Rumpfspannung bei den Delphin- und Rückenbeinen ohne Brett achten.'
      ]
    }
  },
  {
    week: 8,
    phase: 'Dauermethode & Ausdauer',
    title: 'Woche 8: 1.000m Lagenvario Dauermethode (GA1)',
    trainingZone: 'GA1',
    mainSetDistance: 1000,
    estimatedTotalDistance: 2000,
    summary: '1.000m (50%) Dauerschwimmen im stetigen Wechsel: 50m Rücken, 50m Brust, 50m Kraul',
    mainSet: {
      series: '1.000m am Stück',
      intensity: '50%',
      pause: 'Keine Pause (Dauermethode)',
      exercises: [
        '1.000m kontinuierlich im 150m-Dreierzyklus durchschwimmen:',
        '• 50m Rücken (kontrollierte Atmung)',
        '• 50m Brust (kräftiger Beinstoß mit Gleitphase)',
        '• 50m Kraul (ruhiger 6er- oder 2er-Beinschlag)',
        '(Wiederholt sich ca. 6,6 Mal bis 1.000m erreicht sind)'
      ],
      tips: [
        'Trainiert mentale Härte und ökonomische Bewegungsausführung über lange Strecken.',
        'Wichtig als Fundament für die 400m-Ausdauerprüfung (max. 7:30 Min.).'
      ]
    }
  },
  {
    week: 9,
    phase: 'Kraul-Intervalltraining',
    title: 'Woche 9: 100m-Kraul-Intervallserie (GA2)',
    trainingZone: 'GA2',
    mainSetDistance: 1200,
    estimatedTotalDistance: 2200,
    summary: '12x100m Kraul (80%) mit angepasster Startzeit / ca. 20 sec Pause',
    mainSet: {
      series: '12x100m Kraul',
      intensity: '80%',
      pause: 'Startzeit anpassen, ca. 20 sec Pause',
      exercises: [
        '12x 100m Freistil / Kraul auf Tempozeit',
        'Startsprung oder Abstoß von der Wand mit optimaler Gleitphase',
        'Gleichmäßiges Splitting: Erste 50m und zweite 50m in nahezu gleicher Zeit halten'
      ],
      tips: [
        'Zielzeit pro 100m: Versuche alle 12 Wiederholungen innerhalb eines engen Zeitfensters (z.B. 1:25 - 1:30 min) zu halten.',
        'Bereitet gezielt auf das 100m-Zeitschwimmen der Abschlussprüfung vor.'
      ]
    }
  },
  {
    week: 10,
    phase: 'Rettungsdrill & Technik',
    title: 'Woche 10: Rettungsdrill & Gleittechnik (GA2)',
    trainingZone: 'GA2',
    mainSetDistance: 800,
    estimatedTotalDistance: 1800,
    summary: '8x100m (80%) mit Abschleppen, Brustgleiten, Rücken & Kraul (gekreuzte Beine)',
    mainSet: {
      series: '8x100m',
      intensity: '80%',
      pause: 'Pause 30 sec',
      exercises: [
        'Jeder 100m-Block zusammengesetzt aus 4x25m:',
        '• 25m Abschleppen ohne Puppe (Partner oder Simulation im Rettungsgriff)',
        '• 25m Brust gleiten (Technikfokus auf minimalen Wasserwiderstand)',
        '• 25m Rücken (optimale Wasserlage und Armzug)',
        '• 25m Kraul mit gekreuzten Beinen (isoliertes Armkraft- und Wasserlagentraining)'
      ],
      tips: [
        'Kraul mit gekreuzten Beinen schult die Körperspannung und den hohen Armzug.',
        'Brust gleiten dient der Ökonomisierung für das 100m-Zeitschwimmen.'
      ]
    }
  },
  {
    week: 11,
    phase: 'Prüfungsspitze & Sprint',
    title: 'Woche 11: Bekleidungs-Sprints (SA)',
    trainingZone: 'SA',
    mainSetDistance: 400,
    estimatedTotalDistance: 1400,
    summary: '8x50m (100%, Startzeit 1:15-1:45 min) Sprints mit variierender Kleidung',
    mainSet: {
      series: '8x50m (100% All-Out)',
      intensity: '100% (Maximalkraft / Sprint)',
      pause: 'Startzeit 1:15 - 1:45 min (Abgangszeit)',
      exercises: [
        'Zwei beliebige Lagen frei wählbar in folgender Bekleidungsabstufung:',
        '• 2x 50m Sprint mit T-Shirt und Shorts (maximaler Widerstand)',
        '• 4x 50m Sprint mit Shorts',
        '• 2x 50m Sprint ohne Zusatzkleidung (Badebekleidung) -> maximales Tempogefühl'
      ],
      tips: [
        'Durch das stufenweise Ausziehen der Kleidung entsteht ein starker Tempokontrast-Effekt.',
        'Voller Krafteinsatz auf allen 50m-Strecken mit sauberem Anschlag.'
      ]
    }
  },
  {
    week: 12,
    phase: 'Abschlussprüfung Tapering',
    title: 'Woche 12: Startblock-Sprints & Apnoe-Training (SA)',
    trainingZone: 'SA',
    mainSetDistance: 400,
    estimatedTotalDistance: 1400,
    summary: '16x25m Kraul (100%, Startzeit 1:10 min) vom Startblock ohne Atmung',
    mainSet: {
      series: '16x25m Kraul',
      intensity: '100% (Prüfungs-Sprint)',
      pause: 'Startzeit 1:10 min (Abgangszeit)',
      exercises: [
        '16x 25m Kraul mit Start vom Startblock',
        'Ausführung: Ohne Atmung (apnoe durchsprinten) bis zum Wandanschlag',
        'Fokus auf explosiven Startsprung, weite Eintauchphase und maximale Frequenz'
      ],
      tips: [
        'Perfekte Vorbereitung auf die ersten 25m des 100m-Zeitschwimmens.',
        'Kopf ruhig im Wasser halten, Anschlag mit voller Geschwindigkeit treffen.'
      ]
    }
  }
];

export const TRAINING_METADATA = {
  title: 'Mustertrainingspläne FAB Azubi bis Abschlussprüfung',
  issuer: 'BDS e.V. (Bundesverband Deutscher Schwimmmeister e.V.)',
  author: 'Maik Stünkel',
  date: '01.03.2022',
  description: 'Offizieller 12-Wochen-Trainingsplan zur systematischen Vorbereitung auf die praktische Abschlussprüfung zum Fachangestellten für Bäderbetriebe (FAB).'
};
