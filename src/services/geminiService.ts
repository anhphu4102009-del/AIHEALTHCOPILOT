import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface HealthProfile {
  age: number;
  gender: string;
  height: number;
  weight: number;
  targetWeight?: number;
  workoutIntensity?: string;
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

export const generateFallbackPlan = (profile: any, lang: string) => {
  const bmr = profile.gender === 'Male' 
    ? 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5
    : 10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161;

  const activityMultipliers: any = {
    'Sedentary': 1.2,
    'Light': 1.375,
    'Moderate': 1.55,
    'Active': 1.725,
    'Very Active': 1.9
  };
  const tdee = bmr * (activityMultipliers[profile.activityLevel] || 1.2);

  let dailyCalories = Math.round(tdee);
  if (profile.goal?.toLowerCase().includes('lose') || profile.targetWeight < profile.weight) {
    dailyCalories -= 500;
  } else if (profile.goal?.toLowerCase().includes('gain') || profile.targetWeight > profile.weight) {
    dailyCalories += 500;
  }

  const protein = Math.round((dailyCalories * 0.3) / 4);
  const carbs = Math.round((dailyCalories * 0.4) / 4);
  const fats = Math.round((dailyCalories * 0.3) / 9);

  const isVi = lang === 'vi';

  return {
    workoutPlan: [
      { day: isVi ? "Thứ 2" : "Monday", activity: isVi ? "Cardio nhẹ" : "Light Cardio", duration: "30 min", intensity: "Low" },
      { day: isVi ? "Thứ 3" : "Tuesday", activity: isVi ? "Tập sức mạnh" : "Strength Training", duration: "45 min", intensity: "Medium" },
      { day: isVi ? "Thứ 4" : "Wednesday", activity: isVi ? "Nghỉ ngơi" : "Rest", duration: "-", intensity: "-" },
      { day: isVi ? "Thứ 5" : "Thursday", activity: isVi ? "Cardio cường độ cao" : "HIIT", duration: "20 min", intensity: "High" },
      { day: isVi ? "Thứ 6" : "Friday", activity: isVi ? "Tập sức mạnh" : "Strength Training", duration: "45 min", intensity: "Medium" },
      { day: isVi ? "Thứ 7" : "Saturday", activity: isVi ? "Hoạt động ngoài trời" : "Outdoor Activity", duration: "60 min", intensity: "Medium" },
      { day: isVi ? "Chủ nhật" : "Sunday", activity: isVi ? "Yoga / Giãn cơ" : "Yoga / Stretching", duration: "30 min", intensity: "Low" }
    ],
    nutritionPlan: {
      dailyCalories,
      macros: {
        protein: `${protein}g`,
        carbs: `${carbs}g`,
        fats: `${fats}g`
      },
      sampleMeals: isVi 
        ? ["Sáng: Yến mạch với trái cây", "Trưa: Cơm gạo lứt, ức gà, rau luộc", "Tối: Cá hồi áp chảo, salad"]
        : ["Breakfast: Oatmeal with fruits", "Lunch: Brown rice, chicken breast, steamed veggies", "Dinner: Grilled salmon, salad"]
    },
    recommendations: isVi 
      ? ["Uống đủ 2 lít nước mỗi ngày", "Ngủ đủ 7-8 tiếng", "Theo dõi cân nặng hàng tuần"]
      : ["Drink 2L of water daily", "Get 7-8 hours of sleep", "Track weight weekly"],
    reasoning: isVi
      ? `Kế hoạch được tính toán dựa trên chỉ số BMR (${Math.round(bmr)} kcal) và TDEE (${Math.round(tdee)} kcal) của bạn để đạt mục tiêu ${profile.goal || 'sức khỏe'}.`
      : `Plan calculated based on your BMR (${Math.round(bmr)} kcal) and TDEE (${Math.round(tdee)} kcal) to achieve your goal of ${profile.goal || 'health'}.`
  };
};

export const generateHealthPlan = async (profile: HealthProfile, lang: string = 'en'): Promise<any> => {
  const model = "gemini-3.1-pro-preview";
  const prompt = `
    Based on the following user health profile and their desired body proportions/goal, generate a comprehensive 7-day health plan.
    Profile: ${JSON.stringify(profile)}
    Desired Goal: ${profile.goal || 'General Health'}
    Target Weight: ${profile.targetWeight || 'N/A'} kg
    Workout Intensity Level: ${profile.workoutIntensity || 'medium'}
    
    The plan should include:
    1. A 7-day workout schedule (exercise type, duration, intensity). Tailor the exercises to help achieve the "Desired Goal" and "Target Weight".
    2. Adjust the workout volume and intensity based on the "Workout Intensity Level" provided (${profile.workoutIntensity || 'medium'}).
    3. A daily nutrition plan (calorie target, macronutrient breakdown, sample meals). Adjust calories and macros based on the goal and target weight (e.g., surplus for Bulky/Weight Gain, deficit for Weight Loss).
    4. Specific food restrictions or recommendations based on health conditions.
    5. A brief explanation of the reasoning behind this plan, specifically how it helps achieve the Desired Goal and Target Weight at the requested intensity.
    
    IMPORTANT: Return all text descriptions (activity names, recommendations, reasoning, meal names) in ${lang === 'vi' ? 'Vietnamese' : 'English'}.
    
    Return the response in a structured JSON format.
  `;

  try {
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
                required: ["day", "activity", "duration", "intensity"],
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
                  required: ["protein", "carbs", "fats"],
                },
                sampleMeals: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["dailyCalories", "macros", "sampleMeals"],
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            reasoning: { type: Type.STRING },
          },
          required: ["workoutPlan", "nutritionPlan", "recommendations", "reasoning"],
        },
      },
    });

    let text = response.text || "{}";
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n/, "").replace(/\n```$/, "");
    }
    
    return JSON.parse(text);
  } catch (error) {
    console.warn("Gemini API failed or quota exceeded. Falling back to local calculation.", error);
    return generateFallbackPlan(profile, lang);
  }
};

export const estimateCalories = async (mealDescription: string): Promise<number> => {
  const model = "gemini-3-flash-preview";
  const prompt = `Estimate the calories for this meal: "${mealDescription}". Return ONLY the number of calories as an integer. If you cannot estimate, return 0.`;
  
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const calories = parseInt(response.text?.trim() || "0");
  return isNaN(calories) ? 0 : calories;
};

export const suggestNextMeal = async (remainingCalories: number, goal: string, lang: string = 'en'): Promise<string> => {
  const model = "gemini-3-flash-preview";
  const prompt = `The user has ${remainingCalories} calories left for today. Their goal is "${goal}". 
  Suggest a healthy next meal that fits within this calorie budget. 
  Provide the suggestion in ${lang === 'vi' ? 'Vietnamese' : 'English'}. 
  Keep it concise (1-2 sentences).`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || "";
};
