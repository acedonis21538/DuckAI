'use strict';

// ============================================================
// DUCKAI — MUSIC CAPABILITY
// ============================================================
//
// Universal interface between:
//     core/router.js
//          ↓
//     this capability
//          ↓
//     capabilities/music/music.js
//
// IMPORTANT:
//
// • Detects music requests.
// • Searches Audius.
// • Selects/loads the song into the Web Player.
// • NEVER plays audio.
// • NEVER uses a Discord voice channel.
// • NEVER calls music.play().
//
// Actual audio playback happens ONLY inside player.html.
//
// ============================================================

const music =
    require('./music');

// ============================================================
// NAME
// ============================================================

const name =
    'music';

// ============================================================
// NORMALIZE MESSAGE
// ============================================================
//
// Removes:
// • Discord user/bot mentions
// • @DuckAI
// • DuckAI
//
// This makes all of these equivalent:
//
// @DuckAI play After Dark
// DuckAI play After Dark
// <@123456> play After Dark
// play After Dark
//
// ============================================================

function normalizeMessage(
    content
) {

    if (
        typeof content !==
        'string'
    ) {
        return '';
    }

    let text =
        content.trim();

    // Discord mention at the beginning
    text =
        text.replace(
            /^<@!?\d+>\s*/i,
            ''
        );

    // @DuckAI / DuckAI
    text =
        text.replace(
            /^@?duck\s*ai[\s,:-]*/i,
            ''
        );

    return text.trim();
}

// ============================================================
// MUSIC REQUEST DETECTION
// ============================================================

function isMusicRequest(
    message
) {

    if (
        !message ||
        typeof message.content !==
        'string'
    ) {
        return false;
    }

    const text =
        normalizeMessage(
            message.content
        ).toLowerCase();

    if (!text) {
        return false;
    }

    // --------------------------------------------------------
    // Explicit commands
    // --------------------------------------------------------

    const explicitPatterns = [

        /^play\b/,
        /^playing\b/,

        /^toca\b/,
        /^tocar\b/,
        /^toque\b/,

        /^listen\b/,
        /^listen\s+to\b/,

        /^ouve\b/,
        /^ouvir\b/,
        /^quero\s+ouvir\b/,

        /^put\s+on\b/,
        /^play\s+me\b/,

        /^pause\b/,
        /^pausa\b/,
        /^pausar\b/,

        /^resume\b/,
        /^retoma\b/,
        /^retomar\b/,
        /^continua\b/,
        /^continuar\b/,

        /^stop\b/,
        /^stop\s+music\b/,
        /^stop\s+the\s+music\b/,

        /^para\s+a\s+m[uú]sica\b/,
        /^parar\s+a\s+m[uú]sica\b/,

        /^mete\s+m[uú]sica\b/,
        /^mete\s+uma\s+m[uú]sica\b/
    ];

    if (
        explicitPatterns.some(
            pattern =>
                pattern.test(text)
        )
    ) {

        return true;
    }

    // --------------------------------------------------------
    // Natural music references
    // --------------------------------------------------------

    const musicPatterns = [

        /\bmusic\b/,
        /\bm[uú]sica\b/,
        /\bsong\b/,
        /\btrack\b/,
        /\bfaixa\b/,
        /\bcan[cç]ão\b/
    ];

    return musicPatterns.some(
        pattern =>
            pattern.test(text)
    );
}

// ============================================================
// CAN HANDLE
// ============================================================

function canHandle(
    message
) {

    console.log(
        '🎵 MUSIC CAPABILITY CHECK:',
        message?.content
    );

    return isMusicRequest(
        message
    );
}

// ============================================================
// EXTRACT MUSIC QUERY
// ============================================================
//
// Examples:
//
// @DuckAI play After Dark by Kitty
//                     ↓
// After Dark by Kitty
//
// DuckAI toca After Dark
//             ↓
// After Dark
//
// ============================================================

function extractQuery(
    content
) {

    let text =
        normalizeMessage(
            content
        );

    // --------------------------------------------------------
    // Remove command prefixes
    // --------------------------------------------------------

    text =
        text.replace(
            /^(?:please\s+)?(?:play|playing|play\s+me)\s+/i,
            ''
        );

    text =
        text.replace(
            /^(?:please\s+)?(?:toca|tocar|toque)\s+/i,
            ''
        );

    text =
        text.replace(
            /^(?:listen\s+to|listen)\s+/i,
            ''
        );

    text =
        text.replace(
            /^(?:quero\s+)?(?:ouvir|ouve)\s+/i,
            ''
        );

    text =
        text.replace(
            /^put\s+on\s+/i,
            ''
        );

    text =
        text.replace(
            /^mete\s+(?:uma\s+)?m[uú]sica\s*/i,
            ''
        );

    // --------------------------------------------------------
    // Remove surrounding quotation marks
    // --------------------------------------------------------

    text =
        text
            .trim()
            .replace(
                /^["'“”‘’]+|["'“”‘’]+$/g,
                ''
            )
            .trim();

    return text;
}

// ============================================================
// ACTION
// ============================================================

function getMusicAction(
    content
) {

    const text =
        normalizeMessage(
            content
        ).toLowerCase();

    if (
        /\b(?:pause|pausa|pausar)\b/.test(text)
    ) {
        return 'pause';
    }

    if (
        /\b(?:resume|retoma|retomar|continua|continuar)\b/.test(text)
    ) {
        return 'resume';
    }

    if (
        /\b(?:stop|parar)\b/.test(text) &&
        !/\b(?:play|toca|tocar)\b/.test(text)
    ) {
        return 'stop';
    }

    return 'search';
}

// ============================================================
// PLAYER ID
// ============================================================
//
// Guild ID is preferred because the Web Player is associated
// with a specific Discord server.
//
// For DMs, use a user-specific fallback.
//
// ============================================================

function getPlayerId(
    message
) {

    if (
        message?.guildId
    ) {
        return message.guildId;
    }

    if (
        message?.guild?.id
    ) {
        return message.guild.id;
    }

    if (
        message?.author?.id
    ) {
        return `dm:${message.author.id}`;
    }

    return null;
}

// ============================================================
// EXECUTE
// ============================================================

async function execute(
    message
) {

    console.log(
        '🎵 MUSIC CAPABILITY EXECUTED'
    );

    const playerId =
        getPlayerId(
            message
        );

    if (!playerId) {

        return {

            type:
                'capability',

            capability:
                name,

            response:
                '🦆 I could not determine the Web Player context.'
        };
    }

    const action =
        getMusicAction(
            message.content
        );

    // ========================================================
    // PAUSE
    // ========================================================

    if (
        action === 'pause'
    ) {

        const result =
            music.pause(
                playerId
            );

        return {

            type:
                'capability',

            capability:
                name,

            response:
                result.success
                    ? '⏸️ Music paused in the Web Player.'
                    : result.message,

            data: {

                action:
                    'pause',

                playerId,

                result
            }
        };
    }

    // ========================================================
    // RESUME
    // ========================================================

    if (
        action === 'resume'
    ) {

        const result =
            music.resume(
                playerId
            );

        return {

            type:
                'capability',

            capability:
                name,

            response:
                result.success
                    ? '▶️ Music resumed in the Web Player.'
                    : result.message,

            data: {

                action:
                    'resume',

                playerId,

                result
            }
        };
    }

    // ========================================================
    // STOP
    // ========================================================

    if (
        action === 'stop'
    ) {

        const result =
            music.stop(
                playerId
            );

        return {

            type:
                'capability',

            capability:
                name,

            response:
                result.success
                    ? '⏹️ Music stopped in the Web Player.'
                    : result.message,

            data: {

                action:
                    'stop',

                playerId,

                result
            }
        };
    }

    // ========================================================
    // SEARCH
    // ========================================================

    const query =
        extractQuery(
            message.content
        );

    if (!query) {

        return {

            type:
                'capability',

            capability:
                name,

            response:
                '🎵 Tell me which song you want to load.'
        };
    }

    console.log(
        '🎵 MUSIC QUERY:',
        query
    );

    // ========================================================
    // AUDIUS SEARCH
    // ========================================================

    let searchResult;

    try {

        searchResult =
            await music.search(
                query
            );

    } catch (error) {

        console.error(
            '❌ Music search failed:',
            error
        );

        return {

            type:
                'capability',

            capability:
                name,

            response:
                '🦆 I could not search for that song right now.'
        };
    }

    if (
        !searchResult?.success
    ) {

        return {

            type:
                'capability',

            capability:
                name,

            response:
                searchResult?.message ||
                `🦆 I couldn't find **${query}**.`,

            data: {

                action:
                    'search_failed',

                playerId
            }
        };
    }

    // ========================================================
    // SELECT SONG
    // ========================================================
    //
    // IMPORTANT:
    //
    // This does NOT play the song.
    //
    // It only stores it so player.html can load it.
    //
    // ========================================================

    const selected =
        music.selectSearchResult(
            playerId,
            searchResult
        );

    if (
        !selected?.success
    ) {

        return {

            type:
                'capability',

            capability:
                name,

            response:
                selected?.message ||
                '🎵 I could not load that song.',

            data: {

                action:
                    'selection_failed',

                playerId
            }
        };
    }

    const song =
        selected.song;

    console.log(
        `🎵 MUSIC SELECTED: ${song.title} — ${song.artist}`
    );

    // ========================================================
    // FINAL RESPONSE
    // ========================================================

    return {

        type:
            'capability',

        capability:
            name,

        response:
            `🎵 **${song.title}** — ${song.artist}\n` +
            `🖥️ Loaded into the DuckAI Web Player. Press ▶️ to play.`,

        data: {

            action:
                'selected',

            playerId,

            song
        }
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    name,

    canHandle,

    execute,

    // Compatibility exports
    isMusicRequest,

    executeMusic:
        execute,

    // Helpers
    normalizeMessage,

    extractQuery,

    getMusicAction,

    getPlayerId
};
