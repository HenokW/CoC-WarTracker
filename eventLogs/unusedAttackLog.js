const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, MessageFlags, Embed, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require("../mongodb/database.js");
const warTracker = require('../warTracker.js');
const config = require("../config.json");
const util = require("../util/util.js");
require('dotenv').config();

//House Hydra will be forced

if(typeof process.env.isUnusedAttackLogActive == 'undefined') process.env.isUnusedAttackLogActive = false;

const LOG_NAME = 'ua_warning';
const notifyingOptions = [{
        text: '2 Hours',
        timeInSeconds: 7200
    }, {
        text: '4 Hours',
        timeInSeconds: 14400
    }, {
        text: '6 Hours',
        timeInSeconds: 21600
    }, {
        text: '8 Hours',
        timeInSeconds: 28800
    }, {
        text: '12 Hours',
        timeInSeconds: 43200
    }
]

module.exports.setup = async function(interaction, channelId) {
    const setupEmbed = new EmbedBuilder()
        .setTitle("Unused Attack Warning - Setup Manager")
        .setColor(util.colors.default)
        .addFields(
            {name: "How it works", value: `I will send a list of those who still have remaining attacks in war, hours before war ends.\n 
                Anyone with their account linked to their discord will also be pinged, provided that they have access to <#${channelId}>.`}
        )
        .setThumbnail('https://henokw.xyz/resources/coc/bot/cog-cluster.png');

    let timeSelector = new StringSelectMenuBuilder()
        .setCustomId('timeSelector')
        .setPlaceholder('Select a time');

    notifyingOptions.forEach(option => {
        timeSelector.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(option.text)
                .setDescription(`${option.text} before war ends`)
                .setValue(option.timeInSeconds.toString())
        );
    });

    const row = new ActionRowBuilder().addComponents(timeSelector);
    const replyMessage = await interaction.editReply({ embeds: [setupEmbed], flags: MessageFlags.Ephemeral, components: [row] });
    const filter = res => res.user.id == interaction.user.id;

    try {
        const selectorResponse = await replyMessage.awaitMessageComponent({ filter: filter, time: 30_000 });
        await selectorResponse.update({ components: [] });

        const logCheck = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: `#${config.clanTag}` });
        const foundLogCheck = logCheck?.activeLogs.find(log => log.type == LOG_NAME);
        if(typeof foundLogCheck != 'undefined' && typeof foundLogCheck != 'null') {
            const overwriteVerification = await verifyOverwrite(interaction, foundLogCheck);
            if(!overwriteVerification) 
                return;
        }

        const successEmbed = new EmbedBuilder()
            .setColor(util.colors.green)
            .setTitle(`Successfully enabled **Unused Attack Warning** in <#${channelId}>\n\nClan members will be notified ${selectorResponse.values[0] / 3600} hours before war ends.`)
            .setThumbnail('https://henokw.xyz/resources/coc/bot/happy-barb.png')
            .setFooter({text: "To disable logging, use the /log command again"});

        
        await interaction.editReply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral, components: [] });

        await addToQueue(channelId, selectorResponse.values[0]);
        const channel = await replyMessage.guild.channels.cache.get(channelId);
        await channel.send({ embeds: [successEmbed] });
    } catch(err) {
        console.error(err);

        setupEmbed.setFooter({ text: "Timed out while waiting for a response. Please use the command again." }).setColor(util.colors.red);
        await interaction.editReply({ embeds: [ setupEmbed ], flags: MessageFlags.Ephemeral, components: [] });
    }
}

async function verifyOverwrite(interaction, log) {
    const message = `It looks like you already have an active log of this type in <#${log.notifyChannelId}>. Are you sure you would like to overwrite this?`;
    
    const yesButton = new ButtonBuilder()
        .setCustomId('yes')
        .setLabel('Yes')
        .setStyle(ButtonStyle.Success);

    const noButton = new ButtonBuilder()
        .setCustomId('no')
        .setLabel('No')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(yesButton, noButton);
    const confirmationMessage = await interaction.editReply({ embeds: [], content: message, components: [row] });
    const filter = res => res.user.id == interaction.user.id;

    try {
        const confirmationResponse = await confirmationMessage.awaitMessageComponent({ filter: filter, time: 30_000 });
        await confirmationResponse.update({ components: [], content: "Successfully overwritten." });
        
        switch(confirmationResponse.customId) {
            case 'yes':
                return true;

            case 'no':
                await interaction.editReply({ content: 'Interaction has been cancelled, nothing has been saved.' });
                return false;
        }
    } catch(err) {
        await interaction.editReply({ content: 'Interaction has been cancelled, nothing has been saved.', components: [] });
    }
}

async function addToQueue(channelId, notifyTimer) {
    let newDbEntry = false;
    let dbLog = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: '#2RC09CL8Y' }); 
    if(!dbLog) {
        newDbEntry = true;
        dbLog = {
            clanTag: '#2RC09CL8Y',
            activeLogs: []
        }
    }

    let allowOverwrite = false;
    dbLog?.activeLogs.forEach(log => {
        if(log.type == LOG_NAME)
            allowOverwrite = true;
    });

    let currentWar = await warTracker.api({ endpoint: 'clan' });
    if(!currentWar || currentWar?.state == 'notInWar') {
        const currentCWL = await warTracker.api({ endpoint: 'cwl' });
        if(currentCWL?.state == 'inWar') {
            foundTag = await findWarTag(currentCWL.rounds);
            currentWar = foundTag.round;
        }
    }

    let logObj = {};
    if(currentWar?.state == 'preparation' || currentWar?.state == 'inWar') {
        const formattedString = currentWar.endTime.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d+)(Z)$/, 
            '$1-$2-$3T$4:$5:$6.$7$8'
        );

        console.log(`Formatted: ${formattedString}`);
        const endTimeS = Math.floor((new Date(formattedString).getTime()) / 1000);
        logObj = {
            type: LOG_NAME,
            warEndTime: currentWar.endTime,
            notifyTimeAt: parseInt(endTimeS) - parseInt(notifyTimer),
            notifyChannelId: channelId,
            delay: parseInt(notifyTimer),
            isCWL: currentWar.isCWL ? true : false,
            activeWarTag: currentWar.isCWL ? foundTag.warTag : null,
            hasNotified: false
        };
    } else { 
        //Not in war, but still want to start the queue
        logObj = {
            type: LOG_NAME,
            warEndTime: undefined,
            notifyTimeAt: undefined,
            notifyChannelId: channelId,
            delay: parseInt(notifyTimer),
            isCWL: false,
            activeWarTag: null,
            hasNotified: false
        };
    }

    if(allowOverwrite) {
        dbLog?.activeLogs.forEach((log, i) => {
            if(log.type == LOG_NAME)
                dbLog.activeLogs[i] = logObj;
        });
    } else
        dbLog.activeLogs.push(logObj);
        
    if(newDbEntry)
        await database.add(database.DATABASE_NAME.bot, database.COLLECTION.log, dbLog);
    else
        await database.update(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: '#2RC09CL8Y' }, dbLog);

    //Start loop
    process.env.isUnusedAttackLogActive = true;
}

module.exports.timeCheck = async function(client) {
    console.log('- CURRENTLY CHECKING TIME -');
    const dbLog = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: '#2RC09CL8Y' });
    dbLog.activeLogs.forEach(async log => {
        if(log.type == LOG_NAME) {
            const currentTime = Math.floor((new Date().getTime()) / 1000);
            if((log.warEndTime != null && log.warEndTime != undefined) && (currentTime >= log.notifyTimeAt) && (!log.hasNotified)) {
                await sendNotification(client, log);
            } else if(log.hasNotified == true || log.warEndTime == null || log.warEndTime == undefined) {
                let currentCWL = await warTracker.api({ endpoint: 'cwl' });
                if(currentCWL?.state == 'inWar') {
                    let newRound = await findWarTag(currentCWL.rounds);
                    war = await warTracker.api({ endpoint: 'warTags', warTag: newRound.warTag.replace('#', '') });

                    const isNewCWL = await checkNewWar(war, log)
                    if(isNewCWL != false)
                        return isNewCWL;
                } else {
                    let currentWar = await warTracker.api({ endpoint: 'clan' });
                    if(currentWar?.state == 'inWar' || currentWar?.state == 'preparation') {
                        const isNewWar = await checkNewWar(currentWar, log)
                        if(isNewWar != false)
                            return isNewWar;
                    }
                }
                //Check for regular wars
            }
        }
    });

    if(dbLog.activeLogs.length <= 0)
        process.env.isUnusedAttackLogActive = false;
}

async function checkNewWar(war, log) {
    if(war.endTime != log.warEndTime) {
        console.log("It looks like we're in a different war, resetting log");

        const channelId = log.notifyChannelId;
        const notifyTimer = log.delay;

        await removeLog();
        return addToQueue(channelId, notifyTimer);
    }

    return false;
}

async function sendNotification(client, logObj) {
    //Check to make sure we're still in the same war before posting
    console.log(`Sending notification - (${LOG_NAME})`);

    let war;
    if(logObj.isCWL) {
        war = await warTracker.api({ endpoint: 'warTags', warTag: logObj.activeWarTag.replace('#', '') });
        if(war.opponent.tag.includes(config.clanTag)) {
            let tempClan = war.clan;
            war.clan = war.opponent;
            war.opponent = tempClan;
        }
    }
    else
        war = await warTracker.api({ endpoint: 'clan' });

    if(!war?.state) 
        return console.error(">> There was an issue while using the api");

    if(war.state == 'warEnded') {
        console.log("War has ended, set notified value to TRUE");
        await updateNotified();
    }

    let attackList = "";
    let tagList = "";
    let overflowCount = 0;
    const memberList = war.clan.members;
    const attacksPerMember = war?.attacksPerMember || 1;

    memberList.sort((a,b) => a.mapPosition - b.mapPosition);
    for(let i = 0; i < memberList.length; i++) {
        if((memberList[i].attacks?.length || 0) < attacksPerMember) {
            let botUsers = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { accounts: memberList[i].tag.replace('#', '') });
            
            


            if(attackList.length <= 950) {
                tagList += botUsers?.discord?.userId ? `<@${botUsers?.discord?.userId}>, ` : '';
                attackList += `- ([2;31m${attacksPerMember - (memberList[i].attacks?.length || 0)}[0m/${attacksPerMember}) | [1;2m${memberList[i].name}[0m - [0;30m${memberList[i].tag}[0m\n`;         
            } else
                overflowCount++;
        }
    }

    if(overflowCount != 0)
        attackList += `and ${overflowCount} more`;

    //Removes the last comma in the list
    tagList = tagList.slice(0, tagList.length - 2) + tagList.slice(tagList.length - 1);

    const currentTime = Math.floor(new Date().getTime() / 1000);
    const formattedString = logObj.warEndTime.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d+)(Z)$/, 
            '$1-$2-$3T$4:$5:$6.$7$8'
        );

    const endTime = Math.floor( (new Date(formattedString).getTime()) / 1000 );
    const hr = Math.floor((endTime - currentTime) / 3600);
    const min = Math.floor(((endTime - currentTime) % 3600) / 60);
    const sec = (endTime - currentTime) % 60;


    if(attackList != '') { //Show time left
        const embed = new EmbedBuilder()
            .setTitle('House Hydra | Attack Reminder')
            .setColor(util.colors.default)
            .setThumbnail(war.clan.badgeUrls.medium)
            .setDescription('The following clan members have attacks remaining:')
            .addFields(
                {name: "Remaining attack list", value: (`\`\`\`ansi\n${attackList}\`\`\``)}, 
                {name: "Discord mentions", value: tagList},
                {name: "Time left in war", value: `${hr}h ${min}m ${sec}s` })
            .setTimestamp();

        const channel = await client.channels.fetch(logObj.notifyChannelId);
        if(!channel) {
            await removeLog();
        } else {
            let msg = await channel.send({ content: `Discord mentions: ${tagList}`, embeds: [embed], allowedMentions: { parse: ['users'] } });
            //await msg.edit({ content: "" })
        }
    }

    await updateNotified();
}

async function updateNotified() {
    console.log(`Updated log, set it to TRUE - (${LOG_NAME})`);

    const refreshLog = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: `#${config.clanTag}` });
    for(const logs of refreshLog.activeLogs) {
        if(logs.type == LOG_NAME)
            logs.hasNotified = true;
    }

    return await database.update(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: `#${config.clanTag}` }, refreshLog); 
}

async function removeLog() {
    const logFile = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: `#${config.clanTag}` });

    for(let i = 0; i < logFile.activeLogs.length; i++) {
        if(logFile.activeLogs[i].type == LOG_NAME) {
            logFile.activeLogs.splice(i, 1);
        }
    }

    await database.update(database.DATABASE_NAME.bot, database.COLLECTION.log, { clanTag: `#${config.clanTag}` }, logFile);
}

async function findWarTag(rounds) {
    for(let i = rounds.length - 1; i >= 0; i--) {
        for(let j = 0; j < rounds[i].warTags.length; j++) {
            if(rounds[i].warTags[0] == '#0') continue;
            
            let cwlRounds = await warTracker.api({ endpoint: 'warTags', warTag: rounds[i].warTags[j].replace('#', '') });
            if(cwlRounds.state == 'inWar') {
                cwlRounds.isCWL = true;

                if(cwlRounds.clan.tag.includes(config.clanTag))
                    return {round: cwlRounds, warTag: rounds[i].warTags[j]};

                if(cwlRounds.opponent.tag.includes(config.clanTag)) {
                    let temp = cwlRounds.clan;
                    cwlRounds.clan = cwlRounds.opponent;
                    cwlRounds.opponent = temp;

                    return {round: cwlRounds, warTag: rounds[i].warTags[j]};
                }
            }
        }
    }
}
