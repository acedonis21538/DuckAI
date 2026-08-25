// ============================================================
// DUCKAI GOOGLE SEARCH
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

async function search(query, options = {}) {

    if (!GOOGLE_API_KEY) {
        throw new Error(
            'GOOGLE_API_KEY is missing from .env'
        );
    }

    if (!GOOGLE_CSE_ID) {
        throw new Error(
            'GOOGLE_CSE_ID is missing from .env'
        );
    }

    if (
        typeof query !== 'string' ||
        !query.trim()
    ) {
        throw new Error(
            'Search query is empty.'
        );
    }

    const params = new URLSearchParams({
        key: GOOGLE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: query.trim(),
        num: String(
            Math.min(
                Math.max(
                    Number(options.num) || 5,
                    1
                ),
                10
            )
        ),
        safe: 'active'
    });

    if (options.language) {
        params.set(
            'lr',
            `lang_${options.language}`
        );
    }

    if (options.country) {
        params.set(
            'gl',
            options.country
        );
    }

    const response =
        await fetch(
            `${GOOGLE_SEARCH_URL}?${params}`
        );

    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `Google Search failed (${response.status}): ${errorText}`
        );
    }

    const data =
        await response.json();

    const results =
        (data.items || [])
            .map(item => ({
                title:
                    item.title || '',
                url:
                    item.link || '',
                description:
                    item.snippet || ''
            }))
            .filter(
                result =>
                    result.title &&
                    result.url
            );

    return {
        success: true,
        query:
            data.queries?.request?.[0]?.searchTerms ||
            query,
        results
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    search
};