const {
    handleOptions,
    hasSpotifyCredentials,
    normalizeProvider,
    searchAlbums,
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
    const term = (requestUrl.searchParams.get('term') || '').trim();

    if (term.length < 2) {
        sendJson(res, 400, { error: 'Enter at least 2 characters to search.' });
        return;
    }

    if (provider === 'spotify' && !hasSpotifyCredentials()) {
        sendJson(res, 400, { error: 'Spotify is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Vercel.' });
        return;
    }

    try {
        const albums = await searchAlbums(provider, term);
        sendJson(res, 200, { provider, albums });
    } catch (error) {
        sendJson(res, error.status || 502, {
            error: error.message || 'Could not search the catalog.'
        });
    }
};