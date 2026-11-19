import assert from 'node:assert/strict';
import {test} from 'node:test';

test('Shared protocols do not cause suppliers to inherit another supplier official status', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Snapshot assembly must not fetch'); });
  const outage = {status: 'down', message: 'OpenAI outage', checkedAt: '2026-11-19T00:00:00Z'};
  globalThis.__MODEL_PULSE_OFFICIAL_STATUS_CACHE__ = new Map([['openai', outage]]);
  const {buildProviderTimelines} = await import('../lib/core/health-snapshot-service.ts');
  const base = {
    name: 'Probe', protocol: 'openai_chat', endpoint: 'https://example.com/v1/chat/completions',
    model: 'test', status: 'operational', latencyMs: 40, pingLatencyMs: 3,
    checkedAt: '2026-11-19T00:00:00Z', message: 'ok',
  };
  const supplier = (id, source) => ({id, name: id, icon: null, officialStatusSource: source});
  const timelines = buildProviderTimelines({
    xai: [{...base, id: 'xai', provider: supplier('xai', null)}],
    glm: [{...base, id: 'glm', provider: supplier('zhipu', null)}],
    openai: [{...base, id: 'openai', provider: supplier('openai', 'openai')}],
  }, [{...base, id: 'maintenance', provider: supplier('custom', null), apiKey: 'test', is_maintenance: true}]);
  const latest = new Map(timelines.map((timeline) => [timeline.id, timeline.latest]));
  assert.equal(latest.get('xai').officialStatus, undefined);
  assert.equal(latest.get('glm').officialStatus, undefined);
  assert.deepEqual(latest.get('openai').officialStatus, outage);
  assert.equal(latest.get('maintenance').status, 'maintenance');
  assert.equal(latest.get('maintenance').provider.id, 'custom');
  assert.equal(latest.get('maintenance').officialStatus, undefined);
  assert.equal('apiKey' in latest.get('maintenance'), false);
});
