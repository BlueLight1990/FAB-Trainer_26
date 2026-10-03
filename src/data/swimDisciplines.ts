import { SwimDiscipline, SwimTimeEntry } from '../types';

export const DEFAULT_SWIM_DISCIPLINES: SwimDiscipline[] = [
  {
    id: 'disc_kombi_rettung',
    name: 'Kombinierte Rettungsübung (Sperrfach)',
    distance: 25,
    poolLength: 25,
    targetTimeSeconds: 600, // 10:00 min
    requirementLabel: 'max. 10:00 Min. (Sperrfach)',
    style: 'retten',
    description: '25m Anschwimmen, Abtauchen, Heraufholen einer Puppe, Befreiungsgriff, 25m Abschleppen, Anlandbringen, Ablegen, EH-Maßnahmen, Seitenlage.',
    createdAt: 1700000001000
  },
  {
    id: 'disc_300_kleider',
    name: '300m Kleiderschwimmen (Sperrfach)',
    distance: 300,
    poolLength: 25,
    targetTimeSeconds: 480, // 8:00 min
    requirementLabel: 'max. 8:00 Min. (Sperrfach)',
    style: 'kleider',
    description: 'In Drillich-Anzug schwimmen mit anschließendem Entkleiden im tiefen Wasser ohne Festhalten.',
    createdAt: 1700000002000
  },
  {
    id: 'disc_50_abschleppen',
    name: '50m Abschleppen (Sperrfach)',
    distance: 50,
    poolLength: 25,
    targetTimeSeconds: 120, // 2:00 min
    requirementLabel: 'max. 2:00 Min. (Sperrfach)',
    style: 'retten',
    description: 'In Drillich-Anzug: 25m Achselschleppgriff, dann 25m Fesselschleppgriff.',
    createdAt: 1700000003000
  },
  {
    id: 'disc_hlw_wiederbelebung',
    name: 'Herz- Lungen Wiederbelebung (Sperrfach)',
    distance: 0,
    targetTimeSeconds: 300, // 5:00 min
    requirementLabel: '5 Minuten (Sperrfach)',
    style: 'sonstiges',
    description: 'An Puppe (mind. 5 Minuten kontinuierliche Herz-Lungen-Wiederbelebung).',
    createdAt: 1700000004000
  },
  {
    id: 'disc_35_streckentauchen',
    name: '35m Streckentauchen',
    distance: 35,
    poolLength: 25,
    targetTimeSeconds: 40, // 0:40 min
    requirementLabel: 'min. 35m (unter 39s: Punkteverbesserung)',
    style: 'tauchen',
    description: '35m Streckentauchen. Ab einer Zeit unter 39 sec. Punkteverbesserung.',
    createdAt: 1700000005000
  },
  {
    id: 'disc_50_wettkampftechnik',
    name: '50m Wettkampftechnik',
    distance: 50,
    poolLength: 25,
    requirementLabel: 'Wird zur Prüfung bekannt gegeben',
    style: 'sonstiges',
    description: '50m Wettkampftechnik (Schwimmart wird erst zur Prüfung bekannt gegeben).',
    createdAt: 1700000006000
  },
  {
    id: 'disc_100_zeitschwimmen',
    name: '100m Zeitschwimmen',
    distance: 100,
    poolLength: 25,
    targetTimeSeconds: 90, // 1:30 min
    requirementLabel: 'max. 1:30 Min.',
    style: 'sonstiges',
    description: 'Zeitschwimmen mit Startsprung und korrekter Wende nach Wettkampfregeln.',
    createdAt: 1700000007000
  },
  {
    id: 'disc_kopfsprung_3m',
    name: 'Kopfsprung aus 3m Höhe',
    requirementLabel: 'Kopfsprung einer Sprungart aus 3m Höhe',
    style: 'sonstiges',
    description: 'Kopfsprung einer Sprungart aus 3m Höhe mit sauberem Eintauchen.',
    createdAt: 1700000008000
  }
];

export const DEFAULT_SWIM_ENTRIES: SwimTimeEntry[] = [
  {
    id: 'entry_sample_1',
    disciplineId: 'disc_100_zeitschwimmen',
    date: '2026-08-20',
    timeSeconds: 94.5, // 1:34.50 min
    poolLength: 25,
    notes: 'Erstes Zeitschwimmen, Wende noch ausbaufähig.',
    createdAt: 1724140800000
  },
  {
    id: 'entry_sample_2',
    disciplineId: 'disc_100_zeitschwimmen',
    date: '2026-09-08',
    timeSeconds: 88.2, // 1:28.20 min
    poolLength: 25,
    notes: 'Prüfungszeit geknackt (unter 1:30 Min)!',
    createdAt: 1725782400000
  },
  {
    id: 'entry_sample_3',
    disciplineId: 'disc_35_streckentauchen',
    date: '2026-09-02',
    distanceMeters: 35,
    timeSeconds: 38.4, // 0:38.40 min
    poolLength: 25,
    notes: '35m durchgetaucht in 38,4s (unter 39s -> Punkteverbesserung!).',
    createdAt: 1725264000000
  },
  {
    id: 'entry_sample_jump_1',
    disciplineId: 'disc_kopfsprung_3m',
    date: '2026-09-06',
    jumpHeightMeters: 3,
    jumpStyle: 'Kopfsprung vorwärts (gehechtet)',
    ratingScore: 'Bestanden (Note: 2)',
    notes: 'Guter Absprung vom 3m Brett, saubere Körperspannung beim Eintauchen.',
    createdAt: 1725609600000
  },
  {
    id: 'entry_sample_4',
    disciplineId: 'disc_300_kleider',
    date: '2026-09-10',
    timeSeconds: 462.0, // 7:42 min
    poolLength: 25,
    notes: 'Mit Drillich-Anzug geschwommen und im tiefen Wasser entkleidet.',
    createdAt: 1725955200000
  }
];

