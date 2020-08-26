import fetch from "node-fetch";
import fs from "fs";

async function fetchTeamsFromBlaseballAPI() {
  const response: any = await fetch("https://blaseball.com/database/allTeams");
  const json: any = await response.json();

  await fs.promises.mkdir(`./data`, { recursive: true });

  fs.writeFile(
    "./data/teams.json",
    `${JSON.stringify(json, null, "\t")}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
}

fetchTeamsFromBlaseballAPI();
