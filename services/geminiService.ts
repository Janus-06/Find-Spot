import { GoogleGenAI, Type } from "@google/genai";
import type { Recommendation, UserProfile, PlaceDetails } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const verifyLocation = async (destination: string): Promise<{ isValid: boolean; correctedDestination: string; error?: string }> => {
  const prompt = `
    Please verify if the following location exists and provide its full, official name and administrative area in Korean.
    The location is: "${destination}"

    If the location is valid and unambiguous, return a JSON object:
    { "isValid": true, "correctedDestination": "Full Official Name, e.g., 대한민국 서울특별시 성동구 성수동" }

    If the location is ambiguous (e.g., "Paris" could be in France or Texas), ask for clarification. Return:
    { "isValid": false, "error": "장소가 모호합니다. '프랑스 파리'처럼 더 구체적으로 입력해주세요." }

    If the location does not seem to exist or is not a real place, return:
    { "isValid": false, "error": "실제 장소가 아닌 것 같습니다. 다시 확인해주세요." }
    
    Respond ONLY with the raw JSON object without markdown formatting.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                isValid: { type: Type.BOOLEAN },
                correctedDestination: { type: Type.STRING },
                error: { type: Type.STRING }
            },
            required: ['isValid']
        }
      }
    });

    const result = JSON.parse(response.text);
    if (result.isValid) {
        return { isValid: true, correctedDestination: result.correctedDestination || destination };
    } else {
        return { isValid: false, correctedDestination: destination, error: result.error || '유효하지 않은 장소입니다.' };
    }

  } catch (error) {
    console.error("Error verifying location:", error);
    return { isValid: false, correctedDestination: destination, error: '장소를 확인하는 중 오류가 발생했습니다.' };
  }
};


export const analyzeUserPreferences = async (placeNames: string[]): Promise<UserProfile> => {
  const prompt = `Based on the following list of saved Google Maps places, analyze the user's travel preferences in Korean.
  
  Provide a JSON object containing:
  1.  "description": A detailed persona analysis (2-3 sentences) describing the user's travel style in a friendly, narrative tone.
  2.  "tags": An array of relevant tags (e.g., "맛집 탐방", "역사 유적", "자연주의", "예술 & 문화").
  
  응답은 반드시 한국어로 작성해주세요.

  Place list:
  ${placeNames.slice(0, 100).join(', ')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro', // Using Pro for deeper analysis
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: {
              type: Type.STRING,
              description: "사용자의 여행 스타일에 대한 상세한 서술형 분석입니다."
            },
            tags: {
              type: Type.ARRAY,
              description: "사용자의 관심사를 설명하는 한국어 태그 목록입니다.",
              items: {
                type: Type.STRING
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text) as UserProfile;

  } catch (error) {
    console.error("Error analyzing user preferences:", error);
    throw new Error("Failed to analyze preferences with Gemini API.");
  }
};

export const getRecommendationsForDestination = async (
  profile: UserProfile, 
  destination: string, 
  purposes: string[], 
  includeReviews: boolean, 
  notes: string,
  excludePlaces: string[] = []
): Promise<Recommendation> => {

  const trendKeywords = ["최신", "요즘 인기", "새로 생긴", "이벤트", "트렌드", "핫한", "신상", "팝업"];
  const useSearch = trendKeywords.some(keyword => notes.includes(keyword)) || includeReviews;

  const tools = useSearch 
    ? [{ googleMaps: {} }, { googleSearch: {} }] 
    : [{ googleMaps: {} }];
  
  const searchInstruction = useSearch
    ? "4. Use Google Search Grounding for up-to-date, trending, or event-based information as requested."
    : "";

  const reviewRequestInstruction = includeReviews
    ? "5. For each place, use Google Search to find a recent, high-quality blog review and provide the URL in `reviewUrl`."
    : "";

  const reviewJsonField = includeReviews
    ? `- \`reviewUrl\`: A valid URL to a recent blog post reviewing the place.`
    : "";

  const profilePrompt = (profile.tags.length === 0)
    ? `**USER PROFILE:**
  - The user has not provided a personal preference profile. You MUST rely solely on the **REQUEST DETAILS** to generate recommendations.`
    : `**USER PROFILE:**
  - **Preference Tags**: ${profile.tags.join(', ')}
  - **Profile Description**: ${profile.description}`;
  
  const refinementLogic = (profile.tags.length > 0)
    ? "From the places that match the purpose, use the user's **Preference Tags** and **Profile Description** to select the most suitable and interesting ones."
    : "Since there is no user profile, select the most popular and highly-rated places that match the purpose.";

  const exclusionPrompt = excludePlaces.length > 0
    ? `
  **IMPORTANT EXCLUSION LIST**:
  Do not recommend any of the following places as they have already been suggested:
  - ${excludePlaces.join('\n- ')}
  `
    : '';

  const prompt = `
  You are an expert place recommender AI. A user with the following profile is looking for places to visit.

  ---
  ${profilePrompt}
  ---

  **REQUEST DETAILS:**
  - **Location**: ${destination}
  - **Main Purposes**: ${purposes.join(', ')}
  - **Include Reviews**: ${includeReviews ? 'Yes' : 'No'}
  - **Additional Notes**: "${notes || 'None'}"
  ---
  ${exclusionPrompt}
  ---

  **YOUR TASK (IN KOREAN):**
  Generate a JSON object for 3-5 specific places in '${destination}'.
  
  **CRITICAL RECOMMENDATION LOGIC:**
  1.  **Prioritize Purpose**: The recommendations **MUST** strictly match the user's requested **Main Purposes**. This is the most important rule.
  2.  **Refine Selection**: ${refinementLogic}
  3.  **Ensure Accuracy**: Use Google Maps grounding to find REAL, verifiable places and their correct Google Maps URLs, including their precise latitude and longitude. DO NOT invent places or URLs.
  ${searchInstruction}
  ${reviewRequestInstruction}
  
  **JSON OUTPUT STRUCTURE:**
  Create a single JSON object with a 'places' array. For each place, provide:
  - \`placeName\`: The official name of the place.
  - \`description\`: A short, compelling sentence (max 25 words) in a natural and friendly Korean tone, explaining why this place is a great fit for the user's request.
  - \`googleMapsUrl\`: A valid Google Maps URL.
  - \`latitude\`: The geographical latitude as a number (e.g., 37.5665).
  - \`longitude\`: The geographical longitude as a number (e.g., 126.9780).
  - \`distance\`: The approximate distance (e.g., "약 2.5km") from the original **Location** ('${destination}') to this place. This is an estimation.
  ${reviewJsonField}
  - \`highlights\`: An array of 3-5 short, impactful Korean keywords summarizing the place's features.
  
  **FINAL INSTRUCTIONS:**
  - Your entire response must be ONLY the raw JSON object. Do not use markdown formatting.
  - All text content must be in Korean.
  `;

  let rawResponseText = '';
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { tools },
    });
    
    rawResponseText = response.text.trim();
    let jsonString = rawResponseText;
    
    // First, try to find JSON within a markdown code block
    const jsonMatch = jsonString.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonString = jsonMatch[1];
    } else {
      // If no markdown block is found, try to find the first '{' and the last '}'
      // This handles cases where the model returns conversational text around the JSON object.
      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonString = jsonString.substring(firstBrace, lastBrace + 1);
      }
    }

    // Now, try to parse the extracted string
    return JSON.parse(jsonString) as Recommendation;

  } catch (error) {
    // Add more detailed logging for parsing errors
    if (error instanceof SyntaxError) {
        console.error("Failed to parse JSON. Raw response from API was:", rawResponseText);
    }
    console.error("Error fetching Gemini API:", error);
    throw new Error("Failed to get recommendation from Gemini API.");
  }
};

export const getDynamicPurposes = async (destination: string): Promise<string[]> => {
  if (!destination.trim()) {
    return [];
  }

  const prompt = `주어진 장소 "${destination}"와 관련하여, 방문객을 위한 다양하고 구체적인 목적 키워드를 4-5개 한국어로 생성하여 JSON 배열로 만들어주세요. 이 키워드들은 해당 지역을 방문하는 사람이 찾을 만한 활동, 장소 유형, 또는 경험을 나타내야 합니다.

**매우 중요: 채용 정보, 방문 예약, 비즈니스 미팅, 회사 내부 행사 등 방문객의 활동과 직접적으로 관련 없는 키워드는 반드시 제외해주세요.**

식사, 관광, 여가, 자연, 쇼핑, 문화와 같은 주제에 집중해주세요.

좋은 예시: "오션뷰 카페", "오름 트레킹", "흑돼지 맛집", "해변 산책", "전통 시장 구경".
나쁜 예시: "삼성전자 채용", "xx회사 방문 예약".

결과는 오직 순수한 JSON 배열로만 반환해주세요.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite', // Using Flash-Lite for low latency
      contents: prompt,
    });

    let jsonString = response.text.trim();
    // A more robust way to strip markdown
    if (jsonString.startsWith("```json")) {
        jsonString = jsonString.substring(7, jsonString.length - 3).trim();
    } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.substring(3, jsonString.length - 3).trim();
    }

    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.error("Error getting dynamic purposes:", error);
    return []; // Return empty array on failure
  }
};

export const getRichPlaceDetails = async (placeName: string, destination: string): Promise<PlaceDetails> => {
    const prompt = `
        You are a helpful local guide AI.
        Using Google Maps grounding, provide objective, factual information for the place "${placeName}" in "${destination}".
        
        Return a single JSON object with the following structure. All text must be in Korean. Do not include subjective information like review summaries or tips.
        - "openingHours": Business hours for today (e.g., "오전 10:00 - 오후 9:00"). If not available, state "정보 없음".
        - "popularAmenities": An array of 2-4 key amenities or features (e.g., "주차 가능", "반려동물 동반 가능", "무료 Wi-Fi"). Empty array if not applicable.
        - "popularDishes": If it is a restaurant/cafe, an array of 2-4 popular menu items. Empty array if not applicable.

        CRITICAL: Respond ONLY with the raw JSON object. Do not use markdown formatting.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { 
                tools: [{ googleMaps: {} }],
            },
        });
        
        let jsonString = response.text.trim();
        const jsonMatch = jsonString.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonString = jsonMatch[1];
        }

        return JSON.parse(jsonString) as PlaceDetails;
    } catch (error) {
        console.error("Error fetching rich place details:", error);
        throw new Error("Failed to get rich details from Gemini API.");
    }
};

export const getPlaceDetails = async (placeName: string, destination: string, question: string): Promise<string> => {
    const prompt = `Regarding the place "${placeName}" in "${destination}", please answer the following user question in Korean. Keep the answer concise (1-2 sentences) and helpful.
    
    Question: "${question}"`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch(error) {
        console.error("Error getting place details:", error);
        return "죄송합니다, 정보를 가져오는 데 실패했습니다.";
    }
};