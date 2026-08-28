'use strict';

// ============================================================
// DUCKAI — YOUTUBE PROVIDER
// ============================================================
//
// Responsibilities:
//
// • Search YouTube.
// • Return clean metadata.
// • Provide channel information for matching.
// • Prefer videos that can be played outside youtube.com.
// • Do NOT attempt to extract audio here.
//
// Playback/extraction should be handled by a separate layer.
//
// ============================================================

const API_KEY =
    process.env.YOUTUBE_API_KEY;

const priority =
    20;

// ============================================================
// SEARCH
// ============================================================

async function search(
    query
) {

    if (
        !API_KEY
    ) {

        console.warn(
            '⚠️ YouTube: YOUTUBE_API_KEY is missing.'
        );

        return [];
    }

    if (
        typeof query !== 'string' ||
        !query.trim()
    ) {

        return [];
    }

    try {

        const params =
            new URLSearchParams({

                part:
                    'snippet',

                q:
                    query.trim(),

                type:
                    'video',

                maxResults:
                    '10',

                order:
                    'relevance',

                regionCode:
                    'PT',

                videoEmbeddable:
                    'true',

                videoSyndicated:
                    'true',

                key:
                    API_KEY
            });

        const response =
            await fetch(
                `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
                {

                    method:
                        'GET',

                    headers: {

                        Accept:
                            'application/json'
                    }
                }
            );

        const rawText =
            await response.text();

        let data;

        try {

            data =
                JSON.parse(
                    rawText
                );

        } catch {

            data = null;
        }

        // ========================================================
        // API ERROR
        // ========================================================

        if (
            !response.ok
        ) {

            const reason =
                data?.error?.errors?.[0]?.reason ||
                'unknown';

            const message =
                data?.error?.message ||
                rawText ||
                `HTTP ${response.status}`;

            console.warn(
                '⚠️ YouTube API error:',
                JSON.stringify({

                    status:
                        response.status,

                    reason,

                    message
                })
            );

            return [];
        }

        const items =
            Array.isArray(
                data?.items
            )
                ? data.items
                : [];

        // ========================================================
        // RESULTS
        // ========================================================

        return items
            .filter(
                item =>
                    item?.id?.videoId
            )
            .map(
                item => {

                    const snippet =
                        item.snippet ||
                        {};

                    const channelTitle =
                        typeof snippet.channelTitle === 'string' &&
                        snippet.channelTitle.trim()
                            ? snippet.channelTitle.trim()
                            : 'Unknown artist';

                    const videoId =
                        item.id.videoId;

                    return {

                        success:
                            true,

                        source:
                            'youtube',

                        title:
                            snippet.title ||
                            query.trim(),

                        artist:
                            channelTitle,

                        url:
                            `https://www.youtube.com/watch?v=${videoId}`,

                        artwork:
                            snippet.thumbnails?.maxres?.url ||
                            snippet.thumbnails?.high?.url ||
                            snippet.thumbnails?.medium?.url ||
                            snippet.thumbnails?.default?.url ||
                            null,

                        id:
                            videoId,

                        channelId:
                            snippet.channelId ||
                            null,

                        channelTitle,

                        publishedAt:
                            snippet.publishedAt ||
                            null,

                        description:
                            snippet.description ||
                            null,

                        permalink:
                            `https://www.youtube.com/watch?v=${videoId}`,

                        // ------------------------------------------------
                        // This is a discovered YouTube video.
                        //
                        // It is NOT a direct audio URL.
                        //
                        // ------------------------------------------------

                        playable:
                            false,

                        playableThrough:
                            'youtube'
                    };
                }
            );

    } catch (error) {

        console.warn(
            '⚠️ YouTube provider failed:',
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
        'youtube',

    priority,

    search
};