import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Enable Open CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['*'],
}));
app.options('*', cors());

// 2. Body Parsing Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Health & Root Checks
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'BookingsPlace API is running successfully.' });
});

// 4. Chat Endpoint Handler
interface ChatMessage {
  role: 'user' | 'assistant' | 'model' | 'system';
  content: string;
}

const handleChatRequest = async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('Missing GEMINI_API_KEY environment variable.');
      return res.status(500).json({
        error: 'Server Misconfiguration',
        message: 'GEMINI_API_KEY environment variable is missing.'
      });
    }

    const { messages } = req.body as { messages: ChatMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    // Isolate the newest message from the user
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const promptText = lastUserMessage?.content;

    if (!promptText) {
      return res.status(400).json({ error: 'No user message found in request body.' });
    }

    // Format previous turn messages for the chat history context
    // Excludes system roles and the last prompt to avoid duplicates
    const history = messages
      .slice(0, messages.lastIndexOf(lastUserMessage))
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Instantiate Google Gen AI Client
    const ai = new GoogleGenAI({ apiKey });

    // Initialize chat session with history and system instruction
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      history: history,
      config: {
        systemInstruction: 'You are the AI assistant for BookingsPlace, an event venue booking platform. Help users explore venue listings, clarify booking options, check availability considerations, and answer event-planning questions concisely and professionally.',
      },
    });

    // Send the latest prompt
    const response = await chat.sendMessage({
      message: promptText,
    });

    return res.status(200).json({
      reply: response.text,
    });
  } catch (error: any) {
    console.error('Gemini API Detailed Error:', JSON.stringify(error, null, 2));
    return res.status(500).json({
      error: 'Failed to generate response from AI model.',
      details: error?.message || String(error),
    });
  }
};

app.post('/chat', handleChatRequest);
app.post('/api/chat', handleChatRequest);

// 5. 404 Catch-all
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// 6. Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;