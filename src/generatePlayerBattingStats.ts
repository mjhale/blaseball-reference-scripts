/*eslint no-prototype-builtins: "off"*/
/**
 * A script that generates Blaseball batting stats based on gameDataUpdate feeds
 * - Tailored to blaseball-reference frontend usage
 * - @WIP
 */
import fs from "fs";
import ndjson from "ndjson";
import deburr from "lodash.deburr";

interface Player {
  aliases: Array<string | null>;
  id: string | null;
  currentTeamId: string | null;
  currentTeamName: string | null;
  debutDay: number;
  debutGameId: string;
  debutSeason: number;
  debutTeamId: string;
  debutTeamName: string;
  isIncinerated: boolean;
  incineratedGameDay: number | null;
  incineratedGameId: string | null;
  incineratedGameSeason: number | null;
  lastGameDay: number | null;
  lastGameId: string | null;
  lastGameSeason: number | null;
  name: string | null;
  position: "lineup";
  slug: string | null;
}

// Location of feed archive
const gameDataUpdatesFile = "./tmp/blaseball-log.json";
const pipeline = fs.createReadStream(gameDataUpdatesFile).pipe(ndjson.parse());

// Create initial player object and stat object
const batterSummaries = {};
const playerList: any = [];

// Maintain a copy of the previous game state update
let prevGameStates: any = null;

// Maintain a list of seen batters by game id
const seenBatters = {};

// Process game feed logs
pipeline.on("data", (gameDataUpdate) => {
  const currGameStates = gameDataUpdate.schedule;

  // Exclude updates with no games taking place
  if (
    !Array.isArray(currGameStates) ||
    (Array.isArray(currGameStates) && currGameStates.length === 0)
  ) {
    return;
  }

  // Ignore update if it's identical to previous tick
  if (JSON.stringify(currGameStates) === JSON.stringify(prevGameStates)) {
    return;
  }

  // Iterate through each game in current tick
  currGameStates.forEach((gameState) => {
    // Normalize ID field to account for old archives and new archives (_id and id)
    if (!gameState.hasOwnProperty("id") && gameState.hasOwnProperty("_id")) {
      gameState.id = gameState._id;
    }

    // Create a reference to the game's previous tick state
    const prevGameState: any = prevGameStates
      ? prevGameStates.find((prevState) => prevState.id === gameState.id)
      : null;

    // Ignore games that have not started
    if (!gameState.gameStart) {
      return;
    }

    // Ignores games that were marked as completed in last tick
    if (prevGameState && gameState.gameComplete && prevGameState.gameComplete) {
      return;
    }

    // Ignore game if its state has not changed from last tick
    if (JSON.stringify(gameState) === JSON.stringify(prevGameState)) {
      return;
    }

    // Helper variables for various stat tracking scenarios
    const currBatter = gameState.topOfInning
      ? gameState.awayBatter
      : gameState.homeBatter;
    const currBatterName = gameState.topOfInning
      ? gameState.awayBatterName
      : gameState.homeBatterName;
    const prevBatter =
      prevGameState &&
      (prevGameState.topOfInning
        ? prevGameState.awayBatter
        : prevGameState.homeBatter);
    const prevBatterName =
      prevGameState &&
      (prevGameState.topOfInning
        ? prevGameState.awayBatterName
        : prevGameState.homeBatterName);

    // Create initial summary objects if batter hasn't been previously seen
    if (
      currBatter &&
      !Object.prototype.hasOwnProperty.call(batterSummaries, currBatter)
    ) {
      batterSummaries[currBatter] = createBatterSummaryObject({
        id: currBatter,
        name: currBatterName,
      });
    }

    if (
      prevBatter &&
      !Object.prototype.hasOwnProperty.call(batterSummaries, prevBatter)
    ) {
      batterSummaries[prevBatter] = createBatterSummaryObject({
        id: prevBatter,
        name: prevBatterName,
      });
    }

    // Add player to player list
    if (currBatter) {
      if (playerList.find((p) => p.id === currBatter) === undefined) {
        playerList.push(
          createPlayerObject({
            initialValues: { id: currBatter, name: currBatterName },
            relativeGameState: gameState,
          })
        );
      } else {
        const player: any = playerList.find((p) => p.id === currBatter);

        if (player) {
          if (currBatterName !== player.name) {
            if (!player.aliases.find((a) => a === player.name)) {
              player.aliases.push(player.name);
            }

            player.name = currBatterName;
          }

          player.currentTeamId = gameState.topOfInning
            ? gameState.awayTeam
            : gameState.homeTeam;
          player.currentTeamName = gameState.topOfInning
            ? gameState.awayTeamName
            : gameState.homeTeamName;
          player.lastGameDay = gameState.day;
          player.lastGameId = gameState.id;
          player.lastGameSeason = gameState.season;
        }
      }
    }

    // Initialize batter stat objects for newly recorded seasons and postseasons
    // - Postseasons
    if (
      currBatter &&
      gameState.isPostseason &&
      !batterSummaries[currBatter].postseasons.hasOwnProperty(gameState.season)
    ) {
      batterSummaries[currBatter].postseasons[
        gameState.season
      ] = initialBatterStatsObject();
    }

    if (
      prevBatter &&
      currBatter !== prevBatter &&
      gameState.isPostseason &&
      !batterSummaries[prevBatter].postseasons.hasOwnProperty(gameState.season)
    ) {
      batterSummaries[prevBatter].postseasons[
        gameState.season
      ] = initialBatterStatsObject();
    }

    // - Seasons
    if (
      currBatter &&
      !gameState.isPostseason &&
      !batterSummaries[currBatter].seasons.hasOwnProperty(gameState.season)
    ) {
      batterSummaries[currBatter].seasons[
        gameState.season
      ] = initialBatterStatsObject();
    }

    if (
      prevBatter &&
      currBatter !== prevBatter &&
      !gameState.isPostseason &&
      !batterSummaries[prevBatter].seasons.hasOwnProperty(gameState.season)
    ) {
      batterSummaries[prevBatter].seasons[
        gameState.season
      ] = initialBatterStatsObject();
    }

    // Helper variables for various stat tracking scenarios
    const currBatterSummary =
      currBatter &&
      (gameState.isPostseason
        ? batterSummaries[currBatter].postseasons[gameState.season]
        : batterSummaries[currBatter].seasons[gameState.season]);

    const prevBatterSummary =
      prevBatter &&
      (gameState.isPostseason
        ? batterSummaries[prevBatter].postseasons[gameState.season]
        : batterSummaries[prevBatter].seasons[gameState.season]);

    // Add player's starting team to season data
    // @TODO: Account for batter moving teams during the season
    if (currBatterSummary && currBatterSummary.team === null) {
      currBatterSummary.team = gameState.topOfInning
        ? gameState.awayTeam
        : gameState.homeTeam;
    }

    if (currBatterSummary && currBatterSummary.teamName === null) {
      currBatterSummary.teamName = gameState.topOfInning
        ? gameState.awayTeamName
        : gameState.homeTeamName;
    }

    if (prevBatterSummary && prevBatterSummary.team === null) {
      prevBatterSummary.team = prevGameState.topOfInning
        ? prevGameState.awayTeam
        : prevGameState.homeTeam;
    }

    if (prevBatterSummary && prevBatterSummary.teamName === null) {
      prevBatterSummary.teamName = prevGameState.topOfInning
        ? prevGameState.awayTeamName
        : prevGameState.homeTeamName;
    }

    // Increment appearances
    // @TODO: Account for mid-game substitutions / incinerations
    if (!seenBatters.hasOwnProperty(gameState.id)) {
      seenBatters[gameState.id] = {};
    }

    if (
      currBatterSummary &&
      !seenBatters[gameState.id].hasOwnProperty(currBatter)
    ) {
      seenBatters[gameState.id][currBatter] = gameState.inning;
      currBatterSummary.appearances += 1;
    }

    // Increment plate appearances, defined as PA = H, BB, K, HBP, SH, SF, DI, E, DFO
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(
        /(hits a|hit into|fielder's choice|strikes out|struck out|ground out|flyout|sacrifice|draws a walk)/i
      ) !== null
    ) {
      prevBatterSummary.plateAppearances += 1;
    }

    // Increment at bats
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(
        /(hits a|hit into|fielder's choice|strikes out|struck out|ground out|flyout)/i
      ) !== null
    ) {
      prevBatterSummary.atBats += 1;
    }

    // Increment runs batted in
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/(home run|scores|grand slam)/i) !== null
    ) {
      prevBatterSummary.runsBattedIn +=
        gameState.halfInningScore - prevGameState.halfInningScore;
    }

    // Increment runs scored for home runs
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/(home run|grand slam)/i) !== null
    ) {
      prevBatterSummary.runsScored += 1;
    }

    // Increment runs scored for following scenarios, assuming runner on third is only runner to score
    // [x] - José Haley reaches on fielder's choice. Cell Barajas out at second base. Ronan Combs scores
    // [x] - Marco Stink  scores on the sacrifice.
    // [x] - Morrow Doyle hit a sacrifice fly. Esme Ramsey tags up and scores!
    // [x] - Paula Mason draws a walk. Baby Urlacher scores!
    if (prevGameState && gameState.lastUpdate.match(/\D scores/i) !== null) {
      const scoringRunnerId = prevGameState.baseRunners[0];

      // Increment runs scored for runner on third
      // - @TODO: Add initial batter object if it doesn't exist
      if (batterSummaries.hasOwnProperty(scoringRunnerId)) {
        if (gameState.isPostseason) {
          batterSummaries[scoringRunnerId].postseasons[
            gameState.season
          ].runsScored += 1;
        } else {
          batterSummaries[scoringRunnerId].seasons[
            gameState.season
          ].runsScored += 1;
        }
      }
    }

    // Increment runs scored for following scenarios
    // [x] - Lang Richardson hits a Single! 1 scores.
    const numberOfRunsScoredMatch = gameState.lastUpdate.match(/(\d) scores/i);
    if (prevGameState && numberOfRunsScoredMatch !== null) {
      const runsScored = Number(numberOfRunsScoredMatch[1]);
      const prevBasesRunners = prevGameState.baseRunners.slice();

      for (let i = 0; i <= runsScored; i++) {
        const scoringRunnerId = prevBasesRunners.shift();

        // Increment runs scored for runner on third
        // - @TODO: Add initial batter object if it doesn't exist
        if (batterSummaries.hasOwnProperty(scoringRunnerId)) {
          if (gameState.isPostseason) {
            batterSummaries[scoringRunnerId].postseasons[
              gameState.season
            ].runsScored += 1;
          } else {
            batterSummaries[scoringRunnerId].seasons[
              gameState.season
            ].runsScored += 1;
          }
        }
      }
    }

    // [x] - Hurley Pacheco hits a 3-run home run!
    // [x] - Hendricks Rangel hits a grand slam!
    if (
      prevGameState &&
      gameState.lastUpdate.match(/home run|grand slam/i) !== null
    ) {
      for (const scoringRunnerId of prevGameState.baseRunners) {
        // Increment runs scored for runner on third
        // - @TODO: Add initial batter object if it doesn't exist
        if (batterSummaries.hasOwnProperty(scoringRunnerId)) {
          if (gameState.isPostseason) {
            batterSummaries[scoringRunnerId].postseasons[
              gameState.season
            ].runsScored += 1;
          } else {
            batterSummaries[scoringRunnerId].seasons[
              gameState.season
            ].runsScored += 1;
          }
        }
      }
    }

    // Increment hits
    if (prevBatterSummary && gameState.lastUpdate.match(/(hits a)/i) !== null) {
      prevBatterSummary.hits += 1;
    }

    // Increment doubles hit
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/(hits a double)/i) !== null
    ) {
      prevBatterSummary.doublesHit += 1;
    }

    // Increment triples hit
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/(hits a triple)/i) !== null
    ) {
      prevBatterSummary.triplesHit += 1;
    }

    // Increment home runs hit
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/(home run|grand slam)/i) !== null
    ) {
      prevBatterSummary.homeRunsHit += 1;
    }

    // Increment bases on balls
    if (prevBatterSummary && gameState.lastUpdate.match(/(walk)/i) !== null) {
      prevBatterSummary.basesOnBalls += 1;
    }

    // Increment strikeouts
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/(strikes out|struck out)/i) !== null
    ) {
      prevBatterSummary.strikeouts += 1;
    }

    // Increment ground into double plays
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/hit into a double play/i) !== null
    ) {
      prevBatterSummary.groundIntoDoublePlays += 1;
    }

    // Increment sacrifice bunts/hits
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/scores on the sacrifice/i) !== null
    ) {
      prevBatterSummary.sacrificeBunts += 1;
    }

    // Increment sacrifice flies
    if (
      prevBatterSummary &&
      gameState.lastUpdate.match(/sacrifice fly/i) !== null
    ) {
      prevBatterSummary.sacrificeFlies += 1;
    }

    // Increment steals
    // @TODO: Check the semantics of what qualifies as a steal
    const stolenBaseMatch = gameState.lastUpdate.match(/steals ([\w].*?)!/i);
    if (prevGameState && stolenBaseMatch !== null) {
      const prevBasesOccupied = prevGameState.basesOccupied.slice();
      const basesOccupied = gameState.basesOccupied.slice();

      // let stolenBases = [];

      // Identify all bases that were stolen
      for (const base of prevBasesOccupied) {
        if (base === 2) {
          // Normalize (?) gameState basesOccupied array to process index changes caused by steals home
          // - Assumes third base steals always appear first in array
          // - The value of '3' represents home
          basesOccupied.unshift(3);
        }

        // Identify which runners advanced
        if (prevBasesOccupied[base] !== basesOccupied[base]) {
          // [ Runner ID, Base Stolen From ]
          // stolenBases.push([prevGameState.baseRunners[base], prevGameState.basesOccupied[base]]);

          // Increment that runner's stolen bases
          // - @TODO: Add initial batter object if it doesn't exist
          if (batterSummaries.hasOwnProperty(prevGameState.baseRunners[base])) {
            if (gameState.isPostseason) {
              batterSummaries[prevGameState.baseRunners[base]].postseasons[
                gameState.season
              ].stolenBases += 1;
            } else {
              batterSummaries[prevGameState.baseRunners[base]].seasons[
                gameState.season
              ].stolenBases += 1;
            }
          }
        }
      }
    }

    // Increment caught stealing
    // @TODO: Check the semantics of what qualifies as caught stealing
    // @TODO: Check what happens when caught stealing out ends the inning
    const caughtStealingMatch = gameState.lastUpdate.match(
      /([\w].*?) gets caught stealing/i
    );
    if (prevGameState && caughtStealingMatch !== null) {
      const caughtStealingName = caughtStealingMatch[1];

      // Identify runner caught stolen
      for (const base of prevGameState.basesOccupied) {
        if (
          prevGameState.basesOccupied[base] !== gameState.basesOccupied[base]
        ) {
          const runnerId = prevGameState.baseRunners[base];

          if (batterSummaries[runnerId].name === caughtStealingName) {
            const runnerSummary = gameState.isPostseason
              ? batterSummaries[runnerId].postseasons[prevGameState.season]
              : batterSummaries[runnerId].seasons[prevGameState.season];

            runnerSummary.caughtStealing += 1;
          }
        }
      }
    }

    // Update player attributes following incineration
    // @TODO: Handle at-bat substitutions..?
    const incineratedPlayerMatch = gameState.lastUpdate.match(
      /Rogue Umpire incinerated [\w\s]+ hitter ([\w\s]+)!/i
    );
    if (prevGameState && incineratedPlayerMatch !== null) {
      const incineratedPlayerName: string = incineratedPlayerMatch[1];
      const incineratedPlayer: any = playerList.find(
        (player) => player?.name === incineratedPlayerName
      );

      // Update incinerated player's player file
      if (incineratedPlayer) {
        incineratedPlayer.incineratedGameDay = prevGameState.day;
        incineratedPlayer.incineratedGameId = prevGameState.id;
        incineratedPlayer.incineratedGameSeason = prevGameState.season;
        incineratedPlayer.isIncinerated = true;
      } else {
        console.log(
          `Unable to locate incinerated player: ${incineratedPlayerName}`
        );
      }
    }
  });

  // Replace previous game states with current game states
  prevGameStates = currGameStates;
});

pipeline.on("end", async () => {
  Object.keys(batterSummaries).forEach((batter) => {
    const careerPostseasonData = batterSummaries[batter].careerPostseason;
    const careerSeasonData = batterSummaries[batter].careerSeason;
    const seasonsData = batterSummaries[batter].seasons;
    const postseasonsData = batterSummaries[batter].postseasons;

    Object.keys(seasonsData).forEach((season) => {
      const seasonStats = batterSummaries[batter].seasons[season];

      // Calculate non-tally based season stats
      seasonStats.battingAverage = calculateBattingAverage(seasonStats);
      seasonStats.onBasePercentage = calculateOnBasePercentage(seasonStats);
      seasonStats.sluggingPercentage = calculateSluggingPercentage(seasonStats);
      seasonStats.totalBases = calculateTotalBases(seasonStats);
      // OPS must go after OBP and SLG calculations
      seasonStats.onBasePlusSlugging = calculateOnBasePlusSlugging(seasonStats);

      // Add current season tallies to careerSeasonData
      careerSeasonData.appearances += seasonStats.appearances;
      careerSeasonData.plateAppearances += seasonStats.plateAppearances;
      careerSeasonData.atBats += seasonStats.atBats;
      careerSeasonData.runsScored += seasonStats.runsScored;
      careerSeasonData.hits += seasonStats.hits;
      careerSeasonData.doublesHit += seasonStats.doublesHit;
      careerSeasonData.triplesHit += seasonStats.triplesHit;
      careerSeasonData.homeRunsHit += seasonStats.homeRunsHit;
      careerSeasonData.runsBattedIn += seasonStats.runsBattedIn;
      careerSeasonData.stolenBases += seasonStats.stolenBases;
      careerSeasonData.caughtStealing += seasonStats.caughtStealing;
      careerSeasonData.basesOnBalls += seasonStats.basesOnBalls;
      careerSeasonData.strikeouts += seasonStats.strikeouts;
      careerSeasonData.totalBases += seasonStats.totalBases;
      careerSeasonData.groundIntoDoublePlays +=
        seasonStats.groundIntoDoublePlays;
      careerSeasonData.sacrificeBunts += seasonStats.sacrificeBunts;
      careerSeasonData.sacrificeFlies += seasonStats.sacrificeFlies;
    });

    Object.keys(postseasonsData).forEach((postseason) => {
      const postseasonStats = batterSummaries[batter].postseasons[postseason];

      // Calculate non-tally based postseason stats
      postseasonStats.battingAverage = calculateBattingAverage(postseasonStats);
      postseasonStats.onBasePercentage = calculateOnBasePercentage(
        postseasonStats
      );
      postseasonStats.sluggingPercentage = calculateSluggingPercentage(
        postseasonStats
      );
      postseasonStats.totalBases = calculateTotalBases(postseasonStats);
      // OPS must go after OBP and SLG calculations
      postseasonStats.onBasePlusSlugging = calculateOnBasePlusSlugging(
        postseasonStats
      );

      // Add current season tallies to careerPostseasonData
      careerPostseasonData.appearances += postseasonStats.appearances;
      careerPostseasonData.plateAppearances += postseasonStats.plateAppearances;
      careerPostseasonData.atBats += postseasonStats.atBats;
      careerPostseasonData.runsScored += postseasonStats.runsScored;
      careerPostseasonData.hits += postseasonStats.hits;
      careerPostseasonData.doublesHit += postseasonStats.doublesHit;
      careerPostseasonData.triplesHit += postseasonStats.triplesHit;
      careerPostseasonData.homeRunsHit += postseasonStats.homeRunsHit;
      careerPostseasonData.runsBattedIn += postseasonStats.runsBattedIn;
      careerPostseasonData.stolenBases += postseasonStats.stolenBases;
      careerPostseasonData.caughtStealing += postseasonStats.caughtStealing;
      careerPostseasonData.basesOnBalls += postseasonStats.basesOnBalls;
      careerPostseasonData.strikeouts += postseasonStats.strikeouts;
      careerPostseasonData.totalBases += postseasonStats.totalBases;
      careerPostseasonData.groundIntoDoublePlays +=
        postseasonStats.groundIntoDoublePlays;
      careerPostseasonData.sacrificeBunts += postseasonStats.sacrificeBunts;
      careerPostseasonData.sacrificeFlies += postseasonStats.sacrificeFlies;
    });

    // Calculate non-tally based career season stats
    // careerSeasonData.basesOnBallsPerNine = calculateBasesOnBallsPerNine(careerSeasonData);
    careerSeasonData.battingAverage = calculateBattingAverage(careerSeasonData);
    careerSeasonData.onBasePercentage = calculateOnBasePercentage(
      careerSeasonData
    );
    careerSeasonData.sluggingPercentage = calculateSluggingPercentage(
      careerSeasonData
    );
    careerSeasonData.totalBases = calculateTotalBases(careerSeasonData);
    // OPS must go after OBP and SLG calculations
    careerSeasonData.onBasePlusSlugging = calculateOnBasePlusSlugging(
      careerSeasonData
    );

    // Calculate non-tally based postcareer season stats
    // careerPostseasonData.basesOnBallsPerNine = calculateBasesOnBallsPerNine(careerPostseasonData);
    careerPostseasonData.battingAverage = calculateBattingAverage(
      careerPostseasonData
    );
    careerPostseasonData.onBasePercentage = calculateOnBasePercentage(
      careerPostseasonData
    );
    careerPostseasonData.sluggingPercentage = calculateSluggingPercentage(
      careerPostseasonData
    );
    careerPostseasonData.totalBases = calculateTotalBases(careerPostseasonData);
    // OPS must go after OBP and SLG calculations
    careerPostseasonData.onBasePlusSlugging = calculateOnBasePlusSlugging(
      careerPostseasonData
    );
  });

  // Output objects to JSON files
  await fs.promises.mkdir("./data/batting", { recursive: true });
  const batterSummariesWriteStream = fs.createWriteStream(
    "./data/batting/batters.json"
  );
  batterSummariesWriteStream.write(
    `${JSON.stringify({ ...batterSummaries }, null, "\t")}\n`
  );
  batterSummariesWriteStream.end();

  // Output individual batters summaries
  Object.keys(batterSummaries).forEach(async (batter) => {
    await fs.promises.mkdir(`./data/batting/${batterSummaries[batter].slug}`, {
      recursive: true,
    });
    const batterSummaryWriteStream = fs.createWriteStream(
      `./data/batting/${batterSummaries[batter].slug}/summary.json`
    );
    batterSummaryWriteStream.write(
      `${JSON.stringify({ ...batterSummaries[batter] }, null, "\t")}\n`
    );
    batterSummaryWriteStream.end();
  });

  // Append batter to list of all players
  await fs.promises.mkdir(`./data/players`, { recursive: true });
  const playerListWriteStream = fs.createWriteStream(
    "./data/players/batters.json"
  );
  playerListWriteStream.write(`${JSON.stringify(playerList, null, "\t")}\n`);
  playerListWriteStream.end();
});

function calculateBattingAverage(stats) {
  return stats.atBats > 0 ? stats.hits / stats.atBats : 0;
}

function calculateOnBasePercentage(stats) {
  return stats.atBats + stats.basesOnBalls + stats.sacrificeFlies > 0
    ? (stats.hits + stats.basesOnBalls) /
        (stats.atBats + stats.basesOnBalls + stats.sacrificeFlies)
    : 0;
}

function calculateOnBasePlusSlugging(stats) {
  return stats.onBasePercentage + stats.sluggingPercentage;
}

function calculateSluggingPercentage(stats) {
  const singlesHit =
    stats.hits - (stats.doublesHit + stats.triplesHit + stats.homeRunsHit);

  return stats.atBats > 0
    ? (singlesHit +
        stats.doublesHit * 2 +
        stats.triplesHit * 3 +
        stats.homeRunsHit * 4) /
        stats.atBats
    : 0;
}

function calculateTotalBases(stats) {
  const singlesHit =
    stats.hits - (stats.doublesHit + stats.triplesHit + stats.homeRunsHit);

  return (
    singlesHit +
    stats.doublesHit * 2 +
    stats.triplesHit * 3 +
    stats.homeRunsHit * 4
  );
}

function createBatterSummaryObject(initialValues) {
  const defaults = {
    careerPostseason: initialBatterStatsObject(),
    careerSeason: initialBatterStatsObject(),
    id: null,
    name: null,
    seasons: {},
    slug: initialValues.hasOwnProperty("name")
      ? deburr(initialValues.name).toLowerCase().replace(/\s/g, "-")
      : null,
    postseasons: {},
  };

  // Perform a shallow copy of initialValues over defaults
  return Object.assign({}, defaults, initialValues);
}

function createPlayerObject({
  initialValues,
  relativeGameState,
}: {
  initialValues: any;
  relativeGameState: any;
}): Player {
  const currTeamId: string = relativeGameState.topOfInning
    ? relativeGameState.awayTeam
    : relativeGameState.homeTeam;
  const currTeamName: string = relativeGameState.topOfInning
    ? relativeGameState.awayTeamName
    : relativeGameState.homeTeamName;

  const defaults = {
    aliases: [],
    id: null,
    currentTeamId: currTeamId,
    currentTeamName: currTeamName,
    debutDay: relativeGameState.day,
    debutGameId: relativeGameState.id,
    debutSeason: relativeGameState.season,
    debutTeamId: currTeamId,
    debutTeamName: currTeamName,
    isIncinerated: false,
    incineratedGameDay: null,
    incineratedGameId: null,
    incineratedGameSeason: null,
    lastGameDay: relativeGameState.day,
    lastGameId: relativeGameState.id,
    lastGameSeason: relativeGameState.season,
    name: null,
    position: "lineup",
    slug: initialValues.hasOwnProperty("name")
      ? deburr(initialValues.name).toLowerCase().replace(/\s/g, "-")
      : null,
  };

  // Perform a shallow copy of initialValues over defaults
  return Object.assign({}, defaults, initialValues);
}

function initialBatterStatsObject(initialValues = {}) {
  const defaults = {
    appearances: 0,
    atBats: 0,
    basesOnBalls: 0,
    battingAverage: 0,
    caughtStealing: 0,
    doublesHit: 0,
    groundIntoDoublePlays: 0,
    hits: 0,
    homeRunsHit: 0,
    onBasePercentage: 0,
    onBasePlusSlugging: 0,
    plateAppearances: 0,
    runsBattedIn: 0,
    runsScored: 0,
    sacrificeBunts: 0,
    sacrificeFlies: 0,
    sluggingPercentage: 0,
    stolenBases: 0,
    strikeouts: 0,
    team: null,
    teamName: null,
    totalBases: 0,
    triplesHit: 0,
  };

  // Perform a shallow copy of initialValues over defaults
  return Object.assign({}, defaults, initialValues);
}
