import fs from "fs";

// Type definitions
interface AllTimeStatLeaders {
  [categoryType: string]: {
    [category: string]: Array<StatLeader>;
  };
}

interface StatCollection {
  appearances: number;
  battersFaced: number;
  basesOnBalls: number;
  basesOnBallsPerNine: number;
  earnedRuns: number;
  earnedRunAverage: number;
  flyouts: number;
  groundouts: number;
  hitsAllowed: number;
  hitsAllowedPerNine: number;
  homeRuns: number;
  homeRunsPerNine: number;
  inningsPitched: number;
  losses: number;
  numberOfPitches: number;
  plateAppearances: number;
  qualityStarts: number;
  shutouts: number;
  strikeouts: number;
  strikeoutToWalkRatio: number;
  strikeoutsPerNine: number;
  strikeoutRate: number;
  team: string;
  teamName: string;
  walksAndHitsPerInningPitched: number;
  walkRate: number;
  winningPercentage: number;
  wins: number;
}

interface Player {
  careerSeason: StatCollection;
  id: string;
  name: string;
  seasons: {
    [season: string]: StatCollection;
  };
  slug: string;
}

interface SeasonStatLeaders {
  [seasonNumber: string]: {
    [categoryType: string]: {
      [category: string]: Array<StatLeader>;
    };
  };
}

interface StatCategory {
  abbreviation: string;
  id: string;
  name: string;
  sort: "asc" | "desc";
  minimumInningsPerTeamGame?: number;
  minimumPlateAppearancesPerTeamGame?: number;
  type?: "batting" | "pitching";
}

interface StatLeader {
  playerId: string;
  playerName: string;
  playerSlug: string;
  team: string;
  teamName: string;
  value: number;
}

const MAX_LEADERS_PER_CATEGORY = 10;
const TEAM_GAMES_PER_SEASON: {
  [season: number]: number;
  [career: string]: number;
} = {
  career: 100,
};

// Stat Categories
const statCategories = getStatCategories();

function generateStatLeaders(): {
  allTimeCategoryLeaders: AllTimeStatLeaders;
  seasonLeaders: SeasonStatLeaders;
} {
  // Load pre-generated teams and league-wide pitcher, and batter stats
  const batters = JSON.parse(
    fs.readFileSync("./data/batting/batters.json", "utf8")
  );
  const pitchers = JSON.parse(
    fs.readFileSync("./data/pitching/pitchers.json", "utf8")
  );

  // Objects to hold stat leaders
  const seasonLeaders: SeasonStatLeaders = {};

  const allTimeCategoryLeaders: AllTimeStatLeaders = {};

  for (const category of statCategories) {
    let playerGroup: typeof batters | typeof pitchers;

    if (category.type === "batting") {
      playerGroup = batters;
    } else if (category.type === "pitching") {
      playerGroup = pitchers;
    } else {
      throw new Error("Invalid player group");
    }

    // Initialize stat category's leader array
    if (
      !Object.prototype.hasOwnProperty.call(
        allTimeCategoryLeaders,
        category.type
      )
    ) {
      allTimeCategoryLeaders[category.type] = {};
    }

    allTimeCategoryLeaders[category.type][category.id] = [];

    for (const playerId in playerGroup) {
      const player: Player = playerGroup[playerId];

      // Update all time category leaders
      allTimeCategoryLeaders[category.type][
        category.id
      ] = updateCategoryLeaders({
        category: category,
        leaders: allTimeCategoryLeaders[category.type][category.id],
        player: player,
        playerStats: player.careerSeason,
        season: "career",
      });

      // Update season category leaders
      for (const season in player.seasons) {
        // Attempt to find the number of games played in a given season
        if (
          !Object.hasOwnProperty.call(TEAM_GAMES_PER_SEASON, season) ||
          player.seasons[season].appearances > TEAM_GAMES_PER_SEASON[season]
        ) {
          TEAM_GAMES_PER_SEASON[season] = player.seasons[season].appearances;
        }

        // Create season object if necessary
        if (!Object.prototype.hasOwnProperty.call(seasonLeaders, season)) {
          seasonLeaders[season] = {};
        }

        if (
          !Object.prototype.hasOwnProperty.call(
            seasonLeaders[season],
            category.type
          )
        ) {
          seasonLeaders[season][category.type] = {};
        }

        if (
          !Object.prototype.hasOwnProperty.call(
            seasonLeaders[season][category.type],
            category.id
          )
        ) {
          seasonLeaders[season][category.type][category.id] = [];
        }

        seasonLeaders[season][category.type][
          category.id
        ] = updateCategoryLeaders({
          category: category,
          leaders: seasonLeaders[season][category.type][category.id],
          player: player,
          playerStats: player.seasons[season],
          season: season,
        });
      }
    }
  }

  return { allTimeCategoryLeaders, seasonLeaders };
}

function getStatCategories() {
  // Stat categories
  const batterStatCategories: Array<StatCategory> = [
    {
      abbreviation: "AVG",
      id: "battingAverage",
      name: "Batting Average",
      sort: "desc",
      minimumPlateAppearancesPerTeamGame: 3,
    },
    {
      abbreviation: "HRISP",
      id: "hitsWithRunnersInScoringPosition",
      name: "Hits With Runners in Scoring Position",
      sort: "desc",
    },
    {
      abbreviation: "BB",
      id: "basesOnBalls",
      name: "Walks",
      sort: "desc",
    },
    {
      abbreviation: "HPB",
      id: "hitByPitches",
      name: "Hit-by-pitches",
      sort: "desc",
    },
    { abbreviation: "2B", id: "doublesHit", name: "Doubles Hit", sort: "desc" },
    { abbreviation: "3B", id: "triplesHit", name: "Triples Hit", sort: "desc" },
    { abbreviation: "TB", id: "totalBases", name: "Total Bases", sort: "desc" },
    {
      abbreviation: "CS",
      id: "caughtStealing",
      name: "Caught Stealing",
      sort: "desc",
    },
    {
      abbreviation: "GDP",
      id: "groundIntoDoublePlays",
      name: "Ground Into Double Plays",
      sort: "desc",
    },
    { abbreviation: "H", id: "hits", name: "Hits", sort: "desc" },
    {
      abbreviation: "HR",
      id: "homeRunsHit",
      name: "Home Runs Hit",
      sort: "desc",
    },
    {
      abbreviation: "OBP",
      id: "onBasePercentage",
      name: "On-base Percentage",
      sort: "desc",
      minimumPlateAppearancesPerTeamGame: 3,
    },
    {
      abbreviation: "OPS",
      id: "onBasePlusSlugging",
      name: "On-base plus slugging",
      sort: "desc",
      minimumPlateAppearancesPerTeamGame: 3,
    },
    {
      abbreviation: "R",
      id: "runsScored",
      name: "Runs Scored",
      sort: "desc",
    },
    {
      abbreviation: "RBI",
      id: "runsBattedIn",
      name: "Runs Batted In",
      sort: "desc",
    },
    {
      abbreviation: "SLG",
      id: "sluggingPercentage",
      name: "Slugging Percentage",
      sort: "desc",
      minimumPlateAppearancesPerTeamGame: 3,
    },
    {
      abbreviation: "SB",
      id: "stolenBases",
      name: "Stolen Bases",
      sort: "desc",
    },
    {
      abbreviation: "SF",
      id: "sacrificeFlies",
      name: "Sacrifice Flies",
      sort: "desc",
    },
    {
      abbreviation: "SH",
      id: "sacrificeBunts",
      name: "Sacrifice Bunts",
      sort: "desc",
    },
    { abbreviation: "SO", id: "strikeouts", name: "Strikeouts", sort: "desc" },
  ];

  const pitcherStatCategories: Array<StatCategory> = [
    {
      abbreviation: "BB",
      id: "basesOnBalls",
      name: "Bases on Balls",
      sort: "desc",
    },
    {
      abbreviation: "BB9",
      id: "basesOnBallsPerNine",
      name: "Walks Per 9 Innings",
      sort: "asc",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "HPB",
      id: "hitByPitches",
      name: "Hit-by-pitches",
      sort: "desc",
    },
    { abbreviation: "ER", id: "earnedRuns", name: "Earned Runs", sort: "desc" },
    {
      abbreviation: "ERA",
      id: "earnedRunAverage",
      name: "Earned Run Average",
      sort: "asc",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "H",
      id: "hitsAllowed",
      name: "Hits Allowed",
      sort: "desc",
    },
    {
      abbreviation: "H9",
      id: "hitsAllowedPerNine",
      name: "Hits Allowed Per 9 Innings",
      sort: "asc",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "HR",
      id: "homeRuns",
      name: "Home Runs Allowed",
      sort: "desc",
    },
    {
      abbreviation: "HR9",
      id: "homeRunsPerNine",
      name: "Home Runs Allowed Per 9 Innings",
      sort: "asc",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "IP",
      id: "inningsPitched",
      name: "Innings Pitched",
      sort: "desc",
    },
    { abbreviation: "L", id: "losses", name: "Losses", sort: "desc" },
    {
      abbreviation: "P",
      id: "pitchCount",
      name: "Pitches Thrown",
      sort: "desc",
    },
    {
      abbreviation: "QS",
      id: "qualityStarts",
      name: "Quality Starts",
      sort: "desc",
    },
    { abbreviation: "SHO", id: "shutouts", name: "Shutouts", sort: "desc" },
    { abbreviation: "SO", id: "strikeouts", name: "Strikeouts", sort: "desc" },
    {
      abbreviation: "SO/BB",
      id: "strikeoutToWalkRatio",
      name: "Strikeout-to-Walk Ratio",
      sort: "desc",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "SO9",
      id: "strikeoutsPerNine",
      name: "Strikeouts Per 9 Innings",
      sort: "desc",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "SO%",
      id: "strikeoutRate",
      name: "Strikeout Percentage",
      sort: "desc",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "WHIP",
      id: "walksAndHitsPerInningPitched",
      sort: "asc",
      name: "Walks and Hits Per Inning Pitched",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "BB%",
      id: "walkRate",
      name: "Walk Percentage",
      sort: "asc",
      minimumInningsPerTeamGame: 1,
    },
    {
      abbreviation: "W-L%",
      id: "winningPercentage",
      name: "Winning Percentage",
      sort: "desc",
      minimumInningsPerTeamGame: 1,
    },
    { abbreviation: "W", id: "wins", name: "Wins", sort: "desc" },
  ];

  batterStatCategories.forEach((category) => (category.type = "batting"));
  pitcherStatCategories.forEach((category) => (category.type = "pitching"));

  return batterStatCategories.concat(pitcherStatCategories);
}

function updateCategoryLeaders({
  category,
  leaders,
  player,
  playerStats,
  season,
}: {
  category: StatCategory;
  leaders: Array<StatLeader>;
  player: Player;
  playerStats: StatCollection;
  season: number | string;
}) {
  // Exclude player if they have do not meet a minimum qualification
  if (
    category.minimumInningsPerTeamGame &&
    playerStats.inningsPitched <
      TEAM_GAMES_PER_SEASON[season] * category.minimumInningsPerTeamGame
  ) {
    return leaders;
  }

  if (
    category.minimumPlateAppearancesPerTeamGame &&
    playerStats.plateAppearances <
      TEAM_GAMES_PER_SEASON[season] *
        category.minimumPlateAppearancesPerTeamGame
  ) {
    return leaders;
  }

  // Calculate all-time category position
  if (leaders.length === 0) {
    leaders.push({
      playerId: player.id,
      playerName: player.name,
      playerSlug: player.slug,
      team: playerStats.team,
      teamName: playerStats.teamName,
      value: playerStats[category.id],
    });
  } else {
    let positionFoundAmongLeaders = false;

    // Find player's stat position among current leaders
    for (let i = 0; i < leaders.length; i++) {
      const leader = leaders[i];

      if (
        (category.sort === "asc" && playerStats[category.id] < leader.value) ||
        (category.sort === "desc" && playerStats[category.id] > leader.value)
      ) {
        const start = leaders.slice(0, i);
        const end = leaders.slice(i);

        // Add player to appropriate position in leaders array
        leaders = [
          ...start,
          {
            playerId: player.id,
            playerName: player.name,
            playerSlug: player.slug,
            team: playerStats.team,
            teamName: playerStats.teamName,
            value: playerStats[category.id],
          },
          ...end,
        ];

        positionFoundAmongLeaders = true;

        // Player's position has been found, exit out of loop
        break;
      }
    }

    if (
      !positionFoundAmongLeaders &&
      leaders.length < MAX_LEADERS_PER_CATEGORY
    ) {
      leaders.push({
        playerId: player.id,
        playerName: player.name,
        playerSlug: player.slug,
        team: playerStats.team,
        teamName: playerStats.teamName,
        value: playerStats[category.id],
      });
    }
  }

  // Trim down leader array if necessary
  if (leaders.length > MAX_LEADERS_PER_CATEGORY) {
    leaders.pop();
  }

  return leaders;
}

async function writeStatLeadersToJson({
  allTimeCategoryLeaders,
  seasonLeaders,
}) {
  // Output team object to json
  await fs.promises.mkdir(`./data/leaders`, { recursive: true });

  const seasonLeadersWriteStream: NodeJS.WritableStream = fs.createWriteStream(
    "./data/leaders/leaders.json"
  );
  seasonLeadersWriteStream.write(
    `${JSON.stringify(
      { ...seasonLeaders, allTime: allTimeCategoryLeaders },
      null,
      "\t"
    )}\n`
  );

  const categoriesWriteStream: NodeJS.WritableStream = fs.createWriteStream(
    "./data/leaders/categories.json"
  );
  categoriesWriteStream.write(
    `${JSON.stringify(statCategories, null, "\t")}\n`
  );
}

function main() {
  const { allTimeCategoryLeaders, seasonLeaders } = generateStatLeaders();

  writeStatLeadersToJson({ allTimeCategoryLeaders, seasonLeaders });
}

main();
