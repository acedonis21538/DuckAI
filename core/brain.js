const OpenAI = require('openai');

const memory = require('./memory');
const personality = require('./personality');

// ============================================================
// GROQ
// ============================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
    throw new Error(
        '❌ GROQ_API_KEY is missing from .env'
    );
}

const groq = new OpenAI({
    apiKey: GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

const AI_MODEL = 'openai/gpt-oss-20b';

// ============================================================
// CONFIG
// ============================================================

const MAX_HISTORY_MESSAGES = 50;

// ============================================================
// GENERATE RESPONSE
// ============================================================

async function generateResponse({
    message,
    history = [],
    capabilities = []
}) {

    const userId =
        message.author.id;

    const userProfile =
        memory.buildUserMemoryPrompt(
            userId
        );

    const capabilityList =
        capabilities.length
            ? capabilities.join(', ')
            : 'None';

    const recentHistory =
        history.slice(
            -MAX_HISTORY_MESSAGES
        );

    const response =
        await groq.chat.completions.create({

            model: AI_MODEL,

            messages: [

                // ====================================================
                // PERSONALITY
                // ====================================================

                {
                    role: 'system',
                    content:
                        personality.buildPersonalityPrompt()
                },

                // ====================================================
                // SYSTEM BEHAVIOR
                // ====================================================

                {
                    role: 'system',
                    content: `
You are DuckAI's main conversational brain.

Your job is to understand the user's message,
maintain the conversation naturally,
and provide the best possible response.

AVAILABLE CAPABILITIES:
${capabilityList}

A capability should only be used when the application
explicitly routes the request to it.

Do not pretend to have performed an action that the
application has not actually performed.
`
                },

                // ====================================================
                // USER PROFILE
                // ====================================================

                {
                    role: 'system',
                    content: `
CURRENT SPEAKER

Discord user ID:
${userId}

Discord username:
${message.author.username}

CURRENT USER PROFILE:
${userProfile}

This profile belongs ONLY to the current speaker.

Use relevant information naturally.

Do not dump the profile into the conversation.
Do not mention the profile as a database.
Do not assume information about other users.
`
                },

                // ====================================================
                // HISTORY
                // ====================================================

                ...recentHistory
            ],

            temperature: 0.78,

            max_tokens: 1400
        });

    const reply =
        response
            .choices?.[0]
            ?.message
            ?.content
            ?.trim();

    if (!reply) {

        throw new Error(
            'Groq returned an empty response.'
        );
    }

    return reply;
}

// ============================================================
// ADD MESSAGE TO HISTORY
// ============================================================

function addToHistory(
    history,
    role,
    content
) {

    history.push({
        role,
        content
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
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    generateResponse,
    addToHistory,

    MAX_HISTORY_MESSAGES
};