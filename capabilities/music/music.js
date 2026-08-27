// ============================================================
// DUCKAI — MUSIC ENGINE
// ============================================================
//
// Web Music Player backend.
//
// RESPONSIBILITIES:
//
// • Search Audius
// • Store selected song
// • Store player state
// • Provide current song information
// • Provide stream URL for the Web Player
// • Support play / pause / resume / stop state
// • Keep one independent player state per guild
//
// IMPORTANT:
//
// This module NEVER:
// • joins a Discord voice channel
// • plays audio through Discord
// • uses @discordjs/voice
//
// The actual audio is played ONLY by player.html.
//
// ============================================================

require('dotenv').config();

const https = require('https');

// ============================================================
// STORAGE
// ============================================================

const guilds = new Map();

// ============================================================
// CREATE GUILD STATE
// ============================================================

function createGuildState() {

    return {

        song: null,

        state: 'stopped',

        position: 0,

        volume: 1,

        updatedAt: Date.now()
    };
}

// ============================================================
// GET GUILD
// ============================================================

function getGuild(guildId) {

    if (
        !guilds.has(guildId)
    ) {

        guilds.set(
            guildId,
            createGuildState()
        );
    }

    return guilds.get(
        guildId
    );
}

// ============================================================
// VALIDATE GUILD ID
// ============================================================

function validGuildId(guildId) {

    return (
        typeof guildId === 'string' &&
        guildId.trim().length > 0
    );
}

// ============================================================
// HTTP JSON
// ============================================================

function requestJSON(url) {

    return new Promise(
        (resolve, reject) => {

            const request =
                https.get(

                    url,

                    {
                        headers: {

                            'User-Agent':
                                'DuckAI/1.0',

                            'Accept':
                                'application/json'
                        }
                    },

                    response => {

                        let data = '';

                        // --------------------------------------------
                        // Redirect
                        // --------------------------------------------

                        if (
                            response.statusCode >= 300 &&
                            response.statusCode < 400 &&
                            response.headers.location
                        ) {

                            response.resume();

                            requestJSON(
                                response.headers.location
                            )
                                .then(resolve)
                                .catch(reject);

                            return;
                        }

                        // --------------------------------------------
                        // HTTP error
                        // --------------------------------------------

                        if (
                            response.statusCode < 200 ||
                            response.statusCode >= 300
                        ) {

                            response.resume();

                            reject(
                                new Error(
                                    `HTTP ${response.statusCode}`
                                )
                            );

                            return;
                        }

                        response.on(
                            'data',
                            chunk => {

                                data += chunk;
                            }
                        );

                        response.on(
                            'end',
                            () => {

                                try {

                                    resolve(
                                        JSON.parse(
                                            data
                                        )
                                    );

                                } catch (
                                    error
                                ) {

                                    reject(
                                        error
                                    );
                                }
                            }
                        );
                    }
                );

            request.on(
                'error',
                reject
            );
        }
    );
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

            success:
                false,

            message:
                '🎵 Tell me which song you want to play.'
        };
    }

    const cleanQuery =
        query
            .trim()
            .slice(
                0,
                200
            );

    const encoded =
        encodeURIComponent(
            cleanQuery
        );

    const url =
        `https://discoveryprovider.audius.co/v1/tracks/search` +
        `?query=${encoded}` +
        `&limit=10`;

    try {

        const data =
            await requestJSON(
                url
            );

        const tracks =
            Array.isArray(
                data?.data
            )
                ? data.data
                : [];

        if (
            !tracks.length
        ) {

            return {

                success:
                    false,

                message:
                    `🦆 I couldn't find **${cleanQuery}**.`
            };
        }

        // --------------------------------------------------------
        // First result is the default selection.
        // --------------------------------------------------------

        const track =
            tracks[0];

        const streamUrl =
            `https://discoveryprovider.audius.co/v1/tracks/${track.id}/stream`;

        return {

            success:
                true,

            title:
                track.title ||
                cleanQuery,

            artist:
                track.user?.name ||
                'Unknown artist',

            url:
                streamUrl,

            artwork:
                track.artwork?.['1000x1000'] ||
                track.artwork?.['480x480'] ||
                track.artwork?.['150x150'] ||
                null,

            id:
                track.id,

            duration:
                Number.isFinite(
                    track.duration
                )
                    ? track.duration
                    : null,

            genre:
                track.genre ||
                null,

            description:
                track.description ||
                null,

            permalink:
                track.permalink ||
                null
        };

    } catch (
        error
    ) {

        console.error(
            '❌ Audius search error:',
            error
        );

        return {

            success:
                false,

            message:
                '🦆 I could not search Audius right now.'
        };
    }
}

// ============================================================
// SELECT SONG
// ============================================================

function setSong({
    guildId,
    title,
    artist,
    url,
    artwork = null,
    id = null,
    duration = null,
    genre = null,
    description = null,
    permalink = null
}) {

    if (
        !validGuildId(
            guildId
        )
    ) {

        return null;
    }

    if (
        typeof url !== 'string' ||
        !url.trim()
    ) {

        return null;
    }

    const guild =
        getGuild(
            guildId
        );

    guild.song = {

        id,

        title:
            title ||
            'Unknown title',

        artist:
            artist ||
            'Unknown artist',

        url,

        artwork,

        duration,

        genre,

        description,

        permalink
    };

    // Selecting a new song does NOT automatically play it.

    guild.state =
        'stopped';

    guild.position =
        0;

    guild.updatedAt =
        Date.now();

    return guild.song;
}

// ============================================================
// SET SONG FROM SEARCH RESULT
// ============================================================

function selectSearchResult(
    guildId,
    result
) {

    if (
        !result?.success
    ) {

        return {

            success:
                false,

            message:
                result?.message ||
                '🎵 No song found.'
        };
    }

    const song =
        setSong({

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
                result.id,

            duration:
                result.duration,

            genre:
                result.genre,

            description:
                result.description,

            permalink:
                result.permalink
        });

    if (
        !song
    ) {

        return {

            success:
                false,

            message:
                '🎵 I could not select that song.'
        };
    }

    return {

        success:
            true,

        song
    };
}

// ============================================================
// CURRENT SONG
// ============================================================

function getCurrentSong(
    guildId
) {

    return getGuild(
        guildId
    ).song;
}

// ============================================================
// CURRENT STATE
// ============================================================

function getState(
    guildId
) {

    const guild =
        getGuild(
            guildId
        );

    return {

        success:
            true,

        song:
            guild.song,

        state:
            guild.state,

        position:
            guild.position,

        volume:
            guild.volume,

        updatedAt:
            guild.updatedAt
    };
}

// ============================================================
// PLAY
// ============================================================
//
// IMPORTANT:
//
// This DOES NOT play audio.
//
// It only changes the backend state.
//
// player.html is responsible for:
//     audio.play()
//
// ============================================================

function play(
    guildId
) {

    const guild =
        getGuild(
            guildId
        );

    if (
        !guild.song?.url
    ) {

        return {

            success:
                false,

            message:
                '🎵 No song selected.'
        };
    }

    guild.state =
        'playing';

    guild.updatedAt =
        Date.now();

    return {

        success:
            true,

        state:
            guild.state,

        song:
            guild.song
    };
}

// ============================================================
// PAUSE
// ============================================================
//
// Backend state only.
//
// player.html performs:
//     audio.pause()
//
// ============================================================

function pause(
    guildId
) {

    const guild =
        getGuild(
            guildId
        );

    if (
        !guild.song
    ) {

        return {

            success:
                false,

            message:
                '🎵 No song selected.'
        };
    }

    guild.state =
        'paused';

    guild.updatedAt =
        Date.now();

    return {

        success:
            true,

        state:
            guild.state
    };
}

// ============================================================
// RESUME
// ============================================================

function resume(
    guildId
) {

    const guild =
        getGuild(
            guildId
        );

    if (
        !guild.song
    ) {

        return {

            success:
                false,

            message:
                '🎵 No song selected.'
        };
    }

    guild.state =
        'playing';

    guild.updatedAt =
        Date.now();

    return {

        success:
            true,

        state:
            guild.state
    };
}

// ============================================================
// STOP
// ============================================================

function stop(
    guildId
) {

    const guild =
        getGuild(
            guildId
        );

    guild.state =
        'stopped';

    guild.position =
        0;

    guild.updatedAt =
        Date.now();

    return {

        success:
            true,

        state:
            guild.state
    };
}

// ============================================================
// SEEK
// ============================================================

function seek(
    guildId,
    position
) {

    const guild =
        getGuild(
            guildId
        );

    const value =
        Number(
            position
        );

    if (
        !Number.isFinite(
            value
        ) ||
        value < 0
    ) {

        return {

            success:
                false,

            message:
                '🎵 Invalid playback position.'
        };
    }

    guild.position =
        value;

    guild.updatedAt =
        Date.now();

    return {

        success:
            true,

        position:
            guild.position
    };
}

// ============================================================
// VOLUME
// ============================================================

function setVolume(
    guildId,
    volume
) {

    const guild =
        getGuild(
            guildId
        );

    let value =
        Number(
            volume
        );

    if (
        !Number.isFinite(
            value
        )
    ) {

        return {

            success:
                false,

            message:
                '🎵 Invalid volume.'
        };
    }

    // Accept either 0–1 or 0–100.

    if (
        value > 1
    ) {

        value =
            value / 100;
    }

    value =
        Math.max(
            0,
            Math.min(
                1,
                value
            )
        );

    guild.volume =
        value;

    guild.updatedAt =
        Date.now();

    return {

        success:
            true,

        volume:
            guild.volume
    };
}

// ============================================================
// CLEAR SONG
// ============================================================

function clearSong(
    guildId
) {

    const guild =
        getGuild(
            guildId
        );

    guild.song =
        null;

    guild.state =
        'stopped';

    guild.position =
        0;

    guild.updatedAt =
        Date.now();

    return {

        success:
            true
    };
}

// ============================================================
// DESTROY GUILD STATE
// ============================================================

function destroyGuild(
    guildId
) {

    guilds.delete(
        guildId
    );

    return {

        success:
            true
    };
}

// ============================================================
// LIST ACTIVE GUILDS
// ============================================================

function getGuilds() {

    return Array.from(
        guilds.entries()
    ).map(
        (
            [
                guildId,
                guild
            ]
        ) => ({

            guildId,

            song:
                guild.song,

            state:
                guild.state,

            position:
                guild.position,

            volume:
                guild.volume,

            updatedAt:
                guild.updatedAt
        })
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    // Search
    search,

    // Song
    setSong,
    selectSearchResult,
    getCurrentSong,
    clearSong,

    // State
    getState,

    // Playback state
    play,
    pause,
    resume,
    stop,

    // Player controls
    seek,
    setVolume,

    // Management
    destroyGuild,
    getGuilds
};