// ============================================================
// DUCKAI — WEB MUSIC SERVER
// ============================================================
// Servidor temporário do Web Player.
//
// IMPORTANTE:
// • NÃO usa Voice Channels.
// • NÃO reproduz áudio no Discord.
// • O áudio é reproduzido APENAS pelo browser.
// • O music.js controla pesquisa/estado.
// • O player.html reproduz o stream.
// ============================================================

require('dotenv').config();

const express = require('express');
const path = require('path');

const music = require('./capabilities/music/music');

const app = express();

const PORT =
    Number(process.env.PORT) || 3000;

// ============================================================
// CONFIG
// ============================================================

app.use(express.json());

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
// WEB PLAYER
// ============================================================

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            PLAYER_PATH,
            error => {

                if (error) {

                    console.error(
                        '❌ Could not load player.html:',
                        error
                    );

                    if (!res.headersSent) {

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

                if (error) {

                    console.error(
                        '❌ Could not load player.html:',
                        error
                    );

                    if (!res.headersSent) {

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

        if (!guildId) {

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
                        : state?.state || 'stopped'
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

        if (!query) {

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
// Isto NÃO toca áudio.
//
// Apenas coloca o estado em "playing".
// O player.html é que reproduz o stream.

app.post(
    '/api/music/play',
    async (req, res) => {

        const guildId =
            req.body?.guildId;

        if (!guildId) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        try {

            const result =
                await music.play(
                    guildId
                );

            return res.json(
                result
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

        if (!guildId) {

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

        if (!guildId) {

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

        if (!guildId) {

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

        if (!guildId) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        if (!Number.isFinite(position)) {

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

        if (!guildId) {

            return res.status(400).json({

                success: false,

                message:
                    'Missing guildId.'
            });
        }

        if (!Number.isFinite(volume)) {

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
// HEALTH
// ============================================================

app.get(
    '/health',
    (req, res) => {

        res.json({

            success: true,

            service:
                'DuckAI Music Web Player',

            audio:
                'browser-only',

            voiceChannel:
                false,

            port:
                PORT
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
                '🔊 Audio: browser only'
            );

            console.log(
                '🚫 Voice Channel: disabled'
            );

            console.log(
                '❤️ Health: /health'
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