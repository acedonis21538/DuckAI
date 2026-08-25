// ============================================================
// DUCKAI MUSIC CAPABILITY
// ============================================================

const source =
    require('./source');

const player =
    require('./player');

const queue =
    require('./queue');

const responses =
    require('./responses');

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    // SOURCE

    source,

    searchTracks:
        source.searchTracks,

    getTrack:
        source.getTrack,

    getStreamUrl:
        source.getStreamUrl,

    findTrack:
        source.findTrack,

    // PLAYER

    play:
        player.play,

    pause:
        player.pause,

    resume:
        player.resume,

    stop:
        player.stop,

    skip:
        player.skip,

    getCurrentSong:
        player.getCurrentSong,

    getCurrentFile:
        player.getCurrentFile,

    hasCurrentSong:
        player.hasCurrentSong,

    downloadAudio:
        player.downloadAudio,

    connectToVoice:
        player.connectToVoice,

    // QUEUE

    getQueue:
        queue.getQueue,

    addToQueue:
        queue.addToQueue,

    removeFromQueue:
        queue.removeFromQueue,

    clearQueue:
        queue.clearQueue,

    getNextSong:
        queue.getNextSong,

    getQueueSize:
        queue.getQueueSize,

    // RESPONSES

    responses,

    getResponse:
        responses.getResponse
};