require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Partials
} = require('discord.js');

const OpenAI = require('openai');

// ─────────────────────────────────────────────
// ENV
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// GROQ
// ─────────────────────────────────────────────

const groq = new OpenAI({
    apiKey: GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

// ─────────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// CONVERSATIONS
// ─────────────────────────────────────────────

const conversations = new Set();
const histories = new Map();

function conversationKey(message) {
    return `${message.channel.id}:${message.author.id}`;
}

// ─────────────────────────────────────────────
// PERSONALITY
// ─────────────────────────────────────────────

const personality = `
You are DuckAI, a cute and friendly AI duck.

Your personality:
- You are affectionate and warm.
- You are cheerful and positive.
- You are realistic and honest when giving opinions.
- You are funny and enjoy light humor.
- You are friendly and easy to talk to.
- You can be serious when the subject is serious.
- You are playful and slightly teasing, but never inappropriate.
- You are calm and patient.
- You are curious and interested in the person you're talking to.
- You are spontaneous and natural.

Speak naturally, like a real conversation between friends.

Do not constantly mention that you are an AI.
Do not overuse emojis.
Occasionally use cute expressions such as "hehe", "aww", or "hmm".
When someone asks for your opinion, actually give an opinion.
Do not always agree with the user just to be nice.
Match the user's language.
Keep responses reasonably concise unless more detail is useful.
`;

// ─────────────────────────────────────────────
// TRIGGERS
// ─────────────────────────────────────────────

function mentionsDuckAI(message) {

    const mentioned = message.mentions.has(client.user);

    const saysDuckAI = /\bduck\s*ai\b/i.test(message.content);

    return mentioned || saysDuckAI;
}

// ─────────────────────────────────────────────
// GOODBYE
// ─────────────────────────────────────────────

function isGoodbye(message) {

    const text = message.content
        .toLowerCase()
        .trim()
        .replace(/[.!?,;]+$/g, '');

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

// ─────────────────────────────────────────────
// AI RESPONSE
// ─────────────────────────────────────────────

async function generateResponse(message, key) {

    if (!histories.has(key)) {
        histories.set(key, []);
    }

    const history = histories.get(key);

    history.push({
        role: 'user',
        content: message.content
    });

    // Keep only the latest messages
    const recentHistory = history.slice(-20);

    const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages: [
            {
                role: 'system',
                content: personality
            },
            ...recentHistory
        ],
        temperature: 0.8,
        max_tokens: 500
    });

    const reply =
        response.choices?.[0]?.message?.content?.trim();

    if (!reply) {
        throw new Error('Groq returned an empty response.');
    }

    history.push({
        role: 'assistant',
        content: reply
    });

    // Prevent unlimited memory growth
    if (history.length > 20) {
        history.splice(0, history.length - 20);
    }

    return reply;
}

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────

client.on('messageCreate', async message => {

    // Ignore bots
    if (message.author.bot) return;

    const key = conversationKey(message);

    // ─────────────────────────────────────────
    // START CONVERSATION
    // ─────────────────────────────────────────

    if (mentionsDuckAI(message)) {

        conversations.add(key);

        if (!histories.has(key)) {
            histories.set(key, []);
        }

        await message.reply(
            '🦆 Heyyy! DuckAI is here 🤍'
        );

        return;
    }

    // ─────────────────────────────────────────
    // IGNORE OUTSIDE CONVERSATION
    // ─────────────────────────────────────────

    if (!conversations.has(key)) return;

    // ─────────────────────────────────────────
    // GOODBYE
    // ─────────────────────────────────────────

    if (isGoodbye(message)) {

        conversations.delete(key);
        histories.delete(key);

        await message.reply(
            '🦆 Okay, bye bye! See you later 🤍'
        );

        return;
    }

    // ─────────────────────────────────────────
    // AI
    // ─────────────────────────────────────────

    try {

        await message.channel.sendTyping();

        const reply = await generateResponse(message, key);

        await message.reply(reply);

    } catch (error) {

        console.error('❌ AI error:', error);

        await message.reply(
            '🦆 Aww, something went wrong on my side... try again in a moment? 🤍'
        );
    }
});

// ─────────────────────────────────────────────
// READY
// ─────────────────────────────────────────────

client.once('ready', () => {

    console.log('────────────────────────────');
    console.log(`🦆 DuckAI online as ${client.user.tag}`);
    console.log('────────────────────────────');

});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

client.login(TOKEN);