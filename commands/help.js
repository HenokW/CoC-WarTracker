const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const util = require("../util/util.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription("A full list of all available commands"),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle(`${interaction.client.user.username} Command List`)
            .setColor(util.colors.default)
            .addFields(
                {name: "<:doubleSword:1416666321545859162> Regular Commands", 
                value: "**`/register`** - Link a Clash of Clans account to your profile.\n" +
                        "**`/remove`** - Removes a linked Clash of Clans account from your profile.\n" +
                        "**`/stats war`** - View your tracked war stats (includes both CWL and regular wars).\n" +
                        "**`/stats clan war league`** - View your tracked cwl stats.\n" +
                        "**`/stats clan capital`** - View your tracked clan capital stats.\n" +
                        "**`/cwl`** - View a full town hall breakdown of every clan within cwl live.\n"},

                {name: "", value: ""},
                {name: "", value: ""},

                {name: "<:swordShield:1416824229097377993> Admin & Co-Leader Commands",
                value:  "**`/status`** - Check the status of events & logs.\n" +
                        "**`/staff`** - Manage in-game rank to Discord roles.\n" +
                        "**`/roleassign enable`** - Auto-assign Discord roles for users with in-game ranks.\n" +
                        "**`/roleassign disable`** - When disabled will no longer automatically sync roles.\n" +
                        "**`/log unused attack warning`** - Toggle a reminder before war ends.\n"},
                        //"**`/log end of war report`** - Toggle an after war report with various information.\n"},

                {name: "", value: ""},
                {name: "", value: ""},
                {name: "<:otto:1416837458401820834> Found an issue?", value: "Feel free to let <@148278118170361857> know!", inline: true},
                {name: "<:clanBanner:1416836778089775329> Join our clan!", value: "[Click to join](https://link.clashofclans.com/en?action=OpenClanProfile&tag=2RC09CL8Y)", inline: true}
            )
            .setTimestamp()

        await interaction.reply({ embeds: [embed] });
    }
}