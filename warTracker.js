const database = require("./database.js");
const config = require("./config.json");
const storage = require("node-persist");
const raids = require("./raids.js");
const axios = require("axios");

const STORAGE_VAR = { war: "clanData", clanCapital: "capitalData" };
const API_URL = "https://api.clashofclans.com/v1"

const sheet = require("./sheets.js");
const DELAY = 30000;

/**
 * clanData: {
 *  lastOpponent: clanTag,
 *  warEndTime: Time in milliseconds
 * }
 * 
 */
module.exports.main = async function main() {
    await storage.init(
    {
        stringify: JSON.stringify,
        parse: JSON.parse,
        encoding: "utf8",
        ttl: false
    });

    await capitalRaidCheck();
    
    const cwlWarData = await api({ endpoint: "cwl" });

    //Check to see if we're in CWL first, THEN check for normal war
    if(cwlWarData != "404" && (cwlWarData.clans?.length || 0 ) > 1) {
        //We ARE in CWL - do with that as you will

        let activeWarTag = await findWarTag(cwlWarData.rounds);
        if(activeWarTag.found == false) {
            console.log(`Looks like no CWL matches have ended yet... Ignoring. (CWL) -- ${new Date().toLocaleString()}`);
            return setTimeout(() => { this.main();  }, DELAY);
        }

        if(activeWarTag.found) {
            if(!activeWarTag.result.clan.tag.includes(config.clanTag)) {
                const tempClan = activeWarTag.result.clan;
                activeWarTag.result.clan = activeWarTag.result.opponent;
                activeWarTag.result.opponent = tempClan;

                console.log("------------------------------------------------");
            }
        }

        if(await isClanLogged(activeWarTag.result)) {
            console.log(`Looks like we've already added this clan's information already... Ignoring. (CWL) -- ${new Date().toLocaleString()}`);
            return setTimeout(() => { this.main();  }, DELAY);
        }

        //Add missing values so we can send the same cwl & clan war object
        activeWarTag.result.attacksPerMember = 1; 
        sheet.run(activeWarTag.result, "main");

    } else {
        //We are NOT in CWL - do with that as you will
        
        const warData = await api({ endpoint: "clan" });
        if(warData.state != "warEnded") {
            console.log(`It looks like we're still in war, and it's not yet over... (REGULAR) -- ${new Date().toLocaleString()}`);
            return setTimeout(() => { this.main() }, DELAY);
        }

        
        if(await isClanLogged(warData, "main")) {
            console.log(`Looks like we've already added this clan's information already... Ignoring. (REGULAR) -- ${new Date().toLocaleString()}`);
            return setTimeout(() => { this.main() }, DELAY);
        }

        sheet.run(warData, "main");

    }

    console.log("Refreshing");

    return setTimeout(() => { this.main() }, DELAY);
}

async function capitalRaidCheck() {

    const capitalHistory = await database.find(database.DATABASE_NAME.clanCapital, database.COLLECTION.warhistory, { clanTag: `#${config.clanTag}` });
    const clanCapitalInfo = await api({ endpoint: "clanCapital" });

    //const clanCapitalInfo = require("./capital.json");

    if(clanCapitalInfo.items[0].state != "ended")
        return console.log(`It looks like we're still participating in capital raids... Ignoring. (Clan Capital) -- ${new Date().toLocaleString()}`);

    let nodeData = await storage.getItem(STORAGE_VAR.clanCapital);
    if(nodeData == null || nodeData == undefined) {
        nodeData = {
            lastRaidStartDate: null,
            lastRaidEndDate: null
        }
    }

    if(nodeData.lastRaidEndDate != clanCapitalInfo.items[0].endTime) {
        //Let's store everything in MongoDB first, then use that info for sheets
        await raids.storeCapitalInfo(clanCapitalInfo);
        const mongoData = await database.findAll(database.DATABASE_NAME.clanCapital, database.COLLECTION.members, { search: 1 });
        const clanList = await api({ endpoint: "clanMembers" });

        //Mongo data, "capital", clanList, Mongo History Data
        sheet.run(mongoData, "capital", clanList, capitalHistory);

    } else
        return console.log(`It looks like we've already tracked the last Clan Capital week.... Ignoring. (Clan Capital) -- ${new Date().toLocaleString()}`);
}

function findWarTag(rounds) {
    return new Promise(async (resolve) => {
        for(let i = rounds.length - 1; i >= 0; i--) {
            if(rounds[i].warTags[0] == "#0") continue;

            for(let k = 0; k < rounds[i].warTags.length; k++) {
                //console.log(`rounds[i]: ${rounds[i].warTags} || rounds[i][k]: ${rounds[i].warTags[k]}`);
                //console.log(k);
                let currentTag = await api({ endpoint: "warTags", warTag: (rounds[i].warTags[k]).slice( 1, (rounds[i].warTags[k]).length ) });
                if(currentTag.state != "warEnded") break;

                //console.log(`Clan Name: ${currentTag.clan.name} || Opponent Name: ${currentTag.opponent.name}`)
                if(currentTag.clan.tag.includes(config.clanTag) || currentTag.opponent.tag.includes(config.clanTag))
                    resolve({ result: currentTag, found: true });
            }
        }

        resolve({ found: false });

    }); //End of promise
}

module.exports.setNodeData = async function(api) {
    const formattedTime = UTCtoMS(api.endTime);
    const obj = {
        lastOpponent: api.opponent.tag,
        warEndTime: formattedTime
    }
    await storage.setItem(STORAGE_VAR.war, obj);
}

module.exports.setCapitalNodeData = async function(startDate, endDate) {
    const obj = {
        lastRaidStartDate: startDate,
        lastRaidEndDate: endDate
    }

    await storage.setItem(STORAGE_VAR.clanCapital, obj);
}

async function isClanLogged(warData) {
    const nodeData = await storage.getItem(STORAGE_VAR.war);

    if(!nodeData || warData?.opponent?.tag != nodeData?.lastOpponent) 
        return false;

    return true;
}

function UTCtoMS(time) {
    return time.slice( 0,  4) + "-" + time.slice(4, 6) + "-" + time.slice(6, 11) + ":" + time.slice(11, time.length)
}

async function api(options, failedAmount) {
    return new Promise(async (resolve) => {
        const request = axios.create({
            headers: {
                'Authorization': 'Bearer ' + config.cocApiToken
            }
        });

        try {
            switch(options.endpoint) {
                case "clan":
                    const apiClanData = await request.get(`${API_URL}/clans/%23${config.clanTag}/currentwar`);
                    return resolve(apiClanData.data);

                case "cwl":
                    const apiCWLData = await request.get(`${API_URL}/clans/%23${config.clanTag}/currentwar/leaguegroup`);
                    return resolve(apiCWLData.data);

                case "warTags":
                    const apiWarTagsData = await request.get(`${API_URL}/clanwarleagues/wars/%23${options.warTag}`);
                    return resolve(apiWarTagsData.data);

                case "clanCapital":
                    const apiClanCapital = await request.get(`${API_URL}/clans/%23${config.clanTag}/capitalraidseasons`);
                    return resolve(apiClanCapital.data);

                case "clanMembers":
                    const apiMembersList = await request.get(`${API_URL}/clans/%23${config.clanTag}/members`);
                    return resolve(apiMembersList.data);

                default:
                    throw new Error(`Unknown endpoint attempted while trying to make an API call: ${options.endpoint}`)
            }
        } catch(err) {
            if(err?.response?.status != "404") {
                if(typeof failedAmount != "number")
                    failedAmount = 0;

                if(failedAmount < 3) {
                    failedAmount++;

                    await new Promise(async (resolve) => setTimeout(async () => {
                        console.log(`Failed. Attempt #${failedAmount}`);
                        resolve(api(options, failedAmount));
                    }, 10000));
                } else {
                    resolve(console.error(`============\nWe've run into an issue with the api!\n${err}\n============`));
                }
            } 

            return resolve(`404`);
        }
    });
}

module.exports.api = api;