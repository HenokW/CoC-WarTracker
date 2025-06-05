const config = require("./config.json");
const storage = require("node-persist");
const {google} = require('googleapis');
const readline = require('readline');
const { info } = require("console");
const axios = require("axios");
const fs = require('fs');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';

const STAR = "☆";
const HISTORY_INDEX_START = 8;
const API_URL = "https://api.clashofclans.com/v1"
const TOWNHALL_PATH = "=IMAGE(\"https://henokw.xyz/resources/coc/TH<NUM>.png\", 1)";

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */


// Load client secrets from a local file.



module.exports.run = async function(warData) {
    fs.readFile('credentials.json', (err, content) =>
        {
            if (err) return console.log('Error loading client secret file:', err);
    
            authorize(JSON.parse(content), mainSheet, warData, false);
        });
}
    
//====
//this.run(null);


function authorize(credentials, callback, warData, isCWL) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client, warData);
  });
}


//=================================================





/**
 * 
 * NOTES:
 * - Want to have the latest wars at the front
 */

async function mainSheet(auth, warData) {

    const sheets = google.sheets({version: 'v4', auth});
    const infoDMP = (await getInfoDMP(auth)) || [];

    await sheets.spreadsheets.values.get({
        spreadsheetId: config.mainSheetID,
        range: 'War Tracker!A3:ZZ',
        valueRenderOption: 'FORMULA'
    }, async (err, res) => {
        
        let returnedSheet = res.data.values || [];
        let warMembers = warData.clan.members;

        //return console.log(returnedSheet[2]);
        //--How long the history tail is. We can use this to find out who wasn't involved in this recent war after
        //--we've added data for everyone that WAS been in war.
        let warHistoryLength = returnedSheet[0]?.length || 0;

        //Tag | Town Hall | Name | Total wars | Missed Attacks | Avg %  | Avg Last 10 %
        let foundMap = new Map();
        for(let i = 0; i < returnedSheet.length; i++) {

            for(let loop = 0; loop < warMembers.length; loop++) {
        
                if(warMembers[loop].tag == returnedSheet[i][0]) {

                    //Create a variable to be used later for those who haven't been accounted for yet
                    warMembers[loop].warTrackerPlayerFound = true; 

                    //Townhall level
                    returnedSheet[i][1] = TOWNHALL_PATH.replace("<NUM>", warMembers[loop].townhallLevel);

                    //Replace the name incase they've changed it
                    returnedSheet[i][3] = warMembers[loop].name;

                    //Increase total wars by 1
                    returnedSheet[i][4] = parseInt(returnedSheet[i][4]) + 1;

                    //If they missed an attack, add that
                    returnedSheet[i][5] = parseInt(returnedSheet[i][5]) + ( warData.attacksPerMember - (warMembers[loop].attacks?.length || 0) );

                    //Average %
                    for(let dL = 0; dL < infoDMP.length; dL++) {
                        if(infoDMP[dL][0] == warMembers[loop].tag) {
                            foundMap.set(infoDMP[dL][0], true);

                            let totalPercentage = 0;
                            let totalAttacks = 0;
                            let lastTen = 0;

                            //Add to the dump first
                            for(let k = 0; k < (warMembers[loop].attacks?.length || 0); k++)
                                infoDMP[dL].splice(1, 0, (warMembers[loop].attacks[k].destructionPercentage).toString());

                            if( (warData.attacksPerMember - (warMembers[loop].attacks?.length || 0)) != 0 ) {
                                for(let k = 0; k < (warData.attacksPerMember - (warMembers[loop].attacks?.length || 0)); k++)
                                    infoDMP[dL].splice(1, 0, "miss");
                            }

                            for(let k = 1; k < infoDMP[dL].length; k++) {
                                if(Number.isInteger(parseInt(infoDMP[dL][k]))) {
                                    totalPercentage += parseInt(infoDMP[dL][k]);
                                    totalAttacks++;

                                    if(totalAttacks < 11)
                                        lastTen += parseInt(infoDMP[dL][k]);
                                    
                                } else {
                                    console.log("Miss")
                                }
                            }

                            //Average % ||AND|| Last 10 Average %
                            console.log(`totalPercentage: ${totalPercentage} || totalAttacks: ${totalAttacks} || lastTen: ${lastTen}`)
                            
                            if(totalAttacks <= 0) {
                                returnedSheet[i][6] = `0%`;
                                returnedSheet[i][7] = `0%`;
                            } else {
                                if(totalAttacks >= 10)
                                    returnedSheet[i][7] = `${(lastTen / 10).toFixed(2)}%`;
                                else
                                    returnedSheet[i][7] = `${(lastTen / totalAttacks).toFixed(2)}%`;

                                returnedSheet[i][6] = `${(totalPercentage / totalAttacks).toFixed(2)}%`;
                            }

                        }
                    }//End of DumpLoop

                    //Add the players attack outcomes at the start of the history page
                    switch(warData.attacksPerMember) {
                        case 2:
                            if( (warMembers[loop].attacks?.length || 0) == 2 )
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `${warMembers[loop].attacks[0].stars}${STAR} | ${warMembers[loop].attacks[1].stars}${STAR}`);
                            else if( (warMembers[loop].attacks?.length || 0) == 1 )
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `${warMembers[loop].attacks[0].stars}${STAR} | miss`);
                            else
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `miss | miss`);
                            break;

                        case 1:
                            if( (warMembers[loop].attacks?.length || 0) == 1 )
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `${warMembers[loop].attacks[0].stars}${STAR}`);
                            else
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `miss`);
                            break;

                        default:
                            return console.error(`====== WE'VE RUN INTO AN ISSUE! ======\n${warData}\n================================================`);
                    }
                }
            }
        }


        //Add an extra row in infoDMP for those who weren't in war
        for(let j = 0; j < infoDMP.length; j++) {
            if(!foundMap.get(infoDMP[j][0])) 
                infoDMP[j].splice(1, 0, "")
        }

        /**
         * Now that we've done everything for those who were present in this war
         * we can go back through and check the history length of everyone. If 
         * their history tail isn't (warHistoryLength + 1) go through and mark their history
         * with a [x], and potentially move them to the bottom of the array?
         */

        for(let i = 0; i < returnedSheet.length; i++) {

            let isLogged = false; //Solves the issue of people getting marked as "[x]" even if they were in war (they're new to the sheet, and we're filling the gaps based on length)
            for(let k = 0; k < warMembers.length; k++) {
                if(returnedSheet[i][0] == warMembers[k].tag)
                    isLogged = true;
            }

            if(!isLogged) 
                returnedSheet[i].splice(HISTORY_INDEX_START, 0, "[x]");
        }

        //Go through and add people into the sheet that are missing/new
        
        
        for(let i = 0; i < warMembers.length; i++) {
            if(warMembers[i]?.warTrackerPlayerFound == true)
                continue;

            let destroyTotal = 0;
            for(let k = 0; k < warMembers[i].attacks?.length; k++)
                destroyTotal += warMembers[i].attacks[k].destructionPercentage;




            //Regular Sheet
            //Tag | Town Hall | Name | Total wars | Missed Attacks | Avg %  | Avg Last 10 %
            let newPlayer = [
                warMembers[i].tag,
                TOWNHALL_PATH.replace("<NUM>", warMembers[i].townhallLevel),
                "",
                warMembers[i].name,
                1,
                (warData.attacksPerMember - (warMembers[i].attacks?.length || 0)),
                destroyTotal ? `${(destroyTotal / warMembers[i].attacks.length).toString()}%` : "0%",
                destroyTotal ? `${(destroyTotal / warMembers[i].attacks.length).toString()}%` : "0%"
            ];

            switch(warData.attacksPerMember) {
                case 2:
                    if( (warMembers[i].attacks?.length || 0) == 2 )
                        newPlayer[newPlayer.length] = `${warMembers[i].attacks[0].stars}${STAR} | ${warMembers[i].attacks[1].stars}${STAR}`;
                    else if( (warMembers[i].attacks?.length || 0) == 1 )
                        newPlayer[newPlayer.length] = `${warMembers[i].attacks[0].stars}${STAR} | miss`;
                    else
                        newPlayer[newPlayer.length] = `miss | miss`;
                    break;

                case 1:
                    if( (warMembers[i].attacks?.length || 0) == 1 )
                        newPlayer[newPlayer.length] = `${warMembers[i].attacks[0].stars}${STAR}`;
                    else
                        newPlayer[newPlayer.length] = `miss`;
                    break;

                default:
                    return console.error(`====== WE'VE RUN INTO AN ISSUE! ======\n${warData}\n================================================`);
            }

            //InfoDMP Sheet
            let newPlayerDMP = [ warMembers[i].tag ]
            for(let k = 0; k < (warMembers[i].attacks?.length || 0); k++)
                newPlayerDMP.splice(1, 0, warMembers[i].attacks[k].destructionPercentage.toString());

            if( (warData.attacksPerMember - (warMembers[i].attacks?.length || 0)) != 0 ) {
                for(let k = 0; k < (warData.attacksPerMember - (warMembers[i].attacks?.length || 0)); k++)
                    newPlayerDMP.splice(1, 0, "miss");
            }

            //We've added the player to the main sheet, now add them to the info dump
            returnedSheet.unshift(newPlayer);
            infoDMP.unshift(newPlayerDMP);
        }

        console.log("==============================================");
        console.log(returnedSheet);
        console.log("==============================================");
        console.log(infoDMP);

        
        //Upload info to MongoDB first
        let database = require("./database.js");
        await database.storeInfo(warData);

        sortSheets(auth, returnedSheet, warData.attacksPerMember, warData, infoDMP);

    }); //End of sheets
}

async function setData(auth, newData, attackCount, clanData)
{
    const sheets = google.sheets({version: 'v4', auth});

    //Should clear first because there are times were rows are reordered causing some cells to get merged with others while they have uneven lengths
    await sheets.spreadsheets.values.clear({
        spreadsheetId: config.mainSheetID,
        range: 'War Tracker!A3:ZZ' 
    }); 

    sheets.spreadsheets.values.update(
    {
        spreadsheetId: config.mainSheetID,
        range: 'War Tracker!A3:ZZ',
        valueInputOption:"USER_ENTERED",
        resource:{
            values: newData
          }
    }, (err, res) =>
    {
        if(err)
            console.log(err);
        else {
            console.log("Sheets has been updated");
            getTime(auth, attackCount, clanData);

            //Keep track of the last clan we fought / tracked
            const tracker = require("./warTracker.js");
            tracker.setNodeData(clanData);
        }
    });
}

async function setDmpData(auth, newData)
{
    const sheets = google.sheets({version: 'v4', auth});

    await sheets.spreadsheets.values.clear({
        spreadsheetId: config.mainSheetID,
        range: 'InfoDMP!A2:ZZ' 
    }); 

    sheets.spreadsheets.values.update(
    {
        spreadsheetId: config.mainSheetID,
        range: 'InfoDMP!A2:ZZ',
        valueInputOption:"USER_ENTERED",
        resource:{
            values: newData
          }
    }, (err, res) =>
    {
        if(err)
            console.log(err);
        else {
            console.log("Dump file has been updated");
        }
    });
}

async function getTime(auth, attackCount, clanData)
{
    const sheets = google.sheets({version: 'v4', auth});
    await sheets.spreadsheets.values.get(
    {
        spreadsheetId: config.mainSheetID,
        range: 'War Tracker!A2:ZZ2',
    }, async (err, res) =>
    {
        if (err) return console.log('The API returned an error: ' + err);
        let data = res.data.values;

        let month = new Date().getMonth();
        let day = new Date().getDate();
        let year = new Date().getFullYear();

        let currentDate = `${month+1}/${day}/${year}`;
        data[0].splice(HISTORY_INDEX_START, 0, currentDate);

        setTimeData(auth, data);
        getInfoTime(auth, attackCount);
        getExtraInfo(auth, clanData);
    });
}

async function getInfoTime(auth, attackCount)
{
    const sheets = google.sheets({version: 'v4', auth});
    await sheets.spreadsheets.values.get(
    {
        spreadsheetId: config.mainSheetID,
        range: 'InfoDMP!A1:ZZ1',
    }, async (err, res) =>
    {
        if (err) return console.log('The API returned an error: ' + err);
        let data = res.data.values;

        let month = new Date().getMonth();
        let day = new Date().getDate();
        let year = new Date().getFullYear();

        let currentDate = `${month+1}/${day}/${year}`;

        for(let i = 0; i < attackCount; i++)
            data[0].splice(1, 0, currentDate);

        setInfoTimeData(auth, data);
    });
}

function setTimeData(auth, newData)
{
    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.update(
    {
        spreadsheetId: config.mainSheetID,
        range: 'War Tracker!A2:ZZ2',
        valueInputOption:"USER_ENTERED",
        resource:{
            values: newData
          }
    }, (err, res) =>
    {
        if(err)
            console.log(err);
        else
            console.log(`Time data has been added - ${new Date().toLocaleString()}`);
    });
}

function setInfoTimeData(auth, newData)
{
    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.update(
    {
        spreadsheetId: config.mainSheetID,
        range: 'InfoDMP!A1:ZZ1',
        valueInputOption:"USER_ENTERED",
        resource:{
            values: newData
          }
    }, (err, res) =>
    {
        if(err)
            console.log(err);
        else
            console.log(`Time data has been added - ${new Date().toLocaleString()}`);
    });
}

function getInfoDMP(auth)
{
    return new Promise((resolve) => {
        const sheets = google.sheets({version: 'v4', auth});
        sheets.spreadsheets.values.get(
        {
            spreadsheetId: config.mainSheetID,
            range: 'infoDMP!A2:ZZ',
        }, async (err, res) =>
        {
            if (err) return console.log('The API returned an error: ' + err);
            
            resolve(res.data.values);
        });
    });
}

async function getExtraInfo(auth, clanData)
{
    const sheets = google.sheets({version: 'v4', auth});
    await sheets.spreadsheets.values.get(
    {
        spreadsheetId: config.mainSheetID,
        range: 'War Matchups!A2:L',
    }, async (err, res) =>
    {
        if (err) return console.log('The API returned an error: ' + err);
        let data = res.data.values;

        let month = new Date().getMonth();
        let day = new Date().getDate();
        let year = new Date().getFullYear();

        let currDate = `${month+1}/${day}/${year}`;

        let warResult = "";
        if(clanData.clan.stars == clanData.opponent.stars)
        {
            if(clanData.clan.destructionPercentage > clanData.opponent.destructionPercentage)
                warResult = "Win";
            else if(clanData.clan.destructionPercentage < clanData.opponent.destructionPercentage)
                warResult = "Loss"
            else
                warResult = "Tie";
        }
        else if(clanData.clan.stars > clanData.opponent.stars)
            warResult = "Win";
        else
            warResult = "Loss";

        if(clanData.attacksPerMember == 1) 
            warResult = `CWL ${warResult}`;


        //War end date | Clan tag | Clan name | Clan level | War count | Outcome | Attacks | Enemy Attacks | Clan stars | Enemy stars | % | Enemy %
        if(!data) data = [];
        
        data.unshift([
            currDate,
            clanData.opponent.tag,
            clanData.opponent.name,
            clanData.opponent.clanLevel,
            `${clanData.teamSize}v${clanData.teamSize}`,
            warResult,
            `${clanData.clan.attacks}/${clanData.teamSize * 2}`,
            `${clanData.opponent.attacks}/${clanData.teamSize * 2}`,
            clanData.clan.stars,
            clanData.opponent.stars,
            `${clanData.clan.destructionPercentage}%`,
            `${clanData.opponent.destructionPercentage}%`
        ]);

        if(clanData.attacksPerMember == 1) {
            data[0][6] = `${clanData.clan.attacks}/${clanData.teamSize}`;
            data[0][7] = `${clanData.opponent.attacks}/${clanData.teamSize}`;
        }

        setExtraData(auth, data);
    });
}

function setExtraData(auth, newData)
{
    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.update(
    {
        spreadsheetId: config.mainSheetID,
        range: 'War Matchups!A2:L',
        valueInputOption:"USER_ENTERED",
        resource:{
            values: newData
          }
    }, (err, res) =>
    {
        if(err)
            console.log(err);
        else
            console.log("Matchup Info has been updated");
    });
}

//======================[SORTING]===========================

async function sortSheets(auth, data, attacksPerMember, warData, infoDMP) {
    const request = axios.create({
        headers: {
            'Authorization': 'Bearer ' + config.cocApiToken
        }
    });
    
    //Go through and check roles first
    const clanInfo = await request.get(`${API_URL}/clans/%23${config.clanTag}/members`);
    for(let k = 0; k < data.length; k++) {
        let isClanMember = false;

        for(let i = 0; i < clanInfo.data.items.length; i++) {
            if(data[k][0] == clanInfo.data.items[i].tag) {
                switch (clanInfo.data.items[i].role) {
                    case "member":
                        data[k][2] = "Member";
                        break;

                    case "admin":
                        data[k][2] = "Elder";
                        break;

                    case "coLeader":
                        data[k][2] = "Co-Leader";
                        break;

                    case "leader":
                        data[k][2] = "Leader";
                        break;
                }
                isClanMember = true;
            } 
        }

        //They're no longer in the clan, remove their role from the list so they can get sorted towards the bottom
        if(!isClanMember)
            data[k][2] = "";
    }


    //Then go through and sort the whole sheet going from Leader down to Members
    let map = new Map();

    map.set("", 0);
    map.set("Member", 1);
    map.set("Elder", 2);
    map.set("Co-Leader", 3);
    map.set("Leader", 4);


    for(let i = 1; i < data.length; i++) {
        //Backtrack to see if the current indexed number is less than the one before it - keep going 
        for(let k = i - 1; k >= 0; k--) {
            if(map.get(data[i][2]) < map.get(data[k][2])) {
                if(!data[k - 1]) {
                    if(map.get(data[i][2]) >= map.get(""))
                        data.splice( k, 0, ( data.splice(i, 1) )[0] );
                    break;
                }

                if(map.get(data[i][2]) >= map.get(data[k - 1][2]))
                    data.splice( k, 0, ( data.splice(i, 1) )[0] )
                else {
                    continue;
                }
            }
        }
    }

    //Ngl I'm hecka lazy, I did it the opposite way
    data.reverse();
    console.log("Sheets list has successfully been organized by roles.");
    setData(auth, data, attacksPerMember, warData);
    setDmpData(auth, infoDMP);

}



//=================================================

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error while trying to retrieve access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}
