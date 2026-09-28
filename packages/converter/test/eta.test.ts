import { describe, expect, it } from 'vitest'

import {
  EMPTY_ESTIMATES,
  applyEstimateEvent,
  buildEstimateView,
  capEta,
  describeEta,
  estimateRemaining,
  recordProgress,
  roundDuration,
  splitDuration,
  startThroughput
} from '../src/eta.js'
import type { EstimateState, Throughput } from '../src/eta.js'
import type { JobEvent } from '../src/progress.js'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const steady = (perMinute: number, minutes: number): Throughput => {
  let throughput = startThroughput(0)
  for (let minute = 1; minute <= minutes; minute++) {
    throughput = recordProgress(throughput, { at: minute * MINUTE, done: minute * perMinute })
  }
  return throughput
}

describe('recordProgress', () => {
  it('keeps the first sample for the average over the whole run', () => {
    const throughput = steady(10, 30)
    expect(throughput.first).toEqual({ at: 0, done: 0 })
  })

  it('drops the samples older than the recent window, but one anchoring it', () => {
    const throughput = steady(10, 30)
    expect(throughput.recent.length).toBeLessThanOrEqual(5)
    expect(throughput.recent[0]!.at).toBeLessThan(27 * MINUTE)
    expect(throughput.recent.at(-1)).toEqual({ at: 30 * MINUTE, done: 300 })
  })

  it('does not mutate the previous state', () => {
    const before = startThroughput(0)
    recordProgress(before, { at: SECOND, done: 1 })
    expect(before.recent).toHaveLength(1)
  })
})

describe('estimateRemaining', () => {
  it('waits for a first answer before guessing anything', () => {
    expect(estimateRemaining(startThroughput(0), 100, MINUTE)).toBeUndefined()
  })

  it('waits for a few seconds of history before guessing anything', () => {
    const throughput = recordProgress(startThroughput(0), { at: 2 * SECOND, done: 20 })
    expect(estimateRemaining(throughput, 100, 3 * SECOND)).toBeUndefined()
  })

  it('brackets the time a steady pace needs', () => {
    const range = estimateRemaining(steady(10, 10), 600, 10 * MINUTE)
    expect(range?.low).toBeLessThanOrEqual(HOUR)
    expect(range?.high).toBeGreaterThanOrEqual(HOUR)
  })

  it('widens the range when the recent pace dropped below the average', () => {
    let throughput = steady(100, 10)
    for (let minute = 11; minute <= 20; minute++) {
      throughput = recordProgress(throughput, { at: minute * MINUTE, done: 1000 + (minute - 10) })
    }
    const range = estimateRemaining(throughput, 1000, 20 * MINUTE)
    expect(range?.low).toBeLessThan(30 * MINUTE)
    expect(range?.high).toBeGreaterThan(10 * HOUR)
  })

  it('stretches as a stall goes on, since nothing arrives while the clock runs', () => {
    const throughput = steady(10, 10)
    const early = estimateRemaining(throughput, 600, 10 * MINUTE)
    const later = estimateRemaining(throughput, 600, 20 * MINUTE)
    expect(later?.low).toBeGreaterThan(early?.low ?? 0)
  })

  it('has no upper bound once nothing came back in the recent window', () => {
    const throughput = steady(10, 10)
    const range = estimateRemaining(throughput, 600, 30 * MINUTE)
    expect(range?.low).toBeGreaterThan(0)
    expect(range?.high).toBeUndefined()
  })

  it('never promises less than the rate-limit wait already announced', () => {
    const range = estimateRemaining(steady(1000, 10), 10, 10 * MINUTE, 10 * MINUTE + 90 * SECOND)
    expect(range?.low).toBeGreaterThanOrEqual(90 * SECOND)
    expect(range?.high).toBeGreaterThanOrEqual(range?.low ?? 0)
  })

  it('is zero once nothing is left', () => {
    expect(estimateRemaining(startThroughput(0), 0, 0)).toEqual({ low: 0, high: 0 })
  })
})

describe('capEta', () => {
  it('keeps a mod from finishing after the run it belongs to', () => {
    expect(
      capEta({ low: 2 * MINUTE, high: 5 * MINUTE }, { low: MINUTE, high: 3 * MINUTE })
    ).toEqual({ low: 2 * MINUTE, high: 3 * MINUTE })
  })

  it('pulls the floor down with the ceiling', () => {
    expect(
      capEta({ low: 10 * MINUTE, high: 20 * MINUTE }, { low: MINUTE, high: 3 * MINUTE })
    ).toEqual({ low: 3 * MINUTE, high: 3 * MINUTE })
  })

  it('gives an unbounded range the ceiling as its upper bound', () => {
    expect(capEta({ low: MINUTE }, { low: MINUTE, high: 4 * MINUTE })).toEqual({
      low: MINUTE,
      high: 4 * MINUTE
    })
  })

  it('leaves the range alone when the ceiling has no upper bound, or there is no range', () => {
    expect(capEta({ low: MINUTE, high: 9 * MINUTE }, { low: MINUTE })).toEqual({
      low: MINUTE,
      high: 9 * MINUTE
    })
    expect(capEta(undefined, { low: MINUTE, high: 2 * MINUTE })).toBeUndefined()
  })
})

describe('roundDuration', () => {
  it('rounds to the minute under ten minutes', () => {
    expect(roundDuration(4 * MINUTE + 20 * SECOND)).toBe(4 * MINUTE)
  })

  it('rounds to five minutes under an hour', () => {
    expect(roundDuration(38 * MINUTE)).toBe(40 * MINUTE)
  })

  it('rounds to a quarter of an hour under three hours', () => {
    expect(roundDuration(HOUR + 38 * MINUTE)).toBe(HOUR + 45 * MINUTE)
  })

  it('rounds to half an hour beyond that', () => {
    expect(roundDuration(4 * HOUR + 10 * MINUTE)).toBe(4 * HOUR)
  })
})

describe('splitDuration', () => {
  it('splits into hours and minutes', () => {
    expect(splitDuration(2 * HOUR + 15 * MINUTE)).toEqual({ hours: 2, minutes: 15 })
  })
})

describe('describeEta', () => {
  it('says it is still estimating when there is no range yet', () => {
    expect(describeEta(undefined)).toEqual({ kind: 'estimating' })
  })

  it('gives a range of rounded durations', () => {
    expect(describeEta({ low: HOUR + 28 * MINUTE, high: 2 * HOUR + 20 * MINUTE })).toEqual({
      kind: 'range',
      low: { hours: 1, minutes: 30 },
      high: { hours: 2, minutes: 15 }
    })
  })

  it('collapses a range that rounds to one value', () => {
    expect(describeEta({ low: 38 * MINUTE, high: 42 * MINUTE })).toEqual({
      kind: 'about',
      duration: { hours: 0, minutes: 40 }
    })
  })

  it('gives only a floor when the range has no upper bound', () => {
    expect(describeEta({ low: 20 * MINUTE })).toEqual({
      kind: 'at-least',
      duration: { hours: 0, minutes: 20 }
    })
  })

  it('says under a minute when even the upper bound is that short', () => {
    expect(describeEta({ low: 10 * SECOND, high: 40 * SECOND })).toEqual({
      kind: 'under-a-minute'
    })
  })

  it('never shows a floor below one minute', () => {
    expect(describeEta({ low: 5 * SECOND, high: 7 * MINUTE })).toEqual({
      kind: 'range',
      low: { hours: 0, minutes: 1 },
      high: { hours: 0, minutes: 7 }
    })
  })
})

const translateMod = (
  over: Partial<Extract<JobEvent, { type: 'translate-mod' }>> = {}
): JobEvent => ({
  type: 'translate-mod',
  jobId: 'j',
  modId: 'a',
  modName: 'Mod A',
  language: 'ru',
  total: 120,
  pending: 100,
  done: 0,
  ...over
})

const modProgress = (done: number, runDone: number, finished = false, modId = 'a'): JobEvent => ({
  type: 'translate-mod-progress',
  jobId: 'j',
  modId,
  language: 'ru',
  done,
  finished,
  runDone
})

const replay = (events: ReadonlyArray<readonly [JobEvent, number]>): EstimateState =>
  events.reduce((state, [event, at]) => applyEstimateEvent(state, event, at), EMPTY_ESTIMATES)

describe('applyEstimateEvent', () => {
  it('leaves the state untouched for an event it does not follow', () => {
    expect(applyEstimateEvent(EMPTY_ESTIMATES, { type: 'log', jobId: 'j', message: 'x' }, 0)).toBe(
      EMPTY_ESTIMATES
    )
  })

  it('shows the counting pass, then drops it once the workload is known', () => {
    const counting = replay([[{ type: 'translate-counting', jobId: 'j', done: 2, total: 5 }, 0]])
    expect(counting.counting).toEqual({ done: 2, total: 5 })

    const known = applyEstimateEvent(
      counting,
      { type: 'translate-workload', jobId: 'j', total: 900 },
      0
    )
    expect(known.counting).toBeNull()
    expect(known.run?.total).toBe(900)
  })

  it('has no run estimate when nothing needs the backend', () => {
    const state = replay([[{ type: 'translate-workload', jobId: 'j', total: 0 }, 0]])
    expect(state.run).toBeNull()
    expect(buildEstimateView(state, 0)).toBeUndefined()
  })

  it('measures the run on the count the pipeline settled, not on a mod', () => {
    const state = replay([
      [{ type: 'translate-workload', jobId: 'j', total: 900 }, 0],
      [translateMod(), 0],
      [modProgress(10, 42), MINUTE]
    ])
    expect(state.run?.done).toBe(42)
    expect(state.run?.throughput.recent.at(-1)?.done).toBe(42)
    expect(state.mods[0]?.done).toBe(10)
  })

  it('follows each mod on its own and drops it once it is finished', () => {
    const state = replay([
      [{ type: 'translate-workload', jobId: 'j', total: 900 }, 0],
      [translateMod({ modId: 'a', pending: 100 }), 0],
      [translateMod({ modId: 'b', modName: 'Mod B', pending: 40 }), 0],
      [modProgress(30, 30), SECOND],
      [modProgress(40, 70, true, 'b'), SECOND]
    ])
    expect(state.mods.map(mod => [mod.modId, mod.done, mod.pending])).toEqual([['a', 30, 100]])
  })

  it('replaces a mod announced again for its next language', () => {
    const state = replay([
      [translateMod({ language: 'ru' }), 0],
      [translateMod({ language: 'fr' }), 0]
    ])
    expect(state.mods.map(mod => mod.language)).toEqual(['fr'])
  })

  it('keeps when a rate-limit wait ends, and forgets it once it did', () => {
    const waiting = replay([[{ type: 'translate-wait', jobId: 'j', resumesAt: 123_456 }, 0]])
    expect(waiting.resumesAt).toBe(123_456)
    expect(
      applyEstimateEvent(waiting, { type: 'translate-wait', jobId: 'j', resumesAt: null }, 0)
        .resumesAt
    ).toBeNull()
  })
})

describe('buildEstimateView', () => {
  it('is still estimating before any answer came back', () => {
    const state = replay([[{ type: 'translate-workload', jobId: 'j', total: 100 }, 0]])
    expect(buildEstimateView(state, MINUTE)?.run.eta).toEqual({ kind: 'estimating' })
  })

  it('brackets what is left of the run at the pace measured so far', () => {
    const state = replay([
      [{ type: 'translate-workload', jobId: 'j', total: 800 }, 0],
      [translateMod(), 0],
      [modProgress(50, 100), 10 * MINUTE]
    ])
    expect(buildEstimateView(state, 10 * MINUTE)?.run.eta.kind).toBe('range')
  })

  it('never gives a mod more time than the whole run has left', () => {
    const state = replay([
      [{ type: 'translate-workload', jobId: 'j', total: 110 }, 0],
      [translateMod({ pending: 1000 }), 0],
      [modProgress(10, 100), 10 * MINUTE]
    ])
    const view = buildEstimateView(state, 10 * MINUTE)
    expect(view?.mods[0]?.eta).toEqual(view?.run.eta)
  })

  it('never shows more settled than announced', () => {
    const state = replay([
      [{ type: 'translate-workload', jobId: 'j', total: 10 }, 0],
      [translateMod({ pending: 5 }), 0],
      [modProgress(9, 20), MINUTE]
    ])
    const view = buildEstimateView(state, MINUTE)
    expect(view?.run).toMatchObject({ done: 10, total: 10 })
    expect(view?.mods[0]).toMatchObject({ done: 5, total: 5 })
  })

  it('counts a rate-limit wait down in whole seconds, and drops it once over', () => {
    const state = replay([
      [{ type: 'translate-workload', jobId: 'j', total: 100 }, 0],
      [{ type: 'translate-wait', jobId: 'j', resumesAt: 10_500 }, 0]
    ])
    expect(buildEstimateView(state, 1_000)?.waitSeconds).toBe(10)
    expect(buildEstimateView(state, 11_000)?.waitSeconds).toBeNull()
  })
})
