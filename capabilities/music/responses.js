// ============================================================
// DUCKAI MUSIC RESPONSES
// ============================================================

const responses = {

    play: {
        success: [
            '🎵 A tocar **{song}**!',
            '🦆🎶 Já está a tocar **{song}**!',
            '🎵 Feito! Meti **{song}** a tocar.',
            '🦆 Boa, **{song}** já está a tocar!'
        ],

        failed: [
            '🦆 Não consegui encontrar essa música.',
            '🎵 Hmm, não consegui encontrar essa.',
            '🦆 Não consegui preparar essa música.'
        ]
    },

    pause: {
        success: [
            '⏸️ Música pausada.',
            '🦆 Pausei a música.',
            '⏸️ Está em pausa.'
        ],

        failed: [
            '🦆 Não há nenhuma música a tocar.'
        ]
    },

    resume: {
        success: [
            '▶️ Música retomada!',
            '🦆🎵 Voltamos à música!',
            '▶️ Continuei a reprodução.'
        ],

        failed: [
            '🦆 Não há nenhuma música pausada.'
        ]
    },

    stop: {
        success: [
            '⏹️ Música parada.',
            '🦆 Parei a música.',
            '⏹️ Feito, parei a reprodução.'
        ],

        failed: [
            '🦆 Não há nenhuma música a tocar.'
        ]
    },

    skip: {
        success: [
            '⏭️ Música terminada!',
            '🦆⏭️ Saltei a música.',
            '🎵 Feito, saltei.'
        ],

        failed: [
            '🦆 Não há nenhuma música para saltar.'
        ]
    }
};

// ============================================================
// RANDOM
// ============================================================

function randomResponse(list = []) {
    if (
        !Array.isArray(list) ||
        !list.length
    ) {
        return '';
    }

    return list[
        Math.floor(
            Math.random() *
            list.length
        )
    ];
}

// ============================================================
// FORMAT
// ============================================================

function formatResponse(
    template,
    values = {}
) {
    if (!template) {
        return '';
    }

    return template.replace(
        /\{(\w+)\}/g,
        (match, key) =>
            values[key] !== undefined
                ? String(values[key])
                : match
    );
}

// ============================================================
// GET RESPONSE
// ============================================================

function getResponse(
    action,
    success,
    values = {}
) {
    const actionResponses =
        responses[action];

    if (!actionResponses) {
        return '';
    }

    const list =
        success
            ? actionResponses.success
            : actionResponses.failed;

    return formatResponse(
        randomResponse(list),
        values
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    responses,
    randomResponse,
    formatResponse,
    getResponse
};