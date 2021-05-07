# Blaseball Reference Scripts

A collection of scripts which generate JSON for use on the [Blaseball Reference website](https://blaseball-reference.com).

## Setup Instructions

```
npm ci
npx tsc --project tsconfig.json
```

To run a specific task:

```
node dist/generateStandings.js
```

To run all tasks:

```
./update-json.sh
```

_Note: The `update-json.sh` script will attempt to automatically commit and push imported data updates. It will also attempt to upload the generated data using `aws-cli`._

## Building and Running the Docker Container

To build the Docker image:

```
docker build --pull --no-cache --platform linux/amd64 --secret id=ssh_key,src=$HOME/.ssh/blaseball_ref_ed25519 -t blaseball-reference-scripts .
```

To run the container:

```
docker run -it --rm --platform linux/amd64 -v ~/.ssh/blaseball_ref_ed25519:/root/.ssh/id_ed25519 -v ~/.aws:/root/.aws blaseball-reference-scripts bash
```

_Note: The container automatically adds a cron task to run `update-json.sh` at a set interval. The `ssh_key` secret and the `ssh` and `aws` bind mounts are used for the committing and uploading tasks in `update-json.sh`._
