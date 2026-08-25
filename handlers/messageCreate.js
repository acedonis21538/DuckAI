// ============================================================
// DUCKAI MESSAGE HANDLER
// ============================================================

const {
    getConversationKey,
    startConversation,
    endConversation,
    isConversationActive
} = require('../core/context');

const router =
    require('../core/router');

// ============================================================
// HANDLE MESSAGE
// ============================================================

async function handleMessage(message) {

    if (message.author.bot) {
        return;
    }

    const mentioned =
        message.mentions.has(
            message.client.user
        );

    const saysDuckAI =
        /\bduck\s*ai\b/i.test(
            message.content
        );

    // ========================================================
    // START CONVERSATION
    // ========================================================

    if (
        mentioned ||
        saysDuckAI
    ) {
        startConversation(
            message
        );

        await message.reply(
            '🦆 Heyyy! DuckAI is here 🤍'
        );

        return;
    }

    // ========================================================
    // IGNORE INACTIVE CONVERSATIONS
    // ========================================================

    if (
        !isConversationActive(
            message
        )
    ) {
        return;
    }

    const text =
        message.content
            .toLowerCase()
            .trim()
            .replace(
                /[.!?,;]+$/g,
                ''
            );

    // ========================================================
    // GOODBYES
    // ========================================================

    const goodbyes = [
        'bye',
        'bye bye',
        'ok bye',
        'okay bye',
        'goodbye',
        'good bye',
        'see you',
        'see ya',
        'cya',
        'later',
        'gotta go',
        'i gotta go',
        'i have to go',
        'talk to you later'
    ];

    if (
        goodbyes.includes(
            text
        )
    ) {
        endConversation(
            message
        );

        await message.reply(
            '🦆 Okay, bye bye! See you later 🤍'
        );

        return;
    }

    // ========================================================
    // ROUTER
    // ========================================================

    try {

        await message.channel.sendTyping();

        const result =
            await router.route(
                message
            );

        if (
            !result ||
            !result.response
        ) {
            return;
        }

        if (result.file) {

            await message.reply({
                content:
                    result.response,

                files: [
                    result.file
                ]
            });

        } else {

            await message.reply(
                result.response
            );
        }

    } catch (error) {

        console.error(
            '❌ Message handler error:',
            error
        );

        await message.reply(
            '🦆 Aww, something went wrong on my side... try again in a moment? 🤍'
        );
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleMessage
};