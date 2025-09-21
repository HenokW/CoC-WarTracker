const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const util = require("../util/util.js");

module.exports = {
    requirePermission: true,
    data: new SlashCommandBuilder()
        .setName('log')
        .setDescription("Toggle logging of various events.")
        .addStringOption(option => 
            option.setName('event')
                .setDescription("Logging events")
                .setRequired(true)
                .addChoices(
                    {name: 'Unused Attack Warning', value: 'ua_warning'},
                    {name: 'End of War Report', value: 'eow_report'},
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral, withResponse: true });

        const selected = interaction.options.getString('event');
        switch(selected) {
            case 'ua_warning': //Unused Attack Warning
                channelSelector(interaction, 'Unused Attack Warning');
                break;

            case 'eow_report': //End of War Report
                return interaction.editReply({ content: "This does nothing." });
        }
    }
}

async function channelSelector(interaction, text) {
    const embed = new EmbedBuilder()
        .setTitle("Log Channel Selector")
        .setColor(util.colors.default)
        .setDescription(`Which channel would you like to log ${text} in.`)
        .setThumbnail('https://henokw.xyz/resources/coc/bot/cog-cluster.png')
        .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.avatarURL()});

    let channelSelector = new StringSelectMenuBuilder()
        .setCustomId('channelSelector')
        .setPlaceholder('Select a channel');

    //TYPE: 0 - TEXT CHAT || 2 - VC || 4 - CATEGORY
    const channels = await interaction.guild.channels.fetch();
    channels.each(ch => {
        if(ch.type == 0) {
            channelSelector.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(ch.name)
                    .setDescription('Text-Channel')
                    .setValue(ch.id)
            )
        }
    });

    const row = new ActionRowBuilder().addComponents(channelSelector);
    const selectorCollector = await interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral, components: [row], withResponse: true });
    const filter = res => ( res.user.id == interaction.user.id );

    try {
        const selectorResponse = await selectorCollector.awaitMessageComponent({ filter: filter, time: 30_000 });
        console.log(selectorResponse.values[0]);

        await selectorResponse.update({ components: [] });

        const attackLogEvent = require("../eventLogs/unusedAttackLog.js");
        await attackLogEvent.setup(interaction, selectorResponse.values[0]);

        //await interaction.editReply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral, components: [] });

    } catch(err) {
        embed.setFooter({ text: "Timed out while waiting for a response. Please use the command again." }).setColor(util.colors.red);
        await interaction.editReply({ embeds: [ embed ], flags: MessageFlags.Ephemeral, components: [] });
    }
}