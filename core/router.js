// ============================================================
// DUCKAI — UNIVERSAL ROUTER
// ============================================================
//
// Permanent capability dispatcher.
//
// The index does NOT know individual capabilities.
// The router discovers them.
//
// Supported capability locations:
//
//   ./capabilities/<name>/index.js
//   ./capabilities/<name>.js
//   ./<name>/<name>.js
//   ./<name>/index.js
//   ./<name>.js
//
// Current example:
//
//   ./music/music.js
//
// A capability may expose:
//
//   name
//   canHandle(message)
//   execute(message)
//
// OR legacy music-style exports:
//
//   isMusicRequest(message)
//   executeMusic(message)
//
// The router never generates fake capability errors.
//
// If nothing handles the message:
//
//   { type: 'conversation' }
//
// ============================================================

const fs =
    require('fs');

const path =
    require('path');

// ============================================================
// DIRECTORIES
// ============================================================

const ROOT =
    path.resolve(
        __dirname,
        '..'
    );

// ============================================================
// CACHE
// ============================================================

let capabilityCache =
    null;

// ============================================================
// SAFE REQUIRE
// ============================================================

function safeRequire(
    filePath
) {

    try {

        if (
            !fs.existsSync(
                filePath
            )
        ) {

            return null;
        }

        delete require.cache[
            require.resolve(
                filePath
            )
        ];

        const loaded =
            require(
                filePath
            );

        if (
            !loaded
        ) {

            return null;
        }

        return loaded;

    } catch (error) {

        console.error(
            `⚠️ Could not load capability "${filePath}":`,
            error
        );

        return null;
    }
}

// ============================================================
// CAPABILITY NAME
// ============================================================

function getCapabilityName(
    item
) {

    if (
        item?.name &&
        typeof item.name ===
            'string'
    ) {

        return item.name;
    }

    if (
        item?.capability &&
        typeof item.capability ===
            'string'
    ) {

        return item.capability;
    }

    if (
        item?.module?.name
    ) {

        return item.module.name;
    }

    if (
        item?.module?.capability
    ) {

        return item.module.capability;
    }

    if (
        item?.filePath
    ) {

        return path.basename(
            path.dirname(
                item.filePath
            )
        );
    }

    return 'unknown';
}

// ============================================================
// NORMALIZE MODULE
// ============================================================

function normalizeCapability(
    module,
    filePath
) {

    if (
        !module
    ) {

        return null;
    }

    // --------------------------------------------------------
    // ES module compatibility
    // --------------------------------------------------------

    if (
        module.default &&
        typeof module.default ===
            'object'
    ) {

        module =
            module.default;
    }

    // --------------------------------------------------------
    // Ignore random modules
    // --------------------------------------------------------

    const hasHandler =
        typeof module.canHandle ===
            'function' ||

        typeof module.execute ===
            'function' ||

        typeof module.isMusicRequest ===
            'function' ||

        typeof module.executeMusic ===
            'function';

    if (
        !hasHandler
    ) {

        return null;
    }

    return {

        module,

        filePath,

        name:
            module.name ||
            module.capability ||
            path.basename(
                path.dirname(
                    filePath
                )
            )
    };
}

// ============================================================
// CANDIDATE PATHS
// ============================================================
//
// We deliberately support several layouts.
//
// This keeps the index independent from project structure.
//
// ============================================================

function getCandidatePaths() {

    const candidates =
        [];

    // --------------------------------------------------------
    // ./capabilities/*
    // --------------------------------------------------------

    const capabilitiesDir =
        path.join(
            ROOT,
            'capabilities'
        );

    if (
        fs.existsSync(
            capabilitiesDir
        )
    ) {

        let entries = [];

        try {

            entries =
                fs.readdirSync(
                    capabilitiesDir,
                    {
                        withFileTypes:
                            true
                    }
                );

        } catch (error) {

            console.error(
                '⚠️ Could not read capabilities directory:',
                error
            );
        }

        for (
            const entry
            of entries
        ) {

            const fullPath =
                path.join(
                    capabilitiesDir,
                    entry.name
                );

            if (
                entry.isDirectory()
            ) {

                candidates.push(

                    path.join(
                        fullPath,
                        'index.js'
                    )
                );

                candidates.push(

                    path.join(
                        fullPath,
                        `${entry.name}.js`
                    )
                );

            } else if (
                entry.isFile() &&
                entry.name.endsWith(
                    '.js'
                )
            ) {

                candidates.push(
                    fullPath
                );
            }
        }
    }

    // --------------------------------------------------------
    // ROOT MODULE DIRECTORIES
    // --------------------------------------------------------
    //
    // Example:
    //
    // ./music/music.js
    // ./images/images.js
    // ./weather/weather.js
    //
    // --------------------------------------------------------

    let rootEntries = [];

    try {

        rootEntries =
            fs.readdirSync(
                ROOT,
                {
                    withFileTypes:
                        true
                }
            );

    } catch (error) {

        console.error(
            '⚠️ Could not read DuckAI root:',
            error
        );
    }

    for (
        const entry
        of rootEntries
    ) {

        if (
            !entry.isDirectory()
        ) {

            continue;
        }

        const name =
            entry.name;

        // ----------------------------------------------------
        // Ignore project/system directories
        // ----------------------------------------------------

        if (
            name ===
                'node_modules' ||
            name ===
                '.git' ||
            name ===
                '.github' ||
            name ===
                '.devcontainer' ||
            name ===
                'core'
        ) {

            continue;
        }

        const directory =
            path.join(
                ROOT,
                name
            );

        // ./name/index.js

        candidates.push(

            path.join(
                directory,
                'index.js'
            )
        );

        // ./name/name.js

        candidates.push(

            path.join(
                directory,
                `${name}.js`
            )
        );
    }

    // --------------------------------------------------------
    // ROOT .js FILES
    // --------------------------------------------------------

    for (
        const entry
        of rootEntries
    ) {

        if (
            entry.isFile() &&
            entry.name.endsWith(
                '.js'
            )
        ) {

            const ignored = [

                'index.js',
                'server.js'
            ];

            if (
                !ignored.includes(
                    entry.name
                )
            ) {

                candidates.push(

                    path.join(
                        ROOT,
                        entry.name
                    )
                );
            }
        }
    }

    return [
        ...new Set(
            candidates
        )
    ];
}

// ============================================================
// DISCOVER CAPABILITIES
// ============================================================

function discoverCapabilities() {

    if (
        capabilityCache
    ) {

        return capabilityCache;
    }

    const discovered =
        [];

    const candidates =
        getCandidatePaths();

    for (
        const filePath
        of candidates
    ) {

        if (
            !fs.existsSync(
                filePath
            )
        ) {

            continue;
        }

        const module =
            safeRequire(
                filePath
            );

        const capability =
            normalizeCapability(
                module,
                filePath
            );

        if (
            !capability
        ) {

            continue;
        }

        // ----------------------------------------------------
        // Prevent duplicates
        // ----------------------------------------------------

        const alreadyLoaded =
            discovered.some(
                item =>
                    item.filePath ===
                    filePath
            );

        if (
            alreadyLoaded
        ) {

            continue;
        }

        discovered.push(
            capability
        );
    }

    capabilityCache =
        discovered;

    console.log(
        `⚡ Router discovered ${discovered.length} capability(s).`
    );

    for (
        const capability
        of discovered
    ) {

        console.log(

            `   • ${getCapabilityName(
                capability
            )} → ${capability.filePath}`
        );
    }

    return capabilityCache;
}

// ============================================================
// REFRESH
// ============================================================
//
// Useful if capabilities are added while the process is
// running.
//

function refreshCapabilities() {

    capabilityCache =
        null;

    return discoverCapabilities();
}

// ============================================================
// PUBLIC CAPABILITY LIST
// ============================================================

function getCapabilities() {

    return discoverCapabilities()
        .map(
            capability =>
                getCapabilityName(
                    capability
                )
        );
}

// ============================================================
// CAPABILITY MATCH
// ============================================================

async function capabilityCanHandle(
    item,
    message
) {

    const module =
        item.module;

    // --------------------------------------------------------
    // Modern interface
    // --------------------------------------------------------

    if (
        typeof module.canHandle ===
        'function'
    ) {

        try {

            return Boolean(
                await module.canHandle(
                    message
                )
            );

        } catch (error) {

            console.error(

                `❌ Capability "${getCapabilityName(
                    item
                )}" canHandle error:`,

                error
            );

            return false;
        }
    }

    // --------------------------------------------------------
    // Legacy music interface
    // --------------------------------------------------------

    if (
        typeof module.isMusicRequest ===
        'function'
    ) {

        try {

            return Boolean(
                await module.isMusicRequest(
                    message
                )
            );

        } catch (error) {

            console.error(

                `❌ Capability "${getCapabilityName(
                    item
                )}" isMusicRequest error:`,

                error
            );

            return false;
        }
    }

    // --------------------------------------------------------
    // If it only has execute(), it is still a capability.
    //
    // However, execute-only modules are NOT automatically
    // executed for every message.
    //
    // This prevents a random capability from hijacking chat.
    // --------------------------------------------------------

    return false;
}

// ============================================================
// CAPABILITY EXECUTION
// ============================================================

async function executeCapability(
    item,
    message
) {

    const module =
        item.module;

    // --------------------------------------------------------
    // Modern interface
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
    // Legacy music interface
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

function normalizeResult(
    result,
    item
) {

    if (
        !result
    ) {

        return null;
    }

    // --------------------------------------------------------
    // Capability explicitly handled it.
    // --------------------------------------------------------

    if (
        result.type ===
            'capability'
    ) {

        return {

            ...result,

            capability:
                result.capability ||
                getCapabilityName(
                    item
                )
        };
    }

    // --------------------------------------------------------
    // A capability can simply return:
    //
    // { response: 'hello' }
    //
    // --------------------------------------------------------

    if (
        typeof result.response ===
        'string'
    ) {

        return {

            type:
                'capability',

            capability:
                result.capability ||
                getCapabilityName(
                    item
                ),

            ...result
        };
    }

    // --------------------------------------------------------
    // String response
    // --------------------------------------------------------

    if (
        typeof result ===
        'string'
    ) {

        return {

            type:
                'capability',

            capability:
                getCapabilityName(
                    item
                ),

            response:
                result
        };
    }

    // --------------------------------------------------------
    // Explicit non-capability result
    // --------------------------------------------------------

    if (
        result.type ===
        'conversation'
    ) {

        return {
            type:
                'conversation'
        };
    }

    return null;
}

// ============================================================
// ROUTE
// ============================================================

async function route(
    message
) {

    if (
        !message
    ) {

        return {
            type:
                'conversation'
        };
    }

    const capabilities =
        discoverCapabilities();

    // ========================================================
    // CAPABILITIES
    // ========================================================

    for (
        const capability
        of capabilities
    ) {

        const canHandle =
            await capabilityCanHandle(
                capability,
                message
            );

        if (
            !canHandle
        ) {

            continue;
        }

        // ----------------------------------------------------
        // IMPORTANT:
        //
        // Once a capability claims the message, it gets the
        // message exclusively.
        // ----------------------------------------------------

        try {

            const result =
                await executeCapability(
                    capability,
                    message
                );

            const normalized =
                normalizeResult(
                    result,
                    capability
                );

            // ------------------------------------------------
            // Capability successfully handled it.
            // ------------------------------------------------

            if (
                normalized
            ) {

                return normalized;
            }

            // ------------------------------------------------
            // Capability claimed it but returned nothing.
            //
            // Still consume the message.
            // This prevents the Brain from responding to a
            // capability request.
            // ------------------------------------------------

            return {

                type:
                    'capability',

                capability:
                    getCapabilityName(
                        capability
                    )
            };

        } catch (error) {

            console.error(

                `❌ Capability "${getCapabilityName(
                    capability
                )}" execution error:`,

                error
            );

            // ------------------------------------------------
            // IMPORTANT:
            //
            // Do NOT generate a fake response.
            //
            // Do NOT say:
            //
            // "I could not execute that capability."
            //
            // The Brain may handle the message naturally.
            // ------------------------------------------------

            return {

                type:
                    'conversation'
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
// EXPORTS
// ============================================================

module.exports = {

    route,

    getCapabilities,

    discoverCapabilities,

    refreshCapabilities,

    getCapabilityName
};