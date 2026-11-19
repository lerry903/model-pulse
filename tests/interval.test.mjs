import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setLongInterval} from '../lib/utils/interval.ts';

const MAX_TIMER_DELAY_MS = 2_147_483_647;

test('Polling repeats only after the full interval and can be cancelled', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let calls = 0;
  const cancel = setLongInterval(() => calls++, 901_000);
  t.mock.timers.tick(900_999);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
  t.mock.timers.tick(901_000);
  assert.equal(calls, 2);
  cancel();
  t.mock.timers.tick(901_000);
  assert.equal(calls, 2);
});

test('Intervals beyond the native timer limit wait in chunks without early polling', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let calls = 0;
  const cancel = setLongInterval(() => calls++, MAX_TIMER_DELAY_MS * 2 + 1000);
  for (let round = 0; round < 2; round++) {
    t.mock.timers.tick(MAX_TIMER_DELAY_MS);
    assert.equal(calls, round);
    t.mock.timers.tick(MAX_TIMER_DELAY_MS);
    assert.equal(calls, round);
    t.mock.timers.tick(999);
    assert.equal(calls, round);
    t.mock.timers.tick(1);
    assert.equal(calls, round + 1);
  }
  cancel();
});

test('A pending long interval can be cancelled between chunks', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let calls = 0;
  const cancel = setLongInterval(() => calls++, MAX_TIMER_DELAY_MS + 1000);
  t.mock.timers.tick(MAX_TIMER_DELAY_MS);
  cancel();
  t.mock.timers.tick(1000);
  assert.equal(calls, 0);
});

test('An interval can cancel itself from its callback', (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let calls = 0;
  const cancel = setLongInterval(() => { calls++; cancel(); }, 1000);
  t.mock.timers.tick(1000);
  t.mock.timers.tick(1000);
  assert.equal(calls, 1);
});

test('Invalid timer delays fail before scheduling', () => {
  for (const delay of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => setLongInterval(() => {}, delay), RangeError);
  }
});
