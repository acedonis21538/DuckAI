'use strict';

// ============================================================
// DUCKAI — YOUTUBE PROVIDER
// ============================================================
//
// Responsibilities:
//
// • Search YouTube using yt-dlp.
// • Return clean video metadata.
// • Return view count when available.
// • Return channel information.
// • Never extract/play audio.
// • Never download the complete video.
//
// Search and playback remain separate.
//
// ============================================================

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG
// ============================================================

const YTDLP_TIMEOUT =
Number(process.env.YTDLP_TIMEOUT) || 30000;

const priority = 20;

// ============================================================
// YT-DLP COMMAND
// ============================================================
//
// The hosting environment may not expose yt-dlp through PATH.
// Therefore we check:
//
// 1. Explicit YTDLP_COMMAND
// 2. Local project binaries
// 3. Common system locations
// 4. PATH fallback
//
// ============================================================

const PROJECT_ROOT =
process.cwd();

const YTDLP_CANDIDATES = [
process.env.YTDLP_COMMAND,


// Project-local binaries
path.join(
    PROJECT_ROOT,
    'node_modules',
    'youtube-dl-exec',
    'bin',
    'yt-dlp'
),

path.join(
    PROJECT_ROOT,
    'node_modules',
    'yt-dlp',
    'bin',
    'yt-dlp'
),

path.join(
    PROJECT_ROOT,
    'node_modules',
    '.bin',
    'yt-dlp'
),

// Container-local Python installations
'/home/container/.local/bin/yt-dlp',
'/home/container/.local/bin/yt-dlp',
'/home/container/venv/bin/yt-dlp',
'/home/container/.venv/bin/yt-dlp',

// Codespaces
'/home/codespace/.python/current/bin/yt-dlp',

// Render
'/opt/render/project/.venv/bin/yt-dlp',

// Common Linux locations
'/usr/local/bin/yt-dlp',
'/usr/bin/yt-dlp',
'/bin/yt-dlp',

// PATH fallback
'yt-dlp'


].filter(Boolean);

// ============================================================
// RESOLVE YT-DLP
// ============================================================

function resolveYtDlpCommand() {


for (const candidate of YTDLP_CANDIDATES) {

    // Explicit command from environment
    if (
        candidate ===
        process.env.YTDLP_COMMAND
    ) {
        return candidate;
    }

    // Absolute path
    if (
        typeof candidate === 'string' &&
        candidate.startsWith('/')
    ) {

        try {

            if (
                fs.existsSync(candidate) &&
                fs.statSync(candidate).isFile()
            ) {
                return candidate;
            }

        } catch {}
    }

    // PATH command
    else if (
        candidate === 'yt-dlp'
    ) {
        return candidate;
    }
}

return 'yt-dlp';


}

const YTDLP_COMMAND =
resolveYtDlpCommand();

console.log(
`🎬 YouTube search command: ${YTDLP_COMMAND}`
);

// ============================================================
// COOKIES
// ============================================================

function getCookieArgs() {


const configured =
    process.env.YOUTUBE_COOKIES_PATH;

if (
    typeof configured !== 'string' ||
    !configured.trim()
) {
    return [];
}

const cookiePath =
    configured.trim();

try {

    if (!fs.existsSync(cookiePath)) {

        console.warn(
            '⚠️ YouTube cookies configured but file was not found.'
        );

        return [];
    }

    if (!fs.statSync(cookiePath).isFile()) {

        console.warn(
            '⚠️ YouTube cookies path is not a file.'
        );

        return [];
    }

    return [
        '--cookies',
        cookiePath
    ];

} catch (error) {

    console.warn(
        '⚠️ Could not access YouTube cookies:',
        error.message
    );

    return [];
}


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
                    ],

                    env: {
                        ...process.env
                    }
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
                            `yt-dlp search timed out after ${timeout}ms`
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
// SEARCH
// ============================================================

async function search(query) {


if (
    typeof query !== 'string' ||
    !query.trim()
) {
    return [];
}

const cleanQuery =
    query
        .trim()
        .slice(0, 200);

console.log(
    `🔎 YouTube search: "${cleanQuery}"`
);

try {

    const args = [

        `ytsearch10:${cleanQuery}`,

        '--flat-playlist',

        '--dump-single-json',

        '--skip-download',

        '--no-warnings',

        '--no-playlist',

        ...getCookieArgs()

    ];

    const result =
        await runYtDlp(
            args
        );

    if (!result.stdout) {
        return [];
    }

    let data;

    try {

        data =
            JSON.parse(
                result.stdout
            );

    } catch (error) {

        console.warn(
            '⚠️ Could not parse yt-dlp JSON:',
            error.message
        );

        return [];
    }

    const entries =
        Array.isArray(
            data?.entries
        )
            ? data.entries
            : [];

    const results =
        entries
            .map(
                normalizeResult
            )
            .filter(
                Boolean
            );

    console.log(
        `📺 YouTube search returned ${results.length} result(s).`
    );

    return results;

} catch (error) {

    console.warn(
        '⚠️ YouTube search failed:',
        error.message
    );

    if (
        error.code ===
        'ENOENT'
    ) {

        console.warn(
            '⚠️ yt-dlp executable could not be found.'
        );

        console.warn(
            '⚠️ Configure YTDLP_COMMAND or install yt-dlp in the container.'
        );
    }

    return [];
}

}

// ============================================================
// NORMALIZE RESULT
// ============================================================

function normalizeResult(entry) {


if (
    !entry ||
    typeof entry !== 'object'
) {
    return null;
}

const id =
    typeof entry.id === 'string'
        ? entry.id
        : null;

if (!id) {
    return null;
}

const title =
    typeof entry.title === 'string' &&
    entry.title.trim()
        ? entry.title.trim()
        : null;

if (!title) {
    return null;
}

const channelTitle =
    typeof entry.channel === 'string'
        ? entry.channel.trim()
        : typeof entry.uploader === 'string'
            ? entry.uploader.trim()
            : '';

const url =
    `https://www.youtube.com/watch?v=${id}`;

const duration =
    Number.isFinite(
        Number(entry.duration)
    )
        ? Number(entry.duration)
        : null;

const viewCount =
    Number.isFinite(
        Number(entry.view_count)
    )
        ? Number(entry.view_count)
        : 0;

const thumbnail =
    typeof entry.thumbnail === 'string'
        ? entry.thumbnail
        : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

return {

    success:
        true,

    source:
        'youtube',

    title,

    artist:
        channelTitle ||
        'Unknown artist',

    url,

    permalink:
        url,

    id,

    channelId:
        entry.channel_id ||
        entry.uploader_id ||
        null,

    channelTitle:
        channelTitle ||
        null,

    artwork:
        thumbnail,

    duration,

    views:
        viewCount,

    viewCount,

    description:
        typeof entry.description === 'string'
            ? entry.description
            : null,

    uploadDate:
        entry.upload_date ||
        null,

    live:
        Boolean(entry.is_live),

    playable:
        false,

    playableThrough:
        'youtube'
};

}

// ============================================================
// PROVIDER STATUS
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

// ============================================================
// EXPORTS
// ============================================================

module.exports = {


name:
    'youtube',

priority,

search,

checkAvailable

};
