const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require("canvas");
const database = require("../mongodb/database.js");
const warTracker = require("../warTracker.js");
const util = require("../util/util.js");

const STARS = {
    0: {
        star: ''
    },
    1: {
        star: '☆'
    },
    2: {
        star: '☆☆'
    },
    3: {
        star: '☆☆☆'
    },
};


module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription("View your tracked War or Clan Capital stats")
        .addStringOption(option => 
            option.setName('category')
                .setDescription("Which stat would you like to view.")
                .setRequired(true)
                .addChoices(
                    { name: 'War', value: 'selection_war' },
                    { name: 'Clan War League', value: 'selection_cwl'},
                    { name: 'Clan Capital', value: 'selection_cc' }
                )),

    async execute(interaction) { //Wrap in try/catch
        await interaction.deferReply({ withResponse: true });
        const apiCheck = await util.isApiAvailable();
        if(!apiCheck) {
            const errorEmbed = util.errorMessage({ title: "API Error", content: "There was an issue while trying to use the API. Clash of Clans may currently be under maintenance. Please try again later, and if the issue persists, let staff know." });
            return await interaction.editReply({ embeds: [errorEmbed] });
        }

        const selected = interaction.options.getString('category');
        const userProfile = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.bot, { 'discord.userId': interaction.user.id });
        
        if(!userProfile || userProfile?.accounts?.length <= 0)
            return await interaction.editReply({ embeds: [errorMessage()], withResponse: true });

        
        let selectedAcc;
        if(userProfile.accounts.length >= 2)
            selectedAcc = await accountSelector(interaction, userProfile);
        else
            selectedAcc = userProfile.accounts[0];


        switch(selected) {
            case 'selection_war':
                const statEmbed = await warStats(selectedAcc);
                await interaction.editReply({ embeds: [statEmbed] });
                break;
            case 'selection_cwl':
                const statEmbedCWL = await cwlStats(selectedAcc);
                await interaction.editReply({ embeds: [statEmbedCWL] })
                break;
            case 'selection_cc':
                const statEmbedCC = await clanCapitalStats(selectedAcc);
                if(!statEmbedCC.file)
                    return await interaction.editReply({ embeds: [statEmbedCC.embed] });

                await interaction.editReply({ embeds: [statEmbedCC.embed], files: [ statEmbedCC.file ] });
                break;
        }
    }
}

async function warStats(tag) {
    if(tag.charAt(0) == '#')
        tag = tag.substring(1, tag.length);

    const account = await warTracker.api({ endpoint: 'player', playerTag: tag });
    const dbUser = await database.find(database.DATABASE_NAME.war, database.COLLECTION.members, { tag: `#${tag}` });

    if(!dbUser) {
        const text = `The following account is currently in a clan that doesn't have tracking enabled: ${account.name} - #${tag}`;
        const errorMessage = util.errorMessage({ title: "Tracking not enabled", content: text });
        return errorMessage;
    }

    if((dbUser?.warLog?.length || 0) <= 0) {
        const text = `The following account doesn't have any wars logged: ${account.name} - #${tag}`;
        const errorMessage = util.errorMessage({ title: "No wars logged", content: text });
        return errorMessage;
    }

    //Attack stuff
    let starCount = new Map();

    let avgStars = 0;
    let avgDestruction = 0;
    let avgAttackDuration = 0; //Not all attacks have thisq

    let last5_avgStars = 0;
    let last5_avgDestruction = 0;
    let last5_avgAttackDuration = 0; //Not all attacks have this

    //Last 5 attack results (show TH picture?)
    let attCount = 0;
    let durationCount = 0;
    for(let i = dbUser?.warLog?.length - 1 || 0; i >= 0; i--) {
        let war = dbUser.warLog[i];
        for(let j = 0; j < war?.attacks?.length || 0; j++) {
            avgStars += war.attacks[j].stars;
            avgDestruction += war.attacks[j].destructionPercent;
            attCount++;

            starCount.set(war.attacks[j].stars, (starCount.get(war.attacks[j].stars) || 0) + 1);

            if(typeof war.attacks[j].duration != 'undefined') {
                 avgAttackDuration += war.attacks[j].duration;
                 durationCount++;
            }

            if(attCount <= 10) {
                last5_avgStars += war.attacks[j].stars;
                last5_avgDestruction += war.attacks[j].destructionPercent;

                if(typeof war.attacks[j].duration != 'undefined')
                    last5_avgAttackDuration += war.attacks[j].duration;
            }
        }
    }

    let avgDefenseStars = 0;
    let avgDefenseDestruction = 0;

    //Defense Loop
    let defCount = 0;
    for(let i = dbUser?.defenseLog?.length - 1 || 0; i >= 0; i--) {
        let defenses = dbUser.defenseLog[i];
        for(let j = 0; j < defenses?.log?.length || 0; j++) {
            avgDefenseStars += defenses.log[j].stars;
            avgDefenseDestruction += defenses.log[j].destructionPercent;
            defCount++;
        }
    }


    if(attCount != 0) {
        avgStars = (avgStars / attCount).toFixed(2);
        avgDestruction = (avgDestruction / attCount).toFixed(2);
        avgAttackDuration /= durationCount;

        last5_avgStars = (last5_avgStars / (attCount < 10 ? attCount : 10)).toFixed(2);
        last5_avgDestruction = (last5_avgDestruction / (attCount < 10 ? attCount : 10)).toFixed(2);
        last5_avgAttackDuration /= durationCount < 10 ? attCount : 10;
    }

    if(defCount != 0) {
        avgDefenseStars = (avgDefenseStars / defCount).toFixed(2);
        avgDefenseDestruction = (avgDefenseDestruction / defCount).toFixed(2);
    }

    const statEmbed = new EmbedBuilder()
        .setColor(util.colors.default)
        .setTitle(`${account.name}'s War Stats - ${account.tag}`)
        .addFields(
            {name: "Overall War Stats", value: ""},
            {name: "Attacks Made", value: `<:target:1408261383174230078> ${dbUser?.attacks.toString() || '0'}`, inline: true},
            {name: "Attacks Missed", value: `<:alert:1409998142719660142> ${dbUser?.missedAttacks.toString()}` || '0', inline: true},
            {name: "Average Stars", value: `<:star:1409952332677906463> ${avgStars.toString()}`, inline: true},
            {name: "Average Destruction", value: `<:broken:1409985112921210931> ${avgDestruction.toString()}%`, inline: true},
            {name: "Average Attack Time", value: `<:clock:1408263723889594489> ${formatTime(avgAttackDuration)}`, inline: true},
            {name: "", value: ""},
            {name: "3-Star Attacks", value: `<:triplestar:1410009527708946552> ${starCount.get(3) || 0}`, inline: true},
            {name: "2-Star Attacks", value: `<:doublestar:1410009541323657306> ${starCount.get(2) || 0}`, inline: true},
            {name: "1-Star Attacks", value: `<:singlestar:1410009550391873686> ${starCount.get(1) || 0}`, inline: true},
            {name: "0-Star Attacks", value: `<:nostar:1410013095614484683> ${starCount.get(0) || 0}`, inline: true},
            {name: "", value: ""},
            {name: "", value: ""},
            {name: "", value: ""},
            {name: "Last 10 War Attack Stats", value: ""},
            {name: "Average Stars", value: `<:star:1409952332677906463> ${last5_avgStars.toString()}`, inline: true},
            {name: "Average Destruction", value: `<:broken:1409985112921210931> ${last5_avgDestruction.toString()}%`, inline: true},
            {name: "Average Attack Time", value: `<:clock:1408263723889594489> ${formatTime(last5_avgAttackDuration)}`, inline: true},
            {name: "", value: ""},
            {name: "", value: ""},
            {name: "", value: ""},
            {name: "Defense Stats", value: ""},
            {name: "Average Stars", value: `<:silverstar:1410013995976495155> ${avgDefenseStars.toString()}`, inline: true},
            {name: "Average Destruction", value: `<:broken:1409985112921210931> ${avgDefenseDestruction.toString()}%`, inline: true},
            
            //{name: "Most Defenses Taken: 7/16/2025", value: `<:shield:1408268017460187186> Attacked 3 time(s)\n\n**Defense 1:** ☆☆☆ (100%)\n**Defense 2:** ☆☆ (61%)\n**Defense 3:** ☆☆ (84%)`, inline: false},
        )
        .setThumbnail("https://henokw.xyz/resources/coc/bot/war/WarIcon.png")
        .setFooter({ text: `Tracking since: ${dbUser?.warLog[0]?.date || "N/A"}  •  Wars Logged: ${dbUser?.warLog?.length || 0}` })

        if(dbUser?.defenseLog.length > 1) {
            let defLog = dbUser?.defenseLog;
            defLog.sort((a,b) => b.log.length - a.log.length);
            defLog[0].log.sort((a,b) => a.attackOrder - b.attackOrder);

            let defText = `<:shield:1408268017460187186> Attacked ${defLog[0].log.length} time(s)\n\n`;
            for(let i = 0; i < defLog[0].log.length; i++)
                defText += `**Defense ${i + 1}:** ${STARS[defLog[0].log[i].stars].star} - (${defLog[0].log[i].destructionPercent}%)\n`
            
            statEmbed.addFields(
                {name: `Most Defenses Taken: ${defLog[0].date}`, value: defText},
            )
        }
        
        return statEmbed;
}

async function cwlStats(tag) {
    if(tag.charAt(0) == '#')
        tag = tag.substring(1, tag.length);

    const account = await warTracker.api({ endpoint: 'player', playerTag: tag });
    const dbUser = await database.find(database.DATABASE_NAME.war, database.COLLECTION.members, { tag: `#${tag}` });

    if(!dbUser) {
        const text = `The following account is currently in a clan that doesn't have tracking enabled: ${account.name} - #${tag}`;
        const errorMessage = util.errorMessage({ title: "Tracking not enabled", content: text });
        return { embed: errorMessage };
    }

    if((dbUser?.warLog?.length || 0) <= 0) {
        const text = `The following account doesn't have any wars logged: ${account.name} - #${tag}`;
        const errorMessage = util.errorMessage({ title: "No wars logged", content: text });
        return errorMessage;
    }

    const clanWarHistory = await database.find(database.DATABASE_NAME.war, database.COLLECTION.warhistory, { clanTag: '2RC09CL8Y' });
    if((clanWarHistory?.log?.length || 0) <= 0) {
        const text = "It looks like your clan doesn't have any wars logged.";
        const errorMessage = util.errorMessage({ title: "Unable to provide Stats", content: text });
        return { embed: errorMessage };
    }

    let cwlHistory = [];
    for(let i = 0; i < clanWarHistory.log.length; i++) {
        if(clanWarHistory.log[i].isCWL == true)
            cwlHistory.push(clanWarHistory.log[i].date);
    }

    //Attack stuff
    let starCount = new Map();

    let avgStars = 0;
    let avgDestruction = 0;
    let avgAttackDuration = 0; //Not all attacks have this

    let attCount = 0;
    let durationCount = 0;

    let missedCount = 0;
    
    for(let i = dbUser.warLog.length - 1; i >= 0; i--) {
        if(!cwlHistory.find(date => date == dbUser.warLog[i].date))
            continue;

        missedCount++;

        for(let j = 0; j < (dbUser.warLog[i]?.attacks?.length || 0); j++) {
            avgStars += dbUser.warLog[i].attacks[j].stars;
            avgDestruction += dbUser.warLog[i].attacks[j].destructionPercent;
            attCount++;

            missedCount--;

            starCount.set(dbUser.warLog[i].attacks[j].stars, (starCount.get(dbUser.warLog[i].attacks[j].stars) || 0) + 1);

            if(typeof dbUser.warLog[i].attacks[j].duration != 'undefined') {
                avgAttackDuration += dbUser.warLog[i].attacks[j].duration;
                durationCount++;
            }
        }
    }

    if(attCount != 0) {
        avgStars = (avgStars / attCount).toFixed(2);
        avgDestruction = (avgDestruction / attCount).toFixed(2);
        avgAttackDuration /= durationCount;
    }

    const statEmbed = new EmbedBuilder()
        .setColor(util.colors.default)
        .setTitle(`${account.name}'s CWL Stats - ${account.tag}`)
        .addFields(
            {name: "Overall CWL Stats", value: ""},
            {name: "Attacks Made", value: `<:target:1408261383174230078> ${attCount.toString() || '0'}`, inline: true},
            {name: "Attacks Missed", value: `<:alert:1409998142719660142> ${missedCount.toString() || '0'}`, inline: true},
            {name: "Average Stars", value: `<:star:1409952332677906463> ${avgStars.toString()}`, inline: true},
            {name: "Average Destruction", value: `<:broken:1409985112921210931> ${avgDestruction.toString()}%`, inline: true},
            {name: "Average Attack Time", value: `<:clock:1408263723889594489> ${formatTime(avgAttackDuration)}`, inline: true},
            {name: "", value: ""},
            {name: "", value: ""},
            {name: "", value: ""},
            {name: "3-Star Attacks", value: `<:triplestar:1410009527708946552> ${starCount.get(3) || 0}`, inline: true},
            {name: "2-Star Attacks", value: `<:doublestar:1410009541323657306> ${starCount.get(2) || 0}`, inline: true},
            {name: "1-Star Attacks", value: `<:singlestar:1410009550391873686> ${starCount.get(1) || 0}`, inline: true},
            {name: "0-Star Attacks", value: `<:nostar:1410013095614484683> ${starCount.get(0) || 0}`, inline: true},
            {name: "", value: "", inline: true},
        )
        .setThumbnail("https://henokw.xyz/resources/coc/bot/war/war-scenery.png")
        .setFooter({ text: `Tracking since: ${dbUser?.warLog[0]?.date || "N/A"}` })

    return statEmbed;
}

async function clanCapitalStats(tag) {
    if(tag.charAt(0) == '#')
        tag = tag.substring(1, tag.length);

    const account = await warTracker.api({ endpoint: 'player', playerTag: tag });
    const dbUser = await database.find(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, { tag: `#${tag}` });

    if(!dbUser) {
        const text = `The following account is currently in a clan that doesn't have tracking enabled: ${account.name} - #${tag}`;
        const errorMessage = util.errorMessage({ title: "Tracking not enabled", content: text });
        return { embed: errorMessage };
    }

    const img = await createClanCapitalCanvas(dbUser.districtLog);

    const attLog = dbUser.attackLog;
    attLog.sort((a,b) => b.goldLooted - a.goldLooted);

    const statEmbed = new EmbedBuilder()
        .setColor(util.colors.default)
        .setTitle(`${account.name}'s Clan Capital Stats - ${account.tag}`)
        .addFields(
            {name: "Overall Clan Capital Stats", value: ""},
            {name: "Raids", value: `<:raid:1410158715390136400> ${dbUser.attackLog.length}`, inline: true},
            {name: "Attacks Made", value: `<:raidMedal:1410159491403743365> ${dbUser.attacks}`, inline: true},
            {name: "Attacks Missed", value: `<:alert:1409998142719660142> ${dbUser.missedAttacks}`, inline: true},
            {name: "Total Gold Looted", value: `<:raidGoldStack:1410159481006063647> ${dbUser.totalGoldLooted.toLocaleString()}`, inline: true},
            {name: "Average Gold Raided", value: `<:raidGoldStack2:1410310899692212384> ${Math.floor(dbUser.totalGoldLooted / dbUser.attackLog.length).toLocaleString()}`, inline: true},
            {name: "Most Gold Raided", value: `<:raidGoldStack:1410159481006063647> ${attLog[0].goldLooted.toLocaleString()}`, inline: true},
            {name: "", value: ``},
            {name: "", value: ``},
            {name: "Raid Attack Distribution", value: ``},
        )
        .setFooter({ text: `Tracking since: ${formatDateString(dbUser.attackLog[dbUser.attackLog.length - 1].raidEndDate, true) || 'N/A'}  •  Raids Logged: ${dbUser?.attackLog?.length || 0}` })
        .setImage('attachment://pic.png');

    return { embed: statEmbed, file: img }
}

async function createClanCapitalCanvas(log) {
    const canvas = createCanvas(1000, 1000);
    const ctx = canvas.getContext('2d');
    const canvasBg =  await loadImage("./assets/images/cc-stats-base.png");

    registerFont('fonts/clash-regular.otf', { family: 'Clash' });

    ctx.drawImage(canvasBg, 0, 0, 1000, 1000);
    ctx.font = 'bold 70px "Clash"';
    ctx.fillStyle = 'white';

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = '#A82529';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;

    // Capital Peak
    ctx.strokeText(`${log['70000000'].attackCount || 0}`, 465, 200);
    ctx.fillText(`${log['70000000'].attackCount || 0}`, 465, 200);
    ctx.strokeText(`${log['70000000'].attackCount || 0}`, 465, 200);

    // Barbarian Camp
    ctx.strokeText(`${log['70000001'].attackCount || 0}`, 675, 370);
    ctx.fillText(`${log['70000001'].attackCount || 0}`, 675, 370);
    ctx.strokeText(`${log['70000001'].attackCount || 0}`, 675, 370);

    // Wizard Valley
    ctx.strokeText(`${log['70000002'].attackCount || 0}`, 475, 460);
    ctx.fillText(`${log['70000002'].attackCount || 0}`, 475, 460);
    ctx.strokeText(`${log['70000002'].attackCount || 0}`, 475, 460);

    // Balloon Lagoon
    ctx.strokeText(`${log['70000003'].attackCount || 0}`, 305, 620);
    ctx.fillText(`${log['70000003'].attackCount || 0}`, 305, 620);
    ctx.strokeText(`${log['70000003'].attackCount || 0}`, 305, 620);

    // Builder's Workshop
    ctx.strokeText(`${log['70000004'].attackCount || 0}`, 605, 650);
    ctx.fillText(`${log['70000004'].attackCount || 0}`, 605, 650);
    ctx.strokeText(`${log['70000004'].attackCount || 0}`, 605, 650);

    // Dragon Cliffs
    ctx.strokeText(`${log['70000005'].attackCount || 0}`, 825, 570);
    ctx.fillText(`${log['70000005'].attackCount || 0}`, 825, 570);
    ctx.strokeText(`${log['70000005'].attackCount || 0}`, 825, 570);

    // Golem Quarry
    ctx.strokeText(`${log['70000006'].attackCount || 0}`, 120, 755);
    ctx.fillText(`${log['70000006'].attackCount || 0}`, 120, 755);
    ctx.strokeText(`${log['70000006'].attackCount || 0}`, 120, 755);

    // Skeleton Park
    ctx.strokeText(`${log['70000007'].attackCount || 0}`, 425, 805);
    ctx.fillText(`${log['70000007'].attackCount || 0}`, 425, 805);
    ctx.strokeText(`${log['70000007'].attackCount || 0}`, 425, 805);

    // Goblin Mines
    ctx.strokeText(`${log['70000008'].attackCount || 0}`, 760, 800);
    ctx.fillText(`${log['70000008'].attackCount || 0}`, 760, 800);
    ctx.strokeText(`${log['70000008'].attackCount || 0}`, 760, 800);

    /*
    ctx.font = 'bold 52px Clash';
    ctx.strokeText('Clan Capital Attack Count', 500, 920);
    ctx.fillText('Clan Capital Attack Count', 500, 920);
    ctx.strokeText('Clan Capital Attack Count', 500, 920);
    */
    
    const testImage = new AttachmentBuilder(canvas.toBuffer(), { name: 'pic.png' });
    return testImage;
}

async function accountSelector(interaction, user) {
     const embed = new EmbedBuilder()
        .setTitle("Account Manager")
        .setColor("#806c54")
        .setDescription("Which Clash account would you like to select?")
        .setThumbnail('https://cdn-assets-eu.frontify.com/s3/frontify-enterprise-files-eu/eyJwYXRoIjoic3VwZXJjZWxsXC9maWxlXC9kV2hLU2doNjRIUzJiS1Zwb2EyQi5wbmcifQ:supercell:XRSzxsrO6qMO1TIj_PM-XS2zeGL99Kpcu5mZVvkGiWQ?width=2400')
        .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.avatarURL()});

    let accountSelector = new StringSelectMenuBuilder()
        .setCustomId('accountSelector')
        .setPlaceholder("Select an account");
        
    for(const acc of user.accounts) {
        const accountInfo = await warTracker.api({ endpoint: 'player', playerTag: acc });

        accountSelector.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(`#${acc}`)
                .setDescription(`Town Hall ${accountInfo.townHallLevel} | ${accountInfo.name}`)
                .setValue(acc)
        )
    }

    const row = new ActionRowBuilder().addComponents(accountSelector);
    const menuMessage = await interaction.editReply({ embeds: [embed], components: [row], withResponse: true });
    const menuCollectorFilter = ( res => res.user.id == interaction.user.id );

    try {
        const menuResponse = await menuMessage.awaitMessageComponent({ filter: menuCollectorFilter, time: 30_000 });
        await interaction.editReply({ embeds: [embed], components: [], withResponse: true });
        return menuResponse.values[0];
    } catch(err) {
        embed.setFooter({ text: "Timed out while waiting for a response, please try again." });
        await interaction.editReply({ embeds: [embed], components: [], withResponse: true });
        return null;
    } 
}

function errorMessage(type) {
    let embed = new EmbedBuilder()
        .setColor('#BF1717')
        .setTitle("<:error:1403494703407566908> No accounts found")
        .setDescription("It looks like you don't have any Clash of Clans accounts linked to your profile. " + 
            "If you would like to link an account, use the `/register` command to get started.")
        .setFooter({text: "NOTE: Multiple Clash accounts can be linked to the same Discord profile."})
        
        return embed;
}

function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes}m ${seconds}s`;
}

function formatDateString(time, returnYear) {
    const formattedString = time.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d+)(Z)$/, 
        '$1-$2-$3T$4:$5:$6.$7$8'
    );

    const date = new Date(formattedString);

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();

    if(returnYear)
        return `${month}/${day}/${year}`;

    return `${month}/${day}`;
}