import Bottleneck from 'bottleneck';
import { fetchData } from './utils';

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 250 });

type GameResults = { [seasonId: string]: { [day: number]: Array<unknown> } };
export default async function fetchGameResults({
  startingDay,
  startingSeason,
}: {
  startingDay: number;
  startingSeason: number;
}): Promise<GameResults> {
  let season = startingSeason;
  let day = startingDay;

  const gameResults: GameResults = {};

  const url = new URL('https://www.blaseball.com/database/games');
  url.searchParams.set('season', season.toString());
  url.searchParams.set('day', day.toString());
  let games = await limiter.schedule(fetchData, url.toString());
  // let hasActiveGame = false;

  // Create fetch loop to iterate through all days in a season until reaching an empty array
  while (Array.isArray(games) && games.length !== 0) {
    console.log(`Fetched game results for season ${season} day ${day}`);

    // Store game results of day
    if (!Object.hasOwnProperty.call(gameResults, season)) {
      gameResults[season] = {};
    }
    if (!Object.hasOwnProperty.call(gameResults[season], day)) {
      gameResults[season][day] = [];
    }
    gameResults[season][day] = games;

    day += 1;

    // Begin new fetch loop
    const url = new URL('https://www.blaseball.com/database/games');
    url.searchParams.set('season', season.toString());
    url.searchParams.set('day', day.toString());
    games = await limiter.schedule(fetchData, url.toString());

    // When at the end of a season, try to jump to next season
    if (Array.isArray(games) && games.length === 0) {
      season += 1;
      day = 0;

      // Begin new fetch loop
      const url = new URL('https://www.blaseball.com/database/games');
      url.searchParams.set('season', season.toString());
      url.searchParams.set('day', day.toString());
      games = await limiter.schedule(fetchData, url.toString());
    }
  }

  return gameResults;
}
