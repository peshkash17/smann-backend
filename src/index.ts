import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import geocodeRouter from './routes/geocode';
import { startSimulator, stopSimulator } from './simulator/agentSimulator';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: FRONTEND_URL === '*' ? true : FRONTEND_URL,
  credentials: FRONTEND_URL !== '*',
}));

// ── Request logging ───────────────────────────────────────────────────────────
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: NODE_ENV, ts: new Date().toISOString() });
});

app.use('/', geocodeRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

// ── HTTP + Socket.io server ───────────────────────────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL === '*' ? true : FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: FRONTEND_URL !== '*',
  },
});

io.on('connection', socket => {
  console.log(`[ws] Client connected: ${socket.id}`);

  socket.on('agent:start', () => {
    console.log(`[ws] ${socket.id} → start simulation`);
    startSimulator(io);
  });

  socket.on('agent:stop', () => {
    console.log(`[ws] ${socket.id} → stop simulation`);
    stopSimulator();
  });

  socket.on('disconnect', reason => {
    console.log(`[ws] Client disconnected: ${socket.id} (${reason})`);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🚀 delivery-tracker-api v1.0`);
  console.log(`  ➜  http://localhost:${PORT}   [${NODE_ENV}]\n`);
  startSimulator(io);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal: string) {
  console.log(`\n[server] ${signal} received — shutting down gracefully`);
  stopSimulator();
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
