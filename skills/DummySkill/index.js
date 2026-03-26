module.exports = {
    actions: ['DUMMY_ACTION'],
    execute: async (type, data, ctx, userId, options) => {
        await ctx.reply(`[DummySkill] Executed ${type} with data: ${JSON.stringify(data)}`);
    }
};
