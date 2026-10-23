# The Discord bot of a band

The app shows the messages of a Discord channel that are meant for it: they tag the app, that is the bot of the band (`@App Les Krapos`). From 0.3.2, a gig shows the messages of its channel that tag the app, and a song those that tag the app and the section of the member (`@App Les Krapos @saxophoniste`). The tag of the app is not shown in the app. It reads them through a bot that belongs to the band. The bot only reads: it never writes, and it is never "connected". The app calls the Discord API when a member opens a song, so the bot shows as offline in the member list of the server. That is expected on a host without a long-running process.

Without a bot, the app still opens the channels of songs and gigs from their sheet. Only the messages need it.

The model is in `model/band.md` ("Discord"), `model/members.md` (`section.discordRoleId`), `model/songs.md` ("Display") and `model/gigs.md` ("Discord on a gig").

## Create the bot (once per band)

Done by whoever hosts the app, with the right to manage the Discord server. The labels of the Discord Developer Portal change from time to time: look for the nearest one.

1. Open https://discord.com/developers/applications and choose **New Application**. Name it after the app of the band, for instance "App Les Krapos".
2. In **Bot**:
   - turn on **Message Content Intent**, under "Privileged Gateway Intents". Without it Discord sends the messages with an empty text. It is free for an app installed on fewer than 10,000 servers;
   - turn off **Public Bot**, so that nobody else can add it to another server;
   - choose **Reset Token** and copy the token. It is shown once. It is a password: never in the repository, never in a message, never in the database.
3. In **OAuth2**, then **URL Generator**: tick the scope `bot`, then the permissions **View Channels** and **Read Message History**, and nothing else. Open the URL it gives, choose the server of the band and confirm.
4. If the channels of songs are private, give the role of the bot access to them.

## Give the token to the app

The token goes in the server configuration, `config.php`, beside the other secrets, on beta first, then on production:

```php
'discord' => [
    'botToken' => '…',
],
```

The exact key is the one `docs/architecture.md` lists under "Configuration".

## Set it up in the app

As an admin: Band settings, then **Discord**.

1. Paste the link of any channel of the server (in Discord: long press or right click on a channel, "Copier le lien du salon"). The app keeps the server.
2. The screen says whether the bot reaches the server.
3. Choose the Discord role of each section among the roles of the server.

Then, in the form of each song and each gig, paste the link of its channel.

Tell the band how to use it: in the channel of a gig, tag the app for a message to show on the gig; in the channel of a song, tag the app and the section. The name of the app on Discord is the name of the bot, shown on the Discord screen of the settings.

## To check on beta

- That the messages are read without the bot ever having connected to the gateway (expected, not verified when this was written).
- That a channel the bot cannot see answers like a song without a channel: the button only, no error.
