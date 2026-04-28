module.exports = async function handler(req, res) {
  const target = req.query.url;

  if (!target || !target.startsWith('https://api.mangadex.org/')) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(target);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Upstream error' });
    }
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
