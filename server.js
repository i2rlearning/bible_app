const express = require("express");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Simple API test
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Bible app API is running"
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
