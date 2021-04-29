import Bottleneck from 'bottleneck';
import { fetchData } from './utils';
import * as fs from 'fs';

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 250 });

type DivineFavorBySeason = {
  [seasonNumber: string]: string[];
};

// Take Wiki shortnames and find respective team ID from teams.json
async function fetchAndUpdateDivineFavor() {
  let divineFavor: DivineFavorBySeason = {};

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

fetchAndUpdateDivineFavor();
