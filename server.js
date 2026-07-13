const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MAX_COMMENTS_LIMIT = 15000;

// Obtener publicaciones del usuario logueado
app.get('/api/mis-publicaciones', async (req, res) => {
  const { accessToken } = req.query;

  if (!accessToken) {
    return res.status(400).json({ error: 'Falta el accessToken.' });
  }

  try {
    const accountsRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { fields: 'instagram_business_account', access_token: accessToken }
    });

    const pages = accountsRes.data.data || [];
    let igAccountId = null;

    for (const page of pages) {
      if (page.instagram_business_account) {
        igAccountId = page.instagram_business_account.id;
        break;
      }
    }

    if (!igAccountId) {
      return res.status(400).json({ error: 'No se encontró una cuenta profesional de Instagram vinculada a tus páginas de Facebook.' });
    }

    const mediaRes = await axios.get(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
      params: { fields: 'id,caption,shortcode,comments_count', access_token: accessToken }
    });

    return res.json({
      success: true,
      posts: mediaRes.data.data || []
    });

  } catch (error) {
    const apiError = error.response?.data?.error?.message || error.message;
    return res.status(500).json({ error: 'Error obteniendo publicaciones: ' + apiError });
  }
});

// Realizar sorteo
app.post('/api/sortear', async (req, res) => {
  let { mediaId, accessToken, winnersCount = 1, minMentions = 0 } = req.body;

  if (!mediaId || !accessToken) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
  }

  try {
    const mediaRes = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
      params: { fields: 'comments_count', access_token: accessToken }
    });

    const totalComments = mediaRes.data.comments_count || 0;

    if (totalComments > MAX_COMMENTS_LIMIT) {
      return res.status(400).json({
        error: 'La publicación supera el límite de ' + MAX_COMMENTS_LIMIT.toLocaleString() + ' comentarios.'
      });
    }

    let comments = [];
    let nextUrl = `https://graph.facebook.com/v19.0/${mediaId}/comments?fields=id,username,text,timestamp&limit=100&access_token=${accessToken}`;

    while (nextUrl) {
      const response = await axios.get(nextUrl);
      const data = response.data;
      if (data.data) comments.push(...data.data);
      nextUrl = data.paging && data.paging.next ? data.paging.next : null;
    }

    let eligibleComments = comments;
    if (minMentions > 0) {
      const mentionRegex = /@[\w._]+/g;
      eligibleComments = comments.filter(c => {
        const mentions = c.text ? (c.text.match(mentionRegex) || []).length : 0;
        return mentions >= minMentions;
      });
    }

    if (eligibleComments.length === 0) {
      return res.status(400).json({ error: 'No hay comentarios que cumplan con los criterios establecidos.' });
    }

    const winners = [];
    const pool = [...eligibleComments];
    const countToPick = Math.min(winnersCount, pool.length);

    for (let i = 0; i < countToPick; i++) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      winners.push(pool[randomIndex]);
      pool.splice(randomIndex, 1);
    }

    return res.json({
      success: true,
      totalComments,
      eligibleCount: eligibleComments.length,
      winners
    });

  } catch (error) {
    const apiError = error.response?.data?.error?.message || error.message;
    return res.status(500).json({ error: 'Error de Meta API: ' + apiError });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor corriendo en puerto ' + PORT);
});
