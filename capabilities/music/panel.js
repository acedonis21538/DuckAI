'use strict';

// ============================================================
// DUCKAI — DISCORD MUSIC PANEL
// ============================================================
//
// Visual/control layer for DuckAI Music.
//
// RESPONSIBILITIES:
//
// • Build the Discord music panel
// • Display current track
// • Display playback state
// • Display queue
// • Provide music controls
// • Handle music button interactions
// • Update the existing panel
//
// DOES NOT:
//
// • Search YouTube
// • Extract YouTube audio
// • Spawn FFmpeg
// • Create Voice connections
// • Own playback state
// • Register interactionCreate listeners
//
// All actual music operations belong to music.js.
//
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
// PANEL CONFIG
// ============================================================

const PANEL_COLOR =
    0xEF233C;

const PANEL_TITLE =
    '🦆 DuckAI Music';

const PANEL_FOOTER =
    'DuckAI Music • YouTube • Discord Voice';

// ============================================================
// BUTTON IDS
// ============================================================

const BUTTON = {

    TOGGLE:
        'music:toggle',

    SKIP:
        'music:skip',

    STOP:
        'music:stop',

    REPEAT:
        'music:repeat',

    LEAVE:
        'music:leave',

    VOLUME_DOWN:
        'music:volume_down',

    VOLUME_UP:
        'music:volume_up',

    REMOVE_PREFIX:
        'music:remove:'
};

// ============================================================
// LIMITS
// ============================================================

const MAX_QUEUE_DISPLAY =
    8;

const MAX_TITLE_LENGTH =
    70;

const MAX_ARTIST_LENGTH =
    40;

// ============================================================
// SAFE STRING
// ============================================================

function safeString(
    value,
    fallback = ''
) {

    if (
        typeof value !== 'string'
    ) {

        return fallback;
    }

    const clean =
        value
            .replace(/\s+/g, ' ')
            .trim();

    return clean || fallback;
}

// ============================================================
// ESCAPE DISCORD MARKDOWN
// ============================================================

function escapeMarkdown(
    value
) {

    return safeString(
        value
    )
        .replace(/\\/g, '\\\\')
        .replace(/([*_~`|])/g, '\\$1');
}

// ============================================================
// TRUNCATE
// ============================================================

function truncate(
    value,
    length
) {

    const text =
        safeString(
            value
        );

    if (
        text.length <= length
    ) {

        return text;
    }

    return (
        text.slice(
            0,
            Math.max(
                1,
                length - 1
            )
        ) +
        '…'
    );
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

    const remainingSeconds =
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
            `${hours}:${String(minutes).padStart(2, '0')}:${remainingSeconds}`
        );
    }

    return (
        `${minutes}:${remainingSeconds}`
    );
}

// ============================================================
// GET MUSIC STATE
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

            channelId:
                state?.channelId ||
                null,

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
                    : 1,

            repeat:
                Boolean(
                    state?.repeat
                ),

            queue:
                Array.isArray(
                    state?.queue
                )
                    ? state.queue
                    : []
        };

    } catch (error) {

        console.error(
            '❌ Could not read music state:',
            error
        );

        return {

            song: null,

            state:
                'stopped',

            connected:
                false,

            channelId:
                null,

            position:
                0,

            volume:
                1,

            repeat:
                false,

            queue: []
        };
    }
}

// ============================================================
// PLAYBACK STATUS
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

        case 'loading':
            return '🔵 Loading';

        default:
            return '⚪ Stopped';
    }
}

// ============================================================
// TOGGLE BUTTON
// ============================================================
//
// One button.
//
// PLAYING → Pause
// PAUSED  → Resume
// STOPPED → Play
//
// ============================================================

function buildToggleButton(
    state,
    song
) {

    let emoji =
        '▶️';

    let label =
        'Play';

    let style =
        ButtonStyle.Success;

    if (
        state === 'playing'
    ) {

        emoji =
            '⏸️';

        label =
            'Pause';

        style =
            ButtonStyle.Secondary;
    }

    else if (
        state === 'paused'
    ) {

        emoji =
            '▶️';

        label =
            'Resume';

        style =
            ButtonStyle.Primary;
    }

    return new ButtonBuilder()
        .setCustomId(
            BUTTON.TOGGLE
        )
        .setEmoji(
            emoji
        )
        .setLabel(
            label
        )
        .setStyle(
            style
        )
        .setDisabled(
            !song
        );
}

// ============================================================
// SKIP BUTTON
// ============================================================

function buildSkipButton(
    song
) {

    return new ButtonBuilder()
        .setCustomId(
            BUTTON.SKIP
        )
        .setEmoji(
            '⏭️'
        )
        .setLabel(
            'Skip'
        )
        .setStyle(
            ButtonStyle.Primary
        )
        .setDisabled(
            !song
        );
}

// ============================================================
// STOP BUTTON
// ============================================================

function buildStopButton(
    song
) {

    return new ButtonBuilder()
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
        );
}

// ============================================================
// REPEAT BUTTON
// ============================================================

function buildRepeatButton(
    repeat
) {

    return new ButtonBuilder()
        .setCustomId(
            BUTTON.REPEAT
        )
        .setEmoji(
            repeat
                ? '🔂'
                : '🔁'
        )
        .setLabel(
            repeat
                ? 'Repeat On'
                : 'Repeat'
        )
        .setStyle(
            repeat
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
        );
}

// ============================================================
// LEAVE BUTTON
// ============================================================

function buildLeaveButton(
    connected
) {

    return new ButtonBuilder()
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
        );
}

// ============================================================
// VOLUME BUTTONS
// ============================================================

function buildVolumeButtons() {

    return [

        new ButtonBuilder()
            .setCustomId(
                BUTTON.VOLUME_DOWN
            )
            .setEmoji(
                '🔉'
            )
            .setLabel(
                'Volume'
            )
            .setStyle(
                ButtonStyle.Secondary
            ),

        new ButtonBuilder()
            .setCustomId(
                BUTTON.VOLUME_UP
            )
            .setEmoji(
                '🔊'
            )
            .setLabel(
                '+'
            )
            .setStyle(
                ButtonStyle.Secondary
            )
    ];
}

// ============================================================
// QUEUE ITEM
// ============================================================

function buildQueueLine(
    song,
    index
) {

    const title =
        truncate(
            escapeMarkdown(
                song?.title ||
                'Unknown title'
            ),
            MAX_TITLE_LENGTH
        );

    const artist =
        truncate(
            escapeMarkdown(
                song?.artist ||
                'Unknown artist'
            ),
            MAX_ARTIST_LENGTH
        );

    const duration =
        Number.isFinite(
            song?.duration
        )
            ? ` • ${formatTime(song.duration)}`
            : '';

    return (
        `**${index + 1}.** ${title} — ${artist}${duration}`
    );
}

// ============================================================
// QUEUE
// ============================================================

function buildQueueSection(
    queue
) {

    if (
        !Array.isArray(queue) ||
        queue.length === 0
    ) {

        return {
            name:
                '📋 Queue',

            value:
                'The queue is empty.',

            inline:
                false
        };
    }

    const visible =
        queue.slice(
            0,
            MAX_QUEUE_DISPLAY
        );

    const lines =
        visible.map(
            (
                song,
                index
            ) =>
                buildQueueLine(
                    song,
                    index
                )
        );

    if (
        queue.length >
        MAX_QUEUE_DISPLAY
    ) {

        lines.push(
            `*…and ${queue.length - MAX_QUEUE_DISPLAY} more*`
        );
    }

    return {

        name:
            `📋 Queue • ${queue.length}`,

        value:
            lines.join('\n'),

        inline:
            false
    };
}

// ============================================================
// REMOVE QUEUE BUTTONS
// ============================================================
//
// Discord allows max 5 buttons per row.
// Therefore we expose the first few removable queue items.
//
// ============================================================

function buildQueueRemoveRows(
    queue
) {

    if (
        !Array.isArray(queue) ||
        queue.length === 0
    ) {

        return [];
    }

    const rows = [];

    const removable =
        queue.slice(
            0,
            10
        );

    for (
        let i = 0;
        i < removable.length;
        i += 5
    ) {

        const chunk =
            removable.slice(
                i,
                i + 5
            );

        const row =
            new ActionRowBuilder();

        for (
            let index = 0;
            index < chunk.length;
            index++
        ) {

            const absoluteIndex =
                i + index;

            row.addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `${BUTTON.REMOVE_PREFIX}${absoluteIndex}`
                    )
                    .setEmoji(
                        '❌'
                    )
                    .setLabel(
                        String(
                            absoluteIndex + 1
                        )
                    )
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );
        }

        rows.push(
            row
        );
    }

    return rows;
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

        channelId,

        position,

        volume,

        repeat,

        queue

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
    // CURRENT SONG
    // ========================================================

    if (
        song
    ) {

        const title =
            truncate(
                escapeMarkdown(
                    song.title ||
                    'Unknown title'
                ),
                100
            );

        const artist =
            truncate(
                escapeMarkdown(
                    song.artist ||
                    'Unknown artist'
                ),
                100
            );

        const currentDuration =
            Number.isFinite(
                song.duration
            )
                ? formatTime(
                    song.duration
                )
                : '—';

        const currentPosition =
            formatTime(
                position
            );

        embed.setDescription(
            [
                `🎵 **${title}**`,
                `👤 ${artist}`,
                '',
                `\`${currentPosition} / ${currentDuration}\``
            ].join('\n')
        );

        if (
            typeof song.artwork === 'string' &&
            song.artwork.trim()
        ) {

            embed.setThumbnail(
                song.artwork
            );
        }

    } else {

        embed.setDescription(
            [
                '🎵 **Nothing selected**',
                '',
                'Ask DuckAI for a song to add it to the queue.'
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

    const volumePercent =
        Math.round(
            Math.max(
                0,
                Math.min(
                    1,
                    volume
                )
            ) * 100
        );

    const voiceText =
        connected && channelId
            ? `${voiceStatus} • <#${channelId}>`
            : voiceStatus;

    embed.addFields(

        {

            name:
                'Status',

            value:
                `${getPlaybackStatus(state)} • ${voiceText}`,

            inline:
                false
        },

        {

            name:
                '🔊 Volume',

            value:
                `${volumePercent}%`,

            inline:
                true
        },

        {

            name:
                '🔁 Repeat',

            value:
                repeat
                    ? 'Enabled'
                    : 'Disabled',

            inline:
                true
        },

        buildQueueSection(
            queue
        )
    );

    // ========================================================
    // MAIN CONTROLS
    // ========================================================

    const mainControls =
        new ActionRowBuilder()
            .addComponents(

                buildToggleButton(
                    state,
                    song
                ),

                buildSkipButton(
                    song
                ),

                buildStopButton(
                    song
                ),

                buildRepeatButton(
                    repeat
                ),

                buildLeaveButton(
                    connected
                )
            );

    // ========================================================
    // VOLUME
    // ========================================================

    const volumeControls =
        new ActionRowBuilder()
            .addComponents(
                ...buildVolumeButtons()
            );

    // ========================================================
    // QUEUE REMOVE BUTTONS
    // ========================================================

    const queueRemoveRows =
        buildQueueRemoveRows(
            queue
        );

    // Discord max = 5 component rows.
    //
    // Keep:
    // 1. main
    // 2. volume
    // 3-4. queue removal
    //
    const components = [

        mainControls,

        volumeControls,

        ...queueRemoveRows.slice(
            0,
            2
        )
    ];

    // ========================================================
    // FOOTER
    // ========================================================

    embed.setFooter({

        text:
            PANEL_FOOTER
    });

    return {

        embeds: [
            embed
        ],

        components
    };
}

// ============================================================
// SAFE ERROR RESPONSE
// ============================================================

async function sendError(
    interaction,
    message
) {

    if (
        !interaction
    ) {

        return;
    }

    try {

        const payload = {

            content:
                message,

            ephemeral:
                true
        };

        if (
            interaction.replied ||
            interaction.deferred
        ) {

            await interaction.followUp(
                payload
            );

            return;
        }

        await interaction.reply(
            payload
        );

    } catch (error) {

        if (
            error?.code === 40060 ||
            error?.code === 10062
        ) {

            return;
        }

        console.error(
            '❌ Music panel error response failed:',
            error
        );
    }
}

// ============================================================
// GET REMOVE INDEX
// ============================================================

function getRemoveIndex(
    customId
) {

    if (
        typeof customId !== 'string'
    ) {

        return null;
    }

    if (
        !customId.startsWith(
            BUTTON.REMOVE_PREFIX
        )
    ) {

        return null;
    }

    const raw =
        customId.slice(
            BUTTON.REMOVE_PREFIX.length
        );

    const index =
        Number(
            raw
        );

    if (
        !Number.isInteger(index) ||
        index < 0
    ) {

        return null;
    }

    return index;
}

// ============================================================
// HANDLE TOGGLE
// ============================================================

async function handleToggle(
    interaction,
    guildId
) {

    const state =
        music.getState(
            guildId
        );

    if (
        state?.state === 'playing'
    ) {

        return music.pause(
            guildId
        );
    }

    if (
        state?.state === 'paused'
    ) {

        return music.resume(
            guildId
        );
    }

    return music.play(
        interaction,
        guildId
    );
}

// ============================================================
// HANDLE VOLUME
// ============================================================

function changeVolume(
    guildId,
    amount
) {

    const state =
        music.getState(
            guildId
        );

    const current =
        Number.isFinite(
            state?.volume
        )
            ? state.volume
            : 1;

    return music.setVolume(
        guildId,
        current + amount
    );
}

// ============================================================
// HANDLE REMOVE
// ============================================================

function removeQueueItem(
    guildId,
    index
) {

    if (
        typeof music.removeFromQueue !==
        'function'
    ) {

        return {

            success: false,

            message:
                '🦆 Queue removal is not available yet.'
        };
    }

    return music.removeFromQueue(
        guildId,
        index
    );
}

// ============================================================
// HANDLE INTERACTION
// ============================================================
//
// interactionCreate.js should call this.
//
// This module does NOT register the Discord event.
//
// ============================================================

async function handleInteraction(
    interaction
) {

    if (
        !interaction ||
        typeof interaction.isButton !== 'function' ||
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
            '🦆 This music panel only works inside a server.'
        );

        return true;
    }

    // ========================================================
    // ACK
    // ========================================================

    try {

        if (
            !interaction.replied &&
            !interaction.deferred
        ) {

            await interaction.deferUpdate();
        }

    } catch (error) {

        if (
            error?.code === 10062 ||
            error?.code === 40060
        ) {

            return true;
        }

        console.error(
            '❌ Could not acknowledge music button:',
            error
        );

        return true;
    }

    // ========================================================
    // ACTION
    // ========================================================

    let result = {

        success:
            true
    };

    try {

        // ----------------------------------------------------
        // TOGGLE
        // ----------------------------------------------------

        if (
            customId ===
            BUTTON.TOGGLE
        ) {

            result =
                await handleToggle(
                    interaction,
                    guildId
                );
        }

        // ----------------------------------------------------
        // SKIP
        // ----------------------------------------------------

        else if (
            customId ===
            BUTTON.SKIP
        ) {

            if (
                typeof music.skip !==
                'function'
            ) {

                result = {

                    success:
                        false,

                    message:
                        '🦆 Skip is not available yet.'
                };

            } else {

                result =
                    await music.skip(
                        guildId
                    );
            }
        }

        // ----------------------------------------------------
        // STOP
        // ----------------------------------------------------

        else if (
            customId ===
            BUTTON.STOP
        ) {

            result =
                music.stop(
                    guildId
                );
        }

        // ----------------------------------------------------
        // REPEAT
        // ----------------------------------------------------

        else if (
            customId ===
            BUTTON.REPEAT
        ) {

            if (
                typeof music.toggleRepeat !==
                'function'
            ) {

                result = {

                    success:
                        false,

                    message:
                        '🦆 Repeat is not available yet.'
                };

            } else {

                result =
                    music.toggleRepeat(
                        guildId
                    );
            }
        }

        // ----------------------------------------------------
        // LEAVE
        // ----------------------------------------------------

        else if (
            customId ===
            BUTTON.LEAVE
        ) {

            result =
                music.leave(
                    guildId
                );
        }

        // ----------------------------------------------------
        // VOLUME DOWN
        // ----------------------------------------------------

        else if (
            customId ===
            BUTTON.VOLUME_DOWN
        ) {

            result =
                changeVolume(
                    guildId,
                    -0.10
                );
        }

        // ----------------------------------------------------
        // VOLUME UP
        // ----------------------------------------------------

        else if (
            customId ===
            BUTTON.VOLUME_UP
        ) {

            result =
                changeVolume(
                    guildId,
                    0.10
                );
        }

        // ----------------------------------------------------
        // REMOVE QUEUE ITEM
        // ----------------------------------------------------

        else if (
            customId.startsWith(
                BUTTON.REMOVE_PREFIX
            )
        ) {

            const index =
                getRemoveIndex(
                    customId
                );

            if (
                index === null
            ) {

                result = {

                    success:
                        false,

                    message:
                        '🦆 Invalid queue item.'
                };

            } else {

                result =
                    removeQueueItem(
                        guildId,
                        index
                    );
            }
        }

        // ----------------------------------------------------
        // UNKNOWN
        // ----------------------------------------------------

        else {

            return true;
        }

    } catch (error) {

        console.error(
            `❌ Music panel action failed [${customId}]:`,
            error
        );

        result = {

            success:
                false,

            message:
                '🦆 Something went wrong while controlling the music player.'
        };
    }

    // ========================================================
    // UPDATE PANEL
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
    // ERROR
    // ========================================================

    if (
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
        !message ||
        typeof message.edit !==
            'function'
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

    formatTime,

    getPlaybackStatus
};