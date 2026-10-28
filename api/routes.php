<?php

declare(strict_types=1);

// Every address the API answers, in one place. An address that is not listed
// here does not exist.
//
// A route is a method, an address and the action that answers it. An action is
// a class of src/<Domain>/ with an __invoke() method; what it needs is given
// to it here.
//
// WHO CAN CALL A ROUTE IS DECIDED HERE, BY WHERE THE ROUTE IS WRITTEN:
//   1. Public        no sign-in. A short list; adding to it is a decision.
//                    The calendar feed is one: its address carries its key.
//   2. Signed in     any current member. This is where a new route goes.
//   3. Oneself       the member the address names, or one holding a
//                    permission: a route of block 2 with
//                    ->add(new RequireSelfOrPermission(...)); for a gig,
//                    its organisers, with ->add(new RequireGigEditor(...)).
//   4. Permission    a signed-in member holding a permission: a route of
//                    block 2 with ->add(new RequirePermission(...)).

use BrassBand\Access\AccessRules;
use BrassBand\Access\MeAction;
use BrassBand\Http\RequestLimit;
use BrassBand\Access\Permission;
use BrassBand\Access\Profile;
use BrassBand\Access\RequirePermission;
use BrassBand\Access\RequireSession;
use BrassBand\Access\SessionCookie;
use BrassBand\Access\Sessions;
use BrassBand\Access\SignInAction;
use BrassBand\Access\SignOutAction;
use BrassBand\Band\Bands;
use BrassBand\Calendar\CalendarAction;
use BrassBand\Calendar\CalendarFeed;
use BrassBand\Calendar\CalendarFeedAction;
use BrassBand\Band\DiscordSettingsAction;
use BrassBand\Band\ShowBandAction;
use BrassBand\Band\ShowGigRemindersAction;
use BrassBand\Band\UpdateBandAction;
use BrassBand\Band\UpdateGigRemindersAction;
use BrassBand\Discord\Discord;
use BrassBand\Gigs\AnswerAction;
use BrassBand\Gigs\ChangeGigStatusAction;
use BrassBand\Gigs\CostumePictures;
use BrassBand\Gigs\Costumes;
use BrassBand\Gigs\DeleteCostumeAction;
use BrassBand\Gigs\DeleteGigAction;
use BrassBand\Gigs\DeleteSlotAction;
use BrassBand\Gigs\GigDiscordMessagesAction;
use BrassBand\Gigs\GigPush;
use BrassBand\Gigs\Gigs;
use BrassBand\Gigs\ListCostumesAction;
use BrassBand\Gigs\ListGigsAction;
use BrassBand\Gigs\RemindGigAction;
use BrassBand\Gigs\Reminders;
use BrassBand\Gigs\RequireGigEditor;
use BrassBand\Gigs\SaveCostumeAction;
use BrassBand\Gigs\SaveGigAction;
use BrassBand\Gigs\SaveSlotAction;
use BrassBand\Gigs\DeleteSetlistAction;
use BrassBand\Gigs\LivePush;
use BrassBand\Gigs\LiveSetlistAction;
use BrassBand\Gigs\SaveSetlistAction;
use BrassBand\Gigs\Setlists;
use BrassBand\Gigs\ShowCostumePictureAction;
use BrassBand\Gigs\ShowSetlistAction;
use BrassBand\Gigs\ShowGigAction;
use BrassBand\Gigs\UpdateCostumePictureAction;
use BrassBand\Health\HealthAction;
use BrassBand\Band\DeleteLogoAction;
use BrassBand\Band\LogoStore;
use BrassBand\Band\ManifestAction;
use BrassBand\Band\ShowLogoAction;
use BrassBand\Band\UpdateLogoAction;
use BrassBand\Install\CheckInstallKeyAction;
use BrassBand\Install\InstallAction;
use BrassBand\Install\InstallKey;
use BrassBand\Install\InstallStatusAction;
use BrassBand\Access\ChangePasswordAction;
use BrassBand\Access\CheckPasswordLinkAction;
use BrassBand\Access\ValidateInvitationAction;
use BrassBand\Access\ForgotPasswordAction;
use BrassBand\Mail\Mailer;
use BrassBand\Access\CurrentPassword;
use BrassBand\Migrations\ListMigrationsAction;
use BrassBand\Migrations\Migrations;
use BrassBand\Migrations\RunMigrationsAction;
use BrassBand\Transfer\ExportAction;
use BrassBand\Transfer\ImportAction;
use BrassBand\Transfer\ReadAction;
use BrassBand\Transfer\ShowTransferAction;
use BrassBand\Transfer\TemplatesAction;
use BrassBand\Transfer\TransferFolder;
use BrassBand\Transfer\Transfers;
use BrassBand\Transfer\UploadAction;
use BrassBand\Access\PasswordLinks;
use BrassBand\Access\RequireSelfOrPermission;
use BrassBand\Access\SignInFailures;
use BrassBand\Access\UpdatePreferencesAction;
use BrassBand\Access\UsePasswordLinkAction;
use BrassBand\Members\ChangeStatusAction;
use BrassBand\Members\CreateMemberAction;
use BrassBand\Members\CreatePasswordLinkAction;
use BrassBand\Members\DeleteMemberAction;
use BrassBand\Members\DeletePasswordLinkAction;
use BrassBand\Members\Invitations;
use BrassBand\Members\ListMembersAction;
use BrassBand\Members\MemberRecord;
use BrassBand\Members\Members;
use BrassBand\Members\PersonalData;
use BrassBand\Members\PhotoStore;
use BrassBand\Members\SendInvitationAction;
use BrassBand\Members\SetRolesAction;
use BrassBand\Members\ShowMemberAction;
use BrassBand\Members\ShowPhotoAction;
use BrassBand\Members\UpdateMemberAction;
use BrassBand\Members\UpdatePhotoAction;
use BrassBand\Push\NotificationsAction;
use BrassBand\Push\PushAction;
use BrassBand\Push\PushSetup;
use BrassBand\Sections\DeleteInstrumentAction;
use BrassBand\Sections\DeleteSectionAction;
use BrassBand\Sections\ListSectionsAction;
use BrassBand\Sections\SaveInstrumentAction;
use BrassBand\Sections\SaveSectionAction;
use BrassBand\Sections\Sections;
use BrassBand\Songs\AddAliasAction;
use BrassBand\Songs\ChangeSongStatusAction;
use BrassBand\Songs\ClipThumbnails;
use BrassBand\Songs\DeleteAliasAction;
use BrassBand\Songs\DiscordMessagesAction;
use BrassBand\Songs\DictationAction;
use BrassBand\Songs\DeleteSongAction;
use BrassBand\Songs\DownloadArchiveAction;
use BrassBand\Songs\FileNames;
use BrassBand\Songs\InstrumentAliases;
use BrassBand\Songs\ListAliasesAction;
use BrassBand\Songs\ListSongsAction;
use BrassBand\Songs\PlaceFilesAction;
use BrassBand\Songs\SavePeaksAction;
use BrassBand\Songs\SaveSongAction;
use BrassBand\Songs\SetLevelsAction;
use BrassBand\Songs\ShowSongAction;
use BrassBand\Songs\ShowSongFileAction;
use BrassBand\Songs\SongFiles;
use BrassBand\Songs\SongPush;
use BrassBand\Songs\Songs;
use BrassBand\Songs\SpokenNames;
use BrassBand\Songs\SpokenNamesAction;
use BrassBand\Songs\UpdateSongFileAction;
use BrassBand\Storage\Files;
use Doctrine\DBAL\Connection;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

/**
 * @param array{storageFolder: string, importFolder?: string, migrationsFolder: string, installKey?: string, encryptionKey?: string, session?: array{secureCookie?: bool}, appUrl?: string, mail?: array<string, mixed>, clipThumbnailUrls?: list<string>, push?: array<string, mixed>, mapTilesUrl?: string, discord?: array{botToken?: string, answersFrom?: string}} $config
 */
return function (App $app, Connection $database, array $config): void {
    $sessions = new Sessions($database);
    // The names, email, phone and address of members, encrypted in the database.
    $personal = PersonalData::from($config, $database);
    // Secure unless the configuration explicitly says otherwise.
    $cookie = new SessionCookie($config['session']['secureCookie'] ?? true);
    $profile = new Profile($database, $personal);
    $installKey = new InstallKey($config['installKey'] ?? '');
    // The files members upload, in a folder the web server does not serve
    // (bootstrap.php says where): a file leaves it only through an action.
    $files = new Files($config['storageFolder']);
    $migrations = new Migrations($database, $config['migrationsFolder'], $personal);
    $currentPassword = new CurrentPassword($database, $sessions, new SignInFailures($database));
    $logos = new LogoStore($database, $files);
    $mailer = new Mailer($config);
    $push = PushSetup::from($config, $database, $personal);
    $bands = new Bands($database, $logos, $mailer);
    $photos = new PhotoStore($database, $files);
    $links = new PasswordLinks($database);
    $members = new Members($database, $personal);
    $invitations = new Invitations($database, $mailer, $personal);
    $record = new MemberRecord($database, $personal);
    $sections = new Sections($database);
    $songFiles = new SongFiles($database, $files);
    $songs = new Songs($database, $songFiles);
    $thumbnails = new ClipThumbnails($config);
    $gigs = new Gigs($database, is_string($config['mapTilesUrl'] ?? null) ? trim($config['mapTilesUrl']) : Gigs::DEFAULT_MAP_TILES_URL);
    $costumes = new Costumes($database);
    $setlists = new Setlists($database);
    $costumePictures = new CostumePictures($database, $files);
    $gigPush = new GigPush($database, $push);
    $songPush = new SongPush($database, $push);
    // The bot of the band, which reads Discord (docs/discord-bot.md).
    $discord = Discord::from($config);
    // Export, import and reprise of the data (model/export-import.md): the
    // folder "import" beside storage/, where a large zip arrives by FTP.
    $transferFolder = new TransferFolder($config['importFolder'] ?? dirname($config['storageFolder']) . '/import');
    $transfers = new Transfers($database, $personal, $files, $links, $thumbnails, $invitations, $transferFolder);
    // The version of the app, written in the export: version.json is at the
    // root of the built front, which is what the web server serves.
    $built = json_decode((string) @file_get_contents(($_SERVER['DOCUMENT_ROOT'] ?? '') . '/version.json'), true);
    $appVersion = is_array($built) && is_string($built['version'] ?? null) ? $built['version'] : 'unknown';

    // What one visitor may do on the public addresses (RequestLimit).
    $limitKey = RequestLimit::keyFrom($config);
    $refusals = new RequestLimit($database, $limitKey, 'refusals', AccessRules::VISITOR_REFUSALS_MAX, AccessRules::VISITOR_REFUSALS_MINUTES);
    $emailRequests = new RequestLimit($database, $limitKey, 'emails', AccessRules::VISITOR_EMAIL_REQUESTS_MAX, AccessRules::VISITOR_EMAIL_REQUESTS_MINUTES, countsEveryRequest: true);

    // ---------------------------------------------------------------
    // 1. Public
    // Every route here that checks a secret or sends an email is limited
    // per visitor: ->add($refusals) or ->add($emailRequests).
    // ---------------------------------------------------------------
    $app->get('/api/health', new HealthAction($database));
    $app->get('/api/band', new ShowBandAction($bands));
    $app->get('/api/band/logo', new ShowLogoAction($logos));
    $app->get('/api/band/icon/{size:180|192|512}', new ShowLogoAction($logos));
    $app->get('/api/manifest', new ManifestAction($database, $logos));
    $app->get('/api/install', new InstallStatusAction($database));
    $app->post('/api/install/key', new CheckInstallKeyAction($database, $installKey, $migrations))->add($refusals);
    $app->post('/api/install', new InstallAction($database, $sessions, $cookie, $profile, $installKey, $logos, $migrations, $personal))->add($refusals);
    $app->post('/api/session', new SignInAction($database, $sessions, $cookie, $profile, $personal))->add($refusals);
    // Whoever holds a password link is not signed in yet.
    $app->post('/api/passwordLink/request', new ForgotPasswordAction($database, $links, $mailer, $personal))->add($emailRequests);
    $app->post('/api/passwordLink/check', new CheckPasswordLinkAction($database, $links, $photos, $sections, $personal))->add($refusals);
    $app->post('/api/passwordLink/validate', new ValidateInvitationAction($links, $record))->add($refusals);
    $app->post('/api/passwordLink/use', new UsePasswordLinkAction($database, $links, $sessions, $cookie, $profile, $record, $photos, $personal))->add($refusals);
    // A calendar app has no session: the token of the address is the key
    // (model/gigs.md, entry 5). The same "not found" whatever is wrong with it.
    // Not limited per visitor: a calendar service reads the addresses of many
    // people from one network address, and 32 random characters are not guessed.
    $app->get('/api/calendar/{token}.ics', new CalendarFeedAction($database, new CalendarFeed($database, is_string($config['appUrl'] ?? null) ? trim($config['appUrl']) : '')));

    // ---------------------------------------------------------------
    // 2. Signed in
    // ---------------------------------------------------------------
    $app->group('', function (RouteCollectorProxy $group) use (
        $database,
        $sessions,
        $cookie,
        $profile,
        $logos,
        $bands,
        $photos,
        $links,
        $members,
        $invitations,
        $record,
        $sections,
        $songFiles,
        $songs,
        $thumbnails,
        $gigs,
        $setlists,
        $costumes,
        $costumePictures,
        $push,
        $gigPush,
        $songPush,
        $migrations,
        $currentPassword,
        $discord,
        $transferFolder,
        $transfers,
        $mailer,
        $files,
        $personal,
        $appVersion,
        $config,
    ): void {
        $group->get('/api/me', new MeAction($profile));
        $group->put('/api/me/preferences', new UpdatePreferencesAction($database, $profile));
        // What the member wants to be told of, on every device that receives.
        $notifications = new NotificationsAction($database);
        $group->get('/api/me/notifications', $notifications);
        $group->put('/api/me/notifications', $notifications);
        // One's own calendar address: read, created, or replaced.
        $calendar = new CalendarAction($database);
        $group->get('/api/me/calendar', $calendar);
        $group->post('/api/me/calendar', $calendar);
        $group->put('/api/me/calendar', $calendar);
        $group->put('/api/me/password', new ChangePasswordAction($database, $links, $currentPassword, $personal));
        $group->delete('/api/session', new SignOutAction($sessions, $cookie, everywhere: false));
        $group->delete('/api/sessions', new SignOutAction($sessions, $cookie, everywhere: true));

        // The notifications of the device that asks: its own, nobody else's.
        $group->get('/api/push', new PushAction($push));
        $group->put('/api/push/subscription', new PushAction($push));
        $group->delete('/api/push/subscription', new PushAction($push));

        // The directory of the band: each action shows what the member may see.
        $group->get('/api/members', new ListMembersAction($members));
        $group->get('/api/members/{id:[0-9]+}', new ShowMemberAction($members));
        $group->get('/api/members/{id:[0-9]+}/photo', new ShowPhotoAction($members, $photos));
        $group->get('/api/sections', new ListSectionsAction($sections));

        // Songs: every member sees every song and every file of it.
        $group->get('/api/songs', new ListSongsAction($songs));
        $group->get('/api/songs/archive', new DownloadArchiveAction($database, $songs, $songFiles));
        $group->get('/api/songs/{id:[0-9]+}', new ShowSongAction($songs));
        // The messages of its Discord channel that tag the app and the section of the member.
        $group->get('/api/songs/{id:[0-9]+}/discord', new DiscordMessagesAction($database, $songs, $discord));
        foreach (['cover', 'clipThumbnail', 'audio', 'midi', 'musicXml', 'museScore'] as $kind) {
            $group->get("/api/songs/{id:[0-9]+}/{$kind}", new ShowSongFileAction($database, $songs, $songFiles, $kind));
        }
        $group->get('/api/songs/{id:[0-9]+}/parts/{instrumentId:[0-9]+}', new ShowSongFileAction($database, $songs, $songFiles, 'part'));
        // One's own levels on a song: the address names no member.
        $group->put('/api/songs/{id:[0-9]+}/levels', new SetLevelsAction($database, $songs));
        // The instrument each track of a MIDI file is, for the MIDI player. Changes nothing.
        $group->post('/api/songs/trackNames', new PlaceFilesAction(new FileNames($database), tracks: true));

        // Gigs: every member sees every gig but the drafts, which each
        // action hides from who cannot edit them, and answers for themself.
        $group->get('/api/gigs', new ListGigsAction($gigs));
        $group->get('/api/gigs/{id:[0-9]+}', new ShowGigAction($gigs));
        // The messages of its Discord channel that tag the app.
        $group->get('/api/gigs/{id:[0-9]+}/discord', new GigDiscordMessagesAction($database, $gigs, $discord));
        // One's own answer for a slot: the address names no member.
        $group->put('/api/gigs/{id:[0-9]+}/slots/{slotId:[0-9]+}/answer', new AnswerAction($database, $gigs, $gigPush, forAnother: false));
        $group->get('/api/setlists/{id:[0-9]+}', new ShowSetlistAction($gigs, $setlists));
        $group->get('/api/costumes', new ListCostumesAction($costumes));
        $group->get('/api/costumes/{id:[0-9]+}/picture', new ShowCostumePictureAction($costumePictures));

        // ---------------------------------------------------------------
        // 3. One's own record or one's own gig, or a permission
        // ---------------------------------------------------------------
        $selfOrManager = new RequireSelfOrPermission(Permission::MANAGE_MEMBERS);
        $group->put('/api/members/{id:[0-9]+}', new UpdateMemberAction($database, $members, $record))
            ->add($selfOrManager);
        $group->put('/api/members/{id:[0-9]+}/photo', new UpdatePhotoAction($members, $photos, removes: false))
            ->add($selfOrManager);
        $group->delete('/api/members/{id:[0-9]+}/photo', new UpdatePhotoAction($members, $photos, removes: true))
            ->add($selfOrManager);

        // A gig is edited by whoever manages gigs and by its organisers.
        $editGig = new RequireGigEditor($gigs);
        $group->put('/api/gigs/{id:[0-9]+}', new SaveGigAction($database, $gigs))->add($editGig);
        $group->put('/api/gigs/{id:[0-9]+}/status', new ChangeGigStatusAction($database, $gigs, $setlists, $gigPush))->add($editGig);
        $group->post('/api/gigs/{id:[0-9]+}/slots', new SaveSlotAction($database, $gigs))->add($editGig);
        $group->put('/api/gigs/{id:[0-9]+}/slots/{slotId:[0-9]+}', new SaveSlotAction($database, $gigs))->add($editGig);
        $group->delete('/api/gigs/{id:[0-9]+}/slots/{slotId:[0-9]+}', new DeleteSlotAction($database, $gigs))->add($editGig);
        // "Relancer": a notification to who has not answered for the gig.
        $group->post('/api/gigs/{id:[0-9]+}/reminder', new RemindGigAction($database, $gigs, new Reminders($database, $push)))->add($editGig);
        // The answer of a member who told them.
        $group->put('/api/gigs/{id:[0-9]+}/slots/{slotId:[0-9]+}/answers/{memberId:[0-9]+}', new AnswerAction($database, $gigs, $gigPush, forAnother: true))
            ->add($editGig);

        // ---------------------------------------------------------------
        // 4. Permission
        // ---------------------------------------------------------------
        $manageMembers = new RequirePermission(Permission::MANAGE_MEMBERS);
        $group->post('/api/members', new CreateMemberAction($database, $members, $record, $links, $invitations))
            ->add($manageMembers);
        $group->delete('/api/members/{id:[0-9]+}', new DeleteMemberAction($database, $members, $photos))
            ->add($manageMembers);
        $group->put('/api/members/{id:[0-9]+}/status', new ChangeStatusAction($database, $members, $sessions, $links, $photos, $invitations))
            ->add($manageMembers);
        $group->post('/api/members/{id:[0-9]+}/passwordLink', new CreatePasswordLinkAction($database, $members, $links))
            ->add($manageMembers);
        $group->delete('/api/members/{id:[0-9]+}/passwordLink', new DeletePasswordLinkAction($members, $links))
            ->add($manageMembers);
        // "Renvoyer l'invitation": a new link, sent by email (#50).
        $group->post('/api/members/{id:[0-9]+}/invitation', new SendInvitationAction($database, $members, $links, $invitations))
            ->add($manageMembers);

        $group->put('/api/members/{id:[0-9]+}/roles', new SetRolesAction($database, $members, $links))
            ->add(new RequirePermission(Permission::MANAGE_ROLES));

        // The migrations, on a host without a command line. Applying them asks
        // for the password again (model/band.md, "Updating the database").
        $runMigrations = new RequirePermission(Permission::RUN_MIGRATIONS);
        $group->get('/api/migrations', new ListMigrationsAction($migrations))->add($runMigrations);
        $group->post('/api/migrations', new RunMigrationsAction($migrations, $currentPassword))->add($runMigrations);

        // Export, import and reprise of the data: the admin only (export-import.md).
        $transferData = new RequirePermission(Permission::TRANSFER_DATA);
        $group->get('/api/transfer', new ShowTransferAction($database, $transferFolder, $mailer, $config['storageFolder']))->add($transferData);
        $group->post('/api/transfer/export', new ExportAction($database, $personal, $files, $currentPassword, $appVersion))->add($transferData);
        $group->get('/api/transfer/templates', new TemplatesAction($database))->add($transferData);
        $group->put('/api/transfer/upload', new UploadAction($transferFolder))->add($transferData);
        $group->post('/api/transfer/read', new ReadAction($transfers))->add($transferData);
        $group->post('/api/transfer/import', new ImportAction($transfers, $currentPassword))->add($transferData);

        $manageSections = new RequirePermission(Permission::MANAGE_SECTIONS);
        $group->post('/api/sections', new SaveSectionAction($database, $sections))->add($manageSections);
        $group->put('/api/sections/{id:[0-9]+}', new SaveSectionAction($database, $sections))->add($manageSections);
        $group->delete('/api/sections/{id:[0-9]+}', new DeleteSectionAction($database, $sections))->add($manageSections);
        $group->post('/api/instruments', new SaveInstrumentAction($database, $sections))->add($manageSections);
        $group->put('/api/instruments/{id:[0-9]+}', new SaveInstrumentAction($database, $sections))->add($manageSections);
        $group->delete('/api/instruments/{id:[0-9]+}', new DeleteInstrumentAction($database, $sections))->add($manageSections);

        $manageSongs = new RequirePermission(Permission::MANAGE_SONGS);
        $group->post('/api/songs', new SaveSongAction($database, $songs, $songFiles, $thumbnails, $songPush))->add($manageSongs);
        $group->post('/api/songs/fileNames', new PlaceFilesAction(new FileNames($database)))->add($manageSongs);
        $group->put('/api/songs/{id:[0-9]+}', new SaveSongAction($database, $songs, $songFiles, $thumbnails, $songPush))->add($manageSongs);
        $group->put('/api/songs/{id:[0-9]+}/status', new ChangeSongStatusAction($database, $songs))->add($manageSongs);
        $group->delete('/api/songs/{id:[0-9]+}', new DeleteSongAction($database, $songs, $songFiles))->add($manageSongs);
        $group->put('/api/songs/{id:[0-9]+}/audio/peaks', new SavePeaksAction($songs, $songFiles))->add($manageSongs);
        // The files of a song, each sent alone as the body of its request
        // (FileBody). BodyLimit knows these addresses: keep the two in step.
        foreach (array_keys(SongFiles::COLUMNS) as $kind) {
            $group->put("/api/songs/{id:[0-9]+}/{$kind}", new UpdateSongFileAction($songs, $songFiles, $songPush, $kind, removes: false))->add($manageSongs);
            $group->delete("/api/songs/{id:[0-9]+}/{$kind}", new UpdateSongFileAction($songs, $songFiles, $songPush, $kind, removes: true))->add($manageSongs);
        }
        $group->put('/api/songs/{id:[0-9]+}/parts/{instrumentId:[0-9]+}', new UpdateSongFileAction($songs, $songFiles, $songPush, 'part', removes: false))->add($manageSongs);
        $group->delete('/api/songs/{id:[0-9]+}/parts/{instrumentId:[0-9]+}', new UpdateSongFileAction($songs, $songFiles, $songPush, 'part', removes: true))->add($manageSongs);

        // The known spellings of the instruments. They are listed in the band
        // settings, but belong to whoever manages songs (model/songs.md, entry 2).
        $aliases = new InstrumentAliases($database);
        $group->get('/api/instrumentAliases', new ListAliasesAction($aliases))->add($manageSongs);
        $group->post('/api/instruments/{id:[0-9]+}/aliases', new AddAliasAction($aliases))->add($manageSongs);
        $group->delete('/api/instrumentAliases/{id:[0-9]+}', new DeleteAliasAction($database, $aliases))->add($manageSongs);

        // The phrases the dictation of a setlist learned for a song, edited by
        // hand in the form of the song (model/songs.md, entry 4).
        $spokenNames = new SpokenNames($database);
        $songSpokenNames = new SpokenNamesAction($database, $songs, $spokenNames);
        $group->get('/api/songs/{id:[0-9]+}/spokenNames', $songSpokenNames)->add($manageSongs);
        $group->post('/api/songs/{id:[0-9]+}/spokenNames', $songSpokenNames)->add($manageSongs);
        $group->delete('/api/songSpokenNames/{id:[0-9]+}', $songSpokenNames)->add($manageSongs);

        // Creating a gig and deleting a draft are for who manages gigs: an
        // organiser edits the gig they were given, nothing more.
        $manageGigs = new RequirePermission(Permission::MANAGE_GIGS);
        $group->post('/api/gigs', new SaveGigAction($database, $gigs))->add($manageGigs);
        $group->delete('/api/gigs/{id:[0-9]+}', new DeleteGigAction($database, $gigs))->add($manageGigs);

        // Setlists are written and played live by who manages setlists.
        $manageSetlists = new RequirePermission(Permission::MANAGE_SETLISTS);
        $group->post('/api/gigs/{id:[0-9]+}/setlists', new SaveSetlistAction($database, $gigs, $setlists))->add($manageSetlists);
        $group->put('/api/setlists/{id:[0-9]+}', new SaveSetlistAction($database, $gigs, $setlists))->add($manageSetlists);
        $group->delete('/api/setlists/{id:[0-9]+}', new DeleteSetlistAction($database, $gigs, $setlists))->add($manageSetlists);
        // The dictation of a setlist: what it reads, and what it learns.
        $dictation = new DictationAction($database, $songs, $spokenNames);
        $group->get('/api/spokenNames', $dictation)->add($manageSetlists);
        $group->post('/api/songs/{id:[0-9]+}/spokenNames/learned', $dictation)->add($manageSetlists);
        $live = new LiveSetlistAction($database, $setlists, new LivePush($database, $push));
        $group->post('/api/setlists/{id:[0-9]+}/live', $live)->add($manageSetlists);
        $group->put('/api/setlists/{id:[0-9]+}/live', $live)->add($manageSetlists);
        $group->delete('/api/setlists/{id:[0-9]+}/live', $live)->add($manageSetlists);

        $manageCostumes = new RequirePermission(Permission::MANAGE_COSTUMES);
        $group->post('/api/costumes', new SaveCostumeAction($database, $costumes))->add($manageCostumes);
        $group->put('/api/costumes/{id:[0-9]+}', new SaveCostumeAction($database, $costumes))->add($manageCostumes);
        $group->delete('/api/costumes/{id:[0-9]+}', new DeleteCostumeAction($database, $costumes, $costumePictures))->add($manageCostumes);
        $group->put('/api/costumes/{id:[0-9]+}/picture', new UpdateCostumePictureAction($costumes, $costumePictures, removes: false))->add($manageCostumes);
        $group->delete('/api/costumes/{id:[0-9]+}/picture', new UpdateCostumePictureAction($costumes, $costumePictures, removes: true))->add($manageCostumes);

        $manageBand = new RequirePermission(Permission::MANAGE_BAND);
        $group->patch('/api/band', new UpdateBandAction($database, $bands))->add($manageBand);
        $group->get('/api/band/gigReminders', new ShowGigRemindersAction($bands))->add($manageBand);
        $group->put('/api/band/gigReminders', new UpdateGigRemindersAction($database, $bands))->add($manageBand);
        $group->put('/api/band/logo', new UpdateLogoAction($logos))->add($manageBand);
        $group->delete('/api/band/logo', new DeleteLogoAction($logos))->add($manageBand);
        $discordSettings = new DiscordSettingsAction($database, $discord);
        $group->get('/api/band/discord', $discordSettings)->add($manageBand);
        $group->put('/api/band/discord', $discordSettings)->add($manageBand);
        $group->put('/api/band/appIcon', new UpdateLogoAction($logos, appIcon: true))->add($manageBand);
        $group->delete('/api/band/appIcon', new DeleteLogoAction($logos, appIcon: true))->add($manageBand);
    })->add(new RequireSession($sessions, $cookie));
};
