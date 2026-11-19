import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mapProviderConfig} from '../lib/database/provider-config.ts';

function row() {
  return {
    id: 'probe', name: 'GLM', provider_id: 'zhipu', protocol: 'openai_compatible',
    model_id: 'model', endpoint: 'https://example.com/v4/chat/completions', api_key: 'test-key', is_maintenance: false,
    group_name: 'Direct',
    check_providers: {id: 'zhipu', name: '智谱', icon: null, official_status_source: null},
    check_models: {id: 'model', provider_id: 'zhipu', model: 'glm-test', check_request_templates: {
      provider_id: 'zhipu', request_header: {'X-Test': 'yes'}, metadata: {temperature: 0},
    }},
  };
}

test('Supplier identity, protocol and template configuration remain independent', () => {
  const result = mapProviderConfig(row());
  assert.equal(result.provider.id, 'zhipu');
  assert.equal(result.provider.name, '智谱');
  assert.equal(result.provider.officialStatusSource, null);
  assert.equal(result.protocol, 'openai_compatible');
  assert.deepEqual(result.requestHeaders, {'X-Test': 'yes'});
  assert.deepEqual(result.metadata, {temperature: 0});
});

test('Both relationship shapes returned by PostgREST are accepted', () => {
  const data = row();
  data.check_providers = [data.check_providers];
  data.check_models.check_request_templates = [data.check_models.check_request_templates];
  data.check_models = [data.check_models];
  assert.equal(mapProviderConfig(data).model, 'glm-test');
});

test('Mismatched suppliers and missing models fail before any probe is sent', () => {
  const data = row();
  data.check_models.provider_id = 'other';
  assert.throws(() => mapProviderConfig(data), /关联无效/);
  data.check_models = null;
  assert.throws(() => mapProviderConfig(data), /关联无效/);
});

test('Templates from another supplier and unknown protocols are rejected', () => {
  const data = row();
  data.check_models.check_request_templates.provider_id = 'other';
  assert.throws(() => mapProviderConfig(data), /模板供应商不匹配/);
  data.check_models.check_request_templates = null;
  data.protocol = 'unknown';
  assert.throws(() => mapProviderConfig(data), /不支持的 API 协议/);
});

test('Malformed template JSON is rejected before HTTP headers or request bodies are built', () => {
  const data = row();
  data.check_models.check_request_templates.request_header = {'X-Test': 42};
  assert.throws(() => mapProviderConfig(data), /请求头必须是字符串字典/);
  data.check_models.check_request_templates.request_header = null;
  data.check_models.check_request_templates.metadata = ['invalid'];
  assert.throws(() => mapProviderConfig(data), /请求参数必须是 JSON 对象/);
});
