import { GoogleGenAI } from '@google/genai';

/**
 * Returns a configured Gemini client, or `null` when no API key is present so
 * callers can gracefully fall back to the rule-based engine.
 */
export const getGeminiClient = (): GoogleGenAI | null => {
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

/** Model used for every server-side Gemini call. */
export const GEMINI_MODEL = 'gemini-3.7-flash';
