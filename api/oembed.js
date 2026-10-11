// GET /api/oembed?url=<lien TikTok>
// Lit la légende, le pseudo et la miniature d'une vidéo TikTok publique.
// 1) service oEmbed de TikTok  2) à défaut, métadonnées de la page publique.
const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

function isTikTok(u) {
  try {
    const x = new URL(u);
    return (x.protocol === 'https:' || x.protocol === 'http:') && /(^|\.)tiktok\.com$/i.test(x.hostname);
  } catch (e) {
    return false;
  }
}

// Enlève ?_r=1&_t=..., #..., et remet l'adresse sous la forme canonique
function clean(u) {
  const x = new URL(u);
  x.search = '';
  x.hash = '';
  x.hostname = x.hostname.replace(/^(m|www)\./i, 'www.');
  return x.toString().replace(/\/$/, '');
}

function decode(s) {
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function meta(html, prop) {
  const re1 = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', 'i');
  const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decode(m[1]) : '';
}

module.exports = async function handler(req, res) {
  let url = String((req.query && req.query.url) || '').trim();
  if (!isTikTok(url)) return res.status(400).json({ error: 'Lien TikTok invalide.' });

  const seen = [];
  try {
    // Liens courts (vm. / vt. / tiktok.com/t/...) : on suit la redirection
    const host = new URL(url).hostname;
    if (/^(vm|vt)\./i.test(host) || /\/t\/[A-Za-z0-9]+/.test(new URL(url).pathname)) {
      const r = await fetch(url, { redirect: 'follow', headers: UA });
      if (!isTikTok(r.url)) return res.status(400).json({ error: 'Lien TikTok invalide.' });
      url = r.url;
    }
    url = clean(url);

    // 1) oEmbed
    try {
      const r = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url), { headers: UA });
      seen.push('oembed ' + r.status);
      if (r.ok) {
        const d = await r.json();
        if (d && (d.title || d.author_name)) {
          res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
          return res.status(200).json({ caption: d.title || '', author: d.author_name || '', thumbnail: d.thumbnail_url || '' });
        }
      }
    } catch (e) { seen.push('oembed err'); }

    // 2) page publique (balises og:)
    try {
      const r = await fetch(url, { redirect: 'follow', headers: { ...UA, Accept: 'text/html' } });
      seen.push('page ' + r.status);
      if (r.ok) {
        const html = await r.text();
        const caption = meta(html, 'og:description') || meta(html, 'description');
        const title = meta(html, 'og:title');
        if (caption) {
          const m = url.match(/@([^/]+)/);
          res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
          return res.status(200).json({
            caption: caption,
            author: m ? m[1] : (title || ''),
            thumbnail: meta(html, 'og:image'),
          });
        }
      }
    } catch (e) { seen.push('page err'); }

    return res.status(404).json({ error: 'TikTok bloque la lecture automatique de cette vidéo.', debug: seen.join(' · ') });
  } catch (e) {
    return res.status(502).json({ error: 'TikTok ne répond pas.', debug: String(e && e.message || e) });
  }
};
