import cloneDeep from 'lodash.clonedeep';
import fetchGameResults from './fetchGameResults';
import fs from 'fs';
import merge from 'deepmerge';

async function generateSchedules() {
  let games: {
    [season: string]: {
      [day: string]: Array<any>;
    };
  } = {};
  let teams: Array<any> = [];
  let startingSeason;

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
      }
    }
  } catch (err) {
    console.log(err);
    startingSeason = 0;
  }

  const newGames = await fetchGameResults({
    startingSeason,
  });

  games = merge(games, newGames, {
    arrayMerge: (destinationArray, sourceArray, options) => sourceArray,
  });

  for (const season of Object.keys(games)) {
    await fs.promises.mkdir('./data/schedules/bySeason/', { recursive: true });

    fs.writeFile(
      `./data/schedules/bySeason/${season}.json`,
      `${JSON.stringify(games[season], null, '\t')}\n`,
      function (err) {
        if (err) {
          console.log(err);
        }
      }
    );
  }

  try {
    teams = await JSON.parse(fs.readFileSync('./data/teams.json', 'utf8'));
  } catch (err) {
    console.log(err);
  }

  for (const team of teams) {
    const teamGames: {
      [season: string]: {
        [day: string]: Array<any>;
      };
    } = cloneDeep(games);

    for (const season of Object.keys(teamGames)) {
      for (const day in teamGames[season]) {
        teamGames[season][day] = teamGames[season][day].filter((game) => {
          if (
            game.awayTeam === team.team_id ||
            game.homeTeam === team.team_id
          ) {
            return true;
          } else {
            return false;
          }
        });
      }
    }

    await fs.promises.mkdir(`./data/teams/${team.url_slug}`, {
      recursive: true,
    });

    fs.writeFile(
      `./data/teams/${team.url_slug}/schedule.json`,
      `${JSON.stringify(teamGames, null, '\t')}\n`,
      function (err) {
        if (err) {
          console.log(err);
        }
      }
    );
  }
}

generateSchedules();
