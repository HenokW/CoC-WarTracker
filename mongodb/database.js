const { mongodb_uri, clanTag } = require("../config.json");
const { MongoClient } = require("mongodb");

const DATABASE_NAME = { war: "HouseHydra", clanCapital: "ClanCapital", bot: "Warlog" };
const COLLECTION = { members: "members", warhistory: "war-history", bot: "users", log: "log-file", roles: 'role-tracker' }

const client = new MongoClient(mongodb_uri);

exports.DATABASE_NAME = DATABASE_NAME;
exports.COLLECTION = COLLECTION;
exports.client = client;

module.exports.storeInfo = async function(warData) {
    try {
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
        const playerArr = await findAll(DATABASE_NAME.war, COLLECTION.members, { search: 1 });


        console.log("-- -- -- Starting Capital database upload -- -- --");

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
                await add(DATABASE_NAME.war, COLLECTION.members, playerdb);
                newEntry++;
            }
            else {
                await update(DATABASE_NAME.war, COLLECTION.members, {tag: membersList[i].tag}, playerdb);
                oldEntry++;
            }
        }

        console.log(`> Player info uploaded <\n| New Database Entries: ${newEntry}\n| Updated Entries: ${oldEntry}`);

        
        // -- Moving onto clan history stuff now

        let historyExists = true;
        let clanHistory = await find(DATABASE_NAME.war, COLLECTION.warhistory, { clanTag: clanTag });
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
            await update(DATABASE_NAME.war, COLLECTION.warhistory, { clanTag: clanTag }, clanHistory);
        else
            await add(DATABASE_NAME.war, COLLECTION.warhistory, clanHistory);
        console.log("> Clan history uploaded <")

        console.log("-- -- -- Database upload finished -- -- --");
    } catch(err) {
        console.error("There was an issue while trying to upload data to MongoDB", err);
    } finally {
        client.close();
    }

}

async function add(db, collection, data) {
    try {
        const database = await createConnection(db);
        const list = database.collection(collection);

        return await list.insertOne(data);
    } catch(err) {
        throw err;
    }
}

async function update(db, collection, query, data) {
    try {
        const database = await createConnection(db);
        const list = database.collection(collection);

        return await list.updateOne(query, { $set: data});
    } catch(err) {
        throw err;
    }
}

async function find(db, collection, query) {
    try {
        const database = await createConnection(db);
        const list = database.collection(collection);

        return await list.findOne( query );
    } catch(err) {
        throw err;
    }
}

async function findAll(db, collection, query) {
    try {
        const database = await createConnection(db);
        const list = database.collection(collection);

        return await list.find( query ).toArray();
    } catch(err) {
        throw err;
    }
}

async function createConnection(db, failedAmount) {
    try {

        await client.connect();
        const connection = client.db(db)

        return connection;

    } catch(err) {
        if(typeof failedAmount != "number")
            failedAmount = 0;

        if(failedAmount < 3) {
            failedAmount++;
        
        await new Promise((resolve) => setTimeout(resolve, 1500));
        console.log(`Failed connecting to Mongodb Database || Attempt: ${failedAmount}`);
        return createConnection(db, failedAmount);
        
        } else {
            throw err;
        }
    }
}

module.exports.updateWarlogUsers = function(discordUser, storage) {
    storage.discord.username = discordUser.username;
    storage.discord.avatar = discordUser.avatar;
    storage.discord.globalName = discordUser.globalName;

    return storage;
}

module.exports.defaultClanMember = function() {
    const playerdb = {
        tag: null,
        name: null,
        attacks: 0,
        missedAttacks: 0,

        warLog: [],
        defenceLog: [],
        search: 1
    }

    return playerdb;
}

module.exports.defaultWarlogObject = function() {
    const user = {
        discord: {
            userId: null,
            username: null,
            avatar: null,
            globalName: null
        },
        website: {
            accessToken: null,
            expires: null,
            refreshToken: null
        },
        accounts: []
    }

    return user;
}

module.exports.add = add;
module.exports.update = update;
module.exports.find = find;
module.exports.findAll = findAll;
module.exports.createConnection = createConnection;