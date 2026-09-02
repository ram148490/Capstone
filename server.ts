import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import {
  registerUser,
  loginUser,
  getUserById,
  verifyJwtToken,
  getUserRestaurantData,
  saveUserRestaurantData,
  addPosRecords,
  deletePosRecord,
  addShiftAccuracyLogs,
  deleteShiftAccuracyLog,
  resetUserToDemoData,
  switchUserProfilePreset,
} from './server/db';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Extend Request type for Auth
interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

// Authentication Middleware
const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Default to demo manager if unauthenticated for seamless preview
    req.userId = 'usr-demo-manager-1';
    return next();
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyJwtToken(token);

  if (!decoded) {
    req.userId = 'usr-demo-manager-1';
    return next();
  }

  req.userId = decoded.userId;
  req.userEmail = decoded.email;
  next();
};

// Strict Auth Middleware (requires valid token)
const strictAuthMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyJwtToken(token);

  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session. Please log in again.' });
  }

  req.userId = decoded.userId;
  req.userEmail = decoded.email;
  next();
};

// Initialize Gemini SDK with User-Agent telemetry
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, restaurantName, concept, location } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    const result = await registerUser({
      email,
      password,
      name: name || 'Restaurant Manager',
      restaurantName: restaurantName || 'My Restaurant',
      concept,
      location,
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      ...result,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(400).json({ success: false, error: error.message || 'Registration failed.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const result = await loginUser(email, password);
    return res.json({
      success: true,
      message: 'Logged in successfully.',
      ...result,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(401).json({ success: false, error: error.message || 'Authentication failed.' });
  }
});

// Quick Demo Login
app.post('/api/auth/demo', async (req, res) => {
  try {
    const result = await loginUser('manager@rustictable.com', 'manager123');
    return res.json({
      success: true,
      message: 'Logged in as Demo General Manager.',
      ...result,
    });
  } catch (error: any) {
    console.error('Demo login error:', error);
    return res.status(500).json({ success: false, error: 'Demo account unavailable.' });
  }
});

// Get Current User Profile
app.get('/api/auth/me', strictAuthMiddleware, (req: AuthenticatedRequest, res) => {
  const user = getUserById(req.userId!);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }
  return res.json({ success: true, user });
});

// ==========================================
// PERSISTENT RESTAURANT DATA ROUTES
// ==========================================

// Load all saved restaurant data for current user (optionally scoped by restaurantId)
app.get('/api/restaurant/data', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const restaurantId = (req.query.restaurantId as string) || undefined;
    const user = getUserById(userId);
    const data = getUserRestaurantData(userId, restaurantId);

    return res.json({
      success: true,
      user,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching restaurant data:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve restaurant data.' });
  }
});

// Update Restaurant Profile & Settings
app.post('/api/restaurant/profile', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { profile, isPresetSwitch } = req.body;

    if (!profile) {
      return res.status(400).json({ success: false, error: 'Profile data missing.' });
    }

    if (isPresetSwitch && profile.id) {
      const updatedData = switchUserProfilePreset(userId, profile.id);
      return res.json({ success: true, profile: updatedData.profile, fullData: updatedData });
    }

    const updated = saveUserRestaurantData(userId, { profile }, profile.id);
    return res.json({ success: true, profile: updated.profile });
  } catch (error: any) {
    console.error('Error saving profile:', error);
    return res.status(500).json({ success: false, error: 'Failed to save profile.' });
  }
});

// Switch Concept / Profile Preset (reloads concept-scoped POS data, roster, local events, and accuracy logs)
app.post('/api/restaurant/switch-preset', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { presetId } = req.body;

    if (!presetId) {
      return res.status(400).json({ success: false, error: 'Preset ID is required.' });
    }

    const updatedData = switchUserProfilePreset(userId, presetId);
    return res.json({ success: true, data: updatedData });
  } catch (error: any) {
    console.error('Error switching preset:', error);
    return res.status(500).json({ success: false, error: 'Failed to switch restaurant concept preset.' });
  }
});

// Save or Append POS Historical Records
app.post('/api/restaurant/pos/records', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { records, replaceAll } = req.body;

    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, error: 'Records must be an array.' });
    }

    let updatedRecords;
    if (replaceAll) {
      const updated = saveUserRestaurantData(userId, { historicalData: records });
      updatedRecords = updated.historicalData;
    } else {
      updatedRecords = addPosRecords(userId, records);
    }

    return res.json({ success: true, historicalData: updatedRecords });
  } catch (error: any) {
    console.error('Error saving POS records:', error);
    return res.status(500).json({ success: false, error: 'Failed to save POS records.' });
  }
});

// Delete a POS Record
app.delete('/api/restaurant/pos/records/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const recordId = req.params.id;
    const historicalData = deletePosRecord(userId, recordId);
    return res.json({ success: true, historicalData });
  } catch (error: any) {
    console.error('Error deleting POS record:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete POS record.' });
  }
});

// Save Local Events Radar
app.post('/api/restaurant/events', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { events } = req.body;

    if (!Array.isArray(events)) {
      return res.status(400).json({ success: false, error: 'Events must be an array.' });
    }

    const updated = saveUserRestaurantData(userId, { localEvents: events });
    return res.json({ success: true, localEvents: updated.localEvents });
  } catch (error: any) {
    console.error('Error saving events:', error);
    return res.status(500).json({ success: false, error: 'Failed to save events.' });
  }
});

// Save Staff Roster
app.post('/api/restaurant/roster', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { roster } = req.body;

    if (!Array.isArray(roster)) {
      return res.status(400).json({ success: false, error: 'Roster must be an array.' });
    }

    const updated = saveUserRestaurantData(userId, { roster });
    return res.json({ success: true, roster: updated.roster });
  } catch (error: any) {
    console.error('Error saving roster:', error);
    return res.status(500).json({ success: false, error: 'Failed to save roster.' });
  }
});

// Save Shift Schedule Assignments
app.post('/api/restaurant/assignments', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { assignments } = req.body;

    if (!Array.isArray(assignments)) {
      return res.status(400).json({ success: false, error: 'Assignments must be an array.' });
    }

    const updated = saveUserRestaurantData(userId, { assignments });
    return res.json({ success: true, assignments: updated.assignments });
  } catch (error: any) {
    console.error('Error saving assignments:', error);
    return res.status(500).json({ success: false, error: 'Failed to save shift assignments.' });
  }
});

// Save Shift Headcount Adjustments / Overrides
app.post('/api/restaurant/overrides', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { overrides } = req.body;

    const updated = saveUserRestaurantData(userId, { manualShiftOverrides: overrides || {} });
    return res.json({ success: true, manualShiftOverrides: updated.manualShiftOverrides });
  } catch (error: any) {
    console.error('Error saving shift overrides:', error);
    return res.status(500).json({ success: false, error: 'Failed to save shift adjustments.' });
  }
});

// Save Scenario State
app.post('/api/restaurant/scenario', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { scenario } = req.body;

    const updated = saveUserRestaurantData(userId, { scenario });
    return res.json({ success: true, scenario: updated.scenario });
  } catch (error: any) {
    console.error('Error saving scenario:', error);
    return res.status(500).json({ success: false, error: 'Failed to save scenario.' });
  }
});

// ==========================================
// FORECAST ACCURACY & ACTUAL LOGS ROUTES
// ==========================================

// Get All Accuracy Logs
app.get('/api/restaurant/accuracy/logs', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const data = getUserRestaurantData(userId);
    return res.json({
      success: true,
      accuracyLogs: data.accuracyLogs || [],
    });
  } catch (error: any) {
    console.error('Error fetching accuracy logs:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve accuracy logs.' });
  }
});

// Save or Batch Save Shift Actual Logs
app.post('/api/restaurant/accuracy/logs', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const { logs, replaceAll } = req.body;

    if (!Array.isArray(logs)) {
      return res.status(400).json({ success: false, error: 'Logs must be an array.' });
    }

    let updatedLogs;
    if (replaceAll) {
      const updated = saveUserRestaurantData(userId, { accuracyLogs: logs });
      updatedLogs = updated.accuracyLogs;
    } else {
      updatedLogs = addShiftAccuracyLogs(userId, logs);
    }

    return res.json({
      success: true,
      message: `Saved ${logs.length} shift actual log(s) to database.`,
      accuracyLogs: updatedLogs,
    });
  } catch (error: any) {
    console.error('Error saving accuracy logs:', error);
    return res.status(500).json({ success: false, error: 'Failed to save accuracy logs.' });
  }
});

// Delete Shift Actual Log
app.delete('/api/restaurant/accuracy/logs/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const logId = req.params.id;
    const accuracyLogs = deleteShiftAccuracyLog(userId, logId);
    return res.json({ success: true, accuracyLogs });
  } catch (error: any) {
    console.error('Error deleting accuracy log:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete accuracy log.' });
  }
});

// Reset Account to Demo Defaults
app.post('/api/restaurant/reset-defaults', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId || 'usr-demo-manager-1';
    const resetData = resetUserToDemoData(userId);
    return res.json({
      success: true,
      message: 'Account reset to initial restaurant configuration.',
      data: resetData,
    });
  } catch (error: any) {
    console.error('Error resetting defaults:', error);
    return res.status(500).json({ success: false, error: 'Failed to reset defaults.' });
  }
});

// AI Analyze & Forecast Endpoint
app.post('/api/forecast/ai-analyze', async (req, res) => {
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
        message: 'Gemini API key not configured. Using rule-based forecasting engine.',
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
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const text = response.text || '{}';
    const parsedData = JSON.parse(text);

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error in /api/forecast/ai-analyze:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AI forecast',
    });
  }
});

// Discover Local Events & Calendar Generator
app.post('/api/calendar/discover-events', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { location, restaurantType, startDate, endDate } = req.body;

    if (!ai) {
      return res.status(200).json({
        success: false,
        message: 'Gemini API key not configured.',
      });
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
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const text = response.text || '[]';
    const events = JSON.parse(text);

    return res.json({
      success: true,
      events,
    });
  } catch (error: any) {
    console.error('Error in /api/calendar/discover-events:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to discover local events',
    });
  }
});

// Manager Shift Briefing Generator
app.post('/api/briefing/generate', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { dayForecast, restaurantProfile } = req.body;

    if (!ai) {
      return res.status(200).json({
        success: false,
        message: 'Gemini API not configured.',
      });
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
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      success: true,
      briefing: parsed,
    });
  } catch (error: any) {
    console.error('Error generating briefing:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate briefing',
    });
  }
});

// POS Data Parser Endpoint
app.post('/api/pos/parse', async (req, res) => {
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
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const records = JSON.parse(response.text || '[]');
    return res.json({ success: true, records });
  } catch (error: any) {
    console.error('Error parsing POS data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse POS data',
    });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ShiftCast server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
