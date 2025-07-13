const database = require("./mongodb/database.js");
const config = require("./config.json");
const {google} = require('googleapis');
const readline = require('readline');
const fs = require('fs');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';

const STAR = "☆";
const DISTRICT_IDS = 70000000; //Capital Peak
const HISTORY_INDEX_START = 8;
const TOWNHALL_PATH = "=IMAGE(\"https://henokw.xyz/resources/coc/TH<NUM>.png\", 1)";

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */


// Load client secrets from a local file.
module.exports.run = async function(data, sheet, clanList) {
    fs.readFile('credentials.json', (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);

        switch(sheet) {
            case "main":
                authorize(JSON.parse(content), warSheet, data); //Data in this case means the returned JSON from the api
                break;

            case "capital":
                authorize(JSON.parse(content), capitalSheet, data, clanList); //Data in this case means mongo member data
                break;
        }
    });
}
    
//====
//this.run(null, "main");


function authorize(credentials, callback, warData, mongoHistory, clanList) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client, warData, mongoHistory, clanList);
  });
}


//=================================================

/*


*/
async function warSheet(auth, warData) {
    const sheets = google.sheets({version: 'v4', auth});

    //Get the info of every one in the database
    const dbUserData = await database.findAll(database.DATABASE_NAME.war, database.COLLECTION.members, { search: 1 });

    await sheets.spreadsheets.values.get({
        spreadsheetId: config.mainSheetID,
        range: 'War Tracker!A3:ZZ',
        valueRenderOption: 'FORMULA'
    }, async (err, res) => {
        let returnedSheet = res.data.values || [];
        let warMembers = warData.clan.members;

        //Tag | Town Hall | Name | Total wars | Missed Attacks | Avg %  | Avg Last 10 %
        for(let i = 0; i < returnedSheet.length; i++) {
            for(let j = 0; j < warMembers.length; j++) {
                if(warMembers[j].tag == returnedSheet[i][0]) {

                    //Should always return something since we're calling the database before we upload to sheets
                    let dbInstance = dbUserData.find(user => user.tag == warMembers[j].tag);

                    //Create a variable to be used later for those who haven't been accounted for yet
                    warMembers[j].warTrackerPlayerFound = true;
                    returnedSheet[i][1] = TOWNHALL_PATH.replace("<NUM>", warMembers[j].townhallLevel);
                    returnedSheet[i][3] = warMembers[j].name;
                    returnedSheet[i][4] = dbInstance.warLog.length;
                    returnedSheet[i][5] = dbInstance.missedAttacks;

                    const averages = _findWarAverages(dbInstance);
                    returnedSheet[i][6] = `${((averages.regular / averages.attackCount) || 0).toFixed(2)}%`;
                    returnedSheet[i][7] = `${((averages.lastTen / averages.lastTenCount) || 0).toFixed(2)}%`;

                    //Adding war results at the start of the attack history
                    switch(warData.attacksPerMember) {
                        case 2:
                            if( (warMembers[j].attacks?.length || 0) == 2 )
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `${warMembers[j].attacks[0].stars}${STAR} | ${warMembers[j].attacks[1].stars}${STAR}`);
                            else if( (warMembers[j].attacks?.length || 0) == 1 )
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `${warMembers[j].attacks[0].stars}${STAR} | miss`);
                            else
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `miss | miss`);
                            break;

                        case 1:
                            if( (warMembers[j].attacks?.length || 0) == 1 )
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `${warMembers[j].attacks[0].stars}${STAR}`);
                            else
                                returnedSheet[i].splice(HISTORY_INDEX_START, 0, `miss`);
                            break;

                        default:
                            return console.error(`====== WE'VE RUN INTO AN ISSUE! ======\n${warData}\n================================================`);
                    }
                }
            }
        } //

        //Now going through and adding a '[x]' for those who weren't taken into war
        for(let i = 0; i < returnedSheet.length; i++) {

            let isLogged = false;
            for(let j = 0; j < warMembers.length; j++) {
                if(returnedSheet[i][0] == warMembers[j].tag) {
                    isLogged = true;
                    break;
                }
            }

            if(!isLogged) 
                returnedSheet[i].splice(HISTORY_INDEX_START, 0, "[x]");
        }

        //Now going through and adding new people to the sheet
        for(let i = 0; i < warMembers.length; i++) {
            if(warMembers[i]?.warTrackerPlayerFound)
                continue;

            let dbNewInstance = dbUserData.find(user => user.tag == warMembers[j].tag);

            //Tag | Town Hall | Name | Total wars | Missed Attacks | Avg %  | Avg Last 10 %
            let newPlayer = [ 
                dbNewInstance.tag,
                TOWNHALL_PATH.replace("<NUM>", warMembers[i].townhallLevel),
                "",
                dbNewInstance.name,
                1,
                dbNewInstance.missedAttacks,
                destroyTotal ? `${(destroyTotal / warMembers[i].attacks.length).toString()}%` : '0%',
                destroyTotal ? `${(destroyTotal / warMembers[i].attacks.length).toString()}%` : '0%'
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

            //Add them to the main sheet
            returnedSheet.unshift(newPlayer);
        }

        await setWarData(auth, returnedSheet, warData);
        await getExtraInfo(auth, warData);
    });
} 

async function capitalSheet(auth, memberdb, clanList) {
    const sheets = google.sheets({version: 'v4', auth});
    const capitalLastAverage = 5;

    await sheets.spreadsheets.values.get({
        spreadsheetId: config.mainSheetID,
        range: 'Clan Capital!A3:ZZ',
        valueRenderOption: 'FORMULA'
    }, async (err, res) => {
        let returnedSheet = res.data.values || [];
        const clanHistory = await database.find(database.DATABASE_NAME.clanCapital, database.COLLECTION.warhistory, { clanTag: `#${config.clanTag}` })

        for(let i = 0; i < memberdb.length; i++) {

            let hasSheetEntry = false;
            for(let j = 0; j < returnedSheet.length; j++) {
                if(memberdb[i].tag == returnedSheet[j][0]) {
                    hasSheetEntry = true;

                    //If they haven't been added
                    if(memberdb[i].attackLog[0].raidEndDate != clanHistory.raidHistory[0].raidEndDate) {
                        returnedSheet[j].splice(10, 0, `[x]`);

                        continue;
                    }

                    const clanMemberData = _findClanMemberData(clanList, memberdb[i].tag);
                    if(clanMemberData != null) {
                        returnedSheet[j][1] = TOWNHALL_PATH.replace("<NUM>", clanMemberData.townHallLevel);
                        returnedSheet[j][2] = clanMemberData.role;
                    } else {
                        returnedSheet[j][1] = "";
                        returnedSheet[j][2] = "";
                    }

                    returnedSheet[j][3] = memberdb[i].name;
                    returnedSheet[j][4] = memberdb[i].attacks;
                    returnedSheet[j][5] = memberdb[i].missedAttacks;
                    returnedSheet[j][6] = memberdb[i].totalGoldLooted.toLocaleString();
                    returnedSheet[j][7] = (memberdb[i].totalGoldLooted / memberdb[i].attackLog.length).toLocaleString();
                    
                    let sum = 0; 
                    for(let k = 0; k < memberdb[i].attackLog.length; k++) 
                        sum += memberdb[i].attackLog[k].goldLooted;

                    returnedSheet[j][8] = memberdb[i].attackLog.length < capitalLastAverage ? (sum / memberdb[i].attackLog.length).toLocaleString() : (sum / capitalLastAverage).toLocaleString();

                    const highestDistrict = _findFavoriteDistrict(memberdb[i].districtLog);
                    returnedSheet[j][9] = (_districtToText(highestDistrict));
                    returnedSheet[j].splice(10, 0, `${memberdb[i].attackLog[0].attacks}/5`);
                }
            }

            if(!hasSheetEntry) {
                const highestDistrict = _findFavoriteDistrict(memberdb[i].districtLog);

                let obj = [];
                obj[0] = memberdb[i].tag;
            
                const clanMemberData = _findClanMemberData(clanList, memberdb[i].tag);
                if(clanMemberData != null) {
                    obj[1] = TOWNHALL_PATH.replace("<NUM>", clanMemberData.townHallLevel);
                    obj[2] = clanMemberData.role;
                } else {
                    obj[1] = "";
                    obj[2] = "";
                }

                obj[3] = memberdb[i].name;
                obj[4] = memberdb[i].attacks;
                obj[5] = memberdb[i].missedAttacks;
                obj[6] = memberdb[i].totalGoldLooted.toLocaleString();
                obj[7] = memberdb[i].totalGoldLooted.toLocaleString();
                obj[8] = memberdb[i].totalGoldLooted.toLocaleString();
                obj[9] = (_districtToText(highestDistrict));
                obj[10] = `${memberdb[i].attackLog[0].attacks}/5`;

                returnedSheet.push(obj);
            }
        }

        //Go back through the sheet, and remove anyone's role that's not in the clan
        for(let i = 0; i < returnedSheet.length; i++) {
            let userSearch = _findClanMemberData(clanList, returnedSheet[i][0]);
            if(!userSearch)
                returnedSheet[i][2] = "";
        }

        await setCapitalData(auth, returnedSheet)
        await setCapitalHistory(auth);

    });
}

function _findWarAverages(db) {
    let avg = { regular: 0, lastTen: 0, attackCount: 0, lastTenCount: 0 };

    for(let i = 0; i < db.warLog.length; i++) {
        for(let j = 0; j < (db.warLog[i]?.attacks?.length || 0); j++) {
            avg.regular += db.warLog[i].attacks[j].destructionPercent;
            avg.attackCount++;

            if(i < 10) {
                avg.lastTen += db.warLog[i].attacks[j].destructionPercent;
                avg.lastTenCount++;
            }
        }
    }

    return avg;
}

function _districtToText(districtID) {
    switch(districtID) {
        case 0:
            return "";

        case 70000000:
            return "Capital Peak";

        case 70000001:
            return "Barbarian Camp";
            
        case 70000002:
            return "Wizard Valley";

        case 70000003:
            return "Balloon Lagoon";

        case 70000004:
            return "Builder's Workshop";

        case 70000005:
            return "Dragon Cliffs";

        case 70000006:
            return "Golem Quarry";

        case 70000007:
            return "Skeleton Park";

        case 70000008:
            return "Goblin Mines";


        default:
            return "New Capital";
    }
}

function _findFavoriteDistrict(districtLog) {

    console.log(districtLog);

    let highestDistrict = null;
    let district = 0;

    for(let k = 0; k < Object.keys(districtLog).length; k++) {
        if(k == 0) {
            highestDistrict = districtLog[DISTRICT_IDS + k];
            district = DISTRICT_IDS + k;
            continue;
        }

        //Won't use Greater than or equal to because I want the highest base to be considered their favorite
        if(districtLog[DISTRICT_IDS + k].attackCount > highestDistrict.attackCount) {
            highestDistrict = districtLog[DISTRICT_IDS + k];
            district = DISTRICT_IDS + k;
        }
    }

    console.log(highestDistrict.attackCount);

    if(highestDistrict.attackCount <= 0)
        return 0;

    return district;
}

function _findClanMemberData(clanList, query) {
    for(let i = 0; i < clanList.items.length; i++) {
        if(clanList.items[i].tag == query) {
            return clanList.items[i];
        }
    }

    return null;
}

function _sortByRoles(sheet) {
    for(let i = 0; i < sheet.length; i++) {
        switch (sheet[i][2]) {
            case "member":
                sheet[i][2] = "Member";
                break;

            case "admin":
                sheet[i][2] = "Elder";
                break;

            case "coLeader":
                sheet[i][2] = "Co-Leader";
                break;

            case "leader":
                sheet[i][2] = "Leader";
                break;
        }
    }

    //Then go through and sort the whole sheet going from Leader down to Members
    let map = new Map();

    map.set("", 0);
    map.set("Member", 1);
    map.set("Elder", 2);
    map.set("Co-Leader", 3);
    map.set("Leader", 4);

    for(let i = 1; i < sheet.length; i++) {
        //Backtrack to see if the current indexed number is less than the one before it - keep going 
        for(let k = i - 1; k >= 0; k--) {
            if(map.get(sheet[i][2]) < map.get(sheet[k][2])) {
                if(!sheet[k - 1]) {
                    if(map.get(sheet[i][2]) >= map.get(""))
                        sheet.splice( k, 0, ( sheet.splice(i, 1) )[0] );
                    break;
                }

                if(map.get(sheet[i][2]) >= map.get(sheet[k - 1][2]))
                    sheet.splice( k, 0, ( sheet.splice(i, 1) )[0] )
                else {
                    continue;
                }
            }
        }
    }

    //Ngl I'm hecka lazy, I did it the opposite way
    sheet.reverse();
    console.log("Sheets list has successfully been organized by roles.");
    return sheet;
}

function _formatDateString(time, returnYear) {
    const formattedString = time.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d+)(Z)$/, 
        '$1-$2-$3T$4:$5:$6.$7$8'
    );

    const date = new Date(formattedString);

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();

    if(returnYear)
        return `${month}/${day}/${year}`;

    return `${month}/${day}`;
}

async function setCapitalData(auth, newData)
{
    const sheets = google.sheets({version: 'v4', auth});

    //Should clear first because there are times were rows are reordered causing some cells to get merged with others while they have uneven lengths
    await sheets.spreadsheets.values.clear({
        spreadsheetId: config.mainSheetID,
        range: 'Clan Capital!A3:ZZ' 
    }); 

    const sortedSheet = _sortByRoles(newData);
    sheets.spreadsheets.values.update(
    {
        spreadsheetId: config.mainSheetID,
        range: 'Clan Capital!A3:ZZ',
        valueInputOption:"USER_ENTERED",
        resource:{
            values: sortedSheet
          }
    }, (err, res) =>
    {
        if(err)
            console.log(err);
        else {
            console.log("Sheets has been updated");
            setCapitalTime(auth);
        }
    });
}

async function setCapitalHistory(auth)
{
    const sheets = google.sheets({version: 'v4', auth});

    await sheets.spreadsheets.values.get(
    {
        spreadsheetId: config.mainSheetID,
        range: 'Capital History!A2:G',
    }, async (err, res) =>
    {
        let data = res.data.values || [];

        const historydb = await database.find(database.DATABASE_NAME.clanCapital, database.COLLECTION.warhistory, { clanTag: `#${config.clanTag}` });
        data.unshift([
            `${_formatDateString(historydb.raidHistory[0].raidStartDate, true)} - ${_formatDateString(historydb.raidHistory[0].raidEndDate, true)}`,
            historydb.raidHistory[0].totalAttacks,
            historydb.raidHistory[0].totalLootEarned,
            historydb.raidHistory[0].districtsKilled,
            historydb.raidHistory[0].raidCount,
            historydb.raidHistory[0].defenseCount,
            `${historydb.raidHistory[0].clanMembers}/50`
        ]);
														

        sheets.spreadsheets.values.update(
        {
            spreadsheetId: config.mainSheetID,
            range: 'Capital History!A2:G',
            valueInputOption:"USER_ENTERED",
            resource:{
                values: data
            }
        }, (err, res) =>
        {
            if(err)
                console.log(err);
            else {
                console.log("History has successfully been added for Capital Sheet data.");
            }
        });
    });
}

async function setCapitalTime(auth) {
    const sheets = google.sheets({version: 'v4', auth});
    await sheets.spreadsheets.values.get(
    {
        spreadsheetId: config.mainSheetID,
        range: 'Clan Capital!K2:ZZ2',
    }, async (err, res) =>
    {
        if (err) return console.log('The API returned an error: ' + err);
        let data = res.data.values || [[]];

        const clanHistory = await database.find(database.DATABASE_NAME.clanCapital, database.COLLECTION.warhistory, { clanTag: `#${config.clanTag}` })
        const startDate = _formatDateString(clanHistory.raidHistory[0].raidStartDate);
        const endDate = _formatDateString(clanHistory.raidHistory[0].raidEndDate);

        data[0].unshift(`${startDate} - ${endDate}`);
        sheets.spreadsheets.values.update(
        {
            spreadsheetId: config.mainSheetID,
            range: 'Clan Capital!K2:ZZ2',
            valueInputOption:"USER_ENTERED",
            resource:{
                values: data
            }
        }, (err, res) =>
        {
            if(err)
                console.log(err);
            else {
                console.log("Time has successfully been added for Capital Sheet data.");
            }
        });

        //Keep track of the last clan we fought / tracked
        const tracker = require("./warTracker.js");
        tracker.setCapitalNodeData(clanHistory.raidHistory[0].raidStartDate, clanHistory.raidHistory[0].raidEndDate);
    });
}

async function setWarData(auth, newData, clanData)
{
    const sheets = google.sheets({version: 'v4', auth});
    const sortedSheet = _sortByRoles(newData);

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
            values: sortedSheet
          }
    }, (err, res) =>
    {
        if(err)
            console.log(err);
        else {
            console.log("Sheets has been updated");
            setWarTime(auth, clanData);
        }
    });
}

async function setWarTime(auth, warData) {
    const sheets = google.sheets({version: 'v4', auth});
    await sheets.spreadsheets.values.get(
    {
        spreadsheetId: config.mainSheetID,
        range: 'War Tracker!I2:ZZ2',
    }, async (err, res) =>
    {
        if (err) return console.log('The API returned an error: ' + err);
        let data = res.data.values || [[]];

        const clanHistory = await database.find(database.DATABASE_NAME.war, database.COLLECTION.warhistory, { clanTag: `${config.clanTag}` });
        data[0].unshift(clanHistory.log[clanHistory.log.length - 1].date);
        sheets.spreadsheets.values.update(
        {
            spreadsheetId: config.mainSheetID,
            range: 'War Tracker!I2:ZZ2',
            valueInputOption:"USER_ENTERED",
            resource:{
                values: data
            }
        }, (err, res) =>
        {
            if(err)
                console.log(err);
            else {
                console.log("Time has successfully been added for War Sheet data.");
            }
        });

        //Keep track of the last clan we fought / tracked
        const tracker = require("./warTracker.js");
        tracker.setNodeData(warData);
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