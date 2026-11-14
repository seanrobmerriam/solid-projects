CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id, workspace_id);
CREATE TABLE IF NOT EXISTS workspace_items (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('projects', 'issues', 'documents')),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  storage_key text,
  filename text,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  CHECK (storage_key IS NULL OR kind = 'documents')
);
CREATE INDEX IF NOT EXISTS workspace_items_collection_idx ON workspace_items(workspace_id, kind, created_at DESC, id);
