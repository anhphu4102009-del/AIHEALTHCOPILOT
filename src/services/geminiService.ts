// This service now uses OpenAI (ChatGPT) via the backend proxy
// Gemini has been removed as requested.

const callAI = async (messages: any[], options: { json?: boolean } = {}): Promise<string> => {
  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        model: "gpt-4o-mini",
        response_format: options.json ? { type: "json_object" } : undefined
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "OpenAI request failed");
    }

    const data = await response.json();
    return data.content || "";
  } catch (error) {
    console.error("AI call failed:", error);
    throw error;
  }
};

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
  const prompt = `Extract all health indicators from this medical report. Return a JSON object with keys like 'cholesterol', 'glucose', 'bloodPressure', 'bmi', 'liverEnzymes', etc. Also include a 'summary' of the findings and 'abnormalValues' list. Please provide the 'summary' and 'abnormalValues' in ${lang === 'vi' ? 'Vietnamese' : 'English'}.`;
  
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`
          }
        }
      ]
    }
  ];

  try {
    const text = await callAI(messages, { json: true });
    return JSON.parse(text || "{}");
  } catch (error) {
    console.error("Failed to analyze report with OpenAI:", error);
    return { summary: lang === 'vi' ? "Không thể phân tích báo cáo lúc này bằng ChatGPT." : "Could not analyze report at this time with ChatGPT." };
  }
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
  const prompt = `
    Based on the following user health profile and their desired body proportions/goal, generate a comprehensive 7-day health plan.
    Profile: ${JSON.stringify(profile)}
    User Metrics: Age: ${profile.age}, Height: ${profile.height}cm, Weight: ${profile.weight}kg.
    Desired Goal: ${profile.goal || 'General Health'}
    Target Weight: ${profile.targetWeight || 'N/A'} kg
    Workout Intensity Level: ${profile.workoutIntensity || 'medium'}
    
    The plan should include:
    1. A 7-day workout schedule. For each day, provide a specific "activity" name (e.g., "Brisk Walking", "Bodyweight Squats", "Yoga for Beginners"), "duration" (e.g., "30 mins"), and "intensity" (Low, Medium, High). 
    2. Tailor the exercises strictly to the user's profile: Age ${profile.age}, Weight ${profile.weight}kg, Height ${profile.height}cm, and Goal "${profile.goal}".
    3. If the user has health conditions (${profile.conditions.join(', ')}), ensure the exercises are safe and appropriate.
    4. Adjust the workout volume and intensity based on the "Workout Intensity Level" provided (${profile.workoutIntensity || 'medium'}).
    3. A daily nutrition plan (calorie target, macronutrient breakdown, sample meals). 
       IMPORTANT: Generate at least 3-4 specific sample meals (Breakfast, Lunch, Dinner, Snack) that are culturally appropriate and tailored to the user's Age, Height, and Weight to meet their caloric needs.
    4. Specific food restrictions or recommendations based on health conditions.
    5. A brief explanation of the reasoning behind this plan, specifically how it helps achieve the Desired Goal and Target Weight at the requested intensity.
    
    IMPORTANT: Return all text descriptions (activity names, recommendations, reasoning, meal names) in ${lang === 'vi' ? 'Vietnamese' : 'English'}.
    
    Return the response in a structured JSON format with the following keys: workoutPlan (array), nutritionPlan (object with dailyCalories, macros, sampleMeals), recommendations (array), reasoning (string).
  `;

  try {
    const text = await callAI([{ role: "user", content: prompt }], { json: true });

    let cleanedText = text || "{}";
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```\n/, "").replace(/\n```$/, "");
    }
    
    return JSON.parse(cleanedText);
  } catch (error) {
    console.warn("AI generation failed. Falling back to local calculation.", error);
    return generateFallbackPlan(profile, lang);
  }
};

export const estimateCalories = async (mealDescription: string): Promise<number> => {
  const prompt = `Estimate the calories for this meal: "${mealDescription}". Return ONLY the number of calories as an integer. If you cannot estimate, return 0.`;
  
  try {
    const text = await callAI([{ role: "user", content: prompt }]);
    const calories = parseInt(text.trim() || "0");
    return isNaN(calories) ? 0 : calories;
  } catch (error) {
    console.warn("Calorie estimation failed, using fallback logic", error);
    // Simple fallback logic based on keywords
    const desc = mealDescription.toLowerCase();
    if (desc.includes("rice") || desc.includes("cơm")) return 200;
    if (desc.includes("chicken") || desc.includes("gà")) return 250;
    if (desc.includes("beef") || desc.includes("bò")) return 300;
    if (desc.includes("fish") || desc.includes("cá")) return 150;
    if (desc.includes("salad") || desc.includes("rau")) return 100;
    if (desc.includes("egg") || desc.includes("trứng")) return 80;
    if (desc.includes("bread") || desc.includes("bánh mì")) return 250;
    if (desc.includes("noodle") || desc.includes("phở") || desc.includes("mì")) return 350;
    return 200; // Default fallback
  }
};

export const suggestNextMeal = async (remainingCalories: number, goal: string, lang: string = 'en'): Promise<string> => {
  const prompt = `The user has ${remainingCalories} calories left for today. Their goal is "${goal}". 
  Suggest a healthy next meal that fits within this calorie budget. 
  Provide the suggestion in ${lang === 'vi' ? 'Vietnamese' : 'English'}. 
  Keep it concise (1-2 sentences).`;

  try {
    const text = await callAI([{ role: "user", content: prompt }]);
    return text || "";
  } catch (error) {
    console.warn("Meal suggestion failed, using fallback", error);
    const isVi = lang === 'vi';
    if (remainingCalories < 200) {
      return isVi ? "Bạn nên ăn nhẹ một ít trái cây hoặc sữa chua không đường." : "You should have a light snack like some fruit or unsweetened yogurt.";
    } else if (remainingCalories < 500) {
      return isVi ? "Một phần salad ức gà hoặc cá hồi áp chảo sẽ rất phù hợp." : "A chicken breast salad or grilled salmon would be perfect.";
    } else {
      return isVi ? "Bạn có thể ăn một bữa cơm đầy đủ với protein và nhiều rau xanh." : "You can have a full meal with protein and plenty of green vegetables.";
    }
  }
};
