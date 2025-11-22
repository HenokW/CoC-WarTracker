const database = require("./mongodb/database.js");
const warTracker = require('./warTracker.js');
const config = require("./config.json");
const util = require("./util/util.js");
const sheet = require("./sheets.js");
require('dotenv').config();

const GAMES_START_DATE = 22;
const GAMES_END_DATE = 28;

//Start and stop and hour before, and after (am)
const UTC_HOUR_START_TIME = 7;
const UTC_HOUR_END_TIME = 9; 

const DEFAULT_MAX_SCORE = 4000;
const DELAY = 600_000; //10 minutes //600_000

if(typeof process.env.isClanGamesTrackerActive == 'undefined') process.env.isClanGamesTrackerActive = false;

module.exports.initalCheck = async function() {
    let db = await database.find(database.DATABASE_NAME.clanGames, database.COLLECTION.log, { clanTag: `#${config.clanTag}` });
    if(!db) {
        db = {
            clanTag: `#${config.clanTag}`,
            isClanGamesTrackerActive: false,
            currentSeason: "",
            memberList: []
        }

        await database.add(database.DATABASE_NAME.clanGames, database.COLLECTION.log, db);
    }

    if(db.isClanGamesTrackerActive)
        process.env.isClanGamesTrackerActive = true;
    else
        process.env.isClanGamesTrackerActive = false;

    module.exports.checkDate();
}

module.exports.checkDate = async function() {
    console.log("[Clan Games] - Checking -");
    const currentDate = new Date();

    if(((currentDate.getDate() == GAMES_START_DATE) && (currentDate.getUTCHours() >= UTC_HOUR_START_TIME) && (process.env.isClanGamesTrackerActive != 'true')) ) {
        const apiCheck = await util.isApiAvailable();
        if(apiCheck) {
            let db = await database.find(database.DATABASE_NAME.clanGames, database.COLLECTION.log, { clanTag: `#${config.clanTag}` });
            
            db.isClanGamesTrackerActive = true;
            db.currentSeason = `${currentDate.toLocaleString('en-US', { month: 'long' })} ${currentDate.getFullYear()}`;
            
            const trackedList = await trackUsers(null, true);
            if(trackedList.length > 0) { 
                db.memberList = trackedList;
                
                await database.update(database.DATABASE_NAME.clanGames, database.COLLECTION.log, { clanTag: `#${config.clanTag}` }, db);
                process.env.isClanGamesTrackerActive = true;
            }

            console.log(trackedList);
            console.log("[CLAN GAMES] - CLAN GAMES HAS STARTED, TRACKING IS NOW ACTIVE");
        }
    } else if(process.env.isClanGamesTrackerActive == 'true') {
        console.log("- - Clan Games Check - -");

        let db = await database.find(database.DATABASE_NAME.clanGames, database.COLLECTION.log, { clanTag: `#${config.clanTag}` });
        if(((currentDate.getDate() == GAMES_END_DATE) && (currentDate.getUTCHours() >= UTC_HOUR_END_TIME))) {
            const apiCheck = await util.isApiAvailable();
            if(apiCheck) {
                await updateDB([...db.memberList], db.currentSeason);

                const dbUsers = await database.findAll(database.DATABASE_NAME.clanGames, database.COLLECTION.members, { search: 1 });
                await sheet.run(dbUsers, 'games', db.currentSeason);

                db.isClanGamesTrackerActive = false;
                db.currentSeason = "";
                db.memberList = [];
                process.env.isClanGamesTrackerActive = false;

                await database.update(database.DATABASE_NAME.clanGames, database.COLLECTION.log, { clanTag: `#${config.clanTag}` }, db);
                console.log('(CLAN GAMES) - Tracking log has been RESET.');
            }
        } else {
            const trackedList = await trackUsers([...db.memberList]);
            if(trackedList.length > db.memberList.length) {
                console.log("(CLAN GAMES) - New Additions");
                
                db.memberList = trackedList
                await database.update(database.DATABASE_NAME.clanGames, database.COLLECTION.log, { clanTag: `#${config.clanTag}` }, db);
            }
        }
    }

    return setTimeout(() => { this.checkDate() }, DELAY);
}

async function updateDB(trackedList, currentSeason) {
    for(let i = 0; i < trackedList.length; i++) {
        let profile = await warTracker.api({ endpoint: 'player', playerTag: trackedList[i].tag.replace('#', '') });
        let trackedAchievement = await profile.achievements.find(achievement => achievement.name == "Games Champion");

        trackedList[i].score = parseInt(trackedAchievement.value) - parseInt(trackedList[i].startCount);
        
        let newEntry = false;
        let userGamesDb = await database.find(database.DATABASE_NAME.clanGames, database.COLLECTION.members, { tag: trackedList[i].tag });
        if(!userGamesDb) {
            newEntry = true;
            userGamesDb = {
                tag: trackedList[i].tag,
                name: trackedList[i].name,
                totalGamesParticipated: 0,
                gamesCompleted: 0,
                missedGames: 0,
                totalPointsEarned: 0,
                gamesLog: [],
                search: 1
            }
        }

        userGamesDb.name = trackedList[i].name;
        userGamesDb.totalGamesParticipated++;

        if(trackedList[i].score >= DEFAULT_MAX_SCORE)
            userGamesDb.gamesCompleted++;
        else if(trackedList[i].score <= 0)
            userGamesDb.missedGames++;

        userGamesDb.totalPointsEarned += parseInt(trackedList[i].score);
        userGamesDb.gamesLog.unshift({
            season: currentSeason,
            score: trackedList[i].score,
            maxScore: DEFAULT_MAX_SCORE,
            townhallLevel: profile.townHallLevel,
            role: profile?.clan?.tag == config.clanTag ? profile.role : ""
        });

        if(newEntry)
            await database.add(database.DATABASE_NAME.clanGames, database.COLLECTION.members, userGamesDb);
        else
            await database.update(database.DATABASE_NAME.clanGames, database.COLLECTION.members, { tag: trackedList[i].tag }, userGamesDb);
    }

    console.log(`(CLAN GAMES) - Finished updating db for ${trackedList.length} users.`);

    let newHistoryEntry = false;
    let gamesHistoryDb = await database.find(database.DATABASE_NAME.clanGames, database.COLLECTION.warhistory, { clanTag: `#${config.clanTag}` });
    if(!gamesHistoryDb) {
        newHistoryEntry = true;
        gamesHistoryDb = {
            clanTag: `#${config.clanTag}`,
            gamesHistory: []
        }
    }

    gamesHistoryDb.gamesHistory.unshift({
        season: currentSeason,
        trackedList: trackedList
    });

    if(newHistoryEntry)
        await database.add(database.DATABASE_NAME.clanGames, database.COLLECTION.warhistory, gamesHistoryDb);
    else
        await database.update(database.DATABASE_NAME.clanGames, database.COLLECTION.warhistory, { clanTag: `#${config.clanTag}` }, gamesHistoryDb);
}

async function trackUsers(trackedList) {
    if(!trackedList) 
        trackedList = [];

    const clanList = await warTracker.api({ endpoint: 'clanMembers' });
    for(let i = 0; i < clanList.items.length; i++) {
        let foundUser = trackedList.find(member => member.tag == clanList.items[i].tag) // <--
        if(!foundUser) {
            // <--
            console.log(`(CLAN GAMES) - Added a new user to track: ${clanList.items[i].tag} - ${clanList.items[i].name}`);

            try {
                let newTrackedUser = await warTracker.api({ endpoint: 'player', playerTag: clanList.items[i].tag.replace('#', '') });
                let trackedAchievement = await newTrackedUser.achievements.find(achievement => achievement.name == "Games Champion");

                trackedList.push({
                    tag: newTrackedUser.tag,
                    name: newTrackedUser.name,
                    startCount: trackedAchievement.value
                });
            } catch(err) {
                console.error(err)
            }
        }
    }

    return trackedList;
}