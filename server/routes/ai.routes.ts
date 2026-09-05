import { Router } from 'express';
import { getGeminiClient, GEMINI_MODEL } from '../lib/gemini';

const router = Router();

// POST /api/forecast/ai-analyze — AI-refined weekly volume & staffing forecast
router.post('/forecast/ai-analyze', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      restaurantProfile,
      historicalData,
      localEvents,
      targetLaborPercentage,
      weekDates,
      weatherData,
    } = req.body;

    if (!ai) {
      return res.status(200).json({
        success: false,
        isFallback: true,
        message:
          'Gemini API key not configured. Using rule-based forecasting engine.',
      });
    }

    const prompt = `You are an expert restaurant operations consultant and labor efficiency specialist for independent restaurants, casual dining, and fast-casual kitchens.
Analyze the following restaurant configuration, historical sales patterns, weather, and upcoming local events to deliver an accurate customer volume forecast and shift-level staffing recommendation.
Focus on operational realities: kitchen prep lead times, line station coverage, lunch turnover, dinner seating rushes, and labor cost percentage optimization without sacrificing service speed or guest satisfaction.

Restaurant Profile:
${JSON.stringify(restaurantProfile, null, 2)}

Target Labor %: ${targetLaborPercentage}%
Upcoming Week Dates: ${JSON.stringify(weekDates)}
Upcoming Local Events:
${JSON.stringify(localEvents, null, 2)}

Upcoming Weather:
${JSON.stringify(weatherData || [], null, 2)}

Historical Sales Summary (recent sample):
${JSON.stringify((historicalData || []).slice(-14), null, 2)}

Provide your response in structured JSON format with this exact schema:
{
  "weeklySummary": {
    "totalProjectedCovers": number,
    "totalProjectedSales": number,
    "projectedLaborCost": number,
    "projectedLaborPercentage": number,
    "gutFeelEstimatedWaste": number,
    "executiveInsight": "string explaining the main volume drivers this week"
  },
  "dayForecasts": [
    {
      "date": "YYYY-MM-DD",
      "dayOfWeek": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday",
      "covers": number,
      "projectedSales": number,
      "weatherImpact": "string describing impact",
      "eventsImpact": "string describing impact",
      "riskLevel": "LOW|MEDIUM|HIGH",
      "riskReason": "string",
      "shifts": [
        {
          "name": "Lunch" | "Dinner" | "Late Night" | "Brunch",
          "startTime": "string (e.g. 11:00 AM)",
          "endTime": "string (e.g. 4:00 PM)",
          "covers": number,
          "sales": number,
          "recommendedStaff": {
            "servers": number,
            "bartenders": number,
            "bussers": number,
            "hosts": number,
            "lineCooks": number,
            "prepCooks": number,
            "dishwashers": number,
            "managers": number
          },
          "estimatedLaborCost": number,
          "laborPercentage": number,
          "shiftNotes": "string (e.g., 'Pre-concert rush expected between 5:30 - 7:00 PM')"
        }
      ]
    }
  ],
  "operationalAdvice": [
    {
      "title": "string",
      "description": "string",
      "category": "STAFFING" | "PREP" | "REVENUE_OPPORTUNITY" | "RISK_MITIGATION"
    }
  ]
}

Return ONLY valid JSON. Ensure calculations maintain a balanced labor percentage close to the target of ${targetLaborPercentage}%.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    return res.json({ success: true, data: JSON.parse(response.text || '{}') });
  } catch (error: any) {
    console.error('Error in /api/forecast/ai-analyze:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AI forecast',
    });
  }
});

// POST /api/calendar/discover-events — AI-generated local event radar
router.post('/calendar/discover-events', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { location, restaurantType, startDate, endDate } = req.body;

    if (!ai) {
      return res
        .status(200)
        .json({ success: false, message: 'Gemini API key not configured.' });
    }

    const prompt = `You are a restaurant market intelligence engine.
Identify realistic and highly impactful local events, public holidays, sports matches, festivals, theater/arena shows, college events, and weekend gatherings around "${location || 'Downtown Metro'}" between ${startDate || 'upcoming week'} and ${endDate || 'end of week'}.

The restaurant is a "${restaurantType || 'Casual Dining Restaurant'}".
For each event, evaluate its expected impact on dining volume and dining time rush.

Output a JSON array of events with this schema:
[
  {
    "id": "string",
    "title": "string",
    "date": "YYYY-MM-DD",
    "category": "SPORTS" | "CONCERT" | "FESTIVAL" | "HOLIDAY" | "COMMUNITY" | "WEATHER" | "CONFERENCE",
    "venue": "string",
    "estimatedAttendance": "string (e.g. '15,000 attendees')",
    "volumeMultiplier": number (e.g. 1.25 for +25%, 0.85 for -15%),
    "affectedShifts": ["Lunch" | "Dinner" | "Late Night" | "Brunch"],
    "rushWindow": "string (e.g. 'Pre-game 5:00 PM - 7:00 PM and post-game 9:30 PM')",
    "description": "string",
    "staffingTip": "string"
  }
]

Provide 5 to 9 varied, realistic, and operationally meaningful events for this window. Return ONLY valid JSON.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.3 },
    });

    return res.json({ success: true, events: JSON.parse(response.text || '[]') });
  } catch (error: any) {
    console.error('Error in /api/calendar/discover-events:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to discover local events',
    });
  }
});

// POST /api/briefing/generate — AI pre-shift manager briefing
router.post('/briefing/generate', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { dayForecast, restaurantProfile } = req.body;

    if (!ai) {
      return res
        .status(200)
        .json({ success: false, message: 'Gemini API not configured.' });
    }

    const prompt = `You are a seasoned restaurant General Manager.
Write a clear, motivating, and highly practical daily pre-shift briefing for the staff and shift leaders based on this forecast:

Restaurant: ${restaurantProfile.name} (${restaurantProfile.concept})
Date: ${dayForecast.date} (${dayForecast.dayOfWeek})
Projected Covers: ${dayForecast.covers}
Projected Sales: $${dayForecast.projectedSales}
Weather: ${dayForecast.weatherImpact || 'Normal'}
Events: ${dayForecast.eventsImpact || 'None'}
Shifts: ${JSON.stringify(dayForecast.shifts, null, 2)}

Provide JSON output with:
{
  "managerFocus": "1-2 sentence core message",
  "prepPriorities": ["bullet 1", "bullet 2", "bullet 3"],
  "fohDirectives": ["bullet 1", "bullet 2"],
  "bohDirectives": ["bullet 1", "bullet 2"],
  "rushWindows": ["bullet 1", "bullet 2"],
  "upsellFocus": "suggested special or drink to push"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.3 },
    });

    return res.json({ success: true, briefing: JSON.parse(response.text || '{}') });
  } catch (error: any) {
    console.error('Error generating briefing:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate briefing',
    });
  }
});

// POST /api/pos/parse — AI parser for pasted POS / spreadsheet exports
router.post('/pos/parse', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { rawText } = req.body;

    if (!rawText || rawText.trim().length === 0) {
      return res.status(400).json({ error: 'No text provided' });
    }

    if (!ai) {
      return res.status(200).json({
        success: false,
        message: 'Gemini API key not configured for intelligent parsing.',
      });
    }

    const prompt = `You are a POS data parser for restaurants.
Convert the following unstructured or semi-structured sales and covers report text into structured JSON historical records.

Raw Input:
${rawText.slice(0, 15000)}

Output JSON schema:
[
  {
    "date": "YYYY-MM-DD",
    "dayOfWeek": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday",
    "shift": "Lunch" | "Dinner" | "All Day" | "Late Night",
    "covers": number,
    "sales": number,
    "laborCost": number,
    "laborHours": number,
    "weather": "Sunny" | "Rainy" | "Cold" | "Hot" | "Snow" | "Clear",
    "notes": "string"
  }
]

Ensure dates are standardized to YYYY-MM-DD. Deduce reasonable numbers if specific fields are missing. Return ONLY valid JSON array.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });

    return res.json({ success: true, records: JSON.parse(response.text || '[]') });
  } catch (error: any) {
    console.error('Error parsing POS data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse POS data',
    });
  }
});

export default router;
