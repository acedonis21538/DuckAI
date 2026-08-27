'use strict';

// ============================================================
// DUCKAI — UNIFIED LAUNCHER
// ============================================================
//
// ONE NODE PROCESS
//
// This loads:
//
//     server.js
//     index.js
//
// inside the SAME Node.js process.
//
// That is important because both sides then share the exact
// same instances of modules such as:
//
//     capabilities/music/music.js
//
// Therefore:
//
// Discord capability
//        ↓
// music.js state
//        ↓
// Web Player
//
// all use the same in-memory state.
//
// ============================================================

console.log(
    '🚀 Starting DuckAI...'
);

// ============================================================
// WEB SERVER
// ============================================================

try {

    require('./server');

    console.log(
        '🌐 Web Player server loaded.'
    );

} catch (error) {

    console.error(
        '❌ Failed to load Web Player server:'
    );

    console.error(
        error
    );

    process.exit(1);
}

// ============================================================
// DISCORD BOT
// ============================================================

try {

    require('./index');

    console.log(
        '🤖 Discord bot loaded.'
    );

} catch (error) {

    console.error(
        '❌ Failed to load Discord bot:'
    );

    console.error(
        error
    );

    process.exit(1);
}

// ============================================================
// PROCESS ERRORS
// ============================================================

process.on(
    'uncaughtException',
    error => {

        console.error(
            '❌ Uncaught exception:',
            error
        );
    }
);

process.on(
    'unhandledRejection',
    error => {

        console.error(
            '❌ Unhandled rejection:',
            error
        );
    }
);

// ============================================================
// SHUTDOWN
// ============================================================

function shutdown(
    signal
) {

    console.log(
        `🛑 DuckAI shutting down (${signal})...`
    );

    process.exit(0);
}

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
);

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
);