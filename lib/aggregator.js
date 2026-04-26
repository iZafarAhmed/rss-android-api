// lib/aggregator.js
const Parser = require('rss-parser');
const cheerio = require('cheerio');

// ========== SOURCES ==========
const ANDROID_SOURCES = [
  { name: "Android Central", url: "https://www.androidcentral.com/feeds.xml"},
  { name: "Android Police", url: "https://www.androidpolice.com/feed/"},
  { name: "Android Headlines", url: "https://www.androidheadlines.com/feed"},
  { name: "Android Authority", url: "https://www.androidauthority.com/feed/"},
  { name: "Droid Life", url: "https://www.droid-life.com/rss" },
  { name: "Android Community", url: "https://androidcommunity.com/feed/"},
  { name: "Android Guys", url: "https://androidguys.com/feed/"},
  { name: "Cult of Android", url: "https://www.cultofandroid.com/feed/"},
  { name: "Next Pit", url: "https://www.nextpit.com/feed"},
  { name: "Tech Advisor", url: "https://www.techadvisor.com/feed"},
  { name: "Phone Arena", url: "https://www.phonearena.com/feed"}
  { name: "Phandroid", url: "https://phandroid.com/feed/"}
];

// ========== CLEANING ==========
function cleanText(html) {
  if (!html) return '';
  const $ = cheerio.load(html, { decodeEntities: true });
  let text = $.text()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\[â€¦\]|\[…\]|\[...\]/gi, '')
    .replace(/\s+The post\s+.*?appeared first on.*$/gi, '');
  // Mojibake fix
const fixes = {
  'â€œ': '"',
  'â€\u009d': '"',
  'â€\u201D': '"',
  '\u2019': "'",   // ✅ Fixed line 175
  'â€™': "'",
  'â€˜': "'",
  'â€"': '–',
  'â€"': '—',
  'â€¦': '…',
  'â€\u00A0': ' '
};
  for (const [bad, good] of Object.entries(fixes)) {
    text = text.replace(new RegExp(bad, 'g'), good);
  }
  return text;
}

// ========== PARSER ==========
const parser = new Parser({
  customFields: {
    item: [
      'content:encoded',
      'media:description',
      'dc:date',
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'media:thumbnail'],
      ['enclosure', 'enclosure'],
      ['image', 'image']
    ]
  }
});

async function fetchFeed(source, limit = 4) {
  try {
    const feed = await parser.parseURL(source.url);
    return (feed.items || []).slice(0, limit).map(item => {
      // Extract image
      let imageUrl = null;
      if (item.image) {
        imageUrl = item.image;
      } else if (item.enclosure?.url && (item.enclosure.type?.startsWith('image/') || item.enclosure.medium === 'image')) {
        imageUrl = item.enclosure.url;
      } else if (item.mediaContent) {
        const mediaItems = Array.isArray(item.mediaContent) ? item.mediaContent : [item.mediaContent];
        const imageMedia = mediaItems.find(m => (m.medium === 'image') || (m.type && m.type.startsWith('image/')));
        if (imageMedia?.url) imageUrl = imageMedia.url;
      } else if (item.content || item['content:encoded'] || item.contentSnippet) {
        const html = item.content || item['content:encoded'] || item.contentSnippet;
        const match = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
        if (match) imageUrl = match[1];
      }

      return {
        title: cleanText(item.title),
        description: cleanText(item.content || item['content:encoded'] || item.contentSnippet || ''),
        url: item.link,
        date: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        source: source.name,
        favicon: source.favicon,
        image: imageUrl
      };
    });
  } catch (e) {
    console.error(`Failed ${source.name}:`, e.message);
    return [];
  }
}

// ========== DEDUPE ==========
function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    try {
      const url = new URL(item.url);
      const key = url.origin + url.pathname;
      return !seen.has(key) && seen.add(key);
    } catch {
      return true; // keep if invalid URL
    }
  });
}

// ========== EXPORTS ==========
module.exports = {
  ANDROID_SOURCES,
  fetchFeed,
  dedupe
};
