// ============================================================
// DUCKAI — UNIVERSAL PERMANENT ROUTER
// ============================================================
// Router central do DuckAI.
//
// RESPONSIBILITIES
//
// • Automatically discovers capabilities.
// • Does NOT depend on one specific capability.
// • Supports multiple capability structures.
// • Gives capabilities priority over the Brain.
// • Executes ONLY ONE capability per message.
// • If no capability handles the message → conversation.
// • Never generates fake capability errors.
// • New capabilities can be added without modifying index.js.
//
// SUPPORTED STRUCTURES
//
// ./capabilities/name.js
// ./capabilities/name/index.js
// ./name.js
// ./name/index.js
// ./music/music.js
// ./music/index.js
//
// SUPPORTED CAPABILITY APIs
//
// Modern:
//
// module.exports = {
//     name: 'music',
//
//     canHandle(message) {
//         return true;
//     },
//
//     execute(message) {
//         return {
//             response: '...'
//         };
//     }
// };
//
// Legacy:
//
// module.exports = {
//     isMusicRequest(message) {
//         return true;
//     },
//
//     executeMusic(message) {
//         return {
//             response: '...'
//         };
//     }
// };
//
// ============================================================

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================

const ROOT =
    path.resolve(__dirname, '..');

const CAPABILITY_DIRECTORIES = [
    path.join(ROOT, 'capabilities'),
    path.join(ROOT, 'music'),
    path.join(ROOT, 'web'),
    path.join(ROOT, 'image'),
    path.join(ROOT, 'images')
];

const MAX_DISCOVERY_DEPTH = 3;

// ============================================================
// INTERNAL STATE
// ============================================================

let discoveredCapabilities = [];
let discoveryComplete = false;

// ============================================================
// SAFE REQUIRE
// ============================================================

function safeRequire(file) {

    try {

        if (!fs.existsSync(file)) {
            return null;
        }

        delete require.cache[
            require.resolve(file)
        ];

        return require(file);

    } catch (error) {

        console.error(
            `❌ Could not load capability: ${file}`
        );

        console.error(error);

        return null;
    }
}

// ============================================================
// VALID CAPABILITY
// ============================================================

function isCapabilityModule(module) {

    if (!module) {
        return false;
    }

    if (typeof module !== 'object' &&
        typeof module !== 'function') {

        return false;
    }

    return (

        typeof module.canHandle === 'function' ||

        typeof module.execute === 'function' ||

        typeof module.isMusicRequest === 'function' ||

        typeof module.executeMusic === 'function' ||

        typeof module.canHandle === 'function'

    );
}

// ============================================================
// CAPABILITY NAME
// ============================================================

function getCapabilityName(item) {

    if (!item) {
        return 'unknown';
    }

    const module =
        item.module || item;

    if (typeof module.name === 'string' &&
        module.name.trim()) {

        return module.name.trim();
    }

    if (typeof module.capability === 'string' &&
        module.capability.trim()) {

        return module.capability.trim();
    }

    return item.file
        ? path.basename(
            path.dirname(item.file)
        ) === 'music'
            ? 'music'
            : path.basename(
                item.file,
                path.extname(item.file)
            )
        : 'unknown';
}

// ============================================================
// FILE DISCOVERY
// ============================================================

function scanDirectory(
    directory,
    depth = 0
) {

    if (
        depth >
        MAX_DISCOVERY_DEPTH
    ) {
        return [];
    }

    if (
        !fs.existsSync(directory)
    ) {
        return [];
    }

    let entries;

    try {

        entries =
            fs.readdirSync(
                directory,
                {
                    withFileTypes: true
                }
            );

    } catch (error) {

        console.error(
            `⚠️ Could not scan ${directory}:`,
            error
        );

        return [];
    }

    const results = [];

    for (
        const entry
        of entries
    ) {

        // ----------------------------------------------------
        // Ignore hidden files/directories
        // ----------------------------------------------------

        if (
            entry.name.startsWith('.')
        ) {
            continue;
        }

        // ----------------------------------------------------
        // Ignore node_modules
        // ----------------------------------------------------

        if (
            entry.name === 'node_modules'
        ) {
            continue;
        }

        const fullPath =
            path.join(
                directory,
                entry.name
            );

        // ----------------------------------------------------
        // DIRECTORY
        // ----------------------------------------------------

        if (
            entry.isDirectory()
        ) {

            // -----------------------------------------------
            // Conventional index.js
            // -----------------------------------------------

            const indexFile =
                path.join(
                    fullPath,
                    'index.js'
                );

            if (
                fs.existsSync(
                    indexFile
                )
            ) {

                results.push(
                    indexFile
                );
            }

            // -----------------------------------------------
            // Special folder/name.js
            //
            // Example:
            //
            // music/music.js
            // image/image.js
            // web/web.js
            // -----------------------------------------------

            const sameNameFile =
                path.join(
                    fullPath,
                    `${entry.name}.js`
                );

            if (
                fs.existsSync(
                    sameNameFile
                )
            ) {

                results.push(
                    sameNameFile
                );
            }

            // -----------------------------------------------
            // Continue recursively
            // -----------------------------------------------

            results.push(
                ...scanDirectory(
                    fullPath,
                    depth + 1
                )
            );

            continue;
        }

        // ----------------------------------------------------
        // JAVASCRIPT FILE
        // ----------------------------------------------------

        if (
            entry.isFile() &&
            entry.name.endsWith('.js') &&
            entry.name !== 'index.js'
        ) {

            results.push(
                fullPath
            );
        }
    }

    return results;
}

// ============================================================
// DISCOVER CAPABILITIES
// ============================================================

function discoverCapabilities() {

    const files = new Set();

    // --------------------------------------------------------
    // Search configured directories
    // --------------------------------------------------------

    for (
        const directory
        of CAPABILITY_DIRECTORIES
    ) {

        for (
            const file
            of scanDirectory(directory)
        ) {

            files.add(file);
        }
    }

    // --------------------------------------------------------
    // Search root-level modules
    // --------------------------------------------------------

    let rootEntries = [];

    try {

        rootEntries =
            fs.readdirSync(
                ROOT,
                {
                    withFileTypes: true
                }
            );

    } catch (error) {

        console.error(
            '❌ Could not read DuckAI root:',
            error
        );
    }

    for (
        const entry
        of rootEntries
    ) {

        if (
            entry.isFile() &&
            entry.name.endsWith('.js') &&
            entry.name !== 'index.js' &&
            entry.name !== 'server.js'
        ) {

            files.add(
                path.join(
                    ROOT,
                    entry.name
                )
            );
        }
    }

    // --------------------------------------------------------
    // Load modules
    // --------------------------------------------------------

    const capabilities = [];

    for (
        const file
        of files
    ) {

        const module =
            safeRequire(file);

        if (
            !isCapabilityModule(
                module
            )
        ) {

            continue;
        }

        // ----------------------------------------------------
        // Avoid duplicate modules
        // ----------------------------------------------------

        const alreadyLoaded =
            capabilities.some(
                item =>
                    item.file === file
            );

        if (
            alreadyLoaded
        ) {
            continue;
        }

        capabilities.push({

            file,

            module,

            name:
                getCapabilityName({
                    file,
                    module
                })
        });
    }

    discoveredCapabilities =
        capabilities;

    discoveryComplete = true;

    console.log(
        `⚡ Router discovered ${capabilities.length} capability(s).`
    );

    for (
        const capability
        of capabilities
    ) {

        console.log(
            `   • ${capability.name} → ${path.relative(ROOT, capability.file)}`
        );
    }

    return capabilities;
}

// ============================================================
// ENSURE DISCOVERY
// ============================================================

function ensureDiscovery() {

    if (
        !discoveryComplete
    ) {

        discoverCapabilities();
    }

    return discoveredCapabilities;
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
// CAPABILITY MATCHING
// ============================================================

async function capabilityCanHandle(
    item,
    message
) {

    const module =
        item.module;

    // --------------------------------------------------------
    // Modern API
    // --------------------------------------------------------

    if (
        typeof module.canHandle ===
        'function'
    ) {

        try {

            const result =
                await module.canHandle(
                    message
                );

            if (
                result === true
            ) {

                return true;
            }

        } catch (error) {

            console.error(
                `⚠️ Capability "${item.name}" canHandle error:`,
                error
            );
        }
    }

    // --------------------------------------------------------
    // Legacy music API
    //
    // Kept generic so the router remains backwards compatible.
    // --------------------------------------------------------

    if (
        typeof module.isMusicRequest ===
        'function'
    ) {

        try {

            const result =
                await module.isMusicRequest(
                    message
                );

            if (
                result === true
            ) {

                return true;
            }

        } catch (error) {

            console.error(
                `⚠️ Capability "${item.name}" isMusicRequest error:`,
                error
            );
        }
    }

    return false;
}

// ============================================================
// EXECUTE CAPABILITY
// ============================================================

async function executeCapability(
    item,
    message
) {

    const module =
        item.module;

    // --------------------------------------------------------
    // Modern API
    // --------------------------------------------------------

    if (
        typeof module.execute ===
        'function'
    ) {

        return await module.execute(
            message
        );
    }

    // --------------------------------------------------------
    // Legacy music API
    // --------------------------------------------------------

    if (
        typeof module.executeMusic ===
        'function'
    ) {

        return await module.executeMusic(
            message
        );
    }

    return null;
}

// ============================================================
// NORMALIZE RESULT
// ============================================================

function normalizeCapabilityResult(
    item,
    result
) {

    if (
        result === null ||
        result === undefined ||
        result === false
    ) {

        return null;
    }

    // --------------------------------------------------------
    // Capability already returned a router result
    // --------------------------------------------------------

    if (
        typeof result === 'object'
    ) {

        return {

            ...result,

            type:
                result.type ||
                'capability',

            capability:
                result.capability ||
                item.name
        };
    }

    // --------------------------------------------------------
    // Capability returned plain text
    // --------------------------------------------------------

    if (
        typeof result === 'string'
    ) {

        return {

            type:
                'capability',

            capability:
                item.name,

            response:
                result
        };
    }

    return {

        type:
            'capability',

        capability:
            item.name
    };
}

// ============================================================
// ROUTE
// ============================================================
//
// IMPORTANT:
//
// The first capability that matches owns the message.
//
// Once executed:
//
// capability → STOP
//
// The Brain is NEVER called here.
// The index decides what happens after "conversation".
//
// ============================================================

async function route(
    message
) {

    if (
        !message
    ) {

        return {
            type: 'conversation'
        };
    }

    const capabilities =
        ensureDiscovery();

    // --------------------------------------------------------
    // Test capabilities in discovery order
    // --------------------------------------------------------

    for (
        const capability
        of capabilities
    ) {

        const matches =
            await capabilityCanHandle(
                capability,
                message
            );

        if (
            !matches
        ) {

            continue;
        }

        console.log(
            `⚡ Router → ${capability.name}`
        );

        try {

            const result =
                await executeCapability(
                    capability,
                    message
                );

            const normalized =
                normalizeCapabilityResult(
                    capability,
                    result
                );

            // ------------------------------------------------
            // Capability handled the request.
            // ------------------------------------------------

            if (
                normalized
            ) {

                return normalized;
            }

            // ------------------------------------------------
            // Even if the capability returns nothing after
            // matching, it owns the message.
            //
            // Do NOT fall through to Brain.
            // ------------------------------------------------

            return {

                type:
                    'capability',

                capability:
                    capability.name
            };

        } catch (error) {

            // ------------------------------------------------
            // IMPORTANT:
            //
            // A capability failure must NOT become:
            //
            // "I could not execute that capability."
            //
            // And it must NOT cause Brain + capability
            // duplicate responses.
            // ------------------------------------------------

            console.error(
                `❌ Capability "${capability.name}" execution error:`,
                error
            );

            return {

                type:
                    'capability',

                capability:
                    capability.name,

                error: true
            };
        }
    }

    // --------------------------------------------------------
    // Nothing handled the message.
    //
    // Index → Brain
    // --------------------------------------------------------

    return {
        type:
            'conversation'
    };
}

// ============================================================
// REFRESH
// ============================================================
//
// Useful during development.
//
// It allows new capabilities to be detected without
// modifying this router.
//
// ============================================================

function refreshCapabilities() {

    discoveryComplete = false;

    discoveredCapabilities = [];

    return discoverCapabilities();
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    route,

    getCapabilities,

    discoverCapabilities,

    refreshCapabilities,

    getCapabilityName
};