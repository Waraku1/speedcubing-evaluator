BEGIN;

CREATE TABLE saved_analyses (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  label TEXT NULL,
  cube_format TEXT NOT NULL,
  cube_facelets TEXT NOT NULL,
  cube_state_id TEXT NOT NULL,
  evaluation_schema_version TEXT NOT NULL,
  evaluation_json JSONB NOT NULL,
  cfop_schema_version TEXT NULL,
  cfop_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT saved_analyses_owner_id_v1 CHECK (owner_id ~ '^github:[0-9]{1,20}$'),
  CONSTRAINT saved_analyses_schema_version_v1 CHECK (schema_version = '1.0'),
  CONSTRAINT saved_analyses_label_v1 CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 120),
  CONSTRAINT saved_analyses_cube_format_v1 CHECK (cube_format = 'URFDLB_FACELETS_V1'),
  CONSTRAINT saved_analyses_cube_facelets_v1 CHECK (cube_facelets ~ '^[URFDLB]{54}$'),
  CONSTRAINT saved_analyses_cube_state_id_v1 CHECK (cube_state_id ~ '^[a-f0-9]{64}$'),
  CONSTRAINT saved_analyses_evaluation_schema_v1 CHECK (evaluation_schema_version = '1.0'),
  CONSTRAINT saved_analyses_cfop_pair_v1 CHECK (
    (cfop_schema_version IS NULL AND cfop_json IS NULL)
    OR (cfop_schema_version = '1.0' AND cfop_json IS NOT NULL)
  ),
  CONSTRAINT saved_analyses_timestamps_v1 CHECK (updated_at >= created_at)
);

CREATE INDEX saved_analyses_owner_created_v1
  ON saved_analyses (owner_id, created_at DESC, id DESC);

CREATE INDEX saved_analyses_owner_id_v1
  ON saved_analyses (owner_id, id);

COMMIT;
