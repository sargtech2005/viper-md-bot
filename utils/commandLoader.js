/**
 * Command Loader — VIPER BOT MD
 * Commands are loaded ONCE at startup and cached in memory.
 * Re-calling loadCommands() returns the same Map (no disk re-scan).
 * This is safe because commands don't change at runtime.
 *
 * Hot-reload: call loadCommands(true) to force a fresh scan (e.g. after .update)
 */

const fs   = require('fs');
const path = require('path');

let _cache = null;

const loadCommands = (forceReload = false) => {
  if (_cache && !forceReload) return _cache;

  const commands    = new Map();
  const commandsPath = path.join(__dirname, '..', 'commands');

  if (!fs.existsSync(commandsPath)) {
    console.log('[CommandLoader] Commands directory not found');
    _cache = commands;
    return commands;
  }

  let loaded = 0, failed = 0;
  const categories = fs.readdirSync(commandsPath);

  categories.forEach(category => {
    const categoryPath = path.join(commandsPath, category);
    if (!fs.statSync(categoryPath).isDirectory()) return;

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));

    files.forEach(file => {
      const filePath = path.join(categoryPath, file);
      try {
        // Clear require cache on force-reload so updated files are picked up
        if (forceReload && require.cache[require.resolve(filePath)]) {
          delete require.cache[require.resolve(filePath)];
        }
        const exported = require(filePath);
        // Support both single-command export and array of commands
        const cmdList = Array.isArray(exported) ? exported : [exported];
        cmdList.forEach(command => {
          if (command && command.name) {
            commands.set(command.name, command);
            if (Array.isArray(command.aliases)) {
              command.aliases.forEach(alias => commands.set(alias, command));
            }
            loaded++;
          }
        });
      } catch (error) {
        console.error(`[CommandLoader] Error loading ${category}/${file}:`, error.message);
        failed++;
      }
    });
  });

  console.log(`[CommandLoader] ✅ Loaded ${loaded} commands (${failed} failed)`);
  _cache = commands;
  return commands;
};

module.exports = { loadCommands };
