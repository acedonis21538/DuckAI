'use strict';

const { spawn } = require('child_process');

// ============================================================
// START PROCESS
// ============================================================

function start(name, file) {

    const child =
        spawn(
            'node',
            [file],
            {
                stdio: 'inherit',
                env: { ...global.process.env }
            }
        );

    child.on(
        'exit',
        (code, signal) => {

            console.log(
                `⚠️ ${name} exited. code=${code} signal=${signal}`
            );
        }
    );

    child.on(
        'error',
        error => {

            console.error(
                `❌ ${name} failed to start:`,
                error
            );
        }
    );

    return child;
}

// ============================================================
// START DUCKAI
// ============================================================

console.log(
    '🚀 Starting DuckAI...'
);

const bot =
    start(
        'Discord Bot',
        'index.js'
    );

const web =
    start(
        'Web Player',
        'server.js'
    );

// ============================================================
// SHUTDOWN
// ============================================================

function shutdown(signal) {

    console.log(
        `🛑 Shutdown: ${signal}`
    );

    if (
        bot &&
        !bot.killed
    ) {

        bot.kill(
            'SIGTERM'
        );
    }

    if (
        web &&
        !web.killed
    ) {

        web.kill(
            'SIGTERM'
        );
    }

    setTimeout(
        () => {

            global.process.exit(
                0
            );

        },
        1000
    );
}

global.process.on(
    'SIGINT',
    () => shutdown('SIGINT')
);

global.process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
);