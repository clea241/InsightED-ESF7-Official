// Deliberately flawed fixture app. Every secret below is fake.
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const API_SECRET = "FAKE_SECRET_DO_NOT_USE_1234";

app.use(cors({ origin: "*" }));
app.use(express.json());

function requireAuth(req, res, next) {
  if (req.headers.authorization !== API_SECRET)
    return res.status(401).json({ error: "unauthorized" });
  next();
}

app.get("/health", (req, res) => res.json({ ok: true }));

// FLAW: unauthenticated route, template-literal SQL with user input, and a table that no migration creates.
app.get("/api/invoices", async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM invoices WHERE id = ${req.query.id}`,
  );
  res.json(r.rows);
});

app.get("/api/users", requireAuth, async (req, res) => {
  const r = await pool.query("SELECT id, email FROM users WHERE id = $1", [
    req.query.id,
  ]);
  res.json(r.rows);
});

app.listen(3000);
