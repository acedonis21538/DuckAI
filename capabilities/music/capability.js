'use strict';

// ============================================================
// DUCKAI — MUSIC CAPABILITY
// ============================================================
//
// Music request entry point.
//
// Responsibilities:
//
// • Detect music requests.
// • Extract the requested song.
// • Send the request to music.js.
// • Let music.js handle search / queue / playback state.
// • Update the Discord music panel.
//
// This file does NOT:
//
// • Search YouTube directly.
// • Extract audio.
// • Run yt-dlp.
// • Create Voice connections.
// • Handle Discord interactions.
// • Manage the web player.
//
// FLOW:
//
// Discord message
//      ↓
// router.js
//      ↓
// capability.js
//      ↓
// music.js
//      ↓
// yt.js
//      ↓
// resolver.js
//      ↓
// ytStream.js
//      ↓
// player.js
//
// ============================================================

const music = require('./music');
const panel = require('./panel');

const name = 'music';

// ============================================================
// PANEL CACHE
// ============================================================
//
// One music panel per guild/player.
//
// ============================================================

const panelMessages = new Map();

// ============================================================
// NORMALIZE MESSAGE
// ============================================================

function normalizeMessage(content) {

    if (typeof content !== 'string') {
        return '';
    }

    let text = content.trim();

    // Discord mention
    text = text.replace(
        /^<@!?\d+>\s*/i,
        ''
    );

    // DuckAI / @DuckAI
    text = text.replace(
        /^@?duck\s*ai[\s,:-]*/i,
        ''
    );

    return text.trim();
}

// ============================================================
// MUSIC REQUEST DETECTION
// ============================================================

function isMusicRequest(message) {

    if (
        !message ||
        typeof message.content !== 'string'
    ) {
        return false;
    }

    const text = normalizeMessage(
        message.content
    ).toLowerCase();

    if (!text) {
        return false;
    }

    // Explicit music commands / natural language
    const patterns = [

        // English
        /^play\b/,
        /^playing\b/,
        /^play\s+me\b/,
        /^listen\b/,
        /^listen\s+to\b/,
        /^put\s+on\b/,
        /^queue\b/,
        /^add\b/,

        // Portuguese
        /^toca\b/,
        /^tocar\b/,
        /^toque\b/,
        /^ouve\b/,
        /^ouvir\b/,
        /^quero\s+ouvir\b/,
        /^mete\s+m[uú]sica\b/,
        /^mete\s+uma\s+m[uú]sica\b/,

        // Playback
        /^pause\b/,
        /^resume\b/,
        /^stop\b/,
        /^skip\b/,
        /^next\b/,
        /^repeat\b/,

        /^pausa\b/,
        /^pausar\b/,
        /^retoma\b/,
        /^retomar\b/,
        /^continua\b/,
        /^continuar\b/,
        /^parar\b/,
        /^salta\b/,
        /^seguinte\b/,
        /^repetir\b/
    ];

    if (
        patterns.some(
            pattern => pattern.test(text)
        )
    ) {
        return true;
    }

    // Natural references
    const musicWords = [
        /\bmusic\b/,
        /\bm[uú]sica\b/,
        /\bsong\b/,
        /\btrack\b/,
        /\bfaixa\b/,
        /\bcan[cç][aã]o\b/,
        /\bplaylist\b/
    ];

    return musicWords.some(
        pattern => pattern.test(text)
    );
}

// ============================================================
// CAN HANDLE
// ============================================================

function canHandle(message) {

    console.log(
        '🎵 MUSIC CAPABILITY CHECK:',
        message?.content
    );

    return isMusicRequest(message);
}

// ============================================================
// EXTRACT QUERY
// ============================================================
//
// Examples:
//
// play Paradise
// play Paradise by Coldplay
// DuckAI, play Paradise
// toca Paradise
//
// → Paradise
//
// ============================================================

function extractQuery(content) {

    let text = normalizeMessage(content);

    // Explicit prefixes
    const prefixes = [

        /^(?:please\s+)?play\s+me\s+/i,
        /^(?:please\s+)?play\s+/i,
        /^playing\s+/i,

        /^(?:listen\s+to|listen)\s+/i,

        /^put\s+on\s+/i,

        /^(?:please\s+)?(?:toca|tocar|toque)\s+/i,

        /^(?:quero\s+)?(?:ouvir|ouve)\s+/i,

        /^mete\s+(?:uma\s+)?m[uú]sica\s*/i,

        /^(?:queue|add)\s+/i
    ];

    for (const prefix of prefixes) {

        if (prefix.test(text)) {

            text = text.replace(
                prefix,
                ''
            );

            break;
        }
    }

    // Remove quotes
    text = text
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

function getMusicAction(content) {

    const text = normalizeMessage(
        content
    ).toLowerCase();

    // Pause
    if (
        /^(?:pause|pausa|pausar)\b/.test(text)
    ) {
        return 'pause';
    }

    // Resume
    if (
        /^(?:resume|retoma|retomar|continua|continuar)\b/.test(text)
    ) {
        return 'resume';
    }

    // Stop
    if (
        /^(?:stop|parar)\b/.test(text)
    ) {
        return 'stop';
    }

    // Skip
    if (
        /^(?:skip|next|salta|seguinte)\b/.test(text)
    ) {
        return 'skip';
    }

    // Repeat
    if (
        /^(?:repeat|repetir)\b/.test(text)
    ) {
        return 'repeat';
    }

    return 'search';
}

// ============================================================
// PLAYER ID
// ============================================================

function getPlayerId(message) {

    if (message?.guildId) {
        return String(message.guildId);
    }

    if (message?.guild?.id) {
        return String(message.guild.id);
    }

    if (message?.author?.id) {
        return `dm:${message.author.id}`;
    }

    return null;
}

// ============================================================
// PANEL
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
            '❌ Music panel cannot access message channel.'
        );

        return null;
    }

    let payload;

    try {

        payload = panel.buildPanel(
            playerId
        );

    } catch (error) {

        console.error(
            '❌ Could not build music panel:',
            error
        );

        return null;
    }

    // Existing panel
    const existing =
        panelMessages.get(playerId);

    if (existing) {

        try {

            await existing.edit(
                payload
            );

            return existing;

        } catch {

            panelMessages.delete(
                playerId
            );
        }
    }

    // New panel
    try {

        const created =
            await message.channel.send(
                payload
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
// UPDATE PANEL
// ============================================================

async function updateExistingPanel(
    playerId
) {

    const existing =
        panelMessages.get(playerId);

    if (!existing) {
        return null;
    }

    try {

        await existing.edit(
            panel.buildPanel(playerId)
        );

        return existing;

    } catch {

        panelMessages.delete(
            playerId
        );

        return null;
    }
}

// ============================================================
// CAPABILITY RESULT
// ============================================================

function capabilityResult(data = {}) {

    return {

        type: 'capability',

        capability: name,

        data
    };
}

// ============================================================
// EXECUTE
// ============================================================

async function execute(message) {

    console.log(
        '🎵 MUSIC CAPABILITY EXECUTED'
    );

    const playerId =
        getPlayerId(message);

    if (!playerId) {

        console.error(
            '❌ Music capability has no player context.'
        );

        return capabilityResult({

            action: 'error',

            reason: 'missing_player_context'
        });
    }

    const action =
        getMusicAction(
            message.content
        );

    // ========================================================
    // PLAYBACK ACTIONS
    // ========================================================

    if (action !== 'search') {

        let result;

        try {

            switch (action) {

                case 'pause':
                    result = await music.pause(
                        playerId
                    );
                    break;

                case 'resume':
                    result = await music.resume(
                        playerId
                    );
                    break;

                case 'stop':
                    result = await music.stop(
                        playerId
                    );
                    break;

                case 'skip':
                    result = await music.skip(
                        playerId
                    );
                    break;

                case 'repeat':
                    result = await music.repeat(
                        playerId
                    );
                    break;

                default:
                    result = {
                        success: false,
                        reason: 'unknown_action'
                    };
            }

        } catch (error) {

            console.error(
                `❌ Music action failed [${action}]:`,
                error
            );

            result = {

                success: false,

                reason: 'action_failed',

                error: error.message
            };
        }

        await updateExistingPanel(
            playerId
        );

        return capabilityResult({

            action,

            playerId,

            result
        });
    }

    // ========================================================
    // SEARCH
    // ========================================================

    const query =
        extractQuery(
            message.content
        );

    if (!query) {

        await sendOrUpdatePanel(
            message,
            playerId
        );

        return capabilityResult({

            action: 'missing_query',

            playerId
        });
    }

    console.log(
        '🎵 MUSIC QUERY:',
        query
    );

    // ========================================================
    // MUSIC.JS OWNS SEARCH + QUEUE + PLAYER FLOW
    // ========================================================

    let result;

    try {

        result =
            await music.request(
                playerId,
                {
                    query,

                    message
                }
            );

    } catch (error) {

        console.error(
            '❌ Music request failed:',
            error
        );

        return capabilityResult({

            action: 'request_error',

            playerId,

            query,

            error: error.message
        });
    }

    // ========================================================
    // UPDATE PANEL
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
            result?.action ||
            'request',

        playerId,

        query,

        result,

        panelMessageId:
            panelMessage?.id ||
            null
    });
}

// ============================================================
// PANEL CACHE CLEANUP
// ============================================================

function clearPanel(playerId) {

    if (!playerId) {
        return;
    }

    panelMessages.delete(
        String(playerId)
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

    executeMusic: execute,

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