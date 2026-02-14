export interface TimelineTimeRecord {
  time?: number;
  game_time?: number;
}

export interface TimeBasisHint {
  basis?: string;
  source?: string;
  strategy?: string;
  offset_seconds?: number;
  game_start_time?: number;
}

export type TimeBasisSource = 'game_time' | 'fallback';

export interface GameClockMapper {
  offsetSeconds: number;
  strategy: 'game_time_direct' | 'game_time_offset' | 'fallback_pre_game_anchor';
  timeBasisSource: TimeBasisSource;
  fallbackAnchorSourceTime?: number;
  fallbackAnchorGameClockTime?: number;
  sourceToGameClock: (sourceTime: number) => number;
  gameClockToSource: (gameClockTime: number) => number;
  getSourceTime: (record: TimelineTimeRecord) => number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const FALLBACK_PRE_GAME_SECONDS = 90;

interface OffsetStrategy {
  offsetSeconds: number;
  strategy: GameClockMapper['strategy'];
  timeBasisSource: TimeBasisSource;
  fallbackAnchorSourceTime?: number;
  fallbackAnchorGameClockTime?: number;
}

function hasUsableGameTime(records: TimelineTimeRecord[]): boolean {
  for (const record of records) {
    if (isFiniteNumber(record.game_time)) {
      return true;
    }
  }
  return false;
}

function computeDirectDisplayShift(
  records: TimelineTimeRecord[]
): number {
  let minGameTime = Number.POSITIVE_INFINITY;
  for (const record of records) {
    if (!isFiniteNumber(record.game_time)) {
      continue;
    }
    if (record.game_time < minGameTime) {
      minGameTime = record.game_time;
    }
  }

  if (!Number.isFinite(minGameTime)) {
    return 0;
  }

  return -FALLBACK_PRE_GAME_SECONDS - minGameTime;
}

function toLowerString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.toLowerCase();
}

function inferSourceFromHint(hint?: TimeBasisHint): TimeBasisSource | null {
  if (!hint) {
    return null;
  }

  const sourceText = `${toLowerString(hint.source)} ${toLowerString(hint.strategy)} ${toLowerString(hint.basis)}`;
  if (sourceText.includes('fallback')) {
    return 'fallback';
  }
  if (sourceText.includes('game_time') || sourceText.includes('gametime') || sourceText.includes('game')) {
    return 'game_time';
  }
  return null;
}

function deriveFromTimeBasisHint(timeBasis?: TimeBasisHint): OffsetStrategy | null {
  if (!timeBasis) {
    return null;
  }

  const inferredSource = inferSourceFromHint(timeBasis);

  if (isFiniteNumber(timeBasis.offset_seconds)) {
    return {
      offsetSeconds: timeBasis.offset_seconds,
      strategy: inferredSource === 'fallback' ? 'fallback_pre_game_anchor' : 'game_time_offset',
      timeBasisSource: inferredSource ?? 'game_time',
    };
  }

  if (isFiniteNumber(timeBasis.game_start_time)) {
    return {
      offsetSeconds: timeBasis.game_start_time,
      strategy: inferredSource === 'fallback' ? 'fallback_pre_game_anchor' : 'game_time_offset',
      timeBasisSource: inferredSource ?? 'game_time',
    };
  }

  return null;
}

function getSourceTimeFromRecord(record: TimelineTimeRecord): number | null {
  if (isFiniteNumber(record.time)) {
    return record.time;
  }
  return null;
}

function deriveOffsetStrategy(records: TimelineTimeRecord[]): OffsetStrategy {
  if (hasUsableGameTime(records)) {
    return {
      offsetSeconds: 0,
      strategy: 'game_time_direct',
      timeBasisSource: 'game_time',
    };
  }

  const sampleWithGameClock = records.find(
    (record) => isFiniteNumber(record.time) && isFiniteNumber(record.game_time)
  );

  if (
    sampleWithGameClock
    && isFiniteNumber(sampleWithGameClock.time)
    && isFiniteNumber(sampleWithGameClock.game_time)
  ) {
    return {
      offsetSeconds: sampleWithGameClock.time - sampleWithGameClock.game_time,
      strategy: 'game_time_offset',
      timeBasisSource: 'game_time',
    };
  }

  let firstSourceTime: number | null = null;
  for (const record of records) {
    const sourceTime = getSourceTimeFromRecord(record);
    if (sourceTime === null) {
      continue;
    }
    if (firstSourceTime === null || sourceTime < firstSourceTime) {
      firstSourceTime = sourceTime;
    }
  }

  if (firstSourceTime === null) {
    return {
      offsetSeconds: 0,
      strategy: 'fallback_pre_game_anchor',
      timeBasisSource: 'fallback',
    };
  }

  const fallbackAnchorGameClockTime = -FALLBACK_PRE_GAME_SECONDS;
  return {
    offsetSeconds: firstSourceTime - fallbackAnchorGameClockTime,
    strategy: 'fallback_pre_game_anchor',
    timeBasisSource: 'fallback',
    fallbackAnchorSourceTime: firstSourceTime,
    fallbackAnchorGameClockTime,
  };
}

export function createGameClockMapper(
  records: TimelineTimeRecord[],
  timeBasis?: TimeBasisHint
): GameClockMapper {
  const hasGameTime = hasUsableGameTime(records);
  const hintedStrategy = hasGameTime ? null : deriveFromTimeBasisHint(timeBasis);
  const {
    offsetSeconds,
    strategy,
    timeBasisSource,
    fallbackAnchorSourceTime,
    fallbackAnchorGameClockTime,
  } = hintedStrategy ?? deriveOffsetStrategy(records);

  const displayShiftSeconds = strategy === 'game_time_direct'
    ? computeDirectDisplayShift(records)
    : 0;

  const sourceToGameClock = (sourceTime: number): number => {
    if (strategy === 'game_time_direct') {
      return sourceTime;
    }
    return sourceTime - offsetSeconds;
  };

  const gameClockToSource = (gameClockTime: number): number => {
    if (strategy === 'game_time_direct') {
      return gameClockTime;
    }
    return gameClockTime + offsetSeconds;
  };

  const getSourceTime = (record: TimelineTimeRecord): number => {
    if (strategy === 'game_time_direct' && isFiniteNumber(record.game_time)) {
      return record.game_time + displayShiftSeconds;
    }
    if (isFiniteNumber(record.time)) {
      return record.time;
    }
    if (isFiniteNumber(record.game_time)) {
      return gameClockToSource(record.game_time);
    }
    return 0;
  };

  return {
    offsetSeconds,
    strategy,
    timeBasisSource,
    fallbackAnchorSourceTime,
    fallbackAnchorGameClockTime,
    sourceToGameClock,
    gameClockToSource,
    getSourceTime,
  };
}

export function formatGameClockTime(seconds: number): string {
  const rounded = Math.floor(seconds);
  const isNegative = rounded < 0;
  const absSeconds = Math.abs(rounded);
  const mins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;

  return `${isNegative ? '-' : ''}${mins}:${secs.toString().padStart(2, '0')}`;
}
