const config = require("./config.json");
const storage = require("node-persist");
const axios = require("axios");

const STORAGE_VAR = "clanData";
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

    const data = await storage.getItem(STORAGE_VAR);
    //return storage.setItem(STORAGE_VAR, { lastOpponent:  "#2J2URGV8V", warEndTime: 0 });
    //const currentTime = new Date().getTime(); //Current Time in milliseconds
    
    const cwlWarData = await api({ endpoint: "cwl" });

    //Check to see if we're in CWL first, THEN check for normal war
    
    if(cwlWarData != "404" && (cwlWarData.clans?.length || 0 ) > 1) {
        //We ARE in CWL - do with that as you will

        let activeWarTag = await findWarTag(cwlWarData.rounds);
        //console.log(activeWarTag); 

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
        sheet.run(activeWarTag.result);

    } else {
        //We are NOT in CWL - do with that as you will
        
        const warData = await api({ endpoint: "clan" });
        if(warData.state != "warEnded") {
            console.log(`It looks like we're still in war, and it's not yet over... (REGULAR) -- ${new Date().toLocaleString()}`);
            return setTimeout(() => { this.main() }, DELAY);
        }

        
        if(await isClanLogged(warData)) {
            console.log(`Looks like we've already added this clan's information already... Ignoring. (REGULAR) -- ${new Date().toLocaleString()}`);
            return setTimeout(() => { this.main() }, DELAY);
        }

        sheet.run(warData);

    }

    console.log("Refreshing");
    return setTimeout(() => { this.main() }, DELAY);
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
    console.log(obj);
    await storage.setItem(STORAGE_VAR, obj);
}

async function isClanLogged(warData) {
    const nodeData = await storage.getItem(STORAGE_VAR);

    //console.log(`${nodeData.lastOpponent} || ${warData.opponent.tag}`)
    if(!nodeData || warData.opponent.tag != nodeData.lastOpponent) 
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