import express from "express";
import path from "path";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

// Vercel serverless functions write to /tmp
const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/health_copilot.db' : 'health_copilot.db';
const db = new Database(dbPath);

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    age INTEGER,
    gender TEXT,
    height REAL,
    weight REAL,
    activity_level TEXT,
    conditions TEXT,
    goal TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS health_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    report_data TEXT,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS progress_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    weight REAL,
    mood TEXT,
    energy_level INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

const app = express();
app.use(express.json({ limit: '10mb' }));

// API Routes
app.post("/api/auth/register", (req, res) => {
  const { email, password, name } = req.body;
  try {
    const stmt = db.prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)");
    const info = stmt.run(email, password, name);
    res.json({ id: info.lastInsertRowid, email, name });
  } catch (e) {
    res.status(400).json({ error: "Email already exists" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
  if (user) {
    res.json(user);
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.get("/api/user/:id", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  res.json(user);
});

app.put("/api/user/:id/profile", (req, res) => {
  const { age, gender, height, weight, activity_level, conditions, goal } = req.body;
  const stmt = db.prepare(`
    UPDATE users 
    SET age = ?, gender = ?, height = ?, weight = ?, activity_level = ?, conditions = ?, goal = ?
    WHERE id = ?
  `);
  stmt.run(age, gender, height, weight, activity_level, conditions, goal, req.params.id);
  res.json({ success: true });
});

app.post("/api/health/record", (req, res) => {
  const { user_id, report_data, summary } = req.body;
  const stmt = db.prepare("INSERT INTO health_records (user_id, report_data, summary) VALUES (?, ?, ?)");
  stmt.run(user_id, JSON.stringify(report_data), summary);
  res.json({ success: true });
});

app.get("/api/health/records/:user_id", (req, res) => {
  const records = db.prepare("SELECT * FROM health_records WHERE user_id = ? ORDER BY created_at DESC").all(req.params.user_id);
  res.json(records.map(r => ({ ...r, report_data: JSON.parse(r.report_data) })));
});

app.post("/api/plans", (req, res) => {
  const { user_id, type, content } = req.body;
  const stmt = db.prepare("INSERT INTO plans (user_id, type, content) VALUES (?, ?, ?)");
  stmt.run(user_id, type, JSON.stringify(content));
  res.json({ success: true });
});

app.get("/api/plans/:user_id", (req, res) => {
  const plans = db.prepare("SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC").all(req.params.user_id);
  res.json(plans.map(p => ({ ...p, content: JSON.parse(p.content) })));
});

app.post("/api/progress", (req, res) => {
  const { user_id, weight, mood, energy_level, notes } = req.body;
  const stmt = db.prepare("INSERT INTO progress_logs (user_id, weight, mood, energy_level, notes) VALUES (?, ?, ?, ?, ?)");
  stmt.run(user_id, weight, mood, energy_level, notes);
  res.json({ success: true });
});

app.get("/api/progress/:user_id", (req, res) => {
  const logs = db.prepare("SELECT * FROM progress_logs WHERE user_id = ? ORDER BY created_at DESC").all(req.params.user_id);
  res.json(logs);
});

export default app;
