import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Custom robust CORS middleware built specifically for Vercel serverless environment
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"];
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-customer-chat-api-key, customer_chat_api_key, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use(express.json({ limit: '10mb' })); // Increased limit to handle base64 audio payloads

// Middleware to validate customer_chat_api_key from frontend headers
const verifyChatApiKey = (req: Request, res: Response, next: NextFunction) => {
  const clientApiKey =
    req.headers["x-customer-chat-api-key"] || req.headers["customer_chat_api_key"];
  const expectedApiKey = process.env.CUSTOMER_CHAT_API_KEY;

  if (!clientApiKey || clientApiKey !== expectedApiKey) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing customer_chat_api_key" });
  }

  next();
};

// Initialize Supabase Client securely on the backend
const getSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey || !supabaseUrl.startsWith("http")) {
    return null;
  }
  try {
    return createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    console.warn("Supabase initialization skipped or invalid:", err);
    return null;
  }
};

// Initialize Gemini Client securely on the backend
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "signal-backend-api",
      },
    },
  });
};

const SIGNAL_SYSTEM_INSTRUCTION = `
You are Signal (سيجنال), an expert, warm, and professional assistant embedded inside the BookingsPlace platform (bookingsplace.com).

### Core Responsibilities & Strict Rules
1. **Dynamic Language Matching (CRITICAL):** You must always reply in the exact same language and script that the user uses. 
   - If the user writes or speaks in English, reply entirely in English.
   - If the user writes or speaks in Arabic (or any Arabic dialect), reply entirely in Arabic.
   - Never switch languages unless the user switches first.
2. **Dynamic Understanding:** Read the user's latest query or listen closely to their audio input (handling accents and regional dialects naturally) and address it directly and contextually. Never repeat a hardcoded static answer if the user changes topics.
3. **Knowledge Base Mapping:** 
   - Match user search requests against the provided SUPABASE KNOWLEDGE BASE CATALOG.
   - If they are looking for specific services (like tents, banquets, henna, or decoration) in cities (like Riyadh or Jeddah), check the catalog or guide them on how to filter services directly on https://bookingsplace.com.
4. **Response Style:** Keep responses helpful, warm, dynamic, and tailored strictly to what the user just asked.
`;

// Helper function to call Gemini model with fallback support
async function generateGeminiReply(
  ai: GoogleGenAI,
  contents: Array<any>,
  systemInstruction: string
): Promise<string | null> {
  const supportedModels = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro"];

  for (const model of supportedModels) {
    try {
      console.log(`Trying Gemini model: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.4,
        },
      });

      if (response && response.text && response.text.trim().length > 0) {
        console.log(`Successfully generated reply using model: ${model}`);
        return response.text;
      }
    } catch (err: any) {
      console.warn(`Model ${model} failed:`, err?.message || err);
    }
  }

  return null;
}

// Protected API Route: Chat with Signal (Supports Text & Audio Multimodal Input)
app.post("/api/chat", verifyChatApiKey, async (req: Request, res: Response) => {
  try {
    const { messages, audio, mimeType } = req.body;

    const supabase = getSupabase();
    let knowledgeBaseContext = "";

    // Step 1: Load database catalog into Gemini's context
    if (supabase) {
      try {
        const { data: responsesData, error } = await supabase
          .from("responses")
          .select("intent_id, response_text, problem_solving_info, page_link")
          .limit(100);

        if (!error && responsesData && responsesData.length > 0) {
          knowledgeBaseContext =
            "\n\n### OFFICIAL KNOWLEDGE BASE CATALOG:\n" +
            JSON.stringify(responsesData, null, 2);
        }
      } catch (dbErr) {
        console.error("Could not load knowledge base from Supabase:", dbErr);
      }
    }

    // Step 2: Combine system instructions with database catalog
    const fullSystemInstruction = `${SIGNAL_SYSTEM_INSTRUCTION}${knowledgeBaseContext}`;

    // Step 3: Format contents for Gemini (Handling Audio Blob or Text Messages)
    const ai = getGenAI();
    let contents: Array<any> = [];

    if (audio) {
      // Multimodal audio payload: Instruct Gemini to auto-detect language from audio
      contents = [
        {
          inlineData: {
            data: audio, // Base64 encoded audio string
            mimeType: mimeType || "audio/webm",
          },
        },
        {
          text: `Listen carefully to this audio recording. Detect the exact language and dialect spoken by the user, and reply back naturally and entirely in that same language (Arabic if they spoke Arabic, English if they spoke English).`,
        },
      ];
    } else {
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array or audio payload is required." });
      }

      contents = messages.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    }

    const replyText = await generateGeminiReply(ai, contents, fullSystemInstruction);

    if (replyText) {
      return res.json({ reply: replyText });
    } else {
      // Fallback check based on last user text/context language
      const lastUserMsg = messages?.[messages.length - 1]?.content || "";
      const isEnglishQuery = /[a-zA-Z]/.test(lastUserMsg);

      let fallbackReply = isEnglishQuery
        ? "Welcome! You can browse the BookingsPlace platform (https://bookingsplace.com/en) to explore services and venues easily."
        : "أهلاً بك! يمكنك تصفح منصة BookingsPlace (https://bookingsplace.com/ar) لاستعراض الخدمات والعقارات بكل سهولة.";

      return res.json({ reply: fallbackReply });
    }
  } catch (err: any) {
    console.error("Server API Error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Signal Backend API running on http://localhost:${PORT}`);
});