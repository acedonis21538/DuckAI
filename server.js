require('dotenv').config();

const express =
    require('express');

const path =
    require('path');

const music =
    require('./music');

const app =
    express();

const PORT =
    process.env.PORT || 3000;

app.use(
    express.json()
);

// ============================================================
// PLAYER
// ============================================================

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'player.html'
            )
        );
    }
);

app.get(
    '/player',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'player.html'
            )
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

        const state =
            music.getState(guildId);

        res.json({

            success: true,

            song:
                state.song,

            state:
                state.state
        });
    }
);

// ============================================================
// PLAY
// ============================================================

app.post(
    '/api/music/play',
    async (req, res) => {

        try {

            const {
                guildId,
                query
            } = req.body;

            const result =
                await music.play(
                    guildId,
                    query
                );

            res.json(result);

        } catch (error) {

            console.error(
                '❌ Music play error:',
                error
            );

            res.status(500).json({

                success: false,

                message:
                    '🦆 Não consegui pesquisar essa música.'
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

        try {

            res.json(
                await music.pause(
                    req.body.guildId
                )
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: 'Could not pause music.'
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

        try {

            res.json(
                await music.resume(
                    req.body.guildId
                )
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: 'Could not resume music.'
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

        try {

            res.json(
                await music.stop(
                    req.body.guildId
                )
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: 'Could not stop music.'
            });
        }
    }
);

// ============================================================
// START
// ============================================================

app.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            `🌐 DuckAI Music Player: port ${PORT}`
        );
    }
);

module.exports = app;