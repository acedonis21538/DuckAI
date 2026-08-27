'use strict';

// ============================================================
// DUCKAI — UNIVERSAL CAPABILITY ROUTER
// ============================================================
//
// O router NÃO conhece capabilities específicas.
//
// Não conhece:
// • music
// • images
// • web
// • panels
// • comandos
// • Discord interactions
//
// Apenas conhece o contrato universal:
//
// capabilities/<name>/capability.js
//
// {
//     name: 'example',
//
//     canHandle(message) {
//         return true / false;
//     },
//
//     execute(message) {
//         return {
//             response: '...'
//         };
//     }
// }
//
// FLUXO:
//
// MESSAGE
//    ↓
// ROUTER
//    ↓
// DISCOVER CAPABILITIES
//    ↓
// canHandle()
//    ↓
// execute()
//    ↓
// capability result
//
// Se nenhuma capability tratar:
//
// ROUTER → conversation
//
// ============================================================

const fs = require('fs');
const path = require('path');

// ============================================================
// PATHS
// ============================================================

const ROOT_DIRECTORY = path.resolve(
    __dirname,
    '..'
);

const CAPABILITIES_DIRECTORY = path.join(
    ROOT_DIRECTORY,
    'capabilities'
);

// ============================================================
// STATE
// ============================================================

let capabilities = [];
let discovered = false;

// ============================================================
// VALIDATION
// ============================================================

function isValidCapability(module) {

    return !!module &&
        typeof module.canHandle === 'function' &&
        typeof module.execute === 'function';
}

// ============================================================
// NAME
// ============================================================

function getCapabilityName(module, fallback) {

    if (
        typeof module?.name === 'string' &&
        module.name.trim()
    ) {
        return module.name.trim();
    }

    return fallback;
}

// ============================================================
// LOAD ONE CAPABILITY
// ============================================================

function loadCapability(filePath, folderName) {

    try {

        delete require.cache[
            require.resolve(filePath)
        ];

        const module = require(filePath);

        if (!isValidCapability(module)) {

            console.warn(
                `⚠️ Ignoring invalid capability: ${folderName}`
            );

            console.warn(
                '   Required: canHandle() and execute()'
            );

            return null;
        }

        return {

            name:
                getCapabilityName(
                    module,
                    folderName
                ),

            folder:
                folderName,

            file:
                filePath,

            module
        };

    } catch (error) {

        console.error(
            `❌ Failed to load capability "${folderName}":`
        );

        console.error(error);

        return null;
    }
}

// ============================================================
// DISCOVER
// ============================================================

function discoverCapabilities() {

    capabilities = [];
    discovered = true;

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

        entries = fs.readdirSync(
            CAPABILITIES_DIRECTORY,
            {
                withFileTypes: true
            }
        );

    } catch (error) {

        console.error(
            '❌ Could not read capabilities directory:'
        );

        console.error(error);

        return capabilities;
    }

    for (
        const entry of entries
    ) {

        if (
            !entry.isDirectory()
        ) {
            continue;
        }

        if (
            entry.name.startsWith('.')
        ) {
            continue;
        }

        const capabilityFile =
            path.join(
                CAPABILITIES_DIRECTORY,
                entry.name,
                'capability.js'
            );

        if (
            !fs.existsSync(
                capabilityFile
            )
        ) {
            continue;
        }

        const capability =
            loadCapability(
                capabilityFile,
                entry.name
            );

        if (
            capability
        ) {

            capabilities.push(
                capability
            );
        }
    }

    capabilities.sort(
        (a, b) =>
            a.name.localeCompare(
                b.name
            )
    );

    console.log(
        `⚡ Router discovered ${capabilities.length} capability(s).`
    );

    for (
        const capability of capabilities
    ) {

        console.log(
            `   • ${capability.name}`
        );
    }

    return capabilities;
}

// ============================================================
// ENSURE
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

async function route(message) {

    if (
        !message
    ) {

        return {
            type: 'conversation'
        };
    }

    const loaded =
        ensureDiscovery();

    // --------------------------------------------------------
    // Test every capability
    // --------------------------------------------------------

    for (
        const capability of loaded
    ) {

        let handled = false;

        // ====================================================
        // CAN HANDLE
        // ====================================================

        try {

            const result =
                await capability.module.canHandle(
                    message
                );

            // --------------------------------------------
            // Normal contract:
            //
            // true  → handled
            // false → next capability
            // --------------------------------------------

            if (
                result === true
            ) {

                handled = true;
            }

            // --------------------------------------------
            // Also accept:
            //
            // { handled: true }
            //
            // This makes the interface more extensible
            // without making the router capability-specific.
            // --------------------------------------------

            else if (
                result &&
                typeof result === 'object' &&
                result.handled === true
            ) {

                handled = true;
            }

        } catch (error) {

            console.error(
                `⚠️ Capability "${capability.name}" failed during canHandle():`
            );

            console.error(error);

            continue;
        }

        // ====================================================
        // NOT THIS CAPABILITY
        // ====================================================

        if (
            !handled
        ) {

            continue;
        }

        console.log(
            `⚡ Router → ${capability.name}`
        );

        // ====================================================
        // EXECUTE
        // ====================================================

        try {

            const result =
                await capability.module.execute(
                    message
                );

            // --------------------------------------------
            // Capability consumed the message.
            //
            // Even if it returns nothing, DO NOT send
            // the message to the Brain.
            // --------------------------------------------

            if (
                result === undefined ||
                result === null
            ) {

                return {

                    type:
                        'capability',

                    capability:
                        capability.name
                };
            }

            // --------------------------------------------
            // String
            // --------------------------------------------

            if (
                typeof result === 'string'
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

            // --------------------------------------------
            // Object
            // --------------------------------------------

            if (
                typeof result === 'object'
            ) {

                return {

                    ...result,

                    type:
                        'capability',

                    capability:
                        capability.name
                };
            }

            // --------------------------------------------
            // Unknown return type
            // --------------------------------------------

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

            console.error(error);

            // --------------------------------------------
            // IMPORTANT:
            //
            // Capability already claimed the message.
            // NEVER send it to the Brain.
            // --------------------------------------------

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
// REFRESH
// ============================================================

function refreshCapabilities() {

    discovered = false;

    capabilities = [];

    return discoverCapabilities();
}

// ============================================================
// DETAILS
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