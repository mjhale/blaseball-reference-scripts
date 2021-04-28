import Bottleneck from 'bottleneck';
import { fetchData } from './utils';
import fs from 'fs';
import merge from 'deepmerge';

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 250 });

function main() {
  fetchDivineFavor();
}

type DivineFavor = {
  [seasonNumber: string]: string[];
};

// Take Wiki shortnames and find respective team ID from teams.json
async function fetchDivineFavor() {
  let divineFavor: DivineFavor = {};

  try {
    divineFavor = await JSON.parse(
      fs.readFileSync('./data/divineFavor.json', 'utf8')
    );

    const simulationData: any = await limiter.schedule(
      fetchData,
      'https://www.blaseball.com/database/simulationData'
    );
    const currentSeason = simulationData.season;
    const currentPhase = simulationData.phase;
    const currentLeagueId = simulationData.league;

    const mostRecentSeasonFromLoggedDivineFavor = Object.keys(divineFavor)
      .map((season) => Number(season))
      .sort((a, b) => a - b)
      .pop();

    // Update divine favor to what's available from Blaseball API
    if (
      mostRecentSeasonFromLoggedDivineFavor != null &&
      mostRecentSeasonFromLoggedDivineFavor < currentSeason
    ) {
      console.log(`Fetching divine favor for season ${currentSeason}`);

      if (isRegularSeasonPhase(currentSeason, currentPhase) === true) {
        const leagueData: any = await limiter.schedule(
          fetchData,
          `https://blaseball.com/database/league?id=${currentLeagueId}`
        );

        const tiebreakerData: any = await limiter.schedule(
          fetchData,
          `https://blaseball.com/database/tiebreakers?id=${leagueData.tiebreakers}`
        );

        const currentSeasonTiebreakers: string[] = tiebreakerData[0].order;

        divineFavor[currentSeason] = currentSeasonTiebreakers;

        console.log(currentSeason);
      }
    }
  } catch (err) {
    console.log(err);
  }

  await fs.promises.mkdir(`./data`, { recursive: true });

  fs.writeFile(
    './data/divineFavor.json',
    `${JSON.stringify(divineFavor, null, '\t')}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
}

// The divine rankings seem to set with the first game of each season, so checking
// during the regular season may not be necessary.
function isRegularSeasonPhase(season, phase) {
  if (season < 12 && phase === 2) {
    return true;
  }

  if (season > 12 && phase >= 2 && phase <= 7) {
    return true;
  }

  return false;
}

main();
