module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const key = process.env.SUBDL_KEY;
  if (!key) return res.status(500).json({ error: 'SUBDL_KEY not configured in environment variables' });

  const { action } = req.query;

  // ── Search subtitles ──────────────────────────────────────────────
  if (action === 'search') {
    const { tmdb_id, type, season, episode, lang = 'en', title } = req.query;
    let url = `https://api.subdl.com/api/v1/subtitles?api_key=${key}&languages=${lang}&subs_per_page=10`;

    if (tmdb_id) {
      url += `&tmdb_id=${tmdb_id}&type=${type}`;
      if (season)  url += `&season_number=${season}`;
      if (episode) url += `&episode_number=${episode}`;
    } else if (title) {
      url += `&film_name=${encodeURIComponent(title)}`;
    } else {
      return res.status(400).json({ error: 'Provide tmdb_id or title' });
    }

    try {
      const r    = await fetch(url);
      const data = await r.json();
      res.setHeader('Cache-Control', 's-maxage=300');
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  // ── Proxy ZIP download ────────────────────────────────────────────
  if (action === 'download') {
    const { path } = req.query;
    if (!path || !path.startsWith('/subtitle/')) {
      return res.status(400).json({ error: 'Invalid subtitle path' });
    }
    try {
      const r = await fetch(`https://dl.subdl.com${path}`);
      if (!r.ok) return res.status(r.status).end();
      const buffer = await r.arrayBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Cache-Control', 's-maxage=86400');
      res.send(Buffer.from(buffer));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(400).json({ error: 'Unknown action. Use action=search or action=download' });
};
