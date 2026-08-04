const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const { clerkMiddleware, requireAuth } = require("@clerk/express");
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
    const userId = req.auth.userId; // Defined securely from Clerk token

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
    await pool.query('BEGIN');
    await pool.query(
      "DELETE FROM saved_quill_notes WHERE user_id = $1 AND page_key = $2",
      [userId, pageKey]
    );
    await pool.query(
      "DELETE FROM saved_mini_editor_pages WHERE user_id = $1 AND page_key = $2",
      [userId, pageKey]
    );
    await pool.query('COMMIT');
    res.json({ ok: true, message: "Note deleted successfully from all tables" });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error("Delete full note error:", error);
    res.status(500).json({ ok: false, message: "Failed to delete note" });
  }
});


// ----------------------------------------------------
// Study Desk routes
// ----------------------------------------------------
const DEFAULT_CATEGORY_FALLBACKS = [
  { name: "Study", color: "#dbeafe", sortOrder: 10 },
  { name: "Sermon", color: "#ede9fe", sortOrder: 20 },
  { name: "Lesson", color: "#dcfce7", sortOrder: 30 },
  { name: "Teaching", color: "#fef3c7", sortOrder: 40 },
  { name: "Personal Study", color: "#fce7f3", sortOrder: 50 },
  { name: "Prayer", color: "#ccfbf1", sortOrder: 60 }
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
      if (seen.has(key)) return false;
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
    color: row.color || "#dbeafe",
    sortOrder: row.sort_order || 0,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTagRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color || "#dbeafe",
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStudyRow(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const category = row.category_id ? {
    id: row.category_id,
    name: row.category_name || "",
    color: row.category_color || "#dbeafe"
  } : null;

  return {
    id: row.id,
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
    SELECT name, color, sort_order
    FROM study_category_templates
    WHERE is_active = TRUE
    ORDER BY sort_order, name
    `
  );

  const sourceRows = templates.rows.length
    ? templates.rows.map((row) => ({
        name: row.name,
        color: row.color,
        sortOrder: row.sort_order
      }))
    : DEFAULT_CATEGORY_FALLBACKS;

  for (const row of sourceRows) {
    await pool.query(
      `
      INSERT INTO user_study_categories (user_id, name, color, sort_order, is_default, created_at, updated_at)
      VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
      ON CONFLICT (user_id, name) DO NOTHING
      `,
      [userId, row.name, normalizeColor(row.color), normalizeSortOrder(row.sortOrder)]
    );
  }
}

async function getUserCategories(userId) {
  await ensureUserStudyCategories(userId);

  const result = await pool.query(
    `
    SELECT id, user_id, name, color, sort_order, is_default, created_at, updated_at
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
    SELECT id, user_id, name, color, sort_order, created_at, updated_at
    FROM user_tags
    WHERE user_id = $1
    ORDER BY sort_order, name
    `,
    [userId]
  );

  return result.rows.map(mapTagRow);
}

async function categoryBelongsToUser(userId, categoryId) {
  if (!categoryId) return true;

  const result = await pool.query(
    `SELECT id FROM user_study_categories WHERE user_id = $1 AND id = $2 LIMIT 1`,
    [userId, categoryId]
  );

  return result.rows.length > 0;
}

async function replaceStudyTags(client, userId, studyId, tagIds) {
  const cleanTagIds = normalizeUuidArray(tagIds);

  await client.query(
    `DELETE FROM saved_study_tags WHERE user_id = $1 AND study_id = $2`,
    [userId, studyId]
  );

  if (!cleanTagIds.length) return;

  const ownedTags = await client.query(
    `SELECT id FROM user_tags WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, cleanTagIds]
  );

  for (const row of ownedTags.rows) {
    await client.query(
      `
      INSERT INTO saved_study_tags (user_id, study_id, tag_id, created_at)
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
      s.user_id,
      s.title,
      s.study_type,
      s.speaker,
      s.location,
      s.study_date,
      s.main_scripture,
      s.category_id,
      c.name AS category_name,
      c.color AS category_color,
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

  return result.rows.length ? mapStudyRow(result.rows[0]) : null;
}

app.get("/api/study-categories", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const categories = await getUserCategories(userId);
    res.json({ ok: true, categories });
  } catch (error) {
    console.error("Get study categories error:", error);
    res.status(500).json({ ok: false, message: "Failed to load categories" });
  }
});

app.post("/api/study-categories", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const name = normalizeText(req.body.name);

    if (!name) {
      return res.status(400).json({ ok: false, message: "Category name is required" });
    }

    const result = await pool.query(
      `
      INSERT INTO user_study_categories (user_id, name, color, sort_order, is_default, created_at, updated_at)
      VALUES ($1, $2, $3, $4, FALSE, NOW(), NOW())
      ON CONFLICT (user_id, name)
      DO UPDATE SET
        color = EXCLUDED.color,
        updated_at = NOW()
      RETURNING *
      `,
      [userId, name, normalizeColor(req.body.color), normalizeSortOrder(req.body.sortOrder, 100)]
    );

    res.status(201).json({ ok: true, category: mapCategoryRow(result.rows[0]) });
  } catch (error) {
    console.error("Create study category error:", error);
    res.status(500).json({ ok: false, message: "Failed to save category" });
  }
});

app.put("/api/study-categories/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;
    const name = normalizeText(req.body.name);

    if (!name) {
      return res.status(400).json({ ok: false, message: "Category name is required" });
    }

    const result = await pool.query(
      `
      UPDATE user_study_categories
      SET name = $3,
          color = $4,
          sort_order = $5,
          updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING *
      `,
      [userId, id, name, normalizeColor(req.body.color), normalizeSortOrder(req.body.sortOrder)]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "Category not found" });
    }

    res.json({ ok: true, category: mapCategoryRow(result.rows[0]) });
  } catch (error) {
    console.error("Update study category error:", error);
    res.status(500).json({ ok: false, message: "Failed to update category" });
  }
});

app.delete("/api/study-categories/:id", requireAuth(), async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    await client.query("BEGIN");

    await client.query(
      `UPDATE saved_studies SET category_id = NULL WHERE user_id = $1 AND category_id = $2`,
      [userId, id]
    );

    const result = await client.query(
      `DELETE FROM user_study_categories WHERE user_id = $1 AND id = $2 RETURNING id`,
      [userId, id]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Category not found" });
    }

    await client.query("COMMIT");
    res.json({ ok: true, message: "Category deleted" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete study category error:", error);
    res.status(500).json({ ok: false, message: "Failed to delete category" });
  } finally {
    client.release();
  }
});

app.get("/api/study-tags", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const tags = await getUserTags(userId);
    res.json({ ok: true, tags });
  } catch (error) {
    console.error("Get study tags error:", error);
    res.status(500).json({ ok: false, message: "Failed to load tags" });
  }
});

app.post("/api/study-tags", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const name = normalizeText(req.body.name);

    if (!name) {
      return res.status(400).json({ ok: false, message: "Tag name is required" });
    }

    const color = normalizeColor(req.body.color);

    const result = await pool.query(
      `
      INSERT INTO user_tags (user_id, name, color, sort_order, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id, name)
      DO UPDATE SET
        color = user_tags.color,
        updated_at = NOW()
      RETURNING *
      `,
      [userId, name, color, normalizeSortOrder(req.body.sortOrder, 100)]
    );

    res.status(201).json({ ok: true, tag: mapTagRow(result.rows[0]) });
  } catch (error) {
    console.error("Create study tag error:", error);
    res.status(500).json({ ok: false, message: "Failed to save tag" });
  }
});

app.put("/api/study-tags/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;
    const name = normalizeText(req.body.name);

    if (!name) {
      return res.status(400).json({ ok: false, message: "Tag name is required" });
    }

    const result = await pool.query(
      `
      UPDATE user_tags
      SET name = $3,
          color = $4,
          sort_order = $5,
          updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING *
      `,
      [userId, id, name, normalizeColor(req.body.color), normalizeSortOrder(req.body.sortOrder)]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "Tag not found" });
    }

    res.json({ ok: true, tag: mapTagRow(result.rows[0]) });
  } catch (error) {
    console.error("Update study tag error:", error);
    res.status(500).json({ ok: false, message: "Failed to update tag" });
  }
});

app.delete("/api/study-tags/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM user_tags WHERE user_id = $1 AND id = $2 RETURNING id`,
      [userId, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, message: "Tag not found" });
    }

    res.json({ ok: true, message: "Tag deleted" });
  } catch (error) {
    console.error("Delete study tag error:", error);
    res.status(500).json({ ok: false, message: "Failed to delete tag" });
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
        s.user_id,
        s.title,
        s.study_type,
        s.speaker,
        s.location,
        s.study_date,
        s.main_scripture,
        s.category_id,
        c.name AS category_name,
        c.color AS category_color,
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

    res.json({ ok: true, studies: result.rows.map(mapStudyRow) });
  } catch (error) {
    console.error("Get studies error:", error);
    res.status(500).json({ ok: false, message: "Failed to load studies" });
  }
});

app.get("/api/studies/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;
    const study = await getStudyById(userId, id);

    if (!study) {
      return res.status(404).json({ ok: false, message: "Study not found" });
    }

    res.json({ ok: true, study });
  } catch (error) {
    console.error("Get study error:", error);
    res.status(500).json({ ok: false, message: "Failed to load study" });
  }
});

app.post("/api/studies", requireAuth(), async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.auth.userId;
    const title = normalizeText(req.body.title);
    const categoryId = normalizeOptionalText(req.body.categoryId) || null;
    const contentHtml = typeof req.body.contentHtml === "string" ? req.body.contentHtml : "";
    const previewText = normalizeOptionalText(req.body.previewText) || buildPreviewText(contentHtml);

    if (!title) {
      return res.status(400).json({ ok: false, message: "Study title is required" });
    }

    if (!(await categoryBelongsToUser(userId, categoryId))) {
      return res.status(400).json({ ok: false, message: "Selected category is not available" });
    }

    await client.query("BEGIN");

    const categoryName = categoryId
      ? (await client.query(
          `SELECT name FROM user_study_categories WHERE user_id = $1 AND id = $2 LIMIT 1`,
          [userId, categoryId]
        )).rows[0]?.name || "Study"
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, NOW(), NOW())
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
    await replaceStudyTags(client, userId, studyId, req.body.tagIds);

    const study = await getStudyById(userId, studyId, client);
    await client.query("COMMIT");

    res.status(201).json({ ok: true, message: "Study saved", study });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create study error:", error);
    res.status(500).json({ ok: false, message: "Failed to save study" });
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
    const contentHtml = typeof req.body.contentHtml === "string" ? req.body.contentHtml : "";
    const previewText = normalizeOptionalText(req.body.previewText) || buildPreviewText(contentHtml);

    if (!title) {
      return res.status(400).json({ ok: false, message: "Study title is required" });
    }

    if (!(await categoryBelongsToUser(userId, categoryId))) {
      return res.status(400).json({ ok: false, message: "Selected category is not available" });
    }

    await client.query("BEGIN");

    const categoryName = categoryId
      ? (await client.query(
          `SELECT name FROM user_study_categories WHERE user_id = $1 AND id = $2 LIMIT 1`,
          [userId, categoryId]
        )).rows[0]?.name || "Study"
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
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING id
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
        previewText
      ]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Study not found" });
    }

    await replaceStudyTags(client, userId, id, req.body.tagIds);

    const study = await getStudyById(userId, id, client);
    await client.query("COMMIT");

    res.json({ ok: true, message: "Study updated", study });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update study error:", error);
    res.status(500).json({ ok: false, message: "Failed to update study" });
  } finally {
    client.release();
  }
});

app.delete("/api/studies/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM saved_studies WHERE user_id = $1 AND id = $2 RETURNING id`,
      [userId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Study not found" });
    }

    res.json({ ok: true, message: "Study deleted" });
  } catch (error) {
    console.error("Delete study error:", error);
    res.status(500).json({ ok: false, message: "Failed to delete study" });
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
