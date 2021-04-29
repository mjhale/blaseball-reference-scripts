/* eslint no-prototype-builtins: "off" */
/**
 * A script that generates Blaseball pitcher stats based on gameDataUpdate feeds
 * - Tailored to blaseball-reference frontend usage
 *
 * @TODO: Seasonal data should account for player mid-season team changes
 * @WIP
 */
import * as fs from 'fs';
import ndjson from 'ndjson';
import dotenv from 'dotenv';
import { fetchData } from './utils';
import hash from 'object-hash';
import merge from 'deepmerge';

dotenv.config();

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
  position: 'lineup';
  slug: string | null;
}

// Fetch current season number to limit processing to current season only
let standingsBySeason;
let generateStatsFromSeason = 0;

function getMostRecentSeasonFromStandings() {
  try {
    standingsBySeason = JSON.parse(
      fs.readFileSync('./data/standings/standings.json', 'utf8')
    );

    generateStatsFromSeason = Number(
      Object.keys(standingsBySeason)
        .sort((a, b) => Number(a) - Number(b))
        .pop()
    );
  } catch (error) {
    console.log(error);
  }
}

getMostRecentSeasonFromStandings();

// Override most recent season based on FROM_SEASON env var
if (process.env.FROM_SEASON !== undefined) {
  generateStatsFromSeason = Number(process.env.FROM_SEASON);
}

// Location of feed archive
const gameDataUpdatesFile = './tmp/blaseball-log.json';
const pipeline = fs
  .createReadStream(gameDataUpdatesFile)
  .pipe(ndjson.parse({ strict: false }));

// Maintain objects of all pitcher summaries and general info
let pitcherSummaries: any = {};
let playerList: Array<Player>;

// Initialize player list with existing data
try {
  playerList = JSON.parse(
    fs.readFileSync('./data/players/pitchers.json', 'utf8')
  );
} catch (error) {
  playerList = [];
  console.log(error);
}

// Maintain hashes for each game state update to avoid duplicate updates
const gameStateHashes = {};

// Maintain a copy of the previous game state update
let prevGameStates: any = null;

pipeline.on('error', (error) => {
  console.log(error);
  return;
});

// Process game feed logs
pipeline.on('data', (gameDataUpdate) => {
  if (
    gameDataUpdate?.sim?.season &&
    gameDataUpdate.sim.season < generateStatsFromSeason
  ) {
    return;
  }

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

  // Ignore duplicate game states
  const currGameStateHash = hash(currGameStates);
  if (Object.hasOwnProperty.call(gameStateHashes, currGameStateHash)) {
    console.log(`Duplicate game states found with hash ${currGameStateHash}`);

    prevGameStates = currGameStates;
    return;
  } else {
    gameStateHashes[currGameStateHash] = currGameStateHash;
  }

  // Iterate through each game in current tick
  currGameStates.forEach(async (gameState) => {
    if (!gameState) {
      return;
    }

    // Normalize ID field to account for old archives and new archives (_id and id)
    if (!gameState.hasOwnProperty('id') && gameState.hasOwnProperty('_id')) {
      gameState.id = gameState._id;
    }

    // Create a reference to the game's previous tick state
    const prevGameState = prevGameStates
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

    // Ignore duplicate game states
    const currGameStateHash = hash(gameState);
    if (Object.hasOwnProperty.call(gameStateHashes, currGameStateHash)) {
      console.log(`Duplicate game state found from game ${gameState.id}`);
      return;
    } else {
      gameStateHashes[currGameStateHash] = currGameStateHash;
    }

    // Helper variables for various stat tracking scenarios
    const currPitcher = gameState.topOfInning
      ? gameState.homePitcher
      : gameState.awayPitcher;
    const currPitcherName = gameState.topOfInning
      ? gameState.homePitcherName
      : gameState.awayPitcherName;
    const currPitcherTeamId = gameState.topOfInning
      ? gameState.homeTeam
      : gameState.awayTeam;
    const currPitcherTeamName = gameState.topOfInning
      ? gameState.homeTeamName
      : gameState.awayTeamName;
    const prevPitcher =
      prevGameState &&
      (prevGameState.topOfInning
        ? prevGameState.homePitcher
        : prevGameState.awayPitcher);
    const prevPitcherName =
      prevGameState &&
      (gameState.topOfInning
        ? gameState.homePitcherName
        : gameState.awayPitcherName);
    const prevPitcherTeamId =
      prevGameState &&
      (prevGameState.topOfInning
        ? prevGameState.homeTeam
        : prevGameState.awayTeam);
    const prevPitcherTeamName =
      prevGameState &&
      (prevGameState.topOfInning
        ? prevGameState.homeTeamName
        : prevGameState.awayTeamName);

    const awayPitcher = gameState && gameState.awayPitcher;
    const homePitcher = gameState && gameState.homePitcher;

    // Create initial summary objects if pitcher hasn't been previously seen
    if (!Object.prototype.hasOwnProperty.call(pitcherSummaries, currPitcher)) {
      const playerFromDatablase: {
        url_slug: string;
      } = await getPlayerFromDatablase(currPitcher);

      const name = gameState.topOfInning
        ? gameState.homePitcherName
        : gameState.awayPitcherName;
      pitcherSummaries[currPitcher] = createPitcherSummaryObject({
        id: currPitcher,
        name,
        slug: playerFromDatablase.url_slug,
      });
    }

    if (
      currPitcher !== awayPitcher &&
      !Object.prototype.hasOwnProperty.call(pitcherSummaries, awayPitcher)
    ) {
      const playerFromDatablase: {
        url_slug: string;
      } = await getPlayerFromDatablase(awayPitcher);

      pitcherSummaries[awayPitcher] = createPitcherSummaryObject({
        id: awayPitcher,
        name: gameState.awayPitcherName,
        slug: playerFromDatablase.url_slug,
      });
    }

    if (
      currPitcher !== homePitcher &&
      !Object.prototype.hasOwnProperty.call(pitcherSummaries, homePitcher)
    ) {
      const playerFromDatablase: {
        url_slug: string;
      } = await getPlayerFromDatablase(homePitcher);

      pitcherSummaries[homePitcher] = createPitcherSummaryObject({
        id: homePitcher,
        name: gameState.homePitcherName,
        slug: playerFromDatablase.url_slug,
      });
    }

    // Add player to player list
    const player = playerList.find((p) => p.id === currPitcher);

    if (!player) {
      playerList.push(
        createPlayerObject({
          initialValues: {
            id: currPitcher,
            name: gameState.topOfInning
              ? gameState.homePitcherName
              : gameState.awayPitcherName,
          },
          relativeGameState: gameState,
        })
      );
    } else {
      if (currPitcherName !== player.name) {
        if (!player.aliases.find((a) => a === player.name)) {
          player.aliases.push(player.name);
        }

        player.name = currPitcherName;
      }

      player.currentTeamId = currPitcherTeamId;
      player.currentTeamName = currPitcherTeamName;
      player.lastGameDay = gameState.day;
      player.lastGameId = gameState.id;
      player.lastGameSeason = gameState.season;
    }

    if (currPitcher !== awayPitcher) {
      if (!playerList.find((p) => p.id === awayPitcher)) {
        playerList.push(
          createPlayerObject({
            initialValues: {
              id: awayPitcher,
              currentTeamId: gameState.awayTeam,
              currentTeamName: gameState.awayTeamName,
              debutTeamId: gameState.awayTeam,
              debutTeamName: gameState.awayTeamName,
              name: gameState.awayPitcherName,
            },
            relativeGameState: gameState,
          })
        );
      } else {
        const player = playerList.find((p) => p.id === awayPitcher);

        if (player) {
          if (gameState.awayPitcherName !== player.name) {
            if (!player.aliases.find((a) => a === player.name)) {
              player.aliases.push(player.name);
            }

            player.name = gameState.awayPitcherName;
          }

          player.currentTeamId = gameState.awayTeam;
          player.currentTeamName = gameState.awayTeamName;
          player.lastGameDay = gameState.day;
          player.lastGameId = gameState.id;
          player.lastGameSeason = gameState.season;
        }
      }
    }

    if (currPitcher !== homePitcher) {
      if (!playerList.find((p) => p.id === homePitcher)) {
        playerList.push(
          createPlayerObject({
            initialValues: {
              id: homePitcher,
              currentTeamId: gameState.homeTeam,
              currentTeamName: gameState.homeTeamName,
              debutTeamId: gameState.homeTeam,
              debutTeamName: gameState.homeTeamName,
              name: gameState.homePitcherName,
            },
            relativeGameState: gameState,
          })
        );
      } else {
        const player = playerList.find((p) => p.id === homePitcher);

        if (player) {
          if (gameState.homePitcherName !== player.name) {
            if (!player.aliases.find((a) => a === player.name)) {
              player.aliases.push(player.name);
            }

            player.name = gameState.homePitcherName;
          }

          player.currentTeamId = gameState.homeTeam;
          player.currentTeamName = gameState.homeTeamName;
          player.lastGameDay = gameState.day;
          player.lastGameId = gameState.id;
          player.lastGameSeason = gameState.season;
        }
      }
    }

    // Initialize pitcher stat objects for newly recorded seasons and postseasons
    // - Postseasons
    if (gameState.isPostseason) {
      if (
        !pitcherSummaries[currPitcher].postseasons.hasOwnProperty(
          gameState.season
        )
      ) {
        pitcherSummaries[currPitcher].postseasons[
          gameState.season
        ] = initialPitcherStatsObject();
      } else {
        pitcherSummaries[currPitcher].postseasons[
          gameState.season
        ].team = currPitcherTeamId;
        pitcherSummaries[currPitcher].postseasons[
          gameState.season
        ].teamName = currPitcherTeamName;
      }

      if (currPitcher !== awayPitcher) {
        if (
          !pitcherSummaries[awayPitcher].postseasons.hasOwnProperty(
            gameState.season
          )
        ) {
          pitcherSummaries[awayPitcher].postseasons[
            gameState.season
          ] = initialPitcherStatsObject();
        }

        pitcherSummaries[awayPitcher].postseasons[gameState.season].team =
          gameState.awayTeam;
        pitcherSummaries[awayPitcher].postseasons[gameState.season].teamName =
          gameState.awayTeamName;
      }

      if (currPitcher !== homePitcher) {
        if (
          !pitcherSummaries[homePitcher].postseasons.hasOwnProperty(
            gameState.season
          )
        ) {
          pitcherSummaries[homePitcher].postseasons[
            gameState.season
          ] = initialPitcherStatsObject();
        }

        pitcherSummaries[homePitcher].postseasons[gameState.season].team =
          gameState.homeTeam;
        pitcherSummaries[homePitcher].postseasons[gameState.season].teamName =
          gameState.homeTeamName;
      }
    }

    // - Seasons
    if (!gameState.isPostseason) {
      if (
        !pitcherSummaries[currPitcher].seasons.hasOwnProperty(gameState.season)
      ) {
        pitcherSummaries[currPitcher].seasons[
          gameState.season
        ] = initialPitcherStatsObject();
      }

      pitcherSummaries[currPitcher].seasons[
        gameState.season
      ].team = currPitcherTeamId;
      pitcherSummaries[currPitcher].seasons[
        gameState.season
      ].teamName = currPitcherTeamName;

      if (currPitcher !== awayPitcher) {
        if (
          !pitcherSummaries[awayPitcher].seasons.hasOwnProperty(
            gameState.season
          )
        ) {
          pitcherSummaries[awayPitcher].seasons[
            gameState.season
          ] = initialPitcherStatsObject();
        }

        pitcherSummaries[awayPitcher].seasons[gameState.season].team =
          gameState.awayTeam;
        pitcherSummaries[awayPitcher].seasons[gameState.season].teamName =
          gameState.awayTeamName;
      }

      if (currPitcher !== homePitcher) {
        if (
          !pitcherSummaries[homePitcher].seasons.hasOwnProperty(
            gameState.season
          )
        ) {
          pitcherSummaries[homePitcher].seasons[
            gameState.season
          ] = initialPitcherStatsObject();
        }

        pitcherSummaries[homePitcher].seasons[gameState.season].team =
          gameState.homeTeam;
        pitcherSummaries[homePitcher].seasons[gameState.season].teamName =
          gameState.homeTeamName;
      }
    }

    // Additional helper variables for various stat tracking scenarios
    const currPitcherSummary = gameState.isPostseason
      ? pitcherSummaries[currPitcher].postseasons[gameState.season]
      : pitcherSummaries[currPitcher].seasons[gameState.season];

    const awayPitcherSummary = gameState.isPostseason
      ? pitcherSummaries[awayPitcher].postseasons[gameState.season]
      : pitcherSummaries[awayPitcher].seasons[gameState.season];

    const homePitcherSummary = gameState.isPostseason
      ? pitcherSummaries[homePitcher].postseasons[gameState.season]
      : pitcherSummaries[homePitcher].seasons[gameState.season];

    const prevPitcherSummary = prevPitcher
      ? prevGameState.isPostseason
        ? pitcherSummaries[prevPitcher].postseasons[prevGameState.season]
        : pitcherSummaries[prevPitcher].seasons[prevGameState.season]
      : null;

    // Add player's starting team to season data
    // @TODO: Account for pitcher moving teams during the season
    if (awayPitcherSummary.team === null) {
      awayPitcherSummary.team = gameState.awayTeam;
    }

    if (awayPitcherSummary.teamName === null) {
      awayPitcherSummary.teamName = gameState.awayTeamName;
    }

    if (homePitcherSummary.team === null) {
      homePitcherSummary.team = gameState.homeTeam;
    }

    if (homePitcherSummary.teamName === null) {
      homePitcherSummary.teamName = gameState.homeTeamName;
    }

    const sanitizedLastUpdate = gameState.lastUpdate
      // A name so powerful that we must hide it from the regex to come
      .replace(/\bScores Baserunner\b/, '');

    const lastUpdateMatchesAny = (...pieces: string[]) => {
      const regex = new RegExp(`\\b(?:${pieces.join('|')})\\b`, 'i');
      return regex.test(sanitizedLastUpdate);
    };

    // Increment appearances for pitchers
    // @TODO: Account for mid-game pitcher changes
    if (lastUpdateMatchesAny('Game Over')) {
      awayPitcherSummary.appearances += 1;
      homePitcherSummary.appearances += 1;
    }

    // Increment outs recorded
    if (
      prevGameState &&
      lastUpdateMatchesAny(
        'hit a',
        'hit into',
        'strikes out',
        'struck out',
        'caught stealing',
        "fielder's choice",
        'sacrifice'
      )
    ) {
      prevPitcherSummary.outsRecorded += 1;
    }

    // Increment pitch count
    if (
      prevGameState &&
      lastUpdateMatchesAny(
        'hit a',
        'hit into',
        'hits',
        'foul ball',
        'draws a',
        'game over',
        'strikes out',
        'struck out',
        'reaches',
        'steals',
        'caught stealing',
        "fielder's choice",
        'sacrifice'
      )
    ) {
      prevPitcherSummary.pitchCount += 1;
    }

    // Increment wins and losses
    // @TODO: Account for mid-game pitcher changes
    if (lastUpdateMatchesAny('Game Over')) {
      if (gameState.homeScore > gameState.awayScore) {
        homePitcherSummary.wins += 1;
        awayPitcherSummary.losses += 1;
      } else {
        awayPitcherSummary.wins += 1;
        homePitcherSummary.losses += 1;
      }
    }

    // Increment flyouts
    if (prevGameState && lastUpdateMatchesAny('flyout')) {
      prevPitcherSummary.flyouts += 1;
    }

    // Increment groundouts
    if (prevGameState && lastUpdateMatchesAny('ground out')) {
      prevPitcherSummary.groundouts += 1;
    }

    // Update player attributes following incineration
    // @TODO: Handle pitcher substitutions..?
    const incineratedPlayerMatch = sanitizedLastUpdate.match(
      /\bRogue Umpire incinerated [\w\s]+ pitcher ([\w\s]+)!\b/i
    );
    if (prevGameState && incineratedPlayerMatch !== null) {
      const incineratedPlayerName = incineratedPlayerMatch[1];
      const incineratedPlayer = playerList.find(
        (player) => player.name === incineratedPlayerName
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

    // Increment hits allowed (encompasses home runs, doubles, etc)
    if (prevPitcherSummary && lastUpdateMatchesAny('hits an?')) {
      prevPitcherSummary.hitsAllowed += 1;
    }

    // Increment bases on balls
    if (
      prevPitcherSummary &&
      lastUpdateMatchesAny('draws a walk', 'with a pitch')
    ) {
      prevPitcherSummary.basesOnBalls += 1;
    }

    // Increment hit by pitches
    if (prevPitcherSummary && lastUpdateMatchesAny('with a pitch')) {
      prevPitcherSummary.hitByPitches += 1;
    }

    // Increment strikeouts
    // @TODO: Check to see if currPitcher changes if strikeout leads to inning change
    if (prevGameState && lastUpdateMatchesAny('strikes out|struck out')) {
      prevPitcherSummary.strikeouts += 1;
    }

    // Increment batters faced
    if (lastUpdateMatchesAny('batting for')) {
      currPitcherSummary.battersFaced += 1;
    }

    // Increment earned runs
    // @TODO: Account for mid-game pitcher changes
    if (prevGameState && prevGameState.awayScore !== gameState.awayScore) {
      const scoreDiff = gameState.awayScore - prevGameState.awayScore;

      // Account for shame pit activations which result in negative score diffs
      if (scoreDiff > 0) {
        homePitcherSummary.earnedRuns += scoreDiff;
      }
    }

    if (prevGameState && prevGameState.homeScore !== gameState.homeScore) {
      const scoreDiff = gameState.homeScore - prevGameState.homeScore;

      // Account for shame pit activations which result in negative score diffs
      if (scoreDiff > 0) {
        awayPitcherSummary.earnedRuns += scoreDiff;
      }
    }

    // Increment home runs allowed
    if (prevGameState && lastUpdateMatchesAny('home run', 'grand slam')) {
      prevPitcherSummary.homeRuns += 1;
    }

    // Increment quality starts
    // @TODO: Account for mid-game pitcher changes
    // @TODO: Use only earned runs for calcluation
    if (
      prevGameState &&
      prevGameState.gameComplete === false &&
      lastUpdateMatchesAny('Game over')
    ) {
      if (gameState.homeScore <= 3) {
        awayPitcherSummary.qualityStarts += 1;
      }

      if (gameState.awayScore <= 3) {
        homePitcherSummary.qualityStarts += 1;
      }
    }

    // Increment shutouts
    // @TODO: Account for mid-game pitcher changes
    if (
      prevGameState &&
      prevGameState.gameComplete === false &&
      lastUpdateMatchesAny('Game over')
    ) {
      if (gameState.homeScore === 0) {
        awayPitcherSummary.shutouts += 1;
      }

      if (gameState.awayScore === 0) {
        homePitcherSummary.shutouts += 1;
      }
    }
  });

  // Replace previous game states with current game states
  prevGameStates = currGameStates;
});

// Perform final calculations after feed is processed
pipeline.on('end', async () => {
  let existingPitcherSummaries;

  try {
    existingPitcherSummaries = JSON.parse(
      fs.readFileSync('./data/pitching/pitchers.json', 'utf8')
    );
  } catch (error) {
    existingPitcherSummaries = null;
    console.log(error);
  }

  Object.keys(pitcherSummaries).forEach((pitcher) => {
    if (
      existingPitcherSummaries &&
      Object.hasOwnProperty.call(existingPitcherSummaries, pitcher)
    ) {
      pitcherSummaries[pitcher] = merge(
        existingPitcherSummaries[pitcher],
        pitcherSummaries[pitcher],
        {
          customMerge: (key) => {
            if (key === 'seasons' || key === 'postseasons') {
              return (a, b) => {
                // Only overwrite existing data with tracked seasons
                let trackedSeasons = {};

                for (const season of Object.keys(b).sort(
                  (a, b) => Number(a) - Number(b)
                )) {
                  if (Number(season) >= Number(generateStatsFromSeason)) {
                    trackedSeasons = merge(trackedSeasons, {
                      [season]: b[season],
                    });
                  }
                }

                return {
                  ...a,
                  ...trackedSeasons,
                };
              };
            }

            if (key === 'aliases') {
              return (a, b) => {
                const aliases = new Set();
                a.forEach((alias) => aliases.add(alias));
                b.forEach((alias) => aliases.add(alias));

                return Array.from(aliases);
              };
            }

            if (
              [
                'debutDay',
                'debutGameId',
                'debutSeason',
                'debutTeamId',
                'debutTeamName',
              ].includes(key)
            ) {
              return (a, b) => {
                return a !== null && a.length > 0 ? a : b;
              };
            }
          },
        }
      );

      delete existingPitcherSummaries[pitcher];
    }

    const pitcherSummary = pitcherSummaries[pitcher];

    const careerPostseasonData = pitcherSummary.careerPostseason;
    const careerSeasonData = pitcherSummary.careerSeason;
    const seasonsData = pitcherSummary.seasons;
    const postseasonsData = pitcherSummary.postseasons;

    Object.keys(seasonsData).forEach((season) => {
      const seasonStats = pitcherSummary.seasons[season];

      // Calculate non-tally based season stats
      seasonStats.inningsPitched = calculateInningsPitched(seasonStats); // Keep above stats dependent on IP
      seasonStats.basesOnBallsPerNine = calculateBasesOnBallsPerNine(
        seasonStats
      );
      seasonStats.earnedRunAverage = calculateEarnedRunAverage(seasonStats);
      seasonStats.hitsAllowedPerNine = calculateHitsAllowedPerNine(seasonStats);
      seasonStats.homeRunsPerNine = calculateHomeRunsPerNine(seasonStats);
      seasonStats.strikeoutsPerNine = calculateStrikeoutsPerNine(seasonStats);
      seasonStats.strikeoutRate = calculateStrikeoutRate(seasonStats);
      seasonStats.strikeoutToWalkRatio = calculateStrikeoutToWalkRatio(
        seasonStats
      );
      seasonStats.walksAndHitsPerInningPitched = calculateWalksAndHitsPerInningPitched(
        seasonStats
      );
      seasonStats.walkRate = calculateWalkRate(seasonStats);
      seasonStats.winningPercentage = calculateWinningPercentage(seasonStats);

      // Add current season tallies to careerSeasonData
      careerSeasonData.wins += seasonStats.wins;
      careerSeasonData.losses += seasonStats.losses;
      careerSeasonData.appearances += seasonStats.appearances;
      careerSeasonData.outsRecorded += seasonStats.outsRecorded;
      careerSeasonData.shutouts += seasonStats.shutouts;
      careerSeasonData.hitByPitches += seasonStats.hitByPitches;
      careerSeasonData.hitsAllowed += seasonStats.hitsAllowed;
      careerSeasonData.homeRuns += seasonStats.homeRuns;
      careerSeasonData.earnedRuns += seasonStats.earnedRuns;
      careerSeasonData.basesOnBalls += seasonStats.basesOnBalls;
      careerSeasonData.pitchCount += seasonStats.pitchCount;
      careerSeasonData.strikeouts += seasonStats.strikeouts;
      careerSeasonData.battersFaced += seasonStats.battersFaced;
      careerSeasonData.qualityStarts += seasonStats.qualityStarts;
      careerSeasonData.flyouts += seasonStats.flyouts;
      careerSeasonData.groundouts += seasonStats.groundouts;
    });

    Object.keys(postseasonsData).forEach((postseason) => {
      const postseasonStats = pitcherSummary.postseasons[postseason];

      // Calculate non-tally based postseason stats
      postseasonStats.inningsPitched = calculateInningsPitched(postseasonStats); // Keep above stats dependent on IP
      postseasonStats.basesOnBallsPerNine = calculateBasesOnBallsPerNine(
        postseasonStats
      );
      postseasonStats.earnedRunAverage = calculateEarnedRunAverage(
        postseasonStats
      );
      postseasonStats.hitsAllowedPerNine = calculateHitsAllowedPerNine(
        postseasonStats
      );
      postseasonStats.homeRunsPerNine = calculateHomeRunsPerNine(
        postseasonStats
      );
      postseasonStats.strikeoutsPerNine = calculateStrikeoutsPerNine(
        postseasonStats
      );
      postseasonStats.strikeoutRate = calculateStrikeoutRate(postseasonStats);
      postseasonStats.strikeoutToWalkRatio = calculateStrikeoutToWalkRatio(
        postseasonStats
      );
      postseasonStats.walksAndHitsPerInningPitched = calculateWalksAndHitsPerInningPitched(
        postseasonStats
      );
      postseasonStats.walkRate = calculateWalkRate(postseasonStats);
      postseasonStats.winningPercentage = calculateWinningPercentage(
        postseasonStats
      );

      // Add current season tallies to careerPostseasonData
      careerPostseasonData.wins += postseasonStats.wins;
      careerPostseasonData.losses += postseasonStats.losses;
      careerPostseasonData.appearances += postseasonStats.appearances;
      careerPostseasonData.outsRecorded += postseasonStats.outsRecorded;
      careerPostseasonData.shutouts += postseasonStats.shutouts;
      careerPostseasonData.hitByPitches += postseasonStats.hitByPitches;
      careerPostseasonData.hitsAllowed += postseasonStats.hitsAllowed;
      careerPostseasonData.homeRuns += postseasonStats.homeRuns;
      careerPostseasonData.earnedRuns += postseasonStats.earnedRuns;
      careerPostseasonData.pitchCount += postseasonStats.pitchCount;
      careerPostseasonData.basesOnBalls += postseasonStats.basesOnBalls;
      careerPostseasonData.strikeouts += postseasonStats.strikeouts;
      careerPostseasonData.battersFaced += postseasonStats.battersFaced;
      careerPostseasonData.qualityStarts += postseasonStats.qualityStarts;
      careerPostseasonData.flyouts += postseasonStats.flyouts;
      careerPostseasonData.groundouts += postseasonStats.groundouts;
    });

    // Calculate non-tally based career season stats
    careerSeasonData.inningsPitched = calculateInningsPitched(careerSeasonData); // Keep above stats dependent on IP
    careerSeasonData.basesOnBallsPerNine = calculateBasesOnBallsPerNine(
      careerSeasonData
    );
    careerSeasonData.earnedRunAverage = calculateEarnedRunAverage(
      careerSeasonData
    );
    careerSeasonData.hitsAllowedPerNine = calculateHitsAllowedPerNine(
      careerSeasonData
    );
    careerSeasonData.homeRunsPerNine = calculateHomeRunsPerNine(
      careerSeasonData
    );
    careerSeasonData.strikeoutsPerNine = calculateStrikeoutsPerNine(
      careerSeasonData
    );
    careerSeasonData.strikeoutRate = calculateStrikeoutRate(careerSeasonData);
    careerSeasonData.strikeoutToWalkRatio = calculateStrikeoutToWalkRatio(
      careerSeasonData
    );
    careerSeasonData.walksAndHitsPerInningPitched = calculateWalksAndHitsPerInningPitched(
      careerSeasonData
    );
    careerSeasonData.walkRate = calculateWalkRate(careerSeasonData);
    careerSeasonData.winningPercentage = calculateWinningPercentage(
      careerSeasonData
    );

    // Calculate non-tally based postcareer season stats
    careerPostseasonData.inningsPitched = calculateInningsPitched(
      careerPostseasonData
    ); // Keep above stats dependent on IP
    careerPostseasonData.basesOnBallsPerNine = calculateBasesOnBallsPerNine(
      careerPostseasonData
    );
    careerPostseasonData.earnedRunAverage = calculateEarnedRunAverage(
      careerPostseasonData
    );
    careerPostseasonData.hitsAllowedPerNine = calculateHitsAllowedPerNine(
      careerPostseasonData
    );
    careerPostseasonData.homeRunsPerNine = calculateHomeRunsPerNine(
      careerPostseasonData
    );
    careerPostseasonData.strikeoutsPerNine = calculateStrikeoutsPerNine(
      careerPostseasonData
    );
    careerPostseasonData.strikeoutRate = calculateStrikeoutRate(
      careerPostseasonData
    );
    careerPostseasonData.strikeoutToWalkRatio = calculateStrikeoutToWalkRatio(
      careerPostseasonData
    );
    careerPostseasonData.walksAndHitsPerInningPitched = calculateWalksAndHitsPerInningPitched(
      careerPostseasonData
    );
    careerPostseasonData.walkRate = calculateWalkRate(careerPostseasonData);
    careerPostseasonData.winningPercentage = calculateWinningPercentage(
      careerPostseasonData
    );
  });

  pitcherSummaries = {
    ...(existingPitcherSummaries ? existingPitcherSummaries : {}),
    ...pitcherSummaries,
  };

  if (Object.keys(pitcherSummaries).length === 0) {
    return;
  }

  // Output objects to JSON files
  await fs.promises.mkdir('./data/pitching', { recursive: true });
  const pitcherSummariesWriteStream = fs.createWriteStream(
    './data/pitching/pitchers.json'
  );
  pitcherSummariesWriteStream.write(
    `${JSON.stringify({ ...pitcherSummaries }, null, '\t')}\n`
  );
  pitcherSummariesWriteStream.end();

  Object.keys(pitcherSummaries).forEach(async (pitcher) => {
    // Output individual pitchers summaries
    const encodedPitcherName = encodeURI(
      pitcherSummaries[pitcher].name.toLowerCase().replace(/\s/g, '-')
    );
    await fs.promises.mkdir(`./data/pitching/${encodedPitcherName}`, {
      recursive: true,
    });
    const pitcherSummaryWriteStream = fs.createWriteStream(
      `./data/pitching/${encodedPitcherName}/summary.json`
    );
    pitcherSummaryWriteStream.write(
      `${JSON.stringify({ ...pitcherSummaries[pitcher] }, null, '\t')}\n`
    );
    pitcherSummaryWriteStream.end();
  });

  // Append pitcher to list of all players
  await fs.promises.mkdir(`./data/players`, { recursive: true });
  const playerListWriteStream = fs.createWriteStream(
    './data/players/pitchers.json'
  );
  playerListWriteStream.write(`${JSON.stringify(playerList, null, '\t')}\n`);
  playerListWriteStream.end();
});

function calculateBasesOnBallsPerNine(stats) {
  return stats.inningsPitched > 0
    ? (stats.basesOnBalls / stats.inningsPitched) * 9
    : 0;
}

function calculateEarnedRunAverage(stats) {
  return stats.inningsPitched > 0
    ? (9 * stats.earnedRuns) / stats.inningsPitched
    : 0;
}

function calculateHitsAllowedPerNine(stats) {
  return stats.inningsPitched > 0
    ? (stats.hitsAllowed / stats.inningsPitched) * 9
    : 0;
}

function calculateHomeRunsPerNine(stats) {
  return stats.inningsPitched > 0
    ? (stats.homeRuns / stats.inningsPitched) * 9
    : 0;
}

function calculateInningsPitched(stats) {
  const partialOuts = (stats.outsRecorded % 3) / 10;

  return Math.trunc(stats.outsRecorded / 3) + partialOuts;
}

function calculateStrikeoutToWalkRatio(stats) {
  return stats.basesOnBalls > 0 ? stats.strikeouts / stats.basesOnBalls : 0;
}

function calculateStrikeoutsPerNine(stats) {
  return stats.inningsPitched > 0
    ? (stats.strikeouts / stats.inningsPitched) * 9
    : 0;
}

function calculateStrikeoutRate(stats) {
  return stats.battersFaced > 0 ? stats.strikeouts / stats.battersFaced : 0;
}

function calculateWalksAndHitsPerInningPitched(stats) {
  return stats.inningsPitched > 0
    ? (stats.basesOnBalls + stats.hitsAllowed) / stats.inningsPitched
    : 0;
}

function calculateWalkRate(stats) {
  return stats.battersFaced > 0 ? stats.basesOnBalls / stats.battersFaced : 0;
}

function calculateWinningPercentage(stats) {
  return stats.wins > 0
    ? stats.wins / (stats.wins + stats.losses)
    : stats.losses !== 0
    ? 0
    : 1;
}

function createPitcherSummaryObject(initialValues) {
  const defaults = {
    careerPostseason: initialPitcherStatsObject(),
    careerSeason: initialPitcherStatsObject(),
    id: null,
    name: null,
    seasons: {},
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
  const currPitcherTeamId: string = relativeGameState.topOfInning
    ? relativeGameState.homeTeam
    : relativeGameState.awayTeam;
  const currPitcherTeamName: string = relativeGameState.topOfInning
    ? relativeGameState.homeTeamName
    : relativeGameState.awayTeamName;

  const defaults = {
    aliases: [],
    id: null,
    currentTeamId: currPitcherTeamId,
    currentTeamName: currPitcherTeamName,
    debutDay: relativeGameState.day,
    debutGameId: relativeGameState.id,
    debutSeason: relativeGameState.season,
    debutTeamId: currPitcherTeamId,
    debutTeamName: currPitcherTeamName,
    isIncinerated: false,
    incineratedGameDay: null,
    incineratedGameId: null,
    incineratedGameSeason: null,
    lastGameDay: relativeGameState.day,
    lastGameId: relativeGameState.id,
    lastGameSeason: relativeGameState.season,
    name: null,
    position: 'rotation',
    slug: null,
  };

  // Perform a shallow copy of initialValues over defaults
  return Object.assign({}, defaults, initialValues);
}

function initialPitcherStatsObject(initialValues = {}) {
  const defaults = {
    appearances: 0,
    battersFaced: 0,
    basesOnBalls: 0,
    basesOnBallsPerNine: 0,
    earnedRuns: 0,
    earnedRunAverage: 0,
    flyouts: 0,
    groundouts: 0,
    hitByPitches: 0,
    hitsAllowed: 0,
    hitsAllowedPerNine: 0,
    homeRuns: 0,
    homeRunsPerNine: 0,
    inningsPitched: 0,
    losses: 0,
    outsRecorded: 0,
    pitchCount: 0,
    qualityStarts: 0,
    shutouts: 0,
    strikeouts: 0,
    strikeoutToWalkRatio: 0,
    strikeoutsPerNine: 0,
    strikeoutRate: 0,
    team: null,
    teamName: null,
    walksAndHitsPerInningPitched: 0,
    walkRate: 0,
    winningPercentage: 0,
    wins: 0,
  };

  // Perform a shallow copy of initialValues over defaults
  return Object.assign({}, defaults, initialValues);
}

async function getPlayerFromDatablase(playerId) {
  const player = await fetchData(
    `https://api.blaseball-reference.com/v2/players/${playerId}`
  );

  return player;
}
