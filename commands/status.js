const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require("../mongodb/database.js");
const util = require("../util/util.js");

const ENABLED_TEXT = "```ansi\n[2;32m[1;32mEnabled[0m[2;32m[0m\n```";
const DISABLED_TEXT = "```ansi\n[2;31m[1;31mDisabled[0m[2;31m[0m\n```";

module.exports = {
    cooldown: 5,
    requirePermission: true,
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription("View the status of all events"),

    async execute(interaction) {
        await interaction.deferReply({ withResponse: true });

        let isAutoRoleAssigningEnabled = false;
        let isAttackLoggingEnabled = false;

        const attackLogging = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: '#2RC09CL8Y' });
        for(let i = 0; i < attackLogging.activeLogs.length; i++)
            if(attackLogging.activeLogs[i].type == 'ua_warning')
                isAttackLoggingEnabled = true;
        
        const roleAssigning = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { toggle: true });
        isAutoRoleAssigningEnabled = roleAssigning?.isEnabled || false;

        const embed = new EmbedBuilder()
            .setTitle("Event Status Checker")
            .setColor(util.colors.blue)
            .addFields(
                {name: "Auto Role Assigner", value: isAutoRoleAssigningEnabled ? ENABLED_TEXT : DISABLED_TEXT, inline: true},
                {name: "Unused Attack Logging", value: isAttackLoggingEnabled ? ENABLED_TEXT : DISABLED_TEXT, inline: true}
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        
    }
}