'use strict';

// ============================================================
// DUCKAI — DISCORD MUSIC PANEL
// ============================================================
//
// • Elegant music control panel
// • Safe interaction handling
// • Prevents duplicate interaction processing
// • Updates the existing panel message directly
// • Keeps the music engine untouched
//
// ============================================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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
    0xEF233C;

const PANEL_TITLE =
    '🦆 DuckAI Music';

// ============================================================
// INTERACTION LOCK
// ============================================================
//
// Discord interaction IDs are unique.
//
// This prevents the same interaction from being processed
// twice by the application.
//
// ============================================================

const handledInteractions =
    new Set();

const HANDLED_TTL =
    60 * 1000;

function claimInteraction(
    interaction
) {

    const id =
        interaction?.id;

    if (
        !id
    ) {

        return true;
    }

    if (
        handledInteractions.has(
            id
        )
    ) {

        return false;
    }

    handledInteractions.add(
        id
    );

    setTimeout(
        () => {

            handledInteractions.delete(
                id
            );

        },
        HANDLED_TTL
    ).unref();

    return true;
}

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

        return (
            `${hours}:${String(minutes).padStart(2, '0')}:${secondsPart}`
        );
    }

    return (
        `${minutes}:${secondsPart}`
    );
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
            );

    // ========================================================
    // SONG
    // ========================================================

    if (
        song
    ) {

        const source =
            typeof song.source ===
                'string' &&
            song.source.trim()
                ? song.source.trim()
                : 'unknown';

        const sourceLabel =
            source === 'youtube'
                ? 'YouTube'
                : source === 'audius'
                    ? 'Audius'
                    : source;

        embed.setDescription(
            [
                `🎵 **${song.title || 'Unknown title'}**`,
                `👤 ${song.artist || 'Unknown artist'}`,
                `📡 ${sourceLabel}`
            ].join('\n')
        );

        if (
            song.artwork
        ) {

            embed.setThumbnail(
                song.artwork
            );
        }

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
            ].join('\n')
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
// SAFE ERROR RESPONSE
// ============================================================

async function sendError(
    interaction,
    message
) {

    try {

        if (
            interaction.deferred ||
            interaction.replied
        ) {

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

        if (
            error?.code ===
            40060
        ) {

            console.log(
                `ℹ️ Interaction already acknowledged: ${interaction?.customId || interaction?.id}`
            );

            return;
        }

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
            '❌ Could not send music interaction error:',
            error
        );
    }
}

// ============================================================
// HANDLE INTERACTION
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

        await sendError(
            interaction,
            '🦆 This music panel can only be used inside a server.'
        );

        return true;
    }

    // ========================================================
    // DUPLICATE PROTECTION
    // ========================================================
    //
    // This happens BEFORE ACKNOWLEDGING or executing anything.
    //
    // ========================================================

    if (
        !claimInteraction(
            interaction
        )
    ) {

        console.log(
            `ℹ️ Ignoring duplicate music interaction: ${customId}`
        );

        return true;
    }

    console.log(
        `🎛️ MUSIC PANEL CLICK: ${customId}`
    );

    // ========================================================
    // ACKNOWLEDGE ONCE
    // ========================================================

    let acknowledged =
        false;

    try {

        if (
            !interaction.replied &&
            !interaction.deferred
        ) {

            await interaction.deferUpdate();

            acknowledged =
                true;

        } else {

            // Another valid handler already acknowledged it.
            acknowledged =
                true;

            console.log(
                `ℹ️ Interaction already acknowledged: ${customId}`
            );
        }

    } catch (error) {

        if (
            error?.code ===
            40060
        ) {

            // Someone else won the race.
            acknowledged =
                true;

            console.log(
                `ℹ️ Interaction was acknowledged elsewhere: ${customId}`
            );

        } else {

            console.error(
                '❌ Could not acknowledge music button:',
                error
            );

            return true;
        }
    }

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

            case BUTTON.PLAY:

                result =
                    await music.play(
                        interaction,
                        guildId
                    );

                break;

            case BUTTON.PAUSE:

                result =
                    music.pause(
                        guildId
                    );

                break;

            case BUTTON.RESUME:

                result =
                    music.resume(
                        guildId
                    );

                break;

            case BUTTON.STOP:

                result =
                    music.stop(
                        guildId
                    );

                break;

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
    // UPDATE EXISTING PANEL MESSAGE
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
        acknowledged &&
        result?.success === false &&
        result.message
    ) {

        await sendError(
            interaction,
            result.message
        );
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

    return channel.send(
        buildPanel(
            guildId
        )
    );
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
        !guildId ||
        !message
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