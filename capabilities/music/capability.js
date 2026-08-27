// ============================================================
// DUCKAI — MUSIC CAPABILITY
// ============================================================

const music =
    require('./music');

// ============================================================
// MUSIC QUERY
// ============================================================

function extractMusicQuery(
    content = ''
) {

    const text =
        content
            .trim();

    const patterns = [

        /^(?:please\s+)?(?:play|listen\s+to|put\s+on)\s+(.+)$/i,

        /^(?:podes\s+|pode\s+|poderias\s+|consegues\s+)?(?:tocar|toca|ouve|ouvir)\s+(.+)$/i,

        /^(?:play|song)\s+(.+)$/i
    ];

    for (
        const pattern of patterns
    ) {

        const match =
            text.match(
                pattern
            );

        if (
            match?.[1]
        ) {

            return match[1]
                .trim();
        }
    }

    return null;
}

// ============================================================
// CAN HANDLE
// ============================================================

function canHandle(
    message
) {

    if (
        !message?.content
    ) {

        return false;
    }

    const text =
        message.content
            .trim()
            .toLowerCase();

    // Clear music requests.

    return /\b(play|listen|music|song|put on|tocar|toca|ouve|ouvir|música|musica)\b/i
        .test(text);
}

// ============================================================
// EXECUTE
// ============================================================

async function execute(
    message
) {

    const guildId =
        message.guildId;

    if (
        !guildId
    ) {

        return {
            response:
                '🦆 Music only works inside a server.'
        };
    }

    const query =
        extractMusicQuery(
            message.content
        );

    // --------------------------------------------------------
    // No song specified
    // --------------------------------------------------------

    if (
        !query
    ) {

        return {

            response:
                '🎵 Tell me which song you want to play.'
        };
    }

    console.log(
        '🎵 MUSIC QUERY:',
        query
    );

    // --------------------------------------------------------
    // Search
    // --------------------------------------------------------

    const result =
        await music.search(
            query
        );

    if (
        !result?.success
    ) {

        return {

            response:

                result?.message ||

                '🎵 I could not find that song.'
        };
    }

    // --------------------------------------------------------
    // Save song
    // --------------------------------------------------------

    const song =
        music.setSong({

            guildId,

            title:
                result.title,

            artist:
                result.artist,

            url:
                result.url,

            artwork:
                result.artwork,

            id:
                result.id
        });

    if (
        !song
    ) {

        return {

            response:
                '🎵 I could not save that song.'
        };
    }

    console.log(
        `🎵 MUSIC READY: ${song.title} — ${song.artist}`
    );

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    return {

        response:
            `🎵 **${song.title}** — ${song.artist}`,

        song
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    name:
        'music',

    canHandle,

    execute,

    extractMusicQuery
};