const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const music = require('./music');

function buildPanel(guildId) {

    const song =
        music.getCurrentSong(guildId);

    const state =
        music.getState(guildId);

    const embed =
        new EmbedBuilder()
            .setTitle('🦆 DuckAI Music')
            .setDescription(
                song
                    ? `🎵 **${song.title}**\n👤 ${song.artist || 'Unknown artist'}`
                    : '🎵 No song selected.'
            )
            .addFields({
                name: 'Status',
                value: `**${state}**`,
                inline: true
            });

    if (song?.artwork) {
        embed.setThumbnail(song.artwork);
    }

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('music_play')
                    .setLabel('Play')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId('music_pause')
                    .setLabel('Pause')
                    .setEmoji('⏸️')
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId('music_stop')
                    .setLabel('Stop')
                    .setEmoji('⏹️')
                    .setStyle(ButtonStyle.Danger)
            );

    return {
        embeds: [embed],
        components: [row]
    };
}

module.exports = {
    buildPanel
};