const {
    handleOptions,
    hasSpotifyCredentials,
    matchAlbum,
    normalizeProvider,
    sendJson
} = require('../_lib/catalog');

module.exports = async (req, res) => {
    if (handleOptions(req, res)) return;

    if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed.' });
        return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const provider = normalizeProvider(requestUrl.searchParams.get('provider'));
    const title = (requestUrl.searchParams.get('title') || '').trim();
    const artist = (requestUrl.searchParams.get('artist') || '').trim();

    if (!title || !artist) {
        sendJson(res, 400, { error: 'Album title and artist are required.' });
        return;
    }

    if (provider === 'spotify' && !hasSpotifyCredentials()) {
        sendJson(res, 400, { error: 'Spotify is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Vercel.' });
        return;
    }

    try {
        const album = await matchAlbum(provider, title, artist);
        sendJson(res, 200, { provider, album });
    } catch (error) {
        sendJson(res, error.status || 502, {
            error: error.message || 'Could not find a catalog match.'
        });
    }
};