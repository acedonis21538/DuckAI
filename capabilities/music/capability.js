// ============================================================
// DUCKAI — MUSIC CAPABILITY
// ============================================================
//
// Universal music capability.
//
// FLOW:
//
// Discord message
//      ↓
// Router
//      ↓
// canHandle()
//      ↓
// execute()
//      ↓
// Audius search
//      ↓
// Select song
//      ↓
// Web Player
//
// IMPORTANT:
//
// • NÃO entra em Voice Channel.
// • NÃO reproduz áudio.
// • NÃO usa @discordjs/voice.
// • NÃO chama audio.play().
// • O áudio é reproduzido APENAS pelo player.html.
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
// Exemplos:
//
// "toca After Dark"
// "play After Dark"
// "play music"
// "quero ouvir After Dark"
// "toca Kitty"
// "put some music on"
// "resume music"
// "pausa a música"
// "para a música"
//
// ============================================================

function isMusicRequest(
    message
) {

    if (
        !message ||
        typeof message.content !== 'string'
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
    // Explicit music commands
    // --------------------------------------------------------

    const commandPatterns = [

        /^toca\b/,
        /^tocar\b/,
        /^toque\b/,
        /^play\b/,
        /^playing\b/,

        /^ouve\b/,
        /^ouvir\b/,
        /^quero ouvir\b/,

        /^put on\b/,
        /^play me\b/,

        /^resume\b/,
        /^retoma\b/,
        /^retomar\b/,

        /^pausa\b/,
        /^pause\b/,

        /^para a música\b/,
        /^parar a música\b/,
        /^stop music\b/,
        /^stop the music\b/
    ];

    if (
        commandPatterns.some(
            pattern =>
                pattern.test(
                    text
                )
        )
    ) {

        return true;
    }

    // --------------------------------------------------------
    // Music-related phrases
    // --------------------------------------------------------

    const musicPatterns = [

        /\bmusic\b/,
        /\bmúsica\b/,
        /\bsong\b/,
        /\bcanção\b/,
        /\btrack\b/,
        /\bfaixa\b/,

        /\bplay music\b/,
        /\btoca música\b/,
        /\btocar música\b/,

        /\bque toca\b/,
        /\bmete música\b/,
        /\bmete uma música\b/
    ];

    return musicPatterns.some(
        pattern =>
            pattern.test(
                text
            )
    );
}

// ============================================================
// EXTRACT QUERY
// ============================================================
//
// Converts:
//
// "toca After Dark"
//       ↓
// "After Dark"
//
// "play Kitty After Dark"
//       ↓
// "Kitty After Dark"
//
// ============================================================

function extractQuery(
    content
) {

    if (
        typeof content !== 'string'
    ) {

        return '';
    }

    let query =
        content.trim();

    // --------------------------------------------------------
    // Remove common command prefixes
    // --------------------------------------------------------

    query =
        query.replace(
            /^(?:hey\s+)?(?:duck\s*ai[\s,:-]*)?/i,
            ''
        );

    query =
        query.replace(
            /^(?:please\s+)?(?:toca|tocar|toque|play|playing)\s+/i,
            ''
        );

    query =
        query.replace(
            /^(?:quero\s+)?(?:ouvir|ouve)\s+/i,
            ''
        );

    query =
        query.replace(
            /^(?:play\s+me)\s+/i,
            ''
        );

    query =
        query.replace(
            /^(?:put\s+(?:on|some\s+music)\s*)/i,
            ''
        );

    return query
        .trim()
        .replace(
            /^["']|["']$/g,
            ''
        )
        .trim();
}

// ============================================================
// SPECIAL COMMAND DETECTION
// ============================================================

function getMusicAction(
    content
) {

    const text =
        typeof content === 'string'
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
        /\b(?:resume|retoma|retomar|continuar|continua)\b/.test(
            text
        )
    ) {

        return 'resume';
    }

    // --------------------------------------------------------
    // Stop
    // --------------------------------------------------------

    if (
        /\b(?:stop|parar|para)\b/.test(
            text
        ) &&
        !/\b(?:toca|play)\b/.test(
            text
        )
    ) {

        return 'stop';
    }

    // --------------------------------------------------------
    // Play / search
    // --------------------------------------------------------

    return 'search';
}

// ============================================================
// SAFE GUILD ID
// ============================================================

function getGuildId(
    message
) {

    // --------------------------------------------------------
    // Discord guild
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // DMs
    // --------------------------------------------------------
    //
    // A DM has no guild.
    //
    // Use a stable user-based player ID so the Web Player
    // can still have an independent state.
    //
    // --------------------------------------------------------

    if (
        message?.author?.id
    ) {

        return `dm:${message.author.id}`;
    }

    return null;
}

// ============================================================
// CAN HANDLE
// ============================================================

function canHandle(
    message
) {

    return isMusicRequest(
        message
    );
}

// ============================================================
// EXECUTE
// ============================================================

async function execute(
    message
) {

    const guildId =
        getGuildId(
            message
        );

    if (!guildId) {

        return {

            type:
                'capability',

            capability:
                name,

            response:
                '🦆 I need a server or user context for the music player.'
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
            await music.pause(
                guildId
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

            data:
                result
        };
    }

    // ========================================================
    // RESUME
    // ========================================================

    if (
        action === 'resume'
    ) {

        const result =
            await music.resume(
                guildId
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

            data:
                result
        };
    }

    // ========================================================
    // STOP
    // ========================================================

    if (
        action === 'stop'
    ) {

        const result =
            await music.stop(
                guildId
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

            data:
                result
        };
    }

    // ========================================================
    // SEARCH
    // ========================================================

    const query =
        extractQuery(
            message.content
        );

    // --------------------------------------------------------
    // No query
    // --------------------------------------------------------

    if (!query) {

        return {

            type:
                'capability',

            capability:
                name,

            response:
                '🎵 Tell me which song you want to play.'
        };
    }

    // ========================================================
    // SEARCH AUDIUS
    // ========================================================

    const result =
        await music.search(
            query
        );

    // --------------------------------------------------------
    // Search failed
    // --------------------------------------------------------

    if (
        !result?.success
    ) {

        return {

            type:
                'capability',

            capability:
                name,

            response:
                result?.message ||
                `🦆 I couldn't find **${query}**.`,

            data:
                result
        };
    }

    // ========================================================
    // SELECT SONG
    // ========================================================
    //
    // IMPORTANT:
    //
    // This ONLY prepares the song for the Web Player.
    //
    // It does NOT play audio.
    //
    // ========================================================

    const selected =
        music.selectSearchResult(
            guildId,
            result
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
                '🎵 I could not select that song.',

            data:
                selected
        };
    }

    // ========================================================
    // RESPONSE
    // ========================================================
    //
    // We intentionally DO NOT call:
    //
    // music.play()
    //
    // The Web Player must be opened and the user presses Play.
    //
    // ========================================================

    const song =
        selected.song;

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

            guildId,

            song
        }
    };
}

// ============================================================
// LEGACY COMPATIBILITY
// ============================================================
//
// The router can support either:
//
// canHandle()
// execute()
//
// or:
//
// isMusicRequest()
// executeMusic()
//
// Export both so the capability remains compatible with
// older versions of the general router.
//
// ============================================================

async function executeMusic(
    message
) {

    return execute(
        message
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    name,

    canHandle,

    execute,

    // Legacy router compatibility
    isMusicRequest,

    executeMusic,

    // Helpers
    extractQuery,

    getMusicAction,

    getGuildId
};