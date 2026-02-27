import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import axios from "axios";
import OpenAI from "openai";

dotenv.config();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    env: process.env.NODE_ENV,
    supabase: !!supabaseUrl && !!supabaseKey
  });
});

// API Routes
app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, password, name }])
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    console.error("Registration error:", e);
    res.status(400).json({ error: e.message || "Email already exists" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .single();

  if (data) {
    res.json(data);
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.get("/api/user/:id", async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (!data) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(data);
});

app.put("/api/user/:id/profile", async (req, res) => {
  const { age, gender, height, weight, activity_level, conditions, goal, target_weight, workout_intensity } = req.body;
  
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ age, gender, height, weight, activity_level, conditions, goal, target_weight, workout_intensity: workout_intensity || 'medium' })
      .eq('id', req.params.id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) {
    console.error("Profile update error:", e);
    res.status(500).json({ error: e.message || "Failed to update profile" });
  }
});

// Strava OAuth
app.get("/api/auth/strava/url", (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(400).json({ 
      error: "Strava API credentials are missing." 
    });
  }

  const origin = req.query.origin as string;
  let appUrl = process.env.APP_URL || origin || `http://localhost:3000`;
  appUrl = appUrl.replace(/\/$/, "");
  
  const redirectUri = `${appUrl}/api/auth/strava/callback`;
  
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

    const { error } = await supabase
      .from('users')
      .update({ strava_access_token: access_token, strava_refresh_token: refresh_token, strava_expires_at: expires_at })
      .eq('id', userId);

    if (error) throw error;

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
          <p>Strava connected successfully!</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Strava OAuth error:", error);
    res.status(500).send("Failed to connect Strava");
  }
});

app.get("/api/strava/activities/:userId", async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.params.userId)
    .single();

  if (!user || !user.strava_access_token) {
    return res.status(404).json({ error: "Strava not connected" });
  }

  try {
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
      
      await supabase
        .from('users')
        .update({ strava_access_token: accessToken, strava_refresh_token: refresh_token, strava_expires_at: expires_at })
        .eq('id', user.id);
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
app.post("/api/meals", async (req, res) => {
  const { user_id, meal_name, calories } = req.body;
  const { error } = await supabase
    .from('daily_meals')
    .insert([{ user_id, meal_name, calories }]);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get("/api/meals/:userId", async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('daily_meals')
    .select('*')
    .eq('user_id', req.params.userId)
    .gte('created_at', `${today}T00:00:00Z`)
    .lte('created_at', `${today}T23:59:59Z`)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/meals/:id", async (req, res) => {
  const { error } = await supabase
    .from('daily_meals')
    .delete()
    .eq('id', req.params.id);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post("/api/health/record", async (req, res) => {
  const { user_id, report_data, summary } = req.body;
  const { error } = await supabase
    .from('health_records')
    .insert([{ user_id, report_data, summary }]);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get("/api/health/records/:userId", async (req, res) => {
  const { data, error } = await supabase
    .from('health_records')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/plans", async (req, res) => {
  const { user_id, type, content } = req.body;
  try {
    const { error } = await supabase
      .from('plans')
      .insert([{ user_id, type, content }]);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/plans/:userId", async (req, res) => {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/progress", async (req, res) => {
  const { user_id, weight, mood, energy_level, notes } = req.body;
  const { error } = await supabase
    .from('progress_logs')
    .insert([{ user_id, weight, mood, energy_level, notes }]);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get("/api/progress/:userId", async (req, res) => {
  const { data, error } = await supabase
    .from('progress_logs')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/ai/chat", async (req, res) => {
  if (!openai) return res.status(400).json({ error: "OpenAI not configured" });
  const { messages, model = "gpt-4o-mini", response_format } = req.body;
  try {
    const completion = await openai.chat.completions.create({ model, messages, response_format });
    res.json(completion.choices[0].message);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default app;
