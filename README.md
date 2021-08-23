# :oncoming_bus: POA Bus

![Update Data](https://github.com/rafaeelaudibert/poabus/actions/workflows/update.yml/badge.svg)
![Deploy](https://github.com/rafaeelaudibert/poabus/actions/workflows/deploy.yml/badge.svg)

A bus route visualisation for Porto Alegre's public transportation system. You can access it on [https://poabus.rafaaudibert.dev](https://poabus.rafaaudibert.dev)

## :gear: How

### :cityscape: Porto Alegre's Public Transportation API

We run a Github Action weekly, which fetches the data from Porto Alegre's public transportation API and generates the [`/data`](./data) folder with both minified and human-readable files which will be used by our visualisation code to generate the routes and the stops of every available service in the city of Porto Alegre.

The API endpoints were found after poking around on the requests made by the [poatransporte](http://www.poatransporte.com.br/) website. They are roughly as follows:

- Every available stop: http://www.poatransporte.com.br/php/facades/process.php?a=tp&p=
  - You can restrict the coordinates from which you want to fetch the stops, but in our case we want to parse everything, so we just send an empty `p` query parameter
- Every available route: http://www.poatransporte.com.br/php/facades/process.php?a=nc&p=%&t=o
  - We can also fetch the data for the "lotation" buses (faster and more expensive buses which stop anywhere you want) if we change the `t` parameter (which stands for `type`) to `l`
- Specific data for a single route: http://www.poatransporte.com.br/php/facades/process.php?a=il&p=routeId
  - Keep in mind that you need to substitute `routeId` by the id you want to fetch the data
  - The raw route endpoint doesn't return the path the route takes, so we need to fetch this from a different endpoint

To understand it better, check out [the script which fetches and parses the data](./scripts/fetchData.js).

After we collect this data, we automatically commit it to the repository.

#### :no_entry_sign: Limitations

While developing this project, I was rate limited (by IP) because I requested the last mentioned endpoint too many times in a short period of time. I couldn't figure out the rate limit because the IP ban made the API hang and timeout instead of returning me a header (or an answer) with the reason why I was being rate limited. To solve this, I'm doing at most 5 requests per second, which seems to work just fine.

### :recycle: Data update

After the data is updated, we need to rebuild our code and send it to S3. This happens in another Github Action which listens for `master` pushes. It bundles the new JSON files onto the website, and updates the S3 bucket that is serving the requests.

### :computer: Code

The code is then pretty simple, courtesy of [Lim Chee Aun](https://github.com/cheeaun)'s [BusRouter SG](https://github.com/cheeaun/busrouter-sg) project (credited below). We just use the data we generated showing it using [MapBox](https://www.mapbox.com/) and [deck.gl](https://deck.gl/).

## :runner: Running locally

- You will need Node 16 to run this. I suggest you installing [nvm](https://github.com/nvm-sh/nvm) and running `nvm install 16` and then using the `nvm use` command inside this repository to set it up.
- Install the dependencies with `npm install`
- Create a `.env` file based on the `.env.example` file with your [MapBox API key](https://docs.mapbox.com/api/overview/).
- Run it with `npm start`

## :older_man: Credits

This is 95% based on the amazing [BusRouter SG](https://github.com/cheeaun/busrouter-sg) built by [Lim Chee Aun](https://github.com/cheeaun) with the data for Singapore's public transportation. I forked his visualisation work and just changed to parse the data from Porto Alegre's (awful) public transportation API.

## :mage_man: Author

- [RafaAudibert](https://www.rafaaudibert.dev)
