'use strict';

// ============================================================
// DUCKAI — YOUTUBE STREAM PROVIDER
// ============================================================
//
// Responsibilities:
//
// • Convert YouTube URL/video ID into an audio stream URL.
// • Try play-dl first.
// • Fall back to yt-dlp.
// • Support cookies.
// • Support yt-dlp EJS/JS runtimes.
// • Never download the complete audio file.
//
// ============================================================

const { spawn } =
    require('child_process');

const fs =
    require('fs');

const path =
    require('path');

// ============================================================
// OPTIONAL PLAY-DL
// ============================================================

let playdl = null;

try {

    playdl =
        require('play-dl');

    console.log(
        '✅ play-dl loaded.'
    );

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
    Number(
        process.env.YTDLP_TIMEOUT
    ) || 30000;

// ============================================================
// COOKIES
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
        path.resolve(
            configured.trim()
        );

    try {

        if (!fs.existsSync(cookiePath)) {
            return null;
        }

        if (
            !fs.statSync(cookiePath).isFile()
        ) {
            return null;
        }

        return cookiePath;

    } catch {

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

    for (
        const candidate
        of YTDLP_CANDIDATES
    ) {

        if (
            candidate ===
            'yt-dlp'
        ) {
            return candidate;
        }

        try {

            if (
                fs.existsSync(
                    candidate
                )
            ) {
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

// ============================================================
// RUNTIME
// ============================================================

function commandExists(
    command
) {

    return new Promise(
        resolve => {

            const child =
                spawn(
                    command,
                    ['--version'],
                    {
                        windowsHide:
                            true,

                        stdio: [
                            'ignore',
                            'ignore',
                            'ignore'
                        ]
                    }
                );

            child.once(
                'error',
                () => resolve(false)
            );

            child.once(
                'close',
                code =>
                    resolve(
                        code === 0
                    )
            );
        }
    );
}

async function detectJsRuntimes() {

    const runtimes = [];

    if (
        await commandExists('node')
    ) {
        runtimes.push('node');
    }

    if (
        await commandExists('deno')
    ) {
        runtimes.push('deno');
    }

    return runtimes;
}

// ============================================================
// BASE ARGS
// ============================================================

function getYtDlpBaseArgs() {

    return [

        '--no-playlist',

        '--no-warnings',

        '--remote-components',
        'ejs:github',

        '--format',
        'bestaudio/best',

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

    return new Promise(
        (resolve, reject) => {

            let child;

            try {

                child =
                    spawn(
                        YTDLP_COMMAND,
                        args,
                        {
                            windowsHide:
                                true,

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

            const timer =
                setTimeout(
                    () => {

                        if (settled) {
                            return;
                        }

                        settled = true;

                        try {
                            child.kill(
                                'SIGKILL'
                            );
                        } catch {}

                        const error =
                            new Error(
                                `yt-dlp timed out after ${timeout}ms`
                            );

                        error.code =
                            'YTDLP_TIMEOUT';

                        reject(error);

                    },
                    timeout
                );

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

            child.once(
                'error',
                error => {

                    if (settled) {
                        return;
                    }

                    settled = true;

                    clearTimeout(
                        timer
                    );

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

                    clearTimeout(
                        timer
                    );

                    if (code === 0) {

                        resolve({

                            stdout:
                                stdout.trim(),

                            stderr:
                                stderr.trim()
                        });

                        return;
                    }

                    const error =
                        new Error(
                            `yt-dlp exited with code ${code}: ${
                                stderr.trim() ||
                                'unknown error'
                            }`
                        );

                    error.code =
                        code;

                    error.stdout =
                        stdout;

                    error.stderr =
                        stderr;

                    reject(error);
                }
            );
        }
    );
}

// ============================================================
// URL
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
        isYouTubeUrl(value)
    ) {
        return value;
    }

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
// PLAY-DL
// ============================================================

async function getPlayDlStream(
    input
) {

    if (
        !playdl ||
        typeof playdl.stream !==
            'function'
    ) {
        throw new Error(
            'play-dl is not available.'
        );
    }

    const url =
        normalizeYouTubeInput(
            input
        );

    console.log(
        `🎵 play-dl extracting: ${url}`
    );

    const result =
        await playdl.stream(
            url
        );

    const streamURL =
        typeof result?.url ===
            'string'
            ? result.url
            : null;

    if (!streamURL) {
        throw new Error(
            'play-dl did not return a direct media URL.'
        );
    }

    return {

        success:
            true,

        source:
            'youtube',

        provider:
            'play-dl',

        url:
            streamURL,

        playable:
            true
    };
}

// ============================================================
// YT-DLP STREAM
// ============================================================

async function getYtDlpStream(
    input
) {

    const url =
        normalizeYouTubeInput(
            input
        );

    const runtimes =
        await detectJsRuntimes();

    const attempts = [];

    if (
        runtimes.includes('node')
    ) {

        attempts.push({
            name:
                'node',

            args: [
                ...getYtDlpBaseArgs(),

                '--js-runtimes',
                'node',

                '--get-url',

                url
            ]
        });
    }

    if (
        runtimes.includes('deno')
    ) {

        attempts.push({
            name:
                'deno',

            args: [
                ...getYtDlpBaseArgs(),

                '--js-runtimes',
                'deno',

                '--get-url',

                url
            ]
        });
    }

    attempts.push({
        name:
            'automatic',

        args: [
            ...getYtDlpBaseArgs(),

            '--get-url',

            url
        ]
    });

    let lastError =
        null;

    for (
        const attempt
        of attempts
    ) {

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
                    'yt-dlp did not return a stream URL.'
                );
            }

            console.log(
                `✅ yt-dlp succeeded using ${attempt.name}.`
            );

            return {

                success:
                    true,

                source:
                    'youtube',

                provider:
                    'yt-dlp',

                url:
                    streamURL,

                playable:
                    true
            };

        } catch (error) {

            lastError =
                error;

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

async function getStream(
    input
) {

    const url =
        normalizeYouTubeInput(
            input
        );

    try {

        return await getPlayDlStream(
            url
        );

    } catch (error) {

        console.warn(
            '⚠️ play-dl extraction failed:',
            error.message
        );
    }

    try {

        return await getYtDlpStream(
            url
        );

    } catch (error) {

        throw new Error(
            `YouTube extraction failed: ${error.message}`
        );
    }
}

// ============================================================
// METADATA
// ============================================================

async function getMetadata(
    input
) {

    const url =
        normalizeYouTubeInput(
            input
        );

    try {

        if (
            playdl &&
            typeof playdl.video_basic_info ===
                'function'
        ) {

            const info =
                await playdl.video_basic_info(
                    url
                );

            const video =
                info?.video_details ||
                {};

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

    } catch (error) {

        console.warn(
            '⚠️ play-dl metadata failed:',
            error.message
        );
    }

    const runtimes =
        await detectJsRuntimes();

    const attempts = [];

    if (
        runtimes.includes('node')
    ) {

        attempts.push([
            ...getYtDlpBaseArgs(),

            '--js-runtimes',
            'node',

            '--dump-single-json',

            url
        ]);
    }

    if (
        runtimes.includes('deno')
    ) {

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

    let lastError =
        null;

    for (
        const args
        of attempts
    ) {

        try {

            const result =
                await runYtDlp(
                    args
                );

            const data =
                JSON.parse(
                    result.stdout
                );

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

        } catch (error) {

            lastError =
                error;
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

async function getTrack(
    input
) {

    const url =
        normalizeYouTubeInput(
            input
        );

    const metadata =
        await getMetadata(
            url
        );

    const stream =
        await getCachedOrExtractStream(
            url
        );

    return {

        success:
            true,

        source:
            'youtube',

        provider:
            stream.provider,

        url:
            stream.url,

        playable:
            true,

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

            available:
                true,

            version:
                result.stdout ||
                null

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
// CACHE
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

    if (!cached) {
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

    getMetadata,

    checkAvailable,

    checkPlayDlAvailable,

    checkYouTubeCookiesAvailable,

    isYouTubeUrl,

    normalizeYouTubeInput
};