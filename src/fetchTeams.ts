import { fetchData } from "./utils";
import fs from "fs";

async function fetchTeamsFromBlaseballAPI() {
  const allTeams = await fetchData("https://blaseball.com/database/allTeams");

  await fs.promises.mkdir(`./data`, { recursive: true });

  fs.writeFile(
    "./data/teams.json",
    `${JSON.stringify(allTeams, null, "\t")}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
}

fetchTeamsFromBlaseballAPI();
