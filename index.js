// ============================================================
// DUCKAI — CORE INDEX
// ============================================================
// Núcleo permanente do DuckAI.
//
// FLUXO:
//
// MESSAGE
//   ↓
// ROUTER
//   ↓
// ┌──────────────────────────────────────────────┐
// │ Capability encontrada?                      │
// │                                              │
// │ SIM  → Capability → resposta → STOP         │
// │                                              │
// │ NÃO  → Conversation / Brain → resposta      │
// └──────────────────────────────────────────────┘
//
// REGRAS:
//
// • Este ficheiro NÃO conhece capabilities específicas.
// • Este ficheiro NÃO importa music.js.
// • Este ficheiro NÃO importa panels.
// • Este ficheiro NÃO importa interaction handlers.
// • Este ficheiro NÃO inicia o Web Player.
// • Novas capabilities não exigem alterações aqui.
// • Apenas UM listener messageCreate existe neste núcleo.
// • Uma mensagem recebe UMA única resposta lógica.
// • Capability tem prioridade sobre o Brain.
// • Se não houver capability, o Brain responde imediatamente
//   quando a conversa estiver ativa ou for ativada.
// ============================================================

require('dotenv').config();

// ============================================================
// DISCORD
// ============================================================

const {
    Client,
    GatewayIntentBits,
    Partials
} = require('discord.js');

// ============================================================
// CORE
// ============================================================

const memory =
    require('./core/memory');

const brain =
    require('./core/brain');

const router =
    require('./core/router');

// ============================================================
// ENV
// ============================================================

const TOKEN =
    process.env.DISCORD_TOKEN;

if (!TOKEN) {

    console.error(
        '❌ DISCORD_TOKEN is missing from .env'
    );

    process.exit(1);
}

// ============================================================
// CLIENT
// ============================================================

const client =
    new Client({

        intents: [

            GatewayIntentBits.Guilds,

            GatewayIntentBits.GuildMessages,

            GatewayIntentBits.DirectMessages,

            GatewayIntentBits.MessageContent
        ],

        partials: [

            Partials.Channel
        ]
    });

// ============================================================
// CONVERSATION STATE
// ============================================================

const conversations =
    new Set();

const histories =
    new Map();

// ============================================================
// CONVERSATION KEY
// ============================================================

function getConversationKey(
    message
) {

    return (
        `${message.channel.id}:${message.author.id}`
    );
}

// ============================================================
// HISTORY
// ============================================================

function getHistory(
    key
) {

    if (
        !histories.has(key)
    ) {

        histories.set(
            key,
            []
        );
    }

    return histories.get(
        key
    );
}

// ============================================================
// DUCKAI ACTIVATION
// ============================================================

function mentionsDuckAI(
    message
) {

    if (
        !client.user
    ) {
        return false;
    }

    const mentioned =
        message.mentions.has(
            client.user
        );

    const saysDuckAI =
        /\bduck\s*ai\b/i.test(
            message.content
        );

    return (
        mentioned ||
        saysDuckAI
    );
}

// ============================================================
// GOODBYE
// ============================================================

function isGoodbye(
    message
) {

    const text =
        message.content
            .toLowerCase()
            .trim()
            .replace(
                /[.!?,;:]+$/g,
                ''
            );

    const goodbyes = [

        'bye',
        'bye bye',
        'ok bye',
        'okay bye',
        'ok bye bye',
        'okay bye bye',

        'goodbye',
        'good bye',

        'see you',
        'see ya',
        'cya',
        'later',

        'gotta go',
        'i gotta go',

        'i have to go',
        'i gotta leave',

        'have to go',
        'have to leave',

        'talk to you later',
        'talk later'
    ];

    return goodbyes.includes(
        text
    );
}

// ============================================================
// CAPABILITY LIST
// ============================================================
// O Brain pode receber informação sobre as capabilities
// disponíveis sem o index conhecer nenhuma delas.
//
// O router pode opcionalmente expor:
//
// router.getCapabilities()
//
// Caso não exponha essa função, o Brain simplesmente recebe
// uma lista vazia.
//
// ============================================================

function getCapabilities() {

    try {

        if (
            typeof router.getCapabilities ===
            'function'
        ) {

            const capabilities =
                router.getCapabilities();

            if (
                !Array.isArray(
                    capabilities
                )
            ) {

                return [];
            }

            return capabilities
                .map(
                    capability => {

                        if (
                            typeof capability ===
                            'string'
                        ) {

                            return capability;
                        }

                        if (
                            capability?.name
                        ) {

                            return capability.name;
                        }

                        if (
                            capability?.capability
                        ) {

                            return capability.capability;
                        }

                        if (
                            capability?.module?.name
                        ) {

                            return capability.module.name;
                        }

                        if (
                            capability?.module?.capability
                        ) {

                            return capability.module.capability;
                        }

                        return null;
                    }
                )
                .filter(
                    Boolean
                );
        }

    } catch (error) {

        console.error(
            '⚠️ Could not read capabilities:',
            error
        );
    }

    return [];
}

// ============================================================
// SAFE REPLY
// ============================================================

async function safeReply(
    message,
    content
) {

    if (
        !content
    ) {

        return;
    }

    await message.reply(
        content
    );
}

// ============================================================
// ROUTER
// ============================================================
//
// O router tem prioridade absoluta.
//
// Possíveis resultados:
//
// {
//     type: 'capability',
//     capability: 'music',
//     response: '...'
// }
//
// ou:
//
// {
//     type: 'conversation'
// }
//
// ou simplesmente:
//
// null / undefined
//
// ============================================================

async function executeRouter(
    message
) {

    try {

        if (
            typeof router.route !==
            'function'
        ) {

            console.error(
                '❌ Router does not export route().'
            );

            return {
                type:
                    'conversation'
            };
        }

        const result =
            await router.route(
                message
            );

        if (
            !result
        ) {

            return {
                type:
                    'conversation'
            };
        }

        return result;

    } catch (error) {

        // ----------------------------------------------------
        // IMPORTANTE:
        //
        // Um erro do router NÃO deve gerar:
        //
        // "I could not execute that capability."
        //
        // Isso acabava por bloquear o Brain e produzir
        // respostas falsas.
        //
        // Se o router falhar, tratamos a mensagem como
        // conversa normal.
        // ----------------------------------------------------

        console.error(
            '❌ Router error:',
            error
        );

        return {
            type:
                'conversation'
        };
    }
}

// ============================================================
// PROCESS MESSAGE
// ============================================================

async function processMessage(
    message
) {

    // ========================================================
    // IGNORE BOTS
    // ========================================================

    if (
        message.author.bot
    ) {

        return;
    }

    // ========================================================
    // CONVERSATION KEY
    // ========================================================

    const key =
        getConversationKey(
            message
        );

    // ========================================================
    // 1. ROUTER — SEMPRE PRIMEIRO
    // ========================================================
    //
    // Nenhum Brain.
    // Nenhuma ativação.
    // Nenhum goodbye.
    //
    // Primeiro damos oportunidade às capabilities.
    //
    // ========================================================

    const route =
        await executeRouter(
            message
        );

    // ========================================================
    // 2. CAPABILITY
    // ========================================================

    if (
        route?.type ===
        'capability'
    ) {

        // -----------------------------------------------
        // A capability já tratou da mensagem.
        // -----------------------------------------------

        if (
            route.response
        ) {

            await safeReply(
                message,
                route.response
            );
        }

        // -----------------------------------------------
        // ABSOLUTE STOP
        // -----------------------------------------------
        //
        // Nunca:
        //
        // capability
        //     ↓
        // brain
        //
        // Nem:
        //
        // capability
        //     ↓
        // Heyyy
        //
        // Nem outra resposta.
        //
        // -----------------------------------------------

        return;
    }

    // ========================================================
    // 3. DUCKAI ACTIVATION
    // ========================================================
    //
    // Só chegamos aqui se nenhuma capability consumiu
    // a mensagem.
    //
    // ========================================================

    if (
        mentionsDuckAI(
            message
        )
    ) {

        conversations.add(
            key
        );

        getHistory(
            key
        );

        await safeReply(
            message,
            '🦆 Heyyy! DuckAI is here 🤍'
        );

        memory
            .updateUserMemory(
                message
            )
            .catch(
                error =>
                    console.error(
                        '⚠️ Memory error:',
                        error
                    )
            );

        return;
    }

    // ========================================================
    // 4. INACTIVE CONVERSATION
    // ========================================================
    //
    // Se o utilizador não chamou DuckAI e não existe uma
    // conversa ativa, não fazemos nada.
    //
    // ========================================================

    if (
        !conversations.has(
            key
        )
    ) {

        return;
    }

    // ========================================================
    // 5. GOODBYE
    // ========================================================

    if (
        isGoodbye(
            message
        )
    ) {

        conversations.delete(
            key
        );

        histories.delete(
            key
        );

        await safeReply(
            message,
            '🦆 Okay, bye bye! See you later 🤍'
        );

        return;
    }

    // ========================================================
    // 6. BRAIN
    // ========================================================
    //
    // Só mensagens que não foram consumidas por uma
    // capability chegam aqui.
    //
    // ========================================================

    try {

        await message.channel.sendTyping();

        const history =
            getHistory(
                key
            );

        // ----------------------------------------------------
        // Adicionar a mensagem do utilizador ANTES do Brain.
        // Assim o Brain recebe a mensagem atual no contexto.
        // ----------------------------------------------------

        if (
            typeof brain.addToHistory ===
            'function'
        ) {

            brain.addToHistory(

                history,

                'user',

                message.content
            );

        } else {

            history.push({

                role:
                    'user',

                content:
                    message.content
            });
        }

        // ----------------------------------------------------
        // CAPABILITIES DISPONÍVEIS
        // ----------------------------------------------------

        const capabilities =
            getCapabilities();

        // ----------------------------------------------------
        // BRAIN
        // ----------------------------------------------------

        if (
            typeof brain.generateResponse !==
            'function'
        ) {

            throw new Error(
                'Brain does not export generateResponse().'
            );
        }

        const response =
            await brain.generateResponse({

                message,

                history,

                capabilities
            });

        // ----------------------------------------------------
        // GUARD
        // ----------------------------------------------------

        if (
            !response
        ) {

            throw new Error(
                'Brain returned an empty response.'
            );
        }

        // ----------------------------------------------------
        // ADD ASSISTANT RESPONSE
        // ----------------------------------------------------

        if (
            typeof brain.addToHistory ===
            'function'
        ) {

            brain.addToHistory(

                history,

                'assistant',

                response
            );

        } else {

            history.push({

                role:
                    'assistant',

                content:
                    response
            });
        }

        // ----------------------------------------------------
        // SEND
        // ----------------------------------------------------

        await safeReply(
            message,
            response
        );

        // ----------------------------------------------------
        // MEMORY
        // ----------------------------------------------------

        memory
            .updateUserMemory(
                message
            )
            .catch(
                error =>
                    console.error(
                        '⚠️ Memory error:',
                        error
                    )
            );

    } catch (error) {

        console.error(
            '❌ Brain error:',
            error
        );

        // ----------------------------------------------------
        // UMA ÚNICA mensagem de erro.
        // Não voltamos ao router.
        // Não tentamos outra capability.
        // Não chamamos o Brain novamente.
        // ----------------------------------------------------

        await safeReply(

            message,

            '🦆 Aww, something went wrong on my side... try again in a moment? 🤍'
        );
    }
}

// ============================================================
// SINGLE MESSAGE HANDLER
// ============================================================
//
// ESTE É O ÚNICO messageCreate DO NÚCLEO.
//
// Não adicionar outro listener messageCreate noutro ficheiro
// que carregue este index.
//
// ============================================================

client.on(
    'messageCreate',
    processMessage
);

// ============================================================
// READY
// ============================================================

client.once(
    'clientReady',
    () => {

        console.log(
            '────────────────────────────'
        );

        console.log(
            `🦆 DuckAI online as ${client.user.tag}`
        );

        const capabilities =
            getCapabilities();

        if (
            capabilities.length
        ) {

            console.log(
                `⚡ Capabilities: ${capabilities.length}`
            );

            for (
                const capability
                of capabilities
            ) {

                console.log(
                    `   • ${capability}`
                );
            }

        } else {

            console.log(
                '⚡ Capabilities: loaded dynamically'
            );
        }

        console.log(
            '────────────────────────────'
        );
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
    TOKEN
);

// ============================================================
// EXPORTS
// ============================================================
//
// Úteis para testes e para outros módulos, sem obrigar
// qualquer capability a importar o index.
//
// ============================================================

module.exports = {

    client,

    conversations,

    histories,

    getConversationKey,

    getHistory,

    mentionsDuckAI,

    isGoodbye,

    getCapabilities,

    processMessage
};