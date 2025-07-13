const { clanTag } = require("../config.json");
const database = require("./database.js");

module.exports.storeWarInfo = async function(warData) {

    // -- Prepare everything for storage first -- //
    let month = new Date().getMonth();
    let day = new Date().getDate();
    let year = new Date().getFullYear();

    let currDate = `${month+1}/${day}/${year}`;
    let result;

    //Win result
    if(warData.clan.stars == warData.opponent.stars) {
        if(warData.clan.destructionPercentage > warData.opponent.destructionPercentage)
            result = "Win";
        else if(warData.clan.destructionPercentage < warData.opponent.destructionPercentage)
            result = "Loss";
        else
            result = "Tie";
    } else {
        if(warData.clan.stars > warData.opponent.stars)
            result = "Win";
        else
            result = "Loss";
    }


    const membersList = warData.clan.members;
    const playerArr = await database.findAll(database.DATABASE_NAME.war, database.COLLECTION.members, { search: 1 });


    console.log("-- -- -- Starting War database upload -- -- --");

    let newEntry = 0, oldEntry = 0;
    for(let i = 0; i < warData.clan.members.length; i++) {
        let playerdb = playerArr.find(player => player.tag == membersList[i].tag);
        
        //-- Inital stat --//
        if(playerdb == null || playerdb == undefined) {
            playerdb = _defaultClanMember(membersList[i]);

            playerdb.attacks = membersList[i].attacks?.length || 0;
            playerdb.missedAttacks = warData.attacksPerMember - (membersList[i].attacks?.length || 0);
            
        } else {
            playerdb.name = membersList[i].name;
            playerdb.attacks += (membersList[i].attacks?.length || 0);
            playerdb.missedAttacks = playerdb.missedAttacks + (warData.attacksPerMember - (membersList[i].attacks?.length || 0));
        }

        //-- Adding Defenses --//
        let defense = {
            date: currDate,
            log: []
        }

        for(let j = 0; j < (warData.opponent?.members?.length || 0); j++) {
            let enemy = warData.opponent.members[j];
            for(let k = 0; k < (enemy?.attacks?.length || 0); k++) {
                if(enemy.attacks[k].defenderTag == playerdb.tag) {
                    defense.log.push({
                        enemyName: enemy.name,
                        enemyTag: enemy.tag,

                        stars: enemy.attacks[k].stars,
                        destructionPercent: enemy.attacks[k].destructionPercentage,
                        myTH: warData.clan.members[i].townhallLevel,
                        enemyTH: enemy.townhallLevel,
                        myMapPosition: warData.clan.members[i].mapPosition,
                        enemyMapPosition: enemy.mapPosition,
                        attackOrder: enemy.attacks[k].order,
                        duration: enemy.attacks[k].duration
                    });
                }
            }
        }

        playerdb.defenseLog.push(defense); //Change "defenceLog" to "defenseLog"


        //-- Adding attacks --// 
        playerdb.warLog[playerdb.warLog.length] = {
            date: currDate,
            attacks: []
        }

        for(let j = 0; j < membersList[i].attacks?.length; j++) {
            let opponent = warData.opponent.members.find(member => member.tag == membersList[i].attacks[j].defenderTag);
            playerdb.warLog[playerdb.warLog.length - 1].attacks[j] = {
                stars: membersList[i].attacks[j].stars,
                destructionPercent: membersList[i].attacks[j].destructionPercentage,
                opponentTH: opponent.townhallLevel,
                mapPosition: opponent.mapPosition,
                attackOrder: membersList[i].attacks[j].order,
                duration: membersList[i].attacks[j].duration
            }
        }

        if(playerArr.find(player => player.tag == membersList[i].tag) == undefined) {
            await database.add(database.DATABASE_NAME.war, database.COLLECTION.members, playerdb);
            newEntry++;
        }
        else {
            await database.update(database.DATABASE_NAME.war, database.COLLECTION.members, {tag: membersList[i].tag}, playerdb);
            oldEntry++;
        }
    }

    console.log(`> Player info uploaded <\n| New Database Entries: ${newEntry}\n| Updated Entries: ${oldEntry}`);

    
    // -- Moving onto clan history stuff now

    let historyExists = true;
    let clanHistory = await database.find(database.DATABASE_NAME.war, database.COLLECTION.warhistory, { clanTag: clanTag });
    if(clanHistory == null) {
        clanHistory = {
            clanTag: clanTag,
            log: []
        }

        historyExists = false;
    }

    const history_obj = {
        date: currDate,
        isCWL: warData.attacksPerMember == 1 ? true : false,
        wonWar: result,
        warSize: warData.teamSize,

        clan: {
            stars: warData.clan.stars,
            destructionPercent: warData.clan.destructionPercentage,
            attacksUsed: warData.clan.attacks
        },
        opponent: {
            name: warData.opponent.name,
            tag: warData.opponent.tag,
            level: warData.opponent.clanLevel,
            stars: warData.opponent.stars,
            destructionPercent: warData.opponent.destructionPercentage,
            attacksUsed: warData.opponent.attacks
        }
    }

    clanHistory.log[clanHistory.log.length] = history_obj;
    if(historyExists)
        await database.update(database.DATABASE_NAME.war, database.COLLECTION.warhistory, { clanTag: clanTag }, clanHistory);
    else
        await database.add(database.DATABASE_NAME.war, database.COLLECTION.warhistory, clanHistory);
    console.log("> Clan history uploaded <")

    console.log("-- -- -- Database upload finished -- -- --");
}

function _defaultClanMember(member) {
    const playerdb = {
        tag: member.tag,
        name: member.name,
        attacks: 0,
        missedAttacks: 0,

        warLog: [],
        defenseLog: [],
        search: 1
    }

    return playerdb;
}

/**
 * 
 * 
 * 
 * 
 * 
 *  if(nodeData.lastRaidEndDate != clanCapitalInfo.items[0].endTime) {
         //Let's store everything in MongoDB first, then use that info for sheets
         await raids.storeCapitalInfo(clanCapitalInfo);
         const mongoData = await database.findAll(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, { search: 1 });
         const clanList = await api({ endpoint: "clanMembers" });
 
         //Mongo data, "capital", clanList, Mongo History Data
         sheet.run(mongoData, "capital", clanList, capitalHistory);
 
     }


 */