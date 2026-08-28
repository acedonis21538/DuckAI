'use strict';

// ============================================================
// DUCKAI — YOUTUBE STREAM PROVIDER
// ============================================================
//
// Responsibilities:
//
// • Extract a direct audio stream URL from YouTube.
// • Try play-dl first.
// • Fall back to yt-dlp.
// • Support YouTube cookies when configured.
// • Automatically detect Node/Deno JS runtimes.
// • Support yt-dlp-ejs when available.
// • Never download the complete audio file.
// • Return metadata useful to the music system.
//
// ============================================================

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================
// OPTIONAL PLAY-DL
// ============================================================

let playdl = null;

try {
    playdl = require('play-dl');
    console.log('✅ play-dl loaded.');
} catch (error) {
    console.warn(
        '⚠️ play-dl unavailable:',
        error.message
    );
}

// ============================================================
// CONFIG
// ============================================================

const YTDLP_TIMEOUT =
    Number(process.env.YTDLP_TIMEOUT) || 30000;

// ============================================================
// YOUTUBE COOKIES
// ============================================================

function getYouTubeCookiesPath() {
    const configuredPath =
        process.env.YOUTUBE_COOKIES_PATH;

    if (
        typeof configuredPath !== 'string' ||
        !configuredPath.trim()
    ) {
        return null;
    }

    const cookiePath =
        path.resolve(configuredPath.trim());

    try {
        if (!fs.existsSync(cookiePath)) {
            console.warn(
                '⚠️ YouTube cookies file was configured but was not found.'
            );
            return null;
        }

        const stats = fs.statSync(cookiePath);

        if (!stats.isFile()) {
            console.warn(
                '⚠️ YouTube cookies path is not a file.'
            );
            return null;
        }

        return cookiePath;
    } catch (error) {
        console.warn(
            '⚠️ Could not access YouTube cookies file:',
            error.message
        );

        return null;
    }
}

function getYouTubeCookieArgs() {
    const cookiePath =
        getYouTubeCookiesPath();

    if (!cookiePath) {
        return [];
    }

    return [
        '--cookies',
        cookiePath
    ];
}

function hasYouTubeCookies() {
    return Boolean(
        getYouTubeCookiesPath()
    );
}

// ============================================================
// YT-DLP COMMAND
// ============================================================

const YTDLP_CANDIDATES = [
    process.env.YTDLP_COMMAND,
    'yt-dlp',
    '/home/codespace/.python/current/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/opt/render/project/.venv/bin/yt-dlp'
].filter(Boolean);

function resolveYtDlpCommand() {
    for (const candidate of YTDLP_CANDIDATES) {
        if (candidate === 'yt-dlp') {
            return candidate;
        }

        try {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        } catch {}
    }

    return 'yt-dlp';
}

const YTDLP_COMMAND =
    resolveYtDlpCommand();

console.log(
    `🎬 yt-dlp command: ${YTDLP_COMMAND}`
);

if (hasYouTubeCookies()) {
    console.log(
        '🍪 YouTube cookies: configured.'
    );
} else {
    console.log(
        '🍪 YouTube cookies: not configured.'
    );
}

// ============================================================
// JS RUNTIME DETECTION
// ============================================================
//
// yt-dlp now uses a JS runtime for some YouTube extraction
// challenges.
//
// Render already provides Node.js, so Node is preferred.
// Deno is used when available.
//
// ============================================================

function commandExists(command) {
    return new Promise(resolve => {
        const child = spawn(
            command,
            ['--version'],
            {
                windowsHide: true,
                stdio: [
                    'ignore',
                    'ignore',
                    'ignore'
                ]
            }
        );

        child.once('error', () => {
            resolve(false);
        });

        child.once('close', code => {
            resolve(code === 0);
        });
    });
}

async function detectJsRuntimes() {
    const runtimes = [];

    try {
        if (await commandExists('node')) {
            runtimes.push('node');
        }
    } catch {}

    try {
        if (await commandExists('deno')) {
            runtimes.push('deno');
        }
    } catch {}

    return runtimes;
}

// ============================================================
// YT-DLP BASE ARGS
// ============================================================

function getYtDlpBaseArgs() {
    return [
        '--no-playlist',
        '--no-warnings',

        // Enable the yt-dlp EJS system when installed.
        '--remote-components',
        'ejs:github',

        // Prefer the best available audio stream.
        '--format',
        'bestaudio/best',

        ...getYouTubeCookieArgs()
    ];
}

// ============================================================
// COMMAND HELPER
// ============================================================

function runYtDlp(
    args,
    timeout = YTDLP_TIMEOUT
) {
    return new Promise(
        (resolve, reject) => {
            let child;

            try {
                child = spawn(
                    YTDLP_COMMAND,
                    args,
                    {
                        windowsHide: true,
                        stdio: [
                            'ignore',
                            'pipe',
                            'pipe'
                        ]
                    }
                );
            } catch (error) {
                reject(error);
                return;
            }

            let stdout = '';
            let stderr = '';
            let settled = false;
            let timer;

            const finish = (
                callback,
                value
            ) => {
                if (settled) {
                    return;
                }

                settled = true;

                if (timer) {
                    clearTimeout(timer);
                }

                callback(value);
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
                    if (code === 0) {
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
                            `yt-dlp exited with code ${code}: ${
                                stderr.trim() ||
                                'unknown error'
                            }`
                        );

                    error.code = code;
                    error.stdout = stdout;
                    error.stderr = stderr;

                    finish(
                        reject,
                        error
                    );
                }
            );

            timer = setTimeout(
                () => {
                    try {
                        child.kill('SIGKILL');
                    } catch {}

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
// YOUTUBE URL VALIDATION
// ============================================================

function isYouTubeUrl(value) {
    if (
        typeof value !== 'string'
    ) {
        return false;
    }

    try {
        const url =
            new URL(value);

        const hostname =
            url.hostname
                .toLowerCase()
                .replace(/^www\./, '');

        return (
            hostname === 'youtube.com' ||
            hostname === 'youtu.be' ||
            hostname === 'm.youtube.com' ||
            hostname === 'music.youtube.com'
        );
    } catch {
        return false;
    }
}

// ============================================================
// NORMALIZE INPUT
// ============================================================

function normalizeYouTubeInput(input) {
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

    if (isYouTubeUrl(value)) {
        return value;
    }

    if (
        /^[A-Za-z0-9_-]{11}$/.test(value)
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
// PLAY-DL STREAM
// ============================================================

async function getPlayDlStream(input) {
    if (
        !playdl ||
        typeof playdl.stream !== 'function'
    ) {
        throw new Error(
            'play-dl is not available.'
        );
    }

    const url =
        normalizeYouTubeInput(input);

    console.log(
        `🎵 play-dl extracting: ${url}`
    );

    const result =
        await playdl.stream(url);

    const streamURL =
        typeof result?.url === 'string'
            ? result.url
            : typeof result?.stream_info?.url === 'string'
                ? result.stream_info.url
                : null;

    if (!streamURL) {
        throw new Error(
            'play-dl did not return a direct media URL.'
        );
    }

    return {
        success: true,
        source: 'youtube',
        provider: 'play-dl',
        url: streamURL,
        playable: true
    };
}

// ============================================================
// YT-DLP STREAM
// ============================================================
//
// Strategy:
//
// 1. Try Node runtime.
// 2. Try Deno runtime.
// 3. Try without explicitly specifying a JS runtime.
//
// This makes the provider work on environments where only
// Node is available, such as the standard Render Node service.
//
// ============================================================

async function getYtDlpStream(input) {
    const url =
        normalizeYouTubeInput(input);

    console.log(
        `🎬 yt-dlp extracting: ${url}`
    );

    const runtimes =
        await detectJsRuntimes();

    console.log(
        `🧠 yt-dlp JS runtimes: ${
            runtimes.length
                ? runtimes.join(', ')
                : 'none detected'
        }`
    );

    const attempts = [];

    // Prefer Node because Render already provides Node.
    if (runtimes.includes('node')) {
        attempts.push({
            name: 'node',
            args: [
                ...getYtDlpBaseArgs(),
                '--js-runtimes',
                'node',
                '--get-url',
                url
            ]
        });
    }

    // Deno remains available when installed.
    if (runtimes.includes('deno')) {
        attempts.push({
            name: 'deno',
            args: [
                ...getYtDlpBaseArgs(),
                '--js-runtimes',
                'deno',
                '--get-url',
                url
            ]
        });
    }

    // Final compatibility attempt.
    attempts.push({
        name: 'automatic',
        args: [
            ...getYtDlpBaseArgs(),
            '--get-url',
            url
        ]
    });

    let lastError = null;

    for (const attempt of attempts) {
        try {
            console.log(
                `🎬 yt-dlp attempt: ${attempt.name}`
            );

            const result =
                await runYtDlp(
                    attempt.args
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

            if (!streamURL) {
                throw new Error(
                    `yt-dlp did not return a stream URL.${
                        result.stderr
                            ? ` ${result.stderr}`
                            : ''
                    }`
                );
            }

            console.log(
                `✅ yt-dlp succeeded using ${attempt.name}.`
            );

            return {
                success: true,
                source: 'youtube',
                provider: 'yt-dlp',
                url: streamURL,
                playable: true
            };
        } catch (error) {
            lastError = error;

            console.warn(
                `⚠️ yt-dlp ${attempt.name} failed:`,
                error.message
            );
        }
    }

    throw (
        lastError ||
        new Error(
            'yt-dlp could not extract the YouTube audio stream.'
        )
    );
}

// ============================================================
// EXTRACT STREAM
// ============================================================

async function getStream(input) {
    const url =
        normalizeYouTubeInput(input);

    // --------------------------------------------------------
    // PLAY-DL FIRST
    // --------------------------------------------------------

    try {
        const result =
            await getPlayDlStream(url);

        console.log(
            '✅ YouTube stream obtained with play-dl.'
        );

        return result;
    } catch (error) {
        console.warn(
            '⚠️ play-dl extraction failed:',
            error.message
        );
    }

    // --------------------------------------------------------
    // YT-DLP FALLBACK
    // --------------------------------------------------------

    try {
        const result =
            await getYtDlpStream(url);

        console.log(
            '✅ YouTube stream obtained with yt-dlp.'
        );

        return result;
    } catch (error) {
        console.error(
            '❌ Both YouTube extractors failed.'
        );

        throw new Error(
            `YouTube extraction failed. ` +
            `play-dl and yt-dlp were unable to obtain an audio stream. ` +
            `${error.message}`
        );
    }
}

// ============================================================
// GET METADATA WITH PLAY-DL
// ============================================================

async function getMetadataWithPlayDl(input) {
    if (
        !playdl ||
        typeof playdl.video_basic_info !==
            'function'
    ) {
        throw new Error(
            'play-dl metadata API is unavailable.'
        );
    }

    const url =
        normalizeYouTubeInput(input);

    const info =
        await playdl.video_basic_info(url);

    const video =
        info?.video_details || {};

    return {
        id:
            video.id ||
            null,

        title:
            video.title ||
            'Unknown title',

        artist:
            video.channel?.name ||
            video.channel?.title ||
            video.author?.name ||
            'Unknown artist',

        channelId:
            video.channel?.id ||
            video.channel?.channelId ||
            null,

        channelTitle:
            video.channel?.name ||
            video.channel?.title ||
            video.author?.name ||
            'Unknown artist',

        duration:
            Number.isFinite(
                Number(
                    video.durationInSec
                )
            )
                ? Number(
                    video.durationInSec
                )
                : null,

        artwork:
            video.thumbnails?.[0]?.url ||
            null,

        description:
            video.description ||
            null,

        permalink:
            video.url ||
            url
    };
}

// ============================================================
// GET TRACK
// ============================================================

async function getTrack(input) {
    const url =
        normalizeYouTubeInput(input);

    let metadata;

    // --------------------------------------------------------
    // PLAY-DL METADATA
    // --------------------------------------------------------

    try {
        metadata =
            await getMetadataWithPlayDl(
                url
            );
    } catch (error) {
        console.warn(
            '⚠️ play-dl metadata failed:',
            error.message
        );

        // ----------------------------------------------------
        // YT-DLP METADATA FALLBACK
        // ----------------------------------------------------

        const runtimes =
            await detectJsRuntimes();

        const attempts = [];

        if (runtimes.includes('node')) {
            attempts.push([
                ...getYtDlpBaseArgs(),
                '--js-runtimes',
                'node',
                '--dump-single-json',
                url
            ]);
        }

        if (runtimes.includes('deno')) {
            attempts.push([
                ...getYtDlpBaseArgs(),
                '--js-runtimes',
                'deno',
                '--dump-single-json',
                url
            ]);
        }

        attempts.push([
            ...getYtDlpBaseArgs(),
            '--dump-single-json',
            url
        ]);

        let data = null;
        let lastError = null;

        for (const args of attempts) {
            try {
                const result =
                    await runYtDlp(args);

                data =
                    JSON.parse(
                        result.stdout
                    );

                break;
            } catch (attemptError) {
                lastError =
                    attemptError;
            }
        }

        if (!data) {
            throw new Error(
                `Could not obtain yt-dlp metadata.${
                    lastError
                        ? ` ${lastError.message}`
                        : ''
                }`
            );
        }

        metadata = {
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
                    Number(
                        data.duration
                    )
                )
                    ? Number(
                        data.duration
                    )
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

    // --------------------------------------------------------
    // OBTAIN STREAM
    // --------------------------------------------------------

    const stream =
        await getStream(url);

    return {
        success: true,
        source: 'youtube',
        provider: stream.provider,
        url: stream.url,
        playable: true,
        ...metadata
    };
}

// ============================================================
// CHECK YT-DLP
// ============================================================

async function checkAvailable() {
    try {
        const result =
            await runYtDlp(
                ['--version'],
                10000
            );

        return {
            available: true,
            version:
                result.stdout ||
                null
        };
    } catch (error) {
        return {
            available: false,
            version: null,
            error:
                error.message
        };
    }
}

// ============================================================
// CHECK PLAY-DL
// ============================================================

function checkPlayDlAvailable() {
    return {
        available:
            Boolean(
                playdl &&
                typeof playdl.stream ===
                    'function'
            ),

        version:
            playdl?.version ||
            null
    };
}

// ============================================================
// CHECK YOUTUBE COOKIES
// ============================================================

function checkYouTubeCookiesAvailable() {
    const cookiePath =
        getYouTubeCookiesPath();

    return {
        configured:
            Boolean(
                process.env.YOUTUBE_COOKIES_PATH
            ),

        available:
            Boolean(
                cookiePath
            )
    };
}

// ============================================================
// CACHE
// ============================================================

const streamCache =
    new Map();

const STREAM_CACHE_TTL =
    60 * 1000;

function getCachedStream(key) {
    const cached =
        streamCache.get(key);

    if (!cached) {
        return null;
    }

    if (
        Date.now() -
            cached.createdAt >
        STREAM_CACHE_TTL
    ) {
        streamCache.delete(key);
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

    if (cached) {
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
// CACHE CLEANUP
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
            streamCache.delete(key);
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
    checkPlayDlAvailable,
    checkYouTubeCookiesAvailable,
    isYouTubeUrl,
    normalizeYouTubeInput
};