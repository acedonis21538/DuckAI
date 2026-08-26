// ============================================================
// DUCKAI WEB MUSIC PLAYER SERVER
// ============================================================

const express =
    require('express');

const path =
    require('path');

const music =
    require('../music');

// ============================================================
// APP
// ============================================================

const app =
    express();

const PORT =
    process.env.PORT ||
    3000;

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
    express.json()
);

// ============================================================
// PLAYER PAGE
// ============================================================

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
// CURRENT SONG
// ============================================================

app.get(
    '/api/music',
    (req, res) => {

        const guildId =
            req.query.guildId;

        if (!guildId) {

            return res.status(400).json({

                success: false,

                error:
                    'Missing guildId.'
            });
        }

        const song =
            music.getCurrentSong(
                guildId
            );

        const state =
            music.getState(
                guildId
            );

        if (!song) {

            return res.json({

                success: true,

                song: null,

                state
            });
        }

        return res.json({

            success: true,

            song: {

                id:
                    song.id ||
                    null,

                title:
                    song.title ||
                    song.query ||
                    'Unknown song',

                artist:
                    song.artist ||
                    'Unknown artist',

                url:
                    song.url ||
                    null,

                artwork:
                    song.track
                        ?.artwork
                        ?.['150x150'] ||
                    null
            },

            state
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
                guildId
            } = req.body;

            if (!guildId) {

                return res.status(400).json({

                    success: false,

                    error:
                        'Missing guildId.'
                });
            }

            const song =
                music.getCurrentSong(
                    guildId
                );

            if (!song?.url) {

                return res.status(404).json({

                    success: false,

                    error:
                        'No song selected.'
                });
            }

            const result =
                await music.play({

                    guildId,

                    query:
                        song.query,

                    url:
                        song.url,

                    track:
                        song.track
                });

            return res.json(
                result
            );

        } catch (error) {

            console.error(
                '❌ Web player play error:',
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    'Failed to play music.'
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

            const {
                guildId
            } = req.body;

            const result =
                await music.pause({

                    guildId
                });

            return res.json(
                result
            );

        } catch (error) {

            console.error(
                '❌ Web player pause error:',
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    'Failed to pause music.'
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

            const {
                guildId
            } = req.body;

            const result =
                await music.resume({

                    guildId
                });

            return res.json(
                result
            );

        } catch (error) {

            console.error(
                '❌ Web player resume error:',
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    'Failed to resume music.'
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

            const {
                guildId
            } = req.body;

            const result =
                await music.stop({

                    guildId
                });

            return res.json(
                result
            );

        } catch (error) {

            console.error(
                '❌ Web player stop error:',
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    'Failed to stop music.'
            });
        }
    }
);

// ============================================================
// STATIC FILES
// ============================================================

app.use(
    express.static(
        __dirname
    )
);

// ============================================================
// START
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            `🌐 DuckAI Music Player running on port ${PORT}`
        );
    }
);

// ============================================================
// EXPORT
// ============================================================

module.exports = app;
