'use strict';

// ============================================================
// DUCKAI — MUSIC ENGINE
// ============================================================

require('dotenv').config();

const http = require('http');
const https = require('https');
const fs = require('fs');
const { spawn } = require('child_process');

const ffmpegStatic = require('ffmpeg-static');

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

const resolver =
    require('./sources/resolver');

const youtubeStream =
    require('./sources/youtubeStream');

// ============================================================
// FFMPEG
// ============================================================

function getFFmpegPath() {

    if (
        process.env.FFMPEG_PATH &&
        fs.existsSync(process.env.FFMPEG_PATH)
    ) {
        return process.env.FFMPEG_PATH;
    }

    if (
        ffmpegStatic &&
        fs.existsSync(ffmpegStatic)
    ) {
        return ffmpegStatic;
    }

    const systemPaths = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg'
    ];

    for (const path of systemPaths) {

        if (fs.existsSync(path)) {
            return path;
        }
    }

    return 'ffmpeg';
}

const ffmpegPath = getFFmpegPath();

console.log(
    `🎬 FFmpeg path: ${ffmpegPath}`
);

// ============================================================
// STORAGE
// ============================================================

const guildStates = new Map();
const playLocks = new Set();

// ============================================================
// CREATE GUILD STATE
// ============================================================

function createGuildState() {

    const player = createAudioPlayer({

        behaviors: {
            noSubscriber:
                NoSubscriberBehavior.Pause
        }
    });

    const state = {

        queue: [],
        currentIndex: -1,

        state: 'stopped',
        position: 0,
        volume: 1,

        startedAt: null,
        pausedAt: null,
        pausedPosition: 0,

        connection: null,
        player,
        resource: null,

        inputStream: null,
        ffmpeg: null,

        playbackId: 0,
        activePlaybackId: null,

        autoAdvance: true,

        updatedAt: Date.now()
    };

    // ========================================================
    // PLAYING
    // ========================================================

    player.on(
        AudioPlayerStatus.Playing,
        () => {

            state.state = 'playing';

            if (!state.startedAt) {

                state.startedAt =
                    Date.now() -
                    (state.position * 1000);
            }

            state.updatedAt = Date.now();

            console.log(
                '▶️ Discord player: PLAYING'
            );
        }
    );

    // ========================================================
    // PAUSED
    // ========================================================

    player.on(
        AudioPlayerStatus.Paused,
        () => {

            updatePosition(state);

            state.state = 'paused';
            state.pausedAt = Date.now();
            state.pausedPosition = state.position;
            state.updatedAt = Date.now();

            console.log(
                '⏸️ Discord player: PAUSED'
            );
        }
    );

    // ========================================================
    // IDLE
    // ========================================================

    player.on(
        AudioPlayerStatus.Idle,
        () => {

            const finishedPlaybackId =
                state.activePlaybackId;

            const wasPlaying =
                state.state === 'playing' ||
                state.state === 'paused';

            cleanupStream(
                state,
                finishedPlaybackId
            );

            state.state = 'stopped';
            state.position = 0;
            state.startedAt = null;
            state.pausedAt = null;
            state.pausedPosition = 0;
            state.updatedAt = Date.now();

            console.log(
                '⏹️ Discord player: IDLE'
            );

            if (
                wasPlaying &&
                state.autoAdvance
            ) {

                playNextFromIdle(state);
            }
        }
    );

    // ========================================================
    // ERROR
    // ========================================================

    player.on(
        'error',
        error => {

            console.error(
                '❌ Discord audio player error:',
                error
            );

            cleanupStream(state);

            state.state = 'stopped';
            state.position = 0;
            state.startedAt = null;
            state.pausedAt = null;
            state.pausedPosition = 0;
            state.updatedAt = Date.now();
        }
    );

    return state;
}

// ============================================================
// GET GUILD
// ============================================================

function getGuild(guildId) {

    const id = String(guildId || '');

    if (!id) {
        return null;
    }

    if (!guildStates.has(id)) {

        guildStates.set(
            id,
            createGuildState()
        );
    }

    return guildStates.get(id);
}

// ============================================================
// VALID GUILD ID
// ============================================================

function validGuildId(guildId) {

    return (
        typeof guildId === 'string' &&
        guildId.trim().length > 0
    );
}

// ============================================================
// UPDATE POSITION
// ============================================================

function updatePosition(guild) {

    if (!guild) {
        return 0;
    }

    if (
        guild.state === 'playing' &&
        guild.startedAt
    ) {

        const elapsed =
            (Date.now() - guild.startedAt) / 1000;

        const duration =
            Number(
                guild.queue[
                    guild.currentIndex
                ]?.duration
            );

        let position =
            Math.max(0, elapsed);

        if (
            Number.isFinite(duration) &&
            duration > 0
        ) {

            position =
                Math.min(
                    position,
                    duration
                );
        }

        guild.position = position;
    }

    else if (
        guild.state === 'paused'
    ) {

        guild.position =
            guild.pausedPosition || 0;
    }

    return guild.position;
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

    console.log(
        `🔎 MUSIC SEARCH: ${cleanQuery}`
    );

    try {

        const result =
            await resolver.search(cleanQuery);

        if (!result?.success) {

            return {
                success: false,
                message:
                    result?.message ||
                    `🦆 I couldn't find "${cleanQuery}".`
            };
        }

        if (!result.url) {

            return {
                success: false,
                message:
                    '🎵 YouTube returned no playable result.'
            };
        }

        const song = {

            success: true,
            source: 'youtube',

            id: result.id || null,

            title:
                result.title ||
                cleanQuery,

            artist:
                result.artist ||
                result.channelTitle ||
                'Unknown artist',

            url: result.url,

            permalink:
                result.permalink ||
                result.url,

            artwork:
                result.artwork ||
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

            description:
                result.description ||
                null,

            publishedAt:
                result.publishedAt ||
                null,

            playable: false,

            requestedAt: Date.now()
        };

        console.log(
            `🎯 YOUTUBE RESULT: ${song.title} — ${song.artist}`
        );

        return song;

    } catch (error) {

        console.error(
            '❌ YouTube music search error:',
            error
        );

        return {
            success: false,
            message:
                '🦆 I could not search YouTube right now.'
        };
    }
}

// ============================================================
// ADD SONG
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
    description = null,
    permalink = null
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

    const guild = getGuild(guildId);

    if (!guild) {
        return null;
    }

    const song = {

        id,

        title:
            title ||
            'Unknown title',

        artist:
            artist ||
            'Unknown artist',

        url,

        permalink:
            permalink ||
            url,

        source,

        artwork,

        channelId,
        channelTitle,

        duration:
            Number.isFinite(Number(duration))
                ? Number(duration)
                : null,

        description,

        playable: false,

        addedAt: Date.now()
    };

    guild.queue.push(song);

    if (guild.currentIndex === -1) {
        guild.currentIndex = 0;
    }

    guild.updatedAt = Date.now();

    console.log(
        `🎵 QUEUE ADD: ${song.title} — ${song.artist}`
    );

    return song;
}

// ============================================================
// SELECT SEARCH RESULT
// ============================================================

function selectSearchResult(guildId, result) {

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

            title: result.title,
            artist: result.artist,
            url: result.url,

            source: 'youtube',

            artwork: result.artwork,

            id: result.id,

            channelId: result.channelId,

            channelTitle:
                result.channelTitle,

            duration:
                result.duration,

            description:
                result.description,

            permalink:
                result.permalink ||
                result.url
        });

    if (!song) {

        return {
            success: false,
            message:
                '🎵 I could not add that song to the queue.'
        };
    }

    return {
        success: true,
        song,
        queuePosition:
            getQueue(guildId).length
    };
}

// ============================================================
// CURRENT SONG
// ============================================================

function getCurrentSong(guildId) {

    const guild = getGuild(guildId);

    if (
        !guild ||
        guild.currentIndex < 0
    ) {
        return null;
    }

    return (
        guild.queue[guild.currentIndex] ||
        null
    );
}

// ============================================================
// QUEUE
// ============================================================

function getQueue(guildId) {

    const guild = getGuild(guildId);

    if (!guild) {
        return [];
    }

    return guild.queue;
}

// ============================================================
// STATE
// ============================================================

function getState(guildId) {

    const guild = getGuild(guildId);

    if (!guild) {

        return {
            success: false
        };
    }

    updatePosition(guild);

    return {

        success: true,

        song:
            getCurrentSong(guildId),

        queue:
            guild.queue,

        currentIndex:
            guild.currentIndex,

        state:
            guild.state,

        position:
            guild.position,

        volume:
            guild.volume,

        connected:
            Boolean(guild.connection),

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
// CREATE HTTP AUDIO STREAM
// ============================================================
//
// FIX 403:
// YouTube CDN URLs are protected and can reject simplistic
// Node HTTP requests. We use browser-like headers and preserve
// the full signed URL.
//
// ============================================================

function createAudioStream(
    url,
    redirectCount = 0
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

            if (redirectCount > 8) {

                reject(
                    new Error(
                        'Too many audio redirects.'
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
                parsed.protocol === 'https:'
                    ? https
                    : parsed.protocol === 'http:'
                        ? http
                        : null;

            if (!transport) {

                reject(
                    new Error(
                        `Unsupported protocol: ${parsed.protocol}`
                    )
                );

                return;
            }

            const headers = {

                // Browser-like identity
                'User-Agent':
                    process.env.YOUTUBE_USER_AGENT ||
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36',

                // Important for YouTube CDN
                'Referer':
                    'https://www.youtube.com/',

                'Origin':
                    'https://www.youtube.com',

                'Accept':
                    '*/*',

                'Accept-Language':
                    'en-US,en;q=0.9',

                'Connection':
                    'keep-alive'
            };

            const request =
                transport.get(
                    parsed,
                    {
                        headers
                    },
                    response => {

                        // ------------------------------------------------
                        // REDIRECT
                        // ------------------------------------------------

                        if (
                            response.statusCode >= 300 &&
                            response.statusCode < 400 &&
                            response.headers.location
                        ) {

                            const location =
                                response.headers.location;

                            response.resume();

                            const redirect =
                                new URL(
                                    location,
                                    parsed
                                ).toString();

                            createAudioStream(
                                redirect,
                                redirectCount + 1
                            )
                                .then(resolve)
                                .catch(reject);

                            return;
                        }

                        // ------------------------------------------------
                        // SUCCESS
                        // ------------------------------------------------

                        if (
                            response.statusCode >= 200 &&
                            response.statusCode < 300
                        ) {

                            resolve(response);

                            return;
                        }

                        // ------------------------------------------------
                        // ERROR
                        // ------------------------------------------------

                        const status =
                            response.statusCode;

                        response.resume();

                        reject(
                            new Error(
                                `Audio stream HTTP ${status}`
                            )
                        );
                    }
                );

            request.setTimeout(
                15000,
                () => {

                    request.destroy(
                        new Error(
                            'Audio request timed out.'
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
                '🔊 I can only play music inside a server.'
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
            '❌ Could not fetch member:',
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

    const guild = getGuild(guildId);

    // ========================================================
    // EXISTING CONNECTION
    // ========================================================

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
            } catch {}

            try {

                await entersState(
                    guild.connection,
                    VoiceConnectionStatus.Ready,
                    10000
                );

            } catch {

                return {
                    success: false,
                    message:
                        '🔊 The Voice connection is not ready.'
                };
            }

            return {
                success: true,
                channelId:
                    voiceChannel.id,
                channelName:
                    voiceChannel.name
            };
        }

        console.log(
            `🔄 Moving Voice connection [${guildId}]`
        );

        try {
            guild.connection.destroy();
        } catch {}

        guild.connection = null;
    }

    // ========================================================
    // NEW CONNECTION
    // ========================================================

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
            '❌ Failed to join Voice:',
            error
        );

        return {
            success: false,
            message:
                '🔊 I could not join your Voice Channel.'
        };
    }

    guild.connection = connection;

    connection.on(
        'stateChange',
        (
            oldState,
            newState
        ) => {

            console.log(
                `🔊 VOICE [${guildId}]: ${oldState.status} → ${newState.status}`
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

    connection.on(
        'error',
        error => {

            console.error(
                `❌ VOICE ERROR [${guildId}]:`,
                error
            );
        }
    );

    try {

        connection.subscribe(
            guild.player
        );

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
                '🔊 Discord Voice could not be reached.'
        };
    }

    console.log(
        `✅ VOICE READY [${guildId}]`
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
        guild.activePlaybackId !== playbackId
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
    guild.activePlaybackId = null;
}

// ============================================================
// STOP INTERNAL PLAYBACK
// ============================================================

function stopPlayback(
    guild,
    options = {}
) {

    if (!guild) {
        return;
    }

    const {
        advance = false
    } = options;

    updatePosition(guild);

    guild.playbackId += 1;

    guild.autoAdvance = false;

    try {
        guild.player.stop(true);
    } catch {}

    cleanupStream(guild);

    guild.state = 'stopped';
    guild.position = 0;
    guild.startedAt = null;
    guild.pausedAt = null;
    guild.pausedPosition = 0;
    guild.updatedAt = Date.now();

    if (advance) {
        guild.autoAdvance = true;
    }
}

// ============================================================
// CREATE FFMPEG
// ============================================================

function createFFmpeg(input) {

    return spawn(
        ffmpegPath,
        [
            '-hide_banner',
            '-loglevel',
            'error',

            '-reconnect',
            '1',

            '-reconnect_streamed',
            '1',

            '-reconnect_delay_max',
            '5',

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
}

// ============================================================
// PLAY CURRENT SONG
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

        return {
            success: false,
            message:
                '🔊 The player is already starting.'
        };
    }

    const guild = getGuild(guildId);
    const song = getCurrentSong(guildId);

    if (!song) {

        return {
            success: false,
            message:
                '🎵 There is no song in the queue.'
        };
    }

    playLocks.add(guildId);

    try {

        // ====================================================
        // CONNECT
        // ====================================================

        const voice =
            await connectVoice(
                interaction,
                guildId
            );

        if (!voice.success) {
            return voice;
        }

        // ====================================================
        // CANCEL PREVIOUS
        // ====================================================

        guild.autoAdvance = false;

        stopPlayback(guild);

        guild.autoAdvance = true;

        const playbackId =
            guild.playbackId;

        guild.activePlaybackId =
            playbackId;

        // ====================================================
        // SOURCE
        // ====================================================

        const youtubeInput =
            song.permalink ||
            song.url ||
            song.id;

        if (!youtubeInput) {

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 This song has no valid YouTube source.'
            };
        }

        console.log(
            `🎬 Extracting audio: ${song.title}`
        );

        let extracted;

        try {

            extracted =
                await youtubeStream
                    .getCachedOrExtractStream(
                        youtubeInput
                    );

        } catch (error) {

            console.error(
                '❌ YouTube extraction failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 I found the song, but could not obtain its audio stream.'
            };
        }

        if (
            !extracted?.success ||
            typeof extracted.url !== 'string' ||
            !extracted.url.trim()
        ) {

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 YouTube did not provide a playable audio stream.'
            };
        }

        console.log(
            `✅ Audio acquired via ${extracted.provider || 'YouTube'}`
        );

        // ====================================================
        // RACE CHECK
        // ====================================================

        if (
            guild.playbackId !== playbackId
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

        // ====================================================
        // OPEN AUDIO
        // ====================================================

        try {

            guild.inputStream =
                await createAudioStream(
                    extracted.url
                );

        } catch (error) {

            console.error(
                '❌ Could not open extracted audio:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 I could not open the YouTube audio stream.'
            };
        }

        if (
            guild.playbackId !== playbackId
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
                    guild.playbackId !== playbackId
                ) {
                    return;
                }

                console.error(
                    '❌ Audio input error:',
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
                createFFmpeg(
                    guild.inputStream
                );

        } catch (error) {

            console.error(
                '❌ FFmpeg start failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🦆 FFmpeg could not be started.'
            };
        }

        guild.ffmpeg = ffmpeg;

        let ffmpegError = '';

        ffmpeg.stderr.on(
            'data',
            chunk => {

                if (
                    guild.playbackId !== playbackId
                ) {
                    return;
                }

                ffmpegError +=
                    chunk.toString();

                if (
                    ffmpegError.length > 5000
                ) {

                    ffmpegError =
                        ffmpegError.slice(-5000);
                }
            }
        );

        ffmpeg.on(
            'error',
            error => {

                if (
                    guild.playbackId === playbackId
                ) {

                    console.error(
                        '❌ FFmpeg error:',
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
                    guild.playbackId === playbackId
                ) {

                    console.error(
                        `❌ FFmpeg exited with ${code}:`,
                        ffmpegError ||
                        'No error output.'
                    );
                }
            }
        );

        // ====================================================
        // RESOURCE
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
                '❌ Audio resource creation failed:',
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
                '❌ Audio pipe failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 I could not process the YouTube audio.'
            };
        }

        // ====================================================
        // FINAL RACE CHECK
        // ====================================================

        if (
            guild.playbackId !== playbackId
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

        // ====================================================
        // START
        // ====================================================

        try {

            guild.player.play(
                guild.resource
            );

        } catch (error) {

            console.error(
                '❌ Discord playback failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🔊 Discord could not start playback.'
            };
        }

        guild.state = 'playing';
        guild.position = 0;
        guild.startedAt = Date.now();
        guild.pausedAt = null;
        guild.pausedPosition = 0;
        guild.updatedAt = Date.now();

        console.log(
            `▶️ PLAYING: ${song.title} — ${song.artist}`
        );

        return {

            success: true,

            state: 'playing',

            song,

            voiceSource: 'youtube',

            channelId:
                voice.channelId
        };

    } finally {

        playLocks.delete(guildId);
    }
}

// ============================================================
// AUTO NEXT
// ============================================================

async function playNextFromIdle(guild) {

    if (!guild) {
        return;
    }

    const nextIndex =
        guild.currentIndex + 1;

    if (
        nextIndex >=
        guild.queue.length
    ) {

        console.log(
            '🎵 Queue finished.'
        );

        return;
    }

    guild.currentIndex =
        nextIndex;

    guild.updatedAt =
        Date.now();

    console.log(
        `⏭️ AUTO NEXT: ${guild.queue[nextIndex]?.title || 'Unknown'}`
    );

    await playFromExistingConnection(
        guild
    );
}

// ============================================================
// PLAY EXISTING CONNECTION
// ============================================================

async function playFromExistingConnection(guild) {

    if (!guild?.connection) {

        guild.state = 'stopped';

        return {
            success: false,
            message:
                '🔊 Voice connection is no longer available.'
        };
    }

    const song =
        guild.queue[
            guild.currentIndex
        ];

    if (!song) {

        return {
            success: false,
            message:
                '🎵 There is no next song.'
        };
    }

    const guildId =
        guild.connection
            .joinConfig
            .guildId;

    if (playLocks.has(guildId)) {

        return {
            success: false,
            message:
                '🔊 The player is already starting.'
        };
    }

    playLocks.add(guildId);

    try {

        guild.playbackId += 1;

        const playbackId =
            guild.playbackId;

        cleanupStream(guild);

        guild.activePlaybackId =
            playbackId;

        guild.state = 'stopped';

        // ====================================================
        // SOURCE
        // ====================================================

        const youtubeInput =
            song.permalink ||
            song.url ||
            song.id;

        if (!youtubeInput) {

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 This song has no valid YouTube source.'
            };
        }

        console.log(
            `🎬 Auto extracting: ${song.title}`
        );

        let extracted;

        try {

            extracted =
                await youtubeStream
                    .getCachedOrExtractStream(
                        youtubeInput
                    );

        } catch (error) {

            console.error(
                '❌ Auto extraction failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 I could not load the next song.'
            };
        }

        if (
            !extracted?.success ||
            typeof extracted.url !== 'string' ||
            !extracted.url.trim()
        ) {

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 The next song could not be played.'
            };
        }

        // ====================================================
        // OPEN STREAM
        // ====================================================

        try {

            guild.inputStream =
                await createAudioStream(
                    extracted.url
                );

        } catch (error) {

            console.error(
                '❌ Auto audio stream failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 I could not open the next audio stream.'
            };
        }

        if (
            guild.playbackId !== playbackId
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
                    guild.playbackId !== playbackId
                ) {
                    return;
                }

                console.error(
                    '❌ Auto audio input error:',
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
                createFFmpeg(
                    guild.inputStream
                );

        } catch (error) {

            console.error(
                '❌ Auto FFmpeg start failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🦆 FFmpeg could not start the next song.'
            };
        }

        guild.ffmpeg = ffmpeg;

        let ffmpegError = '';

        ffmpeg.stderr.on(
            'data',
            chunk => {

                if (
                    guild.playbackId !== playbackId
                ) {
                    return;
                }

                ffmpegError +=
                    chunk.toString();

                if (
                    ffmpegError.length > 5000
                ) {

                    ffmpegError =
                        ffmpegError.slice(-5000);
                }
            }
        );

        ffmpeg.on(
            'error',
            error => {

                if (
                    guild.playbackId === playbackId
                ) {

                    console.error(
                        '❌ Auto FFmpeg error:',
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
                    guild.playbackId === playbackId
                ) {

                    console.error(
                        `❌ Auto FFmpeg exited with ${code}:`,
                        ffmpegError ||
                        'No error output.'
                    );
                }
            }
        );

        // ====================================================
        // RESOURCE
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
                '❌ Auto resource creation failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 I could not prepare the next song.'
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
                '❌ Auto audio pipe failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🎵 I could not process the next song.'
            };
        }

        // ====================================================
        // START
        // ====================================================

        try {

            guild.player.play(
                guild.resource
            );

        } catch (error) {

            console.error(
                '❌ Auto playback failed:',
                error
            );

            cleanupStream(
                guild,
                playbackId
            );

            return {
                success: false,
                message:
                    '🔊 I could not start the next song.'
            };
        }

        guild.state = 'playing';
        guild.position = 0;
        guild.startedAt = Date.now();
        guild.pausedAt = null;
        guild.pausedPosition = 0;
        guild.updatedAt = Date.now();

        console.log(
            `▶️ AUTO PLAYING: ${song.title} — ${song.artist}`
        );

        return {
            success: true,
            song
        };

    } finally {

        playLocks.delete(guildId);
    }
}

// ============================================================
// PAUSE
// ============================================================

function pause(guildId) {

    const guild = getGuild(guildId);

    if (!getCurrentSong(guildId)) {

        return {
            success: false,
            message:
                '🎵 No song is selected.'
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

    updatePosition(guild);

    const result =
        guild.player.pause();

    if (!result) {

        return {
            success: false,
            message:
                '🎵 I could not pause the player.'
        };
    }

    guild.state = 'paused';
    guild.pausedPosition =
        guild.position;
    guild.updatedAt =
        Date.now();

    return {
        success: true,
        state: 'paused',
        position:
            guild.position
    };
}

// ============================================================
// RESUME
// ============================================================

function resume(guildId) {

    const guild = getGuild(guildId);

    if (!getCurrentSong(guildId)) {

        return {
            success: false,
            message:
                '🎵 No song is selected.'
        };
    }

    if (
        guild.player.state.status !==
        AudioPlayerStatus.Paused
    ) {

        return {
            success: false,
            message:
                '🎵 Nothing is paused.'
        };
    }

    const result =
        guild.player.unpause();

    if (!result) {

        return {
            success: false,
            message:
                '🎵 I could not resume the player.'
        };
    }

    guild.startedAt =
        Date.now() -
        (guild.pausedPosition * 1000);

    guild.state = 'playing';
    guild.updatedAt =
        Date.now();

    return {
        success: true,
        state: 'playing'
    };
}

// ============================================================
// STOP
// ============================================================

function stop(guildId) {

    const guild = getGuild(guildId);

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

    const guild = getGuild(guildId);

    stopPlayback(guild);

    if (guild.connection) {

        try {
            guild.connection.destroy();
        } catch {}
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
// SKIP
// ============================================================

async function skip(
    interaction,
    guildId
) {

    const guild = getGuild(guildId);

    if (guild.queue.length === 0) {

        return {
            success: false,
            message:
                '🎵 The queue is empty.'
        };
    }

    if (
        guild.currentIndex >=
        guild.queue.length - 1
    ) {

        stopPlayback(guild);

        return {
            success: true,
            state: 'stopped',
            message:
                '🎵 The queue has ended.'
        };
    }

    guild.currentIndex++;
    guild.updatedAt = Date.now();

    if (guild.connection) {

        guild.autoAdvance = false;

        stopPlayback(guild);

        guild.autoAdvance = true;

        return playFromExistingConnection(
            guild
        );
    }

    if (!interaction) {

        return {
            success: false,
            message:
                '🔊 I need a Voice connection to continue playback.'
        };
    }

    return play(
        interaction,
        guildId
    );
}

// ============================================================
// REMOVE QUEUE ITEM
// ============================================================

function removeFromQueue(
    guildId,
    index
) {

    const guild = getGuild(guildId);
    const value = Number(index);

    if (
        !Number.isInteger(value) ||
        value < 0 ||
        value >= guild.queue.length
    ) {

        return {
            success: false,
            message:
                '🎵 Invalid queue item.'
        };
    }

    const removed =
        guild.queue.splice(
            value,
            1
        )[0];

    if (
        value ===
        guild.currentIndex
    ) {

        stopPlayback(guild);

        if (
            guild.queue.length === 0
        ) {

            guild.currentIndex = -1;

        } else if (
            value >=
            guild.queue.length
        ) {

            guild.currentIndex =
                guild.queue.length - 1;

        } else {

            guild.currentIndex =
                value;
        }

    } else if (
        value <
        guild.currentIndex
    ) {

        guild.currentIndex--;
    }

    guild.updatedAt = Date.now();

    return {
        success: true,
        removed,
        queue:
            guild.queue
    };
}

// ============================================================
// CLEAR QUEUE
// ============================================================

function clearQueue(guildId) {

    const guild = getGuild(guildId);

    stopPlayback(guild);

    guild.queue = [];
    guild.currentIndex = -1;
    guild.updatedAt = Date.now();

    return {
        success: true
    };
}

// ============================================================
// SEEK
// ============================================================

function seek(
    guildId,
    position
) {

    const value = Number(position);

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

    const guild = getGuild(guildId);

    const song =
        getCurrentSong(guildId);

    if (
        song?.duration &&
        value > song.duration
    ) {

        guild.position =
            song.duration;

    } else {

        guild.position = value;
    }

    if (
        guild.state === 'playing'
    ) {

        guild.startedAt =
            Date.now() -
            (guild.position * 1000);
    }

    guild.pausedPosition =
        guild.position;

    guild.updatedAt =
        Date.now();

    return {
        success: true,
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

    const guild = getGuild(guildId);

    let value = Number(volume);

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
// CLEAR CURRENT SONG
// ============================================================

function clearSong(guildId) {

    const guild = getGuild(guildId);

    if (
        guild.currentIndex >= 0 &&
        guild.currentIndex <
        guild.queue.length
    ) {

        guild.queue.splice(
            guild.currentIndex,
            1
        );
    }

    stopPlayback(guild);

    if (
        guild.queue.length === 0
    ) {

        guild.currentIndex = -1;

    } else if (
        guild.currentIndex >=
        guild.queue.length
    ) {

        guild.currentIndex =
            guild.queue.length - 1;
    }

    guild.updatedAt = Date.now();

    return {
        success: true
    };
}

// ============================================================
// CONNECTION
// ============================================================

function isConnected(guildId) {

    const guild = getGuild(guildId);

    return Boolean(
        guild?.connection
    );
}

// ============================================================
// PLAYER
// ============================================================

function getPlayer(guildId) {

    return getGuild(guildId)?.player;
}

// ============================================================
// DESTROY GUILD
// ============================================================

function destroyGuild(guildId) {

    const id =
        String(guildId || '');

    const guild =
        guildStates.get(id);

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

    guildStates.delete(id);
    playLocks.delete(id);

    return {
        success: true
    };
}

// ============================================================
// LIST STATES
// ============================================================

function getGuilds() {

    return Array.from(
        guildStates.entries()
    ).map(
        (
            [
                guildId,
                guild
            ]
        ) => {

            updatePosition(guild);

            return {

                guildId,

                song:
                    getCurrentSong(
                        guildId
                    ),

                queue:
                    guild.queue,

                currentIndex:
                    guild.currentIndex,

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
    getQueue,
    removeFromQueue,
    clearQueue,
    clearSong,

    play,
    pause,
    resume,
    stop,
    skip,
    leave,
    seek,

    setVolume,

    getState,
    getGuilds,

    isConnected,
    getPlayer,
    destroyGuild
};