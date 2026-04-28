module.exports = async function handler(req, res) {
  const token = process.env.TMDB_TOKEN;
  if (!token) return res.status(500).json({ error: 'TMDB token not configured' });

  const { path, ...params } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path' });

  const qs  = new URLSearchParams(params).toString();
  const url = `https://api.themoviedb.org/3/${path}${qs ? '?' + qs : ''}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Upstream error' });
    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
