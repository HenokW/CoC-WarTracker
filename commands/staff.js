const { SlashCommandBuilder } = require('discord.js');
const util = require("../util/util.js");

module.exports = {
    requirePermission: true,
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription("View and edit the staff role list"),

    async execute(interaction) {
        let test = require('../eventLogs/watchUserPromotion.js');
        await test.staffListManager(interaction);
    }
}