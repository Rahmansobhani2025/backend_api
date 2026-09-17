import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Enable Open CORS for all clients/origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['*'],
}));

// Enable preflight request handling across all routes
app.options('*', cors());

// 2. Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Health check route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 4. Sample API routes
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'BookingsPlace API is running successfully.' });
});

app.get('/api', (req: Request, res: Response) => {
  res.json({ message: 'BookingsPlace API is running successfully.' });
});

// 5. Chat API routes (Handles POST requests from frontend)
const handleChatRequest = async (req: Request, res: Response) => {
  try {
    const { messages, audio, userLanguage, sessionId } = req.body;

    // TODO: Add your AI provider call (e.g. Gemini / OpenAI) here
    // Example placeholder response:
    return res.status(200).json({
      reply: "Backend connected successfully! Add your AI model processing logic here.",
    });
  } catch (error: any) {
    console.error('Chat processing error:', error);
    return res.status(500).json({ error: 'Failed to process chat request' });
  }
};

app.post('/chat', handleChatRequest);
app.post('/api/chat', handleChatRequest);

// 6. 404 Catch-all handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// 7. Global error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 8. Start server (for local development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

export default app;