require('dotenv').config();

const https = require('https');

// ============================================================
// STORAGE
// ============================================================

const guilds = new Map();

function getGuild(guildId) {

    if (!guilds.has(guildId)) {

        guilds.set(guildId, {
            song: null,
            state: 'stopped'
        });
    }

    return guilds.get(guildId);
}

// ============================================================
// HTTP JSON
// ============================================================

function requestJSON(url) {

    return new Promise((resolve, reject) => {

        https.get(
            url,
            {
                headers: {
                    'User-Agent': 'DuckAI/1.0'
                }
            },
            response => {

                let data = '';

                response.on(
                    'data',
                    chunk => {
                        data += chunk;
                    }
                );

                response.on(
                    'end',
                    () => {

                        if (
                            response.statusCode < 200 ||
                            response.statusCode >= 300
                        ) {

                            reject(
                                new Error(
                                    `HTTP ${response.statusCode}`
                                )
                            );

                            return;
                        }

                        try {

                            resolve(
                                JSON.parse(data)
                            );

                        } catch (error) {

                            reject(error);
                        }
                    }
                );
            }
        ).on(
            'error',
            reject
        );
    });
}

// ============================================================
// AUDIUS SEARCH
// ============================================================

async function search(query) {

    if (
        typeof query !== 'string' ||
        !query.trim()
    ) {

        return {
            success: false,
            message:
                '🎵 Diz-me qual música queres tocar.'
        };
    }

    const encoded =
        encodeURIComponent(
            query.trim()
        );

    const url =
        `https://discoveryprovider.audius.co/v1/tracks/search` +
        `?query=${encoded}` +
        `&limit=1`;

    try {

        const data =
            await requestJSON(url);

        const track =
            data?.data?.[0];

        if (!track) {

            return {
                success: false,
                message:
                    `🦆 Não encontrei **${query}**.`
            };
        }

        const streamUrl =
            `https://discoveryprovider.audius.co/v1/tracks/${track.id}/stream`;

        return {

            success: true,

            title:
                track.title ||
                query,

            artist:
                track.user?.name ||
                'Unknown artist',

            url:
                streamUrl,

            artwork:
                track.artwork?.['150x150'] ||
                track.artwork?.['480x480'] ||
                null,

            id:
                track.id
        };

    } catch (error) {

        console.error(
            '❌ Audius search error:',
            error
        );

        return {
            success: false,
            message:
                '🦆 Não consegui pesquisar no Audius.'
        };
    }
}

// ============================================================
// SAVE SONG
// ============================================================

function setSong({
    guildId,
    title,
    artist,
    url,
    artwork,
    id = null
}) {

    const guild =
        getGuild(guildId);

    guild.song = {
        id,
        title,
        artist,
        url,
        artwork
    };

    guild.state = 'stopped';

    return guild.song;
}

// ============================================================
// CURRENT SONG
// ============================================================

function getCurrentSong(guildId) {

    return getGuild(guildId).song;
}

// ============================================================
// STATE
// ============================================================

function getState(guildId) {

    return getGuild(guildId).state;
}

// ============================================================
// PLAY
// ============================================================

async function play(guildId) {

    const guild =
        getGuild(guildId);

    if (!guild.song?.url) {

        return {
            success: false,
            message:
                '🎵 No song selected.'
        };
    }

    guild.state = 'playing';

    return {
        success: true,
        message:
            `▶️ A tocar **${guild.song.title}**.`
    };
}

// ============================================================
// PAUSE
// ============================================================

function pause(guildId) {

    const guild =
        getGuild(guildId);

    if (!guild.song) {

        return {
            success: false,
            message:
                '🎵 No song selected.'
        };
    }

    guild.state = 'paused';

    return {
        success: true,
        message:
            '⏸️ Música pausada.'
    };
}

// ============================================================
// STOP
// ============================================================

function stop(guildId) {

    const guild =
        getGuild(guildId);

    guild.state = 'stopped';

    return {
        success: true,
        message:
            '⏹️ Música parada.'
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    search,
    setSong,
    getCurrentSong,
    getState,
    play,
    pause,
    stop
};