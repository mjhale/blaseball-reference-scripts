import Bottleneck from 'bottleneck';
import { fetchData } from './utils';
import fetchGameResults from './fetchGameResults';
import fs from 'fs';
import merge from 'deepmerge';

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 250 });

type DivisionRecord = {
  league: string;
  division: string;
  standingsType: 'regularSeason' | 'postseason';
  lastUpdated: string;
  teamRecords: Array<TeamRecord>;
};

type TeamRecord = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  season: number;
  streak: {
    streakType: 'wins' | 'losses';
    streakNumber: number;
    streakCode: string;
  };
  divisionRank: number;
  leagueRank: number;
  sportRank: number;
  gamesPlayed: number;
  gamesBack: string;
  leagueGamesBack: string;
  sportGamesBack: string;
  divisionGamesBack: string;
  leagueRecord: {
    wins: number;
    losses: number;
    pct: number;
  };
  divisionRecord: {
    wins: number;
    losses: number;
    pct: number;
  };
  splitRecords: {
    [recordType: string]: {
      wins: number;
      losses: number;
      pct: number;
      type: string;
    };
  };
  weatherRecords: {
    [weatherType: number]: {
      wins: number;
      losses: number;
      pct: number;
      type: string;
    };
  };
  leagueRecords: {
    [leagueId: string]: {
      wins: number;
      losses: number;
      pct: number;
      leagueId: string;
      leagueName: string;
    };
  };
  divisionRecords: {
    [divisionId: string]: {
      wins: number;
      losses: number;
      pct: number;
      divisionId: string;
      divisionName: string;
    };
  };
  runsAllowed: number;
  runsScored: number;
  eliminationNumber: string;
  divisionChamp: boolean;
  divisionLeader: boolean;
  leagueLeader: boolean;
  sportLeader: boolean;
  clinched: boolean;
  magicNumber: string;
  wins: number;
  losses: number;
  runDifferential: number;
  winningPercentage: number;
};

type Subleague = {
  divisions: Array<string>;
  id: string;
  name: string;
  teams: Array<string>;
};

type Division = {
  id: string;
  name: string;
  teams: Array<string>;
  subleague: string;
};

type SubleaguesAndDivisionsBySeason = {
  seasons: {
    [season: string]: {
      divisions: Array<{
        id: string;
        name: string;
        subleague: string;
        teams: Array<string>;
      }>;
      subleagues: Array<{
        divisions: Array<string>;
        id: string;
        name: string;
        teams: Array<string>;
      }>;
    };
  };
};

function main() {
  generateStandings();
}

async function generateStandings() {
  const subleaguesAndDivisionsBySeason: SubleaguesAndDivisionsBySeason = await fetchSubleaguesAndDivisions();

  let teamRecords: Array<TeamRecord> = [];
  const divisionRecordsBySeason: {
    [seasonId: number]: { [divisonId: string]: Array<TeamRecord> };
  } = {};
  let divisionRecords: { [divisonId: string]: Array<TeamRecord> } = {};
  let leagueRecords: { [leagueId: string]: Array<TeamRecord> } = {};

  const GAMES_IN_SEASON = 99;

  let games = {};
  let startingSeason;
  let startingDay;

  try {
    games = await JSON.parse(
      fs.readFileSync('./data/gameResults.json', 'utf8')
    );

    startingSeason = Object.keys(games)
      .map((season) => Number(season))
      .sort((a, b) => a - b)
      .pop();

    const sortedStartingSeasonDays = Object.keys(games[startingSeason])
      .map((day) => Number(day))
      .sort((a, b) => a - b);

    for (const day of sortedStartingSeasonDays) {
      let hasActiveGames = false;

      for (const game of games[startingSeason][day]) {
        if (game.gameComplete === false) {
          hasActiveGames = true;
        }
      }

      if (hasActiveGames) {
        break;
      } else {
        startingDay = day;
      }
    }
  } catch (err) {
    console.log(err);
    startingSeason = 0;
    startingDay = 0;
  }

  const newGames = await fetchGameResults({
    startingDay: startingDay,
    startingSeason,
  });

  games = merge(games, newGames, {
    arrayMerge: (destinationArray, sourceArray, options) => sourceArray,
  });

  for (const season in games) {
    for (const day in games[season]) {
      for (const game of games[season][day]) {
        // Filter out games in progress
        if (game.gameComplete === false) break;

        // Filter out postseason games
        if (game.isPostseason === true) break;

        const winner: 'away' | 'home' =
          game.homeScore > game.awayScore ? 'home' : 'away';
        const loser: 'away' | 'home' =
          game.homeScore > game.awayScore ? 'away' : 'home';

        const winnerSubleague:
          | Subleague
          | undefined = subleaguesAndDivisionsBySeason.seasons[
          season
        ].subleagues.find((subleague) => {
          return subleague.teams.find((team) => team === game[`${winner}Team`]);
        });

        const loserSubleague:
          | Subleague
          | undefined = subleaguesAndDivisionsBySeason.seasons[
          season
        ].subleagues.find((subleague) => {
          return subleague.teams.find((team) => team === game[`${loser}Team`]);
        });

        const currSeasonDivisions: Array<string> = [
          ...(winnerSubleague?.divisions ?? []),
          ...(loserSubleague?.divisions ?? []),
        ];

        const winnerDivision:
          | Division
          | undefined = subleaguesAndDivisionsBySeason.seasons[
          season
        ].divisions.find((division) =>
          division.teams.find((team) => team === game[`${winner}Team`])
        );

        const loserDivision:
          | Division
          | undefined = subleaguesAndDivisionsBySeason.seasons[
          season
        ].divisions.find((division) =>
          division.teams.find((team) => team === game[`${loser}Team`])
        );

        // Attempt to locate existing team records
        let winningTeamRecords = teamRecords.find(
          (team) => team.teamId === game[`${winner}Team`]
        );

        let losingTeamRecords = teamRecords.find(
          (team) => team.teamId === game[`${loser}Team`]
        );

        // Create initial team records object if missing
        if (!winningTeamRecords) {
          winningTeamRecords = createTeamRecord({
            teamId: game[`${winner}Team`],
            teamName: game[`${winner}TeamName`],
          });
        }

        if (!losingTeamRecords) {
          losingTeamRecords = createTeamRecord({
            teamId: game[`${loser}Team`],
            teamName: game[`${loser}TeamName`],
          });
        }

        // Update streak
        if (winningTeamRecords.streak.streakType === 'wins') {
          winningTeamRecords.streak.streakNumber += 1;
          winningTeamRecords.streak.streakCode = `W${winningTeamRecords.streak.streakNumber}`;
        } else {
          winningTeamRecords.streak.streakType = 'wins';
          winningTeamRecords.streak.streakNumber = 1;
          winningTeamRecords.streak.streakCode = 'W1';
        }

        if (losingTeamRecords.streak.streakType === 'losses') {
          losingTeamRecords.streak.streakNumber += 1;
          losingTeamRecords.streak.streakCode = `L${losingTeamRecords.streak.streakNumber}`;
        } else {
          losingTeamRecords.streak.streakType = 'losses';
          losingTeamRecords.streak.streakNumber = 1;
          losingTeamRecords.streak.streakCode = 'L1';
        }

        // Set season
        if (!winningTeamRecords.season) {
          winningTeamRecords.season = game.season;
        }
        if (!losingTeamRecords.season) {
          losingTeamRecords.season = game.season;
        }

        winningTeamRecords.gamesPlayed += 1;
        losingTeamRecords.gamesPlayed += 1;

        winningTeamRecords.wins += countTeamWins(winner, winner, game);
        losingTeamRecords.wins += countTeamWins(loser, winner, game);
        losingTeamRecords.losses += 1;

        winningTeamRecords.winningPercentage =
          winningTeamRecords.wins /
          (winningTeamRecords.wins + winningTeamRecords.losses);
        losingTeamRecords.winningPercentage =
          losingTeamRecords.wins /
          (losingTeamRecords.wins + losingTeamRecords.losses);

        winningTeamRecords.runsAllowed += countTeamRuns(loser, game);
        losingTeamRecords.runsAllowed += countTeamRuns(winner, game);

        winningTeamRecords.runsScored += countTeamRuns(winner, game);
        losingTeamRecords.runsScored += countTeamRuns(loser, game);

        winningTeamRecords.runDifferential +=
          countTeamRuns(winner, game) - countTeamRuns(loser, game);
        losingTeamRecords.runDifferential -=
          countTeamRuns(winner, game) - countTeamRuns(loser, game);

        winningTeamRecords.runDifferential =
          Math.round(winningTeamRecords.runDifferential * 10) / 10;
        losingTeamRecords.runDifferential =
          Math.round(losingTeamRecords.runDifferential * 10) / 10;

        // For intra-league games, increment/decrement league record
        if (winnerSubleague === loserSubleague) {
          winningTeamRecords.leagueRecord.wins += 1;
          losingTeamRecords.leagueRecord.losses += 1;
        }

        // Increment home and away split records
        winningTeamRecords.splitRecords[winner].wins += 1;
        winningTeamRecords.splitRecords[winner].pct = calculateSplitWinningPct(
          winningTeamRecords.splitRecords[winner]
        );

        losingTeamRecords.splitRecords[loser].losses += 1;
        losingTeamRecords.splitRecords[loser].pct = calculateSplitWinningPct(
          losingTeamRecords.splitRecords[loser]
        );

        // Increment extra innings split records
        if (game.inning > 8) {
          winningTeamRecords.splitRecords.extraInnings.wins += 1;
          losingTeamRecords.splitRecords.extraInnings.losses += 1;

          winningTeamRecords.splitRecords.extraInnings.pct = calculateSplitWinningPct(
            winningTeamRecords.splitRecords.extraInnings
          );
          losingTeamRecords.splitRecords.extraInnings.pct = calculateSplitWinningPct(
            losingTeamRecords.splitRecords.extraInnings
          );
        }

        // Increment record against winning team split record
        if (losingTeamRecords.winningPercentage > 0.5) {
          winningTeamRecords.splitRecords.winners.wins += 1;
          winningTeamRecords.splitRecords.winners.pct = calculateSplitWinningPct(
            winningTeamRecords.splitRecords.winners
          );
        }

        if (winningTeamRecords.winningPercentage > 0.5) {
          losingTeamRecords.splitRecords.winners.losses += 1;
          losingTeamRecords.splitRecords.winners.pct = calculateSplitWinningPct(
            losingTeamRecords.splitRecords.winners
          );
        }

        // Increment split record in one-run games
        if (Math.abs(game.homeScore - game.awayScore) === 1) {
          winningTeamRecords.splitRecords.oneRun.wins += 1;
          winningTeamRecords.splitRecords.oneRun.pct = calculateSplitWinningPct(
            winningTeamRecords.splitRecords.oneRun
          );

          losingTeamRecords.splitRecords.oneRun.losses += 1;
          losingTeamRecords.splitRecords.oneRun.pct = calculateSplitWinningPct(
            losingTeamRecords.splitRecords.oneRun
          );
        }

        // Increment split record in shame games
        if (game.shame === true) {
          winningTeamRecords.splitRecords.shame.wins += 1;
          winningTeamRecords.splitRecords.shame.pct = calculateSplitWinningPct(
            winningTeamRecords.splitRecords.shame
          );

          losingTeamRecords.splitRecords.shame.losses += 1;
          losingTeamRecords.splitRecords.shame.pct = calculateSplitWinningPct(
            losingTeamRecords.splitRecords.shame
          );
        }

        // Increment division records
        if (winnerDivision?.id && loserDivision?.id) {
          if (
            !Object.hasOwnProperty.call(
              winningTeamRecords.divisionRecords,
              loserDivision.id
            )
          ) {
            winningTeamRecords.divisionRecords[
              loserDivision.id
            ] = createSplitRecordObject({
              divisionId: loserDivision?.id,
              divisionName: loserDivision?.name,
            });
          }

          if (
            !Object.hasOwnProperty.call(
              losingTeamRecords.divisionRecords,
              winnerDivision.id
            )
          ) {
            losingTeamRecords.divisionRecords[
              winnerDivision.id
            ] = createSplitRecordObject({
              divisionId: winnerDivision?.id,
              divisionName: winnerDivision?.name,
            });
          }

          winningTeamRecords.divisionRecords[loserDivision.id].wins += 1;
          winningTeamRecords.divisionRecords[
            loserDivision.id
          ].pct = calculateSplitWinningPct(
            winningTeamRecords.divisionRecords[loserDivision.id]
          );
          losingTeamRecords.divisionRecords[winnerDivision.id].losses += 1;
          losingTeamRecords.divisionRecords[
            winnerDivision.id
          ].pct = calculateSplitWinningPct(
            losingTeamRecords.divisionRecords[winnerDivision.id]
          );
        }

        // Increment subleague records
        if (winnerSubleague && loserSubleague) {
          if (
            !Object.hasOwnProperty.call(
              winningTeamRecords.leagueRecords,
              loserSubleague.id
            )
          ) {
            winningTeamRecords.leagueRecords[
              loserSubleague.id
            ] = createSplitRecordObject({
              leagueId: loserSubleague?.id,
              leagueName: loserSubleague?.name,
            });
          }

          if (
            !Object.hasOwnProperty.call(
              losingTeamRecords.leagueRecords,
              winnerSubleague.id
            )
          ) {
            losingTeamRecords.leagueRecords[
              winnerSubleague.id
            ] = createSplitRecordObject({
              divisionId: winnerSubleague?.id,
              divisionName: winnerSubleague?.name,
            });
          }

          winningTeamRecords.leagueRecords[loserSubleague.id].wins += 1;
          winningTeamRecords.leagueRecords[
            loserSubleague.id
          ].pct = calculateSplitWinningPct(
            winningTeamRecords.leagueRecords[loserSubleague.id]
          );
          losingTeamRecords.leagueRecords[winnerSubleague.id].losses += 1;
          losingTeamRecords.leagueRecords[
            winnerSubleague.id
          ].pct = calculateSplitWinningPct(
            losingTeamRecords.leagueRecords[winnerSubleague.id]
          );
        }

        // Increment weather split records
        if (game.weather !== null) {
          if (
            !Object.hasOwnProperty.call(
              winningTeamRecords.weatherRecords,
              game.weather
            )
          ) {
            winningTeamRecords.weatherRecords[
              game.weather
            ] = createSplitRecordObject({
              type: getWeather()[game.weather].name || '',
            });
          }

          if (
            !Object.hasOwnProperty.call(
              losingTeamRecords.weatherRecords,
              game.weather
            )
          ) {
            losingTeamRecords.weatherRecords[
              game.weather
            ] = createSplitRecordObject({
              type: getWeather()[game.weather].name || '',
            });
          }

          winningTeamRecords.weatherRecords[game.weather].wins += 1;
          winningTeamRecords.weatherRecords[
            game.weather
          ].pct = calculateSplitWinningPct(
            winningTeamRecords.weatherRecords[game.weather]
          );

          losingTeamRecords.weatherRecords[game.weather].losses += 1;
          losingTeamRecords.weatherRecords[
            game.weather
          ].pct = calculateSplitWinningPct(
            losingTeamRecords.weatherRecords[game.weather]
          );
        }

        // Add teams to team records set
        if (
          !teamRecords.find(
            (record) => record.teamId === winningTeamRecords?.teamId
          )
        ) {
          teamRecords.push(winningTeamRecords);
        }

        if (
          !teamRecords.find(
            (record) => record.teamId === losingTeamRecords?.teamId
          )
        ) {
          teamRecords.push(losingTeamRecords);
        }

        // Add teams to division records set
        if (winnerDivision) {
          if (!Object.hasOwnProperty.call(divisionRecords, winnerDivision.id)) {
            divisionRecords[winnerDivision.id] = [winningTeamRecords];
          } else {
            if (
              !divisionRecords[winnerDivision.id].find(
                (team) => team.teamId === winningTeamRecords?.teamId
              )
            ) {
              divisionRecords[winnerDivision.id].push(winningTeamRecords);
            }
          }
        }

        if (loserDivision) {
          if (!Object.hasOwnProperty.call(divisionRecords, loserDivision.id)) {
            divisionRecords[loserDivision.id] = [losingTeamRecords];
          } else {
            if (
              !divisionRecords[loserDivision.id].find(
                (team) => team.teamId === losingTeamRecords?.teamId
              )
            ) {
              divisionRecords[loserDivision.id].push(losingTeamRecords);
            }
          }
        }

        // Add teams to subleague set
        if (winnerSubleague) {
          if (!Object.hasOwnProperty.call(leagueRecords, winnerSubleague.id)) {
            leagueRecords[winnerSubleague.id] = [winningTeamRecords];
          } else {
            if (
              !leagueRecords[winnerSubleague.id].find(
                (team) => team.teamId === winningTeamRecords?.teamId
              )
            ) {
              leagueRecords[winnerSubleague.id].push(winningTeamRecords);
            }
          }
        }

        if (loserSubleague) {
          if (!Object.hasOwnProperty.call(leagueRecords, loserSubleague.id)) {
            leagueRecords[loserSubleague.id] = [losingTeamRecords];
          } else {
            if (
              !leagueRecords[loserSubleague.id].find(
                (team) => team.teamId === losingTeamRecords?.teamId
              )
            ) {
              leagueRecords[loserSubleague.id].push(losingTeamRecords);
            }
          }
        }
      }
    }

    if (teamRecords) {
      const sortedSport = teamRecords.sort((a, b) =>
        a.wins < b.wins ? 1 : b.wins < a.wins ? -1 : 0
      );

      sortedSport[0].sportLeader = true;

      const leadingTeamWinDifferential =
        sortedSport[0].wins - sortedSport[0].losses;

      sortedSport.forEach((teamRecord, index) => {
        teamRecord.sportRank = index + 1;
        teamRecord.sportGamesBack =
          index === 0
            ? '-'
            : String(
                (leadingTeamWinDifferential -
                  (teamRecord.wins - teamRecord.losses)) /
                  2
              );
      });
    }

    for (const division in divisionRecords) {
      const sortedDivision = divisionRecords[division].sort((a, b) =>
        a.wins < b.wins ? 1 : b.wins < a.wins ? -1 : 0
      );

      sortedDivision[0].divisionLeader = true;

      const leadingTeamWinDifferential =
        sortedDivision[0].wins - sortedDivision[0].losses;

      sortedDivision.forEach((teamRecord, index) => {
        teamRecord.divisionRank = index + 1;
        teamRecord.divisionGamesBack =
          index === 0
            ? '-'
            : String(
                (leadingTeamWinDifferential -
                  (teamRecord.wins - teamRecord.losses)) /
                  2
              );
      });
    }

    for (const league in leagueRecords) {
      const sortedLeague = leagueRecords[league].sort((a, b) =>
        a.wins < b.wins ? 1 : b.wins < a.wins ? -1 : 0
      );

      sortedLeague[0].leagueLeader = true;

      for (let i = 0; i < 4; i++) {
        const magicNumber =
          GAMES_IN_SEASON + 1 - sortedLeague[i].wins - sortedLeague[4].losses;

        sortedLeague[i].magicNumber =
          magicNumber <= 0 ? 'X' : String(magicNumber);
        sortedLeague[i].clinched = magicNumber <= 0 ? true : false;
        sortedLeague[i].eliminationNumber = '-';
      }

      for (let i = 4; i < sortedLeague.length; i++) {
        const tragicNumber =
          GAMES_IN_SEASON + 1 - sortedLeague[3].wins - sortedLeague[i].losses;

        sortedLeague[i].magicNumber = '-';
        sortedLeague[i].eliminationNumber =
          tragicNumber <= 0 ? 'E' : String(tragicNumber);
      }

      const leadingTeamWinDifferential =
        sortedLeague[0].wins - sortedLeague[0].losses;

      sortedLeague.forEach((teamRecord, index) => {
        teamRecord.leagueRank = index + 1;
        teamRecord.leagueGamesBack =
          index === 0
            ? '-'
            : String(
                (leadingTeamWinDifferential -
                  (teamRecord.wins - teamRecord.losses)) /
                  2
              );
        teamRecord.gamesBack = teamRecord.leagueGamesBack;
      });
    }

    divisionRecordsBySeason[season] = divisionRecords;

    teamRecords = [];
    divisionRecords = {};
    leagueRecords = {};
  }

  await fs.promises.mkdir(`./data/standings`, { recursive: true });

  fs.writeFile(
    `./data/standings/standings.json`,
    `${JSON.stringify(divisionRecordsBySeason, null, '\t')}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );

  fs.writeFile(
    './data/gameResults.json',
    `${JSON.stringify(games, null, '\t')}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
}
function calculateSplitWinningPct(record: {
  wins: number;
  losses: number;
}): number {
  return record.wins / (record.wins + record.losses);
}

function countTeamRuns(team: 'home' | 'away', game: any): number {
  let runCount = game[`${team}Score`];

  for (const outcome of game.outcomes) {
    if (
      outcome.includes('Sun 2') &&
      outcome.includes(game[`${team}TeamNickname`])
    ) {
      runCount += 10;
    } else if (
      outcome.includes('Black Hole') &&
      !outcome.includes(game[`${team}TeamNickname`])
    ) {
      runCount += 10;
    }
  }

  return runCount;
}

function countTeamWins(
  team: 'home' | 'away',
  winner: 'home' | 'away',
  game: any
): number {
  let winCount = 0;

  if (team === winner) {
    winCount += 1;
  }

  for (const outcome of game.outcomes) {
    if (
      outcome.includes('Sun 2') &&
      outcome.includes(game[`${team}TeamNickname`])
    ) {
      winCount += 1;
    } else if (
      outcome.includes('Black Hole') &&
      outcome.includes(game[`${team}TeamNickname`])
    ) {
      winCount -= 1;
    }
  }

  return winCount;
}

function createSplitRecordObject(initialValues: any) {
  const defaults = {
    wins: 0,
    losses: 0,
    pct: 0,
    type: '',
  };

  // Perform a shallow copy of initialValues over defaults
  return Object.assign({}, defaults, initialValues);
}

function createTeamRecord(initialValues: any): TeamRecord {
  const defaults = {
    teamId: '',
    teamName: '',
    teamSlug: '',
    season: null,
    streak: {
      streakType: '',
      streakNumber: 0,
      streakCode: '',
    },
    divisionRank: 0,
    leagueRank: 0,
    sportRank: 0,
    gamesPlayed: 0,
    gamesBack: '',
    leagueGamesBack: '',
    sportGamesBack: '',
    divisionGamesBack: '',
    leagueRecord: {
      wins: 0,
      losses: 0,
      pct: 0,
    },
    splitRecords: {
      home: {
        wins: 0,
        losses: 0,
        pct: 0,
        type: 'home',
      },
      away: {
        wins: 0,
        losses: 0,
        pct: 0,
        type: 'away',
      },
      extraInnings: {
        wins: 0,
        losses: 0,
        pct: 0,
        type: 'extraInnings',
      },
      winners: {
        wins: 0,
        losses: 0,
        pct: 0,
        type: 'winners',
      },
      oneRun: {
        wins: 0,
        losses: 0,
        pct: 0,
        type: 'oneRun',
      },
      shame: {
        wins: 0,
        losses: 0,
        pct: 0,
        type: 'shame',
      },
    },
    weatherRecords: {},
    leagueRecords: {},
    divisionRecords: {},
    runsAllowed: 0,
    runsScored: 0,
    divisionChamp: false,
    divisionLeader: false,
    leagueLeader: false,
    sportLeader: false,
    clinched: false,
    eliminationNumber: '',
    magicNumber: '',
    wins: 0,
    losses: 0,
    runDifferential: 0,
    winningPercentage: 0,
  };

  // Perform a shallow copy of initialValues over defaults
  return Object.assign({}, defaults, initialValues);
}

async function fetchSubleaguesAndDivisions(): Promise<
  SubleaguesAndDivisionsBySeason
> {
  let hasCachedResponse;
  let mostRecentCachedSeason;
  let response;

  const simulationData: any = await limiter.schedule(
    fetchData,
    'https://www.blaseball.com/database/simulationData'
  );
  const currentSeason = simulationData.season;

  try {
    const cachedResponse = JSON.parse(
      fs.readFileSync('./data/leaguesAndDivisions.json', 'utf8')
    );

    const dataJson: {
      seasons: {
        [season: string]: {
          subleagues: Array<Subleague>;
          divisions: Array<Division>;
        };
      };
      lastUpdatedAt: number;
    } = cachedResponse;

    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (Date.now() - dataJson.lastUpdatedAt > ONE_DAY) {
      console.log('Old cache object... refetching.');
      hasCachedResponse = false;
    }

    mostRecentCachedSeason = Object.keys(dataJson.seasons)
      .map((season) => Number(season))
      .sort((a, b) => a - b)
      .pop();

    hasCachedResponse = true;
    response = {
      seasons: {
        ...dataJson.seasons,
      },
    };
  } catch {
    hasCachedResponse = false;
  }

  if (
    hasCachedResponse &&
    response &&
    mostRecentCachedSeason === currentSeason
  ) {
    return response;
  }

  const subleagues: { [subleagueId: string]: Subleague } =
    response.seasons?.[currentSeason]?.subleagues ?? {};
  const divisions: { [divisionId: string]: Division } =
    response.seasons?.[currentSeason]?.divisions ?? {};

  const ILB_ID = 'd8545021-e9fc-48a3-af74-48685950a183';
  const league: any = await limiter.schedule(
    fetchData,
    `https://blaseball.com/database/league?id=${ILB_ID}`
  );

  for (const subleagueId of league.subleagues) {
    const subleague: any = await limiter.schedule(
      fetchData,
      `https://blaseball.com/database/subleague?id=${subleagueId}`
    );

    subleagues[subleague.id] = {
      divisions: subleague.divisions,
      id: subleague.id,
      name: subleague.name,
      teams: [],
    };

    for (const divisionId of subleague.divisions) {
      const division: any = await limiter.schedule(
        fetchData,
        `https://blaseball.com/database/division?id=${divisionId}`
      );

      subleagues[subleague.id].teams = [
        ...subleagues[subleague.id].teams,
        ...division.teams,
      ];

      divisions[divisionId] = {
        id: division.id,
        name: division.name,
        subleague: subleague.id,
        teams: division.teams,
      };
    }
  }

  response = {
    seasons: {
      ...response.seasons,
      [currentSeason]: {
        divisions: Object.values(divisions),
        subleagues: Object.values(subleagues),
      },
    },
  };

  fs.writeFile(
    './data/leaguesAndDivisions.json',
    `${JSON.stringify(
      { ...response, lastUpdatedAt: Date.now() },
      null,
      '\t'
    )}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );

  return response;
}

function getWeather() {
  return [
    {
      name: 'Void',
    },
    {
      // Season 11 Change: Sunny -> Sun 2
      name: 'Sun 2',
    },
    {
      name: 'Overcast',
    },
    {
      name: 'Rainy',
    },
    {
      name: 'Sandstorm',
    },
    {
      name: 'Snowy',
    },
    {
      name: 'Acidic',
    },
    {
      name: 'Solar Eclipse',
    },
    {
      name: 'Glitter',
    },
    {
      name: 'Bloodwind',
    },
    {
      name: 'Peanuts',
    },
    {
      name: 'Birds',
    },
    {
      name: 'Feedback',
    },
    {
      name: 'Reverb',
    },
    {
      name: 'Black Hole',
    },
    {
      name: 'Coffee',
    },
    {
      name: 'Coffee 2',
    },
    {
      name: 'Coffee 3s',
    },
    {
      name: 'Flooding',
    },
    {
      name: '???',
    },
    {
      name: '???',
    },
    {
      name: '???',
    },
    {
      name: '???',
    },
  ];
}

main();
