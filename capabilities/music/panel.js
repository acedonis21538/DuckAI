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

function buildMusicPanel(
    guildId
) {

    const song =
        music.getCurrentSong(
            guildId
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                '🦆 DuckAI Music'
            )
            .setDescription(
                song
                    ? (
                        `🎵 **${song.title || song.query}**\n` +
                        `👤 ${song.artist || 'Unknown artist'}`
                    )
                    : '🎵 Nenhuma música a tocar.'
            );

    if (
        song?.track?.artwork?.['150x150']
    ) {

        embed.setThumbnail(
            song.track.artwork[
                '150x150'
            ]
        );
    }

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        'music_pause'
                    )
                    .setEmoji('⏸️')
                    .setLabel('Pause')
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        'music_resume'
                    )
                    .setEmoji('▶️')
                    .setLabel('Resume')
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        'music_skip'
                    )
                    .setEmoji('⏭️')
                    .setLabel('Skip')
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        'music_stop'
                    )
                    .setEmoji('⏹️')
                    .setLabel('Stop')
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );

    return {

        embeds: [
            embed
        ],

        components: [
            row
        ]
    };
}

// ============================================================
// SHOW
// ============================================================

async function showMusicPanel(
    message
) {

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

async function updateMusicPanel(
    message
) {

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