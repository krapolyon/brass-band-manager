# brass-band-manager
An internal tool for brass bands / marching bands : members, tunes, gigs and setlist

The project is at its very beginning: this repository holds the technical base, not a usable app yet. The decisions behind it are in [docs/scoping.md](docs/scoping.md).

## Running it locally

You need Node 22 or later and Docker.

```sh
npm install
npm run test:install                      # once: browsers used by the tests
cp api/config.example.php api/config.php  # local configuration
npm run build                             # builds the front to web/dist
npm run stack:up                          # Apache with PHP, and MySQL, in Docker
```

The app is then at http://localhost:8080.

- `npm run dev` serves the front at http://localhost:5173 and reloads it on every change.
- `npm test` runs the end-to-end tests against the local stack.
- `npm run stack:down` stops the stack.
