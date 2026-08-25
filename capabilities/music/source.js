// ============================================================
// DUCKAI MUSIC SOURCE — AUDIUS
// ============================================================

require('dotenv').config();

const AUDIUS_API_URL =
    'https://api.audius.co/v1';

const AUDIUS_APP_NAME =
    process.env.AUDIUS_APP_NAME ||
    'DuckAI';

// ============================================================
// AUDIUS REQUEST
// ============================================================

async function audiusRequest(
    endpoint,
    params = {}
) {

    const url =
        new URL(
            `${AUDIUS_API_URL}${endpoint}`
        );

    url.searchParams.set(
        'app_name',
        AUDIUS_APP_NAME
    );

    for (
        const [key, value]
        of Object.entries(params)
    ) {

        if (
            value !== undefined &&
            value !== null
        ) {

            url.searchParams.set(
                key,
                String(value)
            );
        }
    }

    const response =
        await fetch(url);

    if (!response.ok) {

        throw new Error(
            `Audius request failed (${response.status}).`
        );
    }

    return response.json();
}

// ============================================================
// SEARCH TRACKS
// ============================================================

async function searchTracks(
    query,
    limit = 5
) {

    if (
        typeof query !== 'string' ||
        !query.trim()
    ) {

        return {
            success: false,
            results: [],
            message:
                'Music query is empty.'
        };
    }

    try {

        const data =
            await audiusRequest(
                '/tracks/search',
                {
                    query:
                        query.trim(),

                    limit:
                        Math.min(
                            Math.max(
                                Number(limit) || 5,
                                1
                            ),
                            10
                        )
                }
            );

        return {

            success: true,

            query:
                query.trim(),

            results:
                Array.isArray(data.data)
                    ? data.data
                    : []
        };

    } catch (error) {

        console.error(
            '❌ Audius search failed:',
            error.message
        );

        return {

            success: false,

            results: [],

            message:
                'Music search failed.'
        };
    }
}

// ============================================================
// GET TRACK
// ============================================================

async function getTrack(
    trackId
) {

    if (!trackId) {

        return {

            success: false,

            track: null,

            message:
                'No track ID provided.'
        };
    }

    try {

        const data =
            await audiusRequest(
                `/tracks/${encodeURIComponent(
                    trackId
                )}`
            );

        return {

            success: true,

            track:
                data.data || null
        };

    } catch (error) {

        console.error(
            '❌ Audius track lookup failed:',
            error.message
        );

        return {

            success: false,

            track: null,

            message:
                'Track lookup failed.'
        };
    }
}

// ============================================================
// STREAM URL FALLBACK
// ============================================================

function getStreamUrl(
    trackId
) {

    if (!trackId) {

        return null;
    }

    return (
        `${AUDIUS_API_URL}` +
        `/tracks/${encodeURIComponent(
            trackId
        )}/stream` +
        `?app_name=${encodeURIComponent(
            AUDIUS_APP_NAME
        )}`
    );
}

// ============================================================
// FIND BEST TRACK
// ============================================================

async function findTrack(
    query
) {

    const result =
        await searchTracks(
            query,
            5
        );

    if (
        !result.success ||
        !result.results.length
    ) {

        return {

            success: false,

            query,

            track: null,

            url: null,

            message:
                'No music found.'
        };
    }

    const track =
        result.results[0];

    if (!track?.id) {

        return {

            success: false,

            query,

            track: null,

            url: null,

            message:
                'Found track has no ID.'
        };
    }

    // ========================================================
    // USE AUDIUS SIGNED STREAM URL
    // ========================================================

    const streamUrl =
        track.stream?.url ||
        getStreamUrl(
            track.id
        );

    if (!streamUrl) {

        return {

            success: false,

            query,

            track,

            url: null,

            message:
                'Track has no stream URL.'
        };
    }

    return {

        success: true,

        query,

        track,

        url:
            streamUrl
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    audiusRequest,

    searchTracks,

    getTrack,

    getStreamUrl,

    findTrack
};