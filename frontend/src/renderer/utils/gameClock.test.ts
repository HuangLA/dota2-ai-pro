import { describe, expect, it } from 'vitest';
import { createGameClockMapper } from './gameClock';

describe('gameClock mapper', () => {
  it('keeps playback timeline based on replay time', () => {
    const mapper = createGameClockMapper([
      { time: 120, game_time: -90 },
      { time: 180, game_time: -30 },
      { time: 270, game_time: 60 },
    ]);

    expect(mapper.getSourceTime({ time: 180, game_time: -30 })).toBe(180);
    expect(mapper.sourceToGameClock(180)).toBe(-30);
    expect(mapper.strategy).toBe('game_time_offset');
  });

  it('prefers sample-derived offset over time_basis hint when game_time exists', () => {
    const mapper = createGameClockMapper(
      [{ time: 200, game_time: 10 }],
      { offset_seconds: 250 }
    );

    expect(mapper.strategy).toBe('game_time_offset');
    expect(mapper.offsetSeconds).toBe(190);
    expect(mapper.sourceToGameClock(200)).toBe(10);
  });

  it('freezes displayed game time during pause interval', () => {
    const mapper = createGameClockMapper(
      [{ time: 120, game_time: -90 }],
      {
        offset_seconds: 210,
        pause_intervals: [
          {
            start_source_time: 300,
            end_source_time: 330,
          },
        ],
      }
    );

    expect(mapper.strategy).toBe('game_time_pause_intervals');
    expect(mapper.sourceToGameClock(299)).toBe(89);
    expect(mapper.sourceToGameClock(300)).toBe(90);
    expect(mapper.sourceToGameClock(315)).toBe(90);
    expect(mapper.sourceToGameClock(330)).toBe(90);
    expect(mapper.sourceToGameClock(340)).toBe(100);
    expect(mapper.isPausedAtSourceTime(315)).toBe(true);
    expect(mapper.isPausedAtSourceTime(340)).toBe(false);
  });

  it('freezes displayed game time with replay_start_time/replay_end_time keys', () => {
    const mapper = createGameClockMapper(
      [{ time: 120, game_time: -90 }],
      {
        offset_seconds: 210,
        pause_intervals: [
          {
            replay_start_time: 300,
            replay_end_time: 330,
          },
        ],
      }
    );

    expect(mapper.strategy).toBe('game_time_pause_intervals');
    expect(mapper.sourceToGameClock(315)).toBe(90);
    expect(mapper.isPausedAtSourceTime(315)).toBe(true);
  });

  it('falls back to previous behavior when pause intervals are missing', () => {
    const mapper = createGameClockMapper(
      [{ time: 120, game_time: -90 }],
      { offset_seconds: 210 }
    );

    expect(mapper.strategy).toBe('game_time_offset');
    expect(mapper.sourceToGameClock(315)).toBe(105);
    expect(mapper.isPausedAtSourceTime(315)).toBe(false);
  });

  it('infers pause intervals from frozen game_time samples when metadata missing', () => {
    const mapper = createGameClockMapper([
      { time: 422, game_time: 203.06665 },
      { time: 423, game_time: 204.06665 },
      { time: 424, game_time: 204.49997 },
      { time: 425, game_time: 204.49997 },
      { time: 426, game_time: 204.49997 },
      { time: 447, game_time: 204.49997 },
      { time: 448, game_time: 204.5333 },
      { time: 449, game_time: 205.5333 },
    ]);

    expect(mapper.strategy).toBe('game_time_pause_intervals');
    expect(mapper.isPausedAtSourceTime(430)).toBe(true);
    expect(mapper.sourceToGameClock(430)).toBeCloseTo(205.06665, 3);
  });

  it('normalizes early pregame game_time to standard -1:30 display anchor', () => {
    const mapper = createGameClockMapper([
      { time: 112, game_time: -106.733 },
      { time: 113, game_time: -105.733 },
    ]);

    expect(mapper.sourceToGameClock(112)).toBeCloseTo(-90, 3);
    expect(mapper.sourceToGameClock(113)).toBeCloseTo(-89, 3);
  });
});
