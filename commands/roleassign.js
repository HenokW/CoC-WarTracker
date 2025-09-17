const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const database = require("../mongodb/database.js");
const util = require("../util/util.js");

module.exports = {
    requirePermission: true,
    data: new SlashCommandBuilder()
        .setName('roleassign')
        .setDescription("Toggle whether or not you would like me to automatically assign discord roles matching in-game ranks")
        .addStringOption(option =>
            option.setName('toggle')
                .setDescription("Enable/Disable")
                .setRequired(true)
                .addChoices(
                    {name: 'Enable', value: 'enable'},
                    {name: 'Disable', value: 'disable'}
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let assignToggle;
        const selected = interaction.options.getString('toggle');
        switch(selected) {
            case 'enable': //Show/mention staff list
                console.log("Enabled");
                await toggleRole(interaction, true);
                break;

            case 'disable':
                console.log("Disabled");
                await toggleRole(interaction, false);
                break;
        }
    },
    
}

async function toggleRole(interaction, toggle) {
    let assignToggle = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { toggle: true });
    if(!assignToggle)
        assignToggle = { isEnabled: toggle, toggle: true }

    let status = '';
    if(toggle) {
        if(assignToggle.isEnabled)
            return await interaction.editReply({ content: "Auto role assign is already enabled." });
        
        status = 'enabled';
        assignToggle.isEnabled = true;
        process.env.isWatchUserPromotionActive = true;

        // const watchUserPromotion = require('../eventLogs/watchUserPromotion.js');
        // watchUserPromotion.watchClan(interaction.client);
    }
    else {
        if(!assignToggle.isEnabled)
            return await interaction.editReply({ content: "Auto role assign is already disabled." });

        status = 'disabled';
        assignToggle.isEnabled = false;
        process.env.isWatchUserPromotionActive = false;
    }

    await database.update(database.DATABASE_NAME.bot, database.COLLECTION.roles, { toggle: true }, assignToggle);
    return await interaction.editReply({ content: `Auto role assign has been ${status}.` });
}