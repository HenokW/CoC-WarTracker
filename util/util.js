const { EmbedBuilder } = require('discord.js');
const warTracker = require("../warTracker.js");

const ranks = [
    {
        name: "Legend League",
        goal: 5000,
        emote: "<:league_legend:1405994014066348135>"
    }, {
        name: "Titan League",
        goal: 4100,
        emote: "<:league_titan:1405994004398604398>"
    }, {
        name: "Champion League",
        goal: 3200,
        emote: "<:league_champion:1405993996022583369>"
    }, {
        name: "Master League",
        goal: 2600,
        emote: "<:league_master:1405993984131727612>"
    }, {
        name: "Crystal League",
        goal: 2000,
        emote: "<:league_crystal:1405993976519065610>"
    }, {
        name: "Gold League",
        goal: 1400,
        emote: "<:league_gold:1405993968608477194>"
    }, {
        name: "Silver League",
        goal: 800,
        emote: "<:league_silver:1405993961176436756>"
    }, {
        name: "Bronze League",
        goal: 400,
        emote: "<:league_bronze:1405993961176436756>"
    }, {
        name: "Default League",
        goal: 0,
        emote: "<:league_default:1405993947284766720>"
    }, 
]

module.exports.colors = { red: "#BF1717", green: "#17BF1A", blue: '#4287f5', default: "#be902e" }
module.exports.trophyToEmote = function(trophy) {
    for(let i = 0; i < ranks.length; i++) {
        if(trophy >= ranks[i].goal)
            return ranks[i];
    }
}

module.exports.errorMessage = function(msg) {
    let embed = new EmbedBuilder()
        .setColor('#BF1717')
        .setTitle(`<:error:1403494703407566908> ${msg.title}`)
        .setDescription(msg.content)
        .setFooter({text: "NOTE: Multiple Clash accounts can be linked to the same Discord profile."})
        
        return embed;
}

module.exports.isApiAvailable = async function() {
    const api = await warTracker.api({ endpoint: 'clanInfo' });
    if(typeof api.tag == 'undefined' || typeof api.tag == 'null')
        return false;

    return true;
}