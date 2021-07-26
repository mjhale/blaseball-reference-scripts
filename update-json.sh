#! /usr/bin/env bash

S3_BLASEBALL_REF_ARCHIVE=s3://br-public/json/
S3_BLASEBALL_REF_ENDPOINT=https://files.blaseball-reference.com

# Add temporary status file
touch .SCRIPT_RUN_IN_PROGRESS

echo "Pulling latest script updates..."
git pull

echo "Copying imported data..."
mkdir -p data/
cp -r importedData/* data/

echo "Installing JavaScript dependencies..."
npm ci

echo "Compiling TypeScript files..."
npx tsc --project tsconfig.json

echo "Fetching latest team information..."
node dist/fetchTeamsFromDatablase.js

echo "Generating standing tables..."
node dist/generateStandings.js

echo "Updating divine favor..."
node dist/fetchDivineFavor.js

echo "Copying generated data to Blaseball Reference S3 bucket..."
find ./data/ -type f -exec gzip "{}" \; -exec mv "{}.gz" "{}" \;
aws --endpoint-url $S3_BLASEBALL_REF_ENDPOINT s3 sync --acl public-read --quiet --no-guess-mime-type --content-type "application/json" --content-encoding "gzip" --cache-control "max-age=120" ./data/ $S3_BLASEBALL_REF_ARCHIVE
find ./data/ -type f -exec mv "{}" "{}.gz" \; -exec gunzip "{}" \;

echo "Updating imported data and committing changes"
for filename in importedData/*; do
  [ -e "$filename" ] || continue;
  cp "data/${filename##*/}" importedData/
done

if ! git diff-index --quiet HEAD importedData/; then
  git add importedData/
  git commit --quiet -m "Update imported data"
  git push
fi

# Remove temporary status file
rm .SCRIPT_RUN_IN_PROGRESS

echo "Done!"
