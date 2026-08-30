'use strict';

// ============================================================
// DUCKAI — YOUTUBE MUSIC RESOLVER
// ============================================================
//
// Search → evaluate → rank → select
//
// YouTube is currently the only music provider.
//
// The resolver DOES NOT extract audio.
// youtubeStream.js handles audio extraction.
//
// ============================================================

const youtube =
    require('./youtube');

// ============================================================
// PROVIDER CONFIG
// ============================================================

const priority = 100;

// ============================================================
// VARIATIONS
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
// TEXT
// ============================================================

function normalizeText(value) {

    if (typeof value !== 'string') {
        return '';
    }

    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[()[\]{}"'“”‘’*]/g, ' ')
        .replace(/[-_/.,!?;:+|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

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
// SIMILARITY
// ============================================================

function tokenSimilarity(a, b) {

    const aTokens =
        tokenize(a);

    const bTokens =
        tokenize(b);

    if (
        !aTokens.length ||
        !bTokens.length
    ) {
        return 0;
    }

    const bSet =
        new Set(bTokens);

    let intersection = 0;

    for (const token of aTokens) {

        if (bSet.has(token)) {
            intersection++;
        }
    }

    return (
        (2 * intersection) /
        (aTokens.length + bTokens.length)
    );
}

function stringSimilarity(a, b) {

    const first =
        normalizeText(a);

    const second =
        normalizeText(b);

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

    return tokenSimilarity(
        first,
        second
    );
}

function tokenOverlap(a, b) {

    const aTokens =
        tokenize(a);

    const bSet =
        new Set(
            tokenize(b)
        );

    if (!aTokens.length) {
        return 0;
    }

    let matches = 0;

    for (const token of aTokens) {

        if (bSet.has(token)) {
            matches++;
        }
    }

    return (
        matches /
        aTokens.length
    );
}

// ============================================================
// VARIATION HANDLING
// ============================================================

function removeVariationTerms(value) {

    let text =
        normalizeText(value);

    for (const term of variationTerms) {

        const normalized =
            normalizeText(term);

        if (!normalized) {
            continue;
        }

        const escaped =
            normalized.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );

        text =
            text.replace(
                new RegExp(
                    `\\b${escaped}\\b`,
                    'gi'
                ),
                ' '
            );
    }

    return text
        .replace(/\s+/g, ' ')
        .trim();
}

function getVariationPenalty(
    resultText,
    queryText
) {

    const result =
        normalizeText(resultText);

    const query =
        normalizeText(queryText);

    let penalty = 0;

    for (const term of variationTerms) {

        const normalized =
            normalizeText(term);

        const escaped =
            normalized.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );

        const pattern =
            new RegExp(
                `\\b${escaped}\\b`,
                'i'
            );

        const resultHas =
            pattern.test(result);

        const queryHas =
            pattern.test(query);

        if (
            resultHas &&
            !queryHas
        ) {

            penalty +=
                strongVariationTerms.includes(
                    normalized
                )
                    ? 90
                    : 30;
        }
    }

    return penalty;
}

// ============================================================
// QUERY PARSER
// ============================================================

function parseQuery(query) {

    const normalized =
        normalizeText(query);

    let title =
        normalized;

    let artist =
        '';

    const byMatch =
        normalized.match(
            /^(.+?)\s+by\s+(.+)$/
        );

    if (byMatch) {

        title =
            byMatch[1].trim();

        artist =
            byMatch[2].trim();
    }

    if (!artist) {

        const dashMatch =
            normalized.match(
                /^(.+?)\s+-\s+(.+)$/
            );

        if (dashMatch) {

            artist =
                dashMatch[1].trim();

            title =
                dashMatch[2].trim();
        }
    }

    return {

        raw:
            query,

        normalized,

        title,

        artist,

        titleClean:
            removeVariationTerms(title),

        artistClean:
            removeVariationTerms(artist)
    };
}

// ============================================================
// CHANNEL QUALITY
// ============================================================

function getChannelBonus(
    result,
    requestedArtist
) {

    const channel =
        normalizeText(
            result.channelTitle ||
            result.artist ||
            ''
        );

    const artist =
        normalizeText(
            requestedArtist
        );

    let bonus = 0;

    if (
        artist &&
        channel
    ) {

        const similarity =
            stringSimilarity(
                artist,
                channel
            );

        if (similarity === 1) {
            bonus += 80;
        } else if (similarity >= 0.8) {
            bonus += 55;
        } else if (similarity >= 0.5) {
            bonus += 25;
        }
    }

    if (/\btopic\b/i.test(channel)) {
        bonus += 100;
    }

    if (/\bofficial\b/i.test(channel)) {
        bonus += 90;
    }

    if (/\bvevo\b/i.test(channel)) {
        bonus += 90;
    }

    if (/\brecords?\b/i.test(channel)) {
        bonus += 25;
    }

    if (
        /\bfan\b/i.test(channel) ||
        /\barchive\b/i.test(channel) ||
        /\buploads?\b/i.test(channel)
    ) {
        bonus -= 60;
    }

    return bonus;
}

// ============================================================
// POPULARITY
// ============================================================

function getPopularityBonus(result) {

    const views =
        Number(result.viewCount);

    if (
        !Number.isFinite(views) ||
        views <= 0
    ) {
        return 0;
    }

    const bonus =
        Math.log10(
            views + 1
        ) * 20;

    return Math.min(
        bonus,
        180
    );
}

// ============================================================
// DURATION
// ============================================================

function getDurationBonus(
    result,
    query
) {

    const duration =
        Number(result.duration);

    if (
        !Number.isFinite(duration) ||
        duration <= 0
    ) {
        return 0;
    }

    const requested =
        normalizeText(query);

    const explicitLong =
        /\blive\b|\bextended\b|\bmix\b/.test(
            requested
        );

    if (explicitLong) {
        return 0;
    }

    if (duration > 900) {
        return -100;
    }

    if (duration > 600) {
        return -50;
    }

    if (
        duration >= 90 &&
        duration <= 600
    ) {
        return 20;
    }

    return 0;
}

// ============================================================
// SCORE
// ============================================================

function scoreResult(
    query,
    parsedQuery,
    result
) {

    const resultTitle =
        normalizeText(
            result.title
        );

    const resultArtist =
        normalizeText(
            result.artist
        );

    const cleanResultTitle =
        removeVariationTerms(
            resultTitle
        );

    const cleanResultArtist =
        removeVariationTerms(
            resultArtist
        );

    let score = 0;

    // TITLE

    const titleSimilarity =
        stringSimilarity(
            parsedQuery.titleClean,
            cleanResultTitle
        );

    score +=
        titleSimilarity * 220;

    if (
        parsedQuery.titleClean &&
        cleanResultTitle ===
            parsedQuery.titleClean
    ) {
        score += 180;
    }

    score +=
        tokenOverlap(
            parsedQuery.titleClean,
            cleanResultTitle
        ) * 50;

    // ARTIST

    if (parsedQuery.artistClean) {

        const artistSimilarity =
            stringSimilarity(
                parsedQuery.artistClean,
                cleanResultArtist
            );

        score +=
            artistSimilarity * 220;

        if (
            cleanResultArtist ===
            parsedQuery.artistClean
        ) {
            score += 180;
        }
    }

    // CHANNEL

    score +=
        getChannelBonus(
            result,
            parsedQuery.artistClean
        );

    // POPULARITY

    score +=
        getPopularityBonus(
            result
        );

    // DURATION

    score +=
        getDurationBonus(
            result,
            query
        );

    // VARIATIONS

    score -=
        getVariationPenalty(
            `${result.title} ${result.artist}`,
            query
        );

    // METADATA

    if (result.artwork) {
        score += 5;
    }

    if (result.id) {
        score += 5;
    }

    return score;
}

// ============================================================
// NORMALIZE RESULT
// ============================================================

function normalizeResult(result) {

    if (
        !result ||
        typeof result !== 'object'
    ) {
        return null;
    }

    if (
        typeof result.title !== 'string' ||
        !result.title.trim()
    ) {
        return null;
    }

    return {

        success:
            result.success !== false,

        source:
            'youtube',

        title:
            result.title.trim(),

        artist:
            typeof result.artist === 'string' &&
            result.artist.trim()
                ? result.artist.trim()
                : 'Unknown artist',

        url:
            result.url ||
            null,

        permalink:
            result.permalink ||
            result.url ||
            null,

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
            Number.isFinite(
                Number(result.duration)
            )
                ? Number(result.duration)
                : null,

        views:
            Number.isFinite(
                Number(result.viewCount)
            )
                ? Number(result.viewCount)
                : 0,

        viewCount:
            Number.isFinite(
                Number(result.viewCount)
            )
                ? Number(result.viewCount)
                : 0,

        description:
            result.description ||
            null,

        uploadDate:
            result.uploadDate ||
            null,

        live:
            Boolean(result.live),

        playable:
            false,

        playableThrough:
            'youtube',

        score:
            0
    };
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

            success:
                false,

            message:
                '🎵 Tell me which song you want to play.'
        };
    }

    const parsed =
        parseQuery(
            query.trim().slice(0, 200)
        );

    console.log(
        `🔎 YouTube resolver searching: "${parsed.raw}"`
    );

    let rawResults;

    try {

        rawResults =
            await youtube.search(
                parsed.raw
            );

    } catch (error) {

        console.warn(
            '⚠️ YouTube resolver search failed:',
            error.message
        );

        return {

            success:
                false,

            message:
                '🦆 I could not search YouTube right now.'
        };
    }

    const results =
        (
            Array.isArray(rawResults)
                ? rawResults
                : []
        )
            .map(normalizeResult)
            .filter(
                result =>
                    result &&
                    result.success &&
                    result.url &&
                    !result.live
            );

    if (!results.length) {

        return {

            success:
                false,

            message:
                `🦆 I couldn't find **${parsed.raw}**.`
        };
    }

    // SCORE

    for (const result of results) {

        result.score =
            scoreResult(
                parsed.raw,
                parsed,
                result
            );
    }

    // SORT

    results.sort(
        (a, b) =>
            b.score -
            a.score
    );

    const best =
        results[0];

    console.log(
        `🎯 Best match: ${best.title} — ${best.artist}`
    );

    console.log(
        `📺 Channel: ${
            best.channelTitle ||
            best.artist
        }`
    );

    console.log(
        `👁️ Views: ${best.viewCount.toLocaleString()}`
    );

    console.log(
        `📊 Score: ${best.score.toFixed(2)}`
    );

    return {

        success:
            true,

        source:
            'youtube',

        title:
            best.title,

        artist:
            best.artist,

        url:
            best.url,

        permalink:
            best.permalink,

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

        views:
            best.viewCount,

        viewCount:
            best.viewCount,

        description:
            best.description,

        uploadDate:
            best.uploadDate,

        playable:
            false,

        score:
            best.score,

        candidates:
            results
    };
}

// ============================================================
// PROVIDERS
// ============================================================

function getProviders() {

    return [

        {

            name:
                'youtube',

            priority
        }
    ];
}

function getProviderStatus() {

    return [

        {

            name:
                'youtube',

            available:
                true,

            priority
        }
    ];
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    search,

    getProviders,

    getProviderStatus
};