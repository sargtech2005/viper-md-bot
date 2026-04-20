// utils/autoReact.js  — per-session autoReact state via database.js
const database = require('../database');

function load() {
  return {
    enabled: database.getSetting('autoReact', false),
    mode:    database.getSetting('autoReactMode', 'bot'),
  };
}

function save(data) {
  database.updateSettings({
    autoReact:     data.enabled,
    autoReactMode: data.mode,
  });
}

module.exports = { load, save };
