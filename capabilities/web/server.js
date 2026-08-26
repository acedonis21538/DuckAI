// ============================================================
// DUCKAI WEB PLAYER SERVER
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const music =
    require('../capabilities/music');

const PORT =
    Number(process.env.PLAYER_PORT) || 3000;

const PLAYER_FILE =
    path.join(
        __dirname,
        'player.html'
    );

// ============================================================
// JSON RESPONSE
// ============================================================

function sendJSON(
    response,
    status,
    data
) {

    response.writeHead(
        status,
        {
            'Content-Type':
                'application/json; charset=utf-8',

            'Access-Control-Allow-Origin':
                '*',

            'Cache-Control':
                'no-store'
        }
    );

    response.end(
        JSON.stringify(data)
    );
}

// ============================================================
// SERVER
// ============================================================

const server =
    http.createServer(
        (request, response) => {

            const url =
                new URL(
                    request.url,
                    `http://${request.headers.host}`
                );

            // ====================================================
            // PLAYER PAGE
            // ====================================================

            if (
                url.pathname === '/' ||
                url.pathname === '/player'
            ) {

                fs.readFile(
                    PLAYER_FILE,
                    'utf8',
                    (error, html) => {

                        if (error) {

                            sendJSON(
                                response,
                                500,
                                {
                                    success: false,
                                    error:
                                        'Player unavailable.'
                                }
                            );

                            return;
                        }

                        response.writeHead(
                            200,
                            {
                                'Content-Type':
                                    'text/html; charset=utf-8'
                            }
                        );

                        response.end(
                            html
                        );
                    }
                );

                return;
            }

            // ====================================================
            // CURRENT SONG
            // ====================================================

            if (
                url.pathname ===
                '/api/music/current'
            ) {

                const guildId =
                    url.searchParams.get(
                        'guildId'
                    );

                if (!guildId) {

                    sendJSON(
                        response,
                        400,
                        {
                            success: false,
                            error:
                                'Missing guildId.'
                        }
                    );

                    return;
                }

                const song =
                    music.getCurrentSong(
                        guildId
                    );

                const state =
                    music.getState(
                        guildId
                    );

                sendJSON(
                    response,
                    200,
                    {
                        success: true,

                        song: song
                            ? {
                                id:
                                    song.id,

                                title:
                                    song.title,

                                artist:
                                    song.artist,

                                url:
                                    song.url,

                                artwork:
                                    song.track
                                        ?.artwork
                                        ?.['1000x1000'] ||
                                    song.track
                                        ?.artwork
                                        ?.['480x480'] ||
                                    song.track
                                        ?.artwork
                                        ?.['150x150'] ||
                                    null
                            }
                            : null,

                        state
                    }
                );

                return;
            }

            // ====================================================
            // 404
            // ====================================================

            sendJSON(
                response,
                404,
                {
                    success: false,
                    error:
                        'Not found.'
                }
            );
        }
    );

// ============================================================
// START
// ============================================================

server.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            `🎵 Web player running on port ${PORT}`
        );
    }
);

// ============================================================
// EXPORT
// ============================================================

module.exports = server;