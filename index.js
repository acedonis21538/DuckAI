require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Partials
} = require('discord.js');

const OpenAI = require('openai');

const TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
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
- You have a good sense of humor.
- You are friendly and easy to talk to.
- You can be serious when the subject is serious.
- You are slightly playful and teasing, but never inappropriate.
- You are calm and patient.
- You are curious and interested in the person you're talking to.
- You are spontaneous and natural.

Speak naturally like a real conversation.
Do not constantly mention that you are an AI.
Do not overuse emojis.
Occasionally use cute expressions such as "hehe", "aww", or "hmm".
When someone asks for your opinion, actually give an opinion instead of avoiding the question.
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

    // Keep the conversation from becoming enormous
    const recentHistory = history.slice(-20);

    const response = await openai.responses.create({
        model: 'gpt-5.6-luna',
        instructions: personality,
        input: recentHistory
    });

    const reply = response.output_text;

    history.push({
        role: 'assistant',
        content: reply
    });

    // Keep memory limited
    if (history.length > 20) {
        history.splice(0, history.length - 20);
    }

    return reply;
}

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────

client.on('messageCreate', async message => {

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