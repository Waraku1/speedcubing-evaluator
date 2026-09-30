BEGIN;

ALTER TABLE saved_analyses
  RENAME COLUMN evaluation_schema_version
  TO evaluate_api_schema_version;

ALTER TABLE saved_analyses
  RENAME COLUMN evaluation_json
  TO analysis_json;

ALTER TABLE saved_analyses
  RENAME CONSTRAINT saved_analyses_evaluation_schema_v1
  TO saved_analyses_evaluate_api_schema_v1;

COMMIT;
