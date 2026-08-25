require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Partials
} = require('discord.js');

const OpenAI = require('openai');

const memory = require('./core/memory');
const personality = require('./core/personality');

// ============================================================
// ENV
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing from .env');
    process.exit(1);
}

if (!GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY is missing from .env');
    process.exit(1);
}

// ============================================================
// GROQ
// ============================================================

const groq = new OpenAI({
    apiKey: GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

const AI_MODEL = 'openai/gpt-oss-20b';

// ============================================================
// DISCORD
// ============================================================

const client = new Client({
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

const conversations = new Set();
const histories = new Map();

const MAX_HISTORY_MESSAGES = 50;

// ============================================================
// CONVERSATION KEY
// ============================================================

function conversationKey(message) {

    return (
        `${message.channel.id}:${message.author.id}`
    );
}

// ============================================================
// HISTORY
// ============================================================

function getHistory(key) {

    if (!histories.has(key)) {

        histories.set(
            key,
            []
        );
    }

    return histories.get(key);
}

// ============================================================
// DUCKAI TRIGGER
// ============================================================

function mentionsDuckAI(message) {

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

function isGoodbye(message) {

    const text =
        message.content
            .toLowerCase()
            .trim()
            .replace(
                /[.!?,;]+$/g,
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
        'have to go',
        'talk to you later'
    ];

    return goodbyes.includes(text);
}

// ============================================================
// GENERATE RESPONSE
// ============================================================

async function generateResponse(
    message,
    key
) {

    const history =
        getHistory(key);

    history.push({
        role: 'user',
        content: message.content
    });

    const recentHistory =
        history.slice(
            -MAX_HISTORY_MESSAGES
        );

    const userProfile =
        memory.buildUserMemoryPrompt(
            message.author.id
        );

    const response =
        await groq.chat.completions.create({

            model: AI_MODEL,

            messages: [

                // ------------------------------------------------
                // PERSONALITY
                // ------------------------------------------------

                {
                    role: 'system',
                    content:
                        personality.buildPersonalityPrompt()
                },

                // ------------------------------------------------
                // USER PROFILE
                // ------------------------------------------------

                {
                    role: 'system',
                    content: `
CURRENT SPEAKER

Discord user ID:
${message.author.id}

Discord username:
${message.author.username}

IMPORTANT:
The personal profile below belongs ONLY to this current speaker.

CURRENT USER PROFILE:
${userProfile}

Use this profile naturally when relevant.

Never assume another user's information belongs to this user.
Never mention the profile as a database.
Never list all known information unless asked.
`
                },

                // ------------------------------------------------
                // CONVERSATION
                // ------------------------------------------------

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

    history.push({
        role: 'assistant',
        content: reply
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

    return reply;
}

// ============================================================
// INTERACTIONS
// ============================================================

client.on(
    'interactionCreate',
    async interaction => {

        /*
            Personality, memory and other commands
            will eventually be moved into /commands.

            For now this handler is intentionally kept
            minimal while the architecture is being separated.
        */

    }
);

// ============================================================
// MESSAGE HANDLER
// ============================================================

client.on(
    'messageCreate',
    async message => {

        // Ignore bots
        if (message.author.bot) {
            return;
        }

        const key =
            conversationKey(message);

        // ====================================================
        // START CONVERSATION
        // ====================================================

        if (
            mentionsDuckAI(message)
        ) {

            conversations.add(key);

            getHistory(key);

            await message.reply(
                '🦆 Heyyy! DuckAI is here 🤍'
            );

            /*
                Memory extraction runs in the background.
            */

            memory.updateUserMemory(
                message
            ).catch(
                error =>
                    console.error(
                        '⚠️ Background memory error:',
                        error
                    )
            );

            return;
        }

        // ====================================================
        // IGNORE INACTIVE CONVERSATIONS
        // ====================================================

        if (
            !conversations.has(key)
        ) {
            return;
        }

        // ====================================================
        // GOODBYE
        // ====================================================

        if (
            isGoodbye(message)
        ) {

            conversations.delete(key);
            histories.delete(key);

            await message.reply(
                '🦆 Okay, bye bye! See you later 🤍'
            );

            return;
        }

        // ====================================================
        // AI
        // ====================================================

        try {

            await message.channel.sendTyping();

            const reply =
                await generateResponse(
                    message,
                    key
                );

            await message.reply(reply);

            /*
                Update memory after responding.
            */

            memory.updateUserMemory(
                message
            ).catch(
                error =>
                    console.error(
                        '⚠️ Background memory error:',
                        error
                    )
            );

        } catch (error) {

            console.error(
                '❌ AI error:',
                error
            );

            await message.reply(
                '🦆 Aww, something went wrong on my side... try again in a moment? 🤍'
            );
        }
    }
);

// ============================================================
// READY
// ============================================================

client.once(
    'ready',
    async () => {

        console.log(
            '────────────────────────────'
        );

        console.log(
            `🦆 DuckAI online as ${client.user.tag}`
        );

        console.log(
            '────────────────────────────'
        );
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);