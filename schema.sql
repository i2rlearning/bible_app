-- ===========================================================================
-- Bible App Database Schema
-- PostgreSQL (currently hosted on Aiven)
--
-- This file reconstructs the live database schema from information_schema
-- metadata and the SQL queries in server.js. It documents all 10 tables,
-- their columns, constraints, and indexes.
--
-- To recreate from scratch: psql "$DATABASE_URL" -f schema.sql
-- ===========================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- saved_quill_notes
-- Rich text notes per Bible page, stored as Quill editor deltas.
-- One note per user per page (unique on user_id + page_key).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_quill_notes (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             TEXT                     NOT NULL,
    bible_version_id    VARCHAR                  NOT NULL,
    bible_chapter_id    VARCHAR                  NOT NULL,
    page_key            VARCHAR                  NOT NULL,
    page_url            TEXT                     NOT NULL DEFAULT '',
    bible_name          VARCHAR,
    book_chapter_label  VARCHAR,
    quill_delta_json    JSONB,
    quill_plain_text    TEXT,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    UNIQUE (user_id, page_key)
);

CREATE INDEX IF NOT EXISTS idx_quill_notes_user_id
    ON saved_quill_notes (user_id);

CREATE INDEX IF NOT EXISTS idx_quill_notes_user_page
    ON saved_quill_notes (user_id, page_key);

-- ---------------------------------------------------------------------------
-- saved_mini_editor_pages
-- Page-level Bible annotations (highlights, drawings, text formats).
-- One page per user per page_key (unique on user_id + page_key).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_mini_editor_pages (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             TEXT                     NOT NULL,
    bible_version_id    VARCHAR                  NOT NULL,
    bible_chapter_id    VARCHAR                  NOT NULL,
    page_key            VARCHAR                  NOT NULL,
    page_url            TEXT                     NOT NULL DEFAULT '',
    bible_name          VARCHAR,
    book_chapter_label  VARCHAR,
    mini_editor_json    JSONB                    NOT NULL,
    has_highlights      BOOLEAN                  DEFAULT FALSE,
    has_drawings        BOOLEAN                  DEFAULT FALSE,
    has_text_formats    BOOLEAN                  DEFAULT FALSE,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    UNIQUE (user_id, page_key)
);

CREATE INDEX IF NOT EXISTS idx_mini_editor_user_id
    ON saved_mini_editor_pages (user_id);

CREATE INDEX IF NOT EXISTS idx_mini_editor_user_page
    ON saved_mini_editor_pages (user_id, page_key);

-- ---------------------------------------------------------------------------
-- user_study_categories
-- Per-user study categories (Studies, Sermon, Lesson, etc.).
-- Auto-seeded from study_category_templates on first use.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_study_categories (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT                     NOT NULL,
    name                TEXT                     NOT NULL,
    color               TEXT,
    sort_order          INTEGER                  NOT NULL DEFAULT 0,
    is_default          BOOLEAN                  NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_study_categories_user_id
    ON user_study_categories (user_id);

-- ---------------------------------------------------------------------------
-- study_category_templates
-- Default category templates used to seed user_study_categories
-- for new users.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_category_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT                     NOT NULL,
    color               TEXT                     NOT NULL DEFAULT '',
    sort_order          INTEGER                  NOT NULL DEFAULT 0,
    is_active           BOOLEAN                  NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- user_tags
-- Per-user keywords (called "tags" in the backend, "keywords" in the UI).
-- Each has a name, color, and sort order.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_tags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT                     NOT NULL,
    name                TEXT                     NOT NULL,
    color               TEXT                     NOT NULL DEFAULT '#dbeafe',
    sort_order          INTEGER                  NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_user_id
    ON user_tags (user_id);

-- ---------------------------------------------------------------------------
-- saved_studies
-- Study Desk entries: sermon notes, journal entries, quiet time notes, etc.
-- Uses optimistic concurrency via the "version" column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_studies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT                     NOT NULL,
    title               TEXT                     NOT NULL,
    study_type          TEXT,
    speaker             TEXT,
    location            TEXT,
    study_date          DATE,
    main_scripture      TEXT,
    tags                JSONB,           -- legacy column; keyword relationships
                                      -- now managed via saved_study_tags
    linked_scriptures   JSONB,
    content_html        TEXT,
    preview_text        TEXT,
    category_id         UUID REFERENCES user_study_categories(id) ON DELETE SET NULL,
    version             INTEGER                  NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_studies_user_id
    ON saved_studies (user_id);

CREATE INDEX IF NOT EXISTS idx_studies_category_id
    ON saved_studies (category_id);

-- ---------------------------------------------------------------------------
-- saved_study_tags
-- Join table: links studies to user keywords (many-to-many).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_study_tags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT                     NOT NULL,
    study_id            UUID                     NOT NULL REFERENCES saved_studies(id) ON DELETE CASCADE,
    tag_id              UUID                     NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, study_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_study_tags_study_id
    ON saved_study_tags (study_id);

CREATE INDEX IF NOT EXISTS idx_study_tags_tag_id
    ON saved_study_tags (tag_id);

-- ---------------------------------------------------------------------------
-- scripture_references
-- Normalized scripture references (book, chapter, verse ranges).
-- Shared across users - deduplicated on normalized_reference.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scripture_references (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_reference TEXT                    NOT NULL,
    book                TEXT                     NOT NULL,
    start_chapter       INTEGER                  NOT NULL,
    start_verse         INTEGER,
    end_chapter         INTEGER                  NOT NULL,
    end_verse           INTEGER,
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    UNIQUE (normalized_reference)
);

-- ---------------------------------------------------------------------------
-- tag_scripture_references
-- Links user keywords to specific scripture references, with optional notes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tag_scripture_references (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 TEXT                     NOT NULL,
    tag_id                  UUID                     NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
    scripture_reference_id  UUID                     NOT NULL REFERENCES scripture_references(id) ON DELETE CASCADE,
    note                    TEXT                     NOT NULL DEFAULT '',
    sort_order              INTEGER                  NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tag_scriptures_user_tag
    ON tag_scripture_references (user_id, tag_id);

CREATE INDEX IF NOT EXISTS idx_tag_scriptures_scripture_ref
    ON tag_scripture_references (scripture_reference_id);

-- ---------------------------------------------------------------------------
-- users (LEGACY - pre-Clerk authentication)
-- This table is no longer used by the application. Auth is handled by Clerk,
-- and all other tables use Clerk's user_id (TEXT) as the identifier.
-- Safe to drop in a future cleanup.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL PRIMARY KEY,
    email               VARCHAR                  NOT NULL,
    password_hash       VARCHAR                  NOT NULL,
    display_name        VARCHAR,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ
);

-- ===========================================================================
-- Seed default category templates
-- These are used to auto-populate user_study_categories for new users.
-- The backend falls back to DEFAULT_CATEGORY_FALLBACKS in server.js if this
-- table is empty.
-- ===========================================================================
INSERT INTO study_category_templates (name, color, sort_order, is_active)
VALUES
    ('Studies',        '', 10, TRUE),
    ('Sermon',         '', 20, TRUE),
    ('Lesson',         '', 30, TRUE),
    ('Teaching',       '', 40, TRUE),
    ('Personal Study', '', 50, TRUE),
    ('Prayer',         '', 60, TRUE)
ON CONFLICT DO NOTHING;
