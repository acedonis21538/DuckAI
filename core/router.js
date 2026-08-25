// ============================================================
// DUCKAI ROUTER
// ============================================================

const capabilities =
    require('../capabilities');

// ============================================================
// ROUTES
// ============================================================

const routes = {

    music: [
        'toca',
        'tocar',
        'ouve',
        'ouvir',
        'música',
        'musica',
        'song',
        'play',
        'pausa',
        'pause',
        'continua',
        'resume',
        'skip',
        'salta',
        'próxima',
        'proxima',
        'para a música',
        'para a musica',
        'stop music'
    ],

    images: [
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
        'quero ver'
    ],

    web: [
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
};

// ============================================================
// NORMALIZE
// ============================================================

function normalize(text = '') {

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
                normalize(keyword)
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
            routes.music
        )
    ) {
        return {
            type: 'capability',
            capability: 'music',
            confidence: 0.95
        };
    }

    if (
        matchesRoute(
            text,
            routes.images
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
            routes.web
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
// MUSIC QUERY
// ============================================================

function extractMusicQuery(
    text
) {

    return text
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
                '🎵 Diz-me que música queres que toque.',
            file: null
        };
    }

    const trackResult =
        await music.findTrack(
            query
        );

    if (
        !trackResult.success ||
        !trackResult.track ||
        !trackResult.url
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

    const playback =
        await music.play({

            query,

            url:
                trackResult.url,

            track:
                trackResult.track,

            message
        });

    if (!playback.success) {

        return {
            response:
                playback.message ||
                music.responses.getResponse(
                    'play',
                    false
                ),
            file: null
        };
    }

    const response =
        music.responses.getResponse(
            'play',
            true,
            {
                song:
                    playback.song?.title ||
                    query
            }
        );

    return {
        response,
        file: null
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

    // Por enquanto as outras capabilities
    // continuam disponíveis para o sistema.

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