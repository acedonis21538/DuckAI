const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// ============================================================
// PATHS
// ============================================================

const usersPath = path.join(
    __dirname,
    '..',
    'data',
    'users',
    'memory.json'
);

// ============================================================
// GROQ
// ============================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
    throw new Error(
        '❌ GROQ_API_KEY is missing from .env'
    );
}

const groq = new OpenAI({
    apiKey: GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

const AI_MODEL = 'openai/gpt-oss-20b';

// ============================================================
// HELPERS
// ============================================================

function clone(value) {
    return JSON.parse(
        JSON.stringify(value)
    );
}

function loadJson(
    file,
    fallback
) {

    try {

        if (!fs.existsSync(file)) {

            fs.mkdirSync(
                path.dirname(file),
                {
                    recursive: true
                }
            );

            fs.writeFileSync(
                file,
                JSON.stringify(
                    fallback,
                    null,
                    2
                ),
                'utf8'
            );

            return clone(fallback);
        }

        const raw =
            fs.readFileSync(
                file,
                'utf8'
            );

        if (!raw.trim()) {
            return clone(fallback);
        }

        return JSON.parse(raw);

    } catch (error) {

        console.error(
            `❌ Failed loading ${path.basename(file)}:`,
            error
        );

        return clone(fallback);
    }
}

function saveJson(
    file,
    data
) {

    try {

        fs.mkdirSync(
            path.dirname(file),
            {
                recursive: true
            }
        );

        const temporary =
            `${file}.tmp`;

        fs.writeFileSync(
            temporary,
            JSON.stringify(
                data,
                null,
                2
            ),
            'utf8'
        );

        fs.renameSync(
            temporary,
            file
        );

    } catch (error) {

        console.error(
            `❌ Failed saving ${path.basename(file)}:`,
            error
        );
    }
}

// ============================================================
// USER MEMORY
// ============================================================

let userMemory =
    loadJson(
        usersPath,
        {}
    );

// ============================================================
// DEFAULT PROFILE
// ============================================================

function createEmptyUserMemory() {

    return {

        name: null,

        age: null,

        location: null,

        likes: [],

        dislikes: [],

        interests: [],

        goals: [],

        preferences: [],

        personality: {},

        facts: [],

        messageCount: 0,

        lastUpdated: null
    };
}

// ============================================================
// NORMALIZE
// ============================================================

function normalizeUserMemory(
    memory
) {

    const base =
        createEmptyUserMemory();

    const result = {
        ...base,
        ...(memory || {})
    };

    const arrays = [
        'likes',
        'dislikes',
        'interests',
        'goals',
        'preferences',
        'facts'
    ];

    for (
        const field of arrays
    ) {

        if (
            !Array.isArray(
                result[field]
            )
        ) {

            result[field] = [];
        }
    }

    if (
        !result.personality ||
        typeof result.personality !== 'object' ||
        Array.isArray(
            result.personality
        )
    ) {

        result.personality = {};
    }

    return result;
}

// ============================================================
// GET USER
// ============================================================

function getUserMemory(
    userId
) {

    if (
        !userMemory[userId] ||
        typeof userMemory[userId] !== 'object'
    ) {

        userMemory[userId] =
            createEmptyUserMemory();
    }

    userMemory[userId] =
        normalizeUserMemory(
            userMemory[userId]
        );

    return userMemory[userId];
}

// ============================================================
// SAVE
// ============================================================

function saveUserMemory() {

    saveJson(
        usersPath,
        userMemory
    );
}

// ============================================================
// ARRAY UTILITIES
// ============================================================

function addUnique(
    array,
    value,
    limit = 50
) {

    if (
        !Array.isArray(array) ||
        typeof value !== 'string'
    ) {

        return;
    }

    const clean =
        value.trim();

    if (!clean) {
        return;
    }

    const exists =
        array.some(
            item =>
                String(item)
                    .toLowerCase()
                    .trim() ===
                clean.toLowerCase()
        );

    if (!exists) {
        array.push(clean);
    }

    while (
        array.length > limit
    ) {

        array.shift();
    }
}

function setIfUseful(
    memory,
    field,
    value
) {

    if (
        typeof value !== 'string' &&
        typeof value !== 'number'
    ) {

        return;
    }

    const clean =
        String(value).trim();

    if (!clean) {
        return;
    }

    memory[field] = clean;
}

// ============================================================
// EXPLICIT MEMORY EXTRACTION
// ============================================================

function extractExplicitFacts(
    text,
    memory
) {

    if (!text) {
        return;
    }

    // ========================================================
    // AGE
    // ========================================================

    const agePatterns = [

        /\b(?:i am|i'm|im|tenho|eu tenho)\s+(\d{1,3})\s*(?:years old|anos)?\b/i,

        /\b(\d{1,3})\s*(?:years old|anos)\b/i,

        /\b(?:idade|age)\s*(?:é|e|is|:)?\s*(\d{1,3})\b/i
    ];

    for (
        const pattern
        of agePatterns
    ) {

        const match =
            text.match(pattern);

        if (!match) {
            continue;
        }

        const age =
            Number(match[1]);

        if (
            age >= 5 &&
            age <= 120
        ) {

            memory.age =
                String(age);

            break;
        }
    }

    // ========================================================
    // LOCATION
    // ========================================================

    const locationPatterns = [

        /\b(?:i am from|i'm from|im from|sou de|sou do|sou da|venho de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ -]{1,60})/i,

        /\b(?:i live in|i'm living in|im living in|vivo em|moro em|vivo no|vivo na|moro no|moro na)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ -]{1,60})/i
    ];

    for (
        const pattern
        of locationPatterns
    ) {

        const match =
            text.match(pattern);

        if (!match) {
            continue;
        }

        const location =
            match[1]
                .trim()
                .replace(
                    /[.!?,;]+$/,
                    ''
                );

        if (
            location.length >= 2 &&
            location.length <= 60
        ) {

            memory.location =
                location;

            break;
        }
    }

    // ========================================================
    // NAME
    // ========================================================

    const namePatterns = [

        /\b(?:my name is|my name's|meu nome é|o meu nome é)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,50})/i,

        /\b(?:i am called|i'm called|chamo-me|chamo me)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,50})/i
    ];

    for (
        const pattern
        of namePatterns
    ) {

        const match =
            text.match(pattern);

        if (!match) {
            continue;
        }

        const name =
            match[1]
                .trim()
                .replace(
                    /[.!?,;]+$/,
                    ''
                );

        if (
            name.length <= 50
        ) {

            memory.name =
                name;

            break;
        }
    }
}

// ============================================================
// JSON PARSER
// ============================================================

function parseJsonResponse(
    raw
) {

    if (!raw) {
        return null;
    }

    let cleaned =
        raw.trim();

    cleaned =
        cleaned
            .replace(
                /^```json\s*/i,
                ''
            )
            .replace(
                /^```\s*/i,
                ''
            )
            .replace(
                /\s*```$/i,
                ''
            )
            .trim();

    try {

        return JSON.parse(
            cleaned
        );

    } catch {

        return null;
    }
}

// ============================================================
// AI MEMORY EXTRACTION
// ============================================================

async function extractMemoryWithAI(
    message,
    memory
) {

    const prompt = `
You are DuckAI's memory extraction system.

Your job is to update a personal profile for ONE Discord user.

Read ONLY what the user actually says about themselves.

Save useful long-term information such as:

- name
- age
- general location such as country/city/region
- likes
- dislikes
- interests
- goals
- preferences
- stable personality observations
- useful personal facts

Do NOT invent information.

Do NOT infer facts that were not established.

Do NOT diagnose the person.

Do NOT infer sensitive characteristics.

Do NOT save private secrets, passwords, tokens,
addresses, coordinates or financial information.

Do not save random temporary conversation details.

If something is not present in the latest message,
return null for scalar fields and [] for lists.

EXISTING MEMORY:
${JSON.stringify(memory)}

LATEST USER MESSAGE:
${message.content}

Return ONLY JSON with exactly these fields:

{
  "name": null,
  "age": null,
  "location": null,
  "likes": [],
  "dislikes": [],
  "interests": [],
  "goals": [],
  "preferences": [],
  "personality": {},
  "facts": []
}

IMPORTANT:

The existing memory must NOT be erased just because
a field is absent from the latest message.

The program will merge your result with the existing memory.
`;

    try {

        const response =
            await groq.chat.completions.create({

                model: AI_MODEL,

                messages: [
                    {
                        role: 'system',
                        content: prompt
                    }
                ],

                temperature: 0,

                max_tokens: 800,

                response_format: {
                    type: 'json_object'
                }
            });

        const raw =
            response
                .choices?.[0]
                ?.message
                ?.content;

        return parseJsonResponse(
            raw
        );

    } catch (error) {

        console.error(
            '⚠️ AI memory extraction failed:',
            error.message
        );

        return null;
    }
}

// ============================================================
// MERGE
// ============================================================

function mergeExtractedMemory(
    memory,
    extracted
) {

    if (
        !extracted ||
        typeof extracted !== 'object'
    ) {

        return;
    }

    // ========================================================
    // SCALARS
    // ========================================================

    if (
        typeof extracted.name === 'string' &&
        extracted.name.trim()
    ) {

        setIfUseful(
            memory,
            'name',
            extracted.name
        );
    }

    if (
        extracted.age !== null &&
        extracted.age !== undefined &&
        String(
            extracted.age
        ).trim()
    ) {

        const age =
            Number(
                extracted.age
            );

        if (
            Number.isInteger(age) &&
            age >= 5 &&
            age <= 120
        ) {

            memory.age =
                String(age);
        }
    }

    if (
        typeof extracted.location === 'string' &&
        extracted.location.trim()
    ) {

        setIfUseful(
            memory,
            'location',
            extracted.location
        );
    }

    // ========================================================
    // LISTS
    // ========================================================

    const listFields = [

        'likes',
        'dislikes',
        'interests',
        'goals',
        'preferences',
        'facts'
    ];

    for (
        const field
        of listFields
    ) {

        if (
            !Array.isArray(
                extracted[field]
            )
        ) {

            continue;
        }

        for (
            const item
            of extracted[field]
        ) {

            if (
                typeof item !== 'string'
            ) {

                continue;
            }

            addUnique(
                memory[field],
                item,
                50
            );
        }
    }

    // ========================================================
    // PERSONALITY
    // ========================================================

    if (
        extracted.personality &&
        typeof extracted.personality === 'object' &&
        !Array.isArray(
            extracted.personality
        )
    ) {

        for (
            const [
                key,
                value
            ]
            of Object.entries(
                extracted.personality
            )
        ) {

            if (
                typeof value !== 'string'
            ) {

                continue;
            }

            const cleanKey =
                key
                    .trim()
                    .slice(0, 50);

            const cleanValue =
                value
                    .trim()
                    .slice(0, 300);

            if (
                cleanKey &&
                cleanValue
            ) {

                memory.personality[
                    cleanKey
                ] = cleanValue;
            }
        }

        const entries =
            Object.entries(
                memory.personality
            );

        if (
            entries.length > 30
        ) {

            memory.personality =
                Object.fromEntries(
                    entries.slice(-30)
                );
        }
    }
}

// ============================================================
// UPDATE MEMORY
// ============================================================

async function updateUserMemory(
    message
) {

    const userId =
        message.author.id;

    const memory =
        getUserMemory(userId);

    // --------------------------------------------------------
    // Deterministic extraction
    // --------------------------------------------------------

    extractExplicitFacts(
        message.content,
        memory
    );

    // --------------------------------------------------------
    // AI extraction
    // --------------------------------------------------------

    const extracted =
        await extractMemoryWithAI(
            message,
            memory
        );

    mergeExtractedMemory(
        memory,
        extracted
    );

    // --------------------------------------------------------
    // Metadata
    // --------------------------------------------------------

    memory.messageCount =
        Number(
            memory.messageCount || 0
        ) + 1;

    memory.lastUpdated =
        new Date().toISOString();

    saveUserMemory();

    console.log(
        `🧠 Memory updated for ${message.author.tag} (${userId})`
    );
}

// ============================================================
// MEMORY PROMPT
// ============================================================

function buildUserMemoryPrompt(
    userId
) {

    const memory =
        getUserMemory(userId);

    const sections = [];

    if (memory.name) {

        sections.push(
            `Name: ${memory.name}`
        );
    }

    if (memory.age) {

        sections.push(
            `Age: ${memory.age}`
        );
    }

    if (memory.location) {

        sections.push(
            `Location: ${memory.location}`
        );
    }

    if (memory.likes.length) {

        sections.push(
            `Likes: ${memory.likes.join(', ')}`
        );
    }

    if (memory.dislikes.length) {

        sections.push(
            `Dislikes: ${memory.dislikes.join(', ')}`
        );
    }

    if (memory.interests.length) {

        sections.push(
            `Interests: ${memory.interests.join(', ')}`
        );
    }

    if (memory.goals.length) {

        sections.push(
            `Goals: ${memory.goals.join(', ')}`
        );
    }

    if (memory.preferences.length) {

        sections.push(
            `Preferences: ${memory.preferences.join(', ')}`
        );
    }

    if (
        Object.keys(
            memory.personality
        ).length
    ) {

        sections.push(
            'Personality observations: ' +
            Object.entries(
                memory.personality
            )
                .map(
                    ([key, value]) =>
                        `${key}: ${value}`
                )
                .join('; ')
        );
    }

    if (memory.facts.length) {

        sections.push(
            `Other facts: ${memory.facts.join('; ')}`
        );
    }

    if (!sections.length) {

        return (
            'No personal information is known ' +
            'about this user yet.'
        );
    }

    return sections.join('\n');
}

// ============================================================
// DELETE MEMORY
// ============================================================

function deleteUserMemory(
    userId
) {

    if (
        userMemory[userId]
    ) {

        delete userMemory[userId];

        saveUserMemory();

        return true;
    }

    return false;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    createEmptyUserMemory,
    normalizeUserMemory,

    getUserMemory,
    saveUserMemory,

    addUnique,
    setIfUseful,

    extractExplicitFacts,
    extractMemoryWithAI,
    mergeExtractedMemory,

    updateUserMemory,

    buildUserMemoryPrompt,

    deleteUserMemory
};