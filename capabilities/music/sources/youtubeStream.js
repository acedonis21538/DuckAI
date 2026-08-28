'use strict';

// ============================================================
// DUCKAI — YOUTUBE STREAM PROVIDER
// ============================================================
//
// Responsibilities:
//
// • Extract a direct audio stream URL from YouTube.
// • Use yt-dlp.
// • Return metadata useful to the music system.
// • Never download the complete audio file.
//
// Requirements:
//
// • yt-dlp installed and available in PATH.
// • Node.js 22+.
// • Current yt-dlp builds may require an external JS runtime
//   and EJS challenge solver for YouTube extraction.
//
// ============================================================

const {
    spawn
} = require('child_process');

const path =
    require('path');

const fs =
    require('fs');

// ============================================================
// CONFIG
// ============================================================

const YTDLP_COMMAND =
    process.env.YTDLP_COMMAND ||
    'yt-dlp';

const YTDLP_TIMEOUT =
    Number(
        process.env.YTDLP_TIMEOUT
    ) || 30000;

// ============================================================
// COMMAND HELPER
// ============================================================

function runYtDlp(
    args,
    timeout =
        YTDLP_TIMEOUT
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const child =
                spawn(
                    YTDLP_COMMAND,
                    args,
                    {

                        windowsHide:
                            true,

                        stdio:
                            [
                                'ignore',
                                'pipe',
                                'pipe'
                            ]
                    }
                );

            let stdout =
                '';

            let stderr =
                '';

            let settled =
                false;

            const finish =
                (
                    callback,
                    value
                ) => {

                    if (
                        settled
                    ) {

                        return;
                    }

                    settled =
                        true;

                    clearTimeout(
                        timer
                    );

                    callback(
                        value
                    );
                };

            child.stdout.on(
                'data',
                chunk => {

                    stdout +=
                        chunk.toString();
                }
            );

            child.stderr.on(
                'data',
                chunk => {

                    stderr +=
                        chunk.toString();
                }
            );

            child.on(
                'error',
                error => {

                    finish(
                        reject,
                        error
                    );
                }
            );

            child.on(
                'close',
                code => {

                    if (
                        code === 0
                    ) {

                        finish(
                            resolve,
                            {

                                stdout:
                                    stdout.trim(),

                                stderr:
                                    stderr.trim()
                            }
                        );

                        return;
                    }

                    const error =
                        new Error(
                            `yt-dlp exited with code ${code}: ${stderr.trim() || 'unknown error'}`
                        );

                    error.code =
                        code;

                    error.stdout =
                        stdout;

                    error.stderr =
                        stderr;

                    finish(
                        reject,
                        error
                    );
                }
            );

            const timer =
                setTimeout(
                    () => {

                        try {

                            child.kill(
                                'SIGKILL'
                            );

                        } catch {
                            // Ignore kill errors.
                        }

                        const error =
                            new Error(
                                `yt-dlp timed out after ${timeout}ms`
                            );

                        error.code =
                            'YTDLP_TIMEOUT';

                        finish(
                            reject,
                            error
                        );

                    },
                    timeout
                );
        }
    );
}

// ============================================================
// VALIDATE YOUTUBE URL
// ============================================================

function isYouTubeUrl(
    value
) {

    if (
        typeof value !== 'string'
    ) {

        return false;
    }

    try {

        const url =
            new URL(
                value
            );

        const hostname =
            url.hostname
                .toLowerCase()
                .replace(
                    /^www\./,
                    ''
                );

        return (
            hostname ===
                'youtube.com' ||
            hostname ===
                'youtu.be' ||
            hostname ===
                'm.youtube.com' ||
            hostname ===
                'music.youtube.com'
        );

    } catch {

        return false;
    }
}

// ============================================================
// NORMALIZE INPUT
// ============================================================
//
// Accepts:
//
// https://www.youtube.com/watch?v=...
// https://youtu.be/...
// YouTube video ID
//
// ============================================================

function normalizeYouTubeInput(
    input
) {

    if (
        typeof input !== 'string' ||
        !input.trim()
    ) {

        throw new Error(
            'Missing YouTube URL or video ID.'
        );
    }

    const value =
        input.trim();

    if (
        isYouTubeUrl(
            value
        )
    ) {

        return value;
    }

    // 11-character YouTube video ID.

    if (
        /^[A-Za-z0-9_-]{11}$/.test(
            value
        )
    ) {

        return (
            `https://www.youtube.com/watch?v=${value}`
        );
    }

    throw new Error(
        'Invalid YouTube URL or video ID.'
    );
}

// ============================================================
// EXTRACT STREAM
// ============================================================

async function getStream(
    input
) {

    const url =
        normalizeYouTubeInput(
            input
        );

    // --------------------------------------------------------
    // We ask yt-dlp for the best audio-only format.
    //
    // --no-playlist:
    // Never accidentally process an entire playlist.
    //
    // --js-runtimes node:
    // Current yt-dlp YouTube extraction can require an external
    // JavaScript runtime.
    //
    // --format bestaudio/best:
    // Prefer audio-only formats.
    //
    // --get-url:
    // Return the direct media URL instead of downloading.
    // --------------------------------------------------------

    const args = [

        '--no-playlist',

        '--no-warnings',

        '--js-runtimes',
        'node',

        '--format',
        'bestaudio/best',

        '--get-url',

        url
    ];

    const result =
        await runYtDlp(
            args
        );

    const streamURL =
        result.stdout
            .split(/\r?\n/)
            .map(
                line =>
                    line.trim()
            )
            .find(
                line =>
                    /^https?:\/\//i.test(
                        line
                    )
            );

    if (
        !streamURL
    ) {

        throw new Error(
            `yt-dlp did not return a stream URL.${result.stderr ? ` ${result.stderr}` : ''}`
        );
    }

    return {

        success:
            true,

        source:
            'youtube',

        url:
            streamURL,

        playable:
            true
    };
}

// ============================================================
// GET METADATA + STREAM
// ============================================================
//
// Useful when the player wants both metadata and stream data.
//
// ============================================================

async function getTrack(
    input
) {

    const url =
        normalizeYouTubeInput(
            input
        );

    const args = [

        '--no-playlist',

        '--no-warnings',

        '--js-runtimes',
        'node',

        '--dump-single-json',

        '--format',
        'bestaudio/best',

        url
    ];

    const result =
        await runYtDlp(
            args
        );

    let data;

    try {

        data =
            JSON.parse(
                result.stdout
            );

    } catch {

        throw new Error(
            `Could not parse yt-dlp metadata.${result.stderr ? ` ${result.stderr}` : ''}`
        );
    }

    const streamURL =
        typeof data?.url === 'string'
            ? data.url
            : null;

    if (
        !streamURL
    ) {

        throw new Error(
            'yt-dlp returned metadata without a stream URL.'
        );
    }

    return {

        success:
            true,

        source:
            'youtube',

        url:
            streamURL,

        playable:
            true,

        id:
            data.id ||
            null,

        title:
            data.title ||
            'Unknown title',

        artist:
            data.uploader ||
            data.channel ||
            'Unknown artist',

        channelId:
            data.channel_id ||
            null,

        channelTitle:
            data.channel ||
            data.uploader ||
            'Unknown artist',

        duration:
            Number.isFinite(
                data.duration
            )
                ? data.duration
                : null,

        artwork:
            data.thumbnail ||
            null,

        description:
            data.description ||
            null,

        permalink:
            data.webpage_url ||
            url
    };
}

// ============================================================
// CHECK YT-DLP
// ============================================================

async function checkAvailable() {

    try {

        const result =
            await runYtDlp(
                [
                    '--version'
                ],
                10000
            );

        return {

            available:
                true,

            version:
                result.stdout || null
        };

    } catch (error) {

        return {

            available:
                false,

            version:
                null,

            error:
                error.message
        };
    }
}

// ============================================================
// CACHE
// ============================================================
//
// Direct YouTube URLs can expire. Do not persist them.
//
// We cache only briefly to avoid repeatedly running yt-dlp
// during a single playback request.
//
// ============================================================

const streamCache =
    new Map();

const STREAM_CACHE_TTL =
    60 * 1000;

function getCachedStream(
    key
) {

    const cached =
        streamCache.get(
            key
        );

    if (
        !cached
    ) {

        return null;
    }

    if (
        Date.now() -
            cached.createdAt >
        STREAM_CACHE_TTL
    ) {

        streamCache.delete(
            key
        );

        return null;
    }

    return cached.value;
}

function setCachedStream(
    key,
    value
) {

    streamCache.set(
        key,
        {

            value,

            createdAt:
                Date.now()
        }
    );

    return value;
}

// ============================================================
// CACHED STREAM
// ============================================================

async function getCachedOrExtractStream(
    input
) {

    const normalized =
        normalizeYouTubeInput(
            input
        );

    const cached =
        getCachedStream(
            normalized
        );

    if (
        cached
    ) {

        return cached;
    }

    const result =
        await getStream(
            normalized
        );

    return setCachedStream(
        normalized,
        result
    );
}

// ============================================================
// CLEANUP
// ============================================================

function cleanupCache() {

    const now =
        Date.now();

    for (
        const [
            key,
            cached
        ]
        of streamCache
    ) {

        if (
            now -
                cached.createdAt >
            STREAM_CACHE_TTL
        ) {

            streamCache.delete(
                key
            );
        }
    }
}

setInterval(
    cleanupCache,
    30 * 1000
).unref();

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    getStream,

    getCachedOrExtractStream,

    getTrack,

    checkAvailable,

    isYouTubeUrl,

    normalizeYouTubeInput
};