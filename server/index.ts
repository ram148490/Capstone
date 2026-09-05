import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes';
import restaurantRoutes from './routes/restaurant.routes';
import aiRoutes from './routes/ai.routes';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Feature routers
app.use('/api/auth', authRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api', aiRoutes); // /api/forecast/*, /api/calendar/*, /api/briefing/*, /api/pos/parse

const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    // Development: let Vite serve and HMR the client through Express middleware.
    // Imported lazily so the production bundle never pulls in Vite.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve the pre-built client bundle.
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ShiftCast server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
