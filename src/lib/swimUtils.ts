import { SwimDiscipline, SwimTimeEntry } from '../types';

/**
 * Format total seconds into a readable German swim time:
 * e.g. 94.45 -> "1:34,45 Min." or 33.20 -> "33,20 Sek."
 */
export function formatSwimTime(totalSeconds: number, includeUnit = true): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '--:--';

  const mins = Math.floor(totalSeconds / 60);
  const remainingSecs = totalSeconds % 60;
  const secs = Math.floor(remainingSecs);
  const hundredths = Math.round((remainingSecs - secs) * 100);

  const formattedHundredths = hundredths.toString().padStart(2, '0').slice(0, 2);

  if (mins > 0) {
    const formattedSecs = secs.toString().padStart(2, '0');
    return includeUnit 
      ? `${mins}:${formattedSecs},${formattedHundredths} Min.` 
      : `${mins}:${formattedSecs},${formattedHundredths}`;
  }

  const formattedSecs = secs.toString();
  return includeUnit 
    ? `${formattedSecs},${formattedHundredths} Sek.` 
    : `${formattedSecs},${formattedHundredths}`;
}

/**
 * Splits seconds into { minutes, seconds, hundredths }
 */
export function splitSwimTime(totalSeconds: number): { minutes: number; seconds: number; hundredths: number } {
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return { minutes: 0, seconds: 0, hundredths: 0 };
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSecs = totalSeconds % 60;
  const seconds = Math.floor(remainingSecs);
  const hundredths = Math.min(99, Math.round((remainingSecs - seconds) * 100));
  return { minutes, seconds, hundredths };
}

/**
 * Parse minutes, seconds, hundredths into float seconds
 */
export function parseSwimTime(minutes: number, seconds: number, hundredths: number): number {
  const m = Math.max(0, minutes || 0);
  const s = Math.max(0, Math.min(59, seconds || 0));
  const h = Math.max(0, Math.min(99, hundredths || 0));
  return m * 60 + s + h / 100;
}

/**
 * Calculate delta and requirement status:
 * isPassed: true if recorded time <= targetTime
 */
export function getRequirementComparison(
  timeSeconds: number,
  targetTimeSeconds?: number,
  isHLW = false
): {
  hasTarget: boolean;
  isPassed: boolean;
  deltaSeconds: number;
  formattedDelta: string;
} {
  if (!targetTimeSeconds || targetTimeSeconds <= 0) {
    return {
      hasTarget: false,
      isPassed: false,
      deltaSeconds: 0,
      formattedDelta: ''
    };
  }

  if (isHLW) {
    const deltaSeconds = timeSeconds - targetTimeSeconds;
    const isPassed = deltaSeconds >= 0;
    const absDelta = Math.abs(deltaSeconds);
    const formattedAbs = absDelta.toFixed(2).replace('.', ',');

    return {
      hasTarget: true,
      isPassed,
      deltaSeconds,
      formattedDelta: isPassed 
        ? `+${formattedAbs} s über 5 Min. (Soll erfüllt)` 
        : `-${formattedAbs} s bis 5 Min.`
    };
  }

  const deltaSeconds = timeSeconds - targetTimeSeconds;
  const isPassed = deltaSeconds <= 0;
  const absDelta = Math.abs(deltaSeconds);
  const formattedAbs = absDelta.toFixed(2).replace('.', ',');

  return {
    hasTarget: true,
    isPassed,
    deltaSeconds,
    formattedDelta: isPassed 
      ? `-${formattedAbs} s unter Soll` 
      : `+${formattedAbs} s über Soll`
  };
}

export function isJumpDiscipline(discipline?: SwimDiscipline | null): boolean {
  if (!discipline) return false;
  const name = discipline.name.toLowerCase();
  return name.includes('sprung') || name.includes('kopfsprung') || name.includes('springen');
}

export function isDiveDiscipline(discipline?: SwimDiscipline | null): boolean {
  if (!discipline) return false;
  const name = discipline.name.toLowerCase();
  return discipline.style === 'tauchen' || name.includes('tauchen') || name.includes('streckentauchen');
}

export function isHLWDiscipline(discipline?: SwimDiscipline | null): boolean {
  if (!discipline) return false;
  const name = discipline.name.toLowerCase();
  const desc = (discipline.description || '').toLowerCase();
  return (
    name.includes('herz') ||
    name.includes('lungen') ||
    name.includes('wiederbelebung') ||
    name.includes('hlw') ||
    name.includes('reanimation') ||
    desc.includes('herz-lungen-wiederbelebung')
  );
}

export interface DisciplineStats {
  totalEntries: number;
  bestEntry: SwimTimeEntry | null;
  latestEntry: SwimTimeEntry | null;
  averageSeconds: number;
  targetTimeSeconds?: number;
  requirementPassed: boolean;
  improvementTotalSeconds: number; // difference from first to best
  trendVsPrevious: number; // latest vs second-to-latest (negative = improved)
  maxDistanceMeters?: number;
  bestDistance?: number;
  latestJumpStyle?: string;
  latestRatingScore?: string;
}

/**
 * Compute detailed analytics for a discipline
 */
export function computeDisciplineStats(
  discipline: SwimDiscipline,
  entries: SwimTimeEntry[]
): DisciplineStats {
  const discEntries = entries
    .filter(e => e.disciplineId === discipline.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.createdAt - b.createdAt);

  if (discEntries.length === 0) {
    return {
      totalEntries: 0,
      bestEntry: null,
      latestEntry: null,
      averageSeconds: 0,
      targetTimeSeconds: discipline.targetTimeSeconds,
      requirementPassed: false,
      improvementTotalSeconds: 0,
      trendVsPrevious: 0
    };
  }

  const latestEntry = discEntries[discEntries.length - 1];

  // For jumping disciplines
  if (isJumpDiscipline(discipline)) {
    return {
      totalEntries: discEntries.length,
      bestEntry: latestEntry,
      latestEntry,
      averageSeconds: 0,
      requirementPassed: discEntries.some(e => e.ratingScore && !e.ratingScore.toLowerCase().includes('nicht')),
      improvementTotalSeconds: 0,
      trendVsPrevious: 0,
      latestJumpStyle: latestEntry.jumpStyle,
      latestRatingScore: latestEntry.ratingScore
    };
  }

  // Filter entries with valid positive time
  const timedEntries = discEntries.filter(e => typeof e.timeSeconds === 'number' && e.timeSeconds > 0);

  // Distance tracking for diving
  const maxDistanceMeters = Math.max(...discEntries.map(e => e.distanceMeters || discipline.distance || 0));

  if (timedEntries.length === 0) {
    return {
      totalEntries: discEntries.length,
      bestEntry: null,
      latestEntry,
      averageSeconds: 0,
      targetTimeSeconds: discipline.targetTimeSeconds,
      requirementPassed: isDiveDiscipline(discipline) ? maxDistanceMeters >= 35 : false,
      improvementTotalSeconds: 0,
      trendVsPrevious: 0,
      maxDistanceMeters,
      bestDistance: maxDistanceMeters
    };
  }

  // Best time (lowest time for swimming, longest duration for HLW)
  const isHLW = isHLWDiscipline(discipline);
  let bestEntry = timedEntries[0];
  let sumSeconds = 0;

  for (const entry of timedEntries) {
    sumSeconds += (entry.timeSeconds || 0);
    if (isHLW) {
      if ((entry.timeSeconds || 0) > (bestEntry.timeSeconds || 0)) {
        bestEntry = entry;
      }
    } else {
      if ((entry.timeSeconds || 0) < (bestEntry.timeSeconds || 0)) {
        bestEntry = entry;
      }
    }
  }

  const firstEntry = timedEntries[0];
  const averageSeconds = sumSeconds / timedEntries.length;

  const targetTime = discipline.targetTimeSeconds;
  let requirementPassed = false;
  if (isDiveDiscipline(discipline)) {
    requirementPassed = maxDistanceMeters >= 35;
  } else if (isHLW && targetTime) {
    requirementPassed = (bestEntry.timeSeconds || 0) >= targetTime;
  } else if (targetTime) {
    requirementPassed = (bestEntry.timeSeconds || 0) <= targetTime;
  }

  const improvementTotalSeconds = (firstEntry.timeSeconds || 0) - (bestEntry.timeSeconds || 0);

  let trendVsPrevious = 0;
  if (timedEntries.length >= 2) {
    const prevEntry = timedEntries[timedEntries.length - 2];
    trendVsPrevious = (latestEntry.timeSeconds || 0) - (prevEntry.timeSeconds || 0);
  }

  return {
    totalEntries: discEntries.length,
    bestEntry,
    latestEntry,
    averageSeconds,
    targetTimeSeconds: targetTime,
    requirementPassed,
    improvementTotalSeconds,
    trendVsPrevious,
    maxDistanceMeters,
    bestDistance: maxDistanceMeters
  };
}
