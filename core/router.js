// ============================================================
// DUCKAI ROUTER
// ============================================================
// Router permanente.
//
// Responsabilidades:
// 1. Descobrir capabilities disponíveis.
// 2. Não depender de uma capability específica.
// 3. Tentar encaminhar a mensagem para a capability correta.
// 4. Se nenhuma capability tratar da mensagem -> conversation.
// 5. Nunca gerar respostas de erro artificiais.
//
// Uma capability pode existir como:
//   ./capabilities/nome/index.js
//   ./capabilities/nome.js
//   ./nome.js
//
// Formato recomendado de uma capability:
//
// module.exports = {
//     name: 'music',
//
//     canHandle(message) {
//         return true/false;
//     },
//
//     execute(message) {
//         return {
//             response: '...'
//         };
//     }
// };
//
// Também existe compatibilidade com:
//
// module.exports = {
//     isMusicRequest,
//     executeMusic
// };
//
// ============================================================

const fs = require('fs');
const path = require('path');

// ============================================================
// PATHS
// ============================================================

const ROOT =
    path.resolve(__dirname, '..');

const CAPABILITIES_DIR =
    path.join(
        ROOT,
        'capabilities'
    );

// ============================================================
// CAPABILITY CACHE
// ============================================================

let capabilityCache = null;

// ============================================================
// SAFE REQUIRE
// ============================================================

function safeRequire(file) {

    try {

        delete require.cache[
            require.resolve(file)
        ];

        return require(file);

    } catch (error) {

        console.error(
            `❌ Could not load capability: ${file}`
        );

        console.error(
            error.message
        );

        return null;
    }
}

// ============================================================
// CHECK JS FILE
// ============================================================

function isJS(file) {

    return (
        file.endsWith('.js') &&
        !file.startsWith('.')
    );
}

// ============================================================
// DISCOVER CAPABILITIES
// ============================================================

function discoverCapabilities() {

    const found = [];

    // ========================================================
    // ROOT CAPABILITIES
    // ========================================================

    let rootFiles = [];

    try {

        rootFiles =
            fs.readdirSync(
                ROOT,
                {
                    withFileTypes: true
                }
            );

    } catch (error) {

        console.error(
            '❌ Could not read project root:',
            error.message
        );
    }

    for (
        const entry of rootFiles
    ) {

        if (
            !entry.isFile() ||
            !isJS(entry.name)
        ) {
            continue;
        }

        // Never treat the application core as a capability.
        if (
            [
                'index.js'
            ].includes(entry.name)
        ) {
            continue;
        }

        const file =
            path.join(
                ROOT,
                entry.name
            );

        const module =
            safeRequire(
                file
            );

        if (
            module
        ) {

            found.push({
                source: file,
                module
            });
        }
    }

    // ========================================================
    // CAPABILITIES DIRECTORY
    // ========================================================

    if (
        fs.existsSync(
            CAPABILITIES_DIR
        )
    ) {

        let entries = [];

        try {

            entries =
                fs.readdirSync(
                    CAPABILITIES_DIR,
                    {
                        withFileTypes: true
                    }
                );

        } catch (error) {

            console.error(
                '❌ Could not read capabilities:',
                error.message
            );

            return found;
        }

        for (
            const entry of entries
        ) {

            const fullPath =
                path.join(
                    CAPABILITIES_DIR,
                    entry.name
                );

            // ------------------------------------------------
            // capabilities/example.js
            // ------------------------------------------------

            if (
                entry.isFile() &&
                isJS(entry.name)
            ) {

                const module =
                    safeRequire(
                        fullPath
                    );

                if (
                    module
                ) {

                    found.push({
                        source: fullPath,
                        module
                    });
                }

                continue;
            }

            // ------------------------------------------------
            // capabilities/example/index.js
            // ------------------------------------------------

            if (
                entry.isDirectory()
            ) {

                const indexFile =
                    path.join(
                        fullPath,
                        'index.js'
                    );

                if (
                    !fs.existsSync(
                        indexFile
                    )
                ) {
                    continue;
                }

                const module =
                    safeRequire(
                        indexFile
                    );

                if (
                    module
                ) {

                    found.push({
                        source: indexFile,
                        module
                    });
                }
            }
        }
    }

    return found;
}

// ============================================================
// GET CAPABILITIES
// ============================================================

function getCapabilities() {

    // Rediscover every route call.
    //
    // This means a new capability can be added while
    // developing without changing the router itself.

    capabilityCache =
        discoverCapabilities();

    return capabilityCache;
}

// ============================================================
// CAPABILITY NAME
// ============================================================

function getCapabilityName(
    item
) {

    const module =
        item.module;

    if (
        typeof module.name === 'string'
    ) {

        return module.name;
    }

    if (
        typeof module.capability === 'string'
    ) {

        return module.capability;
    }

    if (
        typeof module.default?.name === 'string'
    ) {

        return module.default.name;
    }

    return path.basename(
        path.dirname(
            item.source
        )
    );
}

// ============================================================
// CAN HANDLE
// ============================================================

async function canHandle(
    item,
    message
) {

    const module =
        item.module;

    // --------------------------------------------------------
    // Modern API
    // --------------------------------------------------------

    if (
        typeof module.canHandle === 'function'
    ) {

        try {

            return Boolean(
                await module.canHandle(
                    message
                )
            );

        } catch (error) {

            console.error(
                `❌ Capability "${getCapabilityName(item)}" canHandle error:`,
                error.message
            );

            return false;
        }
    }

    // --------------------------------------------------------
    // Alternative API
    // --------------------------------------------------------

    if (
        typeof module.isRequest === 'function'
    ) {

        try {

            return Boolean(
                await module.isRequest(
                    message
                )
            );

        } catch (error) {

            console.error(
                `❌ Capability "${getCapabilityName(item)}" isRequest error:`,
                error.message
            );

            return false;
        }
    }

    // --------------------------------------------------------
    // Legacy music API
    // --------------------------------------------------------

    if (
        typeof module.isMusicRequest === 'function'
    ) {

        try {

            return Boolean(
                await module.isMusicRequest(
                    message
                )
            );

        } catch (error) {

            console.error(
                `❌ Capability "${getCapabilityName(item)}" isMusicRequest error:`,
                error.message
            );

            return false;
        }
    }

    return false;
}

// ============================================================
// EXECUTE
// ============================================================

async function execute(
    item,
    message
) {

    const module =
        item.module;

    // --------------------------------------------------------
    // Modern API
    // --------------------------------------------------------

    if (
        typeof module.execute === 'function'
    ) {

        return module.execute(
            message
        );
    }

    // --------------------------------------------------------
    // Alternative API
    // --------------------------------------------------------

    if (
        typeof module.handle === 'function'
    ) {

        return module.handle(
            message
        );
    }

    // --------------------------------------------------------
    // Legacy music API
    // --------------------------------------------------------

    if (
        typeof module.executeMusic === 'function'
    ) {

        return module.executeMusic(
            message
        );
    }

    return null;
}

// ============================================================
// NORMALIZE RESULT
// ============================================================

function normalizeResult(
    item,
    result
) {

    if (
        !result
    ) {
        return null;
    }

    const name =
        getCapabilityName(
            item
        );

    // Capability returned a normal string.
    if (
        typeof result === 'string'
    ) {

        return {

            type:
                'capability',

            capability:
                name,

            response:
                result
        };
    }

    // Capability returned an object.
    if (
        typeof result === 'object'
    ) {

        return {

            type:
                result.type ||
                'capability',

            capability:
                result.capability ||
                name,

            ...result
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
            type: 'none'
        };
    }

    const capabilities =
        getCapabilities();

    // ========================================================
    // CAPABILITIES FIRST
    // ========================================================

    for (
        const item of capabilities
    ) {

        const handles =
            await canHandle(
                item,
                message
            );

        if (
            !handles
        ) {
            continue;
        }

        try {

            console.log(
                `⚡ Capability: ${getCapabilityName(item)}`
            );

            const result =
                await execute(
                    item,
                    message
                );

            const normalized =
                normalizeResult(
                    item,
                    result
                );

            if (
                normalized
            ) {

                return normalized;
            }

        } catch (error) {

            console.error(
                `❌ Capability "${getCapabilityName(item)}" failed:`
            );

            console.error(
                error
            );

            // Important:
            // Do NOT invent "I could not execute that capability."
            //
            // Let the application decide how to handle
            // an actual capability failure.

            return {

                type:
                    'capability_error',

                capability:
                    getCapabilityName(
                        item
                    ),

                error
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
// MANUAL CAPABILITY ACCESS
// ============================================================

function findCapability(
    name
) {

    const capabilities =
        getCapabilities();

    return capabilities.find(
        item =>
            getCapabilityName(
                item
            ).toLowerCase() ===
            String(name)
                .toLowerCase()
    ) || null;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    route,

    getCapabilities,

    discoverCapabilities,

    findCapability,

    canHandle,

    execute
};
