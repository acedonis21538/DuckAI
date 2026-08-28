'use strict';

// ============================================================
// DUCKAI — DISCORD MUSIC PANEL
// ============================================================
//
// • Elegant music control panel
// • Safe interaction handling
// • Supports already-acknowledged interactions
// • Does not depend on editReply() to update the panel
// • Keeps the existing music engine untouched
//
// ============================================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActivityType
} =
    require('discord.js');

const music =
    require('./music');

// ============================================================
// BUTTON IDS
// ============================================================

const BUTTON = {

    PLAY:
        'music:play',

    PAUSE:
        'music:pause',

    RESUME:
        'music:resume',

    STOP:
        'music:stop',

    LEAVE:
        'music:leave',

    REFRESH:
        'music:refresh'
};

// ============================================================
// PANEL CONFIG
// ============================================================

const PANEL_COLOR =
    0x5865F2;

const PANEL_TITLE =
    '🦆 DuckAI Music';

// ============================================================
// STATE
// ============================================================

function getState(
    guildId
) {

    try {

        const state =
            music.getState(
                guildId
            );

        return {

            song:
                state?.song ||
                null,

            state:
                state?.state ||
                'stopped',

            connected:
                Boolean(
                    state?.connected
                ),

            position:
                Number.isFinite(
                    state?.position
                )
                    ? state.position
                    : 0,

            volume:
                Number.isFinite(
                    state?.volume
                )
                    ? state.volume
                    : 1
        };

    } catch (error) {

        console.error(
            '❌ Music state error:',
            error
        );

        return {

            song:
                null,

            state:
                'stopped',

            connected:
                false,

            position:
                0,

            volume:
                1
        };
    }
}

// ============================================================
// STATUS
// ============================================================

function getPlaybackStatus(
    state
) {

    switch (
        state
    ) {

        case 'playing':
            return '🟢 Playing';

        case 'paused':
            return '🟡 Paused';

        default:
            return '🔴 Stopped';
    }
}

// ============================================================
// FORMAT TIME
// ============================================================

function formatTime(
    seconds
) {

    const value =
        Number(
            seconds
        );

    if (
        !Number.isFinite(value) ||
        value < 0
    ) {

        return '0:00';
    }

    const total =
        Math.floor(
            value
        );

    const hours =
        Math.floor(
            total / 3600
        );

    const minutes =
        Math.floor(
            (total % 3600) / 60
        );

    const secondsPart =
        String(
            total % 60
        ).padStart(
            2,
            '0'
        );

    if (
        hours > 0
    ) {

        return `${hours}:${String(minutes).padStart(2, '0')}:${secondsPart}`;
    }

    return `${minutes}:${secondsPart}`;
}

// ============================================================
// BUILD PANEL
// ============================================================

function buildPanel(
    guildId
) {

    const {

        song,
        state,
        connected,
        position,
        volume

    } =
        getState(
            guildId
        );

    const embed =
        new EmbedBuilder()
            .setColor(
                PANEL_COLOR
            )
            .setTitle(
                PANEL_TITLE
            )
            .setTimestamp();

    // ========================================================
    // SONG
    // ========================================================

    if (
        song
    ) {

        const source =
            typeof song.source === 'string' &&
            song.source.trim()
                ? song.source.trim()
                : 'unknown';

        const sourceLabel =
            source === 'youtube'
                ? 'YouTube'
                : source === 'audius'
                    ? 'Audius'
                    : source;

        const description = [

            `🎵 **${song.title || 'Unknown title'}**`,

            `👤 ${song.artist || 'Unknown artist'}`,

            `📡 ${sourceLabel}`
        ];

        embed.setDescription(
            description.join(
                '\n'
            )
        );

        if (
            song.artwork
        ) {

            embed.setThumbnail(
                song.artwork
            );
        }

        // ----------------------------------------------------
        // TRACK INFO
        // ----------------------------------------------------

        const trackFields = [];

        if (
            Number.isFinite(
                song.duration
            ) &&
            song.duration > 0
        ) {

            trackFields.push({

                name:
                    '⏱ Duration',

                value:
                    formatTime(
                        song.duration
                    ),

                inline:
                    true
            });
        }

        trackFields.push({

            name:
                '🔊 Volume',

            value:
                `${Math.round(
                    Math.max(
                        0,
                        Math.min(
                            1,
                            volume
                        )
                    ) * 100
                )}%`,

            inline:
                true
        });

        if (
            Number.isFinite(position) &&
            position > 0
        ) {

            trackFields.push({

                name:
                    '⏭ Position',

                value:
                    formatTime(
                        position
                    ),

                inline:
                    true
            });
        }

        if (
            trackFields.length
        ) {

            embed.addFields(
                trackFields
            );
        }

    } else {

        embed.setDescription(
            [
                '🎵 **Nothing is playing**',
                '',
                'Use the music command to search for a song.'
            ].join(
                '\n'
            )
        );
    }

    // ========================================================
    // STATUS
    // ========================================================

    const voiceStatus =
        connected
            ? '🔊 Connected'
            : '⚪ Not connected';

    embed.addFields({

        name:
            'Status',

        value:
            `${getPlaybackStatus(state)} • ${voiceStatus}`,

        inline:
            false
    });

    // ========================================================
    // CONTROLS
    // ========================================================

    const playback =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        BUTTON.PLAY
                    )
                    .setEmoji(
                        '▶️'
                    )
                    .setLabel(
                        'Play'
                    )
                    .setStyle(
                        ButtonStyle.Success
                    )
                    .setDisabled(
                        !song ||
                        state === 'playing'
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        BUTTON.PAUSE
                    )
                    .setEmoji(
                        '⏸️'
                    )
                    .setLabel(
                        'Pause'
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(
                        state !== 'playing'
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        BUTTON.RESUME
                    )
                    .setEmoji(
                        '▶️'
                    )
                    .setLabel(
                        'Resume'
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    )
                    .setDisabled(
                        state !== 'paused'
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        BUTTON.STOP
                    )
                    .setEmoji(
                        '⏹️'
                    )
                    .setLabel(
                        'Stop'
                    )
                    .setStyle(
                        ButtonStyle.Danger
                    )
                    .setDisabled(
                        !song
                    )
            );

    // ========================================================
    // UTILITY
    // ========================================================

    const utility =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        BUTTON.LEAVE
                    )
                    .setEmoji(
                        '👋'
                    )
                    .setLabel(
                        'Leave'
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(
                        !connected
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        BUTTON.REFRESH
                    )
                    .setEmoji(
                        '🔄'
                    )
                    .setLabel(
                        'Refresh'
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );

    // ========================================================
    // FOOTER
    // ========================================================

    embed.setFooter({

        text:
            'DuckAI Music • Discord Voice'
    });

    return {

        embeds: [

            embed
        ],

        components: [

            playback,

            utility
        ]
    };
}

// ============================================================
// HANDLE INTERACTION
// ============================================================
//
// IMPORTANT:
//
// The interaction may already have been acknowledged by another
// handler/capability.
//
// In that case:
//
// • DO NOT call deferUpdate() again.
// • Continue normally.
// • Update interaction.message directly.
//
// ============================================================

async function handleInteraction(
    interaction
) {

    // --------------------------------------------------------
    // VALIDATE
    // --------------------------------------------------------

    if (
        !interaction ||
        !interaction.isButton()
    ) {

        return false;
    }

    const customId =
        interaction.customId;

    if (
        typeof customId !== 'string' ||
        !customId.startsWith(
            'music:'
        )
    ) {

        return false;
    }

    const guildId =
        interaction.guildId;

    if (
        !guildId
    ) {

        try {

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({

                    content:
                        '🦆 This music panel can only be used inside a server.',

                    ephemeral:
                        true
                });
            }

        } catch (error) {

            console.error(
                '❌ Failed to answer invalid music interaction:',
                error
            );
        }

        return true;
    }

    // ========================================================
    // ACKNOWLEDGE SAFELY
    // ========================================================

    try {

        // Only acknowledge if nobody already did.

        if (
            !interaction.replied &&
            !interaction.deferred
        ) {

            await interaction.deferUpdate();

        } else {

            console.log(
                `ℹ️ Music interaction already acknowledged: ${customId}`
            );
        }

    } catch (error) {

        // 40060 means another handler already acknowledged it.
        //
        // We DO NOT stop the action in that case.

        if (
            error?.code === 40060
        ) {

            console.log(
                `ℹ️ Music interaction was already acknowledged: ${customId}`
            );

        } else {

            console.error(
                '❌ Could not acknowledge music button:',
                error
            );

            return true;
        }
    }

    console.log(
        `🎛️ MUSIC PANEL CLICK: ${customId}`
    );

    // ========================================================
    // EXECUTE ACTION
    // ========================================================

    let result = {

        success:
            true
    };

    try {

        switch (
            customId
        ) {

            // ------------------------------------------------
            // PLAY
            // ------------------------------------------------

            case BUTTON.PLAY:

                result =
                    await music.play(
                        interaction,
                        guildId
                    );

                break;

            // ------------------------------------------------
            // PAUSE
            // ------------------------------------------------

            case BUTTON.PAUSE:

                result =
                    music.pause(
                        guildId
                    );

                break;

            // ------------------------------------------------
            // RESUME
            // ------------------------------------------------

            case BUTTON.RESUME:

                result =
                    music.resume(
                        guildId
                    );

                break;

            // ------------------------------------------------
            // STOP
            // ------------------------------------------------

            case BUTTON.STOP:

                result =
                    music.stop(
                        guildId
                    );

                break;

            // ------------------------------------------------
            // LEAVE
            // ------------------------------------------------

            case BUTTON.LEAVE:

                result =
                    typeof music.leave ===
                    'function'

                        ? music.leave(
                            guildId
                        )

                        : {

                            success:
                                false,

                            message:
                                '👋 Leave is not available.'
                        };

                break;

            // ------------------------------------------------
            // REFRESH
            // ------------------------------------------------

            case BUTTON.REFRESH:

                result = {

                    success:
                        true
                };

                break;

            default:

                return true;
        }

    } catch (error) {

        console.error(
            `❌ Music action failed [${customId}]:`,
            error
        );

        result = {

            success:
                false,

            message:
                '🦆 Something went wrong while controlling the player.'
        };
    }

    // ========================================================
    // UPDATE PANEL MESSAGE
    // ========================================================
    //
    // IMPORTANT:
    //
    // We edit the original panel message directly instead of
    // interaction.editReply().
    //
    // This prevents conflicts when another handler has already
    // acknowledged the interaction.
    //
    // ========================================================

    try {

        if (
            interaction.message &&
            typeof interaction.message.edit ===
                'function'
        ) {

            await interaction.message.edit(
                buildPanel(
                    guildId
                )
            );

        } else if (
            !interaction.replied &&
            !interaction.deferred
        ) {

            await interaction.reply(
                buildPanel(
                    guildId
                )
            );
        }

    } catch (error) {

        console.error(
            '❌ Could not update music panel:',
            error
        );
    }

    // ========================================================
    // ERROR FEEDBACK
    // ========================================================

    if (
        result?.success === false &&
        result.message
    ) {

        try {

            await interaction.followUp({

                content:
                    result.message,

                ephemeral:
                    true
            });

        } catch (error) {

            console.error(
                '❌ Could not send music error:',
                error
            );
        }
    }

    return true;
}

// ============================================================
// SEND PANEL
// ============================================================

async function sendPanel(
    channel
) {

    const guildId =
        channel?.guild?.id;

    if (
        !guildId
    ) {

        throw new Error(
            'Music panel requires a guild channel.'
        );
    }

    const message =
        await channel.send(
            buildPanel(
                guildId
            )
        );

    return message;
}

// ============================================================
// UPDATE PANEL
// ============================================================

async function updatePanel(
    message
) {

    const guildId =
        message?.guildId ||
        message?.guild?.id;

    if (
        !guildId
    ) {

        return false;
    }

    try {

        await message.edit(
            buildPanel(
                guildId
            )
        );

        return true;

    } catch (error) {

        console.error(
            '❌ Music panel update failed:',
            error
        );

        return false;
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    BUTTON,

    buildPanel,

    handleInteraction,

    sendPanel,

    updatePanel,

    formatTime
};