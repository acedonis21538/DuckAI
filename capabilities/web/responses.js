// ============================================================
// DUCKAI WEB RESPONSES
// ============================================================

const responses = {

    search: {
        success: [
            '🌐 Encontrei isto para ti!',
            '🦆🔎 Encontrei alguns resultados!',
            '🌐 Aqui estão os resultados da pesquisa.',
            '🦆 Fiz a pesquisa e encontrei isto!'
        ],

        empty: [
            '🦆 Não encontrei resultados para essa pesquisa.',
            '🌐 Hmm, não encontrei nada relevante.',
            '🦆 Parece que não encontrei resultados.'
        ],

        failed: [
            '🦆 Tive um problema ao fazer a pesquisa.',
            '🌐 A pesquisa falhou. Tenta novamente.',
            '🦆 Hmm, não consegui pesquisar isso agora.'
        ]
    }
};

// ============================================================
// RANDOM RESPONSE
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
            Math.random() * list.length
        )
    ];
}

// ============================================================
// GET RESPONSE
// ============================================================

function getResponse(result) {

    if (
        !result ||
        result.success === false
    ) {
        return randomResponse(
            responses.search.failed
        );
    }

    if (
        !result.results ||
        !result.results.length
    ) {
        return randomResponse(
            responses.search.empty
        );
    }

    return randomResponse(
        responses.search.success
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    responses,
    randomResponse,
    getResponse
};