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
        results: []
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
            Array.isArray(
                data.data
            )
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

        results: []
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

        track: null
    };
}

try {

    const data =
        await audiusRequest(
            `/tracks/${encodeURIComponent(trackId)}`
        );

    return {

        success: true,

        track:
            data.data ||
            null
    };

} catch (error) {

    console.error(
        '❌ Audius track lookup failed:',
        error.message
    );

    return {

        success: false,

        track: null
    };
}

}

// ============================================================
// STREAM URL
// ============================================================

function getStreamUrl(
trackId
) {

if (!trackId) {
    return null;
}

return (
    `${AUDIUS_API_URL}` +
    `/tracks/${encodeURIComponent(trackId)}/stream` +
    `?app_name=${encodeURIComponent(
        AUDIUS_APP_NAME
    )}`
);

}

// ============================================================
// NORMALIZE TEXT
// ============================================================

function normalizeText(
text
) {

return String(
    text || ''
)
    .toLowerCase()
    .normalize('NFD')
    .replace(
        /[\u0300-\u036f]/g,
        ''
    )
    .replace(
        /[^a-z0-9\s]/g,
        ' '
    )
    .replace(
        /\s+/g,
        ' '
    )
    .trim();

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
        10
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

const search =
    normalizeText(
        query
    );

let requestedTitle =
    search;

let requestedArtist =
    '';

const byMatch =
    search.match(
        /^(.+?)\s+by\s+(.+)$/
    );

if (byMatch) {

    requestedTitle =
        byMatch[1].trim();

    requestedArtist =
        byMatch[2].trim();
}

const scored =
    result.results
        .filter(
            track =>
                track?.id
        )
        .map(
            track => {

                const title =
                    normalizeText(
                        track.title
                    );

                const artist =
                    normalizeText(
                        track.user?.name
                    );

                let score = 0;

                // =================================================
                // EXACT TITLE
                // =================================================

                if (
                    title ===
                    requestedTitle
                ) {

                    score += 100;
                }

                // =================================================
                // TITLE CONTAINS REQUEST
                // =================================================

                if (
                    title.includes(
                        requestedTitle
                    )
                ) {

                    score += 60;
                }

                // =================================================
                // ARTIST MATCH
                // =================================================

                if (
                    requestedArtist
                ) {

                    if (
                        artist ===
                        requestedArtist
                    ) {

                        score += 150;

                    } else if (
                        artist.includes(
                            requestedArtist
                        )
                    ) {

                        score += 100;
                    }

                    if (
                        title.includes(
                            requestedArtist
                        )
                    ) {

                        score += 80;
                    }
                }

                // =================================================
                // WORD MATCHING
                // =================================================

                const words =
                    requestedTitle
                        .split(' ')
                        .filter(
                            Boolean
                        );

                for (
                    const word
                    of words
                ) {

                    if (
                        title.includes(
                            word
                        )
                    ) {

                        score += 10;
                    }
                }

                return {

                    track,

                    score
                };
            }
        )
        .sort(
            (
                a,
                b
            ) =>
                b.score -
                a.score
        );

const best =
    scored[0];

if (
    !best ||
    !best.track
) {

    return {

        success: false,

        query,

        track: null,

        url: null,

        message:
            'No suitable music found.'
    };
}

const track =
    best.track;

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

console.log(
    '🎵 MUSIC MATCH:',
    JSON.stringify({
        query,
        requestedTitle,
        requestedArtist,
        title:
            track.title,
        artist:
            track.user?.name,
        score:
            best.score
    })
);

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
