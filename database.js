const { mongodb_uri, clanTag } = require("./config.json");
const { MongoClient } = require("mongodb");

const DATABASE_NAME = "HouseHydra";
const COLLECTION = { members: "members", warhistory: "war-history" }

const client = new MongoClient(mongodb_uri);

module.exports.storeInfo = async function(warData) {
    try {
        // -- Prepare everything for storage first -- //
        let month = new Date().getMonth();
        let day = new Date().getDate();
        let year = new Date().getFullYear();

        let currDate = `${month+1}/${day}/${year}`;
        let result;

        //Win result
        if(warData.clan.stars > warData.opponent.stars)
            result = "Win";
        else if(warData.clan.stars < warData.opponent.stars)
            result = "Loss";
        else 
            result = "Tie";

        const membersList = warData.clan.members;
        const playerArr = await _findAll(COLLECTION.members, { search: 1 });


        console.log("-- -- -- Starting database upload -- -- --");

        let newEntry = 0, oldEntry = 0;
        for(let i = 0; i < warData.clan.members.length; i++) {
            let playerdb = playerArr.find(player => player.tag == membersList[i].tag);
            
            if(playerdb == null || playerdb == undefined) {
                playerdb = {
                    tag: membersList[i].tag,
                    name: membersList[i].name,
                    attacks: membersList[i].attacks?.length || 0,
                    missedAttacks: warData.attacksPerMember - (membersList[i].attacks?.length || 0),

                    warLog: [],
                    search: 1
                }
            } else {
                playerdb.name = membersList[i].name;
                playerdb.attacks += (membersList[i].attacks?.length || 0);
                playerdb.missedAttacks = playerdb.missedAttacks + (warData.attacksPerMember - (membersList[i].attacks?.length || 0));
            }


            //Adding attacks 
            playerdb.warLog[playerdb.warLog.length] = {
                date: currDate,
                attacks: []
            }

            for(let j = 0; j < membersList[i].attacks?.length; j++) {
                let opponent = warData.opponent.members.find(member => member.tag == membersList[i].attacks[j].defenderTag);
                playerdb.warLog[playerdb.warLog.length - 1].attacks[j] = {
                    stars: membersList[i].attacks[j].stars,
                    destructionPercent: membersList[i].attacks[j].destructionPercentage,
                    opponentTH: opponent.townhallLevel
                }
            }

            if(playerArr.find(player => player.tag == membersList[i].tag) == undefined) {
                await _add(COLLECTION.members, playerdb);
                newEntry++;
            }
            else {
                await _update(COLLECTION.members, {tag: membersList[i].tag}, playerdb);
                oldEntry++;
            }
        }

        console.log(`> Player info uploaded <\n| New Database Entries: ${newEntry}\n| Updated Entries: ${oldEntry}`);

        
        // -- Moving onto clan history stuff now

        let historyExists = true;
        let clanHistory = await _find(COLLECTION.warhistory, { clanTag: clanTag });
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
            await _update(COLLECTION.warhistory, { clanTag: clanTag }, clanHistory);
        else
            await _add(COLLECTION.warhistory, clanHistory);
        console.log("> Clan history uploaded <")

        console.log("-- -- -- Database upload finished -- -- --");
    } catch(err) {
        console.error("There was an issue while trying to upload data to MongoDB", err);
    } finally {
        client.close();
    }

}


async function _add(collection, data) {
    try {
        const database = await _createConnection();
        const list = database.collection(collection);

        return await list.insertOne(data);
    } catch(err) {
        throw err;
    }
}

async function _update(collection, query, data) {
    try {
        const database = await _createConnection();
        const list = database.collection(collection);

        return await list.updateOne(query, { $set: data});
    } catch(err) {
        throw err;
    }
}

async function _find(collection, query) {
    try {
        const database = await _createConnection();
        const list = database.collection(collection);

        return await list.findOne( query );
    } catch(err) {
        throw err;
    }
}

async function _findAll(collection, query) {
    try {
        const database = await _createConnection();
        const list = database.collection(collection);

        return await list.find( query ).toArray();
    } catch(err) {
        throw err;
    }
}

async function _createConnection(failedAmount) {
    try {

        await client.connect();
        const db = client.db(DATABASE_NAME)

        return db;

    } catch(err) {
        if(typeof failedAmount != "number")
            failedAmount = 0;

        if(failedAmount < 3) {
            failedAmount++;
        
        await new Promise((resolve) => setTimeout(resolve, 1500));
        console.log(`Failed connecting to Mongodb Database || Attempt: ${failedAmount}`);
        return _createConnection(failedAmount);
        
        } else {
            throw err;
        }
    }
}