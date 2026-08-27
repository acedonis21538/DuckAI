'use strict';

// ============================================================
// DUCKAI — AUDIUS PROVIDER
// ============================================================

const BASE_URL =
    'https://discoveryprovider.audius.co/v1';

const priority =
    25;

// ============================================================
// SEARCH
// ============================================================

async function search(
    query
) {

    if (
        typeof query !== 'string' ||
        !query.trim()
    ) {

        return [];
    }

    const url =
        `${BASE_URL}/tracks/search` +
        `?query=${encodeURIComponent(query.trim())}` +
        `&limit=10`;

    try {

        const response =
            await fetch(
                url,
                {
                    headers: {
                        'User-Agent':
                            'DuckAI/1.0',
                        'Accept':
                            'application/json'
                    }
                }
            );

        if (
            !response.ok
        ) {

            throw new Error(
                `Audius HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        const tracks =
            Array.isArray(data?.data)
                ? data.data
                : [];

        return tracks.map(
            track => ({

                success:
                    true,

                source:
                    'audius',

                title:
                    track.title ||
                    query,

                artist:
                    track.user?.name ||
                    'Unknown artist',

                url:
                    track.id
                        ? `${BASE_URL}/tracks/${track.id}/stream`
                        : null,

                artwork:
                    track.artwork?.['1000x1000'] ||
                    track.artwork?.['480x480'] ||
                    track.artwork?.['150x150'] ||
                    null,

                id:
                    track.id ||
                    null,

                duration:
                    Number.isFinite(
                        track.duration
                    )
                        ? track.duration
                        : null,

                genre:
                    track.genre ||
                    null,

                description:
                    track.description ||
                    null,

                permalink:
                    track.permalink ||
                    null,

                playable:
                    Boolean(
                        track.id
                    )
            })
        );

    } catch (error) {

        console.warn(
            '⚠️ Audius provider failed:',
            error.message
        );

        return [];
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    name:
        'audius',

    priority,

    search
};