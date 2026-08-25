// ============================================================
// DUCKAI CONTEXT
// ============================================================

const conversations = new Set();
const histories = new Map();

const MAX_HISTORY_MESSAGES = 50;

// ============================================================
// CONVERSATION KEY
// ============================================================

function getConversationKey(message) {

    return `${message.channel.id}:${message.author.id}`;
}

// ============================================================
// START CONVERSATION
// ============================================================

function startConversation(message) {

    const key =
        getConversationKey(message);

    conversations.add(key);

    getHistory(message);

    return key;
}

// ============================================================
// END CONVERSATION
// ============================================================

function endConversation(message) {

    const key =
        getConversationKey(message);

    conversations.delete(key);
    histories.delete(key);
}

// ============================================================
// CHECK ACTIVE CONVERSATION
// ============================================================

function isConversationActive(message) {

    const key =
        getConversationKey(message);

    return conversations.has(key);
}

// ============================================================
// GET HISTORY
// ============================================================

function getHistory(message) {

    const key =
        typeof message === 'string'
            ? message
            : getConversationKey(message);

    if (!histories.has(key)) {

        histories.set(
            key,
            []
        );
    }

    return histories.get(key);
}

// ============================================================
// ADD MESSAGE
// ============================================================

function addMessage(
    message,
    role,
    content
) {

    const history =
        getHistory(message);

    history.push({
        role,
        content
    });

    trimHistory(history);
}

// ============================================================
// TRIM HISTORY
// ============================================================

function trimHistory(history) {

    if (
        history.length >
        MAX_HISTORY_MESSAGES
    ) {

        history.splice(
            0,
            history.length -
            MAX_HISTORY_MESSAGES
        );
    }
}

// ============================================================
// CLEAR USER CONTEXT
// ============================================================

function clearUserContext(
    userId
) {

    for (
        const key of histories.keys()
    ) {

        if (
            key.endsWith(
                `:${userId}`
            )
        ) {

            histories.delete(key);
            conversations.delete(key);
        }
    }
}

// ============================================================
// CLEAR ALL
// ============================================================

function clearAll() {

    conversations.clear();
    histories.clear();
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    MAX_HISTORY_MESSAGES,

    getConversationKey,

    startConversation,
    endConversation,

    isConversationActive,

    getHistory,
    addMessage,

    trimHistory,

    clearUserContext,
    clearAll
};