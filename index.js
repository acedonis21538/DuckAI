```js
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
// PERSONALITY
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
// PERSONALITY TRAITS
// ─────────────────────────────────────────────

const traits = [
    {
        key: 'loving',
        emoji: '🩷',
        name: 'Loving'
    },
    {
        key: 'cheerful',
        emoji: '😊',
        name: 'Cheerful'
    },
    {
        key: 'realistic',
        emoji: '🧠',
        name: 'Realistic'
    },
    {
        key: 'funny',
        emoji: '😂',
        name: 'Funny'
    },
    {
        key: 'friendly',
        emoji: '🫶',
        name: 'Friendly'
    },
    {
        key: 'serious',
        emoji: '🧊',
        name: 'Serious'
    },
    {
        key: 'playful',
        emoji: '😈',
        name: 'Playful'
    },
    {
        key: 'calm',
        emoji: '🧘',
        name: 'Calm'
    },
    {
        key: 'curious',
        emoji: '🔎',
        name: 'Curious'
    },
    {
        key: 'spontaneous',
        emoji: '✨',
        name: 'Spontaneous'
    }
];

// ─────────────────────────────────────────────
// PERSONALITY PANEL
// ─────────────────────────────────────────────

function createPersonalityEmbed() {

    let description = '';

    for (const trait of traits) {
        description +=
            trait.emoji +
            ' **' +
            trait.name +
            '** — ' +
            personalityValues[trait.key] +
            '%\n';
    }

    return new EmbedBuilder()
        .setTitle('🦆 DuckAI Personality')
        .setDescription(
            description +
            '\nUse the buttons below to customize DuckAI.'
        )
        .setFooter({
            text: 'Every value can be set from 0% to 100%.'
        });
}

// ─────────────────────────────────────────────
// MAIN BUTTONS
// ─────────────────────────────────────────────

function createMainButtons() {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId('edit_page_1')
                .setLabel('⚙️ Edit Page 1')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('edit_page_2')
                .setLabel('⚙️ Edit Page 2')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('personality_reset')
                .setLabel('🔄 Reset')
                .setStyle(ButtonStyle.Secondary)
        );
}

// ─────────────────────────────────────────────
// PAGE MODALS
// ─────────────────────────────────────────────

function createPersonalityModal(page) {

    const start = page === 1 ? 0 : 5;
    const end = page === 1 ? 5 : 10;

    const modal = new ModalBuilder()
        .setCustomId(
            'personality_modal_' + page
        )
        .setTitle(
            '🦆 DuckAI - Page ' + page
        );

    for (let i = start; i < end; i++) {

        const trait = traits[i];

        const input = new TextInputBuilder()
            .setCustomId(trait.key)
            .setLabel(
                trait.emoji +
                ' ' +
                trait.name +
                ' (0-100)'
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(
                String(
                    personalityValues[trait.key]
                )
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
// AI PERSONALITY PROMPT
// ─────────────────────────────────────────────

function buildPersonalityPrompt() {

    return (
        'You are DuckAI, a cute and friendly AI duck.\n\n' +

        'Your personality levels are:\n' +

        'Loving: ' +
        personalityValues.loving +
        '%\n' +

        'Cheerful: ' +
        personalityValues.cheerful +
        '%\n' +

        'Realistic: ' +
        personalityValues.realistic +
        '%\n' +

        'Funny: ' +
        personalityValues.funny +
        '%\n' +

        'Friendly: ' +
        personalityValues.friendly +
        '%\n' +

        'Serious: ' +
        personalityValues.serious +
        '%\n' +

        'Playful: ' +
        personalityValues.playful +
        '%\n' +

        'Calm: ' +
        personalityValues.calm +
        '%\n' +

        'Curious: ' +
        personalityValues.curious +
        '%\n' +

        'Spontaneous: ' +
        personalityValues.spontaneous +
        '%\n\n' +

        'Higher percentages mean that trait should appear more strongly. ' +
        'Lower percentages mean that trait should appear less strongly.\n\n' +

        'Be affectionate, natural and easy to talk to.\n' +
        'Give genuine opinions instead of always agreeing.\n' +
        'Be playful and slightly teasing while remaining appropriate.\n' +
        'Be serious when the subject requires it.\n' +
        'Do not constantly mention that you are an AI.\n' +
        'Do not overuse emojis.\n' +
        'Occasionally use expressions such as "hehe", "aww", or "hmm".\n' +
        "Match the user's language.\n" +
        'Keep responses reasonably concise unless more detail is useful.'
    );
}

// ─────────────────────────────────────────────
// CONVERSATIONS
// ─────────────────────────────────────────────

const conversations = new Set();
const histories = new Map();

function conversationKey(message) {

    return (
        message.channel.id +
        ':' +
        message.author.id
    );
}

// ─────────────────────────────────────────────
// TRIGGERS
// ─────────────────────────────────────────────

function mentionsDuckAI(message) {

    const mentioned =
        message.mentions.has(client.user);

    const saysDuckAI =
        /\bduck\s*ai\b/i.test(
            message.content
        );

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
                    content:
                        buildPersonalityPrompt()
                },
                ...recentHistory
            ],

            temperature: 0.8,
            max_tokens: 500
        });

    const reply =
        response.choices &&
        response.choices[0] &&
        response.choices[0].message &&
        response.choices[0].message.content
            ? response.choices[0].message.content.trim()
            : '';

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
    async function (interaction) {

        // /customize

        if (
            interaction.isChatInputCommand() &&
            interaction.commandName === 'customize'
        ) {

            await interaction.reply({
                embeds: [
                    createPersonalityEmbed()
                ],
                components: [
                    createMainButtons()
                ]
            });

            return;
        }

        // EDIT PAGE 1

        if (
            interaction.isButton() &&
            interaction.customId === 'edit_page_1'
        ) {

            await interaction.showModal(
                createPersonalityModal(1)
            );

            return;
        }

        // EDIT PAGE 2

        if (
            interaction.isButton() &&
            interaction.customId === 'edit_page_2'
        ) {

            await interaction.showModal(
                createPersonalityModal(2)
            );

            return;
        }

        // RESET

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
                    createPersonalityEmbed()
                ],
                components: [
                    createMainButtons()
                ]
            });

            return;
        }

        // SAVE MODAL

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

            const start =
                page === 1 ? 0 : 5;

            const end =
                page === 1 ? 5 : 10;

            const invalid = [];

            for (
                let i = start;
                i < end;
                i++
            ) {

                const trait = traits[i];

                const raw =
                    interaction.fields
                        .getTextInputValue(
                            trait.key
                        )
                        .trim();

                const value = Number(raw);

                if (
                    !Number.isInteger(value) ||
                    value < 0 ||
                    value > 100
                ) {

                    invalid.push(
                        trait.name
                    );

                    continue;
                }

                personalityValues[
                    trait.key
                ] = value;
            }

            if (invalid.length > 0) {

                await interaction.reply({
                    content:
                        '❌ Invalid value for: ' +
                        invalid.join(', ') +
                        '. Use whole numbers from 0 to 100.',
                    ephemeral: true
                });

                return;
            }

            savePersonality();

            await interaction.reply({
                content:
                    '🦆 Personality updated! 🤍',
                embeds: [
                    createPersonalityEmbed()
                ],
                components: [
                    createMainButtons()
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
    async function (message) {

        if (message.author.bot) return;

        const key =
            conversationKey(message);

        // START CONVERSATION

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

        // IGNORE OUTSIDE CONVERSATION

        if (!conversations.has(key)) return;

        // GOODBYE

        if (isGoodbye(message)) {

            conversations.delete(key);
            histories.delete(key);

            await message.reply(
                '🦆 Okay, bye bye! See you later 🤍'
            );

            return;
        }

        // AI

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
    async function () {

        console.log(
            '────────────────────────────'
        );

        console.log(
            '🦆 DuckAI online as ' +
            client.user.tag
        );

        console.log(
            '────────────────────────────'
        );

        try {

            // Registers ONLY /customize
            // as the global command list.

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
```
