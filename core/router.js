// ============================================================
// DUCKAI ROUTER
// ============================================================

const capabilities =
    require('../capabilities');

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
    // REMOVE DUCKAI NAME / TEXT MENTION
    // ========================================================

    query =
        query.replace(
            /^@?duck\s*ai\b[\s,:-]*/i,
            ''
        ).trim();

    // ========================================================
    // ENGLISH REQUESTS
    // ========================================================

    query =
        query.replace(
            /^(?:hey\s+)?(?:could\s+you|can\s+you|would\s+you|will\s+you)\s+/i,
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
                /^[,@:;.!?\s]+/,
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
        !result.url
    ) {

        return {

            response:
                '🎵 Hmm, não consegui encontrar essa.',

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
    // PLAY FAILED
    // --------------------------------------------------------

    if (
        !playback ||
        !playback.success
    ) {

        return {

            response:
                playback?.message ||
                '🦆 Não consegui reproduzir essa música.',

            file:
                null
        };
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    const song =
        playback.song ||
        result.track;

    return {

        response:
            `🎶 A tocar **${song?.title || query}**` +
            (
                song?.artist
                    ? ` — ${song.artist}`
                    : ''
            ),

        file:
            null
    };
}

// ============================================================
// DETECT MUSIC
// ============================================================

function isMusicRequest(
    content
) {

    const text =
        String(
            content || ''
        ).toLowerCase();

    return (
        /\b(play|song|music|listen|put on)\b/.test(
            text
        ) ||
        /\b(tocar|toca|ouve|ouvir|música|musica)\b/.test(
            text
        )
    );
}

// ============================================================
// ROUTE
// ============================================================

async function route(
    message
) {

    if (!message) {

        return {
            type:
                'none',

            response:
                null
        };
    }

    // ========================================================
    // MUSIC
    // ========================================================

    if (
        isMusicRequest(
            message.content
        )
    ) {

        const musicResult =
            await executeMusic(
                message
            );

        return {

            type:
                'capability',

            capability:
                'music',

            response:
                musicResult.response,

            file:
                musicResult.file
        };
    }

    // ========================================================
    // NO CAPABILITY
    // ========================================================

    return {

        type:
            'ai',

        response:
            null
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    route,

    executeMusic,

    extractMusicQuery,

    isMusicRequest
};