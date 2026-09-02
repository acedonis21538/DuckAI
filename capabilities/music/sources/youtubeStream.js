'use strict';

// ============================================================
// DUCKAI — YOUTUBE STREAM PROVIDER
// ============================================================
//
// Responsibilities:
// • Convert a YouTube URL/video ID into an audio stream URL.
// • Try play-dl first.
// • Fall back to yt-dlp.
// • Support an optional Netscape-format cookies file.
// • Support yt-dlp JS runtimes.
// • Never download the complete video.
// • Cache short-lived stream URLs.
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
    console.warn('⚠️ play-dl unavailable:', error.message);
}

// ============================================================
// CONFIG
// ============================================================

const YTDLP_TIMEOUT =
    Number(process.env.YTDLP_TIMEOUT) || 30000;

const STREAM_CACHE_TTL =
    Number(process.env.YOUTUBE_STREAM_CACHE_TTL) || 60 * 1000;

// ============================================================
// YT-DLP COMMAND
// ============================================================

const YTDLP_CANDIDATES = [
    process.env.YTDLP_COMMAND,
    'yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/home/codespace/.python/current/bin/yt-dlp',
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
        } catch {
            // Ignore inaccessible candidates.
        }
    }

    return 'yt-dlp';
}

const YTDLP_COMMAND =
    resolveYtDlpCommand();

console.log(`🎬 yt-dlp command: ${YTDLP_COMMAND}`);

// ============================================================
// COOKIES
// ============================================================
//
// Set in .env:
//
// YOUTUBE_COOKIES_PATH=/absolute/path/to/youtube-cookies.txt
//
// The file should be Netscape cookie format.
//
// ============================================================

function getYouTubeCookiesPath() {
    const configured =
        process.env.YOUTUBE_COOKIES_PATH;

    if (
        typeof configured !== 'string' ||
        !configured.trim()
    ) {
        return null;
    }

    const cookiePath =
        path.resolve(configured.trim());

    try {
        if (!fs.existsSync(cookiePath)) {
            console.warn(
                '⚠️ YouTube cookies file not found:',
                cookiePath
            );

            return null;
        }

        if (!fs.statSync(cookiePath).isFile()) {
            console.warn(
                '⚠️ YouTube cookies path is not a file.'
            );

            return null;
        }

        return cookiePath;
    } catch (error) {
        console.warn(
            '⚠️ Could not access YouTube cookies:',
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

// ============================================================
// COMMAND EXISTS
// ============================================================

function commandExists(command) {
    return new Promise(resolve => {
        let child;

        try {
            child = spawn(
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
        } catch {
            resolve(false);
            return;
        }

        let finished = false;

        const finish = value => {
            if (finished) {
                return;
            }

            finished = true;
            resolve(value);
        };

        child.once(
            'error',
            () => finish(false)
        );

        child.once(
            'close',
            code => finish(code === 0)
        );
    });
}

// ============================================================
// JS RUNTIME DETECTION
// ============================================================

async function detectJsRuntimes() {
    const runtimes = [];

    if (await commandExists('deno')) {
        runtimes.push('deno');
    }

    if (await commandExists('node')) {
        runtimes.push('node');
    }

    return runtimes;
}

// ============================================================
// BASE YT-DLP ARGS
// ============================================================

function getYtDlpBaseArgs() {
    return [
        '--no-playlist',
        '--no-warnings',

        // Allows yt-dlp to use remotely provided EJS challenge code.
        '--remote-components',
        'ejs:github',

        ...getYouTubeCookieArgs()
    ];
}

// ============================================================
// RUN YT-DLP
// ============================================================

function runYtDlp(
    args,
    timeout = YTDLP_TIMEOUT
) {
    return new Promise((resolve, reject) => {
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

        const timer = setTimeout(() => {
            if (settled) {
                return;
            }

            settled = true;

            try {
                child.kill('SIGKILL');
            } catch {
                // Ignore kill errors.
            }

            const error = new Error(
                `yt-dlp timed out after ${timeout}ms`
            );

            error.code = 'YTDLP_TIMEOUT';

            reject(error);
        }, timeout);

        child.stdout.on(
            'data',
            chunk => {
                stdout += chunk.toString();
            }
        );

        child.stderr.on(
            'data',
            chunk => {
                stderr += chunk.toString();
            }
        );

        child.once(
            'error',
            error => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timer);

                reject(error);
            }
        );

        child.once(
            'close',
            code => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timer);

                if (code === 0) {
                    resolve({
                        stdout: stdout.trim(),
                        stderr: stderr.trim()
                    });

                    return;
                }

                const error = new Error(
                    `yt-dlp exited with code ${code}: ${
                        stderr.trim() ||
                        'unknown error'
                    }`
                );

                error.code = code;
                error.stdout = stdout;
                error.stderr = stderr;

                reject(error);
            }
        );
    });
}

// ============================================================
// YOUTUBE URL DETECTION
// ============================================================

function isYouTubeUrl(value) {
    if (typeof value !== 'string') {
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
// NORMALIZE YOUTUBE INPUT
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
        return `https://www.youtube.com/watch?v=${value}`;
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

async function getYtDlpStream(input) {
    const url =
        normalizeYouTubeInput(input);

    const runtimes =
        await detectJsRuntimes();

    console.log(
        '🧩 yt-dlp JS runtimes:',
        runtimes.length
            ? runtimes.join(', ')
            : 'none'
    );

    const attempts = [];

    // --------------------------------------------------------
    // DENO
    // --------------------------------------------------------

    if (runtimes.includes('deno')) {
        attempts.push({
            name: 'deno',
            args: [
                ...getYtDlpBaseArgs(),

                '--js-runtimes',
                'deno',

                '--format',
                'bestaudio/best',

                '--get-url',

                url
            ]
        });
    }

    // --------------------------------------------------------
    // NODE
    // --------------------------------------------------------

    if (runtimes.includes('node')) {
        attempts.push({
            name: 'node',
            args: [
                ...getYtDlpBaseArgs(),

                '--js-runtimes',
                'node',

                '--format',
                'bestaudio/best',

                '--get-url',

                url
            ]
        });
    }

    // --------------------------------------------------------
    // AUTOMATIC
    // --------------------------------------------------------

    attempts.push({
        name: 'automatic',
        args: [
            ...getYtDlpBaseArgs(),

            '--format',
            'bestaudio/best',

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

            const lines =
                result.stdout
                    .split(/\r?\n/)
                    .map(
                        line => line.trim()
                    )
                    .filter(Boolean);

            const streamURL =
                lines.find(
                    line =>
                        /^https?:\/\//i.test(line)
                );

            if (!streamURL) {
                throw new Error(
                    'yt-dlp did not return a stream URL.'
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
// GET STREAM
// ============================================================

async function getStream(input) {
    const url =
        normalizeYouTubeInput(input);

    // --------------------------------------------------------
    // PLAY-DL FIRST
    // --------------------------------------------------------

    try {
        return await getPlayDlStream(url);
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
        return await getYtDlpStream(url);
    } catch (error) {
        throw new Error(
            `YouTube extraction failed: ${error.message}`
        );
    }
}

// ============================================================
// METADATA
// ============================================================

async function getMetadata(input) {
    const url =
        normalizeYouTubeInput(input);

    // --------------------------------------------------------
    // PLAY-DL
    // --------------------------------------------------------

    try {
        if (
            playdl &&
            typeof playdl.video_basic_info === 'function'
        ) {
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
                    video.author?.name ||
                    'Unknown artist',

                channelId:
                    video.channel?.id ||
                    null,

                channelTitle:
                    video.channel?.name ||
                    video.author?.name ||
                    'Unknown artist',

                duration:
                    Number.isFinite(
                        Number(video.durationInSec)
                    )
                        ? Number(video.durationInSec)
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
    } catch (error) {
        console.warn(
            '⚠️ play-dl metadata failed:',
            error.message
        );
    }

    // --------------------------------------------------------
    // YT-DLP
    // --------------------------------------------------------

    const runtimes =
        await detectJsRuntimes();

    const attempts = [];

    if (runtimes.includes('deno')) {
        attempts.push([
            ...getYtDlpBaseArgs(),

            '--js-runtimes',
            'deno',

            '--dump-single-json',

            url
        ]);
    }

    if (runtimes.includes('node')) {
        attempts.push([
            ...getYtDlpBaseArgs(),

            '--js-runtimes',
            'node',

            '--dump-single-json',

            url
        ]);
    }

    attempts.push([
        ...getYtDlpBaseArgs(),

        '--dump-single-json',

        url
    ]);

    let lastError = null;

    for (const args of attempts) {
        try {
            const result =
                await runYtDlp(args);

            if (!result.stdout) {
                throw new Error(
                    'yt-dlp returned empty metadata.'
                );
            }

            const data =
                JSON.parse(result.stdout);

            return {
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
                        Number(data.duration)
                    )
                        ? Number(data.duration)
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
        } catch (error) {
            lastError = error;
        }
    }

    throw (
        lastError ||
        new Error(
            'Could not obtain YouTube metadata.'
        )
    );
}

// ============================================================
// TRACK
// ============================================================

async function getTrack(input) {
    const url =
        normalizeYouTubeInput(input);

    const metadata =
        await getMetadata(url);

    const stream =
        await getCachedOrExtractStream(url);

    return {
        success: true,
        source: 'youtube',

        provider:
            stream.provider,

        url:
            stream.url,

        playable: true,

        ...metadata
    };
}

// ============================================================
// AVAILABILITY
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
// PLAY-DL AVAILABILITY
// ============================================================

function checkPlayDlAvailable() {
    return {
        available:
            Boolean(
                playdl &&
                typeof playdl.stream === 'function'
            ),

        version:
            playdl?.version ||
            null
    };
}

// ============================================================
// COOKIES AVAILABILITY
// ============================================================

function checkYouTubeCookiesAvailable() {
    return {
        configured:
            Boolean(
                process.env.YOUTUBE_COOKIES_PATH
            ),

        available:
            Boolean(
                getYouTubeCookiesPath()
            )
    };
}

// ============================================================
// STREAM CACHE
// ============================================================

const streamCache =
    new Map();

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

async function getCachedOrExtractStream(input) {
    const normalized =
        normalizeYouTubeInput(input);

    const cached =
        getCachedStream(normalized);

    if (cached) {
        console.log(
            '♻️ Using cached YouTube stream.'
        );

        return cached;
    }

    const result =
        await getStream(normalized);

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
    getMetadata,

    checkAvailable,
    checkPlayDlAvailable,
    checkYouTubeCookiesAvailable,

    isYouTubeUrl,
    normalizeYouTubeInput
};