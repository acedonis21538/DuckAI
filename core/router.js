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

    if (
        matchesRoute(
            text,
            routes.music.keywords
        )
    ) {

        return {
            type: 'capability',
            capability: 'music',
            confidence: 0.9
        };
    }

    if (
        matchesRoute(
            text,
            routes.images.keywords
        )
    ) {

        return {
            type: 'capability',
            capability: 'images',
            confidence: 0.9
        };
    }

    if (
        matchesRoute(
            text,
            routes.web.keywords
        )
    ) {

        return {
            type: 'capability',
            capability: 'web',
            confidence: 0.85
        };
    }

    return {
        type: 'conversation',
        capability: null,
        confidence: 1
    };
}

// ============================================================
// EXTRACT MUSIC QUERY
// ============================================================

function extractMusicQuery(
    content
) {

    return content
        .replace(
            /^(toca|tocar|ouve|ouvir|play|song)\s*/i,
            ''
        )
        .trim();
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

    const query =
        extractMusicQuery(
            message.content
        );

    if (!query) {

        return {
            response:
                music.responses.getResponse(
                    'play',
                    false
                ),

            file: null
        };
    }

    // --------------------------------------------------------
    // AUDIUS SEARCH
    // --------------------------------------------------------

    const result =
        await music.findTrack(
            query
        );

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

            file: null
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

    if (
        detected.type !==
        'capability'
    ) {

        return {
            ...detected,
            response: null,
            file: null
        };
    }

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

    return {
        ...detected,
        response: null,
        file: null
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

    route
};