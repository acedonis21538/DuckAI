// ============================================================
// DUCKAI — CAPABILITY BRIDGE
// ============================================================
//
// Universal bridge between:
//
// CORE ROUTER
//      ↓
// capability.js
//      ↓
// CAPABILITY LOGIC
//
// Every capability should expose:
//
// • name
// • canHandle(message)
// • execute(message)
//
// The router knows NOTHING about the internal implementation.
//
// ============================================================

// ============================================================
// CONFIGURATION
// ============================================================
//
// Change these two values when creating a new capability.
//
// Example:
//
// CAPABILITY_NAME = 'music'
// CAPABILITY_MODULE = './music'
//
// ============================================================

const CAPABILITY_NAME =
    'music';

const CAPABILITY_MODULE =
    './music';
// ============================================================
// LOAD CAPABILITY LOGIC
// ============================================================

let capabilityModule;

try {

    capabilityModule =
        require(
            CAPABILITY_MODULE
        );

} catch (error) {

    console.error(
        `❌ Could not load capability "${CAPABILITY_NAME}":`,
        error
    );

    capabilityModule =
        null;
}

// ============================================================
// CAN HANDLE
// ============================================================
//
// This function decides whether this capability
// should handle the message.
//
// Preferred implementations:
//
// Inside the capability logic:
//
// module.exports = {
//
//     canHandle(message) {
//         return true/false;
//     }
//
// };
//
// ============================================================

async function canHandle(
    message
) {

    if (
        !message ||
        !capabilityModule
    ) {

        return false;
    }

    try {

        // ----------------------------------------------------
        // UNIVERSAL HANDLER
        // ----------------------------------------------------

        if (
            typeof capabilityModule.canHandle ===
            'function'
        ) {

            return Boolean(

                await capabilityModule
                    .canHandle(
                        message
                    )
            );
        }

        // ----------------------------------------------------
        // LEGACY / SPECIAL HANDLERS
        // ----------------------------------------------------
        //
        // These allow older capabilities to work while
        // keeping the router completely generic.
        //
        // A capability may expose:
        //
        // isMusicRequest()
        // isImageRequest()
        // isRequest()
        //
        // New capabilities should preferably use canHandle().
        //
        // ----------------------------------------------------

        const legacyHandlers = [

            'isRequest',

            'isMusicRequest',

            'isImageRequest',

            'isSearchRequest'
        ];

        for (
            const handler
            of legacyHandlers
        ) {

            if (
                typeof capabilityModule[handler] ===
                'function'
            ) {

                return Boolean(

                    await capabilityModule[
                        handler
                    ](
                        message
                    )
                );
            }
        }

    } catch (error) {

        console.error(
            `⚠️ ${CAPABILITY_NAME} canHandle error:`,
            error
        );
    }

    return false;
}

// ============================================================
// EXECUTE
// ============================================================
//
// This runs the capability.
//
// Preferred implementation:
//
// module.exports = {
//
//     async execute(message) {
//
//         return {
//             response: '...'
//         };
//     }
//
// };
//
// ============================================================

async function execute(
    message
) {

    if (
        !capabilityModule
    ) {

        return {

            success:
                false,

            response:
                null
        };
    }

    // ========================================================
    // UNIVERSAL EXECUTE
    // ========================================================

    if (
        typeof capabilityModule.execute ===
        'function'
    ) {

        return capabilityModule
            .execute(
                message
            );
    }

    // ========================================================
    // LEGACY EXECUTE FUNCTIONS
    // ========================================================
    //
    // Allows older modules to expose specific names.
    //
    // New capabilities should always use execute().
    //
    // ========================================================

    const legacyExecutors = [

        'handle',

        'executeMusic',

        'executeImage',

        'executeSearch'
    ];

    for (
        const executor
        of legacyExecutors
    ) {

        if (
            typeof capabilityModule[executor] ===
            'function'
        ) {

            return capabilityModule[
                executor
            ](
                message
            );
        }
    }

    // ========================================================
    // NO EXECUTOR
    // ========================================================

    throw new Error(

        `Capability "${CAPABILITY_NAME}" does not export execute().`
    );
}

// ============================================================
// EXPORTS
// ============================================================
//
// THIS IS WHAT THE ROUTER SEES.
//
// The router never needs to know:
//
// • what capability this is
// • which functions it uses internally
// • where its logic lives
//
// ============================================================

module.exports = {

    name:
        CAPABILITY_NAME,

    canHandle,

    execute
};