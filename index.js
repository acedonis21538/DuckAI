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
// PERSONALITY STORAGE
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
                JSON.stringify(
                    defaultPersonality,
                    null,
                    2
                )
            );

            return {
                ...defaultPersonality
            };
        }

        const data = JSON.parse(
            fs.readFileSync(
                personalityPath,
                'utf8'
            )
        );

        return {
            ...defaultPersonality,
            ...data
        };

    } catch (error) {

        console.error(
            '❌ Personality loading error:',
            error
        );

        return {
            ...defaultPersonality
        };
    }
}

let personalityValues =
    loadPersonality();

function savePersonality() {

    fs.writeFileSync(
        personalityPath,
        JSON.stringify(
            personalityValues,
            null,
            2
        )
    );
}

// ─────────────────────────────────────────────
// TRAITS
// ─────────────────────────────────────────────

const traits = {

    loving: {
        name: 'Loving',
        emoji: '🩷',
        description:
            'Warmth, affection and emotional closeness.'
    },

    cheerful: {
        name: 'Cheerful',
        emoji: '😊',
        description:
            'Positive, energetic and upbeat behavior.'
    },

    realistic: {
        name: 'Realistic',
        emoji: '🧠',
        description:
            'Honest, grounded and practical opinions.'
    },

    funny: {
        name: 'Funny',
        emoji: '😂',
        description:
            'Humor, jokes and witty observations.'
    },

    friendly: {
        name: 'Friendly',
        emoji: '🫶',
        description:
            'Approachable, welcoming and conversational.'
    },

    serious: {
        name: 'Serious',
        emoji: '🧊',
        description:
            'More thoughtful, direct and serious communication.'
    },

    playful: {
        name: 'Playful',
        emoji: '😈',
        description:
            'Teasing, playful energy and mischievous personality.'
    },

    calm: {
        name: 'Calm',
        emoji: '🧘',
        description:
            'Relaxed, patient and composed behavior.'
    },

    curious: {
        name: 'Curious',
        emoji: '🔎',
        description:
            'Interest in the user and their ideas.'
    },

    spontaneous: {
        name: 'Spontaneous',
        emoji: '✨',
        description:
            'Natural, unpredictable and less repetitive responses.'
    }
};

// ─────────────────────────────────────────────
// PERSONALITY DESCRIPTION
// ─────────────────────────────────────────────

function getIntensity(value) {

    if (value <= 15) {
        return 'very low';
    }

    if (value <= 35) {
        return 'low';
    }

    if (value <= 55) {
        return 'moderate';
    }

    if (value <= 75) {
        return 'high';
    }

    if (value <= 90) {
        return 'very high';
    }

    return 'extremely high';
}

function buildTraitInstruction(
    key,
    value
) {

    const trait = traits[key];

    return (
        trait.name +
        ' (' +
        value +
        '% — ' +
        getIntensity(value) +
        '): ' +
        trait.description
    );
}

// ─────────────────────────────────────────────
// AI PERSONALITY PROMPT
// ─────────────────────────────────────────────

function buildPersonalityPrompt() {

    let prompt =
        'You are DuckAI, a cute and friendly AI duck.\n\n';

    prompt +=
        'PERSONALITY CONFIGURATION\n' +
        'The following values control how strongly each trait should influence your behavior.\n' +
        'Treat them as behavioral tendencies, not as rigid rules.\n\n';

    for (const key of Object.keys(traits)) {

        prompt +=
            '- ' +
            buildTraitInstruction(
                key,
                personalityValues[key]
            ) +
            '\n';
    }

    prompt +=
        '\nBEHAVIOR RULES\n' +
        '- Adapt your personality naturally to the context.\n' +
        '- Do not force a personality trait into every response.\n' +
        '- Serious subjects should remain appropriately serious.\n' +
        '- Give genuine opinions instead of automatically agreeing.\n' +
        '- Be natural and conversational.\n' +
        '- Do not constantly mention that you are an AI.\n' +
        '- Do not overuse emojis.\n' +
        '- Occasionally use expressions such as "hehe", "aww", or "hmm".\n' +
        "- Match the user's language.\n" +
        '- Avoid repetitive responses.\n' +
        '- Keep responses reasonably concise unless more detail is useful.';

    return prompt;
}

// ─────────────────────────────────────────────
// PERSONALITY PANEL
// ─────────────────────────────────────────────

function createPersonalityEmbed() {

    let description =
        '### 🦆 Personality Settings\n' +
        'Customize how DuckAI behaves in conversations.\n\n';

    for (const key of Object.keys(traits)) {

        const trait = traits[key];
        const value =
            personalityValues[key];

        let bar = '';

        const filled =
            Math.round(value / 10);

        for (let i = 0; i < 10; i++) {

            bar +=
                i < filled
                    ? '▰'
                    : '▱';
        }

        description +=
            trait.emoji +
            ' **' +
            trait.name +
            '**\n' +
            '`' +
            bar +
            '` **' +
            value +
            '%**\n' +
            trait.description +
            '\n\n';
    }

    return new EmbedBuilder()
        .setColor(0x9BE7FF)
        .setTitle('🦆 DuckAI • Personality')
        .setDescription(
            description
        )
        .setFooter({
            text:
                'Use Edit Personality to change the values.'
        });
}

// ─────────────────────────────────────────────
// PANEL BUTTONS
// ─────────────────────────────────────────────

function createPanelButtons() {

    return [

        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        'personality_edit_1'
                    )
                    .setLabel(
                        '🩷 Edit 1–5'
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        'personality_edit_2'
                    )
                    .setLabel(
                        '✨ Edit 6–10'
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    )
            ),

        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        'personality_reset'
                    )
                    .setLabel(
                        '↻ Reset'
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            )
    ];
}

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────

function createPersonalityModal(
    page
) {

    const keys =
        Object.keys(traits);

    const start =
        page === 1
            ? 0
            : 5;

    const end =
        page === 1
            ? 5
            : 10;

    const modal =
        new ModalBuilder()
            .setCustomId(
                'personality_modal_' +
                page
            )
            .setTitle(
                '🦆 DuckAI • Edit ' +
                page +
                '/2'
            );

    for (
        let i = start;
        i < end;
        i++
    ) {

        const key = keys[i];
        const trait = traits[key];

        const input =
            new TextInputBuilder()
                .setCustomId(key)
                .setLabel(
                    trait.emoji +
                    ' ' +
                    trait.name +
                    ' • 0–100'
                )
                .setStyle(
                    TextInputStyle.Short
                )
                .setRequired(true)
                .setValue(
                    String(
                        personalityValues[key]
                    )
                )
                .setPlaceholder(
                    'Enter a value from 0 to 100'
                )
                .setMinLength(1)
                .setMaxLength(3);

        modal.addComponents(
            new ActionRowBuilder()
                .addComponents(input)
        );
    }

    return modal;
}

// ─────────────────────────────────────────────
// CONVERSATION MEMORY
// ─────────────────────────────────────────────

const conversations =
    new Set();

const histories =
    new Map();

function conversationKey(
    message
) {

    return (
        message.channel.id +
        ':' +
        message.author.id
    );
}

// ─────────────────────────────────────────────
// TRIGGER
// ─────────────────────────────────────────────

function mentionsDuckAI(
    message
) {

    const mentioned =
        message.mentions.has(
            client.user
        );

    const saysDuckAI =
        /\bduck\s*ai\b/i.test(
            message.content
        );

    return mentioned ||
        saysDuckAI;
}

// ─────────────────────────────────────────────
// GOODBYE
// ─────────────────────────────────────────────

function isGoodbye(
    message
) {

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

    return goodbyes.includes(
        text
    );
}

// ─────────────────────────────────────────────
// AI RESPONSE
// ─────────────────────────────────────────────

async function generateResponse(
    message,
    key
) {

    if (!histories.has(key)) {

        histories.set(
            key,
            []
        );
    }

    const history =
        histories.get(key);

    history.push({
        role: 'user',
        content:
            message.content
    });

    const recentHistory =
        history.slice(-20);

    const response =
        await groq.chat.completions.create({

            model:
                'openai/gpt-oss-20b',

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
// /CUSTOMIZE
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
    async function (
        interaction
    ) {

        // /customize

        if (
            interaction.isChatInputCommand() &&
            interaction.commandName ===
                'customize'
        ) {

            await interaction.reply({

                embeds: [
                    createPersonalityEmbed()
                ],

                components:
                    createPanelButtons()
            });

            return;
        }

        // EDIT PAGE 1

        if (
            interaction.isButton() &&
            interaction.customId ===
                'personality_edit_1'
        ) {

            await interaction.showModal(
                createPersonalityModal(1)
            );

            return;
        }

        // EDIT PAGE 2

        if (
            interaction.isButton() &&
            interaction.customId ===
                'personality_edit_2'
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

            personalityValues =
                {
                    ...defaultPersonality
                };

            savePersonality();

            await interaction.update({

                embeds: [
                    createPersonalityEmbed()
                ],

                components:
                    createPanelButtons()
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

            const keys =
                Object.keys(traits);

            const start =
                page === 1
                    ? 0
                    : 5;

            const end =
                page === 1
                    ? 5
                    : 10;

            const invalid = [];

            for (
                let i = start;
                i < end;
                i++
            ) {

                const key =
                    keys[i];

                const raw =
                    interaction.fields
                        .getTextInputValue(
                            key
                        )
                        .trim();

                const value =
                    Number(raw);

                if (
                    !Number.isInteger(
                        value
                    ) ||
                    value < 0 ||
                    value > 100
                ) {

                    invalid.push(
                        traits[key].name
                    );

                    continue;
                }

                personalityValues[key] =
                    value;
            }

            if (
                invalid.length > 0
            ) {

                await interaction.reply({

                    content:
                        '❌ Invalid value for: ' +
                        invalid.join(', ') +
                        '. Use numbers from 0 to 100.',

                    ephemeral: true
                });

                return;
            }

            savePersonality();

            await interaction.reply({

                content:
                    '🦆 Personality updated successfully! 🤍',

                embeds: [
                    createPersonalityEmbed()
                ],

                components:
                    createPanelButtons()
            });
        }
    }
);

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────

client.on(
    'messageCreate',
    async function (
        message
    ) {

        if (
            message.author.bot
        ) {
            return;
        }

        const key =
            conversationKey(
                message
            );

        // START

        if (
            mentionsDuckAI(
                message
            )
        ) {

            conversations.add(
                key
            );

            if (
                !histories.has(key)
            ) {

                histories.set(
                    key,
                    []
                );
            }

            await message.reply(
                '🦆 Heyyy! DuckAI is here 🤍'
            );

            return;
        }

        // IGNORE

        if (
            !conversations.has(
                key
            )
        ) {
            return;
        }

        // GOODBYE

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

            await message.reply(
                '🦆 Okay, bye bye! See you later 🤍'
            );

            return;
        }

        // AI

        try {

            await message.channel
                .sendTyping();

            const reply =
                await generateResponse(
                    message,
                    key
                );

            await message.reply(
                reply
            );

        } catch (
            error
        ) {

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

            await client.application
                .commands.set([
                    customizeCommand
                ]);

            console.log(
                '✓ /customize registered.'
            );

        } catch (
            error
        ) {

            console.error(
                '❌ Failed to register commands:',
                error
            );
        }
    }
);

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

client.login(
    TOKEN
);