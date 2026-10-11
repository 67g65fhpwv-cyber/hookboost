// GET /api/oembed?url=<lien TikTok>
// Lit la légende, le pseudo et la miniature d'une vidéo TikTok publique (service oEmbed de TikTok, sans clé).
const UA = { 'User-Agent': 'Mozilla/5.0' };

function isTikTok(u) {
  try {
    const x = new URL(u);
    return (x.protocol === 'https:' || x.protocol === 'http:') && /(^|\.)tiktok\.com$/i.test(x.hostname);
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  let url = String((req.query && req.query.url) || '').trim();
  if (!isTikTok(url)) return res.status(400).json({ error: 'Lien TikTok invalide.' });

  try {
    // Liens courts (vm.tiktok.com / vt.tiktok.com) : on suit la redirection
    if (/^(vm|vt)\./i.test(new URL(url).hostname)) {
      const r = await fetch(url, { redirect: 'follow', headers: UA });
      if (!isTikTok(r.url)) return res.status(400).json({ error: 'Lien TikTok invalide.' });
      url = r.url.split('?')[0];
    }
    const r = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url), { headers: UA });
    if (!r.ok) return res.status(404).json({ error: 'Vidéo introuvable (privée ou supprimée ?).' });
    const d = await r.json();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ caption: d.title || '', author: d.author_name || '', thumbnail: d.thumbnail_url || '' });
  } catch (e) {
    return res.status(502).json({ error: 'TikTok ne répond pas.' });
  }
};
