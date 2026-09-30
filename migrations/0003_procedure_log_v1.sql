BEGIN;

CREATE TABLE procedure_logs (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  label TEXT NULL,
  cube_format TEXT NOT NULL,
  cube_facelets TEXT NOT NULL,
  cube_state_id TEXT NOT NULL,
  moves_json JSONB NOT NULL,
  htm INTEGER NOT NULL,
  qtm INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT procedure_logs_owner_id_v1 CHECK (owner_id ~ '^github:[0-9]{1,20}$'),
  CONSTRAINT procedure_logs_schema_version_v1 CHECK (schema_version = '1.0'),
  CONSTRAINT procedure_logs_label_v1 CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 120),
  CONSTRAINT procedure_logs_cube_format_v1 CHECK (cube_format = 'URFDLB_FACELETS_V1'),
  CONSTRAINT procedure_logs_cube_facelets_v1 CHECK (cube_facelets ~ '^[URFDLB]{54}$'),
  CONSTRAINT procedure_logs_cube_state_id_v1 CHECK (cube_state_id ~ '^[a-f0-9]{64}$'),
  CONSTRAINT procedure_logs_moves_v1 CHECK (
    jsonb_typeof(moves_json) = 'array'
    AND jsonb_array_length(moves_json) BETWEEN 0 AND 512
  ),
  CONSTRAINT procedure_logs_htm_v1 CHECK (
    htm BETWEEN 0 AND 512
    AND htm = jsonb_array_length(moves_json)
  ),
  CONSTRAINT procedure_logs_qtm_v1 CHECK (qtm BETWEEN htm AND 1024),
  CONSTRAINT procedure_logs_timestamps_v1 CHECK (updated_at >= created_at)
);

CREATE INDEX procedure_logs_owner_created_v1
  ON procedure_logs (owner_id, created_at DESC, id DESC);

CREATE INDEX procedure_logs_owner_id_v1
  ON procedure_logs (owner_id, id);

COMMIT;
