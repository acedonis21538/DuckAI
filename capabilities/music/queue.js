// ============================================================
// DUCKAI MUSIC QUEUE
// ============================================================

const queues =
    new Map();

// ============================================================
// GET QUEUE
// ============================================================

function getQueue(guildId) {
    if (!guildId) {
        return [];
    }

    if (!queues.has(guildId)) {
        queues.set(
            guildId,
            []
        );
    }

    return queues.get(
        guildId
    );
}

// ============================================================
// ADD
// ============================================================

function addToQueue(data = {}) {
    const {
        guildId,
        song
    } = data;

    if (!guildId || !song) {
        return {
            success: false
        };
    }

    const queue =
        getQueue(
            guildId
        );

    queue.push(
        song
    );

    return {
        success: true,
        song,
        position:
            queue.length
    };
}

// ============================================================
// REMOVE
// ============================================================

function removeFromQueue(data = {}) {
    const {
        guildId,
        index
    } = data;

    const queue =
        getQueue(
            guildId
        );

    const position =
        Number(index);

    if (
        !Number.isInteger(position) ||
        position < 0 ||
        position >= queue.length
    ) {
        return {
            success: false
        };
    }

    return {
        success: true,
        song:
            queue.splice(
                position,
                1
            )[0]
    };
}

// ============================================================
// CLEAR
// ============================================================

function clearQueue(data = {}) {
    if (!data.guildId) {
        return {
            success: false
        };
    }

    queues.set(
        data.guildId,
        []
    );

    return {
        success: true
    };
}

// ============================================================
// NEXT
// ============================================================

function getNextSong(guildId) {
    const queue =
        getQueue(
            guildId
        );

    return queue.length
        ? queue.shift()
        : null;
}

// ============================================================
// SIZE
// ============================================================

function getQueueSize(guildId) {
    return getQueue(
        guildId
    ).length;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    getQueue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    getNextSong,
    getQueueSize
};