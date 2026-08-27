'use strict';

const API_KEY =
    process.env.YOUTUBE_API_KEY;

const priority =
    10;

async function search(
    query
) {

    if (
        !API_KEY ||
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
                    'PT'
            });

        const response =
            await fetch(
                `https://www.googleapis.com/youtube/v3/search?${params}`,
                {

                    headers: {

                        Accept:
                            'application/json'
                    }
                }
            );

        if (
            !response.ok
        ) {

            throw new Error(
                `YouTube API HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        const items =
            Array.isArray(
                data?.items
            )
                ? data.items
                : [];

        return items
            .filter(
                item =>
                    item?.id?.videoId
            )
            .map(
                item => ({

                    success:
                        true,

                    source:
                        'youtube',

                    title:
                        item.snippet?.title ||
                        query,

                    artist:
                        item.snippet?.channelTitle ||
                        'Unknown artist',

                    url:
                        null,

                    artwork:
                        item.snippet?.thumbnails?.high?.url ||
                        item.snippet?.thumbnails?.medium?.url ||
                        item.snippet?.thumbnails?.default?.url ||
                        null,

                    id:
                        item.id.videoId,

                    duration:
                        null,

                    genre:
                        null,

                    description:
                        item.snippet?.description ||
                        null,

                    permalink:
                        `https://www.youtube.com/watch?v=${item.id.videoId}`,

                    playable:
                        false
                })
            );

    } catch (error) {

        console.warn(
            '⚠️ YouTube provider failed:',
            error.message
        );

        return [];
    }
}

module.exports = {

    name:
        'youtube',

    priority,

    search
};