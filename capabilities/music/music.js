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
// • Stream playable audio into Discord Voice
// • Play / Pause / Resume / Stop
// • Leave Voice
// • Volume control
// • Keep independent state per guild
// • Prevent concurrent playback initialization
//
// Audio path:
//
// Audius
//   ↓
// HTTPS stream
//   ↓
// FFmpeg
//   ↓
// Ogg/Opus
//   ↓
// @discordjs/voice
//
// YouTube
//   ↓
// YouTube URL
//   ↓
// youtubeStream.js
//   ↓
// direct audio stream
//   ↓
// FFmpeg
//   ↓
// Ogg/Opus
//   ↓
// @discordjs/voice
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
// YOUTUBE STREAM EXTRACTOR
// ============================================================

const youtubeStream =
    require('./sources/youtubeStream');

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
// GET GUILD STATE
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
//
// The resolver chooses the best source.
//
// YouTube results are kept as YouTube video URLs.
// The youtubeStream extractor is used later by play().
//
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
                    `🦆 I found **${result.title}**, but there is no playable source.`
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
                result.playable !== false
        };

        console.log(
            `🎯 MUSIC RESULT: ${normalized.title} — ${normalized.artist}`
        );

        console.log(
            `📡 MUSIC SOURCE: ${normalized.source}`
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
//
// Kept for compatibility.
//
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

        duration,

        genre,

        description,

        permalink
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
// OPEN AUDIO STREAM
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
                        'Audio URL is empty'
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

    // ========================================================
    // FETCH MEMBER
    // ========================================================

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

    // ========================================================
    // USER VOICE CHANNEL
    // ========================================================

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
    // JOIN VOICE
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
    // SUBSCRIBE PLAYER
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
    // WAIT FOR READY
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
// PLAY
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
    // PLAY LOCK
    // ========================================================

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

        // ====================================================
        // SONG
        // ====================================================

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

        // ====================================================
        // FFMPEG
        // ====================================================

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
        // CONNECT
        // ====================================================

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

        // ====================================================
        // STOP OLD STREAM
        // ====================================================

        stopPlayback(
            guild
        );

        // ====================================================
        // RESUBSCRIBE
        // ====================================================

        if (
            guild.connection
        ) {

            try {

                guild.connection.subscribe(
                    guild.player
                );

            } catch {}
        }

        // ====================================================
        // RESOLVE PLAYBACK URL
        // ========================================================

        let playbackURL =
            guild.song.url;

        // ----------------------------------------------------
        // YOUTUBE EXTRACTION
        // ----------------------------------------------------

        if (
            guild.song.source ===
            'youtube'
        ) {

            try {

                const youtubeInput =
                    guild.song.permalink ||
                    guild.song.url ||
                    guild.song.id;

                console.log(
                    `🎬 Extracting YouTube audio: ${youtubeInput}`
                );

                const extracted =
                    await youtubeStream
                        .getCachedOrExtractStream(
                            youtubeInput
                        );

                if (
                    !extracted?.success ||
                    !extracted.url
                ) {

                    throw new Error(
                        'YouTube extractor did not return a playable stream.'
                    );
                }

                playbackURL =
                    extracted.url;

                console.log(
                    '✅ YouTube audio stream extracted.'
                );

            } catch (error) {

                console.error(
                    '❌ YouTube extraction failed:',
                    error
                );

                return {

                    success:
                        false,

                    message:
                        '🎵 I found the YouTube track, but I could not extract its audio stream.'
                };
            }
        }

        // ====================================================
        // OPEN SOURCE STREAM
        // ====================================================

        try {

            guild.inputStream =
                await createAudioStream(
                    playbackURL
                );

        } catch (error) {

            console.error(
                '❌ Could not open music source:',
                error
            );

            return {

                success:
                    false,

                message:
                    '🎵 I could not open the music stream.'
            };
        }

        // ====================================================
        // STREAM ERRORS
        // ====================================================

        guild.inputStream.on(
            'error',
            error => {

                console.error(
                    '❌ Music source stream error:',
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
        // CREATE RESOURCE
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

            if (
                ffmpegError
            ) {

                console.error(
                    '❌ FFmpeg output:',
                    ffmpegError
                );
            }

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
        // PIPE SOURCE → FFMPEG
        // ====================================================

        try {

            guild.inputStream.pipe(
                ffmpeg.stdin
            );

        } catch (error) {

            console.error(
                '❌ Could not pipe music source to FFmpeg:',
                error
            );

            cleanupStream(
                guild
            );

            return {

                success:
                    false,

                message:
                    '🎵 I could not process the music stream.'
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

        return {

            success:
                true,

            state:
                'playing',

            song:
                guild.song,

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

    // Accept 0–1 or 0–100.

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