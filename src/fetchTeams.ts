import deburr from 'lodash.deburr';
import { fetchData } from './utils';
import fs from 'fs';

async function fetchTeamsFromBlaseballAPI() {
  const allTeams = await fetchData('https://blaseball.com/database/allTeams');

  for (const team of allTeams) {
    team.slug = team.fullName
      ? deburr(team.fullName).toLowerCase().replace(/\s/g, '-')
      : null;

    // Create team folder if it does not exist
    await fs.promises.mkdir(`./data/teams/${team.slug}`, { recursive: true });

    // Output team object to json
    fs.writeFile(
      `./data/teams/${team.slug}/details.json`,
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
    `${JSON.stringify(allTeams, null, '\t')}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
}

fetchTeamsFromBlaseballAPI();
