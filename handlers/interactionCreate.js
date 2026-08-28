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
// IMPORTANT:
//
// • This file does NOT create Discord listeners.
// • index.js remains untouched.
// • Music capability does NOT create listeners.
// • The same Discord interaction is processed only once.
//
// ============================================================

// ============================================================
// IMPORTS
// ============================================================

const musicPanel =
    require('../capabilities/music/panel');

// ============================================================
// PROCESSED INTERACTIONS
// ============================================================
//
// Protects against the same interaction reaching this handler
// more than once.
//
// Discord interaction IDs are unique.
//
// ============================================================

const processedInteractions =
    new Set();

// Keep the set from growing forever.

const PROCESSED_TTL =
    60 * 1000;

// ============================================================
// MARK INTERACTION AS PROCESSED
// ============================================================

function markInteraction(
    interaction
) {

    const interactionId =
        interaction?.id;

    if (
        !interactionId
    ) {

        return true;
    }

    if (
        processedInteractions.has(
            interactionId
        )
    ) {

        return false;
    }

    processedInteractions.add(
        interactionId
    );

    setTimeout(
        () => {

            processedInteractions.delete(
                interactionId
            );

        },
        PROCESSED_TTL
    ).unref();

    return true;
}

// ============================================================
// SAFE ERROR RESPONSE
// ============================================================

async function sendInteractionError(
    interaction,
    message
) {

    try {

        if (
            interaction.deferred ||
            interaction.replied
        ) {

            // The interaction already has an initial response.
            // followUp() is valid here.

            await interaction.followUp({

                content:
                    message,

                ephemeral:
                    true
            });

            return;
        }

        await interaction.reply({

            content:
                message,

            ephemeral:
                true
        });

    } catch (error) {

        // 40060 = interaction was already acknowledged somewhere
        // else. There is nothing more to acknowledge.

        if (
            error?.code ===
            40060
        ) {

            console.log(
                `ℹ️ Interaction already acknowledged: ${interaction?.customId || interaction?.id}`
            );

            return;
        }

        // 10062 = interaction expired / unknown interaction.

        if (
            error?.code ===
            10062
        ) {

            console.warn(
                `⚠️ Interaction expired: ${interaction?.customId || interaction?.id}`
            );

            return;
        }

        console.error(
            '⚠️ Could not send interaction error:',
            error
        );
    }
}

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

        // ----------------------------------------------------
        // DUPLICATE PROTECTION
        // ----------------------------------------------------
        //
        // This must happen BEFORE calling panel.handleInteraction().
        //
        // If the same interaction reaches this handler twice,
        // only the first execution is allowed to continue.
        //
        // ----------------------------------------------------

        if (
            !markInteraction(
                interaction
            )
        ) {

            console.log(
                `ℹ️ Ignoring duplicate music interaction: ${interaction.customId}`
            );

            return;
        }

        console.log(
            `🎛️ MUSIC PANEL CLICK: ${interaction.customId}`
        );

        try {

            // ------------------------------------------------
            // SINGLE HANDOFF
            // ------------------------------------------------

            await musicPanel.handleInteraction(
                interaction
            );

        } catch (error) {

            console.error(
                '❌ Music panel interaction error:',
                error
            );

            await sendInteractionError(

                interaction,

                '🦆 Something went wrong with the music controls.'
            );
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