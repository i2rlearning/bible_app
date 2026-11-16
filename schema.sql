-- ===========================================================================
-- Bible App Database Schema
-- PostgreSQL
--
-- Canonical schema for a fresh Bible App database.
-- PostgreSQL is the application contract; the database host is replaceable.
--
-- The current application authenticates with Clerk. The legacy users table is
-- retained only so a fresh database can reproduce the existing database safely.
-- New application features must not depend on the legacy users table.
--
-- For an existing database, use explicit migration files instead of re-running
-- this complete schema file.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger helper for Study Desk entries.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_saved_studies_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rich-text notes saved for individual Bible pages.
-- page_key is the logical per-user identity used by the application.
-- ---------------------------------------------------------------------------
CREATE TABLE saved_quill_notes (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             TEXT NOT NULL,
    bible_version_id    VARCHAR(255) NOT NULL,
    bible_chapter_id    VARCHAR(255) NOT NULL,
    page_key            VARCHAR(500) NOT NULL,
    page_url            TEXT NOT NULL,
    bible_name          VARCHAR(255),
    book_chapter_label  VARCHAR(255),
    quill_delta_json    JSONB,
    quill_plain_text    TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    version             INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT saved_quill_notes_user_id_page_key_key
        UNIQUE (user_id, page_key),
    CONSTRAINT saved_quill_notes_version_check
        CHECK (version >= 1)
);

CREATE INDEX idx_quill_plain_text_search
    ON saved_quill_notes
    USING GIN (to_tsvector('english', COALESCE(quill_plain_text, '')));

CREATE INDEX idx_quill_updated_at
    ON saved_quill_notes (updated_at DESC);

CREATE INDEX idx_quill_user_page
    ON saved_quill_notes (user_id, page_key);

-- ---------------------------------------------------------------------------
-- Page-level annotations, highlights, drawings, and user formatting.
-- page_key is the logical per-user identity used by the application.
-- ---------------------------------------------------------------------------
CREATE TABLE saved_mini_editor_pages (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             TEXT NOT NULL,
    bible_version_id    VARCHAR(255) NOT NULL,
    bible_chapter_id    VARCHAR(255) NOT NULL,
    page_key            VARCHAR(500) NOT NULL,
    page_url            TEXT NOT NULL,
    bible_name          VARCHAR(255),
    book_chapter_label  VARCHAR(255),
    mini_editor_json    JSONB NOT NULL,
    has_highlights      BOOLEAN DEFAULT FALSE,
    has_drawings        BOOLEAN DEFAULT FALSE,
    has_text_formats    BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    version             INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT saved_mini_editor_pages_user_id_page_key_key
        UNIQUE (user_id, page_key),
    CONSTRAINT saved_mini_editor_pages_version_check
        CHECK (version >= 1)
);

CREATE INDEX idx_mini_updated_at
    ON saved_mini_editor_pages (updated_at DESC);

CREATE INDEX idx_mini_user_page
    ON saved_mini_editor_pages (user_id, page_key);

-- ---------------------------------------------------------------------------
-- Per-user Study Desk categories.
-- The composite unique key supports user-boundary foreign keys from studies.
-- ---------------------------------------------------------------------------
CREATE TABLE user_study_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#dbeafe',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version     INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT user_study_categories_user_id_id_unique
        UNIQUE (user_id, id),
    CONSTRAINT user_study_categories_user_id_name_key
        UNIQUE (user_id, name),
    CONSTRAINT user_study_categories_version_check
        CHECK (version >= 1)
);

CREATE INDEX user_study_categories_user_sort_idx
    ON user_study_categories (user_id, sort_order, name);

-- ---------------------------------------------------------------------------
-- Default category templates used when a Clerk user first opens Study Desk.
-- ---------------------------------------------------------------------------
CREATE TABLE study_category_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#dbeafe',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT study_category_templates_name_key UNIQUE (name)
);

-- ---------------------------------------------------------------------------
-- Per-user Keywords. The backend calls them tags; the UI calls them Keywords.
-- The composite unique key supports user-boundary relationship constraints.
-- ---------------------------------------------------------------------------
CREATE TABLE user_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#dbeafe',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version     INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT user_tags_user_id_id_unique
        UNIQUE (user_id, id),
    CONSTRAINT user_tags_user_id_name_key
        UNIQUE (user_id, name),
    CONSTRAINT user_tags_version_check
        CHECK (version >= 1)
);

CREATE INDEX user_tags_user_sort_idx
    ON user_tags (user_id, sort_order, name);

-- ---------------------------------------------------------------------------
-- Saved Study Desk entries.
-- version provides optimistic concurrency protection between devices.
-- ---------------------------------------------------------------------------
CREATE TABLE saved_studies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT NOT NULL,
    title               TEXT NOT NULL,
    study_type          TEXT DEFAULT 'study',
    speaker             TEXT DEFAULT '',
    location            TEXT DEFAULT '',
    study_date          DATE,
    main_scripture      TEXT DEFAULT '',
    tags                JSONB DEFAULT '[]'::jsonb,
    linked_scriptures   JSONB DEFAULT '[]'::jsonb,
    content_html        TEXT DEFAULT '',
    preview_text        TEXT DEFAULT '',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    category_id         UUID,
    version             INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT saved_studies_user_id_id_unique
        UNIQUE (user_id, id),
    CONSTRAINT saved_studies_category_user_fkey
        FOREIGN KEY (user_id, category_id)
        REFERENCES user_study_categories (user_id, id)
        ON DELETE SET NULL
);

COMMENT ON COLUMN saved_studies.version IS
    'Optimistic concurrency version. Incremented on every successful study update.';

CREATE INDEX saved_studies_user_updated_idx
    ON saved_studies (user_id, updated_at DESC);

CREATE TRIGGER saved_studies_set_updated_at
BEFORE UPDATE ON saved_studies
FOR EACH ROW
EXECUTE FUNCTION update_saved_studies_updated_at();

-- ---------------------------------------------------------------------------
-- Set-membership relationship between Studies and Keywords.
-- Composite foreign keys keep relationships inside the same Clerk user.
-- ---------------------------------------------------------------------------
CREATE TABLE saved_study_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    study_id    UUID NOT NULL,
    tag_id      UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT saved_study_tags_user_id_study_id_tag_id_key
        UNIQUE (user_id, study_id, tag_id),
    CONSTRAINT saved_study_tags_study_user_fkey
        FOREIGN KEY (user_id, study_id)
        REFERENCES saved_studies (user_id, id)
        ON DELETE CASCADE,
    CONSTRAINT saved_study_tags_tag_user_fkey
        FOREIGN KEY (user_id, tag_id)
        REFERENCES user_tags (user_id, id)
        ON DELETE CASCADE
);

CREATE INDEX saved_study_tags_user_study_idx
    ON saved_study_tags (user_id, study_id);

CREATE INDEX saved_study_tags_user_tag_idx
    ON saved_study_tags (user_id, tag_id);

-- ---------------------------------------------------------------------------
-- Shared normalized Scripture references.
-- These rows are reference data rather than user-owned personal records.
-- ---------------------------------------------------------------------------
CREATE TABLE scripture_references (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_reference  TEXT NOT NULL,
    book                  TEXT NOT NULL,
    start_chapter         INTEGER NOT NULL,
    start_verse           INTEGER,
    end_chapter           INTEGER NOT NULL,
    end_verse             INTEGER,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT scripture_references_normalized_reference_key
        UNIQUE (normalized_reference),
    CONSTRAINT scripture_references_start_chapter_check
        CHECK (start_chapter > 0),
    CONSTRAINT scripture_references_end_chapter_check
        CHECK (end_chapter > 0),
    CONSTRAINT scripture_references_start_verse_check
        CHECK (start_verse IS NULL OR start_verse > 0),
    CONSTRAINT scripture_references_end_verse_check
        CHECK (end_verse IS NULL OR end_verse > 0),
    CONSTRAINT scripture_references_range_order_check
        CHECK (end_chapter >= start_chapter),
    CONSTRAINT scripture_references_range_shape_check
        CHECK (
            (start_verse IS NULL AND end_verse IS NULL)
            OR
            (start_verse IS NOT NULL AND end_verse IS NOT NULL)
        ),
    CONSTRAINT scripture_references_verse_order_check
        CHECK (
            start_verse IS NULL
            OR end_chapter > start_chapter
            OR end_verse >= start_verse
        )
);

-- ---------------------------------------------------------------------------
-- Links a user's Keyword to a normalized Scripture reference.
-- version protects editable note/order/reference state between devices.
-- ---------------------------------------------------------------------------
CREATE TABLE tag_scripture_references (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 TEXT NOT NULL,
    tag_id                  UUID NOT NULL,
    scripture_reference_id  UUID NOT NULL,
    note                    TEXT NOT NULL DEFAULT '',
    sort_order              INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version                 INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT tag_scripture_references_user_tag_reference_key
        UNIQUE (user_id, tag_id, scripture_reference_id),
    CONSTRAINT tag_scripture_references_version_check
        CHECK (version >= 1),
    CONSTRAINT tag_scripture_references_scripture_reference_id_fkey
        FOREIGN KEY (scripture_reference_id)
        REFERENCES scripture_references (id)
        ON DELETE CASCADE,
    CONSTRAINT tag_scripture_references_tag_id_fkey
        FOREIGN KEY (tag_id)
        REFERENCES user_tags (id)
        ON DELETE CASCADE,
    CONSTRAINT tag_scripture_references_tag_user_fkey
        FOREIGN KEY (user_id, tag_id)
        REFERENCES user_tags (user_id, id)
        ON DELETE CASCADE
);

CREATE INDEX tag_scripture_references_user_reference_idx
    ON tag_scripture_references (user_id, scripture_reference_id);

CREATE INDEX tag_scripture_references_user_tag_sort_idx
    ON tag_scripture_references (user_id, tag_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- Idempotency ledger for client mutations.
-- A mutation ID remains unchanged across retries, allowing the server to return
-- the previously recorded result instead of applying an operation twice.
-- ---------------------------------------------------------------------------
CREATE TABLE sync_mutations (
    user_id         TEXT NOT NULL,
    mutation_id     UUID NOT NULL,
    device_id       UUID NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_key      TEXT NOT NULL,
    operation       TEXT NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    result_version  INTEGER,
    result_json     JSONB,
    CONSTRAINT sync_mutations_pkey
        PRIMARY KEY (user_id, mutation_id),
    CONSTRAINT sync_mutations_operation_check
        CHECK (operation IN ('create', 'update', 'delete')),
    CONSTRAINT sync_mutations_result_version_check
        CHECK (result_version IS NULL OR result_version >= 1)
);

CREATE INDEX sync_mutations_user_entity_idx
    ON sync_mutations (user_id, entity_type, entity_key);

CREATE INDEX sync_mutations_user_processed_idx
    ON sync_mutations (user_id, processed_at DESC);

-- ---------------------------------------------------------------------------
-- Ordered synchronization history for device catch-up after missed events.
-- Delete rows in business tables may be physical; delete entries here provide
-- the durable information another device needs to learn about the deletion.
-- ---------------------------------------------------------------------------
CREATE TABLE sync_change_log (
    change_sequence    BIGSERIAL PRIMARY KEY,
    user_id            TEXT NOT NULL,
    entity_type        TEXT NOT NULL,
    entity_key         TEXT NOT NULL,
    operation          TEXT NOT NULL,
    resulting_version  INTEGER,
    source_device_id   UUID,
    source_mutation_id UUID,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sync_change_log_operation_check
        CHECK (operation IN ('create', 'update', 'delete')),
    CONSTRAINT sync_change_log_resulting_version_check
        CHECK (resulting_version IS NULL OR resulting_version >= 1)
);

CREATE INDEX sync_change_log_user_cursor_idx
    ON sync_change_log (user_id, change_sequence);

CREATE INDEX sync_change_log_user_entity_idx
    ON sync_change_log (user_id, entity_type, entity_key, change_sequence DESC);

-- ---------------------------------------------------------------------------
-- Durable Study conflict evidence. These tables intentionally do not hold a
-- foreign key to saved_studies: a remote deletion tombstone can be the only
-- remaining evidence for an unresolved conflict.
-- ---------------------------------------------------------------------------
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

CREATE TABLE study_conflict_cases (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  TEXT NOT NULL,
    study_id                 UUID NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'open',
    case_version             INTEGER NOT NULL DEFAULT 1,
    base_revision_id         UUID NOT NULL,
    local_revision_id        UUID NOT NULL,
    remote_revision_id       UUID NOT NULL,
    resolution_revision_id   UUID,
    opened_by_mutation_id    UUID,
    resolved_by_operation_id UUID,
    opened_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deferred_at              TIMESTAMPTZ,
    resolved_at              TIMESTAMPTZ,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
        REFERENCES study_revisions (user_id, study_id, id) ON DELETE RESTRICT,
    CONSTRAINT study_conflict_cases_local_revision_fkey
        FOREIGN KEY (user_id, study_id, local_revision_id)
        REFERENCES study_revisions (user_id, study_id, id) ON DELETE RESTRICT,
    CONSTRAINT study_conflict_cases_remote_revision_fkey
        FOREIGN KEY (user_id, study_id, remote_revision_id)
        REFERENCES study_revisions (user_id, study_id, id) ON DELETE RESTRICT,
    CONSTRAINT study_conflict_cases_resolution_revision_fkey
        FOREIGN KEY (user_id, study_id, resolution_revision_id)
        REFERENCES study_revisions (user_id, study_id, id) ON DELETE RESTRICT
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
        REFERENCES study_conflict_cases (user_id, study_id, id) ON DELETE RESTRICT,
    CONSTRAINT study_conflict_case_revisions_revision_fkey
        FOREIGN KEY (user_id, study_id, revision_id)
        REFERENCES study_revisions (user_id, study_id, id) ON DELETE RESTRICT
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
        REFERENCES study_conflict_cases (user_id, id) ON DELETE RESTRICT,
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

-- ---------------------------------------------------------------------------
-- Legacy pre-Clerk authentication table.
-- The current application does not use this table for authentication or user
-- identity. It is retained so a fresh database can reproduce the current live
-- schema without silently deleting legacy data or assumptions.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id             BIGSERIAL PRIMARY KEY,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    display_name   VARCHAR(255),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    last_login_at  TIMESTAMPTZ,
    CONSTRAINT users_email_key UNIQUE (email)
);

-- ---------------------------------------------------------------------------
-- Default Study Desk category templates.
-- The current server copies the name and sort order when a Clerk user first
-- receives personal categories. Color is currently supplied by the destination
-- table's default.
-- ---------------------------------------------------------------------------
INSERT INTO study_category_templates (name, color, sort_order, is_active)
VALUES
    ('Studies', '', 10, TRUE),
    ('Sermon', '', 20, TRUE),
    ('Lesson', '', 30, TRUE),
    ('Teaching', '', 40, TRUE),
    ('Personal Study', '', 50, TRUE),
    ('Prayer', '', 60, TRUE)
ON CONFLICT (name) DO NOTHING;
