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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Health check route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 4. Sample API route
app.get('/api', (req: Request, res: Response) => {
  res.json({ message: 'BookingsPlace API is running successfully.' });
});

// 5. 404 Catch-all handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// 6. Global error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 7. Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;