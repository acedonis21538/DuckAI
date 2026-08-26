// ============================================================
// DUCKAI MUSIC PANEL
// ============================================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const music =
    require('./index');

// ============================================================
// PLAYER URL
// ============================================================

const PLAYER_URL =
    process.env.PLAYER_URL ||
    'http://localhost:3000';

// ============================================================
// BUILD
// ============================================================

function buildMusicPanel(guildId) {

    const song =
        music.getCurrentSong(guildId);

    const state =
        music.getState(guildId);

    const embed =
        new EmbedBuilder()
            .setTitle('🦆 DuckAI Music')
            .setDescription(
                song
                    ? (
                        `🎵 **${song.title || song.query}**\n` +
                        `👤 ${song.artist || 'Unknown artist'}\n\n` +
                        `Status: **${state}**`
                    )
                    : '🎵 No song selected.'
            );

    if (
        song?.track?.artwork?.['150x150']
    ) {

        embed.setThumbnail(
            song.track.artwork['150x150']
        );
    }

    const row =
        new ActionRowBuilder();

    // ========================================================
    // OPEN WEB PLAYER
    // ========================================================

    if (song?.url) {

        const playerUrl =
            `${PLAYER_URL.replace(/\/$/, '')}` +
            `/player?guildId=${encodeURIComponent(guildId)}`;

        row.addComponents(

            new ButtonBuilder()
                .setLabel('Open Player')
                .setEmoji('🎵')
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    playerUrl
                )
        );

    } else {

        row.addComponents(

            new ButtonBuilder()
                .setLabel('Open Player')
                .setEmoji('🎵')
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(true)
        );
    }

    // ========================================================
    // PAUSE
    // ========================================================

    row.addComponents(

        new ButtonBuilder()
            .setCustomId('music_pause')
            .setEmoji('⏸️')
            .setLabel('Pause')
            .setStyle(
                ButtonStyle.Secondary
            )
    );

    // ========================================================
    // RESUME
    // ========================================================

    row.addComponents(

        new ButtonBuilder()
            .setCustomId('music_resume')
            .setEmoji('▶️')
            .setLabel('Resume')
            .setStyle(
                ButtonStyle.Success
            )
    );

    // ========================================================
    // SKIP
    // ========================================================

    row.addComponents(

        new ButtonBuilder()
            .setCustomId('music_skip')
            .setEmoji('⏭️')
            .setLabel('Skip')
            .setStyle(
                ButtonStyle.Primary
            )
    );

    // ========================================================
    // STOP
    // ========================================================

    row.addComponents(

        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji('⏹️')
            .setLabel('Stop')
            .setStyle(
                ButtonStyle.Danger
            )
    );

    return {
        embeds: [embed],
        components: [row]
    };
}

// ============================================================
// SHOW
// ============================================================

async function showMusicPanel(message) {

    if (!message) {
        return null;
    }

    return message.reply(
        buildMusicPanel(
            message.guildId
        )
    );
}

// ============================================================
// UPDATE
// ============================================================

async function updateMusicPanel(message) {

    if (!message) {
        return null;
    }

    return message.edit(
        buildMusicPanel(
            message.guildId
        )
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    buildMusicPanel,
    showMusicPanel,
    updateMusicPanel
};