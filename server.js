'use strict';

// ============================================================
// DUCKAI — WEB MUSIC SERVER
// ============================================================
//
// • Web Player
// • Music API
// • Audio.com OAuth 2.1 + PKCE
// • Audio.com usa o mesmo servidor
// • Access token fica em memória por enquanto
//
// ============================================================

require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const path = require('path');

const music =
    require('./capabilities/music/music');

const app = express();

const PORT =
    Number(process.env.PORT) || 3000;

// ============================================================
// AUDIO.COM CONFIG
// ============================================================

const AUDIOCOM_CLIENT_ID =
    process.env.AUDIOCOM_CLIENT_ID;

const AUDIOCOM_REDIRECT_URI =
    process.env.AUDIOCOM_REDIRECT_URI ||
    'https://duckai-qmfy.onrender.com/auth/audio';

const AUDIOCOM_AUTH_URL =
    process.env.AUDIOCOM_AUTH_URL ||
    'https://api.audio.com/auth/authorize';

const AUDIOCOM_TOKEN_URL =
    process.env.AUDIOCOM_TOKEN_URL ||
    'https://api.audio.com/auth/token';

// ============================================================
// AUDIO.COM STATE
// ============================================================

const audioOAuthSessions =
    new Map();

let audioAccessToken =
    null;

let audioRefreshToken =
    null;

let audioTokenExpiresAt =
    0;

// ============================================================
// EXPRESS
// ============================================================

app.use(
    express.json()
);

app.use(
    express.urlencoded({
        extended: true
    })
);

// ============================================================
// PLAYER
// ============================================================

const PLAYER_PATH =
    path.join(
        __dirname,
        'capabilities',
        'music',
        'player.html'
    );

console.log(
    `🎵 Player path: ${PLAYER_PATH}`
);

// ============================================================
// PKCE
// ============================================================

function createCodeVerifier() {

    return crypto
        .randomBytes(64)
        .toString('base64url');
}

function createCodeChallenge(
    verifier
) {

    return crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');
}

function createOAuthState() {

    return crypto
        .randomBytes(32)
        .toString('hex');
}

// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(
    value
) {

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// WEB PLAYER
// ============================================================

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            PLAYER_PATH,
            error => {

                if (
                    error
                ) {

                    console.error(
                        '❌ Could not load player.html:',
                        error
                    );

                    if (
                        !res.headersSent
                    ) {

                        res.status(500).send(
                            'DuckAI Music Player could not be loaded.'
                        );
                    }
                }
            }
        );
    }
);

app.get(
    '/player',
    (req, res) => {

        res.sendFile(
            PLAYER_PATH,
            error => {

                if (
                    error
                ) {

                    console.error(
                        '❌ Could not load player.html:',
                        error
                    );

                    if (
                        !res.headersSent
                    ) {

                        res.status(500).send(
                            'DuckAI Music Player could not be loaded.'
                        );
                    }
                }
            }
        );
    }
);

// ============================================================
// CURRENT MUSIC
// ============================================================

app.get(
    '/api/music/current',
    (req, res) => {

        const guildId =
            req.query.guildId;

        if (
            !guildId
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        try {

            const song =
                music.getCurrentSong(
                    guildId
                );

            const state =
                music.getState(
                    guildId
                );

            return res.json({

                success: true,

                song:
                    song || null,

                state:
                    typeof state === 'string'
                        ? state
                        : state?.state ||
                          'stopped'
            });

        } catch (error) {

            console.error(
                '❌ Current music error:',
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    'Could not get current music.'
            });
        }
    }
);

// ============================================================
// SEARCH
// ============================================================

app.get(
    '/api/music/search',
    async (req, res) => {

        const query =
            typeof req.query.query === 'string'
                ? req.query.query.trim()
                : '';

        if (
            !query
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing music query.'
            });
        }

        try {

            const result =
                await music.search(
                    query
                );

            return res.json(
                result
            );

        } catch (error) {

            console.error(
                '❌ Music search error:',
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    'Could not search for that song.'
            });
        }
    }
);

// ============================================================
// PLAY
// ============================================================

app.post(
    '/api/music/play',
    async (req, res) => {

        const guildId =
            req.body?.guildId;

        if (
            !guildId
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        try {

            return res.json(
                await music.play(
                    guildId
                )
            );

        } catch (error) {

            console.error(
                '❌ Music play error:',
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    'Could not play music.'
            });
        }
    }
);

// ============================================================
// PAUSE
// ============================================================

app.post(
    '/api/music/pause',
    async (req, res) => {

        const guildId =
            req.body?.guildId;

        if (
            !guildId
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        try {

            return res.json(
                await music.pause(
                    guildId
                )
            );

        } catch (error) {

            console.error(
                '❌ Music pause error:',
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    'Could not pause music.'
            });
        }
    }
);

// ============================================================
// RESUME
// ============================================================

app.post(
    '/api/music/resume',
    async (req, res) => {

        const guildId =
            req.body?.guildId;

        if (
            !guildId
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        try {

            if (
                typeof music.resume !==
                'function'
            ) {

                return res.status(501).json({

                    success: false,

                    message:
                        'Resume is not available.'
                });
            }

            return res.json(
                await music.resume(
                    guildId
                )
            );

        } catch (error) {

            console.error(
                '❌ Music resume error:',
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    'Could not resume music.'
            });
        }
    }
);

// ============================================================
// STOP
// ============================================================

app.post(
    '/api/music/stop',
    async (req, res) => {

        const guildId =
            req.body?.guildId;

        if (
            !guildId
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        try {

            return res.json(
                await music.stop(
                    guildId
                )
            );

        } catch (error) {

            console.error(
                '❌ Music stop error:',
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    'Could not stop music.'
            });
        }
    }
);

// ============================================================
// SEEK
// ============================================================

app.post(
    '/api/music/seek',
    async (req, res) => {

        const guildId =
            req.body?.guildId;

        const position =
            Number(
                req.body?.position
            );

        if (
            !guildId
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        if (
            !Number.isFinite(position)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Invalid position.'
            });
        }

        try {

            if (
                typeof music.seek !==
                'function'
            ) {

                return res.status(501).json({

                    success: false,

                    message:
                        'Seek is not available.'
                });
            }

            return res.json(
                await music.seek(
                    guildId,
                    position
                )
            );

        } catch (error) {

            console.error(
                '❌ Music seek error:',
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    'Could not seek music.'
            });
        }
    }
);

// ============================================================
// VOLUME
// ============================================================

app.post(
    '/api/music/volume',
    async (req, res) => {

        const guildId =
            req.body?.guildId;

        const volume =
            Number(
                req.body?.volume
            );

        if (
            !guildId
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        if (
            !Number.isFinite(volume)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Invalid volume.'
            });
        }

        try {

            if (
                typeof music.setVolume !==
                'function'
            ) {

                return res.status(501).json({

                    success: false,

                    message:
                        'Volume control is not available.'
                });
            }

            return res.json(
                await music.setVolume(
                    guildId,
                    volume
                )
            );

        } catch (error) {

            console.error(
                '❌ Music volume error:',
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    'Could not change volume.'
            });
        }
    }
);

// ============================================================
// AUDIO.COM — START OAUTH / CALLBACK
// ============================================================
//
// GET /auth/audio
//
// Without code/state:
//     start OAuth.
//
// With code/state:
//     process OAuth callback.
//
// ============================================================

app.get(
    '/auth/audio',
    async (req, res) => {

        const code =
            typeof req.query.code === 'string'
                ? req.query.code
                : null;

        const state =
            typeof req.query.state === 'string'
                ? req.query.state
                : null;

        const oauthError =
            typeof req.query.error === 'string'
                ? req.query.error
                : null;

        // ========================================================
        // OAUTH ERROR
        // ========================================================

        if (
            oauthError
        ) {

            console.error(
                '❌ Audio.com OAuth error:',
                oauthError
            );

            return res.status(400).send(
                `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>DuckAI — Audio.com</title>
                </head>
                <body>
                    <h2>Audio.com authorization failed.</h2>
                    <p>${escapeHtml(oauthError)}</p>
                </body>
                </html>
                `
            );
        }

        // ========================================================
        // CALLBACK
        // ========================================================

        if (
            code ||
            state
        ) {

            if (
                !code ||
                !state
            ) {

                return res.status(400).send(
                    `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>DuckAI — Audio.com</title>
                    </head>
                    <body>
                        <h2>Invalid Audio.com callback.</h2>
                        <p>Missing authorization code or state.</p>
                    </body>
                    </html>
                    `
                );
            }

            const session =
                audioOAuthSessions.get(
                    state
                );

            if (
                !session
            ) {

                return res.status(400).send(
                    `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>DuckAI — Audio.com</title>
                    </head>
                    <body>
                        <h2>Invalid OAuth state.</h2>
                        <p>The OAuth session expired or is invalid.</p>
                    </body>
                    </html>
                    `
                );
            }

            // Single use.

            audioOAuthSessions.delete(
                state
            );

            if (
                !AUDIOCOM_CLIENT_ID ||
                !AUDIOCOM_REDIRECT_URI ||
                !AUDIOCOM_TOKEN_URL
            ) {

                console.error(
                    '❌ Audio.com OAuth configuration is incomplete.'
                );

                return res.status(500).send(
                    'Audio.com OAuth configuration is incomplete.'
                );
            }

            try {

                const body =
                    new URLSearchParams({

                        grant_type:
                            'authorization_code',

                        client_id:
                            AUDIOCOM_CLIENT_ID,

                        redirect_uri:
                            AUDIOCOM_REDIRECT_URI,

                        code,

                        code_verifier:
                            session.codeVerifier
                    });

                // ------------------------------------------------
                // PKCE public-client token exchange.
                // No Client Secret is sent.
                // ------------------------------------------------

                const tokenResponse =
                    await fetch(
                        AUDIOCOM_TOKEN_URL,
                        {

                            method:
                                'POST',

                            headers: {

                                'Content-Type':
                                    'application/x-www-form-urlencoded',

                                Accept:
                                    'application/json'
                            },

                            body:
                                body.toString()
                        }
                    );

                const tokenText =
                    await tokenResponse.text();

                let tokenData;

                try {

                    tokenData =
                        JSON.parse(
                            tokenText
                        );

                } catch {

                    tokenData = {

                        raw:
                            tokenText
                    };
                }

                if (
                    !tokenResponse.ok
                ) {

                    console.error(
                        '❌ Audio.com token exchange failed:',
                        tokenResponse.status,
                        tokenData
                    );

                    return res.status(502).send(
                        `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <title>DuckAI — Audio.com</title>
                        </head>
                        <body>
                            <h2>Audio.com token exchange failed.</h2>
                            <p>HTTP ${tokenResponse.status}</p>
                        </body>
                        </html>
                        `
                    );
                }

                if (
                    !tokenData?.access_token
                ) {

                    console.error(
                        '❌ Audio.com returned no access token.'
                    );

                    return res.status(502).send(
                        'Audio.com did not return an access token.'
                    );
                }

                // ------------------------------------------------
                // Save OAuth token in memory.
                // ------------------------------------------------

                audioAccessToken =
                    tokenData.access_token;

                audioRefreshToken =
                    tokenData.refresh_token ||
                    null;

                const expiresIn =
                    Number(
                        tokenData.expires_in
                    ) || 3600;

                audioTokenExpiresAt =
                    Date.now() +
                    Math.max(
                        60,
                        expiresIn - 60
                    ) *
                    1000;

                console.log(
                    '✅ Audio.com OAuth authorization successful.'
                );

                return res.send(
                    `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>DuckAI — Audio.com</title>
                    </head>
                    <body>
                        <h2>✅ Audio.com connected.</h2>
                        <p>DuckAI successfully authorized Audio.com.</p>
                        <p>You can close this page.</p>
                    </body>
                    </html>
                    `
                );

            } catch (error) {

                console.error(
                    '❌ Audio.com token request failed:',
                    error
                );

                return res.status(500).send(
                    'Could not complete Audio.com authorization.'
                );
            }
        }

        // ========================================================
        // START OAUTH
        // ========================================================

        if (
            !AUDIOCOM_CLIENT_ID
        ) {

            return res.status(500).send(
                'AUDIOCOM_CLIENT_ID is missing.'
            );
        }

        if (
            !AUDIOCOM_REDIRECT_URI
        ) {

            return res.status(500).send(
                'AUDIOCOM_REDIRECT_URI is missing.'
            );
        }

        if (
            !AUDIOCOM_AUTH_URL
        ) {

            return res.status(500).send(
                'AUDIOCOM_AUTH_URL is missing.'
            );
        }

        const codeVerifier =
            createCodeVerifier();

        const codeChallenge =
            createCodeChallenge(
                codeVerifier
            );

        const oauthState =
            createOAuthState();

        audioOAuthSessions.set(
            oauthState,
            {

                codeVerifier,

                createdAt:
                    Date.now()
            }
        );

        // Remove expired PKCE sessions.

        const now =
            Date.now();

        for (
            const [
                storedState,
                session
            ]
            of audioOAuthSessions
        ) {

            if (
                !session?.createdAt
            ) {

                continue;
            }

            if (
                now -
                    session.createdAt >
                10 * 60 * 1000
            ) {

                audioOAuthSessions.delete(
                    storedState
                );
            }
        }

        // ========================================================
        // AUTHORIZATION REQUEST
        // ========================================================

        const params =
            new URLSearchParams({

                response_type:
                    'code',

                code_challenge:
                    codeChallenge,

                code_challenge_method:
                    'S256',

                redirect_uri:
                    AUDIOCOM_REDIRECT_URI,

                client_id:
                    AUDIOCOM_CLIENT_ID,

                state:
                    oauthState,

                scope:
                    'public'
            });

        const authorizationURL =
            `${AUDIOCOM_AUTH_URL}?${params.toString()}`;

        console.log(
            '🔐 Starting Audio.com OAuth flow.'
        );

        return res.redirect(
            authorizationURL
        );
    }
);

// ============================================================
// AUDIO.COM STATUS
// ============================================================

app.get(
    '/auth/audio/status',
    (req, res) => {

        return res.json({

            connected:
                Boolean(
                    audioAccessToken
                ),

            expiresAt:
                audioAccessToken
                    ? audioTokenExpiresAt
                    : null,

            hasRefreshToken:
                Boolean(
                    audioRefreshToken
                )
        });
    }
);

// ============================================================
// HEALTH
// ============================================================

app.get(
    '/health',
    (req, res) => {

        res.json({

            success:
                true,

            service:
                'DuckAI Music Web Player',

            audio:
                'browser-player + Discord Voice',

            voiceChannel:
                true,

            port:
                PORT,

            audioComOAuth:
                Boolean(
                    AUDIOCOM_CLIENT_ID
                )
        });
    }
);

// ============================================================
// START
// ============================================================

const server =
    app.listen(
        PORT,
        '0.0.0.0',
        () => {

            console.log(
                '────────────────────────────'
            );

            console.log(
                `🌐 DuckAI Music Player: port ${PORT}`
            );

            console.log(
                '🎵 Web Player: /player'
            );

            console.log(
                '🔊 Discord Voice: enabled'
            );

            console.log(
                '❤️ Health: /health'
            );

            console.log(
                '🔐 Audio.com OAuth: /auth/audio'
            );

            console.log(
                '────────────────────────────'
            );
        }
    );

server.on(
    'error',
    error => {

        console.error(
            '❌ Music server error:',
            error
        );
    }
);

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    app,
    server
};