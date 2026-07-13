const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(jsonExpress = express.json());

// Extraer el código corto (shortcode) de la URL de Instagram
function extraerShortcode(url) {
  const regex = /(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Ruta principal para realizar el sorteo por URL
app.post('/api/sortear-link', async (req, res) => {
  try {
    const { postUrl, winnersCount = 1, minMentions = 0 } = req.body;

    if (!postUrl) {
      return res.status(400).json({ error: 'Debes proporcionar una URL válida de Instagram.' });
    }

    const shortcode = extraerShortcode(postUrl);
    if (!shortcode) {
      return res.status(400).json({ error: 'La URL proporcionada no tiene un formato válido de Instagram.' });
    }

    // Consulta de datos públicos vía GraphQL / Endpoint de Instagram
    const graphqlUrl = `https://www.instagram.com/graphql/query/?doc_id=17991233853018820&variables=${encodeURIComponent(
      JSON.stringify({ shortcode: shortcode, first: 50 })
    )}`;

    const response = await axios.get(graphqlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
      }
    });

    const media = response.data?.data?.xdt_shortcode_media;
    if (!media) {
      return res.status(404).json({ error: 'No se pudo obtener la publicación. Asegúrate de que sea una cuenta pública.' });
    }

    // Extraer comentarios
    const commentsEdges = media.edge_media_to_parent_comment?.edges || media.edge_media_to_comment?.edges || [];
    let comments = commentsEdges.map(edge => ({
      username: edge.node.owner?.username || 'usuario_anonimo',
      text: edge.node.text || ''
    }));

    if (comments.length === 0) {
      return res.status(400).json({ error: 'No se encontraron comentarios en esta publicación o el post es privado.' });
    }

    // Filtrar por menciones mínimas (@)
    if (minMentions > 0) {
      comments = comments.filter(c => {
        const mentions = (c.text.match(/@[a-zA-Z0-9_.]+/g) || []).length;
        return mentions >= minMentions;
      });
    }

    if (comments.length === 0) {
      return res.status(400).json({ error: `Ningún comentario cumple con el mínimo de ${minMentions} mención(es).` });
    }

    // Seleccionar ganadores al azar (sin repetir usuario)
    const shuffled = [...comments].sort(() => 0.5 - Math.random());
    const uniqueWinners = [];
    const usedUsernames = new Set();

    for (const comment of shuffled) {
      if (!usedUsernames.has(comment.username)) {
        usedUsernames.add(comment.username);
        uniqueWinners.push(comment);
      }
      if (uniqueWinners.length >= parseInt(winnersCount)) break;
    }

    return res.json({
      success: true,
      totalComments: comments.length,
      winners: uniqueWinners
    });

  } catch (error) {
    console.error('Error procesando sorteo:', error.message);
    return res.status(500).json({
      error: 'Error al conectar con Instagram. Verifica que la publicación sea pública e intenta nuevamente.'
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
