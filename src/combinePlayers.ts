import Bottleneck from "bottleneck";
import chunk from "lodash.chunk";
import fetch from "node-fetch";
import fs from "fs";

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 250 });

async function combinePlayers() {
  const pitchers = JSON.parse(
    fs.readFileSync("./data/players/pitchers.json", "utf8")
  );
  const batters = JSON.parse(
    fs.readFileSync("./data/players/batters.json", "utf8")
  );

  const playerIds: Set<string> = new Set();
  const players: Record<string, any> = {};

  for (const player of [...pitchers, ...batters]) {
    playerIds.add(player.id);

    if (!Object.hasOwnProperty.call(players, player.id)) {
      players[player.id] = {
        ...player,
      };
    }
  }

  await Promise.all(
    chunk([...playerIds], 100).map(async (ids) => {
      const url = new URL("https://www.blaseball.com/database/players");
      url.searchParams.set("ids", ids.join(","));

      await limiter.schedule(async () => {
        const response = await fetch(url);
        const fetchedPlayers = await response.json();

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
      });
    })
  );

  for (const player in players) {
    await fs.promises.mkdir(`./data/players/${players[player].slug}`, {
      recursive: true,
    });

    fs.writeFile(
      `./data/players/${players[player].slug}/details.json`,
      `${JSON.stringify({ ...players[player] }, null, "\t")}\n`,
      function (err) {
        if (err) {
          console.log(err);
        }
      }
    );
  }

  fs.writeFile(
    "./data/players/players.json",
    `${JSON.stringify(Object.values(players), null, "\t")}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
}

combinePlayers();
