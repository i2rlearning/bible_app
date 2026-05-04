const express = require("express");
const path = require("path");

const app = express();

app.use(express.json());

// Simple API test
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Bible app API is running"
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
