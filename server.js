//****************************************************************************************
// This file runs the Node/Express backend for the Bible app.
// It handles authentication-protected API routes for saving and loading user notes, 
//   Bible page markings, Study Desk records, categories, and tags.
//****************************************************************************************

const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const { clerkMiddleware, requireAuth } = require("@clerk/express");
const { parseScriptureReference } = require("./lib/scripture-reference");
require("dotenv").config();

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const dbUrl = new URL(rawDatabaseUrl);
dbUrl.searchParams.delete("sslmode");

const pool = new Pool({
  connectionString: dbUrl.toString(),
  ssl: {
    rejectUnauthorized: false
  }
});

const app = express();

app.use(express.json({ limit: "10mb" }));

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// Initialize the global Clerk middleware wrapper
app.use(clerkMiddleware({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY
}));

// Helper used by My Notes to extract Bible abbreviation from saved page URLs
function getBibleAbbrFromPageUrl(pageUrl) {
  if (!pageUrl) return "";
  try {
    const url = new URL(pageUrl, "https://example.com");
    return url.searchParams.get("abbr") || "";
  } catch (error) {
    return "";
  }
}

/**
 * =========================================================================
 * OFFLINE BIBLE API ENDPOINTS
 *
 * Purpose: Server-side endpoints for the offline Bible functionality.
 *          Fetches data from API.Bible and serves it to the client.
 * =========================================================================
 */

// Get list of available Bible versions
app.get('/api/bible-versions', async (req, res) => {
  try {
    const apiKey = process.env.API_BIBLE_KEY;
    const response = await fetch(
      'https://api.bible/v1/bibles',
      { headers: { 'api-key': apiKey } }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch Bible versions' });
    }

    const data = await response.json();
    res.json({
      versions: data.data.map(v => ({
        id: v.id,
        name: v.name,
        abbreviation: v.abbreviation,
        language: v.language?.name || 'Unknown'
      }))
    });
  } catch (error) {
    console.error('Bible versions error:', error);
    res.status(500).json({ error: 'Failed to load Bible versions' });
  }
});

// Download a specific Bible version for offline storage
app.get('/api/bible-download/:bibleId', async (req, res) => {
  try {
    const { bibleId } = req.params;
    const apiKey = process.env.API_BIBLE_KEY;

    const response = await fetch(
      `https://api.bible/v1/bibles/${bibleId}`,
      { headers: { 'api-key': apiKey } }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Bible version not found' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Bible download error:', error);
    res.status(500).json({ error: 'Failed to download Bible text' });
  }
});

// Simple API health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Bible app API with Clerk is running"
  });
});

// Database connection test
app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");
    res.json({
      ok: true,
      message: "Connected to Aiven PostgreSQL",
      database_time: result.rows[0].current_time
    });
  } catch (error) {
    console.error("Database test failed:", error);
    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.get("/sign-in", (req, res) => {
  res.sendFile(path.join(__dirname, "sign-in.html"));
});

app.get("/sign-up", (req, res) => {
  res.sendFile(path.join(__dirname, "sign-up.html"));
});

// Public auth-state check for UI features that need to know whether the
// current browser session is signed in before calling protected APIs.
// This route intentionally does not use requireAuth(), so logged-out users
// always receive a small JSON response instead of an auth redirect/handshake.
app.get("/api/auth-status", (req, res) => {
  res.json({
    ok: true,
    signedIn: Boolean(req.auth?.userId)
  });
});

// Returns current user context back to your client-side auth handlers
app.get("/api/me", requireAuth(), (req, res) => {
  res.json({
    ok: true,
    user: { id: req.auth.userId }
  });
});

// ----------------------------------------------------
// Quill notes routes
// ----------------------------------------------------
app.get("/api/quill-notes", requireAuth(), async (req, res) => {
  try {
    const { pageKey } = req.query;
    const userId = req.auth.userId;

    if (!pageKey) {
      return res.status(400).json({ ok: false, message: "Missing pageKey" });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        bible_version_id,
        bible_chapter_id,
        page_key,
        quill_delta_json,
        quill_plain_text,
        created_at,
        updated_at
      FROM saved_quill_notes
      WHERE user_id = $1
        AND page_key = $2
      LIMIT 1
      `,
      [userId, pageKey]
    );

    if (result.rows.length === 0) {
      return res.json({ ok: true, note: null });
    }

    return res.json({ ok: true, note: result.rows[0] });
  } catch (error) {
    console.error("Get quill notes error:", error);
    return res.status(500).json({ ok: false, message: "Failed to load notes" });
  }
});

app.post("/api/quill-notes", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const {
      bibleVersionID,
      bibleChapterID,
      pageKey,
      pageUrl,
      quillDelta,
      plainText
    } = req.body;

    if (!bibleVersionID || !bibleChapterID || !pageKey) {
      return res.status(400).json({ ok: false, message: "Missing Bible page information" });
    }

    const result = await pool.query(
      `
      INSERT INTO saved_quill_notes (
        user_id,
        bible_version_id,
        bible_chapter_id,
        page_key,
        page_url,
        quill_delta_json,
        quill_plain_text,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (user_id, page_key)
      DO UPDATE SET
        bible_version_id = EXCLUDED.bible_version_id,
        bible_chapter_id = EXCLUDED.bible_chapter_id,
        page_url = EXCLUDED.page_url,
        quill_delta_json = EXCLUDED.quill_delta_json,
        quill_plain_text = EXCLUDED.quill_plain_text,
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        bibleVersionID,
        bibleChapterID,
        pageKey,
        pageUrl || "",
        quillDelta,
        plainText || ""
      ]
    );

    return res.json({ ok: true, message: "Notes saved", note: result.rows[0] });
  } catch (error) {
    console.error("Save quill notes error:", error);
    return res.status(500).json({ ok: false, message: "Failed to save notes" });
  }
});

app.delete("/api/quill-notes", requireAuth(), async (req, res) => {
  try {
    const { pageKey } = req.query;
    const userId = req.auth.userId;

    if (!pageKey) {
      return res.status(400).json({ ok: false, message: "Missing pageKey" });
    }

    await pool.query(
      `DELETE FROM saved_quill_notes WHERE user_id = $1 AND page_key = $2`,
      [userId, pageKey]
    );

    return res.json({ ok: true, message: "Quill notes deleted" });
  } catch (error) {
    console.error("Delete quill notes error:", error);
    return res.status(500).json({ ok: false, message: "Failed to delete notes" });
  }
});

// ----------------------------------------------------
// Mini-editor page routes
// ----------------------------------------------------
app.get("/api/mini-editor-page", requireAuth(), async (req, res) => {
  try {
    const { pageKey } = req.query;
    const userId = req.auth.userId;

    if (!pageKey) {
      return res.status(400).json({ ok: false, message: "Missing pageKey" });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        bible_version_id,
        bible_chapter_id,
        page_key,
        page_url,
        bible_name,
        book_chapter_label,
        mini_editor_json,
        has_highlights,
        has_drawings,
        has_text_formats,
        created_at,
        updated_at
      FROM saved_mini_editor_pages
      WHERE user_id = $1 AND page_key = $2
      LIMIT 1
      `,
      [userId, pageKey]
    );

    if (result.rows.length === 0) {
      return res.json({ ok: true, page: null });
    }

    return res.json({ ok: true, page: result.rows[0] });
  } catch (error) {
    console.error("Get mini-editor page error:", error);
    return res.status(500).json({ ok: false, message: "Failed to load mini-editor page" });
  }
});

app.post("/api/mini-editor-page", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const {
      bibleVersionID,
      bibleChapterID,
      pageKey,
      pageUrl,
      bibleName,
      bookChapterLabel,
      miniEditorJson,
      hasHighlights,
      hasDrawings,
      hasTextFormats
    } = req.body;

    if (!bibleVersionID || !bibleChapterID || !pageKey || !miniEditorJson) {
      return res.status(400).json({ ok: false, message: "Missing mini-editor page information" });
    }

    const result = await pool.query(
      `
      INSERT INTO saved_mini_editor_pages (
        user_id,
        bible_version_id,
        bible_chapter_id,
        page_key,
        page_url,
        bible_name,
        book_chapter_label,
        mini_editor_json,
        has_highlights,
        has_drawings,
        has_text_formats,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (user_id, page_key)
      DO UPDATE SET
        bible_version_id = EXCLUDED.bible_version_id,
        bible_chapter_id = EXCLUDED.bible_chapter_id,
        page_url = EXCLUDED.page_url,
        bible_name = EXCLUDED.bible_name,
        book_chapter_label = EXCLUDED.book_chapter_label,
        mini_editor_json = EXCLUDED.mini_editor_json,
        has_highlights = EXCLUDED.has_highlights,
        has_drawings = EXCLUDED.has_drawings,
        has_text_formats = EXCLUDED.has_text_formats,
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        bibleVersionID,
        bibleChapterID,
        pageKey,
        pageUrl || "",
        bibleName || "",
        bookChapterLabel || "",
        miniEditorJson,
        !!hasHighlights,
        !!hasDrawings,
        !!hasTextFormats
      ]
    );

    return res.json({ ok: true, message: "Mini-editor page saved", page: result.rows[0] });
  } catch (error) {
    console.error("Save mini-editor page error:", error);

    return res.status(500).json({
      ok: false,
      message: "Failed to save mini-editor page",
      error: error.message,
      code: error.code || null,
      detail: error.detail || null
    });
  }
});

app.delete("/api/mini-editor-page", requireAuth(), async (req, res) => {
  try {
    const { pageKey } = req.query;
    const userId = req.auth.userId;

    if (!pageKey) {
      return res.status(400).json({ ok: false, message: "Missing pageKey" });
    }

    await pool.query(
      `DELETE FROM saved_mini_editor_pages WHERE user_id = $1 AND page_key = $2`,
      [userId, pageKey]
    );

    return res.json({ ok: true, message: "Mini-editor page deleted" });
  } catch (error) {
    console.error("Delete mini-editor page error:", error);
    return res.status(500).json({ ok: false, message: "Failed to delete mini-editor page" });
  }
});

// ----------------------------------------------------
// My Notes route
// ----------------------------------------------------
app.get("/api/my-notes", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    const result = await pool.query(
      `
      SELECT
        COALESCE(q.page_key, m.page_key) AS page_key,
        COALESCE(q.bible_version_id, m.bible_version_id) AS bible_version_id,
        COALESCE(q.bible_chapter_id, m.bible_chapter_id) AS bible_chapter_id,
        COALESCE(q.page_url, m.page_url) AS page_url,
        m.bible_name,
        COALESCE(m.book_chapter_label, q.bible_chapter_id, m.bible_chapter_id) AS book_chapter_label,
        CASE
          WHEN q.quill_plain_text IS NOT NULL AND btrim(q.quill_plain_text) <> ''
          THEN TRUE
          ELSE FALSE
        END AS has_quill_notes,
        COALESCE(m.has_highlights, FALSE) AS has_highlights,
        COALESCE(m.has_drawings, FALSE) AS has_drawings,
        COALESCE(m.has_text_formats, FALSE) AS has_text_formats,
        COALESCE(q.quill_plain_text, '') AS preview,
        GREATEST(
          COALESCE(q.updated_at, '1970-01-01'::timestamptz),
          COALESCE(m.updated_at, '1970-01-01'::timestamptz)
        ) AS updated_at
      FROM saved_quill_notes q
      FULL OUTER JOIN saved_mini_editor_pages m
        ON m.user_id = q.user_id
        AND m.page_key = q.page_key
      WHERE COALESCE(q.user_id, m.user_id) = $1
      ORDER BY updated_at DESC
      `,
      [userId]
    );

    const notes = result.rows.map((row) => ({
      pageKey: row.page_key,
      bibleVersionID: row.bible_version_id,
      bibleChapterID: row.bible_chapter_id,
      bibleName: getBibleAbbrFromPageUrl(row.page_url) || row.bible_name || "",
      bookChapterLabel: row.book_chapter_label || row.bible_chapter_id || "",
      pageUrl: row.page_url,
      hasQuillNotes: !!row.has_quill_notes,
      hasHighlights: !!row.has_highlights,
      hasDrawings: !!row.has_drawings,
      hasTextFormats: !!row.has_text_formats,
      preview: row.preview || "",
      updatedAt: row.updated_at
    }));

    res.json({ ok: true, notes });
  } catch (error) {
    console.error("Get my notes error:", error);
    res.status(500).json({ ok: false, message: "Failed to load my notes" });
  }
});

app.delete("/api/my-notes/:pageKey", requireAuth(), async (req, res) => {
  const { pageKey } = req.params;
  const userId = req.auth.userId;

  try {
    await pool.query("BEGIN");

    await pool.query(
      "DELETE FROM saved_quill_notes WHERE user_id = $1 AND page_key = $2",
      [userId, pageKey]
    );

    await pool.query(
      "DELETE FROM saved_mini_editor_pages WHERE user_id = $1 AND page_key = $2",
      [userId, pageKey]
    );

    await pool.query("COMMIT");

    res.json({
      ok: true,
      message: "Note deleted successfully from all tables"
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Delete full note error:", error);
    res.status(500).json({ ok: false, message: "Failed to delete note" });
  }
});

// ----------------------------------------------------
// Study Desk routes
// ----------------------------------------------------
const DEFAULT_CATEGORY_FALLBACKS = [
  { name: "Studies", sortOrder: 10 },
  { name: "Sermon", sortOrder: 20 },
  { name: "Lesson", sortOrder: 30 },
  { name: "Teaching", sortOrder: 40 },
  { name: "Personal Study", sortOrder: 50 },
  { name: "Prayer", sortOrder: 60 }
];

const DEFAULT_TAG_COLORS = [
  "#dbeafe",
  "#dcfce7",
  "#ede9fe",
  "#fef3c7",
  "#fce7f3",
  "#ccfbf1",
  "#fee2e2",
  "#e5e7eb"
];

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

// Keyword names are stored in Proper Case regardless of which UI created them.
// Examples: "holy spirit" -> "Holy Spirit", "GOD'S GRACE" -> "God's Grace".
function properCaseKeywordName(value) {
  return normalizeText(value)
    .toLocaleLowerCase("en-US")
    .replace(/(^|[\s\-\/(])([\p{L}])/gu, (match, prefix, letter) => {
      return `${prefix}${letter.toLocaleUpperCase("en-US")}`;
    });
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeColor(value, fallback = "#dbeafe") {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeSortOrder(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStudyDate(value) {
  if (!value) return null;
  if (typeof value !== "string") return null;
  return value;
}

function normalizeUuidArray(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();

  return value
    .filter((item) => typeof item === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item))
    .filter((item) => {
      const key = item.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function buildPreviewText(value) {
  if (typeof value !== "string") return "";

  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sortOrder: row.sort_order || 0,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTagRow(row) {
  const tag = {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: normalizeColor(row.color),
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (row.scripture_count !== undefined) {
    tag.scriptureCount = Math.max(0, Number(row.scripture_count) || 0);
  }

  return tag;
}

function mapTagScriptureRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    tagId: row.tag_id,
    scriptureReferenceId: row.scripture_reference_id,
    reference: row.normalized_reference,
    normalizedReference: row.normalized_reference,
    book: row.book,
    startChapter: row.start_chapter,
    startVerse: row.start_verse,
    endChapter: row.end_chapter,
    endVerse: row.end_verse,
    note: row.note || "",
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function tagBelongsToUser(client, userId, tagId) {
  if (!isUuid(tagId)) {
    return false;
  }

  const result = await client.query(
    `
    SELECT id
    FROM user_tags
    WHERE user_id = $1
      AND id = $2
    LIMIT 1
    `,
    [userId, tagId]
  );

  return result.rows.length > 0;
}

async function getOrCreateScriptureReference(client, parsedReference) {
  const result = await client.query(
    `
    INSERT INTO scripture_references (
      normalized_reference,
      book,
      start_chapter,
      start_verse,
      end_chapter,
      end_verse,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (normalized_reference)
    DO UPDATE SET
      normalized_reference = EXCLUDED.normalized_reference
    RETURNING *
    `,
    [
      parsedReference.normalizedReference,
      parsedReference.book,
      parsedReference.startChapter,
      parsedReference.startVerse,
      parsedReference.endChapter,
      parsedReference.endVerse
    ]
  );

  return result.rows[0];
}

async function tagScriptureReferenceExists(
  client,
  userId,
  tagId,
  scriptureReferenceId,
  excludeRelationshipId = null
) {
  const values = [userId, tagId, scriptureReferenceId];
  let excludeClause = "";

  if (excludeRelationshipId) {
    values.push(excludeRelationshipId);
    excludeClause = "AND id <> $4";
  }

  const result = await client.query(
    `
    SELECT 1
    FROM tag_scripture_references
    WHERE user_id = $1
      AND tag_id = $2
      AND scripture_reference_id = $3
      ${excludeClause}
    LIMIT 1
    `,
    values
  );

  return result.rows.length > 0;
}

async function getTagScriptureById(client, userId, tagId, relationshipId) {
  const result = await client.query(
    `
    SELECT
      tsr.id,
      tsr.user_id,
      tsr.tag_id,
      tsr.scripture_reference_id,
      tsr.note,
      tsr.sort_order,
      tsr.created_at,
      tsr.updated_at,
      sr.normalized_reference,
      sr.book,
      sr.start_chapter,
      sr.start_verse,
      sr.end_chapter,
      sr.end_verse
    FROM tag_scripture_references tsr
    INNER JOIN scripture_references sr
      ON sr.id = tsr.scripture_reference_id
    WHERE tsr.user_id = $1
      AND tsr.tag_id = $2
      AND tsr.id = $3
    LIMIT 1
    `,
    [userId, tagId, relationshipId]
  );

  return result.rows.length ? result.rows[0] : null;
}

function mapStudyRow(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];

  const category = row.category_id
    ? {
        id: row.category_id,
        name: row.category_name || ""
      }
    : null;

  return {
    id: row.id,
    version: Number(row.version) || 1,
    userId: row.user_id,
    title: row.title,
    categoryId: row.category_id || null,
    category,
    studyType: row.category_name || row.study_type || "Study",
    speaker: row.speaker || "",
    location: row.location || "",
    studyDate: row.study_date,
    mainScripture: row.main_scripture || "",
    tags,
    linkedScriptures: row.linked_scriptures || [],
    contentHtml: row.content_html || "",
    previewText: row.preview_text || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ensureUserStudyCategories(userId) {
  const existing = await pool.query(
    `SELECT COUNT(*)::int AS count FROM user_study_categories WHERE user_id = $1`,
    [userId]
  );

  if (existing.rows[0].count > 0) return;

  const templates = await pool.query(
    `
    SELECT name, sort_order
    FROM study_category_templates
    WHERE is_active = TRUE
    ORDER BY sort_order, name
    `
  );

  const sourceRows = templates.rows.length
    ? templates.rows.map((row) => ({
        name: row.name,
        sortOrder: row.sort_order
      }))
    : DEFAULT_CATEGORY_FALLBACKS;

  for (const row of sourceRows) {
    await pool.query(
      `
      INSERT INTO user_study_categories (
        user_id,
        name,
        sort_order,
        is_default,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, TRUE, NOW(), NOW())
      ON CONFLICT (user_id, name) DO NOTHING
      `,
      [userId, row.name, normalizeSortOrder(row.sortOrder)]
    );
  }
}

async function getUserCategories(userId) {
  await ensureUserStudyCategories(userId);

  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      name,
      sort_order,
      is_default,
      created_at,
      updated_at
    FROM user_study_categories
    WHERE user_id = $1
    ORDER BY sort_order, name
    `,
    [userId]
  );

  return result.rows.map(mapCategoryRow);
}

async function getUserTags(userId) {
  const result = await pool.query(
    `
    SELECT
      ut.id,
      ut.user_id,
      ut.name,
      ut.color,
      ut.sort_order,
      ut.created_at,
      ut.updated_at,
      COUNT(tsr.id)::int AS scripture_count
    FROM user_tags ut
    LEFT JOIN tag_scripture_references tsr
      ON tsr.user_id = ut.user_id
      AND tsr.tag_id = ut.id
    WHERE ut.user_id = $1
    GROUP BY ut.id
    ORDER BY ut.sort_order, ut.name
    `,
    [userId]
  );

  return result.rows.map(mapTagRow);
}

async function categoryBelongsToUser(userId, categoryId) {
  if (!categoryId) return true;

  const result = await pool.query(
    `
    SELECT id
    FROM user_study_categories
    WHERE user_id = $1
      AND id = $2
    LIMIT 1
    `,
    [userId, categoryId]
  );

  return result.rows.length > 0;
}

async function replaceStudyTags(client, userId, studyId, tagIds) {
  const cleanTagIds = normalizeUuidArray(tagIds);

  await client.query(
    `
    DELETE FROM saved_study_tags
    WHERE user_id = $1
      AND study_id = $2
    `,
    [userId, studyId]
  );

  if (!cleanTagIds.length) {
    return;
  }

  const ownedTags = await client.query(
    `
    SELECT id
    FROM user_tags
    WHERE user_id = $1
      AND id = ANY($2::uuid[])
    `,
    [userId, cleanTagIds]
  );

  for (const row of ownedTags.rows) {
    await client.query(
      `
      INSERT INTO saved_study_tags (
        user_id,
        study_id,
        tag_id,
        created_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, study_id, tag_id) DO NOTHING
      `,
      [userId, studyId, row.id]
    );
  }
}

async function getStudyById(userId, id, client = pool) {
  const result = await client.query(
    `
    SELECT
      s.id,
      s.version,
      s.user_id,
      s.title,
      s.study_type,
      s.speaker,
      s.location,
      s.study_date,
      s.main_scripture,
      s.category_id,
      c.name AS category_name,
      s.linked_scriptures,
      s.content_html,
      s.preview_text,
      s.created_at,
      s.updated_at,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'color', t.color,
            'sortOrder', t.sort_order
          )
          ORDER BY t.sort_order, t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::jsonb
      ) AS tags
    FROM saved_studies s
    LEFT JOIN user_study_categories c
      ON c.user_id = s.user_id
      AND c.id = s.category_id
    LEFT JOIN saved_study_tags st
      ON st.user_id = s.user_id
      AND st.study_id = s.id
    LEFT JOIN user_tags t
      ON t.user_id = st.user_id
      AND t.id = st.tag_id
    WHERE s.user_id = $1
      AND s.id = $2
    GROUP BY s.id, c.id
    LIMIT 1
    `,
    [userId, id]
  );

  return result.rows.length
    ? mapStudyRow(result.rows[0])
    : null;
}

app.get("/api/study-categories", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const categories = await getUserCategories(userId);

    res.json({
      ok: true,
      categories
    });
  } catch (error) {
    console.error("Get study categories error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to load categories"
    });
  }
});

app.post("/api/study-categories", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const name = normalizeText(req.body.name);

    if (!name) {
      return res.status(400).json({
        ok: false,
        message: "Category name is required"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO user_study_categories (
        user_id,
        name,
        sort_order,
        is_default,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, FALSE, NOW(), NOW())
      ON CONFLICT (user_id, name)
      DO UPDATE SET
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        name,
        normalizeSortOrder(req.body.sortOrder, 100)
      ]
    );

    res.status(201).json({
      ok: true,
      category: mapCategoryRow(result.rows[0])
    });
  } catch (error) {
    console.error("Create study category error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to save category"
    });
  }
});

app.put("/api/study-categories/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;
    const name = normalizeText(req.body.name);

    if (!name) {
      return res.status(400).json({
        ok: false,
        message: "Category name is required"
      });
    }

    const result = await pool.query(
      `
      UPDATE user_study_categories
      SET
        name = $3,
        sort_order = $4,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING *
      `,
      [
        userId,
        id,
        name,
        normalizeSortOrder(req.body.sortOrder)
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Category not found"
      });
    }

    res.json({
      ok: true,
      category: mapCategoryRow(result.rows[0])
    });
  } catch (error) {
    console.error("Update study category error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to update category"
    });
  }
});

app.delete("/api/study-categories/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    await client.query("BEGIN");

    await client.query(
      `
      UPDATE saved_studies
      SET category_id = NULL
      WHERE user_id = $1
        AND category_id = $2
      `,
      [userId, id]
    );

    const result = await client.query(
      `
      DELETE FROM user_study_categories
      WHERE user_id = $1
        AND id = $2
      RETURNING id
      `,
      [userId, id]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        ok: false,
        message: "Category not found"
      });
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      message: "Category deleted"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete study category error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to delete category"
    });
  } finally {
    client.release();
  }
});

app.get("/api/study-tags", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const tags = await getUserTags(userId);

    res.json({
      ok: true,
      tags
    });
  } catch (error) {
    console.error("Get study tags error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to load tags"
    });
  }
});

app.post("/api/study-tags", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const name = properCaseKeywordName(req.body.name);

    if (!name) {
      return res.status(400).json({
        ok: false,
        message: "Tag name is required"
      });
    }

    const color = normalizeColor(req.body.color);

    const result = await pool.query(
      `
      INSERT INTO user_tags (
        user_id,
        name,
        color,
        sort_order,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id, name)
      DO UPDATE SET
        color = EXCLUDED.color,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
      RETURNING *
      `,
      [
        userId,
        name,
        color,
        normalizeSortOrder(req.body.sortOrder, 100)
      ]
    );

    res.status(201).json({
      ok: true,
      tag: mapTagRow(result.rows[0])
    });
  } catch (error) {
    console.error("Create study tag error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to save tag"
    });
  }
});

app.put("/api/study-tags/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;
    const name = properCaseKeywordName(req.body.name);

    if (!name) {
      return res.status(400).json({
        ok: false,
        message: "Tag name is required"
      });
    }

    const result = await pool.query(
      `
      UPDATE user_tags
      SET
        name = $3,
        color = $4,
        sort_order = $5,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING *
      `,
      [
        userId,
        id,
        name,
        normalizeColor(req.body.color),
        normalizeSortOrder(req.body.sortOrder)
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Tag not found"
      });
    }

    res.json({
      ok: true,
      tag: mapTagRow(result.rows[0])
    });
  } catch (error) {
    console.error("Update study tag error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to update tag"
    });
  }
});

app.delete("/api/study-tags/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM user_tags
      WHERE user_id = $1
        AND id = $2
      RETURNING id
      `,
      [userId, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Tag not found"
      });
    }

    res.json({
      ok: true,
      message: "Tag deleted"
    });
  } catch (error) {
    console.error("Delete study tag error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to delete tag"
    });
  }
});

// ----------------------------------------------------
// Tag Scripture relationship routes
// ----------------------------------------------------
app.get("/api/study-tags/:id/scriptures", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const tagId = req.params.id;

    if (!(await tagBelongsToUser(pool, userId, tagId))) {
      return res.status(404).json({
        ok: false,
        message: "Tag not found"
      });
    }

    const result = await pool.query(
      `
      SELECT
        tsr.id,
        tsr.user_id,
        tsr.tag_id,
        tsr.scripture_reference_id,
        tsr.note,
        tsr.sort_order,
        tsr.created_at,
        tsr.updated_at,
        sr.normalized_reference,
        sr.book,
        sr.start_chapter,
        sr.start_verse,
        sr.end_chapter,
        sr.end_verse
      FROM tag_scripture_references tsr
      INNER JOIN scripture_references sr
        ON sr.id = tsr.scripture_reference_id
      WHERE tsr.user_id = $1
        AND tsr.tag_id = $2
      ORDER BY tsr.sort_order, tsr.created_at, tsr.id
      `,
      [userId, tagId]
    );

    return res.json({
      ok: true,
      scriptures: result.rows.map(mapTagScriptureRow)
    });
  } catch (error) {
    console.error("Get tag Scriptures error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to load tag Scriptures"
    });
  }
});

app.post("/api/study-tags/:id/scriptures", requireAuth(), async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.auth.userId;
    const tagId = req.params.id;
    const parsedReference = parseScriptureReference(req.body.reference);

    if (!parsedReference) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_SCRIPTURE_REFERENCE",
        message: "Enter a valid Scripture reference"
      });
    }

    await client.query("BEGIN");

    if (!(await tagBelongsToUser(client, userId, tagId))) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Tag not found"
      });
    }

    const scriptureReference = await getOrCreateScriptureReference(
      client,
      parsedReference
    );

    if (
      await tagScriptureReferenceExists(
        client,
        userId,
        tagId,
        scriptureReference.id
      )
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "TAG_SCRIPTURE_DUPLICATE",
        message: "This Scripture reference is already connected to this tag"
      });
    }

    let sortOrder;

    if (req.body.sortOrder === undefined || req.body.sortOrder === null) {
      const sortResult = await client.query(
        `
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
        FROM tag_scripture_references
        WHERE user_id = $1
          AND tag_id = $2
        `,
        [userId, tagId]
      );

      sortOrder = Number(sortResult.rows[0].next_sort_order) || 0;
    } else {
      sortOrder = normalizeSortOrder(req.body.sortOrder);
    }

    const result = await client.query(
      `
      INSERT INTO tag_scripture_references (
        user_id,
        tag_id,
        scripture_reference_id,
        note,
        sort_order,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id
      `,
      [
        userId,
        tagId,
        scriptureReference.id,
        normalizeOptionalText(req.body.note),
        sortOrder
      ]
    );

    const relationship = await getTagScriptureById(
      client,
      userId,
      tagId,
      result.rows[0].id
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      scripture: mapTagScriptureRow(relationship)
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        code: "TAG_SCRIPTURE_DUPLICATE",
        message: "This Scripture reference is already connected to this tag"
      });
    }

    console.error("Add tag Scripture error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to add Scripture to tag"
    });
  } finally {
    client.release();
  }
});

app.put("/api/study-tags/:id/scriptures/reorder", requireAuth(), async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.auth.userId;
    const tagId = req.params.id;
    const orderedIds = Array.isArray(req.body.orderedIds)
      ? req.body.orderedIds
      : [];

    if (!orderedIds.every(isUuid) || new Set(orderedIds.map((id) => id.toLowerCase())).size !== orderedIds.length) {
      return res.status(400).json({
        ok: false,
        message: "orderedIds must contain unique relationship IDs"
      });
    }

    await client.query("BEGIN");

    if (!(await tagBelongsToUser(client, userId, tagId))) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Tag not found"
      });
    }

    const existing = await client.query(
      `
      SELECT id
      FROM tag_scripture_references
      WHERE user_id = $1
        AND tag_id = $2
      ORDER BY sort_order, created_at, id
      `,
      [userId, tagId]
    );

    if (existing.rows.length !== orderedIds.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        message: "orderedIds must include every Scripture relationship for this tag"
      });
    }

    const existingIds = new Set(existing.rows.map((row) => String(row.id).toLowerCase()));

    if (!orderedIds.every((id) => existingIds.has(id.toLowerCase()))) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        message: "One or more Scripture relationships are not available for this tag"
      });
    }

    for (let index = 0; index < orderedIds.length; index += 1) {
      await client.query(
        `
        UPDATE tag_scripture_references
        SET
          sort_order = $4,
          updated_at = NOW()
        WHERE user_id = $1
          AND tag_id = $2
          AND id = $3
        `,
        [userId, tagId, orderedIds[index], index]
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      message: "Scripture order updated"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Reorder tag Scriptures error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to reorder tag Scriptures"
    });
  } finally {
    client.release();
  }
});

app.put("/api/study-tags/:id/scriptures/:relationshipId", requireAuth(), async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.auth.userId;
    const tagId = req.params.id;
    const { relationshipId } = req.params;

    if (!isUuid(tagId) || !isUuid(relationshipId)) {
      return res.status(404).json({
        ok: false,
        message: "Scripture relationship not found"
      });
    }

    await client.query("BEGIN");

    const existing = await getTagScriptureById(
      client,
      userId,
      tagId,
      relationshipId
    );

    if (!existing) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Scripture relationship not found"
      });
    }

    const referenceValue = Object.prototype.hasOwnProperty.call(req.body, "reference")
      ? req.body.reference
      : existing.normalized_reference;
    const parsedReference = parseScriptureReference(referenceValue);

    if (!parsedReference) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        code: "INVALID_SCRIPTURE_REFERENCE",
        message: "Enter a valid Scripture reference"
      });
    }

    const scriptureReference = await getOrCreateScriptureReference(
      client,
      parsedReference
    );

    if (
      await tagScriptureReferenceExists(
        client,
        userId,
        tagId,
        scriptureReference.id,
        relationshipId
      )
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        code: "TAG_SCRIPTURE_DUPLICATE",
        message: "This Scripture reference is already connected to this tag"
      });
    }

    const note = Object.prototype.hasOwnProperty.call(req.body, "note")
      ? normalizeOptionalText(req.body.note)
      : existing.note || "";
    const sortOrder = Object.prototype.hasOwnProperty.call(req.body, "sortOrder")
      ? normalizeSortOrder(req.body.sortOrder, existing.sort_order)
      : existing.sort_order;

    await client.query(
      `
      UPDATE tag_scripture_references
      SET
        scripture_reference_id = $4,
        note = $5,
        sort_order = $6,
        updated_at = NOW()
      WHERE user_id = $1
        AND tag_id = $2
        AND id = $3
      `,
      [
        userId,
        tagId,
        relationshipId,
        scriptureReference.id,
        note,
        sortOrder
      ]
    );

    const relationship = await getTagScriptureById(
      client,
      userId,
      tagId,
      relationshipId
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      scripture: mapTagScriptureRow(relationship)
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        code: "TAG_SCRIPTURE_DUPLICATE",
        message: "This Scripture reference is already connected to this tag"
      });
    }

    console.error("Update tag Scripture error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to update tag Scripture"
    });
  } finally {
    client.release();
  }
});

app.delete("/api/study-tags/:id/scriptures/:relationshipId", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const tagId = req.params.id;
    const { relationshipId } = req.params;

    if (!isUuid(tagId) || !isUuid(relationshipId)) {
      return res.status(404).json({
        ok: false,
        message: "Scripture relationship not found"
      });
    }

    const result = await pool.query(
      `
      DELETE FROM tag_scripture_references
      WHERE user_id = $1
        AND tag_id = $2
        AND id = $3
      RETURNING id
      `,
      [userId, tagId, relationshipId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Scripture relationship not found"
      });
    }

    return res.json({
      ok: true,
      message: "Scripture removed from tag"
    });
  } catch (error) {
    console.error("Delete tag Scripture error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to remove Scripture from tag"
    });
  }
});

app.get("/api/scripture-references/tags", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const parsedReference = parseScriptureReference(req.query.reference);

    if (!parsedReference) {
      return res.status(400).json({
        ok: false,
        code: "INVALID_SCRIPTURE_REFERENCE",
        message: "Enter a valid Scripture reference"
      });
    }

    const result = await pool.query(
      `
      SELECT
        t.id,
        t.user_id,
        t.name,
        t.color,
        t.sort_order,
        t.created_at,
        t.updated_at,
        tsr.id AS relationship_id,
        tsr.note AS relationship_note,
        tsr.sort_order AS relationship_sort_order
      FROM scripture_references sr
      INNER JOIN tag_scripture_references tsr
        ON tsr.scripture_reference_id = sr.id
      INNER JOIN user_tags t
        ON t.id = tsr.tag_id
        AND t.user_id = tsr.user_id
      WHERE sr.normalized_reference = $1
        AND tsr.user_id = $2
      ORDER BY t.sort_order, t.name
      `,
      [parsedReference.normalizedReference, userId]
    );

    return res.json({
      ok: true,
      reference: parsedReference.normalizedReference,
      tags: result.rows.map((row) => ({
        ...mapTagRow(row),
        relationshipId: row.relationship_id,
        note: row.relationship_note || "",
        relationshipSortOrder: Number(row.relationship_sort_order) || 0
      }))
    });
  } catch (error) {
    console.error("Get Scripture tags error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to load Scripture tags"
    });
  }
});

app.get("/api/studies", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    await ensureUserStudyCategories(userId);

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.version,
        s.user_id,
        s.title,
        s.study_type,
        s.speaker,
        s.location,
        s.study_date,
        s.main_scripture,
        s.category_id,
        c.name AS category_name,
        s.linked_scriptures,
        s.content_html,
        s.preview_text,
        s.created_at,
        s.updated_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', t.id,
              'name', t.name,
              'color', t.color,
              'sortOrder', t.sort_order
            )
            ORDER BY t.sort_order, t.name
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::jsonb
        ) AS tags
      FROM saved_studies s
      LEFT JOIN user_study_categories c
        ON c.user_id = s.user_id
        AND c.id = s.category_id
      LEFT JOIN saved_study_tags st
        ON st.user_id = s.user_id
        AND st.study_id = s.id
      LEFT JOIN user_tags t
        ON t.user_id = st.user_id
        AND t.id = st.tag_id
      WHERE s.user_id = $1
      GROUP BY s.id, c.id
      ORDER BY s.updated_at DESC
      `,
      [userId]
    );

    res.json({
      ok: true,
      studies: result.rows.map(mapStudyRow)
    });
  } catch (error) {
    console.error("Get studies error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to load studies"
    });
  }
});

app.get("/api/studies/:id/related-scriptures", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const studyId = req.params.id;

    const studyResult = await pool.query(
      `
      SELECT id
      FROM saved_studies
      WHERE user_id = $1
        AND id = $2
      LIMIT 1
      `,
      [userId, studyId]
    );

    if (!studyResult.rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Study not found"
      });
    }

    const result = await pool.query(
      `
      SELECT
        sr.id AS scripture_reference_id,
        sr.normalized_reference,
        sr.book,
        sr.start_chapter,
        sr.start_verse,
        sr.end_chapter,
        sr.end_verse,
        tsr.id AS relationship_id,
        tsr.note,
        tsr.sort_order AS relationship_sort_order,
        t.id AS tag_id,
        t.name AS tag_name,
        t.color AS tag_color,
        t.sort_order AS tag_sort_order
      FROM saved_study_tags sst
      INNER JOIN user_tags t
        ON t.id = sst.tag_id
        AND t.user_id = sst.user_id
      INNER JOIN tag_scripture_references tsr
        ON tsr.tag_id = t.id
        AND tsr.user_id = t.user_id
      INNER JOIN scripture_references sr
        ON sr.id = tsr.scripture_reference_id
      WHERE sst.user_id = $1
        AND sst.study_id = $2
      ORDER BY
        t.sort_order,
        t.name,
        tsr.sort_order,
        tsr.created_at,
        sr.normalized_reference
      `,
      [userId, studyId]
    );

    const grouped = new Map();

    for (const row of result.rows) {
      const key = String(row.scripture_reference_id);

      if (!grouped.has(key)) {
        grouped.set(key, {
          scriptureReferenceId: row.scripture_reference_id,
          reference: row.normalized_reference,
          normalizedReference: row.normalized_reference,
          book: row.book,
          startChapter: row.start_chapter,
          startVerse: row.start_verse,
          endChapter: row.end_chapter,
          endVerse: row.end_verse,
          connections: []
        });
      }

      grouped.get(key).connections.push({
        relationshipId: row.relationship_id,
        tagId: row.tag_id,
        tagName: row.tag_name,
        tagColor: normalizeColor(row.tag_color),
        note: row.note || "",
        sortOrder: Number(row.relationship_sort_order) || 0
      });
    }

    return res.json({
      ok: true,
      scriptures: Array.from(grouped.values())
    });
  } catch (error) {
    console.error("Get related Scriptures error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to load related Scriptures"
    });
  }
});

app.get("/api/studies/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    const study = await getStudyById(userId, id);

    if (!study) {
      return res.status(404).json({
        ok: false,
        message: "Study not found"
      });
    }

    res.json({
      ok: true,
      study
    });
  } catch (error) {
    console.error("Get study error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to load study"
    });
  }
});

app.post("/api/studies", requireAuth(), async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.auth.userId;
    const title = normalizeText(req.body.title);
    const categoryId = normalizeOptionalText(req.body.categoryId) || null;
    const contentHtml = typeof req.body.contentHtml === "string"
      ? req.body.contentHtml
      : "";

    const previewText =
      normalizeOptionalText(req.body.previewText) ||
      buildPreviewText(contentHtml);

    if (!title) {
      return res.status(400).json({
        ok: false,
        message: "Study title is required"
      });
    }

    if (!(await categoryBelongsToUser(userId, categoryId))) {
      return res.status(400).json({
        ok: false,
        message: "Selected category is not available"
      });
    }

    await client.query("BEGIN");

    const categoryName = categoryId
      ? (
          await client.query(
            `
            SELECT name
            FROM user_study_categories
            WHERE user_id = $1
              AND id = $2
            LIMIT 1
            `,
            [userId, categoryId]
          )
        ).rows[0]?.name || "Study"
      : "Study";

    const result = await client.query(
      `
      INSERT INTO saved_studies (
        user_id,
        title,
        category_id,
        study_type,
        speaker,
        location,
        study_date,
        main_scripture,
        linked_scriptures,
        content_html,
        preview_text,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10,
        $11,
        NOW(),
        NOW()
      )
      RETURNING id
      `,
      [
        userId,
        title,
        categoryId,
        categoryName,
        normalizeOptionalText(req.body.speaker),
        normalizeOptionalText(req.body.location),
        normalizeStudyDate(req.body.studyDate),
        normalizeOptionalText(req.body.mainScripture),
        JSON.stringify(normalizeJsonArray(req.body.linkedScriptures)),
        contentHtml,
        previewText
      ]
    );

    const studyId = result.rows[0].id;

    await replaceStudyTags(
      client,
      userId,
      studyId,
      req.body.tagIds
    );

    const study = await getStudyById(
      userId,
      studyId,
      client
    );

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      message: "Study saved",
      study
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create study error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to save study"
    });
  } finally {
    client.release();
  }
});

app.put("/api/studies/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    const title = normalizeText(req.body.title);
    const categoryId = normalizeOptionalText(req.body.categoryId) || null;

    const contentHtml = typeof req.body.contentHtml === "string"
      ? req.body.contentHtml
      : "";

    const previewText =
      normalizeOptionalText(req.body.previewText) ||
      buildPreviewText(contentHtml);

    const expectedVersion = Number(req.body.expectedVersion);

    if (!title) {
      return res.status(400).json({
        ok: false,
        message: "Study title is required"
      });
    }

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return res.status(428).json({
        ok: false,
        code: "STUDY_VERSION_REQUIRED",
        message: "This study must be reloaded before it can be saved."
      });
    }

    if (!(await categoryBelongsToUser(userId, categoryId))) {
      return res.status(400).json({
        ok: false,
        message: "Selected category is not available"
      });
    }

    await client.query("BEGIN");

    const categoryName = categoryId
      ? (
          await client.query(
            `
            SELECT name
            FROM user_study_categories
            WHERE user_id = $1
              AND id = $2
            LIMIT 1
            `,
            [userId, categoryId]
          )
        ).rows[0]?.name || "Study"
      : "Study";

    const result = await client.query(
      `
      UPDATE saved_studies
      SET
        title = $3,
        category_id = $4,
        study_type = $5,
        speaker = $6,
        location = $7,
        study_date = $8,
        main_scripture = $9,
        linked_scriptures = $10::jsonb,
        content_html = $11,
        preview_text = $12,
        version = version + 1,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
        AND version = $13
      RETURNING id, version
      `,
      [
        userId,
        id,
        title,
        categoryId,
        categoryName,
        normalizeOptionalText(req.body.speaker),
        normalizeOptionalText(req.body.location),
        normalizeStudyDate(req.body.studyDate),
        normalizeOptionalText(req.body.mainScripture),
        JSON.stringify(normalizeJsonArray(req.body.linkedScriptures)),
        contentHtml,
        previewText,
        expectedVersion
      ]
    );

    if (!result.rows.length) {
      const latestStudy = await getStudyById(
        userId,
        id,
        client
      );

      await client.query("ROLLBACK");

      if (!latestStudy) {
        return res.status(404).json({
          ok: false,
          message: "Study not found"
        });
      }

      return res.status(409).json({
        ok: false,
        code: "STUDY_VERSION_CONFLICT",
        message: "This study was updated in another window or device.",
        latestStudy
      });
    }

    await replaceStudyTags(
      client,
      userId,
      id,
      req.body.tagIds
    );

    const study = await getStudyById(
      userId,
      id,
      client
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      message: "Study updated",
      study
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update study error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to update study"
    });
  } finally {
    client.release();
  }
});

app.delete("/api/studies/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;
    const expectedVersion = Number(req.query.expectedVersion);

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return res.status(428).json({
        ok: false,
        code: "STUDY_VERSION_REQUIRED",
        message: "This study must be reloaded before it can be deleted."
      });
    }

    const result = await pool.query(
      `
      DELETE FROM saved_studies
      WHERE user_id = $1
        AND id = $2
        AND version = $3
      RETURNING id
      `,
      [
        userId,
        id,
        expectedVersion
      ]
    );

    if (result.rows.length === 0) {
      const latestStudy = await getStudyById(
        userId,
        id
      );

      if (!latestStudy) {
        return res.status(404).json({
          ok: false,
          message: "Study not found"
        });
      }

      return res.status(409).json({
        ok: false,
        code: "STUDY_VERSION_CONFLICT",
        message: "This study changed before it could be deleted.",
        latestStudy
      });
    }

    res.json({
      ok: true,
      message: "Study deleted"
    });
  } catch (error) {
    console.error("Delete study error:", error);

    res.status(500).json({
      ok: false,
      message: "Failed to delete study"
    });
  }
});

// Serve your existing static files
app.use(express.static(__dirname));

// Default page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Bible app running on port ${PORT}`);
});
