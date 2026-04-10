// Vercel serverless function — proxies form submissions to the Ortto AP3 API.
// The API key is held server-side via the ORTTO_API_KEY environment variable.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ORTTO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: missing ORTTO_API_KEY' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!body || !Array.isArray(body.activities) || body.activities.length === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Inject the real client IP from request headers into the location block.
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
      req.headers['x-real-ip'] ||
      null;

    body.activities.forEach(function (activity) {
      if (activity && activity.location) {
        activity.location.source_ip = clientIp;
      }
    });

    const upstream = await fetch('https://api.eu.ap3api.com/v1/activities/create', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(text || '{}');
  } catch (err) {
    console.error('submit error:', err);
    return res.status(500).json({ error: 'Failed to submit', detail: err && err.message });
  }
};
