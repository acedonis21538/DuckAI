'use strict';

// ============================================================
// DUCKAI — AUDIO.COM PROVIDER
// ============================================================

const ACCESS_TOKEN =
    process.env.AUDIOCOM_ACCESS_TOKEN;

const priority =
    20;

// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(
    url,
    options = {}
) {

    if (
        !ACCESS_TOKEN
    ) {

        throw new Error(
            'AUDIOCOM_ACCESS_TOKEN is missing.'
        );
    }

    const response =
        await fetch(
            url,
            {

                ...options,

                headers: {

                    ...(options.headers || {}),

                    Authorization:
                        `Bearer ${ACCESS_TOKEN}`,

                    Accept:
                        'application/json'
                }
            }
        );

    if (
        !response.ok
    ) {

        const text =
            await response
                .text()
                .catch(
                    () => ''
                );

        throw new Error(
            `Audio.com HTTP ${response.status} ${text}`
        );
    }

    return response.json();
}

// ============================================================
// SEARCH
// ============================================================
//
// Audio.com exposes full-text search through /v1/search.
// Exact response fields should be adjusted against the
// currently registered app's OpenAPI schema if necessary.
//
// ============================================================

async function search(
    query
) {

    if (
        !ACCESS_TOKEN ||
        typeof query !== 'string' ||
        !query.trim()
    ) {

        return [];
    }

    try {

        const params =
            new URLSearchParams({

                q:
                    query.trim()
            });

        const data =
            await apiRequest(
                `https://api.audio.com/v1/search?${params}`
            );

        const items =
            Array.isArray(data?.data)
                ? data.data
                : Array.isArray(data?.results)
                    ? data.results
                    : [];

        return items.map(
            item => {

                const audio =
                    item.audio ||
                    item;

                return {

                    success:
                        true,

                    source:
                        'audio.com',

                    title:
                        audio.title ||
                        item.title ||
                        query,

                    artist:
                        audio.author?.name ||
                        audio.author?.username ||
                        item.author?.name ||
                        item.author?.username ||
                        'Unknown artist',

                    url:
                        audio.stream_url ||
                        audio.streamUrl ||
                        item.stream_url ||
                        item.streamUrl ||
                        null,

                    artwork:
                        audio.cover_url ||
                        audio.coverUrl ||
                        item.cover_url ||
                        item.coverUrl ||
                        null,

                    id:
                        audio.id ||
                        item.id ||
                        null,

                    duration:
                        Number.isFinite(
                            audio.duration
                        )
                            ? audio.duration
                            : Number.isFinite(
                                item.duration
                            )
                                ? item.duration
                                : null,

                    genre:
                        audio.category ||
                        item.category ||
                        null,

                    description:
                        audio.description ||
                        item.description ||
                        null,

                    permalink:
                        audio.url ||
                        item.url ||
                        null,

                    playable:
                        Boolean(
                            audio.stream_url ||
                            audio.streamUrl ||
                            item.stream_url ||
                            item.streamUrl
                        )
                };
            }
        );

    } catch (error) {

        console.warn(
            '⚠️ Audio.com provider failed:',
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
        'audio.com',

    priority,

    search
};