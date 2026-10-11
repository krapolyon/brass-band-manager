# brass-band-manager
An internal tool for brass bands / marching bands : members, tunes, gigs and setlist

An installable web app (PWA) that a band hosts for itself: one band, one instance, under its own name, logo and colours.

The project is at its very beginning: this repository holds the technical base, not a usable app yet.

## Running it locally

You need [Node](https://nodejs.org) 22.12 or later and [Docker Desktop](https://www.docker.com/products/docker-desktop/), started.

```sh
npm run setup
```

This installs everything, starts a local stack in Docker (Apache with PHP, and MySQL) and leaves the app running at http://localhost:8080. It can be run again at any time.

| To | Run |
|---|---|
| Work on the front, with live reload | `npm run dev`, then http://localhost:5173 |
| Run the end-to-end tests | `npm test` |
| Check the code | `npm run check` |
| Stop the stack | `npm run stack:down` |

## Installing it on a host

Deployment is not automated yet, but one thing is worth knowing from the start. When the app is first opened it asks for an **install key**: a text of your choice, 16 characters at least, that you write beforehand in `api/config.php` on the server, next to the database password. It is what stops a stranger from installing your instance, and becoming its admin, before you do. It is used once.

The app keeps the files it is given (the logo of the band, later the songs) in a `storage` folder next to `api`. It has to be writable by PHP, kept out of what the web server serves, and backed up with the database.

## Documentation

| Document | What it tells |
|---|---|
| [docs/architecture.md](docs/architecture.md) | How the app is built, how to add a route, a screen, a text or a migration, and why each dependency is there |
| [docs/scoping.md](docs/scoping.md) | What the app is for, the decisions taken and the build order |
| [CLAUDE.md](CLAUDE.md) | The rules followed when writing code, for people and for AI assistants |
| [model/](model/) | The data model |

## Stack

React and TypeScript built with Vite for the front; PHP with Slim, Doctrine DBAL and Valinor for the API; MySQL; Playwright for the tests. It is meant to run on plain shared hosting, with no build step and no permanent process on the host.

## Licence

GNU Affero General Public License v3. See [LICENSE](LICENSE).
