const {
    getAlbum,
    handleOptions,
    hasSpotifyCredentials,
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
    const id = (requestUrl.searchParams.get('id') || '').trim();

    if (!id) {
        sendJson(res, 400, { error: 'Album id is required.' });
        return;
    }

    if (provider === 'spotify' && !hasSpotifyCredentials()) {
        sendJson(res, 400, { error: 'Spotify is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Vercel.' });
        return;
    }

    try {
        const album = await getAlbum(provider, id);
        sendJson(res, 200, { provider, album });
    } catch (error) {
        sendJson(res, error.status || 502, {
            error: error.message || 'Could not load album details.'
        });
    }
};