import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createClient } from 'redis';

const PORT = Number(process.env.PORT ?? 3001);
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ??
  'https://madridcentral.org,https://visionary-narwhal-25c249.netlify.app'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const MAX_ADDRESS_LENGTH = 200;
const KEY_PREFIX = 'address:';

// Misma zona que usa el front (no se modifica).
const MADRID_CENTRAL = [
  [40.430251, -3.711912],
  [40.429798, -3.70576],
  [40.427761, -3.695781],
  [40.426092, -3.692392],
  [40.424874, -3.690591],
  [40.419693, -3.692969],
  [40.415494, -3.694176],
  [40.409023, -3.692091],
  [40.407533, -3.693591],
  [40.405025, -3.702602],
  [40.406783, -3.711419],
  [40.408653, -3.713137],
  [40.410261, -3.713967],
  [40.422215, -3.712889],
  [40.423398, -3.710876],
  [40.424318, -3.711773],
  [40.42741, -3.71395],
];

// Ray casting. Lo calcula el servidor: nunca se confía en el `inside` del cliente.
function isInsideMadridCentral(lat, long) {
  let inside = false;
  for (let i = 0, j = MADRID_CENTRAL.length - 1; i < MADRID_CENTRAL.length; j = i++) {
    const [latI, longI] = MADRID_CENTRAL[i];
    const [latJ, longJ] = MADRID_CENTRAL[j];
    const crosses =
      longI > long !== longJ > long &&
      lat < ((latJ - latI) * (long - longI)) / (longJ - longI) + latI;
    if (crosses) inside = !inside;
  }
  return inside;
}

const ABBREVIATIONS = {
  cl: 'calle',
  c: 'calle',
  'c/': 'calle',
  av: 'avenida',
  plz: 'plaza',
  pl: 'plaza',
  cta: 'carretera',
  p: 'paseo',
  pº: 'paseo',
};

export function formatAddress(address) {
  return address
    .replace(/[.,]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((word) => ABBREVIATIONS[word] ?? word)
    .join(' ');
}

function parseAddress(value) {
  if (typeof value !== 'string') return null;
  const formatted = formatAddress(value);
  return formatted && formatted.length <= MAX_ADDRESS_LENGTH ? formatted : null;
}

function parseCoordinate(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

const redis = createClient({
  socket: { host: process.env.REDIS_HOSTNAME, port: Number(process.env.REDIS_PORT) },
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
});
redis.on('error', (error) => console.error('Redis error:', error.message));

const app = express();
app.disable('x-powered-by');
// Fly.io termina TLS en su proxy: sin esto, el rate limit vería la IP del proxy.
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Peticiones sin Origin (curl, health checks) no pasan por CORS del navegador.
      callback(null, !origin || ALLOWED_ORIGINS.includes(origin));
    },
    methods: ['GET', 'POST'],
  }),
);
app.use(express.json({ limit: '2kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/health', (_request, response) => {
  response.status(redis.isReady ? 200 : 503).json({ status: redis.isReady ? 'ok' : 'redis-unavailable' });
});

app.get('/', async (request, response) => {
  const address = parseAddress(request.query.address);
  if (!address) return response.status(400).json({ error: 'Dirección no válida.' });

  const value = await redis.json.get(KEY_PREFIX + address);
  if (!value) return response.status(404).json({ error: 'No encontrada.' });
  response.json(value);
});

app.post('/', async (request, response) => {
  const address = parseAddress(request.body?.address);
  const lat = parseCoordinate(request.body?.lat, -90, 90);
  const long = parseCoordinate(request.body?.long, -180, 180);
  if (!address || lat === null || long === null) {
    return response.status(400).json({ error: 'Datos no válidos.' });
  }

  const inside = isInsideMadridCentral(lat, long);
  // NX: la primera geocodificación gana; un cliente no puede sobrescribir una entrada existente.
  await redis.json.set(KEY_PREFIX + address, '$', { lat, long, inside }, { condition: 'NX' });
  response.json({ inside });
});

app.use((_request, response) => {
  response.status(404).json({ error: 'Ruta no encontrada.' });
});

// Express 5 envía aquí los errores de handlers async; no se devuelve el detalle al cliente.
app.use((error, _request, response, _next) => {
  console.error('Error:', error);
  response.status(500).json({ error: 'Error interno.' });
});

await redis.connect();
const server = app.listen(PORT, () => console.log(`Servidor escuchando en ${PORT}`));

function shutdown() {
  server.close(async () => {
    await redis.quit().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
