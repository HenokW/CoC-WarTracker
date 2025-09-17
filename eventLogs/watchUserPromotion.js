const { EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require("../mongodb/database.js");
const warTracker = require('../warTracker.js');
const config = require("../config.json");
const util = require("../util/util.js");
require('dotenv').config();

const rankStrength = {
    coLeader: 2,
    admin: 1,
    member:  0
}

let CACHE_RECHECK_COUNT = 0;
const DELAY = 300_000; //5 minutes //300_000
const GUILD_ID = '1342617565259890709'; //TEST GUILD = 507681014638968832

if(typeof process.env.isWatchUserPromotionActive == 'undefined') process.env.isWatchUserPromotionActive = false;

module.exports.initalCheck = async function(client) {
    let assignToggle = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { toggle: true });
    if(!assignToggle) {
        assignToggle = { isEnabled: false, toggle: true }
        await database.add(database.DATABASE_NAME.bot, database.COLLECTION.roles, assignToggle);
    }

    if(assignToggle.isEnabled)
        process.env.isWatchUserPromotionActive = true;
    else
        process.env.isWatchUserPromotionActive = false;

    module.exports.watchClan(client);
}

module.exports.watchClan = async function(client) {
    if(process.env.isWatchUserPromotionActive != 'true') 
        return setTimeout(() => { this.watchClan(client) }, DELAY);

    const memberList = (await warTracker.api({ endpoint: 'clanInfo' })).memberList;
    //Should block anyone from using the toggle command IF no role has been set |OR| disable the event
    let rolesList = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { rolesList: true }); 
    let dbMemberHistory = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { membersList: true });

    if(!dbMemberHistory) {
        dbMemberHistory = { members: [], membersList: true }
        await database.add(database.DATABASE_NAME.bot, database.COLLECTION.roles, dbMemberHistory);
    }
    

    let queue = new Map();
    for(let i = 0; i < memberList.length; i++) {
        let found = dbMemberHistory.members.find(f => f.tag == memberList[i].tag);
        if(found) { 
            //console.log("- - We've found an existing entry - -");

            if(found.role != memberList[i].role) {
                //console.log(">> It looks like they have a different role");
                try {
                    const discordUser = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { accounts: found.tag.replace("#", '') });
                    if(typeof discordUser?.discord?.userId == 'undefined' || typeof discordUser?.discord?.userId == 'null')
                        continue;

                    found.name = memberList[i].name;
                    found.role = memberList[i].role;
                    
                    if(!queue.has(discordUser.discord.userId))
                        queue.set(discordUser.discord.userId, rankStrength[memberList[i].role]);

                    if(discordUser.accounts.length > 1) {
                        for(const userAccounts of discordUser.accounts) {
                            let foundDupeCheck = dbMemberHistory.members.find(element => element.tag == `#${userAccounts}`);
                            if(!foundDupeCheck)
                                continue;

                            let currentScore = queue.get(discordUser.discord.userId);

                            if(rankStrength[foundDupeCheck.role] > currentScore)
                                queue.set(discordUser.discord.userId, rankStrength[foundDupeCheck.role]);
                        }
                    }
                } catch(err) {
                    console.error(err);
                }
            } else {
                //console.log(">> It looks like they have the same role");
                // Do nothing
            }
        } else {
            //console.log("- - We have a new entry - -");
            dbMemberHistory.members.push({
                tag: memberList[i].tag,
                name: memberList[i].name,
                role: memberList[i].role
            });
            
            const discordUser = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { accounts: memberList[i].tag.replace("#", '') });
            if(typeof discordUser?.discord?.userId == 'undefined' || typeof discordUser?.discord?.userId == 'null')
                continue;

            if(!queue.has(discordUser.discord.userId))
                queue.set(discordUser.discord.userId, rankStrength[memberList[i].role]);

            if(discordUser.accounts.length > 1) {
                for(const userAccounts of discordUser.accounts) {

                    let foundDupeCheck = dbMemberHistory.members.find(element => element.tag == `#${userAccounts}`);
                    if(!foundDupeCheck)
                        continue;

                    let currentScore = queue.get(discordUser.discord.userId);

                    if(rankStrength[foundDupeCheck.role] > currentScore)
                        queue.set(discordUser.discord.userId, rankStrength[foundDupeCheck.role]);
                }
            }
        }
    }

    for(const [key, value] of queue) {
        let roleString = Object.keys(rankStrength).find(key => rankStrength[key] == value)

        console.log(`Giving ${key} the following role: ${roleString}`);
        await giveRole(client, rolesList, key, roleString);
    }

    //============================

    const removedUsers = new Map();
    for(let i = dbMemberHistory.members.length - 1; i >= 0; i--) {
        let entry = dbMemberHistory.members[i];

        let found = memberList.find(f => f.tag == entry.tag);
        if(!found) {
            console.log("- - It looks like someone has left the clan - -");
            dbMemberHistory.members.splice(i, 1);

            const discordUser = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { accounts: entry.tag.replace("#", '') });
            if(typeof discordUser?.discord?.userId == 'undefined' || typeof discordUser?.discord?.userId == 'null')
                continue;

            if(!removedUsers.has(discordUser.discord.userId))
                removedUsers.set(discordUser.discord.userId, true);

            //await removeAllRoles(client, rolesList, discordUser.discord.userId);
        }
    }

    queue.clear();

    for(const [key, value] of removedUsers) {
        const discordUser = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { 'discord.userId': key });
        if(typeof discordUser?.discord?.userId == 'undefined' || typeof discordUser?.discord?.userId == 'null')
                continue;

        let activeAccount = false;
        for(const userAccounts of discordUser.accounts) {
            let foundDupeCheck = dbMemberHistory.members.find(element => element.tag == `#${userAccounts}`);
            if(!foundDupeCheck) 
            continue;

            activeAccount = true;
            let currentScore = queue.get(discordUser.discord.userId);
            if(!currentScore)
                queue.set(discordUser.discord.userId, rankStrength[foundDupeCheck.role]);
            else {
                if(rankStrength[foundDupeCheck.role] > currentScore)
                    queue.set(discordUser.discord.userId, rankStrength[foundDupeCheck.role]);
            }
        }

        if(!activeAccount)
            await removeAllRoles(client, rolesList, discordUser.discord.userId);
    }

    for(const [key, value] of queue) {
        let roleString = Object.keys(rankStrength).find(key => rankStrength[key] == value)

        console.log(`Giving ${key} the following role: ${roleString}`);
        await giveRole(client, rolesList, key, roleString);
    }

    await database.update(database.DATABASE_NAME.bot, database.COLLECTION.roles, { membersList: true }, dbMemberHistory);

    await cacheCheck(client);
    return setTimeout(() => { this.watchClan(client) }, DELAY);
}

//Checks to make sure everyone still has their correct roles
async function cacheCheck(client) {
    const LIMIT = 6;

    console.log(`| CACHE_RECHECK_COUNT: ${CACHE_RECHECK_COUNT + 1}`);

    if(CACHE_RECHECK_COUNT < LIMIT)
        return CACHE_RECHECK_COUNT++;

    const memberList = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { membersList: true });
    if((memberList?.members?.length || 0) <= 0)
        return CACHE_RECHECK_COUNT = 0;

    let queue = new Map();
    const roles = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { rolesList: true });
    for(let i = 0; i < memberList.members.length; i++) {
        const discordUser = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { accounts: memberList.members[i].tag.replace('#', '') });
        if(typeof discordUser?.discord?.userId == 'undefined' || typeof discordUser?.discord?.userId == 'null')
            continue;

        //console.log(`- - Checking roles for: ${memberList.members[i].name} - ${memberList.members[i].tag}`);

        if(!queue.has(discordUser.discord.userId)) {
            queue.set(discordUser.discord.userId, rankStrength[memberList.members[i].role]);
            console.log(`Just set ${discordUser.discord.userId} to: ${rankStrength[memberList.members[i].role]}`);
        }
        else {
            let currentScore = queue.get(discordUser.discord.userId);
            if(rankStrength[memberList.members[i].role] > currentScore)
                queue.set(discordUser.discord.userId, rankStrength[memberList.members[i].role]);
        }
    }
       
    for(const [key, value] of queue) {
        let roleString = Object.keys(rankStrength).find(key => rankStrength[key] == value)

        console.log(`Giving ${key} the following role: ${roleString}`);
        await giveRole(client, roles, key, roleString);
    }

    return CACHE_RECHECK_COUNT = 0;
}


async function giveRole(client, rolesList, discordId, rank) {
    try {
        if(!rolesList[rank])
            return;

        const guild = await client.guilds.fetch(GUILD_ID);
        const newRole = await guild.roles.fetch(rolesList[rank]);
        if(typeof newRole?.name == 'undefined' || typeof newRole?.name == 'null')
            return;

        const member = await guild.members.fetch(discordId).catch(err => { return console.log(`| Unable to give role to ${discordId} (they must have left the server).`) });
        if(!member) return;
            await member.roles.add(newRole);
        
        let coLeadRank;
        let elderRank;
        let memberRank;

        switch(rank) {
            case 'coLeader':
                elderRank = await guild.roles.fetch(rolesList['admin']);
                memberRank = await guild.roles.fetch(rolesList['member']);

                if(typeof elderRank?.name != 'undefined' && typeof elderRank?.name != 'null')
                    await member.roles.remove(elderRank);

                if(typeof memberRank?.name != 'undefined' && typeof memberRank?.name != 'null')
                    await member.roles.remove(memberRank);
                break;

            case 'admin':
                coLeadRank = await guild.roles.fetch(rolesList['coLeader']);
                memberRank = await guild.roles.fetch(rolesList['member']);

                if(typeof coLeadRank?.name != 'undefined' && typeof coLeadRank?.name != 'null')
                    await member.roles.remove(coLeadRank);

                if(typeof memberRank?.name != 'undefined' && typeof memberRank?.name != 'null')
                    await member.roles.remove(memberRank);
                break;

            case 'member':
                coLeadRank = await guild.roles.fetch(rolesList['coLeader']);
                elderRank = await guild.roles.fetch(rolesList['admin']);

                if(typeof coLeadRank?.name != 'undefined' && typeof coLeadRank?.name != 'null')
                    await member.roles.remove(coLeadRank);

                if(typeof elderRank?.name != 'undefined' && typeof elderRank?.name != 'null')
                    await member.roles.remove(elderRank);
                break;
        }
    } catch(err) {
        console.error(err);
    }
}

async function removeAllRoles(client, rolesList, discordId) {
    //console.log("REMOVING");
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(discordId).catch(err => { return; });

        coLeadRank = await guild.roles.fetch(rolesList['coLeader']);
        if(typeof coLeadRank != 'undefined' && typeof coLeadRank != 'null')
            await member.roles.remove(coLeadRank);
        
        elderRank = await guild.roles.fetch(rolesList['admin']);
        if(typeof elderRank != 'undefined' && typeof elderRank != 'null')
            await member.roles.remove(elderRank);

        memberRank = await guild.roles.fetch(rolesList['member']);
        if(typeof memberRank != 'undefined' && typeof memberRank != 'null')
            await member.roles.remove(memberRank);

    } catch(err) {
        console.error(err);
    }
}

module.exports.removedAccountRoleCheck = async function(client, discordId) {
    if(process.env.isWatchUserPromotionActive != 'true')
        return;

    const rolesList = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { rolesList: true });
    await removeAllRoles(client, rolesList, discordId);
}


module.exports.staffListManager = async function(interaction) {
    if(!interaction.deferred)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral , withResponse: true });

    let staffList = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { rolesList: true });
    if(!staffList) {
        staffList = { coLeader: null, admin: null, member: null, rolesList: true };
        await database.add(database.DATABASE_NAME.bot, database.COLLECTION.roles, staffList);
    }

    const clan = await warTracker.api({ endpoint: 'clanInfo' });
    const embed = new EmbedBuilder()
        .setTitle(`${clan.name} - Staff List Manager`)
        .setColor(util.colors.default)
        .setDescription("The following ranks will automatically be assigned these Discord roles:")
        .setThumbnail(clan.badgeUrls.medium)
        .addFields(
            {name: 'Co-Leader', value: staffList.coLeader ? `<@&${staffList.coLeader}>` : 'None', inline: true},
            {name: 'Elder', value: staffList.admin ? `<@&${staffList.admin}>` : 'None', inline: true},
            {name: 'Member', value: staffList.member ? `<@&${staffList.member}>` : 'None', inline: true},
            {name: '', value: ''},
            {name: '', value: ''},
            {name: 'Would you like to edit this list?', value: '', inline: false}
        );

        const editButton = new ButtonBuilder()
            .setCustomId('edit')
            .setLabel('Edit Roles')
            .setStyle(ButtonStyle.Secondary);

        const clearButton = new ButtonBuilder()
            .setCustomId('clear')
            .setLabel('Clear Roles')
            .setStyle(ButtonStyle.Secondary);

        const closeButton = new ButtonBuilder()
            .setCustomId('close')
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(editButton, clearButton, closeButton);
        const msg = await interaction.editReply({ embeds: [embed], components: [row], withResponse: true });
        const filter = res => res.user.id == interaction.user.id;

        try {
            const msgResponse = await msg.awaitMessageComponent({ filter: filter, time: 30_000 });
            
            switch (msgResponse.customId) {
                case 'edit':
                    await msgResponse.update({ components: [] });
                    await editList(interaction, staffList);
                    break;

                case 'clear':
                    await msgResponse.update({ components: [] });
                    await clearRoleList(staffList);
                    return this.staffListManager(interaction);

                case 'close':
                    return await msgResponse.update({ content: 'Your changes have been saved', embeds: [], components: [] });
            }
        } catch(err) {
            await interaction.editReply({ content: 'Your changes have been saved', embeds: [], components: [] });
        } 
}

async function clearRoleList(staffList) {
    staffList.coLeader = null;
    staffList.admin = null;
    staffList.member = null;

    return await database.update(database.DATABASE_NAME.bot, database.COLLECTION.roles, { rolesList: true }, staffList);
}

async function editList(interaction, staffList, option) {
    if(typeof option == 'undefined') 
        option = 0;

    if(option < 0)
        option = 2;

    if(option > 2)
        option = 0;

    let role = {};
    switch(option) {
        case 0:
            role.text = 'Co-Leader';
            role.name = 'coLeader';
            break;

        case 1:
            role.text = 'Elder';
            role.name = 'admin';
            break;

        case 2:
            role.text = 'Member';
            role.name = 'member';
            break;
    }


    const embed = new EmbedBuilder()
        .setTitle(`Currently editing ${role.text}'s role`)
        .setColor(util.colors.default)
        .setDescription(`${role.text}'s will automatically receive the following role: ${staffList[role.name] ? "<@&" + staffList[role.name] + ">" : 'None'}`)
        .addFields(
            {name: '', value: ''},
            {name: '', value: ''},
            {name: `Which Discord role would you like to give to ${role.text}'s?`, value: ''},
        )
        .setFooter({ text: 'Use the arrow keys to swap between different ranks' });

    

    let roleMenu = new StringSelectMenuBuilder()
        .setCustomId('roleMenu')
        .setPlaceholder('Select a role');

    const roleList = await interaction.guild.roles.fetch();
    roleList.forEach(guildRole => {
        if(guildRole.managed == false && guildRole.name != '@everyone') {
            roleMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(guildRole.name)
                    .setValue(guildRole.id)
            )
        }
    });

    const backButton = new ButtonBuilder()
        .setCustomId('back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Primary);

    const leftButton = new ButtonBuilder()
        .setCustomId('left')
        .setLabel('🠈')
        .setStyle(ButtonStyle.Secondary);

    const rightButton = new ButtonBuilder()
        .setCustomId('right')
        .setLabel('🠊')
        .setStyle(ButtonStyle.Secondary);

    const cancelButton = new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger);

    const roleRow = new ActionRowBuilder().addComponents(roleMenu);
    const row = new ActionRowBuilder().addComponents(backButton, leftButton, rightButton, cancelButton);
    const roleMsg = await interaction.editReply({ embeds: [embed], components: [roleRow, row] });
    const filter = res => res.user.id == interaction.user.id;

    try {
        const roleResponse = await roleMsg.awaitMessageComponent({ filter: filter, time: 30_000 });
        switch(roleResponse.customId) {
            case 'roleMenu':
                staffList[role.name] = roleResponse.values[0];
                await database.update(database.DATABASE_NAME.bot, database.COLLECTION.roles, { rolesList: true }, staffList);
                await roleResponse.update({ components: [] });
                return editList(interaction, staffList, option);
                break;

            case 'left':
                await roleResponse.update({ components: [] });
                return editList(interaction, staffList, --option);
                break;

            case 'right':
                await roleResponse.update({ components: [] });
                return editList(interaction, staffList, ++option);
                break;

            case 'cancel':
                return await roleResponse.update({ content: 'Your changes have been saved', embeds: [], components: [] })
                break;

            case 'back':
                await roleResponse.update({ components: [] });
                return module.exports.staffListManager(interaction);
                break;
        }
        
    } catch(err) {
        console.log(err);
        await roleMsg.editReply({ content: 'Your changes have been saved', embeds: [], components: [] });
    }
} 