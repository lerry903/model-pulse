import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mapHistoryRows} from '../lib/database/history-data.ts';

const record = {
  config_id: 'probe', name: 'Custom probe', protocol: 'openai_compatible',
  provider: {id: 'custom', name: 'Custom supplier', icon: null, official_status_source: null},
  model: 'glm-test', endpoint: 'https://example.com/v1/chat/completions', group_name: 'Official',
  status: 'operational', latency_ms: 40, ping_latency_ms: 3.5, message: 'ok', checked_at: '2026-11-19T01:00:00Z',
};

test('History preserves supplier, protocol and precision without exposing credentials', () => {
  const item = mapHistoryRows([record], 60).probe[0];
  assert.deepEqual(item.provider, {id: 'custom', name: 'Custom supplier', icon: null, officialStatusSource: null});
  assert.equal(item.protocol, 'openai_compatible');
  assert.equal(item.pingLatencyMs, 3.5);
  assert.equal('type' in item, false);
  assert.equal('apiKey' in item, false);
});

test('History is grouped, sorted and limited per probe', () => {
  const latest = {...record, checked_at: '2026-11-19T02:00:00Z'};
  const other = {...record, config_id: 'second'};
  const history = mapHistoryRows([record, other, latest], 1);
  assert.equal(history.probe.length, 1);
  assert.equal(history.probe[0].checkedAt, latest.checked_at);
  assert.equal(history.second.length, 1);
  assert.deepEqual(mapHistoryRows(null, 60), {});
});
