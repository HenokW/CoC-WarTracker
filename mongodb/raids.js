const warTracker = require("../warTracker.js");
const { clanTag } = require("../config.json");
const database = require("./database.js");

module.exports.storeCapitalInfo = async function(capitalData) {
    console.log("-- -- -- Starting database upload (Clan Capital) -- -- --");

    //Setting history first, then going back and filling in the blanks
    await setHistory(capitalData);

    for(let j = 0; j < capitalData.items[0]?.members?.length || 0; j++) {
        let currentMember = capitalData.items[0].members[j];

        let newEntry = false;
        let mongoMemberData = await database.find(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, { tag: currentMember.tag });
        if(mongoMemberData == undefined || mongoMemberData == null) {
            mongoMemberData = _defaultData(currentMember);

            newEntry = true;
        }

        mongoMemberData.name = currentMember.name;
        mongoMemberData.totalGoldLooted += currentMember.capitalResourcesLooted;
        mongoMemberData.attacks += currentMember.attacks;
        mongoMemberData.missedAttacks += (6 - currentMember.attacks);

        mongoMemberData = await countAttacksPerDistrict(capitalData, mongoMemberData)

        mongoMemberData.attackLog.unshift({ 
            raidStartDate: capitalData.items[0].startTime,
            raidEndDate: capitalData.items[0].endTime,
            attacks: currentMember.attacks,
            goldLooted: currentMember.capitalResourcesLooted
        });

        if(newEntry)
            await database.add(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, mongoMemberData);
        else
            await database.update(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, { tag: mongoMemberData.tag }, mongoMemberData);

    }

    
    
    //Now we'll go through the clan list and check to see which memeber hasn't participated in capital raids
    const clanList = await warTracker.api({ endpoint: "clanMembers" });
    for(let i = 0; i < clanList.items.length; i++) {
        let found = capitalData.items[0].members.find(member => member.tag == clanList.items[i].tag);
        if(!found) {

            let memberData = await database.find(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, { tag: clanList.items[i].tag });

            let newEntry = false;
            if(memberData == undefined || memberData == null) {
                memberData = _defaultData(clanList.items[i]);

                newEntry = true;
            }
            
            memberData.missedAttacks += 6;
            memberData.attackLog.unshift({
                raidStartDate: capitalData.items[0].startTime,
                raidEndDate: capitalData.items[0].endTime,
                attacks: 0,
                goldLooted: 0
            });

            if(newEntry)
                await database.add(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, memberData);
            else
                await database.update(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, { tag: clanList.items[i].tag }, memberData);
        }
    }

    //await setHistory(capitalData);
    //database.client.close();
    console.log("-- -- -- Database upload finished (Clan Capital) -- -- --");
}

async function setHistory(data) {
    const currentRaid = data.items[0];

    let newEntry = false;
    let history = await database.find(database.DATABASE_NAME.clanCapital, database.COLLECTION.warhistory, { clanTag: `#${clanTag}` });
    if(history == undefined || history == null) {
        history = {
            clanTag: `#${clanTag}`,
            raidHistory: []
        }

        newEntry = true;
    }

    const clanList = await warTracker.api({ endpoint: "clanMembers" });

    let obj = {
        raidStartDate: currentRaid.startTime,
        raidEndDate: currentRaid.endTime,
        totalAttacks: currentRaid.totalAttacks,
        totalLootEarned: currentRaid.capitalTotalLoot,
        districtsKilled: currentRaid.enemyDistrictsDestroyed,
        raidCount: currentRaid.raidsCompleted,
        defenseCount: currentRaid?.defenseLog?.length || 0,
        clanMembers: clanList.items?.length || 0
    }

    history.raidHistory.unshift(obj);

    if(newEntry)
        await database.add(database.DATABASE_NAME.clanCapital, database.COLLECTION.warhistory, history);
    else
        await database.update(database.DATABASE_NAME.clanCapital, database.COLLECTION.warhistory, { clanTag: `#${clanTag}` }, history);
}

async function countAttacksPerDistrict(data, mongoMemberData) {
    for(let i = 0; i < data.items[0]?.attackLog?.length || 0; i++) {
        let attackLog = data.items[0].attackLog[i];

        for(let j = 0; j < attackLog.districts.length; j++) {
            for(let k = 0; k < attackLog.districts[j].attacks?.length || 0; k++) {
                if(attackLog.districts[j].attacks[k].attacker.tag == mongoMemberData.tag)
                    mongoMemberData.districtLog[attackLog.districts[j].id].attackCount++;
            }
        }
    }

    return mongoMemberData;
}

function _defaultData(currentMember) {
    let obj = {
        tag: currentMember.tag,
        name: currentMember.name,
        totalGoldLooted: 0,
        attacks: 0,
        missedAttacks: 0,
        districtLog: {
            70000000: { //Capital Peak
                attackCount: 0
            },
            70000001: { //Barbarian Camp
                attackCount: 0
            },
            70000002: { //Wizard Valley
                attackCount: 0
            },
            70000003: { //Balloon Lagoon
                attackCount: 0
            },
            70000004: { //Builder's Workshop
                attackCount: 0
            },
            70000005: { //Dragon Cliffs
                attackCount: 0
            },
            70000006: { //Golem Quarry
                attackCount: 0
            },
            70000007: { //Skeleton Park
                attackCount: 0
            },
            70000008: { //Goblin Mines
                attackCount: 0
            },
        },
        attackLog: [],
        search: 1
    }

    return obj;
}