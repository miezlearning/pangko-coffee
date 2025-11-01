const fs = require('fs');
const path = require('path');

const commands = {};

// Load all command files
const commandFiles = fs.readdirSync(__dirname).filter(file => 
    file !== 'index.js' && file.endsWith('.js')
);

for (const file of commandFiles) {
    const command = require(path.join(__dirname, file));
    
    // Handle single command export
    if (command.name) {
        commands[command.name] = command;
        
        // Register aliases
        if (command.aliases) {
            command.aliases.forEach(alias => {
                commands[alias] = command;
            });
        }
    }
    // Handle multiple commands export (like utils.js)
    else if (typeof command === 'object') {
        Object.values(command).forEach(cmd => {
            if (cmd.name) {
                commands[cmd.name] = cmd;
                
                if (cmd.aliases) {
                    cmd.aliases.forEach(alias => {
                        commands[alias] = cmd;
                    });
                }
            }
        });
    }
}

console.log(`✅ Loaded ${Object.keys(commands).length} commands`);

module.exports = commands;