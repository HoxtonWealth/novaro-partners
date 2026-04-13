// Vercel serverless function — proxies form submissions to the Ortto AP3 API.
// The API key is held server-side via the ORTTO_API_KEY environment variable.

// ── Rate limiter (in-memory, per warm instance) ──
// 5 requests per IP per 60-second window. Resets on cold start, but Vercel
// reuses warm instances for several minutes so this catches most abuse.
const rateMap = new Map();
const RATE_WINDOW = 60 * 1000; // 1 minute
var RATE_MAX = 5;

function isRateLimited(ip) {
  var now = Date.now();
  var hits = rateMap.get(ip) || [];
  hits = hits.filter(function (t) { return t > now - RATE_WINDOW; });
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  rateMap.set(ip, hits);
  // Prevent unbounded memory growth
  if (rateMap.size > 10000) {
    for (var entry of rateMap) {
      if (entry[1].every(function (t) { return t <= now - RATE_WINDOW; })) rateMap.delete(entry[0]);
    }
  }
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Origin check ──
  var origin = req.headers['origin'] || '';
  var allowed = (process.env.ALLOWED_ORIGINS || 'novaropartners.co.uk,novaro.vercel.app')
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); });
  var originHost = '';
  try { originHost = new URL(origin).hostname.toLowerCase(); } catch (_) {}
  if (origin && !allowed.some(function (h) { return originHost === h; })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── Rate limit ──
  var forwarded = req.headers['x-forwarded-for'];
  var clientIp =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.headers['x-real-ip'] ||
    'unknown';

  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }

  const apiKey = process.env.ORTTO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: missing ORTTO_API_KEY' });
  }

  const scid = process.env.ORTTO_SCID;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!body || !Array.isArray(body.activities) || body.activities.length === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    body.activities.forEach(function (activity) {
      if (activity && activity.location) {
        activity.location.source_ip = clientIp === 'unknown' ? null : clientIp;
      }
      if (activity && scid) {
        if (!activity.attributes) activity.attributes = {};
        activity.attributes['str:cm:scid'] = scid;
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
