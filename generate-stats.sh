#! /usr/bin/env bash

S3_LOGS_ARCHIVE=s3://blaseball-archive-iliana/
S3_BLASEBALL_REF_ARCHIVE=s3://blaseball-reference/public/json-data/

# Add temporary status file
touch ./ACTIVE_SCRIPT_RUN

mkdir -p ./data

# mkdir -p ./data ./blaseball-logs ./tmp

# echo "Pulling game update logs from S3..."
# aws --no-sign-request s3 sync s3://blaseball-archive-iliana/ ./blaseball-logs/ --exclude "hourly/*" --exclude "compressed-hourly/*" --exclude "idols/*" --exclude "v2/*"

# echo "Combining logs..."
# cat ./blaseball-logs/*.gz > ./tmp/combined-blaseball-log.json.gz
# gunzip -c ./tmp/combined-blaseball-log.json.gz > ./tmp/blaseball-log.json

echo "Pulling latest script updates..."
git pull

echo "Installing JavaScript dependencies..."
npm ci

echo "Compiling TypeScript files..."
npx tsc --project tsconfig.json

echo "Fetching latest team information..."
node dist/fetchTeamsFromDatablase.js

echo "Generating standing tables..."
node dist/generateStandings.js

echo "Generating schedule files..."
node dist/generateSchedules.js

# echo "Generating player stats..."
# node dist/generatePlayerPitchingStats.js
# node dist/generatePlayerBattingStats.js
# node dist/combinePlayers.js

# echo "Generating team player stats..."
# node dist/generateTeamPlayerStats.js

# echo "Generating stat leaders..."
# node dist/generateStatLeaders.js

echo "Copying generated data to Blaseball Reference S3 bucket..."
find ./data/ -type f -exec gzip "{}" \; -exec mv "{}.gz" "{}" \;
/usr/local/bin/s3cmd sync --quiet --no-mime-magic --recursive --acl-public --no-preserve --add-header="Content-Type: application/json" --add-header="Content-Encoding: gzip"  --add-header="Cache-Control: max-age=120" ./data/ $S3_BLASEBALL_REF_ARCHIVE
find ./data/ -type f -exec mv "{}" "{}.gz" \; -exec gunzip "{}" \;

# echo "Cleaning up..."
# rm -r ./tmp/

# Remove temporary status file
rm ./ACTIVE_SCRIPT_RUN

echo "Done!"
