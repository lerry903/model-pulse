-- Verify final initialization schemas in an isolated test database.
DO $$
DECLARE
    model_id uuid;
    template_id uuid;
    config_id uuid;
    row_count integer;
BEGIN
    IF (SELECT count(*) FROM __SCHEMA__.check_providers WHERE id IN ('openai','gemini','anthropic','xai','zhipu')) <> 5 THEN
        RAISE EXCEPTION 'Missing built-in providers';
    END IF;
    INSERT INTO __SCHEMA__.check_providers (id,name) VALUES ('custom-vendor','Custom vendor');
    INSERT INTO __SCHEMA__.check_request_templates (name,provider_id,metadata)
        VALUES ('custom-default','custom-vendor','{"temperature":0}') RETURNING id INTO template_id;
    INSERT INTO __SCHEMA__.check_models (provider_id,model,template_id)
        VALUES ('custom-vendor','new-model',template_id) RETURNING id INTO model_id;
    INSERT INTO __SCHEMA__.check_configs (name,provider_id,protocol,model_id,endpoint,api_key)
        VALUES ('custom-probe','custom-vendor','openai_compatible',model_id,'https://example.com/v1/chat/completions','test-key') RETURNING id INTO config_id;
    INSERT INTO __SCHEMA__.check_history (config_id,status,latency_ms,ping_latency_ms,checked_at)
        VALUES (config_id,'operational',40,3.5,now());
    SELECT count(*) INTO row_count FROM __SCHEMA__.get_recent_check_history(60,ARRAY[config_id]) h
        WHERE h.provider->>'id' = 'custom-vendor' AND h.provider->>'name' = 'Custom vendor'
          AND h.protocol='openai_compatible' AND h.ping_latency_ms=3.5
          AND h.provider->>'official_status_source' IS NULL;
    IF row_count<>1 THEN RAISE EXCEPTION 'History lost supplier identity, protocol or ping precision'; END IF;
    BEGIN
        UPDATE __SCHEMA__.check_configs SET provider_id='xai' WHERE id=config_id;
        RAISE EXCEPTION 'Mismatched model supplier accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        UPDATE __SCHEMA__.check_request_templates SET provider_id='xai' WHERE id=template_id;
        RAISE EXCEPTION 'Reverse template supplier mutation accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        UPDATE __SCHEMA__.check_models SET provider_id='xai' WHERE id=model_id;
        RAISE EXCEPTION 'Reverse model supplier mutation accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    DELETE FROM __SCHEMA__.check_request_templates WHERE id=template_id;
    IF NOT EXISTS (SELECT 1 FROM __SCHEMA__.check_models m WHERE m.id=model_id AND m.provider_id='custom-vendor' AND m.template_id IS NULL) THEN
        RAISE EXCEPTION 'Deleting a template changed its model supplier';
    END IF;
END;
$$;
