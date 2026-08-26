// ============================================================
// DUCKAI MUSIC PLAYER
// ============================================================

// ============================================================
// SERVER STATE
// ============================================================

const songs =
    new Map();

const states =
    new Map();

// ============================================================
// SET SONG
// ============================================================

function setSong(data = {}) {

    const {
        guildId,
        query,
        url,
        track
    } = data;

    if (!guildId || !url) {

        return {
            success: false
        };
    }

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
            'Artista desconhecido',

        url,

        track
    };

    songs.set(
        guildId,
        song
    );

    states.set(
        guildId,
        'stopped'
    );

    return {

        success: true,

        song
    };
}

// ============================================================
// PLAY
// ============================================================

async function play(data = {}) {

    const guildId =
        data.guildId ||
        data.message?.guildId;

    if (!guildId) {

        return {

            success: false,

            action: 'play',

            message:
                'Servidor inválido.'
        };
    }

    let song =
        songs.get(
            guildId
        );

    // ========================================================
    // SAVE SONG IF PROVIDED
    // ========================================================

    if (
        !song &&
        data.url
    ) {

        const result =
            setSong({

                guildId,

                query:
                    data.query,

                url:
                    data.url,

                track:
                    data.track
            });

        if (
            !result.success
        ) {

            return {

                success: false,

                action: 'play'
            };
        }

        song =
            result.song;
    }

    // ========================================================
    // NO SONG
    // ========================================================

    if (!song) {

        return {

            success: false,

            action: 'play',

            message:
                '🎵 Nenhuma música selecionada.'
        };
    }

    // ========================================================
    // PLAY STATE
    // ========================================================

    states.set(
        guildId,
        'playing'
    );

    console.log(
        `🎵 PLAY: ${song.title}`
    );

    return {

        success: true,

        action: 'play',

        song
    };
}

// ============================================================
// PAUSE
// ============================================================

async function pause(data = {}) {

    const guildId =
        data.guildId;

    if (
        !guildId ||
        !songs.has(guildId)
    ) {

        return {

            success: false,

            action: 'pause'
        };
    }

    states.set(
        guildId,
        'paused'
    );

    console.log(
        `⏸️ PAUSE: ${guildId}`
    );

    return {

        success: true,

        action: 'pause'
    };
}

// ============================================================
// RESUME
// ============================================================

async function resume(data = {}) {

    const guildId =
        data.guildId;

    if (
        !guildId ||
        !songs.has(guildId)
    ) {

        return {

            success: false,

            action: 'resume'
        };
    }

    states.set(
        guildId,
        'playing'
    );

    console.log(
        `▶️ RESUME: ${guildId}`
    );

    return {

        success: true,

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

    if (
        !songs.has(guildId)
    ) {

        return {

            success: false,

            action: 'stop'
        };
    }

    states.set(
        guildId,
        'stopped'
    );

    console.log(
        `⏹️ STOP: ${guildId}`
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

    if (!guildId) {

        return {

            success: false,

            action: 'skip'
        };
    }

    if (
        !songs.has(guildId)
    ) {

        return {

            success: false,

            action: 'skip'
        };
    }

    states.set(
        guildId,
        'stopped'
    );

    songs.delete(
        guildId
    );

    console.log(
        `⏭️ SKIP: ${guildId}`
    );

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
        ) ||
        null
    );
}

// ============================================================
// CURRENT FILE
// ============================================================

function getCurrentFile() {

    return null;
}

// ============================================================
// STATE
// ============================================================

function getState(guildId) {

    return (
        states.get(
            guildId
        ) ||
        'stopped'
    );
}

// ============================================================
// HAS CURRENT SONG
// ============================================================

function hasCurrentSong(guildId) {

    return Boolean(
        songs.get(
            guildId
        )
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    setSong,

    play,

    pause,

    resume,

    stop,

    skip,

    getCurrentSong,

    getCurrentFile,

    getState,

    hasCurrentSong
};