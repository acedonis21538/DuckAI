// ============================================================
// DUCKAI INTERACTION HANDLER
// ============================================================

const {
    MessageFlags
} = require('discord.js');

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

        // ====================================================
        // GUILD
        // ====================================================

        const guildId =
            interaction.guildId;

        if (!guildId) {

            await interaction.reply({

                content:
                    '🦆 This control only works inside a server.',

                flags:
                    MessageFlags.Ephemeral
            });

            return;
        }

        // ====================================================
        // ACKNOWLEDGE IMMEDIATELY
        // ====================================================

        await interaction.deferReply({

            flags:
                MessageFlags.Ephemeral
        });

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

                await interaction.editReply({

                    content:
                        '🎵 There is no song selected.'
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

        // ====================================================
        // UNKNOWN MUSIC BUTTON
        // ====================================================

        else {

            await interaction.editReply({

                content:
                    '🦆 Unknown music control.'
            });

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
                result?.message ||
                '🦆 I could not perform that action.';
        }

        // ====================================================
        // SEND RESPONSE
        // ====================================================

        await interaction.editReply({

            content:
                response
        });

        // ====================================================
        // UPDATE MUSIC PANEL
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

        // ====================================================
        // ERROR RESPONSE
        // ====================================================

        try {

            if (
                interaction.deferred
            ) {

                await interaction.editReply({

                    content:
                        '🦆 Something went wrong while controlling the music.'
                });

            } else if (
                !interaction.replied
            ) {

                await interaction.reply({

                    content:
                        '🦆 Something went wrong while controlling the music.',

                    flags:
                        MessageFlags.Ephemeral
                });

            }

        } catch (
            responseError
        ) {

            console.error(
                '❌ Could not respond to interaction:',
                responseError
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
