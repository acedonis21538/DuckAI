// ============================================================
// DUCKAI — PERMANENT CORE INDEX
// ============================================================
//
// This file is the permanent DuckAI core.
//
// FLOW:
//
// MESSAGE
//   ↓
// ROUTER
//   ↓
// ┌──────────────────────────────────────────────┐
// │ Capability handled the message?             │
// │                                              │
// │ YES → capability response → STOP            │
// │                                              │
// │ NO  → Brain → response                      │
// └──────────────────────────────────────────────┘
//
// RULES:
//
// • This file knows NOTHING about specific capabilities.
// • This file never imports music, images, search, panels, etc.
// • This file never executes capabilities directly.
// • The router is always checked first.
// • A capability always has priority over the Brain.
// • If no capability handles the message, the Brain responds.
// • A message receives at most ONE response from DuckAI.
// • Router errors do NOT generate fake capability responses.
// • Brain errors do NOT retry the message.
// • Memory updates happen in the background.
// • Conversation history is managed here.
// • New capabilities should require NO changes to this file.
//
// ============================================================

require('dotenv').config();

// ============================================================
// DISCORD
// ============================================================

const {
    Client,
    GatewayIntentBits,
    Partials
} = require('discord.js');

// ============================================================
// CORE
// ============================================================

const memory =
    require('./core/memory');

const brain =
    require('./core/brain');

const router =
    require('./core/router');

// ============================================================
// ENV
// ============================================================

const TOKEN =
    process.env.DISCORD_TOKEN;

if (!TOKEN) {

    console.error(
        '❌ DISCORD_TOKEN is missing from .env'
    );

    process.exit(1);
}

// ============================================================
// DISCORD CLIENT
// ============================================================

const client =
    new Client({

        intents: [

            GatewayIntentBits.Guilds,

            GatewayIntentBits.GuildMessages,

            GatewayIntentBits.DirectMessages,

            GatewayIntentBits.MessageContent
        ],

        partials: [

            Partials.Channel
        ]
    });

// ============================================================
// CONVERSATIONS
// ============================================================
//
// Each channel/user pair has its own conversation.
//
// This prevents users from sharing conversation history.
//

const conversations =
    new Set();

const histories =
    new Map();

// ============================================================
// CONFIG
// ============================================================

const MAX_HISTORY_MESSAGES =
    Number.isInteger(
        brain.MAX_HISTORY_MESSAGES
    )
        ? brain.MAX_HISTORY_MESSAGES
        : 50;

// ============================================================
// CONVERSATION KEY
// ============================================================

function getConversationKey(
    message
) {

    return (
        `${message.channel.id}:${message.author.id}`
    );
}

// ============================================================
// HISTORY
// ============================================================

function getHistory(
    key
) {

    if (
        !histories.has(key)
    ) {

        histories.set(
            key,
            []
        );
    }

    return histories.get(
        key
    );
}

// ============================================================
// DUCKAI ACTIVATION
// ============================================================

function mentionsDuckAI(
    message
) {

    if (
        !client.user
    ) {

        return false;
    }

    const mentioned =
        message.mentions.has(
            client.user
        );

    const saysDuckAI =
        /\bduck\s*ai\b/i.test(
            message.content
        );

    return (
        mentioned ||
        saysDuckAI
    );
}

// ============================================================
// GOODBYE
// ============================================================

function isGoodbye(
    message
) {

    const text =
        message.content
            .toLowerCase()
            .trim()
            .replace(
                /[.!?,;:]+$/g,
                ''
            );

    const goodbyes = [

        'bye',
        'bye bye',

        'ok bye',
        'okay bye',
        'ok bye bye',
        'okay bye bye',

        'goodbye',
        'good bye',

        'see you',
        'see ya',
        'cya',
        'later',

        'gotta go',
        'i gotta go',

        'i have to go',
        'i gotta leave',

        'have to go',
        'have to leave',

        'talk to you later',
        'talk later'
    ];

    return goodbyes.includes(
        text
    );
}

// ============================================================
// CAPABILITIES
// ============================================================
//
// The index does not know what capabilities exist.
//
// If the router exposes getCapabilities(), the Brain can be
// informed about them.
//
// This is informational only.
//
// The Brain NEVER executes a capability itself.
//

function getCapabilities() {

    try {

        if (
            typeof router.getCapabilities !==
            'function'
        ) {

            return [];
        }

        const result =
            router.getCapabilities();

        if (
            !Array.isArray(result)
        ) {

            return [];
        }

        return result
            .map(
                capability => {

                    if (
                        typeof capability ===
                        'string'
                    ) {

                        return capability;
                    }

                    if (
                        capability?.name
                    ) {

                        return capability.name;
                    }

                    if (
                        capability?.capability
                    ) {

                        return capability.capability;
                    }

                    if (
                        capability?.module?.name
                    ) {

                        return capability.module.name;
                    }

                    if (
                        capability?.module?.capability
                    ) {

                        return capability.module.capability;
                    }

                    return null;
                }
            )
            .filter(
                Boolean
            );

    } catch (error) {

        console.error(
            '⚠️ Could not read capabilities:',
            error
        );

        return [];
    }
}

// ============================================================
// SAFE REPLY
// ============================================================
//
// Prevents empty replies and avoids attempting to reply twice
// to the same interaction/message flow.
//

async function safeReply(
    message,
    content
) {

    if (
        typeof content !==
        'string'
    ) {

        return false;
    }

    const text =
        content.trim();

    if (
        !text
    ) {

        return false;
    }

    try {

        await message.reply(
            text
        );

        return true;

    } catch (error) {

        console.error(
            '❌ Failed to send reply:',
            error
        );

        return false;
    }
}

// ============================================================
// ROUTER EXECUTION
// ============================================================
//
// The router is the universal dispatcher.
//
// IMPORTANT:
//
// A router failure is NOT converted into:
// "I could not execute that capability."
//
// Instead, the message falls through to the Brain.
//
// This means a broken optional capability cannot destroy
// normal DuckAI conversation.
//

async function executeRouter(
    message
) {

    if (
        !router ||
        typeof router.route !==
        'function'
    ) {

        return {
            type:
                'conversation'
        };
    }

    try {

        const result =
            await router.route(
                message
            );

        if (
            !result
        ) {

            return {
                type:
                    'conversation'
            };
        }

        return result;

    } catch (error) {

        console.error(
            '❌ Router error:',
            error
        );

        return {
            type:
                'conversation'
        };
    }
}

// ============================================================
// CAPABILITY RESULT
// ============================================================
//
// A valid capability result looks like:
//
// {
//     type: 'capability',
//     capability: 'music',
//     response: '...'
// }
//
// The index does not care which capability produced it.
//
// ============================================================

function isCapabilityResult(
    route
) {

    return (
        route &&
        route.type ===
            'capability'
    );
}

// ============================================================
// BRAIN HISTORY — USER
// ============================================================

function addUserHistory(
    history,
    message
) {

    if (
        typeof brain.addToHistory ===
        'function'
    ) {

        brain.addToHistory(

            history,

            'user',

            message.content
        );

        return;
    }

    history.push({

        role:
            'user',

        content:
            message.content
    });

    trimHistory(
        history
    );
}

// ============================================================
// BRAIN HISTORY — ASSISTANT
// ============================================================

function addAssistantHistory(
    history,
    response
) {

    if (
        typeof brain.addToHistory ===
        'function'
    ) {

        brain.addToHistory(

            history,

            'assistant',

            response
        );

        return;
    }

    history.push({

        role:
            'assistant',

        content:
            response
    });

    trimHistory(
        history
    );
}

// ============================================================
// HISTORY LIMIT
// ============================================================

function trimHistory(
    history
) {

    if (
        history.length <=
        MAX_HISTORY_MESSAGES
    ) {

        return;
    }

    history.splice(

        0,

        history.length -
            MAX_HISTORY_MESSAGES
    );
}

// ============================================================
// MEMORY UPDATE
// ============================================================

function updateMemory(
    message
) {

    if (
        !memory ||
        typeof memory.updateUserMemory !==
        'function'
    ) {

        return;
    }

    Promise
        .resolve(
            memory.updateUserMemory(
                message
            )
        )
        .catch(
            error => {

                console.error(
                    '⚠️ Memory error:',
                    error
                );
            }
        );
}

// ============================================================
// PROCESS MESSAGE
// ============================================================

async function processMessage(
    message
) {

    // ========================================================
    // IGNORE BOTS
    // ========================================================

    if (
        message.author?.bot
    ) {

        return;
    }

    // ========================================================
    // IGNORE EMPTY MESSAGES
    // ========================================================

    if (
        typeof message.content !==
            'string' ||
        !message.content.trim()
    ) {

        return;
    }

    // ========================================================
    // CONVERSATION KEY
    // ========================================================

    const key =
        getConversationKey(
            message
        );

    // ========================================================
    // 1. ROUTER — ALWAYS FIRST
    // ========================================================
    //
    // This is the most important rule.
    //
    // The Brain is NEVER called before the router.
    //
    // ========================================================

    const route =
        await executeRouter(
            message
        );

    // ========================================================
    // 2. CAPABILITY
    // ========================================================

    if (
        isCapabilityResult(
            route
        )
    ) {

        // ----------------------------------------------------
        // Capability has complete control over its response.
        // ----------------------------------------------------

        if (
            route.response
        ) {

            await safeReply(

                message,

                route.response
            );
        }

        // ----------------------------------------------------
        // ABSOLUTE STOP
        // ----------------------------------------------------
        //
        // Never:
        //
        // capability
        //     ↓
        // Heyyy
        //     ↓
        // Brain
        //
        // Never.
        //
        // ----------------------------------------------------

        return;
    }

    // ========================================================
    // 3. ACTIVATION
    // ========================================================
    //
    // Activation is only reached when no capability consumed
    // the message.
    //
    // IMPORTANT:
    //
    // "DuckAI" activation remains available, but it does not
    // interfere with capability execution.
    //
    // ========================================================

    const activated =
        mentionsDuckAI(
            message
        );

    if (
        activated
    ) {

        conversations.add(
            key
        );

        getHistory(
            key
        );

        // ----------------------------------------------------
        // If the user only called DuckAI, acknowledge it.
        //
        // If they actually asked something, send the actual
        // message to the Brain instead of producing "Heyyy"
        // and stopping.
        // ----------------------------------------------------

        const cleanedContent =
            message.content
                .replace(
                    /<@!?\d+>/g,
                    ''
                )
                .replace(
                    /\bduck\s*ai\b/gi,
                    ''
                )
                .trim();

        if (
            !cleanedContent
        ) {

            await safeReply(

                message,

                '🦆 Heyyy! DuckAI is here 🤍'
            );

            updateMemory(
                message
            );

            return;
        }

        // ----------------------------------------------------
        // The user activated DuckAI AND asked something.
        //
        // Do NOT send "Heyyy" first.
        // Let the Brain answer immediately.
        // ----------------------------------------------------
    }

    // ========================================================
    // 4. INACTIVE CONVERSATION
    // ========================================================
    //
    // If the message did not activate DuckAI and there is no
    // active conversation, normal chat is ignored.
    //
    // ========================================================

    if (
        !conversations.has(
            key
        )
    ) {

        return;
    }

    // ========================================================
    // 5. GOODBYE
    // ========================================================

    if (
        isGoodbye(
            message
        )
    ) {

        conversations.delete(
            key
        );

        histories.delete(
            key
        );

        await safeReply(

            message,

            '🦆 Okay, bye bye! See you later 🤍'
        );

        return;
    }

    // ========================================================
    // 6. BRAIN
    // ========================================================

    try {

        if (
            !brain ||
            typeof brain.generateResponse !==
                'function'
        ) {

            throw new Error(
                'Brain does not export generateResponse().'
            );
        }

        await message.channel.sendTyping();

        const history =
            getHistory(
                key
            );

        // ----------------------------------------------------
        // CURRENT USER MESSAGE
        // ----------------------------------------------------

        addUserHistory(

            history,

            message
        );

        // ----------------------------------------------------
        // CAPABILITIES INFORMATION
        // ----------------------------------------------------
        //
        // This does NOT execute anything.
        //
        // It only tells the Brain what the application has
        // available.
        //
        // ----------------------------------------------------

        const capabilities =
            getCapabilities();

        // ----------------------------------------------------
        // GENERATE
        // ----------------------------------------------------

        const response =
            await brain.generateResponse({

                message,

                history,

                capabilities
            });

        // ----------------------------------------------------
        // VALIDATE
        // ----------------------------------------------------

        if (
            typeof response !==
                'string' ||
            !response.trim()
        ) {

            throw new Error(
                'Brain returned an empty response.'
            );
        }

        // ----------------------------------------------------
        // ASSISTANT HISTORY
        // ----------------------------------------------------

        addAssistantHistory(

            history,

            response
        );

        // ----------------------------------------------------
        // SEND EXACTLY ONE RESPONSE
        // ----------------------------------------------------

        await safeReply(

            message,

            response
        );

        // ----------------------------------------------------
        // MEMORY
        // ----------------------------------------------------

        updateMemory(
            message
        );

    } catch (error) {

        console.error(
            '❌ Brain error:',
            error
        );

        // ----------------------------------------------------
        // ONE ERROR RESPONSE ONLY
        // ----------------------------------------------------

        await safeReply(

            message,

            '🦆 Aww, something went wrong on my side... try again in a moment? 🤍'
        );
    }
}

// ============================================================
// SINGLE MESSAGE LISTENER
// ============================================================
//
// This is the ONLY messageCreate listener that belongs to
// the permanent DuckAI core.
//
// Capabilities must NOT create their own messageCreate
// listener if they are loaded through this architecture.
//

client.on(
    'messageCreate',
    processMessage
);

// ============================================================
// READY
// ============================================================

client.once(
    'ready',
    () => {

        console.log(
            '────────────────────────────'
        );

        console.log(
            `🦆 DuckAI online as ${client.user.tag}`
        );

        const capabilities =
            getCapabilities();

        if (
            capabilities.length
        ) {

            console.log(
                `⚡ Capabilities: ${capabilities.length}`
            );

            for (
                const capability
                of capabilities
            ) {

                console.log(
                    `   • ${capability}`
                );
            }

        } else {

            console.log(
                '⚡ Capabilities: loaded through router'
            );
        }

        console.log(
            '────────────────────────────'
        );
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
    TOKEN
)
.catch(
    error => {

        console.error(
            '❌ Discord login failed:',
            error
        );

        process.exit(1);
    }
);

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    client,

    conversations,

    histories,

    getConversationKey,

    getHistory,

    mentionsDuckAI,

    isGoodbye,

    getCapabilities,

    executeRouter,

    processMessage
};