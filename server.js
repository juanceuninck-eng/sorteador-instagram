const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

// Extraer el shortcode de la URL
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

    // Petición a la vista web pública simulando un navegador móvil
    const cleanUrl = `https://www.instagram.com/p/${shortcode}/`;
    
    const { data: html } = await axios.get(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    const $ = cheerio.load(html);
    let comments = [];

    // Buscar scripts con datos incrustados (SharedData o scripts JSON)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        if (json && json.comment) {
          json.comment.forEach(c => {
            if (c.text && c.author) {
              comments.push({
                username: c.author.alternateName || c.author.name || 'usuario',
                text: c.text
              });
            }
          });
        }
      } catch (e) {
        // Ignorar scripts que no correspondan
      }
    });

    // Método alternativo si el primer scraper no encuentra comentarios estructurados
    if (comments.length === 0) {
      const scriptRegex = /_sharedData\s*=\s*({.+?});<\/script>/;
      const match = html.match(scriptRegex);
      if (match) {
        try {
          const sharedData = JSON.parse(match[1]);
          const media = sharedData.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
          const edges = media?.edge_media_to_parent_comment?.edges || [];
          comments = edges.map(e => ({
            username: e.node.owner?.username || 'usuario',
            text: e.node.text || ''
          }));
        } catch (e) {}
      }
    }

    if (comments.length === 0) {
      return res.status(400).json({ 
        error: 'No se pudieron extraer los comentarios. Revisa que el post sea de una cuenta PÚBLICA y tenga comentarios.' 
      });
    }

    // Filtrar por menciones
    if (minMentions > 0) {
      comments = comments.filter(c => {
        const mentions = (c.text.match(/@[a-zA-Z0-9_.]+/g) || []).length;
        return mentions >= minMentions;
      });
    }

    if (comments.length === 0) {
      return res.status(400).json({ error: `Ningún comentario cumple con las ${minMentions} menciones requeridas.` });
    }

    // Selección aleatoria de ganadores
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
      error: 'Error de conexión con Instagram. Asegúrate de que la cuenta sea pública.'
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
