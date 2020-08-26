import fs from "fs";

async function combinePlayers() {
  const pitchers = fs.readFileSync("./data/players/pitchers.json", "utf8");
  const batters = fs.readFileSync("./data/players/batters.json", "utf8");

  const players = [...JSON.parse(pitchers), ...JSON.parse(batters)];

  fs.writeFile(
    "./data/players/players.json",
    `${JSON.stringify(players, null, "\t")}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }

      console.log("Done!");
    }
  );
}

combinePlayers();
