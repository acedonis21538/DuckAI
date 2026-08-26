// ============================================================
// DUCKAI MUSIC PLAYER
// ============================================================

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    NoSubscriberBehavior,
    StreamType
} = require('@discordjs/voice');

const {
    Readable
} = require('stream');

// ============================================================
// SERVER STATE
// ============================================================

const players =
    new Map();

const connections =
    new Map();

const songs =
    new Map();

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

function connectToVoice(
    message
) {

    if (
        !message?.guild ||
        !message.member?.voice?.channel
    ) {

        return {
            success: false,

            message:
                '🦆 Entra primeiro num canal de voz.'
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
            getPlayer(
                guildId
            )
        );
    }

    return {
        success: true,
        connection
    };
}

// ============================================================
// GET AUDIO STREAM
// ============================================================

async function getAudioStream(
    url
) {

    if (
        typeof url !== 'string' ||
        !url.trim()
    ) {

        throw new Error(
            'Invalid audio URL.'
        );
    }

    console.log(
        '🎵 STREAM: fetching Audius URL...'
    );

    const response =
        await fetch(url);

    console.log(
        '🎵 STREAM: response status:',
        response.status
    );

    if (!response.ok) {

        throw new Error(
            `Audio stream failed (${response.status}).`
        );
    }

    if (!response.body) {

        throw new Error(
            'Audio stream has no body.'
        );
    }

    console.log(
        '✅ STREAM: response body received'
    );

    return Readable.fromWeb(
        response.body
    );
}

// ============================================================
// PLAY
// ============================================================

async function play(
    data = {}
) {

    const {
        query,
        url,
        track,
        message
    } = data;

    console.log(
        '🎵 PLAY START:',
        JSON.stringify({
            query,
            hasUrl:
                Boolean(url),
            guildId:
                message?.guildId,
            track:
                track?.title ||
                null
        })
    );

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

        // ----------------------------------------------------
        // CONNECT
        // ----------------------------------------------------

        console.log(
            '🎵 PLAY 1: connecting to voice...'
        );

        const voice =
            connectToVoice(
                message
            );

        if (!voice.success) {

            console.log(
                '❌ PLAY 1 FAILED:',
                voice.message
            );

            return {
                success: false,
                action: 'play',
                message:
                    voice.message
            };
        }

        console.log(
            '✅ PLAY 1: connected to voice'
        );

        // ----------------------------------------------------
        // STOP CURRENT SONG
        // ----------------------------------------------------

        console.log(
            '🎵 PLAY 2: stopping current song...'
        );

        await stop({
            guildId
        });

        console.log(
            '✅ PLAY 2: stopped'
        );

        // ----------------------------------------------------
        // GET STREAM
        // ----------------------------------------------------

        console.log(
            '🎵 PLAY 3: requesting Audius stream...'
        );

        const stream =
            await getAudioStream(
                url
            );

        console.log(
            '✅ PLAY 3: Audius stream received'
        );

        // ----------------------------------------------------
        // PLAYER
        // ----------------------------------------------------

        console.log(
            '🎵 PLAY 4: getting player...'
        );

        const player =
            getPlayer(
                guildId
            );

        if (!player) {

            throw new Error(
                'Audio player could not be created.'
            );
        }

        console.log(
            '✅ PLAY 4: player ready'
        );

        // ----------------------------------------------------
        // RESOURCE
        // ----------------------------------------------------

        console.log(
            '🎵 PLAY 5: creating audio resource...'
        );

        const resource =
            createAudioResource(
                stream,
                {
                    inputType:
                        StreamType.Arbitrary
                }
            );

        console.log(
            '✅ PLAY 5: resource created'
        );

        // ----------------------------------------------------
        // PLAY
        // ----------------------------------------------------

        console.log(
            '🎵 PLAY 6: calling player.play()...'
        );

        player.play(
            resource
        );

        console.log(
            '✅ PLAY 6: player.play() called'
        );

        // ----------------------------------------------------
        // SONG
        // ----------------------------------------------------

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

        console.log(
            `🎶 Playing: ${song.title}`
        );

        return {

            success: true,

            action: 'play',

            song
        };

    } catch (error) {

        console.error(
            '❌ MUSIC PLAYBACK ERROR'
        );

        console.error(
            'Name:',
            error?.name
        );

        console.error(
            'Message:',
            error?.message
        );

        console.error(
            'Stack:',
            error?.stack
        );

        await stop({
            guildId
        });

        return {

            success: false,

            action: 'play',

            message:
                '🦆 Não consegui reproduzir essa música.'
        };
    }
}

// ============================================================
// PAUSE
// ============================================================

async function pause(
    data = {}
) {

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

        action:
            'pause'
    };
}

// ============================================================
// RESUME
// ============================================================

async function resume(
    data = {}
) {

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

        action:
            'resume'
    };
}

// ============================================================
// STOP
// ============================================================

async function stop(
    data = {}
) {

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

async function skip(
    data = {}
) {

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

function getCurrentSong(
    guildId
) {

    return (
        songs.get(
            guildId
        ) || null
    );
}

// ============================================================
// CURRENT FILE
// ============================================================

function getCurrentFile() {

    return null;
}

// ============================================================
// HAS CURRENT SONG
// ============================================================

function hasCurrentSong(
    guildId
) {

    return Boolean(
        getCurrentSong(
            guildId
        )
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

    connectToVoice
};