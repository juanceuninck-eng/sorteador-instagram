const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// --- Seguridad básica de headers HTTP ---
app.use(helmet());

// --- CORS restringido a tu propio dominio ---
// Reemplazá estas URLs por las reales de tu frontend (Vercel, dominio propio, etc.)
const ORIGENES_PERMITIDOS = [
  'https://sorteador-instagram-57st.vercel.app',
  'http://localhost:3000' // útil mientras probás en tu máquina
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite pedidos sin "origin" (como Postman o curl) solo si no hay origin definido
    if (!origin || ORIGENES_PERMITIDOS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origen no permitido por CORS'));
    }
  }
}));

// --- Límite de tamaño del body: nadie puede mandar un texto gigante ---
app.use(express.json({ limit: '100kb' }));

// --- Rate limiting: máximo de sorteos por IP ---
const sorteoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30,                   // máximo 30 sorteos por IP cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Hiciste demasiados sorteos en poco tiempo. Esperá unos minutos y volvé a intentar.'
  }
});

// --- Constantes de validación ---
const MAX_COMENTARIOS_CHARS = 50000;   // ~ unas 2000-3000 líneas típicas
const MAX_WINNERS = 500;
const MAX_MIN_MENTIONS = 50;

function parsearComentariosManual(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const comentarios = lineas.map(linea => {
    const idx = linea.indexOf(':');
    if (idx === -1) {
      return { username: 'usuario_' + Math.random().toString(36).slice(2, 7), text: linea };
    }
    const username = linea.slice(0, idx).trim().replace(/^@/, '');
    const text = linea.slice(idx + 1).trim();
    return { username, text };
  });
  return comentarios;
}

// --- Endpoint principal, con rate limiter aplicado solo acá ---
app.post('/api/sortear-manual', sorteoLimiter, (req, res) => {
  try {
    const { comentariosTexto, winnersCount, minMentions } = req.body;

    // Validación: comentariosTexto debe existir y ser string
    if (!comentariosTexto || typeof comentariosTexto !== 'string' || comentariosTexto.trim().length === 0) {
      return res.status(400).json({ error: 'Debes pegar al menos un comentario.' });
    }

    if (comentariosTexto.length > MAX_COMENTARIOS_CHARS) {
      return res.status(400).json({
        error: `El texto es demasiado largo (máximo ${MAX_COMENTARIOS_CHARS} caracteres).`
      });
    }

    // Validación: winnersCount debe ser un entero positivo dentro de rango
    let winners = parseInt(winnersCount, 10);
    if (isNaN(winners) || winners < 1) winners = 1;
    if (winners > MAX_WINNERS) winners = MAX_WINNERS;

    // Validación: minMentions debe ser un entero no negativo dentro de rango
    let minMen = parseInt(minMentions, 10);
    if (isNaN(minMen) || minMen < 0) minMen = 0;
    if (minMen > MAX_MIN_MENTIONS) minMen = MAX_MIN_MENTIONS;

    let comments = parsearComentariosManual(comentariosTexto);

    if (comments.length === 0) {
      return res.status(400).json({ error: 'No se pudo interpretar ningún comentario.' });
    }

    if (minMen > 0) {
      comments = comments.filter(c => {
        const mentions = (c.text.match(/@[a-zA-Z0-9_.]+/g) || []).length;
        return mentions >= minMen;
      });
    }

    if (comments.length === 0) {
      return res.status(400).json({ error: `Ningún comentario cumple con las ${minMen} menciones requeridas.` });
    }

    const shuffled = [...comments].sort(() => 0.5 - Math.random());
    const uniqueWinners = [];
    const usedUsers = new Set();
    for (const c of shuffled) {
      if (!usedUsers.has(c.username)) {
        usedUsers.add(c.username);
        uniqueWinners.push(c);
      }
      if (uniqueWinners.length >= winners) break;
    }

    return res.json({
      success: true,
      totalComments: comments.length,
      winners: uniqueWinners
    });

  } catch (error) {
    console.error('Error en sorteo manual:', error.message);
    return res.status(500).json({ error: 'Ocurrió un error al procesar los comentarios.' });
  }
});

// --- Endpoint de salud, útil para monitoreo ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- Manejo de rutas no encontradas ---
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// --- Manejador de errores centralizado (incluye errores de CORS) ---
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err.message);
  if (err.message === 'Origen no permitido por CORS') {
    return res.status(403).json({ error: 'Este origen no tiene permiso para usar la API.' });
  }
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
