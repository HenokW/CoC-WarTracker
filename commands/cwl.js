const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont  } = require("canvas");
const warTracker = require("../warTracker.js");
const util = require("../util/util.js");

const HEIGHT = 1393;
const WIDTH = 1850;

module.exports = {
    cooldown: 60,
    data: new SlashCommandBuilder()
        .setName('cwl')
        .setDescription('View the town hall rundown for the current cwl pool'),

    async execute(interaction) {
        await interaction.deferReply({ withResponse: true });
        const apiCheck = await util.isApiAvailable();
        if(!apiCheck) {
            const errorEmbed = util.errorMessage({ title: "API Error", content: "There was an issue while trying to use the API. Clash of Clans may currently be under maintenance. Please try again later, and if the issue persists, let staff know." });
            return await interaction.editReply({ embeds: [errorEmbed] });
        }

        const tags = await findTags();
        if(!tags)
            return await interaction.editReply({content: "Unable to find your CWL pool. It looks like your clan hasn't signed-up for CWL yet."})

        const warBreakdown = await tallyTotal(tags);

        const img = await createImage(warBreakdown);
        interaction.editReply({ files: [img] });
    }
}

async function findTags() {
    const cwl = await warTracker.api({ endpoint: 'cwl' });
    if(!cwl || cwl.status == 404)
        return null;

    let obj = [];
    if((cwl?.rounds?.length || 0) <= 0)
        return false;
    
    for(let i = cwl.rounds.length - 1; i >= 0; i--) {
        if(cwl.rounds[i].warTags[0] == '#0') 
            continue;

        let round = await warTracker.api({ endpoint: 'warTags', warTag: cwl.rounds[i].warTags[0].replace('#', '') });
         //Prep is returning live rotations for upcoming wars (Not sure if this'll work for the 1st war in cwl)
        if(round.state == 'inWar' || round.state == 'preparation')
            return {tags: cwl.rounds[i].warTags, round: i + 1};

    }

    return null;
}

async function tallyTotal(info) {
    let obj = [];
    let clanData;
    let enemyClan;
    const tags = info.tags;
    for(let i = 0; i < tags.length; i++) {
        const war = await warTracker.api({ endpoint: 'warTags', warTag: tags[i].replace('#', '') });
        
        clanData = {
            clan: war.clan.name,
            tag: war.clan.tag,
            clanBadge: war.clan.badgeUrls.medium,
            isEnemy: false,
            thData: new Map()
        }

        if(war.opponent.tag == '#2RC09CL8Y')
            clanData.isEnemy = true;

        for(let j = 0; j < war.clan.members.length; j++)
            clanData.thData.set( war.clan.members[j].townhallLevel, (clanData.thData.get(war.clan.members[j].townhallLevel) || 0) + 1 );

        obj.push(clanData);

        //==========

        clanData = {
            clan: war.opponent.name,
            tag: war.opponent.tag,
            clanBadge: war.opponent.badgeUrls.medium,
            isEnemy: false,
            thData: new Map()
        }

        if(war.clan.tag == '#2RC09CL8Y')
            clanData.isEnemy = true;

        for(let j = 0; j < war.opponent.members.length; j++)
            clanData.thData.set( war.opponent.members[j].townhallLevel, (clanData.thData.get(war.opponent.members[j].townhallLevel) || 0) + 1 );

        obj.push(clanData);
    }

    return {obj: obj, round: info.round};
}

async function createImage(war) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    const canvasBaseBG = await loadImage('./assets/images/cwl-base.png');

    registerFont('fonts/clash-regular.otf', { family: 'Clash' });

    const yDiff = 90;

    ctx.drawImage(canvasBaseBG, 0, 0, WIDTH, HEIGHT);
    ctx.font = '72px "Clash", "Sans"';
    ctx.fillStyle = 'white';

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;

    //let badge = await loadImage(CLAN_BADGE);//470
    const round = war.round;
    war = war.obj;

    ctx.strokeText(`Townhall Distribution for War #${round}`, WIDTH / 2, 330);
    ctx.fillText(`Townhall Distribution for War #${round}`, WIDTH / 2, 330);

    for(let i = 0; i < war.length; i++) {
        if(war[i].tag == '#2RC09CL8Y') {
            const ourClan = war.splice(i, 1);
            war.unshift(ourClan[0]);
            break;
        }
    }

    let cwlSize = 0;
    let ourThScore = 0;
    for(const [key, value] of war[0].thData.entries())
        cwlSize += value;


    for(let i = 0; i < war.length; i++) {
        ctx.fillStyle = 'white';
        ctx.font = '32px "Clash", "Sans"';
        ctx.textAlign = 'left';

        ctx.lineWidth = 2;
        ctx.shadowOffsetY = 4;

        // --CLAN NAME-- //
        let clanBadge = await loadImage(war[i].clanBadge);
        ctx.drawImage(clanBadge, 286 - (60 / 2), (670 + (90 * i)) - (60 / 2), 60, 60);
        ctx.strokeText(war[i].clan, 320, 670 + (90 * i));
        ctx.fillText(war[i].clan, 320, 670 + (90 * i));

        const TH1617 = (war[i].thData.get(17) || 0) + (war[i].thData.get(16) || 0);
        const TH1514 = (war[i].thData.get(15) || 0) + (war[i].thData.get(14) || 0);
        const TH1312 = (war[i].thData.get(13) || 0) + (war[i].thData.get(12) || 0);

        // --GROUPED TH COUNTS-- //
        ctx.fillStyle = '#e63a4d';
        ctx.font = '56px Clash';
        ctx.textAlign = 'center';

        ctx.lineWidth = 2;
        ctx.shadowOffsetY = 4;

        ctx.strokeText(TH1617, 755, 687 + (90 * i));
        ctx.fillText(TH1617, 755, 687 + (90 * i));

        ctx.fillStyle = '#e6a33a';
        ctx.strokeText(TH1514, 961, 687 + (90 * i));
        ctx.fillText(TH1514, 961, 687 + (90 * i));

        ctx.fillStyle = '#a3e63a';
        ctx.strokeText(TH1312, 1167, 687 + (90 * i));
        ctx.fillText(TH1312, 1167, 687 + (90 * i));

        ctx.fillStyle = '#ffffff';
        ctx.strokeText(cwlSize - (TH1617 + TH1514 + TH1312), 1355, 687 + (90 * i));
        ctx.fillText(cwlSize - (TH1617 + TH1514 + TH1312), 1355, 687 + (90 * i));

        // --TH SEPERATION-- //
        ctx.fillStyle = '#e63a4d';
        ctx.font = '24px Clash';
        
        ctx.lineWidth = 1.5;
        ctx.shadowOffsetY = 3;
        ctx.strokeText(`(${war[i].thData.get(17) || 0} - ${war[i].thData.get(16) || 0})`, 755, 642 + (90 * i));
        ctx.fillText(`(${war[i].thData.get(17) || 0} - ${war[i].thData.get(16) || 0})`, 755, 642 + (90 * i));

        ctx.fillStyle = '#e6a33a';
        ctx.strokeText(`(${war[i].thData.get(15) || 0} - ${war[i].thData.get(14) || 0})`, 961, 642 + (90 * i));
        ctx.fillText(`(${war[i].thData.get(15) || 0} - ${war[i].thData.get(14) || 0})`, 961, 642 + (90 * i));

        ctx.fillStyle = '#a3e63a';
        ctx.strokeText(`(${war[i].thData.get(13) || 0} - ${war[i].thData.get(12) || 0})`, 1167, 642 + (90 * i));
        ctx.fillText(`(${war[i].thData.get(13) || 0} - ${war[i].thData.get(12) || 0})`, 1167, 642 + (90 * i));

        if(war[i].isEnemy) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeText('<- Upcoming matchup', 1580, 670 + (90 * i));
            ctx.fillText('<- Upcoming matchup', 1580, 670 + (90 * i));
        }

        let thScore = getTownhallScore(war[i]);
        if(war[i].tag == '#2RC09CL8Y')
            ourThScore = thScore;
        else {
            const boxSize = 55;
            const scoreDifference = getColorDifference(ourThScore - thScore);

            ctx.fillStyle = scoreDifference;
            ctx.lineWidth = 3;
            ctx.shadowOffsetY = 0;

            ctx.strokeRect(150, (670 + (90 * i)) - boxSize / 2, boxSize, boxSize);
            ctx.fillRect(150, (670 + (90 * i)) - boxSize / 2, boxSize, boxSize);
        }
    }

    const finalImage = new AttachmentBuilder(canvas.toBuffer(), { name: 'img.png' });
    return finalImage;
}

function getTownhallScore(war) {
    let score = 0;
    
    for(const [key, value] of war.thData.entries())
        score += (key * value);

    return score;
}

function getColorDifference(score) {
    score = Math.max(-8, Math.min(8, score));

    const range = (score + 8) / 16;
    const hue = 0 + (120 * range);

    return `hsl(${hue}, 100%, 50%)`;
}