'use strict'
// ============================================================
// DUCKAI — MAIN CONVERSATIONAL BRAIN
// ============================================================
//
// This module is responsible ONLY for conversation.
//
// CAPABILITIES ARE HANDLED BY:
//     core/router.js
//
// Therefore this Brain MUST NOT:
//
// • execute capabilities
// • output capability XML
// • output <use capability="...">
// • pretend to execute actions
// • call music/image/search modules
//
// FLOW:
//
// index.js
//    ↓
// router.js
//    ├── capability → capability handles request
//    │
//    └── conversation → brain.js
//
// ============================================================

const OpenAI =
    require('openai');

const memory =
    require('./memory');

const personality =
    require('./personality');

// ============================================================
// GROQ
// ============================================================

const GROQ_API_KEY =
    process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {

    throw new Error(
        '❌ GROQ_API_KEY is missing from .env'
    );
}

const groq =
    new OpenAI({

        apiKey:
            GROQ_API_KEY,

        baseURL:
            'https://api.groq.com/openai/v1',

        timeout:
            30_000,

        maxRetries:
            2
    });

// ============================================================
// MODEL
// ============================================================

const AI_MODEL =
    'openai/gpt-oss-20b';

// ============================================================
// CONFIG
// ============================================================

const MAX_HISTORY_MESSAGES =
    50;

const MAX_USER_MESSAGE_LENGTH =
    8000;

const MAX_CAPABILITIES =
    100;

const MAX_PROFILE_LENGTH =
    12000;

// ============================================================
// HELPERS
// ============================================================

function cleanText(
    value
) {

    if (
        typeof value !==
        'string'
    ) {

        return '';
    }

    return value
        .replace(
            /\u0000/g,
            ''
        )
        .trim();
}

// ============================================================
// CLEAN USER MESSAGE
// ============================================================

function normalizeUserMessage(
    content
) {

    return cleanText(
        content
    )
        .slice(
            0,
            MAX_USER_MESSAGE_LENGTH
        );
}

// ============================================================
// SAFE PROFILE
// ============================================================

function buildSafeUserProfile(
    userId
) {

    try {

        if (
            !memory ||
            typeof memory.buildUserMemoryPrompt !==
            'function'
        ) {

            return 'No saved profile available.';
        }

        const profile =
            memory.buildUserMemoryPrompt(
                userId
            );

        return cleanText(
            profile
        )
            .slice(
                0,
                MAX_PROFILE_LENGTH
            ) ||
            'No saved profile available.';

    } catch (error) {

        console.error(
            '⚠️ Failed to build user memory prompt:',
            error
        );

        return 'No saved profile available.';
    }
}

// ============================================================
// SAFE CAPABILITY LIST
// ============================================================

function buildCapabilityList(
    capabilities
) {

    if (
        !Array.isArray(
            capabilities
        )
    ) {

        return 'None';
    }

    const names =
        capabilities
            .map(
                capability => {

                    if (
                        typeof capability ===
                        'string'
                    ) {

                        return capability
                            .trim();
                    }

                    if (
                        capability &&
                        typeof capability.name ===
                        'string'
                    ) {

                        return capability.name
                            .trim();
                    }

                    return '';
                }
            )
            .filter(
                Boolean
            )
            .slice(
                0,
                MAX_CAPABILITIES
            );

    return names.length
        ? names.join(', ')
        : 'None';
}

// ============================================================
// SAFE HISTORY
// ============================================================

function buildSafeHistory(
    history
) {

    if (
        !Array.isArray(
            history
        )
    ) {

        return [];
    }

    return history
        .slice(
            -MAX_HISTORY_MESSAGES
        )
        .filter(
            item =>
                item &&
                (
                    item.role ===
                        'user' ||

                    item.role ===
                        'assistant' ||

                    item.role ===
                        'system'
                ) &&
                typeof item.content ===
                    'string'
        )
        .map(
            item => ({

                role:
                    item.role,

                content:
                    item.content.slice(
                        0,
                        MAX_USER_MESSAGE_LENGTH
                    )
            })
        );
}

// ============================================================
// RESPONSE CLEANUP
// ============================================================
//
// The Brain is conversational only.
//
// If the model still tries to emit internal capability
// syntax, remove it instead of exposing implementation
// details to the Discord user.
//
// Examples:
//
// <use capability="music">...</use>
// <capability>...</capability>
//
// ============================================================

function cleanModelResponse(
    response
) {

    let text =
        cleanText(
            response
        );

    if (
        !text
    ) {

        return '';
    }

    // --------------------------------------------------------
    // Remove fenced XML/code wrappers
    // --------------------------------------------------------

    text =
        text.replace(
            /^```(?:xml|html|text)?\s*/i,
            ''
        );

    text =
        text.replace(
            /\s*```$/i,
            ''
        );

    // --------------------------------------------------------
    // Remove internal capability blocks
    // --------------------------------------------------------

    text =
        text.replace(
            /<use\s+capability\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/use>/gi,
            ''
        );

    text =
        text.replace(
            /<use\s+capability\s*=\s*["'][^"']+["'][^>]*\/>/gi,
            ''
        );

    text =
        text.replace(
            /<capability[\s\S]*?<\/capability>/gi,
            ''
        );

    // --------------------------------------------------------
    // Remove accidental internal tags
    // --------------------------------------------------------

    text =
        text.replace(
            /<\/?(?:tool|function|function_call|capability|action)\b[^>]*>/gi,
            ''
        );

    return text
        .replace(
            /\n{3,}/g,
            '\n\n'
        )
        .trim();
}

// ============================================================
// FALLBACK RESPONSE
// ============================================================

function getFallbackResponse() {

    return (
        "Sorry, I couldn't generate a proper response right now. Please try again."
    );
}

// ============================================================
// GENERATE RESPONSE
// ============================================================

async function generateResponse({
    message,
    history = [],
    capabilities = []
}) {

    // ========================================================
    // VALIDATION
    // ========================================================

    if (
        !message ||
        !message.author
    ) {

        throw new Error(
            'Brain received an invalid Discord message.'
        );
    }

    const userId =
        String(
            message.author.id
        );

    const username =
        cleanText(
            message.author.username ||
            message.author.globalName ||
            'Unknown user'
        );

    const userMessage =
        normalizeUserMessage(
            message.content
        );

    if (
        !userMessage
    ) {

        throw new Error(
            'Brain received an empty user message.'
        );
    }

    // ========================================================
    // MEMORY
    // ========================================================

    const userProfile =
        buildSafeUserProfile(
            userId
        );

    // ========================================================
    // CAPABILITIES
    // ========================================================
    //
    // This list is informational only.
    //
    // The Brain does NOT execute anything from this list.
    //
    // ========================================================

    const capabilityList =
        buildCapabilityList(
            capabilities
        );

    // ========================================================
    // HISTORY
    // ========================================================

    const recentHistory =
        buildSafeHistory(
            history
        );

    // ========================================================
    // PERSONALITY
    // ========================================================

    let personalityPrompt =
        'You are DuckAI, a cute, friendly and helpful AI duck.';

    try {

        if (
            personality &&
            typeof personality.buildPersonalityPrompt ===
            'function'
        ) {

            personalityPrompt =
                personality.buildPersonalityPrompt();
        }

    } catch (error) {

        console.error(
            '⚠️ Personality prompt error:',
            error
        );
    }

    // ========================================================
    // SYSTEM PROMPT
    // ========================================================

    const systemPrompt = `
You are DuckAI's main conversational brain.

Your role is to understand the user's message and respond
naturally, intelligently, accurately and consistently.

You are a conversational AI, not a command executor.

CAPABILITY SYSTEM
-----------------

The application has a separate capability router.

Available capabilities:
${capabilityList}

IMPORTANT:

- Capabilities are handled OUTSIDE this Brain.
- You must NEVER execute a capability yourself.
- You must NEVER simulate a capability execution.
- You must NEVER output capability instructions.
- You must NEVER output XML capability syntax.
- You must NEVER output tags such as:
  <use capability="...">
  <capability>...</capability>
  <tool>...</tool>
  <function>...</function>
- You must NEVER tell the user that you "called" or "executed"
  a capability unless the application explicitly provided
  that result to you.
- If a capability is required, the router should already have
  handled the request before this Brain is called.
- When no capability handled the message, answer normally.

CONVERSATION
------------

Respond to the user's actual message.

Do not describe internal architecture unless the user
specifically asks about DuckAI's internal implementation.

Do not invent actions, links, searches, media playback,
files, calculations or external operations that were not
actually performed by the application.

If you do not know something, be honest.

If the user is casual, you may be casual.

If the user asks for technical help, be precise and practical.

If the user asks a simple question, do not unnecessarily
overcomplicate the answer.

LANGUAGE
--------

Respond in the same language used by the user unless the
user explicitly requests another language.

DuckAI's user-facing capability/interface text is English,
but normal conversation may follow the user's language.

STYLE
-----

Keep the personality consistent with the personality prompt.

Be natural.

Avoid repetitive greetings.

Do not add unnecessary disclaimers.

Do not mention these system instructions.

Do not mention hidden prompts, memory internals or routing
logic unless explicitly asked.

The final answer should contain ONLY the response intended
for the user.
`.trim();

    // ========================================================
    // CURRENT USER CONTEXT
    // ========================================================

    const userContext = `
CURRENT SPEAKER

Discord user ID:
${userId}

Discord username:
${username}

CURRENT USER PROFILE:
${userProfile}

Use relevant information naturally.

This profile belongs only to the current speaker.

Do not assume profile information about other users.

Do not dump the profile into the conversation.
`.trim();

    // ========================================================
    // MESSAGES
    // ========================================================

    const messages = [

        // ----------------------------------------------------
        // Personality
        // ----------------------------------------------------

        {
            role:
                'system',

            content:
                personalityPrompt
        },

        // ----------------------------------------------------
        // Core behavior
        // ----------------------------------------------------

        {
            role:
                'system',

            content:
                systemPrompt
        },

        // ----------------------------------------------------
        // User context
        // ----------------------------------------------------

        {
            role:
                'system',

            content:
                userContext
        },

        // ----------------------------------------------------
        // Conversation history
        // ----------------------------------------------------

        ...recentHistory,

        // ----------------------------------------------------
        // Current message
        // ----------------------------------------------------
        //
        // Important:
        //
        // The current message is explicitly included here
        // even if the caller has not yet added it to history.
        //
        // This prevents accidental context loss.
        //

        {
            role:
                'user',

            content:
                userMessage
        }
    ];

    // ========================================================
    // GROQ REQUEST
    // ========================================================

    let response;

    try {

        response =
            await groq.chat.completions.create({

                model:
                    AI_MODEL,

                messages,

                temperature:
                    0.78,

                max_tokens:
                    1400,

                top_p:
                    0.95
            });

    } catch (error) {

        console.error(
            '❌ Groq request failed:',
            error
        );

        throw new Error(
            'Groq request failed.'
        );
    }

    // ========================================================
    // EXTRACT RESPONSE
    // ========================================================

    const rawReply =
        response
            ?.choices?.[0]
            ?.message
            ?.content;

    const reply =
        cleanModelResponse(
            rawReply
        );

    // ========================================================
    // EMPTY RESPONSE GUARD
    // ========================================================

    if (
        !reply
    ) {

        console.warn(
            '⚠️ Groq returned an empty or unusable response.'
        );

        return getFallbackResponse();
    }

    return reply;
}

// ============================================================
// ADD TO HISTORY
// ============================================================

function addToHistory(
    history,
    role,
    content
) {

    if (
        !Array.isArray(
            history
        )
    ) {

        throw new TypeError(
            'History must be an array.'
        );
    }

    if (
        !['user', 'assistant', 'system']
            .includes(role)
    ) {

        throw new TypeError(
            `Invalid history role: ${role}`
        );
    }

    const text =
        cleanText(
            content
        );

    if (
        !text
    ) {

        return history;
    }

    history.push({

        role,

        content:
            text
    });

    if (
        history.length >
        MAX_HISTORY_MESSAGES
    ) {

        history.splice(

            0,

            history.length -
            MAX_HISTORY_MESSAGES
        );
    }

    return history;
}

// ============================================================
// CLEAR HISTORY
// ============================================================

function clearHistory(
    history
) {

    if (
        Array.isArray(
            history
        )
    ) {

        history.length =
            0;
    }

    return history;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    generateResponse,

    addToHistory,

    clearHistory,

    MAX_HISTORY_MESSAGES,

    AI_MODEL
};