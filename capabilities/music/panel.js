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
                        `👤 ${song.artist || 'Artista desconhecido'}\n` +
                        `\n${getStateText(state)}`
                    )
                    : '🎵 Nenhuma música selecionada.'
            );

    if (
        song?.track?.artwork?.['150x150']
    ) {

        embed.setThumbnail(
            song.track.artwork['150x150']
        );
    }

    const buttons = [];

    if (song) {

        if (state === 'playing') {

            buttons.push(
                new ButtonBuilder()
                    .setCustomId('music_pause')
                    .setEmoji('⏸️')
                    .setLabel('Pause')
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );

        } else {

            buttons.push(
                new ButtonBuilder()
                    .setCustomId('music_play')
                    .setEmoji('▶️')
                    .setLabel('Tocar')
                    .setStyle(
                        ButtonStyle.Success
                    )
            );
        }

        if (state === 'paused') {

            buttons.push(
                new ButtonBuilder()
                    .setCustomId('music_resume')
                    .setEmoji('▶️')
                    .setLabel('Resume')
                    .setStyle(
                        ButtonStyle.Success
                    )
            );
        }

        buttons.push(
            new ButtonBuilder()
                .setCustomId('music_skip')
                .setEmoji('⏭️')
                .setLabel('Skip')
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId('music_stop')
                .setEmoji('⏹️')
                .setLabel('Stop')
                .setStyle(
                    ButtonStyle.Danger
                )
        );
    }

    const components = [];

    if (buttons.length) {

        components.push(
            new ActionRowBuilder()
                .addComponents(
                    buttons
                )
        );
    }

    return {
        embeds: [embed],
        components
    };
}

// ============================================================
// STATE TEXT
// ============================================================

function getStateText(state) {

    switch (state) {

        case 'playing':
            return '▶️ A tocar';

        case 'paused':
            return '⏸️ Em pausa';

        default:
            return '⏹️ Parada';
    }
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