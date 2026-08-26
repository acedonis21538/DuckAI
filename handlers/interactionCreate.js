```js
// ============================================================
// DUCKAI INTERACTION HANDLER
// ============================================================

const music =
    require('../capabilities/music');

const panel =
    require('../capabilities/music/panel');

// ============================================================
// HANDLE
// ============================================================

async function handleInteraction(interaction) {

    if (
        !interaction.isButton()
    ) {
        return;
    }

    if (
        !interaction.customId.startsWith('music_')
    ) {
        return;
    }

    try {

        const guildId =
            interaction.guildId;

        if (!guildId) {

            await interaction.reply({
                content:
                    '🦆 Este controlo só funciona num servidor.',
                ephemeral: true
            });

            return;
        }

        let result;

        // ====================================================
        // PLAY
        // ====================================================

        if (
            interaction.customId ===
            'music_play'
        ) {

            const song =
                music.getCurrentSong(
                    guildId
                );

            if (!song?.url) {

                await interaction.reply({
                    content:
                        '🎵 Não há nenhuma música selecionada.',
                    ephemeral: true
                });

                return;
            }

            result =
                await music.play({

                    guildId,

                    query:
                        song.query,

                    url:
                        song.url,

                    track:
                        song.track
                });
        }

        // ====================================================
        // PAUSE
        // ====================================================

        else if (
            interaction.customId ===
            'music_pause'
        ) {

            result =
                await music.pause({
                    guildId
                });
        }

        // ====================================================
        // RESUME
        // ====================================================

        else if (
            interaction.customId ===
            'music_resume'
        ) {

            result =
                await music.resume({
                    guildId
                });
        }

        // ====================================================
        // SKIP
        // ====================================================

        else if (
            interaction.customId ===
            'music_skip'
        ) {

            result =
                await music.skip({
                    guildId
                });
        }

        // ====================================================
        // STOP
        // ====================================================

        else if (
            interaction.customId ===
            'music_stop'
        ) {

            result =
                await music.stop({
                    guildId
                });
        }

        else {
            return;
        }

        // ====================================================
        // RESPONSE
        // ====================================================

        const response =
            music.responses.getResponse(
                result.action,
                result.success
            );

        await interaction.reply({

            content:
                response ||
                '🦆 Feito!',

            ephemeral: true
        });

        // ====================================================
        // UPDATE PANEL
        // ====================================================

        if (
            result.success &&
            interaction.message
        ) {

            await interaction.message
                .edit(
                    panel.buildMusicPanel(
                        guildId
                    )
                )
                .catch(
                    () => {}
                );
        }

    } catch (error) {

        console.error(
            '❌ Music interaction error:',
            error
        );

        const response = {

            content:
                '🦆 Ocorreu um erro ao controlar a música.',

            ephemeral: true
        };

        if (
            interaction.replied ||
            interaction.deferred
        ) {

            await interaction.followUp(
                response
            );

        } else {

            await interaction.reply(
                response
            );
        }
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleInteraction
};
```
