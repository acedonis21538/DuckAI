'use strict';

// ============================================================
// DUCKAI — MUSIC CAPABILITY
// ============================================================
//
// This module owns the music feature.
//
// RESPONSIBILITIES:
//
// • Detect music requests
// • Extract the requested song
// • Search Audius through music.js
// • Select/store the song
// • Create/update the Discord music panel
// • Return a universal capability result
//
// IMPORTANT:
//
// • NO Discord event listeners here.
// • NO interactionCreate here.
// • NO client.on(...) here.
// • NO Brain calls.
// • NO capability XML.
// • NO direct Voice connection here.
//
// MESSAGE FLOW:
//
// Discord message
//      ↓
// index.js
//      ↓
// router.js
//      ↓
// canHandle()
//      ↓
// execute()
//      ↓
// music.js
//      ↓
// panel.js
//
// BUTTON FLOW:
//
// Discord button
//      ↓
// handler/interactionCreate.js
//      ↓
// panel.handleInteraction()
//      ↓
// music.js
//
// ============================================================

// ============================================================
// DEPENDENCIES
// ============================================================

const music =
    require('./music');

const panel =
    require('./panel');

// ============================================================
// CAPABILITY NAME
// ============================================================

const name =
    'music';

// ============================================================
// PANEL CACHE
// ============================================================
//
// Keeps one panel message per guild during the current process.
//
// The cache is intentionally in-memory.
// A restart simply allows a new panel to be created.
//
// ============================================================

const panelMessages =
    new Map();

// ============================================================
// NORMALIZE MESSAGE
// ============================================================
//
// Supported examples:
//
// @DuckAI play After Dark
// DuckAI play After Dark
// <@123456789> play After Dark
// play After Dark
//
// All become:
//
// play After Dark
//
// ============================================================

function normalizeMessage(
    content
) {

    if (
        typeof content !== 'string'
    ) {

        return '';
    }

    let text =
        content.trim();

    // --------------------------------------------------------
    // Discord mention
    // --------------------------------------------------------

    text =
        text.replace(
            /^<@!?\d+>\s*/i,
            ''
        );

    // --------------------------------------------------------
    // DuckAI name
    // --------------------------------------------------------

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
        typeof message.content !== 'string'
    ) {

        return false;
    }

    const text =
        normalizeMessage(
            message.content
        ).toLowerCase();

    if (
        !text
    ) {

        return false;
    }

    // --------------------------------------------------------
    // Explicit music actions
    // --------------------------------------------------------

    const explicitPatterns = [

        // English
        /^play\b/,
        /^playing\b/,
        /^listen\b/,
        /^listen\s+to\b/,
        /^put\s+on\b/,
        /^play\s+me\b/,

        // Portuguese
        /^toca\b/,
        /^tocar\b/,
        /^toque\b/,
        /^ouve\b/,
        /^ouvir\b/,
        /^quero\s+ouvir\b/,
        /^mete\s+m[uú]sica\b/,
        /^mete\s+uma\s+m[uú]sica\b/,

        // Playback controls
        /^pause\b/,
        /^resume\b/,
        /^stop\b/,

        /^pausa\b/,
        /^pausar\b/,
        /^retoma\b/,
        /^retomar\b/,
        /^continua\b/,
        /^continuar\b/,
        /^parar\b/,
        /^para\s+a\s+m[uú]sica\b/,
        /^parar\s+a\s+m[uú]sica\b/
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
// EXTRACT QUERY
// ============================================================
//
// Converts:
//
// @DuckAI play After Dark by Kitty
//
// into:
//
// After Dark by Kitty
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
        ) &&
        !/\b(?:play|toca|tocar)\b/.test(
            text
        )
    ) {

        return 'stop';
    }

    // --------------------------------------------------------
    // Default
    // --------------------------------------------------------

    return 'search';
}

// ============================================================
// PLAYER ID
// ============================================================
//
// Guilds use the Discord guild ID.
//
// DMs use a stable user-specific fallback.
//
// ============================================================

function getPlayerId(
    message
) {

    if (
        message?.guildId
    ) {

        return String(
            message.guildId
        );
    }

    if (
        message?.guild?.id
    ) {

        return String(
            message.guild.id
        );
    }

    if (
        message?.author?.id
    ) {

        return `dm:${message.author.id}`;
    }

    return null;
}

// ============================================================
// PANEL MESSAGE
// ============================================================
//
// Creates a new panel or updates the previous one.
//
// ============================================================

async function sendOrUpdatePanel(
    message,
    playerId
) {

    if (
        !message?.channel ||
        typeof message.channel.send !== 'function'
    ) {

        console.error(
            '❌ Music panel cannot access the message channel.'
        );

        return null;
    }

    const panelPayload =
        panel.buildPanel(
            playerId
        );

    // --------------------------------------------------------
    // Existing panel
    // --------------------------------------------------------

    const existing =
        panelMessages.get(
            playerId
        );

    if (
        existing
    ) {

        try {

            await existing.edit(
                panelPayload
            );

            return existing;

        } catch (error) {

            console.warn(
                `⚠️ Existing music panel is unavailable [${playerId}].`
            );

            panelMessages.delete(
                playerId
            );
        }
    }

    // --------------------------------------------------------
    // Create new panel
    // --------------------------------------------------------

    try {

        const created =
            await message.channel.send(
                panelPayload
            );

        panelMessages.set(
            playerId,
            created
        );

        return created;

    } catch (error) {

        console.error(
            '❌ Could not send music panel:',
            error
        );

        return null;
    }
}

// ============================================================
// UPDATE EXISTING PANEL
// ============================================================

async function updateExistingPanel(
    playerId
) {

    const existing =
        panelMessages.get(
            playerId
        );

    if (
        !existing
    ) {

        return null;
    }

    try {

        await existing.edit(
            panel.buildPanel(
                playerId
            )
        );

        return existing;

    } catch (error) {

        console.warn(
            `⚠️ Could not update music panel [${playerId}].`
        );

        panelMessages.delete(
            playerId
        );

        return null;
    }
}

// ============================================================
// CAPABILITY RESULT
// ============================================================
//
// The panel is already sent by this point.
//
// Therefore there is deliberately NO "response" property.
//
// This is important because index.js does:
//
// if (route.response) {
//     safeReply(...)
// }
//
// With no response, index.js simply stops here and does not
// send an additional text message.
//
// ============================================================

function capabilityResult(
    data = {}
) {

    return {

        type:
            'capability',

        capability:
            name,

        data
    };
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

    // ========================================================
    // INVALID PLAYER CONTEXT
    // ========================================================

    if (
        !playerId
    ) {

        console.error(
            '❌ Music capability has no player context.'
        );

        return capabilityResult({

            action:
                'error',

            reason:
                'missing_player_context'
        });
    }

    // ========================================================
    // ACTION
    // ========================================================

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

        await updateExistingPanel(
            playerId
        );

        return capabilityResult({

            action:
                'pause',

            playerId,

            result
        });
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

        await updateExistingPanel(
            playerId
        );

        return capabilityResult({

            action:
                'resume',

            playerId,

            result
        });
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

        await updateExistingPanel(
            playerId
        );

        return capabilityResult({

            action:
                'stop',

            playerId,

            result
        });
    }

    // ========================================================
    // SEARCH QUERY
    // ========================================================

    const query =
        extractQuery(
            message.content
        );

    if (
        !query
    ) {

        await sendOrUpdatePanel(
            message,
            playerId
        );

        return capabilityResult({

            action:
                'missing_query',

            playerId
        });
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

        return capabilityResult({

            action:
                'search_error',

            playerId,

            query
        });
    }

    // ========================================================
    // SEARCH FAILED
    // ========================================================

    if (
        !searchResult?.success
    ) {

        console.warn(
            `⚠️ Music search failed for: ${query}`
        );

        return capabilityResult({

            action:
                'search_failed',

            playerId,

            query
        });
    }

    // ========================================================
    // SELECT RESULT
    // ========================================================

    const selected =
        music.selectSearchResult(
            playerId,
            searchResult
        );

    if (
        !selected?.success
    ) {

        console.error(
            '❌ Could not select Audius result:',
            selected
        );

        return capabilityResult({

            action:
                'selection_failed',

            playerId,

            query
        });
    }

    const song =
        selected.song;

    console.log(
        `🎵 MUSIC SELECTED: ${song.title} — ${song.artist}`
    );

    // ========================================================
    // PANEL
    // ========================================================

    const panelMessage =
        await sendOrUpdatePanel(
            message,
            playerId
        );

    // ========================================================
    // RESULT
    // ========================================================

    return capabilityResult({

        action:
            'selected',

        playerId,

        song,

        panelMessageId:
            panelMessage?.id ||
            null
    });
}

// ============================================================
// PANEL CACHE CLEANUP
// ============================================================

function clearPanel(
    playerId
) {

    if (
        !playerId
    ) {

        return;
    }

    panelMessages.delete(
        String(
            playerId
        )
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    name,

    canHandle,

    execute,

    // Compatibility
    isMusicRequest,

    executeMusic:
        execute,

    // Helpers
    normalizeMessage,

    extractQuery,

    getMusicAction,

    getPlayerId,

    // Panel
    sendOrUpdatePanel,

    updateExistingPanel,

    clearPanel
};