// ============================================================
// DUCKAI CAPABILITIES
// ============================================================

const music = require('./music');
const images = require('./images');
const web = require('./web');

// ============================================================
// AVAILABLE CAPABILITIES
// ============================================================

const capabilities = {
    music,
    images,
    web
};

// ============================================================
// GET CAPABILITY
// ============================================================

function getCapability(name) {
    return capabilities[name] || null;
}

// ============================================================
// CHECK CAPABILITY
// ============================================================

function hasCapability(name) {
    return Boolean(capabilities[name]);
}

// ============================================================
// LIST CAPABILITIES
// ============================================================

function listCapabilities() {
    return Object.keys(capabilities);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    capabilities,
    getCapability,
    hasCapability,
    listCapabilities
};