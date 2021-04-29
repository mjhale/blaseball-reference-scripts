import { fetchData } from './utils';
import * as fs from 'fs';

async function fetchTeamsFromDatablase() {
  const teams = await fetchData('https://api.blaseball-reference.com/v2/teams');

  for (const team of teams) {
    // Create team folder if it does not exist
    await fs.promises.mkdir(`./data/teams/${team.url_slug}`, {
      recursive: true,
    });

    // Output team object to json
    fs.writeFile(
      `./data/teams/${team.url_slug}/details.json`,
      `${JSON.stringify(team, null, '\t')}\n`,
      function (err) {
        if (err) {
          console.log(err);
        }
      }
    );
  }

  await fs.promises.mkdir(`./data`, { recursive: true });

  fs.writeFile(
    './data/teams.json',
    `${JSON.stringify(teams, null, '\t')}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
}

fetchTeamsFromDatablase();
