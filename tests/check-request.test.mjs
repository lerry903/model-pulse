import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkWithAiSdk} from '../lib/providers/ai-sdk-check.ts';

const baseConfig = {
  id: 'probe', name: 'probe', provider: {id: 'openai', name: 'OpenAI', icon: 'openai', officialStatusSource: 'openai'}, protocol: 'openai_chat',
  endpoint: 'https://provider.example/v1/chat/completions',
  model: 'test-model', apiKey: 'test-only-key', is_maintenance: false,
};

async function captureRequest(t, overrides) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    if (init?.method === 'POST') {
      requests.push({url: new URL(input instanceof Request ? input.url : input), headers: new Headers(init.headers), body: JSON.parse(init.body)});
      return Response.json({error: {message: 'test rejection', type: 'invalid_request_error'}}, {status: 400});
    }
    return new Response(null, {status: 200});
  });
  const result = await checkWithAiSdk({...baseConfig, ...overrides});
  assert.equal(result.status, 'error');
  assert.equal(requests.length, 1);
  return requests[0];
}

test('Chat requests retain query parameters, custom headers and template parameters', async (t) => {
  const request = await captureRequest(t, {
    endpoint: baseConfig.endpoint + '?region=cn&tag=a&tag=b',
    requestHeaders: {Authorization: 'Bearer custom-key', 'X-Probe': 'yes'},
    metadata: {temperature: 0, model: 'forbidden', messages: ['forbidden']},
  });
  assert.equal(request.url.pathname, '/v1/chat/completions');
  assert.deepEqual(request.url.searchParams.getAll('tag'), ['a', 'b']);
  assert.equal(request.url.searchParams.get('region'), 'cn');
  assert.equal(request.headers.get('authorization'), 'Bearer custom-key');
  assert.equal(request.headers.get('x-probe'), 'yes');
  assert.equal(request.body.model, 'test-model');
  assert.equal(request.body.temperature, 0);
  assert.notDeepEqual(request.body.messages, ['forbidden']);
});

test('Responses requests use the responses endpoint and input payload', async (t) => {
  const request = await captureRequest(t, {protocol: 'openai_responses', endpoint: 'https://provider.example/v1/responses?region=eu'});
  assert.equal(request.url.pathname, '/v1/responses');
  assert.ok(request.body.input);
  assert.equal(request.url.searchParams.get('region'), 'eu');
});

test('Anthropic requests use Messages and API key authentication', async (t) => {
  const request = await captureRequest(t, {protocol: 'anthropic_messages', endpoint: 'https://provider.example/v1/messages'});
  assert.equal(request.url.pathname, '/v1/messages');
  assert.equal(request.headers.get('x-api-key'), 'test-only-key');
  assert.equal(request.body.max_tokens, 24);
});

test('Native Gemini requests use the configured model and streaming API', async (t) => {
  const request = await captureRequest(t, {protocol: 'gemini_native', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/ignored:generateContent'});
  assert.equal(request.url.pathname, '/v1beta/models/test-model:streamGenerateContent');
  assert.equal(request.url.searchParams.get('alt'), 'sse');
  assert.equal(request.headers.get('x-goog-api-key'), 'test-only-key');
});

test('An arbitrary supplier uses the selected protocol without a vendor branch', async (t) => {
  const request = await captureRequest(t, {
    provider: {id: 'new-vendor', name: 'New vendor', icon: null, officialStatusSource: null},
    protocol: 'openai_compatible', model: 'glm-test',
  });
  assert.equal(request.url.pathname, '/v1/chat/completions');
  assert.equal(request.body.model, 'glm-test');
  assert.equal(request.headers.get('authorization'), 'Bearer test-only-key');
});

test('Native Gemini supports proxy hosts, custom versions and endpoint queries', async (t) => {
  const request = await captureRequest(t, {
    protocol: 'gemini_native',
    endpoint: 'https://proxy.example/google/v1beta/models/ignored:generateContent?tenant=one',
  });
  assert.equal(request.url.hostname, 'proxy.example');
  assert.equal(request.url.pathname, '/google/v1beta/models/test-model:streamGenerateContent');
  assert.equal(request.url.searchParams.get('tenant'), 'one');
  assert.equal(request.url.searchParams.get('alt'), 'sse');
});

test('Explicit protocol is authoritative even when the configured suffix differs', async (t) => {
  const request = await captureRequest(t, {protocol: 'openai_chat', endpoint: 'https://provider.example/v1/responses'});
  assert.equal(request.url.pathname, '/v1/chat/completions');
  assert.ok(request.body.messages);
});

test('OpenAI reasoning model directives are preserved', async (t) => {
  const request = await captureRequest(t, {model: 'o3@high'});
  assert.equal(request.body.model, 'o3');
  assert.equal(request.body.reasoning_effort, 'high');
});

test('A successful streamed probe validates the answer and preserves supplier identity', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  const {generateChallenge} = await import('../lib/providers/challenge.ts');
  const answer = generateChallenge().expectedAnswer;
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    if (init?.method !== 'POST') return new Response(null, {status: 200});
    const chunks = [
      {id: 'chat-test', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{index: 0, delta: {content: ' '}, finish_reason: null}]},
      {id: 'chat-test', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{index: 0, delta: {content: answer}, finish_reason: null}]},
      {id: 'chat-test', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{index: 0, delta: {}, finish_reason: 'stop'}]},
    ];
    return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', {headers: {'Content-Type': 'text/event-stream'}});
  });
  const config = {...baseConfig, provider: {id: 'xai', name: 'xAI', icon: 'xai', officialStatusSource: null}};
  const result = await checkWithAiSdk(config);
  assert.equal(result.status, 'operational');
  assert.equal(result.challenge.passed, true);
  assert.deepEqual(result.provider, config.provider);
  assert.equal(result.protocol, 'openai_chat');
  assert.equal(typeof result.latencyMs, 'number');
  assert.equal('apiKey' in result, false);
});
