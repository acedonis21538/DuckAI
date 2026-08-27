'use strict';

// ============================================================
// DUCKAI — UNIVERSAL INTERACTION HANDLER
// ============================================================
//
// One central interaction handler.
//
// Currently handles:
// • DuckAI music panel buttons
//
// index.js remains untouched.
// Music capability does NOT create Discord listeners.
//
// ============================================================

const musicPanel =
    require('../capabilities/music/panel');

// ============================================================
// EXECUTE
// ============================================================

async function execute(
    interaction
) {

    if (
        !interaction
    ) {

        return;
    }

    // ========================================================
    // MUSIC BUTTONS
    // ========================================================

    if (
        interaction.isButton() &&
        typeof interaction.customId === 'string' &&
        interaction.customId.startsWith('music:')
    ) {

        console.log(
            `🎛️ MUSIC PANEL CLICK: ${interaction.customId}`
        );

        try {

            await musicPanel.handleInteraction(
                interaction
            );

        } catch (error) {

            console.error(
                '❌ Music panel interaction error:',
                error
            );

            try {

                if (
                    interaction.deferred ||
                    interaction.replied
                ) {

                    await interaction.followUp({

                        content:
                            '🦆 Something went wrong with the music controls.',

                        ephemeral:
                            true
                    });

                } else {

                    await interaction.reply({

                        content:
                            '🦆 Something went wrong with the music controls.',

                        ephemeral:
                            true
                    });
                }

            } catch (replyError) {

                console.error(
                    '⚠️ Could not send interaction error:',
                    replyError
                );
            }
        }

        return;
    }

    // ========================================================
    // OTHER INTERACTIONS
    // ========================================================
    //
    // Future capabilities can be dispatched here.
    //
    // ========================================================
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    name:
        'interactionCreate',

    once:
        false,

    execute
};