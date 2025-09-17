const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const database = require("../mongodb/database.js");
const warTracker = require("../warTracker.js");
const util = require("../util/util.js");

/**
 * 
 * NEED TO FIX/LOOK AT:
 * - Valid Clash tags, but incorrect/fake profiles
 *  + API will fail 3x times and take a long time to respond (Should only allow 1 fail?).
 */
const COLORS = { red: "#BF1717", green: "#17BF1A", default: "#806c54" }

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription("Link a Clash of Clans account to your Discord profile.")
        .addSubcommand( cmd => 
            cmd
                .setName('account')
                .setDescription("Link a Clash of Clans account to your Discord profile.")
                .addStringOption(option => option.setName('playertag').setDescription("Your in-game player tag that can be found within your profile.").setRequired(true))
                .addStringOption(option => option.setName('token').setDescription("The API Token provided to you that could be found under your in-game settings menu.").setRequired(true)))
        .addSubcommand( cmd => cmd.setName('help').setDescription("Basic help on how to use the 'register' command.") ),
        

    async execute(interaction) {
        const cmdType = interaction.options._subcommand;

        //Subcommands -- If they use the 'help' subcommand, only send the basic guide embed
        if(cmdType == 'help') {
            const embed = helpMessage(false, null, interaction);
            return await interaction.reply({embeds: [embed.embed], files: [embed.file], flags: MessageFlags.Ephemeral })
        }

        await interaction.deferReply({ withResponse: true });
        const apiCheck = await util.isApiAvailable();
        if(!apiCheck) {
            const errorEmbed = util.errorMessage({ title: "API Error", content: "There was an issue while trying to use the API. Clash of Clans may currently be under maintenance. Please try again later, and if the issue persists, let staff know." });
            return await interaction.editReply({ embeds: [errorEmbed] });
        }

        let tagResponse = interaction.options.getString('playertag').toUpperCase().replaceAll('O', '0');
        const tokenResponse = interaction.options.getString('token');

        //This should never happen since we require both options, but just incase?
        //Could remove
        if(!tokenResponse || !tagResponse) { 
            const embed = helpMessage(true, 'missingItems', interaction);
            return await interaction.editReply({embeds: [embed.embed], files: [embed.file], flags: MessageFlags.Ephemeral })
        }

        // Testing player tag validity
        const validTagRegex = /[A-Z0-9]+$/;
        if(tagResponse.charAt(0) == '#')
            tagResponse = tagResponse.substring(1, tagResponse.length);

        if(!validTagRegex.test(tagResponse)) { //If we fail, kick em out

            const embed = helpMessage(true, 'invalidTag', interaction);
            return await interaction.editReply({embeds: [embed.embed], files: [embed.file], flags: MessageFlags.Ephemeral })
        }
        
        // First check to see if we've already linked the provided account
        let userBotStorage = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { 'discord.userId': interaction.user.id });
        if(userBotStorage?.accounts?.includes(tagResponse)) {
            const embed = helpMessage(true, 'dupeAccount', interaction);
            return await interaction.editReply({embeds: [embed.embed], flags: MessageFlags.Ephemeral })
        }

        const res = await warTracker.api({ endpoint: "verifytoken", allowRetry: false, verifyPlayerTag: tagResponse, verifyPlayerToken: tokenResponse })
        
        //Found a profile with the matching player tag, but they've provided the incorrect token
        if(res?.status == 'invalid') {
            const embed = helpMessage(true, 'invalidToken', interaction);
            return await interaction.editReply({embeds: [embed.embed], files: [embed.file], flags: MessageFlags.Ephemeral })
        }

        if(res?.status != 'ok') {
            const embed = helpMessage(true, 'invalidTag', interaction);
            return await interaction.editReply({embeds: [embed.embed], files: [embed.file], flags: MessageFlags.Ephemeral })
        } else if(res?.status == 'ok') {
            
            let newEntry = false;
            if(!userBotStorage) {
                newEntry = true;

                userBotStorage = database.defaultWarlogObject();
                userBotStorage.discord.userId = interaction.user.id;
                userBotStorage.discord.username = interaction.user.username;
                userBotStorage.discord.avatar = interaction.user.avatar;
                userBotStorage.discord.globalName = interaction.user.globalName;
            }

            userBotStorage.accounts.push(tagResponse);
            userBotStorage = database.updateWarlogUsers(interaction.user, userBotStorage);

            if(newEntry)
                await database.add(database.DATABASE_NAME.bot, database.COLLECTION.bot, userBotStorage);
            else
                await database.update(database.DATABASE_NAME.bot, database.COLLECTION.bot, { 'discord.userId': interaction.user.id }, userBotStorage);

            const successEmbed = await successMessage(res.tag, );
            return await interaction.editReply({ embeds: [successEmbed] });
        }
    }
}

function helpMessage(isError, errorType, interaction) {
    const settingsImg = new AttachmentBuilder('./assets/images/settings-api-guide.png');
    const profileImg = new AttachmentBuilder('./assets/images/profile-api-guide.png');

    let img;
    let embed = new EmbedBuilder()
        .setColor(isError ? COLORS.red : COLORS.default)
        .addFields({name: "How to register:", value: "To find your API Token, go into 'More Settings' within your in-game settings menu. " +
            "Near the bottom you'll find the 'API Token' section. From there you can `[Show] > [Copy]` your token and use the " +
            "`/register account <your-player-tag> <your-api-token>` command to link your account."})
        .setImage('attachment://settings-api-guide.png')
        //.setThumbnail('https://cdn.discordapp.com/app-icons/1366956876050468915/0ecef6bb6230f6ba64d3ab92356664ed.png?size=256')
        .setFooter({text: "NOTE: Multiple Clash accounts can be linked to the same Discord profile."})
        img = settingsImg;
        
        if(isError) {
            switch(errorType) {
                case 'missingItems':
                    embed.setTitle("<:error:1403494703407566908> Missing Player Tag and/or API Token.")
                        .setDescription("Please make sure you've provided your valid profile tag, as well as your API Token _**(see below)**_.");
                    
                    img = settingsImg;
                    break;

                case 'invalidTag':
                    embed.setTitle("<:error:1403494703407566908> Invalid player tag provided")
                        .setDescription("You can find your tag under your name in your profile _**(see below)**_. If on mobile you can copy your tag directly as well.")
                        .setImage('attachment://profile-api-guide.png');

                    img = profileImg;
                    break;

                case 'invalidToken':
                    embed.setTitle("<:error:1403494703407566908> Invalid API Token provided");
                    img = settingsImg;
                    break;

                case 'dupeAccount':
                    embed.setTitle("<:error:1403494703407566908> Account already linked")
                        .setDescription("It looks like you've already linked this account to your profile. If you'd like to remove this account instead, use the `/remove` command instead.")
                        .spliceFields(0, 1);
                    break;
            }
        }
        return {embed: embed, file: img};
}

async function successMessage(tag) {
    const playerInfo = await warTracker.api({ endpoint: "player", playerTag: tag.replace('#', '') });
    const league = util.trophyToEmote(playerInfo.bestTrophies);

    let embed = new EmbedBuilder()
        .setAuthor({ name: `${playerInfo.name} - ${playerInfo.tag}`, iconURL: playerInfo?.league?.iconUrls?.small || "https://henokw.xyz/resources/coc/leagues/defaultleague.png" })
        .setTitle('<:check:1404699283332005909> Successfully linked your account')
        .setColor(COLORS.green)
        .addFields(
            { name: 'Level', value: `<:exp:1404699292526186568> ${playerInfo.expLevel}`, inline: true },
            { name: 'Trophies', value: `<:trophy:1404691536901308507> ${playerInfo.trophies}`, inline: true },
            { name: 'Highest Trophies', value: `${league.emote} ${playerInfo.bestTrophies}`, inline: true }
        )
        .setThumbnail(`https://henokw.xyz/resources/coc/TH${playerInfo.townHallLevel}.png`);

    return embed;

} 