require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
    Client,
    GatewayIntentBits,
    Partials,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
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
// PERSONALITY FILE
// ─────────────────────────────────────────────

const personalityPath = path.join(
    __dirname,
    'personality.json'
);

const defaultPersonality = {
    loving: 85,
    cheerful: 90,
    realistic: 75,
    funny: 70,
    friendly: 100,
    serious: 35,
    playful: 20,
    calm: 70,
    curious: 80,
    spontaneous: 60
};

function loadPersonality() {
    try {
        if (!fs.existsSync(personalityPath)) {
            fs.writeFileSync(
                personalityPath,
                JSON.stringify(defaultPersonality, null, 2)
            );

            return { ...defaultPersonality };
        }

        const data = JSON.parse(
            fs.readFileSync(personalityPath, 'utf8')
        );

        return {
            ...defaultPersonality,
            ...data
        };

    } catch (error) {
        console.error(
            '❌ Failed to load personality.json:',
            error
        );

        return { ...defaultPersonality };
    }
}

let personalityValues = loadPersonality();

function savePersonality() {
    fs.writeFileSync(
        personalityPath,
        JSON.stringify(personalityValues, null, 2)
    );
}

// ─────────────────────────────────────────────
// PERSONALITY INFO
// ─────────────────────────────────────────────

const personalityInfo = [
    ['loving', '🩷', 'Loving'],
    ['cheerful', '😊', 'Cheerful'],
    ['realistic', '🧠', 'Realistic'],
    ['funny', '😂', 'Funny'],
    ['friendly', '🫶', 'Friendly'],
    ['serious', '🧊', 'Serious'],
    ['playful', '😈', 'Playful'],
    ['calm', '🧘', 'Calm'],
    ['curious', '🔎', 'Curious'],
    ['spontaneous', '✨', 'Spontaneous']
];

const pageOne = personalityInfo.slice(0, 5);
const pageTwo = personalityInfo.slice(5, 10);

// ─────────────────────────────────────────────
// PERSONALITY EMBED
// ─────────────────────────────────────────────

function createPersonalityEmbed(page = 0) {

    const pageInfo = page === 0
        ? pageOne
        : pageTwo;

    const lines = pageInfo.map(
        ([key, emoji, name]) =>
            `${emoji} **${name}** — ${personalityValues[key]}%`
    );

    return new EmbedBuilder()
        .setTitle('🦆 DuckAI Personality')
        .setDescription(
            `${lines.join('\n')}\n\n` +
            `Page ${page + 1}/2`
        )
        .setFooter({
            text: 'Set each personality trait from 0% to 100%.'
        });
}

// ─────────────────────────────────────────────
// MAIN PANEL BUTTONS
// ─────────────────────────────────────────────

function createMainButtons() {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId('personality_page_1')
                .setLabel('⚙️ Edit Page 1')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('personality_page_2')
                .setLabel('⚙️ Edit Page 2')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('personality_reset')
                .setLabel('🔄 Reset')
                .setStyle(ButtonStyle.Secondary)
        );
}

// ─────────────────────────────────────────────
// PAGE BUTTONS
// ─────────────────────────────────────────────

function createPageButtons(page) {

    const row = new ActionRowBuilder();

    if (page === 0) {

        row.addComponents(

            new ButtonBuilder()
                .setCustomId('personality_page_1')
                .setLabel('⚙️ Edit')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('personality_page_2')
                .setLabel('➡️ Page 2')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId('personality_back')
                .setLabel('↩️ Back')
                .setStyle(ButtonStyle.Secondary)
        );

    } else {

        row.addComponents(

            new ButtonBuilder()
                .setCustomId('personality_page_1')
                .setLabel('⬅️ Page 1')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId('personality_page_2')
                .setLabel('⚙️ Edit')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('personality_back')
                .setLabel('↩️ Back')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    return row;
}

// ─────────────────────────────────────────────
// EDIT MODAL
// ─────────────────────────────────────────────

function createPersonalityModal(page) {

    const traits = page === 0
        ? pageOne
        : pageTwo;

    const modal = new ModalBuilder()
        .setCustomId(
            `personality_modal_${page}`
        )
        .setTitle(
            `🦆 DuckAI — Page ${page + 1}`
        );

    for (const [key, emoji, name] of traits) {

        const input = new TextInputBuilder()
            .setCustomId(key)
            .setLabel(`${emoji} ${name} (0-100)`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(
                String(personalityValues[key])
            )
            .setMinLength(1)
            .setMaxLength(3)
            .setPlaceholder('0 - 100');

        modal.addComponents(
            new ActionRowBuilder()
                .addComponents(input)
        );
    }

    return modal;
}

// ─────────────────────────────────────────────
// PERSONALITY PROMPT
// ─────────────────────────────────────────────

function buildPersonalityPrompt() {

    return `
You are DuckAI, a cute and friendly AI duck.

Your personality is controlled by these levels:

🩷 Loving: ${personalityValues.loving}%
😊 Cheerful: ${personalityValues.cheerful}%
🧠 Realistic: ${personalityValues.realistic}%
😂 Funny: ${personalityValues.funny}%
🫶 Friendly: ${personalityValues.friendly}%
🧊 Serious: ${personalityValues.serious}%
😈 Playful: ${personalityValues.playful}%
🧘 Calm: ${personalityValues.calm}%
🔎 Curious: ${personalityValues.curious}%
✨ Spontaneous: ${personalityValues.spontaneous}%

Treat these percentages as relative personality tendencies.
Higher percentages mean that trait should appear more strongly.
Lower percentages mean that trait should appear less strongly.

You are affectionate, natural and easy to talk to.
You can give genuine opinions instead of always agreeing.
You can be playful and slightly teasing, while remaining appropriate.
You can be serious when the subject requires it.
Do not constantly mention that you are an AI.
Do not overuse emojis.
Occasionally use expressions such as "hehe", "aww", or "hmm".
Match the user's language.
Keep responses reasonably concise unless more detail is useful.
`;
}

// ─────────────────────────────────────────────
// CONVERSATIONS
// ─────────────────────────────────────────────

const conversations = new Set();
const histories = new Map();

function conversationKey(message) {
    return `${message.channel.id}:${message.author.id}`;
}

// ─────────────────────────────────────────────
// TRIGGERS
// ─────────────────────────────────────────────

function mentionsDuckAI(message) {

    const mentioned =
        message.mentions.has(client.user);

    const saysDuckAI =
        /\bduck\s*ai\b/i.test(message.content);

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

    const recentHistory =
        history.slice(-20);

    const response =
        await groq.chat.completions.create({

            model: 'openai/gpt-oss-20b',

            messages: [
                {
                    role: 'system',
                    content: buildPersonalityPrompt()
                },
                ...recentHistory
            ],

            temperature: 0.8,
            max_tokens: 500
        });

    const reply =
        response.choices?.[0]?.message?.content?.trim();

    if (!reply) {
        throw new Error(
            'Groq returned an empty response.'
        );
    }

    history.push({
        role: 'assistant',
        content: reply
    });

    if (history.length > 20) {
        history.splice(
            0,
            history.length - 20
        );
    }

    return reply;
}

// ─────────────────────────────────────────────
// SLASH COMMAND
// ─────────────────────────────────────────────

const customizeCommand =
    new SlashCommandBuilder()
        .setName('customize')
        .setDescription(
            'Customize DuckAI personality'
        );

// ─────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────

client.on(
    'interactionCreate',
    async interaction => {

        // ─────────────────────────────────────
        // /customize
        // ─────────────────────────────────────

        if (
            interaction.isChatInputCommand() &&
            interaction.commandName === 'customize'
        ) {

            await interaction.reply({
                embeds: [
                    createPersonalityEmbed(0)
                ],
                components: [
                    createMainButtons()
                ]
            });

            return;
        }

        // ─────────────────────────────────────
        // PAGE 1
        // ─────────────────────────────────────

        if (
            interaction.isButton() &&
            interaction.customId ===
                'personality_page_1'
        ) {

            // If this is the main "Edit Page 1"
            // button, open the modal.
            // If it is the navigation button,
            // also open the modal.
            await interaction.showModal(
                createPersonalityModal(0)
            );

            return;
        }

        // ─────────────────────────────────────
        // PAGE 2
        // ─────────────────────────────────────

        if (
            interaction.isButton() &&
            interaction.customId ===
                'personality_page_2'
        ) {

            await interaction.showModal(
                createPersonalityModal(1)
            );

            return;
        }

        // ─────────────────────────────────────
        // BACK
        // ─────────────────────────────────────

        if (
            interaction.isButton() &&
            interaction.customId ===
                'personality_back'
        ) {

            await interaction.update({
                embeds: [
                    createPersonalityEmbed(0)
                ],
                components: [
                    createMainButtons()
                ]
            });

            return;
        }

        // ─────────────────────────────────────
        // RESET
        // ─────────────────────────────────────

        if (
            interaction.isButton() &&
            interaction.customId ===
                'personality_reset'
        ) {

            personalityValues = {
                ...defaultPersonality
            };

            savePersonality();

            await interaction.update({
                embeds: [
                    createPersonalityEmbed(0)
                ],
                components: [
                    createMainButtons()
                ]
            });

            return;
        }

        // ─────────────────────────────────────
        // SAVE PAGE
        // ─────────────────────────────────────

        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith(
                'personality_modal_'
            )
        ) {

            const page =
                Number(
                    interaction.customId
                        .split('_')
                        .pop()
                );

            const traits =
                page === 0
                    ? pageOne
                    : pageTwo;

            const invalid = [];

            for (const [key] of traits) {

                const raw =
                    interaction.fields
                        .getTextInputValue(key)
                        .trim();

                const value = Number(raw);

                if (
                    !Number.isInteger(value) ||
                    value < 0 ||
                    value > 100
                ) {

                    invalid.push(key);
                    continue;
                }

                personalityValues[key] = value;
            }

            if (invalid.length > 0) {

                await interaction.reply({
                    content:
                        '❌ Please enter whole numbers between 0 and 100 for every trait.',
                    ephemeral: true
                });

                return;
            }

            savePersonality();

            await interaction.reply({
                content:
                    `🦆 Page ${page + 1} saved! 🤍`,
                embeds: [
                    createPersonalityEmbed(page)
                ],
                components: [
                    createPageButtons(page)
                ]
            });

            return;
        }
    }
);

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────

client.on(
    'messageCreate',
    async message => {

        // Ignore bots
        if (message.author.bot) return;

        const key =
            conversationKey(message);

        // ─────────────────────────────────────
        // START CONVERSATION
        // ─────────────────────────────────────

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

        // ─────────────────────────────────────
        // IGNORE OUTSIDE CONVERSATION
        // ─────────────────────────────────────

        if (!conversations.has(key)) return;

        // ─────────────────────────────────────
        // GOODBYE
        // ─────────────────────────────────────

        if (isGoodbye(message)) {

            conversations.delete(key);
            histories.delete(key);

            await message.reply(
                '🦆 Okay, bye bye! See you later 🤍'
            );

            return;
        }

        // ─────────────────────────────────────
        // AI
        // ─────────────────────────────────────

        try {

            await message.channel.sendTyping();

            const reply =
                await generateResponse(
                    message,
                    key
                );

            await message.reply(reply);

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

// ─────────────────────────────────────────────
// READY
// ─────────────────────────────────────────────

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

        try {

            await client.application.commands.set([
                customizeCommand
            ]);

            console.log(
                '✓ /customize registered.'
            );

        } catch (error) {

            console.error(
                '❌ Failed to register /customize:',
                error
            );
        }
    }
);

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

client.login(TOKEN);