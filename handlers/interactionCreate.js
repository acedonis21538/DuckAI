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
                    '🦆 This control only works inside a server.',

                ephemeral:
                    true
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
                        '🎵 There is no song selected.',

                    ephemeral:
                        true
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

        let response;

        if (
            result?.success
        ) {

            switch (
                result.action
            ) {

                case 'play':

                    response =
                        '▶️ Playing the selected song.';

                    break;

                case 'pause':

                    response =
                        '⏸️ Music paused.';

                    break;

                case 'resume':

                    response =
                        '▶️ Music resumed.';

                    break;

                case 'skip':

                    response =
                        '⏭️ Song skipped.';

                    break;

                case 'stop':

                    response =
                        '⏹️ Music stopped.';

                    break;

                default:

                    response =
                        '🦆 Done.';

                    break;
            }

        } else {

            response =
                '🦆 I could not perform that action.';
        }

        // ====================================================
        // SEND INTERACTION RESPONSE
        // ====================================================

        await interaction.reply({

            content:
                response,

            ephemeral:
                true
        });

        // ====================================================
        // UPDATE PANEL
        // ====================================================

        if (
            result?.success &&
            interaction.message
        ) {

            await interaction.message
                .edit(
                    panel.buildMusicPanel(
                        guildId
                    )
                )
                .catch(
                    error => {

                        console.error(
                            '⚠️ Could not update music panel:',
                            error
                        );
                    }
                );
        }

    } catch (error) {

        console.error(
            '❌ Music interaction error:',
            error
        );

        const response = {

            content:
                '🦆 Something went wrong while controlling the music.',

            ephemeral:
                true
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