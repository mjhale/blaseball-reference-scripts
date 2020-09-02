#!/bin/bash
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

S3_LOGS_ARCHIVE=s3://blaseball-archive-iliana/

mkdir -p ./data ./blaseball-logs ./tmp

echo "Pulling game update logs from S3..."
aws --quiet --no-sign-request s3 sync $S3_LOGS_ARCHIVE ./blaseball-logs/ --exclude "hourly/*" --exclude "compressed-hourly/*"

echo "Combining logs..."
cat ./blaseball-logs/*.gz > ./tmp/combined-blaseball-log.json.gz
gunzip -c ./tmp/combined-blaseball-log.json.gz > ./tmp/blaseball-log.json

echo "Installing JavaScript dependencies..."
npm install

echo "Compiling TypeScript files..."
npx tsc --project tsconfig.json

echo "Fetching latest team information..."
node dist/fetchTeams.js

echo "Generating player stats..."
node dist/generatePlayerPitchingStats.js
node dist/generatePlayerBattingStats.js
node dist/combinePlayers.js

echo "Generating team player stats..."
node dist/generateTeamPlayerStats.js

echo "Generating stat leaders..."
node dist/generateStatLeaders.js

echo "Generating standing tables..."
node dist/generateStandings.js

echo "Copying generated data to Blaseball Reference S3 bucket..."
s3cmd put --quiet --no-mime-magic --recursive --acl-public --add-header="Content-Type: application/json" --add-header="Cache-Control: max-age=900" ./data/* s3://blaseball-reference/public/json-data/

echo "Cleaning up..."
rm -r ./tmp/

echo "Done!"
