'use strict';

// ============================================================
// DUCKAI — UNIFIED STARTER
// ============================================================
//
// ONE NODE PROCESS
//
// Loads:
//   1. index.js
//      → Discord client
//   2. handler/interactionCreate.js
//      → Discord button interactions
//   3. server.js
//      → Web Player
//
// index.js remains unchanged.
//
// ============================================================

console.log(
    '🚀 Starting DuckAI...'
);

// ============================================================
// DISCORD CORE
// ============================================================

let core;

try {

    core =
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
// GET DISCORD CLIENT
// ============================================================

const client =
    core?.client;

if (
    !client
) {

    console.error(
        '❌ Could not obtain Discord client from index.js.'
    );

    process.exit(1);
}

// ============================================================
// INTERACTION HANDLER
// ============================================================
//
// The music capability itself does NOT register Discord
// listeners.
//
// The universal handler does.
//
// ============================================================

try {

    const interactionHandler =
        require(
            './handlers/interactionCreate'
        );

    if (
        typeof interactionHandler.execute !==
        'function'
    ) {

        throw new Error(
            'handler/interactionCreate.js must export execute(interaction).'
        );
    }

    client.on(
        'interactionCreate',
        interactionHandler.execute
    );

    console.log(
        '🎛️ Interaction handler loaded.'
    );

} catch (error) {

    console.error(
        '❌ Failed to load interaction handler:'
    );

    console.error(
        error
    );

    process.exit(1);
}

// ============================================================
// WEB PLAYER
// ============================================================

try {

    require(
        './server'
    );

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
// GLOBAL ERROR HANDLING
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

    process.exit(
        0
    );
}

process.on(
    'SIGINT',
    () => shutdown('SIGINT')
);

process.on(
    'SIGTERM',
    () => shutdown('SIGTERM')
);

// ============================================================
// READY
// ============================================================

console.log(
    '✅ DuckAI launcher initialized.'
);