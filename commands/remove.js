const { SlashCommandBuilder, EmbedBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');
const roleAssign = require("../eventLogs/watchUserPromotion.js");
const database = require("../mongodb/database.js");
const warTracker = require("../warTracker.js");
const util = require("../util/util.js");

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription("Remove a Clash of Clans account linked to your Discord profile."),

        async execute(interaction) {
            let userBotStorage = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { 'discord.userId': interaction.user.id });
        
            if(!userBotStorage || userBotStorage?.accounts.length <= 0) {
                const msg = errorMessage();
                return interaction.reply({embeds: [msg], flags: MessageFlags.Ephemeral})
            }

            const embed = new EmbedBuilder()
                .setTitle("Account Manager")
                .setColor("#806c54")
                .setDescription("Which Clash account would you like to remove from your profile?")
                .setThumbnail('https://cdn-assets-eu.frontify.com/s3/frontify-enterprise-files-eu/eyJwYXRoIjoic3VwZXJjZWxsXC9maWxlXC9kV2hLU2doNjRIUzJiS1Zwb2EyQi5wbmcifQ:supercell:XRSzxsrO6qMO1TIj_PM-XS2zeGL99Kpcu5mZVvkGiWQ?width=2400')
                .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.avatarURL()});

            let accountSelector = new StringSelectMenuBuilder()
                .setCustomId('accountSelector')
                .setPlaceholder("Select an account");

            
            for(const acc of userBotStorage.accounts) {
                const accountInfo = await warTracker.api({ endpoint: 'player', playerTag: acc });

                
                accountSelector.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`#${acc}`)
                        .setDescription(`Town Hall ${accountInfo.townHallLevel} | ${accountInfo.name}`)
                        .setValue(acc)
                )
            }

            const row = new ActionRowBuilder().addComponents(accountSelector);
            const menuMessage = await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral, withResponse: true });
            const menuCollectorFilter = ( res => res.user.id == interaction.user.id );

            try {
                const menuResponse = await menuMessage.resource.message.awaitMessageComponent({ filter: menuCollectorFilter, time: 30_000 });
                await unlinkAccount(menuResponse.values[0], userBotStorage);

                //if(userBotStorage.accounts.length <= 0)
                    //await roleAssign.removedAccountRoleCheck(interaction.client, userBotStorage.discord.userId);

                const successEmbed = new EmbedBuilder()
                    .setColor(util.colors.green)
                    .setTitle("Successfully unlinked an account")
                    .setFooter({text: "To register another account, use the /register command"});

                await interaction.editReply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral, components: [] })
                
            } catch(err) {
                console.error(err);
                embed.setFooter({ text: "Timed out while waiting for a response, please try again." });
                await interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral, components: [] });
            }
        }
}

async function unlinkAccount(tag, userBotStorage) {
    for(let i = 0; i < userBotStorage.accounts.length; i++) {
        console.log(` tag: ${tag} || i: ${userBotStorage.accounts[i]}`)
        if(userBotStorage.accounts[i] == tag) {
            userBotStorage.accounts.splice(i, 1)
        }
    }

    await database.update(database.DATABASE_NAME.bot, database.COLLECTION.bot, { 'discord.userId': userBotStorage.discord.userId }, userBotStorage);
}

function errorMessage() {
    let embed = new EmbedBuilder()
        .setColor('#BF1717')
        .setTitle("<:error:1403494703407566908> No accounts found")
        .setDescription("It looks like you don't have any Clash of Clans accounts linked to your profile. " + 
            "If you would like to link an account, use the `/register` command to get started.")
        .setFooter({text: "NOTE: Multiple Clash accounts can be linked to the same Discord profile."})
        
        return embed;
}