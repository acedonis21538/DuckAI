require('dotenv').config();

const express = require('express');
const path = require('path');

const music = require('./music/music');

const app = express();

const PORT = Number(process.env.PORT) || 3000;

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
// PLAYER FILE
// ============================================================

const PLAYER_PATH =
    path.join(
        __dirname,
        'music',
        'player.html'
    );

console.log(
    `🎵 Player path: ${PLAYER_PATH}`
);

// ============================================================
// PLAYER
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

                    return;
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
                error: 'Missing guildId.'
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
                    state || 'stopped'
            });

        } catch (error) {

            console.error(
                '❌ Current music error:',
                error
            );

            return res.status(500).json({

                success: false,

                error:
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
// HEALTH
// ============================================================

app.get(
    '/health',
    (req, res) => {

        res.json({

            success: true,

            service:
                'DuckAI Music Player',

            port:
                PORT
        });
    }
);

// ============================================================
// START SERVER
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
                `🎵 Player: /player`
            );

            console.log(
                `❤️ Health: /health`
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
// EXPORT
// ============================================================

module.exports = {
    app,
    server
};
