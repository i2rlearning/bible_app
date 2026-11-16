-- Durable, owner-scoped Study conflict evidence and resolution ledger.
--
-- Apply once to an existing database after taking the normal operational backup.
-- This migration is additive: it does not rewrite or delete saved_studies,
-- sync_mutations, or sync_change_log rows.
BEGIN;

CREATE TABLE study_revisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT NOT NULL,
    study_id            UUID NOT NULL,
    revision_kind       TEXT NOT NULL,
    snapshot            JSONB NOT NULL,
    source_device_id    UUID,
    source_mutation_id  UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT study_revisions_kind_check
        CHECK (revision_kind IN ('base', 'local', 'remote', 'resolution')),
    CONSTRAINT study_revisions_snapshot_object_check
        CHECK (jsonb_typeof(snapshot) = 'object'),
    CONSTRAINT study_revisions_user_id_id_unique
        UNIQUE (user_id, id),
    CONSTRAINT study_revisions_user_study_id_id_unique
        UNIQUE (user_id, study_id, id)
);

CREATE INDEX study_revisions_user_study_created_idx
    ON study_revisions (user_id, study_id, created_at DESC);

-- Conflict cases deliberately do not reference saved_studies. A deletion
-- tombstone may be the only durable evidence for a conflicted Study.
CREATE TABLE study_conflict_cases (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 TEXT NOT NULL,
    study_id                UUID NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'open',
    case_version            INTEGER NOT NULL DEFAULT 1,
    base_revision_id        UUID NOT NULL,
    local_revision_id       UUID NOT NULL,
    remote_revision_id      UUID NOT NULL,
    resolution_revision_id  UUID,
    opened_by_mutation_id   UUID,
    resolved_by_operation_id UUID,
    opened_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deferred_at             TIMESTAMPTZ,
    resolved_at             TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT study_conflict_cases_status_check
        CHECK (status IN ('open', 'deferred', 'resolved')),
    CONSTRAINT study_conflict_cases_version_check
        CHECK (case_version >= 1),
    CONSTRAINT study_conflict_cases_user_id_id_unique
        UNIQUE (user_id, id),
    CONSTRAINT study_conflict_cases_user_study_id_id_unique
        UNIQUE (user_id, study_id, id),
    CONSTRAINT study_conflict_cases_base_revision_fkey
        FOREIGN KEY (user_id, study_id, base_revision_id)
        REFERENCES study_revisions (user_id, study_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT study_conflict_cases_local_revision_fkey
        FOREIGN KEY (user_id, study_id, local_revision_id)
        REFERENCES study_revisions (user_id, study_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT study_conflict_cases_remote_revision_fkey
        FOREIGN KEY (user_id, study_id, remote_revision_id)
        REFERENCES study_revisions (user_id, study_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT study_conflict_cases_resolution_revision_fkey
        FOREIGN KEY (user_id, study_id, resolution_revision_id)
        REFERENCES study_revisions (user_id, study_id, id)
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX study_conflict_cases_one_active_per_study_idx
    ON study_conflict_cases (user_id, study_id)
    WHERE status IN ('open', 'deferred');

CREATE INDEX study_conflict_cases_user_status_updated_idx
    ON study_conflict_cases (user_id, status, updated_at DESC);

CREATE TABLE study_conflict_case_revisions (
    user_id      TEXT NOT NULL,
    case_id      UUID NOT NULL,
    study_id     UUID NOT NULL,
    revision_id  UUID NOT NULL,
    attached_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT study_conflict_case_revisions_pkey
        PRIMARY KEY (user_id, case_id, revision_id),
    CONSTRAINT study_conflict_case_revisions_case_fkey
        FOREIGN KEY (user_id, study_id, case_id)
        REFERENCES study_conflict_cases (user_id, study_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT study_conflict_case_revisions_revision_fkey
        FOREIGN KEY (user_id, study_id, revision_id)
        REFERENCES study_revisions (user_id, study_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX study_conflict_case_revisions_case_attached_idx
    ON study_conflict_case_revisions (user_id, case_id, attached_at ASC);

CREATE TABLE study_conflict_resolution_operations (
    user_id                 TEXT NOT NULL,
    operation_id            UUID NOT NULL,
    case_id                 UUID NOT NULL,
    expected_case_version   INTEGER NOT NULL,
    operation_type          TEXT NOT NULL,
    request_json            JSONB NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'accepted',
    result_json             JSONB,
    resulting_case_version  INTEGER,
    error_code              TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    CONSTRAINT study_conflict_resolution_operations_pkey
        PRIMARY KEY (user_id, operation_id),
    CONSTRAINT study_conflict_resolution_operations_case_fkey
        FOREIGN KEY (user_id, case_id)
        REFERENCES study_conflict_cases (user_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT study_conflict_resolution_operations_expected_version_check
        CHECK (expected_case_version >= 1),
    CONSTRAINT study_conflict_resolution_operations_type_check
        CHECK (operation_type IN ('defer', 'use_remote', 'keep_local', 'keep_both', 'merge')),
    CONSTRAINT study_conflict_resolution_operations_status_check
        CHECK (status IN ('accepted', 'completed', 'rejected')),
    CONSTRAINT study_conflict_resolution_operations_result_version_check
        CHECK (resulting_case_version IS NULL OR resulting_case_version >= 1),
    CONSTRAINT study_conflict_resolution_operations_request_object_check
        CHECK (jsonb_typeof(request_json) = 'object')
);

CREATE INDEX study_conflict_resolution_operations_case_created_idx
    ON study_conflict_resolution_operations (user_id, case_id, created_at DESC);

-- Revision evidence is append-only. Retention, if ever required, must be an
-- explicit administrative migration rather than an application-side update.
CREATE OR REPLACE FUNCTION prevent_study_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'study_revisions are immutable';
END;
$$;

CREATE TRIGGER study_revisions_immutable
BEFORE UPDATE OR DELETE ON study_revisions
FOR EACH ROW
EXECUTE FUNCTION prevent_study_revision_mutation();

COMMIT;
