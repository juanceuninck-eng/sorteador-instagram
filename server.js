const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Extraer el shortcode de la URL de Instagram
function extraerShortcode(url) {
  const regex = /(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

app.post('/api/sortear-link', async (req, res) => {
  try {
    const { postUrl, winnersCount = 1, minMentions = 0 } = req.body;

    if (!postUrl) {
      return res.status(400).json({ error: 'Debes proporcionar una URL de Instagram.' });
    }

    const shortcode = extraerShortcode(postUrl);
    if (!shortcode) {
      return res.status(400).json({ error: 'Formato de URL inválido. Copia el enlace desde Instagram.' });
    }

    // Consulta al endpoint público de InstagramEmbed / GraphQL
    const apiUrl = `https://www.instagram.com/p/${shortcode}/embed/caption/`;

    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });

    const html = response.data;
    let comments = [];

    // Extraer comentarios del HTML embed usando Expresiones Regulares sobre la estructura embebida
    const commentRegex = /class="CaptionComments-[^"]*">.*?<a class="CaptionUsername"[^>]*>([^<]+)<\/a><span>\s*([^<]+)<\/span>/gs;
    let match;

    while ((match = commentRegex.exec(html)) !== null) {
      const username = match[1].trim();
      const text = match[2].trim();
      if (username && text) {
        comments.push({ username, text });
      }
    }

    // Respaldos de parseo si es un Reel o post dinámico
    if (comments.length === 0) {
      const altRegex = /"text":"([^"]+)".*?"username":"([^"]+)"/g;
      let altMatch;
      while ((altMatch = altRegex.exec(html)) !== null) {
        comments.push({
          username: altMatch[2],
          text: altMatch[1]
        });
      }
    }

    if (comments.length === 0) {
      return res.status(400).json({
        error: 'No se encontraron comentarios públicos. Verifica que la publicación sea de una cuenta PÚBLICA y tenga comentarios cargados.'
      });
    }

    // Filtrar por menciones mínimas (@)
    if (minMentions > 0) {
      comments = comments.filter(c => {
        const mentions = (c.text.match(/@[a-zA-Z0-9_.]+/g) || []).length;
        return mentions >= minMentions;
      });
    }

    if (comments.length === 0) {
      return res.status(400).json({ error: `Ningún comentario cumple con las ${minMentions} menciones requeridas.` });
    }

    // Selección aleatoria de ganadores unívocos
    const shuffled = [...comments].sort(() => 0.5 - Math.random());
    const uniqueWinners = [];
    const usedUsers = new Set();

    for (const c of shuffled) {
      if (!usedUsers.has(c.username)) {
        usedUsers.add(c.username);
        uniqueWinners.push(c);
      }
      if (uniqueWinners.length >= parseInt(winnersCount)) break;
    }

    return res.json({
      success: true,
      totalComments: comments.length,
      winners: uniqueWinners
    });

  } catch (error) {
    console.error('Error en el servidor:', error.message);
    return res.status(500).json({
      error: 'Error de conexión con Instagram. Verifica el enlace e intenta nuevamente.'
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
