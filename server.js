const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = '3a155d8b74msh3f88aa85e416edap1dd790jsn7c80f3cb3703';

function extraerShortcode(url) {
  const regex = /(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

app.post('/api/sortear-link', async (req, res) => {
  try {
    const { postUrl, winnersCount = 1, minMentions = 0 } = req.body;

    if (!postUrl) {
      return res.status(400).json({ error: 'Debes proporcionar una URL válida de Instagram.' });
    }

    const shortcode = extraerShortcode(postUrl);
    if (!shortcode) {
      return res.status(400).json({ error: 'Formato de URL inválido.' });
    }

    // Consulta a la API
    const response = await axios.get('https://instagram-data-api.p.rapidapi.com/comments', {
      params: { shortcode_or_id: shortcode },
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'instagram-data-api.p.rapidapi.com'
      }
    });

    // Mapeo flexible para asegurar la lectura de comentarios
    const resData = response.data;
    let rawComments = [];

    if (Array.isArray(resData)) {
      rawComments = resData;
    } else if (resData?.data && Array.isArray(resData.data)) {
      rawComments = resData.data;
    } else if (resData?.comments && Array.isArray(resData.comments)) {
      rawComments = resData.comments;
    } else if (resData?.items && Array.isArray(resData.items)) {
      rawComments = resData.items;
    }

    if (rawComments.length === 0) {
      return res.status(400).json({
        error: 'No se encontraron comentarios en esta publicación. Asegúrate de que sea pública y tenga comentarios.'
      });
    }

    // Extraer nombre de usuario y texto
    let comments = rawComments.map(c => ({
      username: c.user?.username || c.owner?.username || c.username || c.user_name || 'usuario',
      text: c.text || c.comment_text || c.caption || ''
    }));

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

    // Selección aleatoria de ganadores sin repetir
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
    console.error('Error en RapidAPI:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Error al consultar los comentarios. Verifica que la API Key esté activa en RapidAPI o que el post exista.'
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
