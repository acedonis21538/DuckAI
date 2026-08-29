'use strict';

// ============================================================
// DUCKAI — MUSIC ENGINE
// ============================================================
//
// • Search via YouTube resolver
// • Store selected song
// • Join Discord Voice
// • Play YouTube through youtubeStream
// • FFmpeg-static → Ogg/Opus → Discord Voice
// • Play / Pause / Resume / Stop
// • Leave Voice
// • Volume control
// • Independent guild state
// • Concurrent playback protection
// • Safe Voice connection lifecycle
// • Safe stream / FFmpeg cleanup
// • Playback race protection
//
// ============================================================

require('dotenv').config();

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const fs = require('fs');

const ffmpegStatic = require('ffmpeg-static');

function getFFmpegPath() {

    // 1. FFmpeg definido manualmente
    if (
        process.env.FFMPEG_PATH &&
        fs.existsSync(process.env.FFMPEG_PATH)
    ) {
        return process.env.FFMPEG_PATH;
    }

    // 2. ffmpeg-static
    if (
        ffmpegStatic &&
        fs.existsSync(ffmpegStatic)
    ) {
        return ffmpegStatic;
    }

    // 3. FFmpeg do sistema
    const systemPaths = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg'
    ];

    for (const candidate of systemPaths) {

        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    // 4. PATH
    return 'ffmpeg';
}

const ffmpegPath = getFFmpegPath();

console.log(`🎬 FFmpeg path: ${ffmpegPath}`);

const resolver =
    require('./sources/resolver');

const youtubeStream =
    require('./sources/youtubeStream');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
    StreamType,
    entersState
} = require('@discordjs/voice');

// ============================================================
// STORAGE
// ============================================================

const guilds = new Map();
const playLocks = new Set();

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

        song: null,

        state: 'stopped',

        position: 0,

        volume: 1,

        connection: null,

        player,

        resource: null,

        inputStream: null,

        ffmpeg: null,

        playbackId: 0,

        activeStreamPlaybackId: null,

        updatedAt: Date.now()
    };

    // ========================================================
    // PLAYER PLAYING
    // ========================================================

    player.on(
        AudioPlayerStatus.Playing,
        () => {

            guild.state = 'playing';
            guild.updatedAt = Date.now();
        }
    );

    // ========================================================
    // PLAYER PAUSED
    // ========================================================

    player.on(
        AudioPlayerStatus.Paused,
        () => {

            guild.state = 'paused';
            guild.updatedAt = Date.now();
        }
    );

    // ========================================================
    // PLAYER IDLE
    // ========================================================

    player.on(
        AudioPlayerStatus.Idle,
        () => {

            guild.state = 'stopped';
            guild.position = 0;
            guild.updatedAt = Date.now();

            cleanupStream(guild);
        }
    );

    // ========================================================
    // PLAYER ERROR
    // ========================================================

    player.on(
        'error',
        error => {

            console.error(
                '❌ Discord audio player error:',
                error
            );

            guild.state = 'stopped';
            guild.position = 0;
            guild.updatedAt = Date.now();

            cleanupStream(guild);
        }
    );

    return guild;
}

// ============================================================
// GET GUILD
// ============================================================

function getGuild(guildId) {

    if (!guilds.has(guildId)) {

        guilds.set(
            guildId,
            createGuildState()
        );
    }

    return guilds.get(guildId);
}

// ============================================================
// VALID GUILD
// ============================================================

function validGuildId(guildId) {

    return (
        typeof guildId === 'string' &&
        guildId.trim().length > 0
    );
}

// ============================================================
// SEARCH
// ============================================================

async function search(query) {

    if (
        typeof query !== 'string' ||
        !query.trim()
    ) {

        return {

            success: false,

            message:
                '🎵 Tell me which song you want to play.'
        };
    }

    const cleanQuery =
        query
            .trim()
            .slice(0, 200);

    try {

        console.log(
            `🔎 MUSIC SEARCH: ${cleanQuery}`
        );

        const result =
            await resolver.search(
                cleanQuery
            );

        if (!result?.success) {

            return {

                success: false,

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

                success: false,

                message:
                    `🦆 I found **${result.title || cleanQuery}**, but there is no usable YouTube source.`
            };
        }

        const normalized = {

            success: true,

            title:
                result.title ||
                cleanQuery,

            artist:
                result.artist ||
                'Unknown artist',

            url:
                result.url,

            source:
                'youtube',

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
                Number.isFinite(result.duration)
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
                false
        };

        console.log(
            `🎯 MUSIC RESULT: ${normalized.title} — ${normalized.artist}`
        );

        console.log(
            '📡 MUSIC SOURCE: youtube'
        );

        return normalized;

    } catch (error) {

        console.error(
            '❌ Music search error:',
            error
        );

        return {

            success: false,

            message:
                '🦆 I could not search for that song right now.'
        };
    }
}

// ============================================================
// SET SONG
// ============================================================

function setSong({

    guildId,
    title,
    artist,
    url,
    source = 'youtube',
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

    if (!validGuildId(guildId)) {
        return null;
    }

    if (
        typeof url !== 'string' ||
        !url.trim()
    ) {
        return null;
    }

    const guild =
        getGuild(guildId);

    stopPlayback(guild);

    guild.song = {

        id,

        title:
            title ||
            'Unknown title',

        artist:
            artist ||
            'Unknown artist',

        url,

        source: 'youtube',

        artwork,

        channelId,

        channelTitle,

        duration,

        genre,

        description,

        permalink,

        playable: false
    };

    guild.state = 'stopped';
    guild.position = 0;
    guild.updatedAt = Date.now();

    return guild.song;
}

// ============================================================
// SELECT SEARCH RESULT
// ============================================================

function selectSearchResult(
    guildId,
    result
) {

    if (!result?.success) {

        return {

            success: false,

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
                'youtube',

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
                false
        });

    if (!song) {

        return {

            success: false,

            message:
                '🎵 I could not select that song.'
        };
    }

    return {

        success: true,

        song
    };
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

    const guild =
        getGuild(guildId);

    return {

        success: true,

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
// CREATE AUDIO STREAM
// ============================================================

function createAudioStream(url) {

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

            let parsed;

            try {

                parsed =
                    new URL(url);

            } catch {

                reject(
                    new Error(
                        'Invalid audio URL.'
                    )
                );

                return;
            }

            const transport =
                parsed.protocol === 'http:'
                    ? http
                    : parsed.protocol === 'https:'
                        ? https
                        : null;

            if (!transport) {

                reject(
                    new Error(
                        `Unsupported audio protocol: ${parsed.protocol}`
                    )
                );

                return;
            }

            const request =
                transport.get(

                    parsed,

                    {

                        headers: {

                            'User-Agent':
                                'DuckAI/1.0',

                            'Accept':
                                'audio/*'
                        }
                    },

                    response => {

                        // REDIRECT

                        if (
                            response.statusCode >= 300 &&
                            response.statusCode < 400 &&
                            response.headers.location
                        ) {

                            response.resume();

                            createAudioStream(

                                new URL(
                                    response.headers.location,
                                    parsed
                                ).toString()

                            )
                                .then(resolve)
                                .catch(reject);

                            return;
                        }

                        // HTTP ERROR

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

                        resolve(response);
                    }
                );

            request.setTimeout(
                15000,
                () => {

                    request.destroy(
                        new Error(
                            'Audio source request timed out.'
                        )
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

    if (!interaction?.guild) {

        return {

            success: false,

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

            success: false,

            message:
                '🔊 I could not determine your Voice Channel.'
        };
    }

    const voiceChannel =
        member?.voice?.channel;

    if (!voiceChannel) {

        return {

            success: false,

            message:
                '🔊 Join a Voice Channel first.'
        };
    }

    if (
        typeof voiceChannel.isVoiceBased === 'function' &&
        !voiceChannel.isVoiceBased()
    ) {

        return {

            success: false,

            message:
                '🔊 That is not a valid Voice Channel.'
        };
    }

    const guild =
        getGuild(guildId);

    // EXISTING CONNECTION

    if (guild.connection) {

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

            } catch (error) {

                console.warn(
                    '⚠️ Could not resubscribe player:',
                    error.message
                );
            }

            if (
                guild.connection.state.status !==
                VoiceConnectionStatus.Ready
            ) {

                try {

                    await entersState(
                        guild.connection,
                        VoiceConnectionStatus.Ready,
                        15000
                    );

                } catch (error) {

                    console.error(
                        `❌ Existing Voice connection is not ready [${guildId}]:`,
                        error
                    );

                    return {

                        success: false,

                        message:
                            '🔊 The Discord Voice connection is not ready.'
                    };
                }
            }

            return {

                success: true,

                channelId:
                    voiceChannel.id,

                channelName:
                    voiceChannel.name
            };
        }

        // DIFFERENT CHANNEL

        console.log(
            `🔄 Moving Voice connection [${guildId}]`
        );

        try {

            guild.connection.destroy();

        } catch (error) {

            console.warn(
                '⚠️ Could not destroy old Voice connection:',
                error.message
            );
        }

        guild.connection = null;
    }

    // CREATE CONNECTION

    let connection;

    try {

        connection =
            joinVoiceChannel({

                channelId:
                    voiceChannel.id,

                guildId,

                adapterCreator:
                    interaction.guild
                        .voiceAdapterCreator,

                selfDeaf: true,
                selfMute: false
            });

    } catch (error) {

        console.error(
            `❌ joinVoiceChannel() failed [${guildId}]:`,
            error
        );

        return {

            success: false,

            message:
                '🔊 I could not create the Discord Voice connection.'
        };
    }

    guild.connection =
        connection;

    // STATE CHANGE

    connection.on(
        'stateChange',
        (
            oldState,
            newState
        ) => {

            console.log(
                `🔊 VOICE STATE [${guildId}]: ${oldState.status} → ${newState.status}`
            );

            if (
                newState.status ===
                VoiceConnectionStatus.Destroyed
            ) {

                if (
                    guild.connection ===
                    connection
                ) {

                    guild.connection = null;
                }
            }
        }
    );

    // CONNECTION ERROR

    connection.on(
        'error',
        error => {

            console.error(
                `❌ VOICE CONNECTION ERROR [${guildId}]:`,
                error
            );
        }
    );

    // SUBSCRIBE PLAYER

    try {

        connection.subscribe(
            guild.player
        );

    } catch (error) {

        console.error(
            `❌ Voice subscription failed [${guildId}]:`,
            error
        );

        try {
            connection.destroy();
        } catch {}

        if (
            guild.connection ===
            connection
        ) {

            guild.connection = null;
        }

        return {

            success: false,

            message:
                '🔊 I could not attach the player to Discord Voice.'
        };
    }

    // WAIT FOR READY

    try {

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            15000
        );

    } catch (error) {

        console.error(
            `❌ Voice connection failed [${guildId}]:`,
            error
        );

        try {
            connection.destroy();
        } catch {}

        if (
            guild.connection ===
            connection
        ) {

            guild.connection = null;
        }

        return {

            success: false,

            message:
                '🔊 Discord Voice could not be reached from this host.'
        };
    }

    console.log(
        `✅ VOICE READY [${guildId}]`
    );

    console.log(
        `🔊 Connected to "${voiceChannel.name}" [${guildId}]`
    );

    return {

        success: true,

        channelId:
            voiceChannel.id,

        channelName:
            voiceChannel.name
    };
}

// ============================================================
// CLEANUP STREAM
// ============================================================

function cleanupStream(
    guild,
    playbackId = null
) {

    if (!guild) {
        return;
    }

    if (
        playbackId !== null &&
        guild.activeStreamPlaybackId !== playbackId
    ) {

        return;
    }

    if (guild.inputStream) {

        try {
            guild.inputStream.destroy();
        } catch {}

        guild.inputStream = null;
    }

    if (guild.ffmpeg) {

        try {

            if (
                guild.ffmpeg.stdin &&
                !guild.ffmpeg.stdin.destroyed
            ) {

                guild.ffmpeg.stdin.destroy();
            }

        } catch {}

        try {

            if (!guild.ffmpeg.killed) {

                guild.ffmpeg.kill(
                    'SIGKILL'
                );
            }

        } catch {}

        guild.ffmpeg = null;
    }

    guild.resource = null;
    guild.activeStreamPlaybackId = null;
}

// ============================================================
// STOP PLAYBACK
// ============================================================

function stopPlayback(guild) {

    if (!guild) {
        return;
    }

    guild.playbackId += 1;

    try {
        guild.player.stop(true);
    } catch {}

    cleanupStream(guild);

    guild.state = 'stopped';
    guild.position = 0;
    guild.updatedAt = Date.now();
}

// ============================================================
// PLAY
// ============================================================

async function play(
    interaction,
    guildId
) {

    if (!validGuildId(guildId)) {

        return {

            success: false,

            message:
                '🎵 Invalid server.'
        };
    }

    if (playLocks.has(guildId)) {

        console.warn(
            `⚠️ Duplicate play request ignored [${guildId}]`
        );

        return {

            success: false,

            message:
                '🔊 The player is already starting.'
        };
    }

    playLocks.add(guildId);

    try {

        const guild =
            getGuild(guildId);

        if (!guild.song) {

            return {

                success: false,

                message:
                    '🎵 No song selected.'
            };
        }

        if (
            !ffmpegPath ||
            typeof ffmpegPath !== 'string'
        ) {

            return {

                success: false,

                message:
                    '🦆 FFmpeg is not available.'
            };
        }

        const connectionResult =
            await connectVoice(
                interaction,
                guildId
            );

        if (!connectionResult.success) {
            return connectionResult;
        }

        stopPlayback(guild);

        const playbackId =
            guild.playbackId;

        guild.activeStreamPlaybackId =
            playbackId;

        if (guild.connection) {

            try {

                guild.connection.subscribe(
                    guild.player
                );

            } catch {}
        }

        // ====================================================
        // YOUTUBE
        // ====================================================

        const youtubeInput =
            guild.song.permalink ||
            guild.song.url ||
            guild.song.id;

        if (!youtubeInput) {

            return {

                success: false,

                message:
                    '🎵 No YouTube URL available.'
            };
        }

        let playbackURL;

        try {

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
                typeof extracted.url !== 'string' ||
                !extracted.url.trim()
            ) {

                throw new Error(
                    'YouTube extractor did not return a playable stream.'
                );
            }

            playbackURL =
                extracted.url;

            console.log(
                `✅ YouTube audio acquired with ${extracted.provider || 'yt-dlp'}.`
            );

        } catch (error) {

            console.error(
                '❌ YouTube extraction failed:',
                error
            );

            if (
                guild.activeStreamPlaybackId ===
                playbackId
            ) {

                guild.activeStreamPlaybackId =
                    null;
            }

            return {

                success: false,

                voiceSource:
                    'youtube',

                message:
                    '🎵 YouTube was found, but its audio stream could not be extracted.'
            };
        }

        // CANCELLATION CHECK

        if (
            playbackId !==
            guild.playbackId
        ) {

            return {

                success: false,

                message:
                    '🔊 Playback was cancelled.'
            };
        }

        // OPEN AUDIO STREAM

        try {

            guild.inputStream =
                await createAudioStream(
                    playbackURL
                );

        } catch (error) {

            console.error(
                '❌ Could not open audio source:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {

                success: false,

                message:
                    '🎵 I could not open the audio stream.'
            };
        }

        if (
            playbackId !==
            guild.playbackId
        ) {

            cleanupStream(
                guild,
                playbackId
            );

            return {

                success: false,

                message:
                    '🔊 Playback was cancelled.'
            };
        }

        guild.inputStream.on(
            'error',
            error => {

                if (
                    playbackId !==
                    guild.playbackId
                ) {
                    return;
                }

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
                guild,
                playbackId
            );

            return {

                success: false,

                message:
                    '🦆 I could not start FFmpeg.'
            };
        }

        guild.ffmpeg =
            ffmpeg;

        let ffmpegError = '';

        ffmpeg.stderr.on(
            'data',
            chunk => {

                if (
                    playbackId !==
                    guild.playbackId
                ) {
                    return;
                }

                ffmpegError +=
                    chunk.toString();

                if (
                    ffmpegError.length >
                    5000
                ) {

                    ffmpegError =
                        ffmpegError.slice(-5000);
                }
            }
        );

        ffmpeg.stdin.on(
            'error',
            error => {

                if (
                    error.code !== 'EPIPE' &&
                    playbackId ===
                    guild.playbackId
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

                if (
                    playbackId ===
                    guild.playbackId
                ) {

                    console.error(
                        '❌ FFmpeg stdout error:',
                        error
                    );
                }
            }
        );

        ffmpeg.on(
            'error',
            error => {

                if (
                    playbackId ===
                    guild.playbackId
                ) {

                    console.error(
                        '❌ FFmpeg process error:',
                        error
                    );
                }
            }
        );

        ffmpeg.on(
            'close',
            code => {

                if (
                    code !== 0 &&
                    playbackId ===
                    guild.playbackId &&
                    guild.state ===
                    'playing'
                ) {

                    console.error(
                        `❌ FFmpeg exited with code ${code}:`,
                        ffmpegError ||
                        'No FFmpeg error output.'
                    );
                }
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
                guild,
                playbackId
            );

            return {

                success: false,

                message:
                    '🎵 I could not create the Discord audio resource.'
            };
        }

        // VOLUME

        if (guild.resource?.volume) {

            guild.resource.volume.setVolume(
                guild.volume
            );
        }

        // PIPE SOURCE → FFMPEG

        try {

            guild.inputStream.pipe(
                ffmpeg.stdin
            );

        } catch (error) {

            console.error(
                '❌ Could not pipe audio to FFmpeg:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {

                success: false,

                message:
                    '🎵 I could not process the audio stream.'
            };
        }

        // FINAL CANCELLATION CHECK

        if (
            playbackId !==
            guild.playbackId
        ) {

            cleanupStream(
                guild,
                playbackId
            );

            return {

                success: false,

                message:
                    '🔊 Playback was cancelled.'
            };
        }

        // START PLAYER

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
                guild,
                playbackId
            );

            return {

                success: false,

                message:
                    '🔊 I could not start Discord playback.'
            };
        }

        guild.state = 'playing';
        guild.position = 0;
        guild.updatedAt = Date.now();

        console.log(
            `▶️ PLAYING IN DISCORD [${guildId}]: ${guild.song.title}`
        );

        return {

            success: true,

            state: 'playing',

            voiceSource:
                'youtube',

            song:
                guild.song,

            channelId:
                guild.connection
                    ?.joinConfig
                    ?.channelId ||
                null
        };

    } finally {

        playLocks.delete(guildId);
    }
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

    if (
        guild.player.state.status !==
        AudioPlayerStatus.Playing
    ) {

        return {

            success: false,

            message:
                '🎵 Nothing is currently playing.'
        };
    }

    const paused =
        guild.player.pause();

    if (!paused) {

        return {

            success: false,

            message:
                '🎵 Nothing is currently playing.'
        };
    }

    guild.state = 'paused';
    guild.updatedAt = Date.now();

    return {

        success: true,

        state: 'paused'
    };
}

// ============================================================
// RESUME
// ============================================================

function resume(guildId) {

    const guild =
        getGuild(guildId);

    if (!guild.song) {

        return {

            success: false,

            message:
                '🎵 No song selected.'
        };
    }

    if (
        guild.player.state.status !==
        AudioPlayerStatus.Paused
    ) {

        return {

            success: false,

            message:
                '🎵 Nothing is currently paused.'
        };
    }

    const resumed =
        guild.player.unpause();

    if (!resumed) {

        return {

            success: false,

            message:
                '🎵 Nothing is currently paused.'
        };
    }

    guild.state = 'playing';
    guild.updatedAt = Date.now();

    return {

        success: true,

        state: 'playing'
    };
}

// ============================================================
// STOP
// ============================================================

function stop(guildId) {

    const guild =
        getGuild(guildId);

    stopPlayback(guild);

    return {

        success: true,

        state: 'stopped'
    };
}

// ============================================================
// LEAVE
// ============================================================

function leave(guildId) {

    const guild =
        getGuild(guildId);

    stopPlayback(guild);

    if (guild.connection) {

        try {

            guild.connection.destroy();

        } catch (error) {

            console.error(
                '⚠️ Voice disconnect error:',
                error
            );
        }
    }

    guild.connection = null;
    guild.state = 'stopped';
    guild.position = 0;
    guild.updatedAt = Date.now();

    return {

        success: true,

        state: 'stopped'
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
        getGuild(guildId);

    const value =
        Number(position);

    if (
        !Number.isFinite(value) ||
        value < 0
    ) {

        return {

            success: false,

            message:
                '🎵 Invalid playback position.'
        };
    }

    guild.position = value;
    guild.updatedAt = Date.now();

    return {

        success: true,

        position: value
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
        getGuild(guildId);

    let value =
        Number(volume);

    if (!Number.isFinite(value)) {

        return {

            success: false,

            message:
                '🎵 Invalid volume.'
        };
    }

    if (value > 1) {
        value /= 100;
    }

    value =
        Math.max(
            0,
            Math.min(
                1,
                value
            )
        );

    guild.volume = value;

    if (guild.resource?.volume) {

        guild.resource.volume.setVolume(
            value
        );
    }

    guild.updatedAt = Date.now();

    return {

        success: true,

        volume: value
    };
}

// ============================================================
// CLEAR SONG
// ============================================================

function clearSong(guildId) {

    const guild =
        getGuild(guildId);

    stopPlayback(guild);

    guild.song = null;
    guild.state = 'stopped';
    guild.position = 0;
    guild.updatedAt = Date.now();

    return {

        success: true
    };
}

// ============================================================
// CONNECTION
// ============================================================

function isConnected(guildId) {

    return Boolean(
        getGuild(guildId).connection
    );
}

// ============================================================
// PLAYER
// ============================================================

function getPlayer(guildId) {

    return getGuild(guildId).player;
}

// ============================================================
// DESTROY
// ============================================================

function destroyGuild(guildId) {

    const guild =
        guilds.get(guildId);

    if (!guild) {

        return {

            success: true
        };
    }

    stopPlayback(guild);

    if (guild.connection) {

        try {
            guild.connection.destroy();
        } catch {}
    }

    guilds.delete(guildId);
    playLocks.delete(guildId);

    return {

        success: true
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

    search,

    setSong,

    selectSearchResult,

    getCurrentSong,

    clearSong,

    getState,

    play,

    pause,

    resume,

    stop,

    leave,

    seek,

    setVolume,

    isConnected,

    getPlayer,

    destroyGuild,

    getGuilds
};