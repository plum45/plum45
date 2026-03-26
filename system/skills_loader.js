const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../skills');

function loadModularSkills() {
    const registry = {
        handlers: {}, // actionType -> execute function
        prompts: []   // array of SKILL.md contents
    };

    if (!fs.existsSync(SKILLS_DIR)) {
        fs.mkdirSync(SKILLS_DIR, { recursive: true });
        return registry;
    }

    try {
        const items = fs.readdirSync(SKILLS_DIR);
        for (const item of items) {
            const skillPath = path.join(SKILLS_DIR, item);
            if (fs.statSync(skillPath).isDirectory()) {
                const indexFile = path.join(skillPath, 'index.js');
                const mdFile = path.join(skillPath, 'SKILL.md');

                if (fs.existsSync(indexFile)) {
                    try {
                        const skillModule = require(indexFile);
                        // A modular skill should export: { actions: ['ACTION_KEY'], execute: async (actionType, data, ctx, userId, options) => { ... } }
                        if (skillModule.actions && Array.isArray(skillModule.actions) && skillModule.execute) {
                            skillModule.actions.forEach(act => {
                                registry.handlers[act] = skillModule.execute;
                            });
                            console.log(`[Skills Loader] Registered modular skill: ${item} handling [${skillModule.actions.join(', ')}]`);
                        }

                        if (fs.existsSync(mdFile)) {
                            registry.prompts.push(fs.readFileSync(mdFile, 'utf8'));
                        }
                    } catch (err) {
                        console.error(`[Skills Loader] Failed to load modular skill ${item}:`, err.message);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[Skills Loader] Error scanning SKILLS_DIR:', err.message);
    }
    
    return registry;
}

module.exports = loadModularSkills();
