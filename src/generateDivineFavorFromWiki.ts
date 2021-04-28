import fs from 'fs';

// Regex for grabbing shortnames from Wiki source
// \| \{\{TeamEmojiSelector\|(.*)\}\}
// '$1',

function main() {
  generateDivineFavorFromWikiShortnames();
}

// Take Wiki shortnames and find respective team ID from teams.json
async function generateDivineFavorFromWikiShortnames() {
  let teams: any = [];
  let wikiFavorBySeason: any = {};
  const divineFavorBySeason: any = {};

  try {
    teams = await JSON.parse(fs.readFileSync('./data/teams.json', 'utf8'));
    wikiFavorBySeason = await JSON.parse(
      fs.readFileSync('./data/wikiFavor.json', 'utf8')
    );

    for (const season in wikiFavorBySeason) {
      const favorRanking: any = [];

      for (const teamNickname of wikiFavorBySeason[season]) {
        const team = teams.find(
          (team) => team.nickname.toLowerCase() === teamNickname.toLowerCase()
        );

        favorRanking.push(team != null ? team.team_id : teamNickname);
      }

      divineFavorBySeason[season] = favorRanking;
    }

    fs.writeFile(
      `./data/divineFavor.json`,
      `${JSON.stringify(divineFavorBySeason, null, '\t')}\n`,
      function (err) {
        if (err) {
          console.log(err);
        }
      }
    );
  } catch (err) {
    console.log(err);
  }
}

main();
