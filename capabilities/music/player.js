// ============================================================
// DUCKAI MUSIC PLAYER
// ============================================================

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    NoSubscriberBehavior,
    AudioPlayerStatus
} = require('@discordjs/voice');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ffmpegPath = require('ffmpeg-static');

// ============================================================
// TEMP
// ============================================================

const TEMP_DIR =
    path.resolve(
        __dirname,
        '../../temp'
    );

// ============================================================
// SERVER STATE
// ============================================================

const players = new Map();
const connections = new Map();
const songs = new Map();
const files = new Map();

// ============================================================
// TEMP DIRECTORY
// ============================================================

function ensureTempDirectory() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(
            TEMP_DIR,
            {
                recursive: true
            }
        );
    }
}

// ============================================================
// GET PLAYER
// ============================================================

function getPlayer(guildId) {
    if (!guildId) {
        return null;
    }

    if (!players.has(guildId)) {
        const player =
            createAudioPlayer({
                behaviors: {
                    noSubscriber:
                        NoSubscriberBehavior.Pause
                }
            });

        players.set(
            guildId,
            player
        );
    }

    return players.get(
        guildId
    );
}

// ============================================================
// CONNECT TO VOICE
// ============================================================

function connectToVoice(message) {
    if (
        !message?.guild ||
        !message.member?.voice?.channel
    ) {
        return {
            success: false,
            message:
                'Entra primeiro num canal de voz.'
        };
    }

    const channel =
        message.member.voice.channel;

    const guildId =
        message.guild.id;

    let connection =
        connections.get(
            guildId
        );

    if (!connection) {
        connection =
            joinVoiceChannel({
                channelId:
                    channel.id,

                guildId,

                adapterCreator:
                    message.guild
                        .voiceAdapterCreator
            });

        connections.set(
            guildId,
            connection
        );

        connection.subscribe(
            getPlayer(guildId)
        );
    }

    return {
        success: true,
        connection
    };
}

// ============================================================
// DOWNLOAD AUDIO
// ============================================================

async function downloadAudio(url) {
    if (
        typeof url !== 'string' ||
        !url.trim()
    ) {
        throw new Error(
            'Invalid audio URL.'
        );
    }

    ensureTempDirectory();

    const response =
        await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Audio download failed (${response.status}).`
        );
    }

    const filePath =
        path.join(
            TEMP_DIR,
            `${crypto.randomUUID()}.mp3`
        );

    const buffer =
        Buffer.from(
            await response.arrayBuffer()
        );

    fs.writeFileSync(
        filePath,
        buffer
    );

    return filePath;
}

// ============================================================
// PLAY
// ============================================================

async function play(data = {}) {
    const {
        query,
        url,
        track,
        message
    } = data;

    if (!message?.guildId) {
        return {
            success: false,
            action: 'play',
            message:
                'No Discord server provided.'
        };
    }

    if (!query) {
        return {
            success: false,
            action: 'play',
            message:
                'No music query provided.'
        };
    }

    if (!url) {
        return {
            success: false,
            action: 'play',
            message:
                'No audio URL provided.'
        };
    }

    const guildId =
        message.guildId;

    try {
        const voice =
            connectToVoice(
                message
            );

        if (!voice.success) {
            return {
                success: false,
                action: 'play',
                message:
                    voice.message
            };
        }

        await stop({
            guildId
        });

        const file =
            await downloadAudio(
                url
            );

        const player =
            getPlayer(
                guildId
            );

        const resource =
            createAudioResource(
                file
            );

        player.play(
            resource
        );

        const song = {
            query,

            id:
                track?.id ||
                null,

            title:
                track?.title ||
                query,

            artist:
                track?.user?.name ||
                'Unknown artist',

            url,

            track
        };

        songs.set(
            guildId,
            song
        );

        files.set(
            guildId,
            file
        );

        return {
            success: true,
            action: 'play',
            song,
            file
        };

    } catch (error) {
        console.error(
            '❌ Music playback failed:',
            error
        );

        await stop({
            guildId
        });

        return {
            success: false,
            action: 'play',
            message:
                'Não consegui reproduzir essa música.'
        };
    }
}

// ============================================================
// PAUSE
// ============================================================

async function pause(data = {}) {
    const player =
        getPlayer(
            data.guildId
        );

    if (!player) {
        return {
            success: false,
            action: 'pause'
        };
    }

    return {
        success:
            player.pause(),
        action: 'pause'
    };
}

// ============================================================
// RESUME
// ============================================================

async function resume(data = {}) {
    const player =
        getPlayer(
            data.guildId
        );

    if (!player) {
        return {
            success: false,
            action: 'resume'
        };
    }

    return {
        success:
            player.unpause(),
        action: 'resume'
    };
}

// ============================================================
// STOP
// ============================================================

async function stop(data = {}) {
    const guildId =
        data.guildId;

    if (!guildId) {
        return {
            success: false,
            action: 'stop'
        };
    }

    const player =
        players.get(
            guildId
        );

    if (player) {
        player.stop();
    }

    const file =
        files.get(
            guildId
        );

    if (
        file &&
        fs.existsSync(file)
    ) {
        try {
            fs.unlinkSync(
                file
            );
        } catch (error) {
            console.error(
                '❌ Failed to delete audio:',
                error.message
            );
        }
    }

    files.delete(
        guildId
    );

    songs.delete(
        guildId
    );

    return {
        success: true,
        action: 'stop'
    };
}

// ============================================================
// SKIP
// ============================================================

async function skip(data = {}) {
    const guildId =
        data.guildId;

    await stop({
        guildId
    });

    return {
        success: true,
        action: 'skip'
    };
}

// ============================================================
// CURRENT SONG
// ============================================================

function getCurrentSong(guildId) {
    return (
        songs.get(
            guildId
        ) || null
    );
}

// ============================================================
// CURRENT FILE
// ============================================================

function getCurrentFile(guildId) {
    return (
        files.get(
            guildId
        ) || null
    );
}

// ============================================================
// HAS CURRENT SONG
// ============================================================

function hasCurrentSong(guildId) {
    return Boolean(
        getCurrentSong(guildId)
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    play,
    pause,
    resume,
    stop,
    skip,

    getCurrentSong,
    getCurrentFile,
    hasCurrentSong,

    downloadAudio,
    connectToVoice
};