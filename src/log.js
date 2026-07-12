// @ts-check
const ts = () => new Date().toTimeString().slice(0, 8);

/** @param {...any} a */ const log = (...a) => console.log(`[${ts()}]`, ...a);
/** @param {...any} a */ const warn = (...a) => console.warn(`[${ts()}]`, ...a);

module.exports = { log, warn };
