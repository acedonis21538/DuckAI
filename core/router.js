// ============================================================
// DUCKAI ROUTER
// ============================================================

const capabilities =
    require('../capabilities');

// ============================================================
// ROUTES
// ============================================================

const routes = {

    music: {

        keywords: [

            'toca',
            'tocar',
            'ouve',
            'ouvir',
            'musica',
            'música',
            'song',
            'play',
            'playlist',

            'pausa',
            'pause',

            'continua',
            'resume',

            'skip',
            'salta',

            'proxima',
            'próxima',

            'para a musica',
            'para a música',
            'stop music'
        ]
    },

    images: {

        keywords: [

            'imagem',
            'imagens',
            'foto',
            'fotos',

            'picture',
            'pictures',
            'image',
            'images',

            'mostra-me',
            'mostra me',
            'mostra',

            'quero ver',

            'procura uma foto',
            'procura fotos'
        ]
    },

    web: {

        keywords: [

            'pesquisa',
            'pesquisar',

            'procura',
            'procurar',

            'search',
            'google',

            'quem é',
            'quem e',

            'o que é',
            'o que e',

            'quando foi',
            'onde fica'
        ]
    }
};

// ============================================================
// NORMALIZE
// ============================================================

function normalize(
    text = ''
) {

    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(
            /[\u0300-\u036f]/g,
            ''
        )
        .trim();
}

// ============================================================
// MATCH
// ============================================================

function matchesRoute(
    text,
    keywords
) {

    return keywords.some(
        keyword =>
            text.includes(
                normalize(
                    keyword
                )
            )
    );
}

// ============================================================
// DETECT
// ============================================================

function detectRoute(
    message
) {

    const text =
        normalize(
            message.content
        );

    // --------------------------------------------------------
    // MUSIC
    // --------------------------------------------------------

    if (
        matchesRoute(
            text,
            routes.music.keywords
        )
    ) {

        return {

            type:
                'capability',

            capability:
                'music',

            confidence:
                0.9
        };
    }

    // --------------------------------------------------------
    // IMAGES
    // --------------------------------------------------------

    if (
        matchesRoute(
            text,
            routes.images.keywords
        )
    ) {

        return {

            type:
                'capability',

            capability:
                'images',

            confidence:
                0.9
        };
    }

    // --------------------------------------------------------
    // WEB
    // --------------------------------------------------------

    if (
        matchesRoute(
            text,
            routes.web.keywords
        )
    ) {

        return {

            type:
                'capability',

            capability:
                'web',

            confidence:
                0.85
        };
    }

    // --------------------------------------------------------
    // NORMAL CONVERSATION
    // --------------------------------------------------------

    return {

        type:
            'conversation',

        capability:
            null,

        confidence:
            1
    };
}

// ============================================================
// EXTRACT MUSIC QUERY
// ============================================================

function extractMusicQuery(
    content
) {

    let query =
        String(
            content || ''
        ).trim();

    // ========================================================
    // REMOVE DISCORD MENTION
    // ========================================================

    query =
        query.replace(
            /<@!?\d+>/g,
            ''
        ).trim();

    // ========================================================
    // REMOVE DUCKAI
    // ========================================================

    query =
        query.replace(
            /^(?:hey\s+)?(?:duck\s*ai\s*)?/i,
            ''
        );

    // ========================================================
    // ENGLISH REQUESTS
    // ========================================================

    query =
        query.replace(
            /^(?:could\s+you|can\s+you|would\s+you|will\s+you)\s+/i,
            ''
        );

    query =
        query.replace(
            /^(?:please\s+)?(?:play|listen\s+to|put\s+on)\s+/i,
            ''
        );

    // ========================================================
    // PORTUGUESE REQUESTS
    // ========================================================

    query =
        query.replace(
            /^(?:podes\s+|pode\s+|poderias\s+|consegues\s+)?(?:tocar|toca|ouve|ouvir)\s+/i,
            ''
        );

    // ========================================================
    // SIMPLE COMMANDS
    // ========================================================

    query =
        query.replace(
            /^(?:play|song)\s+/i,
            ''
        );

    // ========================================================
    // CLEAN PUNCTUATION
    // ========================================================

    query =
        query
            .replace(
                /^[,:;.!?\s]+/,
                ''
            )
            .replace(
                /[,:;.!?\s]+$/,
                ''
            )
            .trim();

    return query;
}

// ============================================================
// MUSIC
// ============================================================

async function executeMusic(
    message
) {

    const music =
        capabilities.getCapability(
            'music'
        );

    if (!music) {

        return {

            response:
                '🦆 Music capability is unavailable.',

            file:
                null
        };
    }

    // --------------------------------------------------------
    // QUERY
    // --------------------------------------------------------

    const query =
        extractMusicQuery(
            message.content
        );

    console.log(
        '🎵 MUSIC QUERY:',
        query
    );

    if (!query) {

        return {

            response:
                music.responses.getResponse(
                    'play',
                    false
                ),

            file:
                null
        };
    }

    // --------------------------------------------------------
    // AUDIUS SEARCH
    // --------------------------------------------------------

    const result =
        await music.findTrack(
            query
        );

    // --------------------------------------------------------
    // DEBUG
    // --------------------------------------------------------

    console.log(
        '🎵 MUSIC DEBUG:',
        JSON.stringify({

            query,

            success:
                result.success,

            track:
                result.track?.title ||
                null,

            artist:
                result.track?.user?.name ||
                null,

            url:
                Boolean(
                    result.url
                )
        })
    );

    // --------------------------------------------------------
    // SEARCH FAILED
    // --------------------------------------------------------

    if (
        !result.success ||
        !result.track ||
        !result.url
    ) {

        return {

            response:
                music.responses.getResponse(
                    'play',
                    false
                ),

            file:
                null
        };
    }

    // --------------------------------------------------------
    // PLAY
    // --------------------------------------------------------

    const playback =
        await music.play({

            query,

            url:
                result.url,

            track:
                result.track,

            message
        });

    // --------------------------------------------------------
    // PLAYBACK RESULT
    // --------------------------------------------------------

    return {

        response:
            music.responses.getResponse(

                'play',

                playback.success,

                {

                    song:
                        playback.song?.title ||
                        result.track.title ||
                        query
                }
            ),

        file:
            null,

        playback
    };
}

// ============================================================
// ROUTE
// ============================================================

async function route(
    message
) {

    const detected =
        detectRoute(
            message
        );

    // --------------------------------------------------------
    // NORMAL CONVERSATION
    // --------------------------------------------------------

    if (
        detected.type !==
        'capability'
    ) {

        return {

            ...detected,

            response:
                null,

            file:
                null
        };
    }

    // --------------------------------------------------------
    // MUSIC
    // --------------------------------------------------------

    if (
        detected.capability ===
        'music'
    ) {

        return {

            ...detected,

            ...(await executeMusic(
                message
            ))
        };
    }

    // --------------------------------------------------------
    // OTHER CAPABILITIES
    // --------------------------------------------------------

    return {

        ...detected,

        response:
            null,

        file:
            null
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    routes,

    normalize,

    matchesRoute,

    detectRoute,

    extractMusicQuery,

    executeMusic,

    route
};