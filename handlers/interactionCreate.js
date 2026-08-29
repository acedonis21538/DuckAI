'use strict';

// ============================================================
// DUCKAI — UNIVERSAL INTERACTION HANDLER
// ============================================================
//
// Central dispatcher for Discord interactions.
//
// RULES:
//
// • This file registers NO Discord listeners.
// • start.js registers this handler once.
// • This file only routes interactions.
// • Capabilities own their interaction lifecycle.
//
// ============================================================

// ============================================================
// IMPORTS
// ============================================================

const musicPanel =
    require(
        '../capabilities/music/panel'
    );

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
        typeof interaction.customId ===
            'string' &&
        interaction.customId.startsWith(
            'music:'
        )
    ) {

        console.log(
            `🎛️ MUSIC INTERACTION → ${interaction.customId}`
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

            // The panel owns acknowledgement.
            // Only attempt an error response if Discord
            // has not already received one.

            try {

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {

                    await interaction.reply({

                        content:
                            '🦆 Something went wrong with the music controls.',

                        ephemeral:
                            true
                    });
                }

            } catch (
                responseError
            ) {

                if (
                    responseError?.code !==
                    40060
                ) {

                    console.error(
                        '⚠️ Could not send interaction error:',
                        responseError
                    );
                }
            }
        }

        return;
    }

    // ========================================================
    // FUTURE CAPABILITIES
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