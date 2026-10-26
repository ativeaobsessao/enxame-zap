import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Enable CORS and cache headers for local dev assets
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Serve static assets from project root
app.use(express.static(__dirname));

// Primary entry point
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Explicit routes for builder and popup
app.get('/builder', (req, res) => {
  res.sendFile(path.join(__dirname, 'builder.html'));
});

app.get('/popup', (req, res) => {
  res.sendFile(path.join(__dirname, 'popup.html'));
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Enxame Zap',
    version: '2.7.0',
    mode: 'Funil HQ & PTT ZapVoice'
  });
});

app.listen(PORT, HOST, () => {
  console.log(`[Enxame Zap] Servidor iniciado em http://${HOST}:${PORT}`);
});
