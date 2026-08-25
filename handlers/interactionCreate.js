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

async function handleInteraction(
    interaction
) {

    if (
        !interaction.isButton()
    ) {
        return;
    }

    if (
        !interaction.customId.startsWith(
            'music_'
        )
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

        switch (
            interaction.customId
        ) {

            case 'music_pause':

                result =
                    await music.pause({
                        guildId
                    });

                break;

            case 'music_resume':

                result =
                    await music.resume({
                        guildId
                    });

                break;

            case 'music_skip':

                result =
                    await music.skip({
                        guildId
                    });

                break;

            case 'music_stop':

                result =
                    await music.stop({
                        guildId
                    });

                break;

            default:
                return;
        }

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

        // ----------------------------------------------------
        // UPDATE PANEL
        // ----------------------------------------------------

        if (
            interaction.message &&
            result.success
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