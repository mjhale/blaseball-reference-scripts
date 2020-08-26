import deburr from "lodash.deburr";
import fs from "fs";

// Type definitions
interface Player {
  id: string;
  name: string;
  postseasons: { [key: string]: PlayerStats };
  seasons: { [key: string]: PlayerStats };
  slug: string;
}

interface PlayerStats {
  id: string;
  name: string;
  slug: string;
  team: string;
  teamName: string;
}

interface TeamStats {
  battingStats: {
    postseasons: { string?: Array<Player> };
    seasons: { string?: Array<Player> };
  };
  id: string;
  pitchingStats: {
    postseasons: { string?: Array<Player> };
    seasons: { string?: Array<Player> };
  };
  slug: string;
}

(async () => {
  // Load pre-generated teams and league-wide pitcher, and batter stats
  const batters = JSON.parse(
    fs.readFileSync("./data/batting/batters.json", "utf8")
  );
  const pitchers = JSON.parse(
    fs.readFileSync("./data/pitching/pitchers.json", "utf8")
  );
  const teams = JSON.parse(fs.readFileSync("./data/teams.json", "utf8"));

  const allTeamStats: Array<TeamStats> = [];

  // Iterate through list of teams
  for (const team of teams) {
    // Generate a deburred slug for potential fs issues
    const teamSlug: string = deburr(team.fullName)
      .toLowerCase()
      .replace(/\s/g, "-");

    const { id: teamId, ...teamSpread } = team;

    // Initialize object that will store team stats
    const teamStats: TeamStats = {
      ...teamSpread,
      battingStats: {
        seasons: {},
        postseasons: {},
      },
      id: teamId,
      pitchingStats: {
        seasons: {},
        postseasons: {},
      },
      slug: teamSlug,
    };

    // Iterate through each recorded pitching appearance by a player
    // - Necessary to include players who no longer player for the team
    // - For now, assumes all pitchers are in rotation
    for (const playerId in pitchers) {
      const player: Player = pitchers[playerId];

      // Season stats
      if (Object.hasOwnProperty.call(player, "seasons")) {
        for (const season in player.seasons) {
          const seasonStats: PlayerStats = {
            ...player.seasons[season],
            id: player.id,
            name: player.name,
            slug: player.slug,
          };

          if (seasonStats.team === teamId) {
            if (
              !Object.hasOwnProperty.call(
                teamStats.pitchingStats.seasons,
                season
              )
            ) {
              teamStats.pitchingStats.seasons[season] = [];
            }

            teamStats.pitchingStats.seasons[season].push(seasonStats);
          }
        }
      }

      // Postseason stats
      if (Object.hasOwnProperty.call(player, "postseasons")) {
        for (const season in player.postseasons) {
          const seasonStats: PlayerStats = {
            ...player.postseasons[season],
            id: player.id,
            name: player.name,
            slug: player.slug,
          };

          if (seasonStats.team === teamId) {
            if (
              !Object.hasOwnProperty.call(
                teamStats.pitchingStats.postseasons,
                season
              )
            ) {
              teamStats.pitchingStats.postseasons[season] = [];
            }

            teamStats.pitchingStats.postseasons[season].push(seasonStats);
          }
        }
      }
    }

    // Iterate through each recorded batting appearance by a player
    // - Necessary to include players who no longer player for the team
    // - For now, assumes all batters are in lineup
    for (const playerId in batters) {
      const player: Player = batters[playerId];

      // Season stats
      if (Object.hasOwnProperty.call(player, "seasons")) {
        for (const season in player.seasons) {
          const seasonStats: PlayerStats = {
            ...player.seasons[season],
            id: player.id,
            name: player.name,
            slug: player.slug,
          };

          if (seasonStats.team === teamId) {
            if (
              !Object.hasOwnProperty.call(
                teamStats.battingStats.seasons,
                season
              )
            ) {
              teamStats.battingStats.seasons[season] = [];
            }

            teamStats.battingStats.seasons[season].push(seasonStats);
          }
        }
      }

      // Postseason stats
      if (Object.hasOwnProperty.call(player, "postseasons")) {
        for (const season in player.postseasons) {
          const seasonStats: PlayerStats = {
            ...player.postseasons[season],
            id: player.id,
            name: player.name,
            slug: player.slug,
          };

          if (seasonStats.team === teamId) {
            if (
              !Object.hasOwnProperty.call(
                teamStats.battingStats.postseasons,
                season
              )
            ) {
              teamStats.battingStats.postseasons[season] = [];
            }

            teamStats.battingStats.postseasons[season].push(seasonStats);
          }
        }
      }
    }

    // Create team folder if it does not exist
    await fs.promises.mkdir(`./data/teams/${teamSlug}`, { recursive: true });

    // Output team object to json
    fs.writeFile(
      `./data/teams/${teamSlug}/playerStats.json`,
      `${JSON.stringify(teamStats, null, "\t")}\n`,
      function (err) {
        if (err) {
          console.log(err);
        }
      }
    );

    allTeamStats.push(teamStats);
  }
  // Output team object to json
  fs.writeFile(
    "./data/teams/teams.json",
    `${JSON.stringify(allTeamStats, null, "\t")}\n`,
    function (err) {
      if (err) {
        console.log(err);
      }
    }
  );
})();
