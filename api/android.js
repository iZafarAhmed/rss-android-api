// api/android.js
const { ANDROID_SOURCES, fetchFeed, dedupe } = require('../lib/aggregator');

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { limit = 200, source: sourceParam } = req.query;
  const limitNum = Math.min(Math.max(parseInt(limit) || 200, 1), 200);
  const sourcesFilter = sourceParam ? sourceParam.split(',').map(s => s.trim()) : null;

  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL) {
      let results = cache.android;
      if (sourcesFilter) {
        results = results.filter(item => sourcesFilter.includes(item.source));
      }
      return res.json({
        total: results.length,
        items: results.slice(0, limitNum),
        cached: true,
        updated_at: new Date(cacheTime).toISOString()
      });
    }

    const promises = ANDROID_SOURCES.map(src => fetchFeed(src, 5));
    const allItems = (await Promise.all(promises)).flat();
    const deduped = dedupe(allItems);
    const android = deduped.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Update shared cache
    if (global.rssCache) {
      global.rssCache.android = android;
    } else {
      global.rssCache = { news: [], android };
    }
    cacheTime = Date.now();
    cache = { android };

    let filtered = android;
    if (sourcesFilter) {
      filtered = android.filter(item => sourcesFilter.includes(item.source));
    }

    res.json({
      total: filtered.length,
      items: filtered.slice(0, limitNum),
      cached: false,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Aggregation failed' });
  }

}
