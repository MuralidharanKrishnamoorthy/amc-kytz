import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { config } from './config.js';
import { HttpError } from './lib/http-error.js';
import dashboardRouter from './routes/dashboard.js';
import amcsRouter from './routes/amcs.js';
import sitesRouter from './routes/sites.js';
import { getOptions } from './options.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/options', async (_req, res) => res.json(await getOptions()));
app.use('/api/dashboard', dashboardRouter);
app.use('/api/amcs', amcsRouter);
app.use('/api/sites', sitesRouter);

app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, fields: err.details });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Agreement must be smaller than ${config.maxUploadBytes / 1024 / 1024} MB`
        : err.message;
    return res.status(400).json({ error: 'Validation failed', fields: { agreement: message } });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const server = app.listen(config.port, () => {
  console.log(`AMC Desk API listening on http://localhost:${config.port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
