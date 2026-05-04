const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(cookieParser());

// PostgreSQL connection pool
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.delete("sslmode");

const pool = new Pool({
  connectionString: dbUrl.toString(),
  ssl: {
    rejectUnauthorized: false
  }
});

const JWT_SECRET = process.env.JWT_SECRET || "temporary-dev-secret-change-this";

// Create users table if it does not exist
async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
  `);

  console.log("Database setup complete");
}

setupDatabase().catch((error) => {
  console.error("Database setup failed:", error);
});

// Middleware to check if user is logged in
function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;

  if (!token) {
    return res.status(401).json({
      ok: false,
      message: "Not logged in"
    });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: "Invalid or expired login"
    });
  }
}

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

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, passwordRepeat } = req.body;

    if (!email || !password || !passwordRepeat) {
      return res.status(400).json({
        ok: false,
        message: "Email, password, and repeated password are required"
      });
    }

    if (password !== passwordRepeat) {
      return res.status(400).json({
        ok: false,
        message: "Passwords do not match"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        ok: false,
        message: "Password must be at least 8 characters"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, created_at
      `,
      [normalizedEmail, passwordHash]
    );

    res.status(201).json({
      ok: true,
      message: "Account created",
      user: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "An account with this email already exists"
      });
    }

    console.error("Signup failed:", error);

    res.status(500).json({
      ok: false,
      message: "Signup failed"
    });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, username, password, remember } = req.body;

    const loginEmail = (email || username || "").trim().toLowerCase();

    if (!loginEmail || !password) {
      return res.status(400).json({
        ok: false,
        message: "Email/username and password are required"
      });
    }

    const result = await pool.query(
      `
      SELECT id, email, password_hash
      FROM users
      WHERE email = $1
      `,
      [loginEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        ok: false,
        message: "Invalid login"
      });
    }

    const user = result.rows[0];
    const passwordIsValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordIsValid) {
      return res.status(401).json({
        ok: false,
        message: "Invalid login"
      });
    }

    await pool.query(
      `
      UPDATE users
      SET last_login_at = NOW()
      WHERE id = $1
      `,
      [user.id]
    );

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email
      },
      JWT_SECRET,
      {
        expiresIn: remember ? "30d" : "2h"
      }
    );

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000
    });

    res.json({
      ok: true,
      message: "Logged in",
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    console.error("Login failed:", error);

    res.status(500).json({
      ok: false,
      message: "Login failed"
    });
  }
});

// Check current logged-in user
app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: req.user
  });
});

// Logout
app.post("/api/logout", (req, res) => {
  res.clearCookie("auth_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: true
  });

  res.json({
    ok: true,
    message: "Logged out"
  });
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
