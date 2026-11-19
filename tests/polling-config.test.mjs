import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getPollingIntervalSeconds, getPollingIntervalMs, getPollingIntervalLabel} from '../lib/core/polling-config.ts';

function withInterval(value, check) {
  const previous = process.env.CHECK_POLL_INTERVAL_SECONDS;
  if (value === undefined) delete process.env.CHECK_POLL_INTERVAL_SECONDS;
  else process.env.CHECK_POLL_INTERVAL_SECONDS = value;
  try {
    check();
  } finally {
    if (previous === undefined) delete process.env.CHECK_POLL_INTERVAL_SECONDS;
    else process.env.CHECK_POLL_INTERVAL_SECONDS = previous;
  }
}

test('Polling accepts integer intervals beyond 600 seconds without truncation', () => {
  for (const seconds of [600, 601, 901, 3600, 86400, 2592000, Math.floor(Number.MAX_SAFE_INTEGER / 1000)]) {
    withInterval(String(seconds), () => {
      assert.equal(getPollingIntervalSeconds(), seconds);
      assert.equal(getPollingIntervalMs(), seconds * 1000);
    });
  }
});

test('Polling retains the 15-second minimum', () => {
  for (const seconds of [1, 14, 15, 16]) {
    withInterval(String(seconds), () => {
      assert.equal(getPollingIntervalSeconds(), Math.max(15, seconds));
    });
  }
});

test('Missing, invalid, fractional and unsafe polling intervals use the 60-second default', () => {
  for (const value of [undefined, '', ' ', 'bad', '0', '-1', '15.5', '600.5', 'Infinity', 'NaN', String(Number.MAX_SAFE_INTEGER)]) {
    withInterval(value, () => assert.equal(getPollingIntervalSeconds(), 60, String(value)));
  }
});

test('Polling labels reflect the configured long interval', () => {
  withInterval('901', () => assert.equal(getPollingIntervalLabel(), '901 秒'));
  withInterval('3600', () => assert.equal(getPollingIntervalLabel(), '60 分钟'));
});
