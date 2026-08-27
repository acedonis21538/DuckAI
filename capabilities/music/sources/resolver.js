'use strict';

// ============================================================
// DUCKAI — MUSIC SOURCE RESOLVER
// ============================================================
//
// Sources:
//
// • Audio.com
// • Audius
// • YouTube
//
// Responsibilities:
//
// • Search all available sources.
// • Normalize results.
// • Compare title + artist.
// • Penalize alternate versions.
// • Prefer playable results.
// • Return the most faithful usable result.
//
// This file does NOT:
//
// • Join Voice
// • Create an AudioPlayer
// • Start FFmpeg
// • Send Discord messages
//
// ============================================================

// ============================================================
// PROVIDERS
// ============================================================

const providers = [];

function loadProvider(
    name,
    path,
    priority
) {

    try {

        const provider =
            require(path);

        if (
            !provider ||
            typeof provider.search !== 'function'
        ) {

            console.warn(
                `⚠️ Provider "${name}" does not export search().`
            );

            return;
        }

        providers.push({

            name,

            search:
                provider.search,

            priority:
                Number.isFinite(
                    priority
                )
                    ? priority
                    : 0
        });

        console.log(
            `✅ Music provider loaded: ${name}`
        );

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
//
// Higher priority means a small preference when results are
// otherwise similarly accurate.
//
// Playable sources:
//
// Audio.com
// Audius
//
// Discovery:
//
// YouTube
//
// ============================================================

loadProvider(
    'audio.com',
    './audio',
    30
);

loadProvider(
    'audius',
    './audius',
    25
);

loadProvider(
    'youtube',
    './youtube',
    10
);

// ============================================================
// VARIATION TERMS
// ============================================================
//
// These usually mean that a result is a different version of
// the requested song.
//
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

function normalizeText(
    value
) {

    if (
        typeof value !== 'string'
    ) {

        return '';
    }

    return value
        .normalize('NFKD')
        .replace(
            /[\u0300-\u036f]/g,
            ''
        )
        .toLowerCase()
        .replace(
            /&/g,
            ' and '
        )
        .replace(
            /[()[\]{}"'“”‘’]/g,
            ' '
        )
        .replace(
            /[-_/.,!?;:+|]/g,
            ' '
        )
        .replace(
            /\s+/g,
            ' '
        )
        .trim();
}

// ============================================================
// TOKENIZE
// ============================================================

function tokenize(
    value
) {

    return [
        ...new Set(
            normalizeText(
                value
            )
                .split(' ')
                .filter(Boolean)
        )
    ];
}

// ============================================================
// ESCAPE REGEXP
// ============================================================

function escapeRegExp(
    value
) {

    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
    );
}

// ============================================================
// REMOVE VARIATION TERMS
// ============================================================

function removeVariationTerms(
    value
) {

    let text =
        normalizeText(
            value
        );

    for (
        const term
        of variationTerms
    ) {

        const normalizedTerm =
            normalizeText(
                term
            );

        if (
            !normalizedTerm
        ) {

            continue;
        }

        text =
            text.replace(
                new RegExp(
                    `\\b${escapeRegExp(normalizedTerm)}\\b`,
                    'gi'
                ),
                ' '
            );
    }

    return text
        .replace(
            /\s+/g,
            ' '
        )
        .trim();
}

// ============================================================
// PARSE QUERY
// ============================================================
//
// Supports:
//
// After Dark
// After Dark by Mr.Kitty
// Mr.Kitty - After Dark
//
// ============================================================

function parseQuery(
    query
) {

    const normalized =
        normalizeText(
            query
        );

    let title =
        normalized;

    let artist =
        '';

    // --------------------------------------------------------
    // "song by artist"
    // --------------------------------------------------------

    const byMatch =
        normalized.match(
            /^(.+?)\s+by\s+(.+)$/
        );

    if (
        byMatch
    ) {

        title =
            byMatch[1].trim();

        artist =
            byMatch[2].trim();
    }

    // --------------------------------------------------------
    // "artist - song"
    // --------------------------------------------------------

    if (
        !artist
    ) {

        const dashMatch =
            normalized.match(
                /^(.+?)\s+-\s+(.+)$/
            );

        if (
            dashMatch
        ) {

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
            removeVariationTerms(
                title
            ),

        artistClean:
            removeVariationTerms(
                artist
            )
    };
}

// ============================================================
// TOKEN SIMILARITY
// ============================================================

function symmetricTokenSimilarity(
    a,
    b
) {

    const aTokens =
        tokenize(
            a
        );

    const bTokens =
        tokenize(
            b
        );

    if (
        !aTokens.length ||
        !bTokens.length
    ) {

        return 0;
    }

    const aSet =
        new Set(
            aTokens
        );

    const bSet =
        new Set(
            bTokens
        );

    let intersection =
        0;

    for (
        const token
        of aSet
    ) {

        if (
            bSet.has(
                token
            )
        ) {

            intersection++;
        }
    }

    return (
        (2 * intersection) /
        (
            aSet.size +
            bSet.size
        )
    );
}

// ============================================================
// STRING SIMILARITY
// ============================================================

function stringSimilarity(
    a,
    b
) {

    const first =
        normalizeText(
            a
        );

    const second =
        normalizeText(
            b
        );

    if (
        !first ||
        !second
    ) {

        return 0;
    }

    if (
        first === second
    ) {

        return 1;
    }

    if (
        first.includes(second) ||
        second.includes(first)
    ) {

        return 0.85;
    }

    return symmetricTokenSimilarity(
        first,
        second
    );
}

// ============================================================
// TOKEN OVERLAP
// ============================================================

function tokenOverlap(
    a,
    b
) {

    const aTokens =
        tokenize(
            a
        );

    const bSet =
        new Set(
            tokenize(
                b
            )
        );

    if (
        !aTokens.length
    ) {

        return 0;
    }

    let matches =
        0;

    for (
        const token
        of aTokens
    ) {

        if (
            bSet.has(
                token
            )
        ) {

            matches++;
        }
    }

    return (
        matches /
        aTokens.length
    );
}

// ============================================================
// VARIATION PENALTY
// ============================================================

function getVariationPenalty(
    resultText,
    queryText
) {

    const normalizedResult =
        normalizeText(
            resultText
        );

    const normalizedQuery =
        normalizeText(
            queryText
        );

    let penalty =
        0;

    for (
        const term
        of variationTerms
    ) {

        const normalizedTerm =
            normalizeText(
                term
            );

        if (
            !normalizedTerm
        ) {

            continue;
        }

        const pattern =
            new RegExp(
                `\\b${escapeRegExp(normalizedTerm)}\\b`,
                'i'
            );

        const resultHas =
            pattern.test(
                normalizedResult
            );

        const queryHas =
            pattern.test(
                normalizedQuery
            );

        // User explicitly asked for the variation:
        // do not punish it.

        if (
            resultHas &&
            !queryHas
        ) {

            penalty +=
                strongVariationTerms.includes(
                    normalizedTerm
                )
                    ? 50
                    : 20;
        }
    }

    return penalty;
}

// ============================================================
// DURATION SCORE
// ============================================================

function durationScore(
    queryDuration,
    resultDuration
) {

    if (
        !Number.isFinite(
            queryDuration
        ) ||
        !Number.isFinite(
            resultDuration
        )
    ) {

        return 0;
    }

    if (
        queryDuration <= 0 ||
        resultDuration <= 0
    ) {

        return 0;
    }

    const difference =
        Math.abs(
            queryDuration -
            resultDuration
        );

    if (
        difference <= 2
    ) {

        return 30;
    }

    if (
        difference <= 5
    ) {

        return 24;
    }

    if (
        difference <= 10
    ) {

        return 16;
    }

    if (
        difference <= 20
    ) {

        return 8;
    }

    if (
        difference <= 40
    ) {

        return 0;
    }

    return -12;
}

// ============================================================
// NORMALIZE RESULT
// ============================================================

function normalizeResult(
    provider,
    result
) {

    if (
        !result ||
        typeof result !== 'object'
    ) {

        return null;
    }

    const title =
        typeof result.title === 'string'
            ? result.title.trim()
            : '';

    if (
        !title
    ) {

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

    return {

        success:
            result.success !== false,

        source:
            result.source ||
            provider.name,

        title,

        artist,

        url,

        artwork:
            result.artwork ||
            null,

        id:
            result.id ||
            null,

        duration:
            Number.isFinite(
                result.duration
            )
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

        playable:
            Boolean(
                result.playable ||
                url
            ),

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

async function searchProvider(
    provider,
    query
) {

    try {

        const raw =
            await provider.search(
                query
            );

        // ----------------------------------------------------
        // Single result
        // ----------------------------------------------------

        if (
            raw &&
            typeof raw === 'object' &&
            !Array.isArray(raw)
        ) {

            const normalized =
                normalizeResult(
                    provider,
                    raw
                );

            return normalized
                ? [normalized]
                : [];
        }

        // ----------------------------------------------------
        // Multiple results
        // ----------------------------------------------------

        if (
            Array.isArray(raw)
        ) {

            return raw
                .map(
                    item =>
                        normalizeResult(
                            provider,
                            item
                        )
                )
                .filter(
                    Boolean
                );
        }

        return [];

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

    let score =
        0;

    // ========================================================
    // PLAYABILITY
    // ========================================================

    if (
        result.playable
    ) {

        score +=
            70;
    } else {

        // Discovery-only result.

        score -=
            50;
    }

    // ========================================================
    // SOURCE PRIORITY
    // ========================================================

    score +=
        result._providerPriority;

    // ========================================================
    // TITLE
    // ========================================================

    const titleSimilarity =
        stringSimilarity(
            parsedQuery.titleClean,
            cleanResultTitle
        );

    score +=
        titleSimilarity *
        140;

    if (
        parsedQuery.titleClean &&
        cleanResultTitle ===
            parsedQuery.titleClean
    ) {

        score +=
            100;
    }

    score +=
        tokenOverlap(
            parsedQuery.titleClean,
            cleanResultTitle
        ) *
        50;

    // ========================================================
    // ARTIST
    // ========================================================

    if (
        parsedQuery.artistClean
    ) {

        const artistSimilarity =
            stringSimilarity(
                parsedQuery.artistClean,
                cleanResultArtist
            );

        score +=
            artistSimilarity *
            150;

        if (
            cleanResultArtist ===
            parsedQuery.artistClean
        ) {

            score +=
                130;
        }

    } else if (
        result.artist &&
        result.artist !==
            'Unknown artist'
    ) {

        score +=
            5;
    }

    // ========================================================
    // VARIATION PENALTY
    // ========================================================

    score -=
        getVariationPenalty(
            `${result.title} ${result.artist}`,
            query
        );

    // ========================================================
    // METADATA
    // ========================================================

    if (
        result.artwork
    ) {

        score +=
            5;
    }

    // ========================================================
    // DURATION
    // ========================================================
    //
    // This only contributes when a provider gives us a
    // reference duration.
    //
    // ========================================================

    // No query-side duration is available from plain text, so
    // duration is intentionally not guessed.

    // ========================================================
    // SOURCE SPECIFIC
    // ========================================================

    // Slight preference for playable sources with a real id.

    if (
        result.playable &&
        result.id
    ) {

        score +=
            5;
    }

    return score;
}

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

        return {

            success:
                false,

            message:
                '🎵 Tell me which song you want to play.'
        };
    }

    if (
        !providers.length
    ) {

        return {

            success:
                false,

            message:
                '🦆 No music providers are currently available.'
        };
    }

    const cleanQuery =
        query
            .trim()
            .slice(
                0,
                200
            );

    const parsedQuery =
        parseQuery(
            cleanQuery
        );

    console.log(
        `🔎 Music resolver searching: "${cleanQuery}"`
    );

    // ========================================================
    // SEARCH ALL PROVIDERS
    // ========================================================

    const batches =
        await Promise.all(
            providers.map(
                provider =>
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

    if (
        !allResults.length
    ) {

        return {

            success:
                false,

            message:
                `🦆 I couldn't find **${cleanQuery}**.`
        };
    }

    // ========================================================
    // SCORE
    // ========================================================

    for (
        const result
        of allResults
    ) {

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

    allResults.sort(
        (
            a,
            b
        ) => {

            if (
                b._score !==
                a._score
            ) {

                return (
                    b._score -
                    a._score
                );
            }

            if (
                b._providerPriority !==
                a._providerPriority
            ) {

                return (
                    b._providerPriority -
                    a._providerPriority
                );
            }

            return 0;
        }
    );

    const best =
        allResults[0];

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

    // ========================================================
    // RETURN NORMALIZED RESULT
    // ========================================================

    return {

        success:
            true,

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

async function searchPlayable(
    query
) {

    const result =
        await search(
            query
        );

    if (
        !result?.success
    ) {

        return result;
    }

    if (
        !result.playable ||
        !result.url
    ) {

        return {

            success:
                false,

            message:
                `🦆 I found **${result.title}**, but no playable source is available.`
        };
    }

    return result;
}

// ============================================================
// PROVIDER INFORMATION
// ============================================================

function getProviders() {

    return providers.map(
        provider => ({

            name:
                provider.name,

            priority:
                provider.priority
        })
    );
}

function getProviderStatus() {

    return providers.map(
        provider => ({

            name:
                provider.name,

            available:
                true,

            priority:
                provider.priority
        })
    );
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