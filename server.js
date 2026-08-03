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
    const clerkUserId = req.auth.userId; // Defined securely from Clerk token

    if (!pageKey) {
      return res.status(400).json({ ok: false, message: "Missing pageKey" });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        clerk_user_id,
        bible_version_id,
        bible_chapter_id,
        page_key,
        quill_delta_json,
        quill_plain_text,
        created_at,
        updated_at
      FROM saved_quill_notes
      WHERE clerk_user_id = $1
        AND page_key = $2
      LIMIT 1
      `,
      [clerkUserId, pageKey]
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
    const clerkUserId = req.auth.userId;
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
        clerk_user_id,
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
      ON CONFLICT (clerk_user_id, page_key)
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
        clerkUserId,
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
    const clerkUserId = req.auth.userId;

    if (!pageKey) {
      return res.status(400).json({ ok: false, message: "Missing pageKey" });
    }

    await pool.query(
      `DELETE FROM saved_quill_notes WHERE clerk_user_id = $1 AND page_key = $2`,
      [clerkUserId, pageKey]
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
    const clerkUserId = req.auth.userId;

    if (!pageKey) {
      return res.status(400).json({ ok: false, message: "Missing pageKey" });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        clerk_user_id,
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
      WHERE clerk_user_id = $1 AND page_key = $2
      LIMIT 1
      `,
      [clerkUserId, pageKey]
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
    const clerkUserId = req.auth.userId;
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
        clerk_user_id,
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
      ON CONFLICT (clerk_user_id, page_key)
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
        clerkUserId,
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
    const clerkUserId = req.auth.userId;

    if (!pageKey) {
      return res.status(400).json({ ok: false, message: "Missing pageKey" });
    }

    await pool.query(
      `DELETE FROM saved_mini_editor_pages WHERE clerk_user_id = $1 AND page_key = $2`,
      [clerkUserId, pageKey]
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
    const clerkUserId = req.auth.userId;

    const quillResult = await pool.query(
      `SELECT page_key, bible_version_id, bible_chapter_id, page_url, quill_plain_text, updated_at 
       FROM saved_quill_notes WHERE clerk_user_id = $1`,
      [clerkUserId]
    );

    const miniEditorResult = await pool.query(
      `SELECT page_key, bible_version_id, bible_chapter_id, page_url, bible_name, book_chapter_label, has_highlights, has_drawings, has_text_formats, updated_at 
       FROM saved_mini_editor_pages WHERE clerk_user_id = $1`,
      [clerkUserId]
    );

    const notesByPageKey = new Map();

    quillResult.rows.forEach((note) => {
      notesByPageKey.set(note.page_key, {
        pageKey: note.page_key,
        bibleVersionID: note.bible_version_id,
        bibleChapterID: note.bible_chapter_id,
        bibleName: getBibleAbbrFromPageUrl(note.page_url),
        bookChapterLabel: note.bible_chapter_id,
        pageUrl: note.page_url,
        hasQuillNotes: !!(note.quill_plain_text && note.quill_plain_text.trim()),
        hasHighlights: false,
        hasDrawings: false,
        hasTextFormats: false,
        preview: note.quill_plain_text || "",
        updatedAt: note.updated_at
      });
    });

    miniEditorResult.rows.forEach((page) => {
      const existing = notesByPageKey.get(page.page_key);
      if (existing) {
        existing.bibleVersionID = existing.bibleVersionID || page.bible_version_id;
        existing.bibleChapterID = existing.bibleChapterID || page.bible_chapter_id;
        existing.bibleName = getBibleAbbrFromPageUrl(page.page_url) || page.bible_name || existing.bibleName || "";
        existing.bookChapterLabel = page.book_chapter_label || existing.bookChapterLabel || page.bible_chapter_id;
        existing.pageUrl = existing.pageUrl || page.page_url;
        existing.hasHighlights = !!page.has_highlights;
        existing.hasDrawings = !!page.has_drawings;
        existing.hasTextFormats = !!page.has_text_formats;

        if (new Date(page.updated_at) > new Date(existing.updatedAt)) {
          existing.updatedAt = page.updated_at;
        }
      } else {
        notesByPageKey.set(page.page_key, {
          pageKey: page.page_key,
          bibleVersionID: page.bible_version_id,
          bibleChapterID: page.bible_chapter_id,
          bibleName: getBibleAbbrFromPageUrl(page.page_url) || page.bible_name || "",
          bookChapterLabel: page.book_chapter_label || page.bible_chapter_id,
          pageUrl: page.page_url,
          hasQuillNotes: false,
          hasHighlights: !!page.has_highlights,
          hasDrawings: !!page.has_drawings,
          hasTextFormats: !!page.has_text_formats,
          preview: "",
          updatedAt: page.updated_at
        });
      }
    });

    const notes = Array.from(notesByPageKey.values()).sort((a, b) => {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    res.json({ ok: true, notes });
  } catch (error) {
    console.error("Get my notes error:", error);
    res.status(500).json({ ok: false, message: "Failed to load my notes" });
  }
});

app.delete("/api/my-notes/:pageKey", requireAuth(), async (req, res) => {
  const { pageKey } = req.params;
  const clerkUserId = req.auth.userId;

  try {
    await pool.query('BEGIN');
    await pool.query(
      "DELETE FROM saved_quill_notes WHERE clerk_user_id = $1 AND page_key = $2",
      [clerkUserId, pageKey]
    );
    await pool.query(
      "DELETE FROM saved_mini_editor_pages WHERE clerk_user_id = $1 AND page_key = $2",
      [clerkUserId, pageKey]
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
function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStudyDate(value) {
  if (!value) return null;
  if (typeof value !== "string") return null;
  return value;
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

function mapStudyRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    studyType: row.study_type,
    speaker: row.speaker,
    location: row.location,
    studyDate: row.study_date,
    mainScripture: row.main_scripture,
    tags: row.tags || [],
    linkedScriptures: row.linked_scriptures || [],
    contentHtml: row.content_html || "",
    previewText: row.preview_text || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

app.get("/api/studies", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        title,
        study_type,
        speaker,
        location,
        study_date,
        main_scripture,
        tags,
        linked_scriptures,
        content_html,
        preview_text,
        created_at,
        updated_at
      FROM saved_studies
      WHERE user_id = $1
      ORDER BY updated_at DESC
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

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        title,
        study_type,
        speaker,
        location,
        study_date,
        main_scripture,
        tags,
        linked_scriptures,
        content_html,
        preview_text,
        created_at,
        updated_at
      FROM saved_studies
      WHERE user_id = $1
        AND id = $2
      LIMIT 1
      `,
      [userId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Study not found" });
    }

    res.json({ ok: true, study: mapStudyRow(result.rows[0]) });
  } catch (error) {
    console.error("Get study error:", error);
    res.status(500).json({ ok: false, message: "Failed to load study" });
  }
});

app.post("/api/studies", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const title = normalizeText(req.body.title);
    const contentHtml = typeof req.body.contentHtml === "string" ? req.body.contentHtml : "";
    const previewText = normalizeOptionalText(req.body.previewText) || buildPreviewText(contentHtml);

    if (!title) {
      return res.status(400).json({ ok: false, message: "Study title is required" });
    }

    const result = await pool.query(
      `
      INSERT INTO saved_studies (
        user_id,
        title,
        study_type,
        speaker,
        location,
        study_date,
        main_scripture,
        tags,
        linked_scriptures,
        content_html,
        preview_text,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, NOW(), NOW())
      RETURNING *
      `,
      [
        userId,
        title,
        normalizeOptionalText(req.body.studyType) || "study",
        normalizeOptionalText(req.body.speaker),
        normalizeOptionalText(req.body.location),
        normalizeStudyDate(req.body.studyDate),
        normalizeOptionalText(req.body.mainScripture),
        JSON.stringify(normalizeJsonArray(req.body.tags)),
        JSON.stringify(normalizeJsonArray(req.body.linkedScriptures)),
        contentHtml,
        previewText
      ]
    );

    res.status(201).json({ ok: true, message: "Study saved", study: mapStudyRow(result.rows[0]) });
  } catch (error) {
    console.error("Create study error:", error);
    res.status(500).json({ ok: false, message: "Failed to save study" });
  }
});

app.put("/api/studies/:id", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { id } = req.params;
    const title = normalizeText(req.body.title);
    const contentHtml = typeof req.body.contentHtml === "string" ? req.body.contentHtml : "";
    const previewText = normalizeOptionalText(req.body.previewText) || buildPreviewText(contentHtml);

    if (!title) {
      return res.status(400).json({ ok: false, message: "Study title is required" });
    }

    const result = await pool.query(
      `
      UPDATE saved_studies
      SET
        title = $3,
        study_type = $4,
        speaker = $5,
        location = $6,
        study_date = $7,
        main_scripture = $8,
        tags = $9::jsonb,
        linked_scriptures = $10::jsonb,
        content_html = $11,
        preview_text = $12,
        updated_at = NOW()
      WHERE user_id = $1
        AND id = $2
      RETURNING *
      `,
      [
        userId,
        id,
        title,
        normalizeOptionalText(req.body.studyType) || "study",
        normalizeOptionalText(req.body.speaker),
        normalizeOptionalText(req.body.location),
        normalizeStudyDate(req.body.studyDate),
        normalizeOptionalText(req.body.mainScripture),
        JSON.stringify(normalizeJsonArray(req.body.tags)),
        JSON.stringify(normalizeJsonArray(req.body.linkedScriptures)),
        contentHtml,
        previewText
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Study not found" });
    }

    res.json({ ok: true, message: "Study updated", study: mapStudyRow(result.rows[0]) });
  } catch (error) {
    console.error("Update study error:", error);
    res.status(500).json({ ok: false, message: "Failed to update study" });
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
