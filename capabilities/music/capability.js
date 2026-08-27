'use strict';

// ============================================================
// DUCKAI — MUSIC CAPABILITY
// ============================================================
//
// Universal bridge between the DuckAI router and the music
// engine.
//
// IMPORTANT:
//
// • Detects music-related requests.
// • Searches/selects music through music.js.
// • Does NOT play audio.
// • Does NOT use Discord Voice.
// • Does NOT start the Web Player.
// • The browser/player.html is responsible for audio.
//
// FLOW:
//
// Discord message
//      ↓
// Universal Router
//      ↓
// canHandle()
//      ↓
// execute()
//      ↓
// music.js
//      ↓
// selected song
//      ↓
// Web Player
//      ↓
// Browser audio
//
// ============================================================

const music =
    require('./music');

// ============================================================
// CAPABILITY NAME
// ============================================================

const name =
    'music';

// ============================================================
// MUSIC REQUEST DETECTION
// ============================================================
//
// This function intentionally focuses on clear music intent.
// The router itself remains completely generic.
//
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
        message.content
            .trim()
            .toLowerCase();

    if (!text) {
        return false;
    }

    // --------------------------------------------------------
    // Explicit commands
    // --------------------------------------------------------

    const explicitPatterns = [

        /^toca\b/,
        /^tocar\b/,
        /^toque\b/,

        /^play\b/,
        /^listen to\b/,
        /^listen\b/,

        /^ouve\b/,
        /^ouvir\b/,
        /^quero ouvir\b/,

        /^put on\b/,
        /^play me\b/,

        /^resume\b/,
        /^retoma\b/,
        /^retomar\b/,
        /^continua\b/,
        /^continuar\b/,

        /^pause\b/,
        /^pausa\b/,
        /^pausar\b/,

        /^stop\b/,
        /^stop music\b/,
        /^stop the music\b/,

        /^para a música\b/,
        /^parar a música\b/,

        /^mete música\b/,
        /^mete uma música\b/
    ];

    if (
        explicitPatterns.some(
            pattern =>
                pattern.test(
                    text
                )
        )
    ) {

        return true;
    }

    // --------------------------------------------------------
    // General music references
    // --------------------------------------------------------

    const musicPatterns = [

        /\bmusic\b/,
        /\bmúsica\b/,
        /\bmusica\b/,
        /\bsong\b/,
        /\btrack\b/,
        /\bfaixa\b/,
        /\bcanção\b/,
        /\bcancao\b/
    ];

    return musicPatterns.some(
        pattern =>
            pattern.test(
                text
            )
    );
}

// ============================================================
// CAN HANDLE
// ============================================================

function canHandle(
    message
) {

    // --------------------------------------------------------
    // TEMPORARY DEBUG LOG
    // --------------------------------------------------------
    //
    // This confirms that the HOST is executing this exact
    // capability.js.
    //
    // --------------------------------------------------------

    console.log(
        '🎵 MUSIC CAPABILITY CHECK:',
        message?.content
    );

    return isMusicRequest(
        message
    );
}

// ============================================================
// EXTRACT QUERY
// ============================================================
//
// Examples:
//
// "toca After Dark"
//       ↓
// "After Dark"
//
// "DuckAI toca After Dark"
//       ↓
// "After Dark"
//
// "play After Dark by Kitty"
//       ↓
// "After Dark by Kitty"
//
// ============================================================

function extractQuery(
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

    // --------------------------------------------------------
    // Remove Discord mentions
    // --------------------------------------------------------

    text =
        text.replace(
            /<@!?\d+>/g,
            ''
        );

    // --------------------------------------------------------
    // Remove DuckAI trigger
    // --------------------------------------------------------

    text =
        text.replace(
            /^(?:hey\s+)?duck\s*ai[\s,:-]*/i,
            ''
        );

    // Also handle DuckAI appearing after leading whitespace.

    text =
        text.replace(
            /^\s*duck\s*ai[\s,:-]*/i,
            ''
        );

    // --------------------------------------------------------
    // Remove command prefixes
    // --------------------------------------------------------

    text =
        text.replace(
            /^(?:please\s+)?(?:toca|tocar|toque)\s+/i,
            ''
        );

    text =
        text.replace(
            /^(?:please\s+)?(?:play|play\s+me)\s+/i,
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
            /^(?:put\s+on)\s+/i,
            ''
        );

    text =
        text.replace(
            /^(?:mete\s+(?:uma\s+)?m[uú]sica)\s*/i,
            ''
        );

    // --------------------------------------------------------
    // Clean quotation marks
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
// GET ACTION
// ============================================================
//
// search = search/select song
// pause  = pause backend state
// resume = resume backend state
// stop   = stop backend state
//
// IMPORTANT:
//
// None of these actions reproduce audio on the server.
// The browser controls actual audio playback.
//
// ============================================================

function getMusicAction(
    content
) {

    const text =
        typeof content ===
        'string'
            ? content
                .trim()
                .toLowerCase()
            : '';

    // --------------------------------------------------------
    // Pause
    // --------------------------------------------------------

    if (
        /\b(?:pause|pausa|pausar)\b/.test(
            text
        )
    ) {

        return 'pause';
    }

    // --------------------------------------------------------
    // Resume
    // --------------------------------------------------------

    if (
        /\b(?:resume|retoma|retomar|continua|continuar)\b/.test(
            text
        )
    ) {

        return 'resume';
    }

    // --------------------------------------------------------
    // Stop
    // --------------------------------------------------------

    if (
        /\b(?:stop|parar)\b/.test(
            text
        )
    ) {

        return 'stop';
    }

    // --------------------------------------------------------
    // Search/select
    // --------------------------------------------------------

    return 'search';
}

// ============================================================
// GET PLAYER ID
// ============================================================
//
// Guild ID is preferred.
//
// For DMs, use a stable user-specific identifier.
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

    // --------------------------------------------------------
    // TEMPORARY DEBUG LOG
    // --------------------------------------------------------

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
                '🦆 I could not determine the player context.'
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
        action ===
        'pause'
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
        action ===
        'resume'
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
        action ===
        'stop'
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

    if (
        !query
    ) {

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
    // This stores the song in the same music.js instance used
    // by the Web Player because server.js and index.js are now
    // loaded by the same start.js process.
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

    // ========================================================
    // FINAL RESULT
    // ========================================================
    //
    // IMPORTANT:
    //
    // We DO NOT call music.play().
    //
    // The song is only loaded into the Web Player.
    //
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

    // Compatibility aliases
    isMusicRequest,

    executeMusic: execute,

    // Helpers
    extractQuery,

    getMusicAction,

    getPlayerId
};