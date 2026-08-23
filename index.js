require('dotenv').config();

const {
    Client,
    SlashCommandBuilder,
    REST,
    Routes
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
    intents: []
});

// ─────────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────────

const commands = [
    new SlashCommandBuilder()
        .setName('duckai')
        .setDescription('Talk to DuckAI')
        .setIntegrationTypes(1) // USER_INSTALL
        .setContexts(0, 1, 2)   // Guild, Bot DM, Private Channel
        .toJSON()
];

// ─────────────────────────────────────────────
// REGISTER COMMANDS
// ─────────────────────────────────────────────

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('Registering commands...');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log('✓ Commands registered.');
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
}

// ─────────────────────────────────────────────
// READY
// ─────────────────────────────────────────────

client.once('ready', async () => {
    console.log('────────────────────────────');
    console.log(`🦆 DuckAI online as ${client.user.tag}`);
    console.log('────────────────────────────');

    await registerCommands();
});

// ─────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'duckai') {

        await interaction.reply(
            '🦆 Heyyy! DuckAI is here 🤍'
        );
    }
});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

client.login(TOKEN);