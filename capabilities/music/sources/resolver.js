'use strict';

// ============================================================
// DUCKAI — MUSIC RESOLVER
// ============================================================
//
// Goal:
//
// Find the music result that is MOST FAITHFUL to the user's
// requested song.
//
// This resolver does NOT:
// • play audio
// • join Voice
// • use FFmpeg
// • send Discord messages
//
// It only finds and ranks music results.
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
                Number.isFinite(priority)
                    ? priority
                    : 0
        });

    } catch (error) {

        console.warn(
            `⚠️ Provider "${name}" unavailable:`,
            error.message
        );
    }
}

// Playable sources get preference.
// Discovery-only providers can still contribute information.

loadProvider(
    'soundcloud',
    './soundcloud',
    30
);

loadProvider(
    'audius',
    './audius',
    25
);

loadProvider(
    'spotify',
    './spotify',
    15
);

loadProvider(
    'youtube',
    './youtube',
    10
);

// ============================================================
// NOISY TERMS
// ============================================================
//
// These normally mean the result is NOT the original track.
//
// We don't automatically reject them because sometimes the
// user explicitly asks for one.
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
    'slowed + reverb',
    'slowed reverb',

    'nightcore',

    '8d',
    '8d audio',

    'edit',
    'radio edit',

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

    'version',
    'mix'
];

// Terms that strongly indicate an alternate version.

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
// TOKEN NORMALIZATION
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
// TOKENS
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
// QUERY PARSING
// ============================================================
//
// Handles:
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

    // "song by artist"

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

    // "artist - song"

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
// BIDIRECTIONAL TOKEN SIMILARITY
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
// EXACT / CONTAINMENT SCORE
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
// VARIATION DETECTION
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

        const resultHas =
            new RegExp(
                `\\b${escapeRegExp(normalizedTerm)}\\b`,
                'i'
            ).test(
                normalizedResult
            );

        const queryHas =
            new RegExp(
                `\\b${escapeRegExp(normalizedTerm)}\\b`,
                'i'
            ).test(
                normalizedQuery
            );

        // Penalize alternate versions only when the user did
        // not explicitly request that variation.

        if (
            resultHas &&
            !queryHas
        ) {

            penalty +=
                strongVariationTerms.includes(
                    normalizedTerm
                )
                    ? 45
                    : 20;
        }
    }

    return penalty;
}

// ============================================================
// DURATION SCORE
// ============================================================
//
// A matching title with a wildly different duration is often
// a remix/live/edit.
//
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

    // Exact-ish duration.

    if (
        difference <= 2
    ) {

        return 25;
    }

    if (
        difference <= 5
    ) {

        return 20;
    }

    if (
        difference <= 10
    ) {

        return 15;
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

    return -10;
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
            60;
    }

    // ========================================================
    // PROVIDER
    // ========================================================

    score +=
        result._providerPriority;

    // ========================================================
    // TITLE
    // ========================================================

    const titleExact =
        stringSimilarity(
            parsedQuery.titleClean,
            cleanResultTitle
        );

    score +=
        titleExact *
        120;

    // Exact title should be extremely important.

    if (
        parsedQuery.titleClean &&
        cleanResultTitle ===
            parsedQuery.titleClean
    ) {

        score +=
            100;
    }

    // Token overlap.

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
            130;

        if (
            cleanResultArtist ===
            parsedQuery.artistClean
        ) {

            score +=
                120;
        }

    } else {

        // When the user didn't give an artist, don't let the
        // artist overwhelm the title match.

        if (
            result.artist &&
            result.artist !==
                'Unknown artist'
        ) {

            score +=
                5;
        }
    }

    // ========================================================
    // VARIATION PENALTY
    // ========================================================

    const fullResultText =
        `${result.title} ${result.artist}`;

    score -=
        getVariationPenalty(
            fullResultText,
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

    if (
        result.duration
    ) {

        score +=
            5;
    }

    // ========================================================
    // DISCOVERY-ONLY RESULTS
    // ========================================================
    //
    // A non-playable result can still identify a song, but it
    // should never beat a strongly matching playable result
    // merely because of metadata.
    //
    // ========================================================

    if (
        !result.playable
    ) {

        score -=
            50;
    }

    return score;
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

        // Single result.

        if (
            raw &&
            typeof raw === 'object' &&
            !Array.isArray(raw)
        ) {

            const result =
                normalizeResult(
                    provider,
                    raw
                );

            return result
                ? [result]
                : [];
        }

        // Multiple results.

        if (
            Array.isArray(raw)
        ) {

            return raw
                .map(
                    result =>
                        normalizeResult(
                            provider,
                            result
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
                '🦆 No music providers are available.'
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
    // SEARCH ALL SOURCES
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

            // Score is primary.

            if (
                b._score !==
                a._score
            ) {

                return (
                    b._score -
                    a._score
                );
            }

            // Provider priority is secondary.

            return (
                b._providerPriority -
                a._providerPriority
            );
        }
    );

    const best =
        allResults[0];

    console.log(
        [
            `🎯 Best match: ${best.title} — ${best.artist}`,
            `📡 Source: ${best.source}`,
            `📊 Score: ${best._score.toFixed(2)}`,
            `🔊 Playable: ${best.playable ? 'yes' : 'no'}`
        ].join('\n')
    );

    // ========================================================
    // NORMALIZED PUBLIC RESULT
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