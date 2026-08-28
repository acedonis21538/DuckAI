'use strict';

// ============================================================
// DUCKAI — MUSIC SOURCE RESOLVER
// ============================================================
//
// Sources:
// • YouTube
// • Audius
//
// Responsibilities:
// • Search all active providers.
// • Normalize results.
// • Parse title + artist.
// • Compare title + artist.
// • Detect alternate versions.
// • Evaluate YouTube channel quality.
// • Select the most accurate result.
//
// IMPORTANT:
// • A YouTube video URL is NOT a direct audio stream.
// • YouTube results are intended for Web Player playback.
// • Audius can provide a direct playable audio URL.
//
// ============================================================

// ============================================================
// PROVIDERS
// ============================================================

const providers = [];

function loadProvider(name, providerPath, priority) {
    try {
        const provider = require(providerPath);

        if (!provider || typeof provider.search !== 'function') {
            console.warn(
                `⚠️ Provider "${name}" does not export search().`
            );
            return;
        }

        providers.push({
            name,
            search: provider.search,
            priority: Number.isFinite(priority) ? priority : 0
        });

        console.log(`✅ Music provider loaded: ${name}`);
    } catch (error) {
        console.warn(
            `⚠️ Provider "${name}" unavailable:`,
            error.message
        );
    }
}

// ============================================================
// ACTIVE SOURCES
// ============================================================

loadProvider('youtube', './youtube', 20);
loadProvider('audius', './audius', 15);

// ============================================================
// VARIATION TERMS
// ============================================================

const variationTerms = [
    'remix',
    'rmx',
    'live',
    'live version',
    'live performance',
    'cover',
    'cover version',
    'karaoke',
    'instrumental',
    'instrumental version',
    'sped up',
    'sped-up',
    'speed up',
    'slowed',
    'slowed down',
    'slowed reverb',
    'slowed + reverb',
    'nightcore',
    '8d',
    '8d audio',
    'radio edit',
    'edit',
    'extended',
    'extended mix',
    'acoustic',
    'acoustic version',
    'piano version',
    'orchestral',
    'bootleg',
    'mashup',
    'fanmade',
    'fan made',
    'reverb',
    'mix'
];

const strongVariationTerms = [
    'remix',
    'live',
    'cover',
    'karaoke',
    'instrumental',
    'sped up',
    'sped-up',
    'slowed',
    'nightcore',
    '8d',
    'mashup',
    'acoustic'
];

// ============================================================
// TEXT NORMALIZATION
// ============================================================

function normalizeText(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[\[\](){}"'“”‘’]/g, ' ')
        .replace(/[-_/.,!?;:+|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================================
// TOKENIZE
// ============================================================

function tokenize(value) {
    return [
        ...new Set(
            normalizeText(value)
                .split(' ')
                .filter(Boolean)
        )
    ];
}

// ============================================================
// ESCAPE REGEXP
// ============================================================

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// REMOVE VARIATION TERMS
// ============================================================

function removeVariationTerms(value) {
    let text = normalizeText(value);

    for (const term of variationTerms) {
        const normalizedTerm = normalizeText(term);

        if (!normalizedTerm) {
            continue;
        }

        const pattern = new RegExp(
            `\\b${escapeRegExp(normalizedTerm)}\\b`,
            'gi'
        );

        text = text.replace(pattern, ' ');
    }

    return text
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================================
// QUERY PARSER
// ============================================================
//
// Supported:
//
// After Dark
// After Dark by Mr.Kitty
// Mr.Kitty - After Dark
//
// ============================================================

function parseQuery(query) {
    const normalized = normalizeText(query);

    let title = normalized;
    let artist = '';

    // --------------------------------------------------------
    // "song by artist"
    // --------------------------------------------------------

    const byMatch = normalized.match(
        /^(.+?)\s+by\s+(.+)$/
    );

    if (byMatch) {
        title = byMatch[1].trim();
        artist = byMatch[2].trim();
    }

    // --------------------------------------------------------
    // "artist - song"
    // --------------------------------------------------------

    if (!artist) {
        const dashMatch = normalized.match(
            /^(.+?)\s+-\s+(.+)$/
        );

        if (dashMatch) {
            artist = dashMatch[1].trim();
            title = dashMatch[2].trim();
        }
    }

    return {
        raw: query,
        normalized,
        title,
        artist,
        titleClean: removeVariationTerms(title),
        artistClean: removeVariationTerms(artist)
    };
}

// ============================================================
// TOKEN SIMILARITY
// ============================================================

function symmetricTokenSimilarity(a, b) {
    const aTokens = tokenize(a);
    const bTokens = tokenize(b);

    if (!aTokens.length || !bTokens.length) {
        return 0;
    }

    const aSet = new Set(aTokens);
    const bSet = new Set(bTokens);

    let intersection = 0;

    for (const token of aSet) {
        if (bSet.has(token)) {
            intersection++;
        }
    }

    return (
        (2 * intersection) /
        (aSet.size + bSet.size)
    );
}

// ============================================================
// STRING SIMILARITY
// ============================================================

function stringSimilarity(a, b) {
    const first = normalizeText(a);
    const second = normalizeText(b);

    if (!first || !second) {
        return 0;
    }

    if (first === second) {
        return 1;
    }

    if (
        first.includes(second) ||
        second.includes(first)
    ) {
        return 0.85;
    }

    return symmetricTokenSimilarity(first, second);
}

// ============================================================
// TOKEN OVERLAP
// ============================================================

function tokenOverlap(a, b) {
    const aTokens = tokenize(a);
    const bSet = new Set(tokenize(b));

    if (!aTokens.length) {
        return 0;
    }

    let matches = 0;

    for (const token of aTokens) {
        if (bSet.has(token)) {
            matches++;
        }
    }

    return matches / aTokens.length;
}

// ============================================================
// VARIATION PENALTY
// ============================================================

function getVariationPenalty(resultText, queryText) {
    const normalizedResult = normalizeText(resultText);
    const normalizedQuery = normalizeText(queryText);

    let penalty = 0;

    for (const term of variationTerms) {
        const normalizedTerm = normalizeText(term);

        if (!normalizedTerm) {
            continue;
        }

        const pattern = new RegExp(
            `\\b${escapeRegExp(normalizedTerm)}\\b`,
            'i'
        );

        const resultHas = pattern.test(normalizedResult);
        const queryHas = pattern.test(normalizedQuery);

        // The user explicitly requested the variation.
        // Therefore do not penalize it.

        if (resultHas && !queryHas) {
            penalty += strongVariationTerms.includes(normalizedTerm)
                ? 50
                : 20;
        }
    }

    return penalty;
}

// ============================================================
// YOUTUBE CHANNEL QUALITY
// ============================================================

function getYouTubeChannelBonus(result, requestedArtist) {
    if (result.source !== 'youtube') {
        return 0;
    }

    const channel = normalizeText(
        result.channelTitle ||
        result.artist ||
        ''
    );

    const artist = normalizeText(requestedArtist);

    let bonus = 0;

    // --------------------------------------------------------
    // Artist / channel similarity
    // --------------------------------------------------------

    if (artist && channel) {
        const similarity = stringSimilarity(
            artist,
            channel
        );

        if (similarity === 1) {
            bonus += 60;
        } else if (similarity >= 0.8) {
            bonus += 40;
        } else if (similarity >= 0.5) {
            bonus += 20;
        }
    }

    // --------------------------------------------------------
    // Official signals
    // --------------------------------------------------------

    if (/\btopic\b/i.test(channel)) {
        bonus += 70;
    }

    if (/\bofficial\b/i.test(channel)) {
        bonus += 60;
    }

    if (/\bvevo\b/i.test(channel)) {
        bonus += 60;
    }

    // --------------------------------------------------------
    // Suspicious upload channels
    // --------------------------------------------------------

    if (
        /\bfan\b/i.test(channel) ||
        /\barchive\b/i.test(channel) ||
        /\buploads?\b/i.test(channel)
    ) {
        bonus -= 25;
    }

    return bonus;
}

// ============================================================
// NORMALIZE RESULT
// ============================================================

function normalizeResult(provider, result) {
    if (!result || typeof result !== 'object') {
        return null;
    }

    const title =
        typeof result.title === 'string'
            ? result.title.trim()
            : '';

    if (!title) {
        return null;
    }

    const artist =
        typeof result.artist === 'string' &&
        result.artist.trim()
            ? result.artist.trim()
            : 'Unknown artist';

    const url =
        typeof result.url === 'string' &&
        result.url.trim()
            ? result.url.trim()
            : null;

    const source =
        result.source ||
        provider.name;

    return {
        success: result.success !== false,

        source,

        title,

        artist,

        url,

        artwork:
            result.artwork ||
            null,

        id:
            result.id ||
            null,

        channelId:
            result.channelId ||
            null,

        channelTitle:
            result.channelTitle ||
            null,

        duration:
            Number.isFinite(result.duration)
                ? result.duration
                : null,

        genre:
            result.genre ||
            null,

        description:
            result.description ||
            null,

        permalink:
            result.permalink ||
            null,

        // IMPORTANT:
        //
        // A URL alone does NOT mean that the result is playable.
        //
        // YouTube:
        //   url = webpage
        //   playable = false
        //
        // Audius:
        //   url = direct audio stream
        //   playable = true

        playable:
            result.playable === true,

        _provider:
            provider.name,

        _providerPriority:
            provider.priority,

        _score:
            0
    };
}

// ============================================================
// PROVIDER SEARCH
// ============================================================

async function searchProvider(provider, query) {
    try {
        const raw = await provider.search(query);

        const items =
            Array.isArray(raw)
                ? raw
                : raw
                    ? [raw]
                    : [];

        return items
            .map(item =>
                normalizeResult(
                    provider,
                    item
                )
            )
            .filter(Boolean);
    } catch (error) {
        console.warn(
            `⚠️ ${provider.name} search failed:`,
            error.message
        );

        return [];
    }
}

// ============================================================
// SCORE RESULT
// ============================================================

function scoreResult(query, parsedQuery, result) {
    const resultTitle = normalizeText(result.title);
    const resultArtist = normalizeText(result.artist);

    const cleanResultTitle =
        removeVariationTerms(resultTitle);

    const cleanResultArtist =
        removeVariationTerms(resultArtist);

    let score = 0;

    // ========================================================
    // TITLE
    // ========================================================

    const titleSimilarity =
        stringSimilarity(
            parsedQuery.titleClean,
            cleanResultTitle
        );

    score += titleSimilarity * 180;

    if (
        parsedQuery.titleClean &&
        cleanResultTitle === parsedQuery.titleClean
    ) {
        score += 120;
    }

    score +=
        tokenOverlap(
            parsedQuery.titleClean,
            cleanResultTitle
        ) * 40;

    // ========================================================
    // ARTIST
    // ========================================================

    if (parsedQuery.artistClean) {
        const artistSimilarity =
            stringSimilarity(
                parsedQuery.artistClean,
                cleanResultArtist
            );

        score += artistSimilarity * 170;

        if (
            cleanResultArtist ===
            parsedQuery.artistClean
        ) {
            score += 130;
        }
    }

    // ========================================================
    // YOUTUBE CHANNEL
    // ========================================================

    score += getYouTubeChannelBonus(
        result,
        parsedQuery.artistClean
    );

    // ========================================================
    // PLAYABILITY
    // ========================================================

    //
    // Small bonus only.
    //
    // It must NOT overpower a clearly superior YouTube match.
    //

    if (result.playable) {
        score += 30;
    }

    // ========================================================
    // PROVIDER PRIORITY
    // ========================================================

    score += result._providerPriority;

    // ========================================================
    // VARIATIONS
    // ========================================================

    score -= getVariationPenalty(
        `${result.title} ${result.artist}`,
        query
    );

    // ========================================================
    // METADATA
    // ========================================================

    if (result.artwork) {
        score += 5;
    }

    if (result.id) {
        score += 3;
    }

    return score;
}

// ============================================================
// SEARCH
// ============================================================

async function search(query) {
    if (
        typeof query !== 'string' ||
        !query.trim()
    ) {
        return {
            success: false,
            message:
                '🎵 Tell me which song you want to play.'
        };
    }

    if (!providers.length) {
        return {
            success: false,
            message:
                '🦆 No music providers are currently available.'
        };
    }

    const cleanQuery =
        query
            .trim()
            .slice(0, 200);

    const parsedQuery =
        parseQuery(cleanQuery);

    console.log(
        `🔎 Music resolver searching: "${cleanQuery}"`
    );

    // ========================================================
    // SEARCH ALL PROVIDERS
    // ========================================================

    const batches =
        await Promise.all(
            providers.map(provider =>
                searchProvider(
                    provider,
                    cleanQuery
                )
            )
        );

    const allResults =
        batches
            .flat()
            .filter(
                result =>
                    result &&
                    result.success
            );

    if (!allResults.length) {
        return {
            success: false,
            message:
                `🦆 I couldn't find **${cleanQuery}**.`
        };
    }

    // ========================================================
    // SCORE
    // ========================================================

    for (const result of allResults) {
        result._score =
            scoreResult(
                cleanQuery,
                parsedQuery,
                result
            );
    }

    // ========================================================
    // SORT
    // ========================================================

    allResults.sort((a, b) => {
        if (b._score !== a._score) {
            return b._score - a._score;
        }

        return (
            b._providerPriority -
            a._providerPriority
        );
    });

    const best = allResults[0];

    // ========================================================
    // DEBUG
    // ========================================================

    console.log(
        `🎯 Best match: ${best.title} — ${best.artist}`
    );

    console.log(
        `📡 Source: ${best.source}`
    );

    console.log(
        `📊 Score: ${best._score.toFixed(2)}`
    );

    console.log(
        `🔊 Playable: ${best.playable ? 'yes' : 'no'}`
    );

    if (best.source === 'youtube') {
        console.log(
            `📺 Channel: ${best.channelTitle || best.artist}`
        );
    }

    // ========================================================
    // RETURN
    // ========================================================

    return {
        success: true,

        source:
            best.source,

        title:
            best.title,

        artist:
            best.artist,

        url:
            best.url,

        artwork:
            best.artwork,

        id:
            best.id,

        channelId:
            best.channelId,

        channelTitle:
            best.channelTitle,

        duration:
            best.duration,

        genre:
            best.genre,

        description:
            best.description,

        permalink:
            best.permalink,

        playable:
            best.playable
    };
}

// ============================================================
// PLAYABLE SEARCH
// ============================================================
//
// This function is intentionally limited to results that
// actually expose a direct playable stream.
//
// For normal music selection use search().
//
// ============================================================

async function searchPlayable(query) {
    const result = await search(query);

    if (!result?.success) {
        return result;
    }

    if (
        !result.playable ||
        !result.url
    ) {
        return {
            success: false,
            message:
                `🦆 I found **${result.title}**, but no direct playable audio source is available.`
        };
    }

    return result;
}

// ============================================================
// PROVIDER INFORMATION
// ============================================================

function getProviders() {
    return providers.map(provider => ({
        name:
            provider.name,

        priority:
            provider.priority
    }));
}

function getProviderStatus() {
    return providers.map(provider => ({
        name:
            provider.name,

        available:
            true,

        priority:
            provider.priority
    }));
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    search,
    searchPlayable,
    getProviders,
    getProviderStatus
};