import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface HealthProfile {
  age: number;
  gender: string;
  height: number;
  weight: number;
  activityLevel: string;
  conditions: string[];
  goal?: string;
  metrics?: {
    cholesterol?: number;
    glucose?: number;
    bloodPressure?: string;
    bmi?: number;
  };
}

export const analyzeMedicalReport = async (base64Image: string, lang: string = 'en'): Promise<any> => {
  const model = "gemini-3-flash-preview";
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1] || base64Image,
            },
          },
          {
            text: `Extract all health indicators from this medical report. Return a JSON object with keys like 'cholesterol', 'glucose', 'bloodPressure', 'bmi', 'liverEnzymes', etc. Also include a 'summary' of the findings and 'abnormalValues' list. Please provide the 'summary' and 'abnormalValues' in ${lang === 'vi' ? 'Vietnamese' : 'English'}.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          metrics: {
            type: Type.OBJECT,
            properties: {
              cholesterol: { type: Type.NUMBER },
              glucose: { type: Type.NUMBER },
              bloodPressure: { type: Type.STRING },
              bmi: { type: Type.NUMBER },
            },
          },
          summary: { type: Type.STRING },
          abnormalValues: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["summary"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
};

export const generateHealthPlan = async (profile: HealthProfile, lang: string = 'en'): Promise<any> => {
  const model = "gemini-3.1-pro-preview";
  const prompt = `
    Based on the following user health profile and their desired body proportions/goal, generate a comprehensive 7-day health plan.
    Profile: ${JSON.stringify(profile)}
    Desired Goal: ${profile.goal || 'General Health'}
    
    The plan should include:
    1. A 7-day workout schedule (exercise type, duration, intensity). Tailor the exercises to help achieve the "Desired Goal" (e.g., if V-Taper, focus more on shoulders and back; if Hourglass, focus on glutes and core).
    2. A daily nutrition plan (calorie target, macronutrient breakdown, sample meals). Adjust calories and macros based on the goal (e.g., surplus for Bulky, deficit for Weight Loss).
    3. Specific food restrictions or recommendations based on health conditions.
    4. A brief explanation of the reasoning behind this plan, specifically how it helps achieve the Desired Goal.
    
    IMPORTANT: Return all text descriptions (activity names, recommendations, reasoning, meal names) in ${lang === 'vi' ? 'Vietnamese' : 'English'}.
    
    Return the response in a structured JSON format.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          workoutPlan: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING },
                activity: { type: Type.STRING },
                duration: { type: Type.STRING },
                intensity: { type: Type.STRING },
              },
            },
          },
          nutritionPlan: {
            type: Type.OBJECT,
            properties: {
              dailyCalories: { type: Type.NUMBER },
              macros: {
                type: Type.OBJECT,
                properties: {
                  protein: { type: Type.STRING },
                  carbs: { type: Type.STRING },
                  fats: { type: Type.STRING },
                },
              },
              sampleMeals: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          reasoning: { type: Type.STRING },
        },
      },
    },
  });

  return JSON.parse(response.text || "{}");
};
