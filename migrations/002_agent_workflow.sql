ALTER TABLE workspace_items DROP CONSTRAINT workspace_items_kind_check;
ALTER TABLE workspace_items ADD CONSTRAINT workspace_items_kind_check CHECK (kind IN ('projects','issues','documents','tasks'));
CREATE TABLE workspace_agent_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 8000),
  instructions text NOT NULL CHECK (length(instructions) BETWEEN 1 AND 32000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_runs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  issue_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('Queued','Running','Completed','Failed','Interrupted')),
  settings jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (workspace_id, issue_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES workspace_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, issue_id) REFERENCES workspace_items(workspace_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX agent_runs_one_active_project ON agent_runs(workspace_id,project_id) WHERE status='Running';
CREATE INDEX agent_runs_pending ON agent_runs(workspace_id,project_id,created_at,id) WHERE status IN ('Queued','Running');
CREATE TABLE agent_run_events (
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  type text NOT NULL CHECK (type IN ('text','tool','status')),
  text text NOT NULL CHECK (octet_length(text)<=65536),
  PRIMARY KEY (run_id,seq)
);
