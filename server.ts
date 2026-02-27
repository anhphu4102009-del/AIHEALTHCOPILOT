import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import axios from "axios";
import OpenAI from "openai";

dotenv.config();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("health_copilot.db");

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
    target_weight REAL,
    workout_intensity TEXT DEFAULT 'medium',
    strava_access_token TEXT,
    strava_refresh_token TEXT,
    strava_expires_at INTEGER,
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

  CREATE TABLE IF NOT EXISTS daily_meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    meal_name TEXT,
    calories INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV,
      db: !!db 
    });
  });

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
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  });

  app.put("/api/user/:id/profile", (req, res) => {
    console.log("Received profile update for user:", req.params.id);
    console.log("Request body:", req.body);

    const { age, gender, height, weight, activity_level, conditions, goal, target_weight, workout_intensity } = req.body;
    
    if (age === undefined || gender === undefined || height === undefined || weight === undefined) {
      console.error("Validation Error: Missing required profile fields");
      return res.status(400).json({ error: "Missing required profile fields" });
    }

    try {
      const stmt = db.prepare(`
        UPDATE users 
        SET age = ?, gender = ?, height = ?, weight = ?, activity_level = ?, conditions = ?, goal = ?, target_weight = ?, workout_intensity = ?
        WHERE id = ?
      `);
      stmt.run(age, gender, height, weight, activity_level, conditions, goal, target_weight, workout_intensity || 'medium', req.params.id);
      
      console.log("Profile updated successfully for user:", req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error("Database Error during profile update:", e);
      res.status(500).json({ error: "Failed to update profile in database" });
    }
  });

  // Strava OAuth
  app.get("/api/auth/strava/url", (req, res) => {
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(400).json({ 
        error: "Strava API credentials are missing. Please set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in Secrets." 
      });
    }

    const origin = req.query.origin as string;
    // Prefer APP_URL from environment, fallback to origin from client, then localhost
    let appUrl = process.env.APP_URL || origin || `http://localhost:3000`;
    appUrl = appUrl.replace(/\/$/, ""); // Remove trailing slash
    
    const redirectUri = `${appUrl}/api/auth/strava/callback`;
    
    console.log("Strava Auth Attempt:");
    console.log("- Origin:", origin);
    console.log("- Redirect URI:", redirectUri);
    console.log("- Client ID:", clientId);
    
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'read,activity:read_all',
      state: req.query.userId as string
    });

    res.json({ url: `https://www.strava.com/oauth/authorize?${params.toString()}` });
  });

  app.get("/api/auth/strava/callback", async (req, res) => {
    const { code, state: userId } = req.query;
    
    try {
      const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      });

      const { access_token, refresh_token, expires_at } = response.data;

      const stmt = db.prepare(`
        UPDATE users 
        SET strava_access_token = ?, strava_refresh_token = ?, strava_expires_at = ?
        WHERE id = ?
      `);
      stmt.run(access_token, refresh_token, expires_at, userId);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'STRAVA_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Strava connected successfully! You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Strava OAuth error:", error);
      res.status(500).send("Failed to connect Strava");
    }
  });

  app.get("/api/strava/activities/:userId", async (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.userId);
    if (!user || !user.strava_access_token) {
      return res.status(404).json({ error: "Strava not connected" });
    }

    try {
      // Check if token expired
      let accessToken = user.strava_access_token;
      if (Date.now() / 1000 > user.strava_expires_at) {
        const refreshResponse = await axios.post('https://www.strava.com/oauth/token', {
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          refresh_token: user.strava_refresh_token,
          grant_type: 'refresh_token'
        });
        accessToken = refreshResponse.data.access_token;
        const { refresh_token, expires_at } = refreshResponse.data;
        
        db.prepare(`
          UPDATE users SET strava_access_token = ?, strava_refresh_token = ?, strava_expires_at = ? WHERE id = ?
        `).run(accessToken, refresh_token, expires_at, user.id);
      }

      const activitiesResponse = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { per_page: 5 }
      });

      res.json(activitiesResponse.data);
    } catch (error) {
      console.error("Strava fetch error:", error);
      res.status(500).json({ error: "Failed to fetch Strava activities" });
    }
  });

  // Daily Meals
  app.post("/api/meals", (req, res) => {
    const { user_id, meal_name, calories } = req.body;
    const stmt = db.prepare("INSERT INTO daily_meals (user_id, meal_name, calories) VALUES (?, ?, ?)");
    stmt.run(user_id, meal_name, calories);
    res.json({ success: true });
  });

  app.get("/api/meals/:userId", (req, res) => {
    const meals = db.prepare("SELECT * FROM daily_meals WHERE user_id = ? AND date(created_at) = date('now') ORDER BY created_at DESC").all(req.params.userId);
    res.json(meals);
  });

  app.delete("/api/meals/:id", (req, res) => {
    db.prepare("DELETE FROM daily_meals WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/health/record", (req, res) => {
    const { user_id, report_data, summary } = req.body;
    const stmt = db.prepare("INSERT INTO health_records (user_id, report_data, summary) VALUES (?, ?, ?)");
    stmt.run(user_id, JSON.stringify(report_data), summary);
    res.json({ success: true });
  });

  app.get("/api/health/records/:userId", (req, res) => {
    const records = db.prepare("SELECT * FROM health_records WHERE user_id = ? ORDER BY created_at DESC").all(req.params.userId);
    res.json(records.map(r => ({ ...r, report_data: JSON.parse(r.report_data) })));
  });

  app.post("/api/plans", (req, res) => {
    const { user_id, type, content } = req.body;
    if (!user_id || !type || !content) {
      return res.status(400).json({ error: "Missing user_id, type, or content." });
    }
    try {
      // Ensure content is a stringified JSON
      const contentString = typeof content === 'string' ? content : JSON.stringify(content);
      const stmt = db.prepare("INSERT INTO plans (user_id, type, content) VALUES (?, ?, ?)");
      stmt.run(user_id, type, contentString);
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        console.warn(`Plan save rejected: User ID ${user_id} does not exist.`);
        return res.status(400).json({ error: "User ID does not exist." });
      }
      console.error("Error inserting plan:", error.message, error.stack);
      res.status(500).json({ error: "Failed to save plan due to internal server error." });
    }
  });

  app.get("/api/plans/:userId", (req, res) => {
    const plans = db.prepare("SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC").all(req.params.userId);
    res.json(plans.map(p => {
      let content = {};
      try {
        content = JSON.parse(p.content);
      } catch (e) {
        console.error("Failed to parse plan content:", p.content);
      }
      return { ...p, content };
    }));
  });

  app.post("/api/progress", (req, res) => {
    const { user_id, weight, mood, energy_level, notes } = req.body;
    const stmt = db.prepare("INSERT INTO progress_logs (user_id, weight, mood, energy_level, notes) VALUES (?, ?, ?, ?, ?)");
    stmt.run(user_id, weight, mood, energy_level, notes);
    res.json({ success: true });
  });

  app.get("/api/progress/:userId", (req, res) => {
    const logs = db.prepare("SELECT * FROM progress_logs WHERE user_id = ? ORDER BY created_at DESC").all(req.params.userId);
    res.json(logs);
  });

  // AI Proxy for OpenAI (to keep API key secure)
  app.post("/api/ai/chat", async (req, res) => {
    if (!openai) {
      return res.status(400).json({ error: "OpenAI API key not configured on server." });
    }

    const { messages, model = "gpt-4o-mini", response_format } = req.body;

    try {
      // Ensure we use a model that supports vision if images are present
      const selectedModel = messages.some((m: any) => 
        Array.isArray(m.content) && m.content.some((p: any) => p.type === 'image_url')
      ) ? "gpt-4o-mini" : model;

      const completion = await openai.chat.completions.create({
        model: selectedModel,
        messages,
        response_format
      });

      res.json(completion.choices[0].message);
    } catch (error: any) {
      console.error("OpenAI Error:", error);
      res.status(500).json({ error: error.message || "Failed to call OpenAI" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
