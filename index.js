require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Partials
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;

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

// Guarda quem está atualmente numa conversa com a DuckAI.
// A chave é o ID do canal + ID do utilizador.
const conversations = new Set();

function conversationKey(message) {
    return `${message.channel.id}:${message.author.id}`;
}

// ─────────────────────────────────────────────
// TRIGGERS
// ─────────────────────────────────────────────

function mentionsDuckAI(message) {
    const mentioned = message.mentions.has(client.user);

    const saysDuckAI = /\bduck\s*ai\b/i.test(message.content);

    return mentioned || saysDuckAI;
}

// ─────────────────────────────────────────────
// GOODBYE DETECTION
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
// MESSAGE HANDLER
// ─────────────────────────────────────────────

client.on('messageCreate', async message => {

    // Ignorar mensagens de bots
    if (message.author.bot) return;

    const key = conversationKey(message);

    // ─────────────────────────────────────────
    // INICIAR CONVERSA
    // ─────────────────────────────────────────

    if (mentionsDuckAI(message)) {

        conversations.add(key);

        await message.reply(
            '🦆 Heyyy! DuckAI is here 🤍'
        );

        return;
    }

    // ─────────────────────────────────────────
    // IGNORAR SE NÃO ESTIVER EM CONVERSA
    // ─────────────────────────────────────────

    if (!conversations.has(key)) return;

    // ─────────────────────────────────────────
    // DESPEDIDA
    // ─────────────────────────────────────────

    if (isGoodbye(message)) {

        conversations.delete(key);

        await message.reply(
            '🦆 Okay, bye bye! See you later 🤍'
        );

        return;
    }

    // ─────────────────────────────────────────
    // CONVERSA
    // ─────────────────────────────────────────

    await message.reply(
        `🦆 I heard you say: "${message.content}"`
    );
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