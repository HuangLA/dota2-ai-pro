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
  pause_intervals?: PauseIntervalHint[];
}

export interface PauseIntervalHint {
  start_time?: number;
  end_time?: number;
  start_source_time?: number;
  end_source_time?: number;
  start_replay_time?: number;
  end_replay_time?: number;
  replay_start_time?: number;
  replay_end_time?: number;
  start_game_time?: number;
  end_game_time?: number;
  game_time?: number;
}

export type TimeBasisSource = 'game_time' | 'fallback';

export interface GameClockMapper {
  offsetSeconds: number;
  strategy: 'game_time_direct' | 'game_time_offset' | 'game_time_pause_intervals' | 'fallback_pre_game_anchor';
  timeBasisSource: TimeBasisSource;
  fallbackAnchorSourceTime?: number;
  fallbackAnchorGameClockTime?: number;
  pauseIntervals: PauseInterval[];
  sourceToGameClock: (sourceTime: number) => number;
  gameClockToSource: (gameClockTime: number) => number;
  isPausedAtSourceTime: (sourceTime: number) => boolean;
  getSourceTime: (record: TimelineTimeRecord) => number;
}

export interface PauseInterval {
  startSourceTime: number;
  endSourceTime: number;
  startGameTime?: number;
  endGameTime?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const FALLBACK_PRE_GAME_SECONDS = 90;
const PRE_GAME_NORMALIZE_TRIGGER_SECONDS = -95;

interface OffsetStrategy {
  offsetSeconds: number;
  strategy: GameClockMapper['strategy'];
  timeBasisSource: TimeBasisSource;
  fallbackAnchorSourceTime?: number;
  fallbackAnchorGameClockTime?: number;
}

interface NormalizedPauseInterval {
  startSourceTime: number;
  endSourceTime: number;
  durationSeconds: number;
  startGameTime?: number;
  endGameTime?: number;
}

function hasUsableGameTime(records: TimelineTimeRecord[]): boolean {
  for (const record of records) {
    if (isFiniteNumber(record.game_time)) {
      return true;
    }
  }
  return false;
}

function computeGameTimeDisplayShift(records: TimelineTimeRecord[]): number {
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

  if (minGameTime >= PRE_GAME_NORMALIZE_TRIGGER_SECONDS) {
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

function getGameTimeFromRecord(record: TimelineTimeRecord): number | null {
  if (isFiniteNumber(record.game_time)) {
    return record.game_time;
  }
  return null;
}

function pickFiniteNumber(obj: PauseIntervalHint, keys: Array<keyof PauseIntervalHint>): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (isFiniteNumber(value)) {
      return value;
    }
  }
  return null;
}

function normalizePauseIntervals(timeBasis?: TimeBasisHint): NormalizedPauseInterval[] {
  if (!timeBasis?.pause_intervals || timeBasis.pause_intervals.length === 0) {
    return [];
  }

  const intervals: NormalizedPauseInterval[] = [];
  for (const rawInterval of timeBasis.pause_intervals) {
    const startSourceTime = pickFiniteNumber(rawInterval, ['start_source_time', 'start_replay_time', 'replay_start_time', 'start_time']);
    const endSourceTime = pickFiniteNumber(rawInterval, ['end_source_time', 'end_replay_time', 'replay_end_time', 'end_time']);

    if (startSourceTime === null || endSourceTime === null || endSourceTime <= startSourceTime) {
      continue;
    }

    intervals.push({
      startSourceTime,
      endSourceTime,
      durationSeconds: endSourceTime - startSourceTime,
      startGameTime: pickFiniteNumber(rawInterval, ['start_game_time', 'game_time']) ?? undefined,
      endGameTime: pickFiniteNumber(rawInterval, ['end_game_time']) ?? undefined,
    });
  }

  intervals.sort((a, b) => a.startSourceTime - b.startSourceTime);
  return intervals;
}

function inferPauseIntervalsFromRecords(records: TimelineTimeRecord[]): NormalizedPauseInterval[] {
  const paired: Array<{ sourceTime: number; gameTime: number }> = [];
  for (const record of records) {
    if (!isFiniteNumber(record.time) || !isFiniteNumber(record.game_time)) {
      continue;
    }
    paired.push({ sourceTime: record.time, gameTime: record.game_time });
  }

  if (paired.length < 2) {
    return [];
  }

  paired.sort((a, b) => a.sourceTime - b.sourceTime);

  const EPSILON = 1e-4;
  const MIN_PAUSE_DURATION_SECONDS = 0.5;
  const intervals: NormalizedPauseInterval[] = [];
  let active: NormalizedPauseInterval | null = null;

  for (let idx = 1; idx < paired.length; idx += 1) {
    const prev = paired[idx - 1];
    const curr = paired[idx];
    const sourceDelta = curr.sourceTime - prev.sourceTime;
    if (sourceDelta <= EPSILON) {
      continue;
    }

    const gameDelta = curr.gameTime - prev.gameTime;
    const paused = Math.abs(gameDelta) <= EPSILON;

    if (paused) {
      if (!active) {
        active = {
          startSourceTime: prev.sourceTime,
          endSourceTime: curr.sourceTime,
          durationSeconds: curr.sourceTime - prev.sourceTime,
          startGameTime: prev.gameTime,
        };
      } else {
        active.endSourceTime = curr.sourceTime;
        active.durationSeconds = active.endSourceTime - active.startSourceTime;
      }
      continue;
    }

    if (active && active.durationSeconds >= MIN_PAUSE_DURATION_SECONDS) {
      intervals.push(active);
    }
    active = null;
  }

  if (active && active.durationSeconds >= MIN_PAUSE_DURATION_SECONDS) {
    intervals.push(active);
  }

  return intervals;
}

function hasUsableSourceTime(records: TimelineTimeRecord[]): boolean {
  for (const record of records) {
    if (isFiniteNumber(record.time)) {
      return true;
    }
  }
  return false;
}

function getFirstPairedTimeRecord(records: TimelineTimeRecord[]): TimelineTimeRecord | null {
  for (const record of records) {
    if (isFiniteNumber(record.time) && isFiniteNumber(record.game_time)) {
      return record;
    }
  }
  return null;
}

function deriveOffsetStrategy(records: TimelineTimeRecord[]): OffsetStrategy {
  const hasSourceTime = hasUsableSourceTime(records);

  if (hasUsableGameTime(records) && !hasSourceTime) {
    return {
      offsetSeconds: 0,
      strategy: 'game_time_direct',
      timeBasisSource: 'game_time',
    };
  }

  const sampleWithGameClock = getFirstPairedTimeRecord(records);

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
  const hasSourceTime = hasUsableSourceTime(records);
  const hasGameTime = hasUsableGameTime(records);
  // Prefer sample-derived offset when records already carry game_time.
  // time_basis hints are only used for fallback datasets that lack game_time.
  const hintedStrategy = hasSourceTime && !hasGameTime
    ? deriveFromTimeBasisHint(timeBasis)
    : null;
  const {
    offsetSeconds,
    strategy,
    timeBasisSource,
    fallbackAnchorSourceTime,
    fallbackAnchorGameClockTime,
  } = hintedStrategy ?? deriveOffsetStrategy(records);
  const normalizedPauseIntervals = hasSourceTime
    ? (() => {
      const hinted = normalizePauseIntervals(timeBasis);
      if (hinted.length > 0) {
        return hinted;
      }
      return inferPauseIntervalsFromRecords(records);
    })()
    : [];
  const hasPauseIntervals = normalizedPauseIntervals.length > 0;
  const effectiveStrategy: GameClockMapper['strategy'] = hasPauseIntervals
    ? 'game_time_pause_intervals'
    : strategy;

  const displayShiftSeconds = timeBasisSource === 'game_time'
    ? computeGameTimeDisplayShift(records)
    : 0;

  const sourceToGameClockWithoutPause = (sourceTime: number): number => {
    if (effectiveStrategy === 'game_time_direct') {
      return sourceTime;
    }
    return sourceTime - offsetSeconds;
  };

  const sourceToGameClockWithPause = (sourceTime: number): number => {
    let pausedDurationBefore = 0;
    for (const interval of normalizedPauseIntervals) {
      if (sourceTime < interval.startSourceTime) {
        break;
      }
      if (sourceTime < interval.endSourceTime) {
        const elapsedInsidePause = sourceTime - interval.startSourceTime;
        return sourceToGameClockWithoutPause(sourceTime) - pausedDurationBefore - elapsedInsidePause;
      }
      pausedDurationBefore += interval.durationSeconds;
    }
    return sourceToGameClockWithoutPause(sourceTime) - pausedDurationBefore;
  };

  const sourceToGameClock = (sourceTime: number): number => {
    const rawGameClock = hasPauseIntervals
      ? sourceToGameClockWithPause(sourceTime)
      : sourceToGameClockWithoutPause(sourceTime);

    return rawGameClock + displayShiftSeconds;
  };

  const gameClockToSource = (gameClockTime: number): number => {
    const normalizedGameClockTime = gameClockTime - displayShiftSeconds;

    if (effectiveStrategy === 'game_time_direct') {
      return normalizedGameClockTime;
    }

    if (hasPauseIntervals) {
      let pausedDurationBefore = 0;
      const EPSILON = 1e-6;
      for (const interval of normalizedPauseIntervals) {
        const pauseStartGameClock = interval.startSourceTime - offsetSeconds - pausedDurationBefore;
        if (normalizedGameClockTime < pauseStartGameClock - EPSILON) {
          break;
        }
        if (Math.abs(normalizedGameClockTime - pauseStartGameClock) <= EPSILON) {
          return interval.startSourceTime;
        }
        pausedDurationBefore += interval.durationSeconds;
      }

      return normalizedGameClockTime + offsetSeconds + pausedDurationBefore;
    }

    return normalizedGameClockTime + offsetSeconds;
  };

  const isPausedAtSourceTime = (sourceTime: number): boolean => {
    for (const interval of normalizedPauseIntervals) {
      if (sourceTime < interval.startSourceTime) {
        return false;
      }
      if (sourceTime < interval.endSourceTime) {
        return true;
      }
    }
    return false;
  };

  const getSourceTime = (record: TimelineTimeRecord): number => {
    if (isFiniteNumber(record.time)) {
      return record.time;
    }
    if (effectiveStrategy === 'game_time_direct' && isFiniteNumber(record.game_time)) {
      return record.game_time + displayShiftSeconds;
    }

    const gameTime = getGameTimeFromRecord(record);
    if (gameTime !== null) {
      return gameClockToSource(gameTime);
    }
    return 0;
  };

  return {
    offsetSeconds,
    strategy: effectiveStrategy,
    timeBasisSource,
    fallbackAnchorSourceTime,
    fallbackAnchorGameClockTime,
    pauseIntervals: normalizedPauseIntervals,
    sourceToGameClock,
    gameClockToSource,
    isPausedAtSourceTime,
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
