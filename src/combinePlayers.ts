import Bottleneck from 'bottleneck';
import chunk from 'lodash.chunk';
import { fetchData } from './utils';
import * as fs from 'fs';
import merge from 'deepmerge';

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1000 });

async function combinePlayers() {
  const pitchers = JSON.parse(
    fs.readFileSync('./data/players/pitchers.json', 'utf8')
  );
  const batters = JSON.parse(
    fs.readFileSync('./data/players/batters.json', 'utf8')
  );

  const playerIds: Set<string> = new Set();
  const players: Record<string, any> = {};

  for (const player of [...pitchers, ...batters]) {
    if (player.id === null) {
      continue;
    }

    playerIds.add(player.id);

    if (!Object.hasOwnProperty.call(players, player.id)) {
      players[player.id] = player;
    } else {
      let mostRecent;
      let leastRecent;

      if (
        players[player.id].lastGameSeason > player.lastGameSeason &&
        players[player.id].lastGameDay > player.lastGameDay
      ) {
        mostRecent = players[player.id];
        leastRecent = player;
      } else {
        leastRecent = players[player.id];
        mostRecent = player;
      }

      players[player.id] = merge(leastRecent, mostRecent, {
        customMerge: (key) => {
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
      });
    }
  }

  await Promise.allSettled(
    chunk(Array.from(playerIds), 100).map(async (ids) => {
      let fetchedPlayers: Array<any>;

      try {
        fetchedPlayers = await limiter.schedule(
          fetchData,
          `https://www.blaseball.com/database/players?ids=${ids
            .filter((id) => id !== null)
            .join(',')}`
        );
        console.log(
          `Fetched latest data for ${fetchedPlayers.length} players...`
        );
      } catch (err) {
        console.log(`Fetch error with IDs: ${Array.from(ids).join(', ')}...`);
        return Promise.reject(new Error(err.type));
      }

      for (const player of fetchedPlayers) {
        players[player.id] = {
          ...players[player.id],
          armor: player.armor,
          bat: player.bat,
          blood: player.blood,
          isIncinerated:
            players[player.id].isIncinerated !== player.deceased
              ? player.deceased
              : players[player.id].isIncinerated,
          ritual: player.ritual,
        };
      }

      return Promise.resolve();
    })
  );

  for (const player in players) {
    await fs.promises.mkdir(`./data/players/${players[player].slug}`, {
      recursive: true,
    });

    fs.writeFile(
      `./data/players/${players[player].slug}/details.json`,
      `${JSON.stringify({ ...players[player] }, null, '\t')}\n`,
      function (err) {
        if (err) {
          console.log(err);
        }
      }
    );
  }

  fs.writeFile(
    './data/players/players.json',
    `${JSON.stringify(Object.values(players), null, '\t')}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
}

combinePlayers();
