'use strict';

// ============================================================
// DUCKAI — MUSIC ENGINE
// ============================================================
//
// Responsibilities:
//
// • Search music through the multi-source resolver
// • Store selected song
// • Join Discord Voice
// • Stream direct audio sources into Discord Voice
// • Play / Pause / Resume / Stop
// • Leave Voice
// • Volume control
// • Independent state per guild
// • Prevent concurrent playback initialization
//
// Sources:
//
// • YouTube
//     → search / metadata / matching
//     → Web Player / selection
//
// • Audius
//     → direct audio stream
//     → FFmpeg
//     → Discord Voice
//
// IMPORTANT:
//
// YouTube webpage URLs are never passed to FFmpeg.
// yt-dlp is not used by this engine.
//
// ============================================================

require('dotenv').config();

// ============================================================
// CORE DEPENDENCIES
// ============================================================

const https =
    require('https');

const {
    spawn
} =
    require('child_process');

const ffmpegPath =
    require('ffmpeg-static');

// ============================================================
// MUSIC RESOLVER
// ============================================================

const resolver =
    require('./sources/resolver');

// ============================================================
// AUDIUS PROVIDER
// ============================================================
//
// Used as the direct playable fallback when the selected
// result is a YouTube track.
//
// ============================================================

const audius =
    require('./sources/audius');

// ============================================================
// DISCORD VOICE
// ============================================================

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    StreamType,
    entersState
} =
    require('@discordjs/voice');

// ============================================================
// STORAGE
// ============================================================

const guilds =
    new Map();

const playLocks =
    new Set();

// ============================================================
// CREATE GUILD STATE
// ============================================================

function createGuildState() {

    const player =
        createAudioPlayer({

            behaviors: {

                noSubscriber:
                    NoSubscriberBehavior.Pause
            }
        });

    const guild = {

        song:
            null,

        state:
            'stopped',

        position:
            0,

        volume:
            1,

        connection:
            null,

        player,

        resource:
            null,

        inputStream:
            null,

        ffmpeg:
            null,

        updatedAt:
            Date.now()
    };

    // ========================================================
    // PLAYER EVENTS
    // ========================================================

    player.on(
        AudioPlayerStatus.Playing,
        () => {

            guild.state =
                'playing';

            guild.updatedAt =
                Date.now();
        }
    );

    player.on(
        AudioPlayerStatus.Paused,
        () => {

            guild.state =
                'paused';

            guild.updatedAt =
                Date.now();
        }
    );

    player.on(
        AudioPlayerStatus.Idle,
        () => {

            guild.state =
                'stopped';

            guild.resource =
                null;

            guild.updatedAt =
                Date.now();

            cleanupStream(
                guild
            );
        }
    );

    player.on(
        'error',
        error => {

            console.error(
                '❌ Discord audio player error:',
                error
            );

            guild.state =
                'stopped';

            guild.resource =
                null;

            guild.updatedAt =
                Date.now();

            cleanupStream(
                guild
            );
        }
    );

    return guild;
}

// ============================================================
// GET GUILD
// ============================================================

function getGuild(
    guildId
) {

    if (
        !guilds.has(
            guildId
        )
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
// VALID GUILD ID
// ============================================================

function validGuildId(
    guildId
) {

    return (
        typeof guildId === 'string' &&
        guildId.trim().length > 0
    );
}

// ============================================================
// MUSIC SEARCH
// ============================================================

async function search(
    query
) {

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

    try {

        console.log(
            `🔎 MUSIC SEARCH: ${cleanQuery}`
        );

        const result =
            await resolver.search(
                cleanQuery
            );

        if (
            !result?.success
        ) {

            return {

                success:
                    false,

                message:
                    result?.message ||
                    `🦆 I couldn't find **${cleanQuery}**.`
            };
        }

        if (
            typeof result.url !== 'string' ||
            !result.url.trim()
        ) {

            return {

                success:
                    false,

                message:
                    `🦆 I found **${result.title}**, but the result has no URL.`
            };
        }

        const normalized = {

            success:
                true,

            title:
                result.title ||
                cleanQuery,

            artist:
                result.artist ||
                'Unknown artist',

            url:
                result.url,

            source:
                result.source ||
                'unknown',

            artwork:
                result.artwork ||
                null,

            id:
                result.id ||
                null,

            channelId:
                result.channelId ||
                null,

            channelTitle:
                result.channelTitle ||
                null,

            duration:
                Number.isFinite(
                    result.duration
                )
                    ? result.duration
                    : null,

            genre:
                result.genre ||
                null,

            description:
                result.description ||
                null,

            permalink:
                result.permalink ||
                result.url,

            playable:
                result.playable === true
        };

        console.log(
            `🎯 MUSIC RESULT: ${normalized.title} — ${normalized.artist}`
        );

        console.log(
            `📡 MUSIC SOURCE: ${normalized.source}`
        );

        console.log(
            `🔊 MUSIC PLAYABLE: ${normalized.playable ? 'yes' : 'no'}`
        );

        return normalized;

    } catch (error) {

        console.error(
            '❌ Multi-source music search error:',
            error
        );

        return {

            success:
                false,

            message:
                '🦆 I could not search for that song right now.'
        };
    }
}

// ============================================================
// HTTP JSON REQUEST
// ============================================================

function requestJSON(
    url
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

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

                        let data =
                            '';

                        response.on(
                            'data',
                            chunk => {

                                data +=
                                    chunk;
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
// SET SONG
// ============================================================

function setSong({
    guildId,
    title,
    artist,
    url,
    source = null,
    artwork = null,
    id = null,
    channelId = null,
    channelTitle = null,
    duration = null,
    genre = null,
    description = null,
    permalink = null,
    playable = false
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

    stopPlayback(
        guild
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

        source,

        artwork,

        channelId,

        channelTitle,

        duration,

        genre,

        description,

        permalink,

        playable:
            playable === true,

        // ----------------------------------------------------
        // Optional direct Voice fallback.
        //
        // Used when the selected source is YouTube.
        // ----------------------------------------------------

        voiceSource:
            null,

        voiceUrl:
            null,

        voiceId:
            null
    };

    guild.state =
        'stopped';

    guild.position =
        0;

    guild.updatedAt =
        Date.now();

    return guild.song;
}

// ============================================================
// SELECT SEARCH RESULT
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

            source:
                result.source,

            artwork:
                result.artwork,

            id:
                result.id,

            channelId:
                result.channelId,

            channelTitle:
                result.channelTitle,

            duration:
                result.duration,

            genre:
                result.genre,

            description:
                result.description,

            permalink:
                result.permalink,

            playable:
                result.playable
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
// STATE
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

        connected:
            Boolean(
                guild.connection
            ),

        channelId:
            guild.connection
                ?.joinConfig
                ?.channelId ||
            null,

        updatedAt:
            guild.updatedAt
    };
}

// ============================================================
// CREATE DIRECT AUDIO STREAM
// ============================================================
//
// Only direct media URLs should reach this function.
//
// YouTube webpage URLs must never be sent here.
//
// ============================================================

function createAudioStream(
    url
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            if (
                typeof url !== 'string' ||
                !url.trim()
            ) {

                reject(
                    new Error(
                        'Audio URL is empty.'
                    )
                );

                return;
            }

            const request =
                https.get(

                    url,

                    {

                        headers: {

                            'User-Agent':
                                'DuckAI/1.0',

                            'Accept':
                                'audio/*'
                        }
                    },

                    response => {

                        // ------------------------------------------------
                        // Redirect
                        // ------------------------------------------------

                        if (
                            response.statusCode >= 300 &&
                            response.statusCode < 400 &&
                            response.headers.location
                        ) {

                            response.resume();

                            createAudioStream(
                                response.headers.location
                            )
                                .then(resolve)
                                .catch(reject);

                            return;
                        }

                        // ------------------------------------------------
                        // HTTP error
                        // ------------------------------------------------

                        if (
                            response.statusCode < 200 ||
                            response.statusCode >= 300
                        ) {

                            response.resume();

                            reject(
                                new Error(
                                    `Audio stream HTTP ${response.statusCode}`
                                )
                            );

                            return;
                        }

                        resolve(
                            response
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
// CONNECT VOICE
// ============================================================

async function connectVoice(
    interaction,
    guildId
) {

    if (
        !interaction?.guild
    ) {

        return {

            success:
                false,

            message:
                '🔊 I can only join a Voice Channel inside a server.'
        };
    }

    let member;

    try {

        member =
            await interaction.guild.members.fetch(
                interaction.user.id
            );

    } catch (error) {

        console.error(
            '❌ Could not fetch GuildMember:',
            error
        );

        return {

            success:
                false,

            message:
                '🔊 I could not determine your Voice Channel.'
        };
    }

    const voiceChannel =
        member?.voice?.channel;

    if (
        !voiceChannel
    ) {

        return {

            success:
                false,

            message:
                '🔊 Join a Voice Channel first.'
        };
    }

    if (
        typeof voiceChannel.isVoiceBased ===
            'function' &&
        !voiceChannel.isVoiceBased()
    ) {

        return {

            success:
                false,

            message:
                '🔊 That is not a valid Voice Channel.'
        };
    }

    const guild =
        getGuild(
            guildId
        );

    // ========================================================
    // ALREADY CONNECTED
    // ========================================================

    if (
        guild.connection
    ) {

        const currentChannelId =
            guild.connection
                .joinConfig
                ?.channelId;

        if (
            currentChannelId ===
            voiceChannel.id
        ) {

            try {

                guild.connection.subscribe(
                    guild.player
                );

            } catch {}

            return {

                success:
                    true,

                channelId:
                    voiceChannel.id,

                channelName:
                    voiceChannel.name
            };
        }

        try {

            guild.connection.destroy();

        } catch {}

        guild.connection =
            null;
    }

    // ========================================================
    // JOIN
    // ========================================================

    let connection;

    try {

        connection =
            joinVoiceChannel({

                channelId:
                    voiceChannel.id,

                guildId:
                    guildId,

                adapterCreator:
                    interaction.guild
                        .voiceAdapterCreator,

                selfDeaf:
                    true,

                selfMute:
                    false
            });

    } catch (error) {

        console.error(
            '❌ joinVoiceChannel() failed:',
            error
        );

        return {

            success:
                false,

            message:
                '🔊 I could not create the Voice connection.'
        };
    }

    guild.connection =
        connection;

    // ========================================================
    // VOICE LOGGING
    // ========================================================

    connection.on(
        'stateChange',
        (
            oldState,
            newState
        ) => {

            console.log(
                `🔊 VOICE STATE [${guildId}]: ${oldState.status} → ${newState.status}`
            );
        }
    );

    connection.on(
        'error',
        error => {

            console.error(
                `❌ VOICE CONNECTION ERROR [${guildId}]:`,
                error
            );
        }
    );

    connection.on(
        VoiceConnectionStatus.Ready,
        () => {

            console.log(
                `✅ VOICE READY [${guildId}]`
            );
        }
    );

    connection.on(
        VoiceConnectionStatus.Disconnected,
        () => {

            console.warn(
                `⚠️ VOICE DISCONNECTED [${guildId}]`
            );
        }
    );

    // ========================================================
    // SUBSCRIBE
    // ========================================================

    try {

        connection.subscribe(
            guild.player
        );

    } catch (error) {

        console.error(
            '❌ Voice player subscription failed:',
            error
        );

        try {

            connection.destroy();

        } catch {}

        guild.connection =
            null;

        return {

            success:
                false,

            message:
                '🔊 I could not attach the player to Voice.'
        };
    }

    // ========================================================
    // WAIT READY
    // ========================================================

    try {

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            30_000
        );

    } catch (error) {

        console.error(
            `❌ Voice connection did not become ready [${guildId}]:`,
            error
        );

        console.error(
            `🔎 Final Voice state: ${connection.state.status}`
        );

        try {

            connection.destroy();

        } catch {}

        if (
            guild.connection ===
            connection
        ) {

            guild.connection =
                null;
        }

        return {

            success:
                false,

            message:
                '🔊 Discord Voice connection timed out.'
        };
    }

    console.log(
        `🔊 Connected to "${voiceChannel.name}".`
    );

    return {

        success:
            true,

        channelId:
            voiceChannel.id,

        channelName:
            voiceChannel.name
    };
}

// ============================================================
// CLEAN STREAM
// ============================================================

function cleanupStream(
    guild
) {

    if (
        guild.inputStream
    ) {

        try {

            guild.inputStream.destroy();

        } catch {}

        guild.inputStream =
            null;
    }

    if (
        guild.ffmpeg
    ) {

        try {

            if (
                guild.ffmpeg.stdin &&
                !guild.ffmpeg.stdin.destroyed
            ) {

                guild.ffmpeg.stdin.destroy();
            }

        } catch {}

        try {

            guild.ffmpeg.kill(
                'SIGKILL'
            );

        } catch {}

        guild.ffmpeg =
            null;
    }

    guild.resource =
        null;
}

// ============================================================
// STOP PLAYBACK
// ============================================================

function stopPlayback(
    guild
) {

    try {

        guild.player.stop(
            true
        );

    } catch {}

    cleanupStream(
        guild
    );

    guild.state =
        'stopped';

    guild.position =
        0;

    guild.updatedAt =
        Date.now();
}

// ============================================================
// FIND AUDIUS FALLBACK
// ============================================================
//
// Used when YouTube wins the resolver.
//
// The selected YouTube metadata remains the song shown in the
// Web Player and Discord panel.
//
// Audius only supplies the direct playable audio stream.
//
// ============================================================

async function findAudiusFallback(
    song
) {

    if (
        !song
    ) {

        return null;
    }

    const query =
        `${song.title} ${song.artist}`;

    console.log(
        `🔁 Audius fallback search: ${query}`
    );

    try {

        const raw =
            await audius.search(
                query
            );

        const items =
            Array.isArray(raw)
                ? raw
                : raw
                    ? [raw]
                    : [];

        const titleTarget =
            String(
                song.title ||
                ''
            )
                .toLowerCase()
                .trim();

        const artistTarget =
            String(
                song.artist ||
                ''
            )
                .toLowerCase()
                .trim();

        const candidates =
            items
                .filter(
                    item =>
                        item &&
                        item.success !== false &&
                        typeof item.url === 'string' &&
                        item.url.trim()
                )
                .map(
                    item => {

                        const title =
                            String(
                                item.title ||
                                ''
                            )
                                .toLowerCase()
                                .trim();

                        const artist =
                            String(
                                item.artist ||
                                ''
                            )
                                .toLowerCase()
                                .trim();

                        let score =
                            0;

                        // Exact title.

                        if (
                            title &&
                            title ===
                                titleTarget
                        ) {

                            score +=
                                100;
                        }

                        // Exact artist.

                        if (
                            artist &&
                            artist ===
                                artistTarget
                        ) {

                            score +=
                                100;
                        }

                        // Partial title.

                        if (
                            title &&
                            titleTarget &&
                            (
                                title.includes(
                                    titleTarget
                                ) ||
                                titleTarget.includes(
                                    title
                                )
                            )
                        ) {

                            score +=
                                50;
                        }

                        // Partial artist.

                        if (
                            artist &&
                            artistTarget &&
                            (
                                artist.includes(
                                    artistTarget
                                ) ||
                                artistTarget.includes(
                                    artist
                                )
                            )
                        ) {

                            score +=
                                50;
                        }

                        if (
                            item.artwork
                        ) {

                            score +=
                                5;
                        }

                        if (
                            item.id
                        ) {

                            score +=
                                3;
                        }

                        return {

                            item,

                            score
                        };
                    }
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b.score -
                        a.score
                );

        const best =
            candidates[0]?.item;

        if (
            !best
        ) {

            console.warn(
                `⚠️ No Audius fallback found for "${song.title}"`
            );

            return null;
        }

        console.log(
            `✅ Audius fallback found: ${best.title} — ${best.artist}`
        );

        return best;

    } catch (error) {

        console.error(
            '❌ Audius fallback search failed:',
            error
        );

        return null;
    }
}

// ============================================================
// PREPARE VOICE SOURCE
// ============================================================
//
// Returns a direct playable source for Discord.
//
// Audius:
//   use selected URL directly.
//
// YouTube:
//   search Audius for an equivalent playable track.
//
// ============================================================

async function prepareVoiceSource(
    guild
) {

    if (
        !guild?.song
    ) {

        return {

            success:
                false,

            message:
                '🎵 No song selected.'
        };
    }

    // ========================================================
    // AUDIUS
    // ========================================================

    if (
        guild.song.source ===
        'audius'
    ) {

        if (
            typeof guild.song.url !== 'string' ||
            !guild.song.url.trim()
        ) {

            return {

                success:
                    false,

                message:
                    '🎵 The selected Audius track has no playable stream.'
            };
        }

        guild.song.voiceSource =
            'audius';

        guild.song.voiceUrl =
            guild.song.url;

        guild.song.voiceId =
            guild.song.id ||
            null;

        return {

            success:
                true,

            url:
                guild.song.url,

            source:
                'audius'
        };
    }

    // ========================================================
    // YOUTUBE
    // ========================================================

    if (
        guild.song.source ===
        'youtube'
    ) {

        const fallback =
            await findAudiusFallback(
                guild.song
            );

        if (
            !fallback
        ) {

            return {

                success:
                    false,

                message:
                    `🎵 I found **${guild.song.title}** on YouTube, but I couldn't find a playable audio source for Discord.`
            };
        }

        guild.song.voiceSource =
            'audius';

        guild.song.voiceUrl =
            fallback.url;

        guild.song.voiceId =
            fallback.id ||
            null;

        return {

            success:
                true,

            url:
                fallback.url,

            source:
                'audius'
        };
    }

    // ========================================================
    // UNKNOWN SOURCE
    // ========================================================

    return {

        success:
            false,

        message:
            '🎵 This source does not provide a direct playable audio stream.'
    };
}

// ============================================================
// PLAY FROM WEB PLAYER
// ============================================================
//
// Called by:
//
// POST /api/music/play
//
// This function does NOT receive a Discord Interaction.
//
// The bot must already have a Voice connection for the guild.
//
// ============================================================

async function playFromWeb(
    guildId
) {

    if (
        !validGuildId(
            guildId
        )
    ) {

        return {

            success:
                false,

            message:
                '🎵 Invalid server.'
        };
    }

    if (
        playLocks.has(
            guildId
        )
    ) {

        return {

            success:
                false,

            message:
                '🔊 The player is already starting.'
        };
    }

    playLocks.add(
        guildId
    );

    try {

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

        if (
            !guild.connection
        ) {

            return {

                success:
                    false,

                message:
                    '🔊 The bot is not connected to a Voice Channel.'
            };
        }

        if (
            !ffmpegPath
        ) {

            return {

                success:
                    false,

                message:
                    '🦆 FFmpeg is not available.'
            };
        }

        // ====================================================
        // PREPARE SOURCE
        // ====================================================

        const voiceSource =
            await prepareVoiceSource(
                guild
            );

        if (
            !voiceSource.success
        ) {

            return voiceSource;
        }

        // ====================================================
        // STOP OLD PLAYBACK
        // ====================================================

        stopPlayback(
            guild
        );

        // ====================================================
        // SUBSCRIBE
        // ====================================================

        try {

            guild.connection.subscribe(
                guild.player
            );

        } catch {}

        // ====================================================
        // OPEN DIRECT STREAM
        // ====================================================

        try {

            guild.inputStream =
                await createAudioStream(
                    voiceSource.url
                );

        } catch (error) {

            console.error(
                '❌ Could not open Voice source:',
                error
            );

            return {

                success:
                    false,

                message:
                    '🎵 I could not open the audio source for Discord.'
            };
        }

        // ====================================================
        // STREAM ERRORS
        // ====================================================

        guild.inputStream.on(
            'error',
            error => {

                console.error(
                    '❌ Voice source stream error:',
                    error
                );
            }
        );

        // ====================================================
        // FFMPEG
        // ====================================================

        let ffmpeg;

        try {

            ffmpeg =
                spawn(

                    ffmpegPath,

                    [

                        '-hide_banner',

                        '-loglevel',
                        'error',

                        '-i',
                        'pipe:0',

                        '-vn',

                        '-map_metadata',
                        '-1',

                        '-ac',
                        '2',

                        '-ar',
                        '48000',

                        '-c:a',
                        'libopus',

                        '-b:a',
                        '160k',

                        '-f',
                        'ogg',

                        'pipe:1'
                    ],

                    {

                        stdio: [
                            'pipe',
                            'pipe',
                            'pipe'
                        ]
                    }
                );

        } catch (error) {

            console.error(
                '❌ Failed to start FFmpeg:',
                error
            );

            cleanupStream(
                guild
            );

            return {

                success:
                    false,

                message:
                    '🦆 I could not start FFmpeg.'
            };
        }

        guild.ffmpeg =
            ffmpeg;

        let ffmpegError =
            '';

        ffmpeg.stderr.on(
            'data',
            chunk => {

                ffmpegError +=
                    chunk.toString();

                if (
                    ffmpegError.length >
                    5000
                ) {

                    ffmpegError =
                        ffmpegError.slice(
                            -5000
                        );
                }
            }
        );

        ffmpeg.stdin.on(
            'error',
            error => {

                if (
                    error.code !==
                    'EPIPE'
                ) {

                    console.error(
                        '❌ FFmpeg stdin error:',
                        error
                    );
                }
            }
        );

        ffmpeg.stdout.on(
            'error',
            error => {

                console.error(
                    '❌ FFmpeg stdout error:',
                    error
                );
            }
        );

        ffmpeg.on(
            'error',
            error => {

                console.error(
                    '❌ FFmpeg process error:',
                    error
                );
            }
        );

        // ====================================================
        // AUDIO RESOURCE
        // ====================================================

        try {

            guild.resource =
                createAudioResource(

                    ffmpeg.stdout,

                    {

                        inputType:
                            StreamType.OggOpus,

                        inlineVolume:
                            true
                    }
                );

        } catch (error) {

            console.error(
                '❌ Could not create Discord audio resource:',
                error
            );

            cleanupStream(
                guild
            );

            return {

                success:
                    false,

                message:
                    '🎵 I could not create the Discord audio resource.'
            };
        }

        // ====================================================
        // VOLUME
        // ====================================================

        if (
            guild.resource?.volume
        ) {

            guild.resource.volume.setVolume(
                guild.volume
            );
        }

        // ====================================================
        // PIPE
        // ====================================================

        try {

            guild.inputStream.pipe(
                ffmpeg.stdin
            );

        } catch (error) {

            console.error(
                '❌ Could not pipe source to FFmpeg:',
                error
            );

            cleanupStream(
                guild
            );

            return {

                success:
                    false,

                message:
                    '🎵 I could not process the audio source.'
            };
        }

        // ====================================================
        // FFMPEG CLOSE
        // ====================================================

        ffmpeg.on(
            'close',
            code => {

                if (
                    code !== 0 &&
                    guild.state ===
                        'playing'
                ) {

                    console.error(
                        `❌ FFmpeg exited with code ${code}:`,
                        ffmpegError
                    );
                }
            }
        );

        // ====================================================
        // PLAY
        // ====================================================

        try {

            guild.player.play(
                guild.resource
            );

        } catch (error) {

            console.error(
                '❌ Could not start Discord player:',
                error
            );

            cleanupStream(
                guild
            );

            return {

                success:
                    false,

                message:
                    '🔊 I could not start Discord playback.'
            };
        }

        guild.state =
            'playing';

        guild.position =
            0;

        guild.updatedAt =
            Date.now();

        console.log(
            `🔊 Discord playback started: ${guild.song.title} — ${guild.song.artist}`
        );

        console.log(
            `📡 Voice source: ${voiceSource.source}`
        );

        return {

            success:
                true,

            state:
                'playing',

            song:
                guild.song,

            voiceSource:
                voiceSource.source,

            channelId:
                guild.connection
                    ?.joinConfig
                    ?.channelId ||
                null
        };

    } finally {

        playLocks.delete(
            guildId
        );
    }
}

// ============================================================
// PLAY
// ============================================================
//
// Discord Interaction version.
//
// Audius:
//     direct stream → Discord.
//
// YouTube:
//     use the Audius fallback for Discord.
//
// ============================================================

async function play(
    interaction,
    guildId
) {

    if (
        !validGuildId(
            guildId
        )
    ) {

        return {

            success:
                false,

            message:
                '🎵 Invalid server.'
        };
    }

    // ========================================================
    // CONNECT
    // ========================================================
    //
    // The normal Discord command can establish the Voice
    // connection first.
    //
    // ========================================================

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

    if (
        guild.song.source ===
        'youtube'
    ) {

        console.log(
            `📺 YouTube selected: ${guild.song.title}`
        );

    } else {

        console.log(
            `🎵 ${guild.song.source || 'Music'} selected: ${guild.song.title}`
        );
    }

    if (
        !guild.connection
    ) {

        const connectionResult =
            await connectVoice(
                interaction,
                guildId
            );

        if (
            !connectionResult.success
        ) {

            return connectionResult;
        }
    }

    return playFromWeb(
        guildId
    );
}

// ============================================================
// PAUSE
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

    const paused =
        guild.player.pause();

    if (
        !paused
    ) {

        return {

            success:
                false,

            message:
                '🎵 Nothing is currently playing.'
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
            'paused'
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

    const resumed =
        guild.player.unpause();

    if (
        !resumed
    ) {

        return {

            success:
                false,

            message:
                '🎵 Nothing is currently paused.'
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
            'playing'
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

    stopPlayback(
        guild
    );

    return {

        success:
            true,

        state:
            'stopped'
    };
}

// ============================================================
// LEAVE
// ============================================================

function leave(
    guildId
) {

    const guild =
        getGuild(
            guildId
        );

    stopPlayback(
        guild
    );

    if (
        guild.connection
    ) {

        try {

            guild.connection.destroy();

        } catch (error) {

            console.error(
                '⚠️ Voice disconnect error:',
                error
            );
        }
    }

    guild.connection =
        null;

    guild.state =
        'stopped';

    guild.updatedAt =
        Date.now();

    return {

        success:
            true,

        state:
            'stopped'
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
        !Number.isFinite(value) ||
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
            value
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

    if (
        value > 1
    ) {

        value /=
            100;
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

    if (
        guild.resource?.volume
    ) {

        guild.resource.volume.setVolume(
            value
        );
    }

    guild.updatedAt =
        Date.now();

    return {

        success:
            true,

        volume:
            value
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

    stopPlayback(
        guild
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
// CONNECTION
// ============================================================

function isConnected(
    guildId
) {

    const guild =
        getGuild(
            guildId
        );

    return Boolean(
        guild.connection
    );
}

// ============================================================
// PLAYER
// ============================================================

function getPlayer(
    guildId
) {

    return getGuild(
        guildId
    ).player;
}

// ============================================================
// DESTROY
// ============================================================

function destroyGuild(
    guildId
) {

    const guild =
        guilds.get(
            guildId
        );

    if (
        !guild
    ) {

        return {

            success:
                true
        };
    }

    stopPlayback(
        guild
    );

    if (
        guild.connection
    ) {

        try {

            guild.connection.destroy();

        } catch {}
    }

    guilds.delete(
        guildId
    );

    playLocks.delete(
        guildId
    );

    return {

        success:
            true
    };
}

// ============================================================
// LIST GUILDS
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

            connected:
                Boolean(
                    guild.connection
                ),

            channelId:
                guild.connection
                    ?.joinConfig
                    ?.channelId ||
                null,

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

    // Playback
    play,
    playFromWeb,
    pause,
    resume,
    stop,
    leave,

    // Controls
    seek,
    setVolume,

    // Voice
    isConnected,
    getPlayer,

    // Management
    destroyGuild,
    getGuilds
};