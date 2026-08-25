// ============================================================
// DUCKAI READY HANDLER
// ============================================================

async function handleReady(client) {

    console.log(
        '────────────────────────────'
    );

    console.log(
        `🦆 DuckAI online as ${client.user.tag}`
    );

    console.log(
        `✓ Connected to ${client.guilds.cache.size} server(s)`
    );

    console.log(
        '────────────────────────────'
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleReady
};