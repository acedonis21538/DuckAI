'use strict';

// ============================================================
// DUCKAI — DISCORD MUSIC PANEL
// ============================================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

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
// PANEL COLOR
// ============================================================

const PANEL_COLOR =
    0x5865F2;

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

function statusText(
    state,
    connected
) {

    let playback;

    switch (state) {

        case 'playing':
            playback = '🟢 Playing';
            break;

        case 'paused':
            playback = '🟡 Paused';
            break;

        default:
            playback = '🔴 Stopped';
            break;
    }

    const voice =
        connected
            ? '🔊 Connected to Voice'
            : '⚪ Not connected';

    return `${playback}\n${voice}`;
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
        position

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
                '🦆 DuckAI Music'
            );

    if (song) {

        embed.setDescription(
            [
                `🎵 **${song.title}**`,
                `👤 ${song.artist || 'Unknown artist'}`
            ].join('\n')
        );

        if (song.artwork) {

            embed.setThumbnail(
                song.artwork
            );
        }

        if (song.duration) {

            embed.addFields({

                name:
                    'Duration',

                value:
                    formatTime(
                        song.duration
                    ),

                inline:
                    true
            });
        }

        if (position > 0) {

            embed.addFields({

                name:
                    'Position',

                value:
                    formatTime(
                        position
                    ),

                inline:
                    true
            });
        }

    } else {

        embed.setDescription(
            '🎵 **No song selected.**'
        );
    }

    embed.addFields({

        name:
            'Status',

        value:
            statusText(
                state,
                connected
            ),

        inline:
            false
    });

    embed.setFooter({

        text:
            'DuckAI Music • Discord Voice'
    });

    // ========================================================
    // PLAYBACK
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
                        !song
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
// CRITICAL:
//
// Discord interactions must be acknowledged within the
// interaction window.
//
// We ALWAYS defer FIRST.
//
// Only after that do we connect to Voice / start FFmpeg.
//
// ============================================================

async function handleInteraction(
    interaction
) {

    // --------------------------------------------------------
    // Validate
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
        !customId.startsWith('music:')
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
    // ACKNOWLEDGE IMMEDIATELY
    // ========================================================

    try {

        if (
            !interaction.deferred &&
            !interaction.replied
        ) {

            await interaction.deferUpdate();
        }

    } catch (error) {

        console.error(
            '❌ Could not acknowledge music button:',
            error
        );

        return true;
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

        switch (customId) {

            // ----------------------------------------------
            // PLAY
            // ----------------------------------------------

            case BUTTON.PLAY:

                result =
                    await music.play(
                        interaction,
                        guildId
                    );

                break;

            // ----------------------------------------------
            // PAUSE
            // ----------------------------------------------

            case BUTTON.PAUSE:

                result =
                    music.pause(
                        guildId
                    );

                break;

            // ----------------------------------------------
            // RESUME
            // ----------------------------------------------

            case BUTTON.RESUME:

                result =
                    music.resume(
                        guildId
                    );

                break;

            // ----------------------------------------------
            // STOP
            // ----------------------------------------------

            case BUTTON.STOP:

                result =
                    music.stop(
                        guildId
                    );

                break;

            // ----------------------------------------------
            // LEAVE
            // ----------------------------------------------

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

            // ----------------------------------------------
            // REFRESH
            // ----------------------------------------------

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
    // UPDATE ORIGINAL PANEL
    // ========================================================

    try {

        await interaction.editReply(
            buildPanel(
                guildId
            )
        );

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

    const minutes =
        Math.floor(
            total / 60
        );

    const secondsPart =
        String(
            total % 60
        )
            .padStart(
                2,
                '0'
            );

    return `${minutes}:${secondsPart}`;
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