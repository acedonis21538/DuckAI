// ============================================================
// DUCKAI — UNIVERSAL CAPABILITY ROUTER
// ============================================================
//
// This router is capability-agnostic.
//
// It does NOT know about:
// • music
// • images
// • web
// • panels
// • Discord commands
//
// CAPABILITY STRUCTURE:
//
// capabilities/
// ├── music/
// │   ├── capability.js
// │   └── ...
// ├── images/
// │   ├── capability.js
// │   └── ...
// └── anything/
//     └── capability.js
//
// UNIVERSAL CAPABILITY INTERFACE:
//
// module.exports = {
//
//     name: 'example',
//
//     async canHandle(message) {
//         return true;
//     },
//
//     async execute(message) {
//         return {
//             response: '...'
//         };
//     }
// };
//
// FLOW:
//
// MESSAGE
//    ↓
// ROUTER
//    ↓
// DISCOVERED CAPABILITIES
//    ↓
// canHandle()
//    │
//    ├── false → next capability
//    │
//    └── true
//          ↓
//       execute()
//          ↓
//       capability result
//
// NO CAPABILITY
//    ↓
// conversation
//    ↓
// BRAIN
//
// ============================================================

const fs = require('fs');
const path = require('path');

// ============================================================
// PATHS
// ============================================================

const ROOT_DIRECTORY =
    path.resolve(
        __dirname,
        '..'
    );

const CAPABILITIES_DIRECTORY =
    path.join(
        ROOT_DIRECTORY,
        'capabilities'
    );

// ============================================================
// INTERNAL STATE
// ============================================================

let capabilities = [];

let discovered = false;

// ============================================================
// IS VALID CAPABILITY
// ============================================================

function isValidCapability(
    capability
) {

    if (
        !capability
    ) {

        return false;
    }

    return (

        typeof capability.canHandle ===
        'function'

        &&

        typeof capability.execute ===
        'function'
    );
}

// ============================================================
// GET CAPABILITY NAME
// ============================================================

function getCapabilityName(
    capability,
    folderName
) {

    if (
        typeof capability?.name ===
        'string'

        &&

        capability.name.trim()
    ) {

        return capability.name
            .trim();
    }

    return folderName;
}

// ============================================================
// LOAD CAPABILITY
// ============================================================

function loadCapability(
    filePath,
    folderName
) {

    try {

        // ----------------------------------------------------
        // Require capability
        // ----------------------------------------------------

        const capability =
            require(
                filePath
            );

        // ----------------------------------------------------
        // Validate interface
        // ----------------------------------------------------

        if (
            !isValidCapability(
                capability
            )
        ) {

            console.warn(
                `⚠️ Ignoring invalid capability: ${folderName}`
            );

            console.warn(
                '   A capability must export canHandle() and execute().'
            );

            return null;
        }

        return {

            name:
                getCapabilityName(
                    capability,
                    folderName
                ),

            folder:
                folderName,

            file:
                filePath,

            module:
                capability
        };

    } catch (error) {

        console.error(
            `❌ Failed to load capability "${folderName}":`
        );

        console.error(
            error
        );

        return null;
    }
}

// ============================================================
// DISCOVER CAPABILITIES
// ============================================================
//
// Searches:
//
// capabilities/<name>/capability.js
//
// ============================================================

function discoverCapabilities() {

    capabilities = [];

    discovered = true;

    // --------------------------------------------------------
    // Capabilities folder does not exist
    // --------------------------------------------------------

    if (
        !fs.existsSync(
            CAPABILITIES_DIRECTORY
        )
    ) {

        console.warn(
            '⚠️ No capabilities directory found.'
        );

        return capabilities;
    }

    let entries;

    try {

        entries =
            fs.readdirSync(
                CAPABILITIES_DIRECTORY,
                {
                    withFileTypes:
                        true
                }
            );

    } catch (error) {

        console.error(
            '❌ Could not read capabilities directory:'
        );

        console.error(
            error
        );

        return capabilities;
    }

    // --------------------------------------------------------
    // Read every capability folder
    // --------------------------------------------------------

    for (
        const entry
        of entries
    ) {

        // Only directories are capabilities

        if (
            !entry.isDirectory()
        ) {

            continue;
        }

        // Ignore hidden folders

        if (
            entry.name.startsWith(
                '.'
            )
        ) {

            continue;
        }

        const capabilityFile =
            path.join(

                CAPABILITIES_DIRECTORY,

                entry.name,

                'capability.js'
            );

        // ----------------------------------------------------
        // capability.js does not exist
        // ----------------------------------------------------

        if (
            !fs.existsSync(
                capabilityFile
            )
        ) {

            continue;
        }

        // ----------------------------------------------------
        // Load capability
        // ----------------------------------------------------

        const loaded =
            loadCapability(

                capabilityFile,

                entry.name
            );

        if (
            !loaded
        ) {

            continue;
        }

        capabilities.push(
            loaded
        );
    }

    // --------------------------------------------------------
    // Sort for deterministic order
    // --------------------------------------------------------

    capabilities.sort(
        (a, b) =>

            a.name.localeCompare(
                b.name
            )
    );

    // --------------------------------------------------------
    // Log
    // --------------------------------------------------------

    console.log(
        `⚡ Router discovered ${capabilities.length} capability(s).`
    );

    for (
        const capability
        of capabilities
    ) {

        console.log(
            `   • ${capability.name}`
        );
    }

    return capabilities;
}

// ============================================================
// ENSURE DISCOVERY
// ============================================================

function ensureDiscovery() {

    if (
        !discovered
    ) {

        discoverCapabilities();
    }

    return capabilities;
}

// ============================================================
// GET CAPABILITIES
// ============================================================
//
// Used by the Brain.
//
// ============================================================

function getCapabilities() {

    return ensureDiscovery()
        .map(

            capability =>
                capability.name
        );
}

// ============================================================
// ROUTE
// ============================================================
//
// The router does not respond to Discord.
//
// It only decides:
//
// • capability
// • conversation
//
// ============================================================

async function route(
    message
) {

    // --------------------------------------------------------
    // Invalid message
    // --------------------------------------------------------

    if (
        !message
    ) {

        return {

            type:
                'conversation'
        };
    }

    const loadedCapabilities =
        ensureDiscovery();

    // --------------------------------------------------------
    // Test capabilities
    // --------------------------------------------------------

    for (
        const capability
        of loadedCapabilities
    ) {

        let canHandle =
            false;

        // ----------------------------------------------------
        // CAN HANDLE
        // ----------------------------------------------------

        try {

            canHandle =
                await capability.module
                    .canHandle(
                        message
                    );

        } catch (error) {

            console.error(
                `⚠️ Capability "${capability.name}" failed during canHandle():`
            );

            console.error(
                error
            );

            // This capability failed to analyse the message.
            // Continue to the next capability.

            continue;
        }

        // ----------------------------------------------------
        // NOT HANDLED
        // ----------------------------------------------------

        if (
            canHandle !== true
        ) {

            continue;
        }

        // ----------------------------------------------------
        // CAPABILITY MATCHED
        // ----------------------------------------------------

        console.log(
            `⚡ Router → ${capability.name}`
        );

        // ----------------------------------------------------
        // EXECUTE
        // ----------------------------------------------------

        try {

            const result =
                await capability.module
                    .execute(
                        message
                    );

            // ------------------------------------------------
            // NORMALIZE RESULT
            // ------------------------------------------------

            // Empty result
            //
            // The capability matched the message, therefore
            // the Brain must NOT receive it.

            if (
                result ===
                undefined

                ||

                result ===
                null
            ) {

                return {

                    type:
                        'capability',

                    capability:
                        capability.name
                };
            }

            // Plain text response

            if (
                typeof result ===
                'string'
            ) {

                return {

                    type:
                        'capability',

                    capability:
                        capability.name,

                    response:
                        result
                };
            }

            // Object response

            if (
                typeof result ===
                'object'
            ) {

                return {

                    ...result,

                    type:
                        'capability',

                    capability:

                        result.capability ||

                        capability.name
                };
            }

            // Unknown result

            return {

                type:
                    'capability',

                capability:
                    capability.name
            };

        } catch (error) {

            console.error(
                `❌ Capability "${capability.name}" failed during execute():`
            );

            console.error(
                error
            );

            // ------------------------------------------------
            // IMPORTANT
            //
            // The capability already claimed this message.
            //
            // Never pass it to the Brain afterwards.
            //
            // ------------------------------------------------

            return {

                type:
                    'capability',

                capability:
                    capability.name,

                error:
                    true
            };
        }
    }

    // ========================================================
    // NO CAPABILITY
    // ========================================================

    return {

        type:
            'conversation'
    };
}

// ============================================================
// REFRESH CAPABILITIES
// ============================================================
//
// Optional development function.
//
// Example:
//
// router.refreshCapabilities();
//
// ============================================================

function refreshCapabilities() {

    discovered =
        false;

    capabilities =
        [];

    return discoverCapabilities();
}

// ============================================================
// GET CAPABILITY DETAILS
// ============================================================
//
// Useful for debugging.
//
// ============================================================

function getCapabilityDetails() {

    return ensureDiscovery()
        .map(

            capability => ({

                name:
                    capability.name,

                folder:
                    capability.folder,

                file:
                    capability.file
            })
        );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    route,

    getCapabilities,

    getCapabilityDetails,

    discoverCapabilities,

    refreshCapabilities
};