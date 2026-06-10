const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

/**
 * Generates a customized 2-sentence coaching tip based on user's worst carbon category.
 * If the API key is missing or the call fails, a high-quality fallback tip is returned.
 * 
 * @param {object} emissionsBreakdown - User's daily emissions (transport, diet, energy, shopping, total)
 * @param {object} inputs - User inputs from onboarding (to provide context)
 * @returns {Promise<string>} 2-sentence personalized coaching tip
 */
async function generateAIPersonalizedTip(emissionsBreakdown, inputs) {
  try {
    const dailyBreakdown = emissionsBreakdown?.daily || {};
    const transport = dailyBreakdown.transport || 0;
    const diet = dailyBreakdown.diet || 0;
    const energy = dailyBreakdown.energy || 0;
    const shopping = dailyBreakdown.shopping || 0;

    // Identify the worst category
    const categories = [
      { name: 'transportation', score: transport, unit: 'km', details: `Commute mode: ${inputs?.commuteMode || 'N/A'}, Weekly distance: ${inputs?.commuteDistanceWeekly || 0} km` },
      { name: 'diet', score: diet, details: `Diet profile: ${inputs?.diet || 'N/A'}` },
      { name: 'household energy', score: energy, details: `Monthly electric bill: $${inputs?.electricityBillMonthly || 0}, monthly gas: $${inputs?.heatingGasBillMonthly || 0}, household size: ${inputs?.householdSize || 1}` },
      { name: 'shopping & consumption', score: shopping, details: `Consumer profile: ${inputs?.shopping || 'N/A'}` }
    ];

    // Sort to find the highest emission category
    categories.sort((a, b) => b.score - a.score);
    const worstCategory = categories[0];

    // Pre-calculate fallbacks in case Gemini API is not configured or fails
    const fallbacks = {
      transportation: `Your transportation footprint of ${transport.toFixed(1)} kg CO2/day is your largest contributor. Consider substituting one single-passenger drive per week with active transit (walking/cycling) or public transport to mitigate up to 8 kg of CO2 weekly.`,
      diet: `Your dietary footprint of ${diet.toFixed(1)} kg CO2/day is your highest emissions sector. Swapping out red meat for poultry or plant-based proteins on just 'Meatless Mondays' can reduce your food emissions by nearly 15%.`,
      'household energy': `Your home energy share accounts for ${energy.toFixed(1)} kg CO2/day. Delaying high-power chores (like washing machines) during peak grid hours and using cold water cycles can save you up to 1.5 kg of CO2 per load.`,
      'shopping & consumption': `Your shopping habit generates ${shopping.toFixed(1)} kg CO2/day. Engaging in a 14-day 'buy-nothing-new' challenge and opting for refurbished or circular goods can instantly cut this consumption footprint in half.`
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.trim() === '') {
      console.warn('Gemini Service: GEMINI_API_KEY is not defined or is set to placeholder. Returning high-quality fallback tip.');
      return fallbacks[worstCategory.name];
    }

    // Initialize client
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Build standard, focused prompt
    const systemPrompt = `You are the EcoPulse LLM Sustainability Coach. You analyze personal carbon footprint breakdowns and provide highly actionable, empathetic, and realistic recommendations.
Your tone should be positive, encouraging, and tailored to the user's specific lifestyle profile. Do not use guilt-inducing language.`;

    const userPrompt = `Analyze the user's daily carbon emissions breakdown in kg CO2/day:
- Transportation: ${transport.toFixed(2)} kg (Details: ${categories.find(c => c.name === 'transportation').details})
- Diet: ${diet.toFixed(2)} kg (Details: ${categories.find(c => c.name === 'diet').details})
- Household Energy: ${energy.toFixed(2)} kg (Details: ${categories.find(c => c.name === 'household energy').details})
- Shopping & Consumption: ${shopping.toFixed(2)} kg (Details: ${categories.find(c => c.name === 'shopping & consumption').details})
- Total Daily Emissions: ${(transport + diet + energy + shopping).toFixed(2)} kg

The user's highest emission category is: **${worstCategory.name}** (generating ${worstCategory.score.toFixed(2)} kg CO2/day).

Please generate a personalized coaching tip that addresses this highest emissions category.
CRITICAL INSTRUCTION: Your output MUST be EXACTLY two sentences. It must be highly practical, specific, and positive. Avoid vague generalizations (like "save energy" or "drive less"). Provide numerical savings or concrete alternatives.`;

    // Fetch response from Gemini
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
      }
    });

    const response = await result.response;
    const text = response.text().trim();

    if (!text || text.length < 10) {
      throw new Error('Received an empty or invalid response from Gemini API.');
    }

    return text;
  } catch (error) {
    console.error('Gemini Service error:', error);
    // Fallback to high quality manual tip matching their worst category
    const dailyBreakdown = emissionsBreakdown?.daily || {};
    const categories = [
      { name: 'transportation', score: dailyBreakdown.transport || 0 },
      { name: 'diet', score: dailyBreakdown.diet || 0 },
      { name: 'household energy', score: dailyBreakdown.energy || 0 },
      { name: 'shopping & consumption', score: dailyBreakdown.shopping || 0 }
    ];
    categories.sort((a, b) => b.score - a.score);
    const worstCategoryName = categories[0].name;

    const fallbackTips = {
      transportation: `Your transportation footprint is your largest contributor. Consider substituting one single-passenger drive per week with active transit (walking/cycling) or public transport to mitigate up to 8 kg of CO2 weekly.`,
      diet: `Your dietary footprint is your highest emissions sector. Swapping out red meat for poultry or plant-based proteins on just 'Meatless Mondays' can reduce your food emissions by nearly 15%.`,
      'household energy': `Your home energy share is your main emission source. Delaying high-power chores (like washing machines) during peak grid hours and using cold water cycles can save you up to 1.5 kg of CO2 per load.`,
      'shopping & consumption': `Your shopping habits account for a significant portion of your footprint. Engaging in a 14-day 'buy-nothing-new' challenge and opting for refurbished or circular goods can instantly cut this footprint in half.`
    };

    return fallbackTips[worstCategoryName] || fallbackTips['transportation'];
  }
}

module.exports = {
  generateAIPersonalizedTip
};
