const ITUNES_BASE_URL = 'https://itunes.apple.com';
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

let spotifyTokenCache = {
    accessToken: null,
    expiresAt: 0
};

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end(JSON.stringify(payload));
}

function handleOptions(req, res) {
    if (req.method !== 'OPTIONS') return false;
    sendJson(res, 204, {});
    return true;
}

function normalizeProvider(provider) {
    return provider === 'spotify' ? 'spotify' : 'itunes';
}

function getYear(dateString) {
    if (!dateString) return null;
    const year = Number(String(dateString).slice(0, 4));
    return Number.isFinite(year) ? year : null;
}

function upscaleItunesArtwork(url) {
    if (!url) return '';
    return url.replace(/\/[0-9]+x[0-9]+bb\./, '/600x600bb.');
}

function groupTracksIntoDiscs(tracks) {
    const discMap = new Map();

    tracks
        .slice()
        .sort((left, right) => {
            const discOrder = (left.discNumber || 1) - (right.discNumber || 1);
            if (discOrder !== 0) return discOrder;
            return (left.trackNumber || 0) - (right.trackNumber || 0);
        })
        .forEach((track) => {
            const discNumber = track.discNumber || 1;
            if (!discMap.has(discNumber)) {
                discMap.set(discNumber, []);
            }
            discMap.get(discNumber).push(track.trackName || track.name);
        });

    return Array.from(discMap.entries()).map(([discNumber, discTracks]) => ({
        name: `Disc ${discNumber}`,
        tracks: discTracks
    }));
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function scoreAlbumMatch(album, title, artist) {
    const normalizedTitle = normalizeText(title);
    const normalizedArtist = normalizeText(artist);
    const albumTitle = normalizeText(album.title);
    const albumArtist = normalizeText(album.artist);
    let score = 0;

    if (albumTitle === normalizedTitle) score += 8;
    else if (albumTitle.includes(normalizedTitle) || normalizedTitle.includes(albumTitle)) score += 5;

    if (albumArtist === normalizedArtist) score += 6;
    else if (albumArtist.includes(normalizedArtist) || normalizedArtist.includes(albumArtist)) score += 4;

    if (album.year) score += 1;
    if (album.totalTracks) score += 1;

    return score;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
        const error = new Error(payload.error_description || payload.error || `Upstream request failed with ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return payload;
}

function hasSpotifyCredentials() {
    return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getSpotifyAccessToken() {
    if (!hasSpotifyCredentials()) {
        const error = new Error('Spotify credentials are not configured.');
        error.status = 400;
        throw error;
    }

    if (spotifyTokenCache.accessToken && Date.now() < spotifyTokenCache.expiresAt) {
        return spotifyTokenCache.accessToken;
    }

    const credentials = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const tokenPayload = await fetchJson('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    spotifyTokenCache = {
        accessToken: tokenPayload.access_token,
        expiresAt: Date.now() + ((tokenPayload.expires_in || 3600) - 60) * 1000
    };

    return spotifyTokenCache.accessToken;
}

async function fetchSpotifyJson(url) {
    const accessToken = await getSpotifyAccessToken();
    return fetchJson(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}

async function searchItunesAlbums(term) {
    const url = new URL('/search', ITUNES_BASE_URL);
    url.searchParams.set('media', 'music');
    url.searchParams.set('entity', 'album');
    url.searchParams.set('limit', '10');
    url.searchParams.set('term', term);

    const payload = await fetchJson(url);
    return (payload.results || []).map((album) => ({
        id: String(album.collectionId),
        provider: 'itunes',
        title: album.collectionName,
        artist: album.artistName,
        year: getYear(album.releaseDate),
        cover: upscaleItunesArtwork(album.artworkUrl100),
        totalTracks: album.trackCount || 0
    }));
}

async function getItunesAlbum(id) {
    const url = new URL('/lookup', ITUNES_BASE_URL);
    url.searchParams.set('id', id);
    url.searchParams.set('entity', 'song');

    const payload = await fetchJson(url);
    const [album, ...tracks] = payload.results || [];

    if (!album) {
        const error = new Error('Album not found in iTunes.');
        error.status = 404;
        throw error;
    }

    const discs = groupTracksIntoDiscs(
        tracks.filter((track) => track.wrapperType === 'track' && track.kind === 'song')
    );

    return {
        id: String(album.collectionId),
        provider: 'itunes',
        title: album.collectionName,
        artist: album.artistName,
        year: getYear(album.releaseDate),
        cover: upscaleItunesArtwork(album.artworkUrl100),
        discs
    };
}

async function searchSpotifyAlbums(term) {
    const url = new URL('/search', SPOTIFY_API_BASE_URL);
    url.searchParams.set('type', 'album');
    url.searchParams.set('limit', '10');
    url.searchParams.set('q', term);

    const payload = await fetchSpotifyJson(url);
    return ((payload.albums && payload.albums.items) || []).map((album) => ({
        id: album.id,
        provider: 'spotify',
        title: album.name,
        artist: (album.artists || []).map((artist) => artist.name).join(', '),
        year: getYear(album.release_date),
        cover: album.images && album.images.length ? album.images[0].url : '',
        totalTracks: album.total_tracks || 0
    }));
}

async function getAllSpotifyTracks(albumId) {
    const tracks = [];
    let url = new URL(`/albums/${albumId}/tracks`, SPOTIFY_API_BASE_URL);
    url.searchParams.set('limit', '50');

    while (url) {
        const payload = await fetchSpotifyJson(url);
        tracks.push(...(payload.items || []));
        url = payload.next ? new URL(payload.next) : null;
    }

    return tracks;
}

async function getSpotifyAlbum(id) {
    const albumUrl = new URL(`/albums/${id}`, SPOTIFY_API_BASE_URL);
    const album = await fetchSpotifyJson(albumUrl);
    const tracks = await getAllSpotifyTracks(id);

    return {
        id: album.id,
        provider: 'spotify',
        title: album.name,
        artist: (album.artists || []).map((artist) => artist.name).join(', '),
        year: getYear(album.release_date),
        cover: album.images && album.images.length ? album.images[0].url : '',
        discs: groupTracksIntoDiscs(
            tracks.map((track) => ({
                name: track.name,
                trackName: track.name,
                discNumber: track.disc_number,
                trackNumber: track.track_number
            }))
        )
    };
}

async function matchAlbum(provider, title, artist) {
    const searchTerm = [title, artist].filter(Boolean).join(' ').trim();
    const results = await searchAlbums(provider, searchTerm);
    const bestMatch = results
        .map((album) => ({ album, score: scoreAlbumMatch(album, title, artist) }))
        .sort((left, right) => right.score - left.score)[0];

    if (!bestMatch || bestMatch.score <= 0) {
        const error = new Error('Could not find a matching album in the selected catalog.');
        error.status = 404;
        throw error;
    }

    const album = await getAlbum(provider, bestMatch.album.id);
    return {
        ...album,
        catalog: {
            provider,
            id: bestMatch.album.id
        }
    };
}

async function searchAlbums(provider, term) {
    return provider === 'spotify' ? searchSpotifyAlbums(term) : searchItunesAlbums(term);
}

async function getAlbum(provider, id) {
    return provider === 'spotify' ? getSpotifyAlbum(id) : getItunesAlbum(id);
}

module.exports = {
    getAlbum,
    handleOptions,
    hasSpotifyCredentials,
    matchAlbum,
    normalizeProvider,
    searchAlbums,
    sendJson
};