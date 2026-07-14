function parsearComentariosManual(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const comentarios = lineas.map(linea => {
    const idx = linea.indexOf(':');
    if (idx === -1) {
      // Si no hay ":", tratamos toda la línea como texto y usuario "anónimo"
      return { username: 'usuario_' + Math.random().toString(36).slice(2, 7), text: linea };
    }
    const username = linea.slice(0, idx).trim().replace(/^@/, '');
    const text = linea.slice(idx + 1).trim();
    return { username, text };
  });
  return comentarios;
}

app.post('/api/sortear-manual', (req, res) => {
  try {
    const { comentariosTexto, winnersCount = 1, minMentions = 0 } = req.body;

    if (!comentariosTexto || comentariosTexto.trim().length === 0) {
      return res.status(400).json({ error: 'Debes pegar al menos un comentario.' });
    }

    let comments = parsearComentariosManual(comentariosTexto);

    if (comments.length === 0) {
      return res.status(400).json({ error: 'No se pudo interpretar ningún comentario.' });
    }

    // Filtrar por menciones (misma lógica que ya tenías)
    if (minMentions > 0) {
      comments = comments.filter(c => {
        const mentions = (c.text.match(/@[a-zA-Z0-9_.]+/g) || []).length;
        return mentions >= minMentions;
      });
    }

    if (comments.length === 0) {
      return res.status(400).json({ error: `Ningún comentario cumple con las ${minMentions} menciones requeridas.` });
    }

    // Selección de ganadores sin repetir usuario (igual que antes)
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
    console.error('Error en sorteo manual:', error.message);
    return res.status(500).json({ error: 'Ocurrió un error al procesar los comentarios.' });
  }
});
