// api/index.ts
import express from 'express';
import { join } from 'path';

const app = express();

const isProd = process.env.NODE_ENV === 'production';
const base = isProd ? join(process.cwd(), 'dist', 'public') : join(process.cwd(), 'client');

app.use(express.static(base));

app.get('*', (_req, res) => {
  res.sendFile(join(base, 'index.html'));
});

export default app;