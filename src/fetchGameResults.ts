import Bottleneck from 'bottleneck';
import { fetchData } from './utils';

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 250 });

type GameResults = { [seasonId: string]: { [day: number]: Array<unknown> } };

export default async function fetchGameResults({
  startingSeason,
}: {
  startingSeason: number;
}): Promise<GameResults> {
  const gameResults: GameResults = {};

  let season = startingSeason;
  let games = await fetchGamesFromChronicler(season);

  // Create fetch loop to iterate through all days in a season until reaching an empty array
  while (Array.isArray(games) && games.length !== 0) {
    console.log(`Fetched game results for season ${season}`);

    // Store game results of day
    if (!Object.hasOwnProperty.call(gameResults, season)) {
      gameResults[season] = {};
    }

    for (const game of games) {
      const day = game.data.day;

      // Place games into day buckets
      if (!Object.hasOwnProperty.call(gameResults[season], day)) {
        gameResults[season][day] = [];
      }

      gameResults[season][day].push(game.data);
    }

    season += 1;
    games = await fetchGamesFromChronicler(season);
  }

  return gameResults;
}

async function fetchGamesFromChronicler(season): Promise<Array<unknown>> {
  const url = new URL('https://api.sibr.dev/chronicler/v1/games');
  url.searchParams.set('season', season.toString());

  const games = await limiter.schedule(fetchData, url.toString());

  return games.data;
}
