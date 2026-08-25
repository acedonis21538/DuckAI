// ============================================================
// DUCKAI IMAGE SEARCH
// ============================================================

require('dotenv').config();

const GOOGLE_API_KEY =
    process.env.GOOGLE_API_KEY;

const GOOGLE_CSE_ID =
    process.env.GOOGLE_CSE_ID;

const GOOGLE_SEARCH_URL =
    'https://customsearch.googleapis.com/customsearch/v1';

// ============================================================
// SEARCH
// ============================================================

async function search(data = {}) {

    const query =
        typeof data.query === 'string'
            ? data.query.trim()
            : '';

    if (!query) {

        return {
            success: false,
            message:
                'No image search query provided.',
            images: []
        };
    }

    if (!GOOGLE_API_KEY) {

        return {
            success: false,
            message:
                'GOOGLE_API_KEY is missing from .env',
            images: []
        };
    }

    if (!GOOGLE_CSE_ID) {

        return {
            success: false,
            message:
                'GOOGLE_CSE_ID is missing from .env',
            images: []
        };
    }

    const amount =
        Math.min(
            Math.max(
                Number(data.limit) || 5,
                1
            ),
            10
        );

    const params =
        new URLSearchParams({

            key:
                GOOGLE_API_KEY,

            cx:
                GOOGLE_CSE_ID,

            q:
                query,

            searchType:
                'image',

            num:
                String(amount),

            safe:
                'active'
        });

    try {

        const response =
            await fetch(
                `${GOOGLE_SEARCH_URL}?${params}`
            );

        if (!response.ok) {

            const errorText =
                await response.text();

            console.error(
                '❌ Google image search failed:',
                response.status,
                errorText
            );

            return {
                success: false,
                message:
                    'Google image search failed.',
                images: []
            };
        }

        const result =
            await response.json();

        const images =
            (result.items || [])
                .map(item => ({

                    title:
                        item.title || '',

                    url:
                        item.link || '',

                    thumbnail:
                        item.image?.thumbnailLink || '',

                    context:
                        item.image?.contextLink || '',

                    width:
                        item.image?.width || null,

                    height:
                        item.image?.height || null
                }))
                .filter(
                    image =>
                        image.url
                );

        return {

            success: true,

            query,

            images
        };

    } catch (error) {

        console.error(
            '❌ Image search error:',
            error
        );

        return {

            success: false,

            message:
                'Image search failed.',

            images: []
        };
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    search
};