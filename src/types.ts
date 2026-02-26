export interface User {
  id: number;
  email: string;
  name: string;
  age?: number;
  gender?: string;
  height?: number;
  weight?: number;
  activity_level?: string;
  conditions?: string;
  goal?: string;
  target_weight?: number;
  workout_intensity?: 'low' | 'medium' | 'high';
  strava_access_token?: string;
  strava_refresh_token?: string;
  strava_expires_at?: number;
}

export interface HealthRecord {
  id: number;
  user_id: number;
  report_data: any;
  summary: string;
  created_at: string;
}

export interface HealthPlan {
  id: number;
  user_id: number;
  type: string;
  content: any;
  created_at: string;
}

export interface ProgressLog {
  id: number;
  user_id: number;
  weight: number;
  mood: string;
  energy_level: number;
  notes: string;
  created_at: string;
}
