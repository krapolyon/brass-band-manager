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
//   2. Signed in     any current member. This is where a new route goes.
//   3. Permission    a signed-in member holding a permission: a route of
//                    block 2 with ->add(new RequirePermission(...)).

use BrassBand\Access\MeAction;
use BrassBand\Access\Permission;
use BrassBand\Access\Profile;
use BrassBand\Access\RequirePermission;
use BrassBand\Access\RequireSession;
use BrassBand\Access\SessionCookie;
use BrassBand\Access\Sessions;
use BrassBand\Access\SignInAction;
use BrassBand\Access\SignOutAction;
use BrassBand\Band\ShowBandAction;
use BrassBand\Band\UpdateBandAction;
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
use BrassBand\Members\ListMembersAction;
use BrassBand\Members\MemberRecord;
use BrassBand\Members\Members;
use BrassBand\Members\PhotoStore;
use BrassBand\Members\SetRolesAction;
use BrassBand\Members\ShowMemberAction;
use BrassBand\Members\ShowPhotoAction;
use BrassBand\Members\UpdateMemberAction;
use BrassBand\Members\UpdatePhotoAction;
use BrassBand\Sections\DeleteInstrumentAction;
use BrassBand\Sections\DeleteSectionAction;
use BrassBand\Sections\ListSectionsAction;
use BrassBand\Sections\SaveInstrumentAction;
use BrassBand\Sections\SaveSectionAction;
use BrassBand\Sections\Sections;
use BrassBand\Storage\Files;
use Doctrine\DBAL\Connection;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

/**
 * @param array{installKey?: string, session?: array{secureCookie?: bool}} $config
 */
return function (App $app, Connection $database, array $config): void {
    $sessions = new Sessions($database);
    // Secure unless the configuration explicitly says otherwise.
    $cookie = new SessionCookie($config['session']['secureCookie'] ?? true);
    $profile = new Profile($database);
    $installKey = new InstallKey($config['installKey'] ?? '');
    // The files members upload, in a folder next to api/ that the web server
    // does not serve: a file leaves it only through an action.
    $files = new Files(dirname(__DIR__) . '/storage');
    $logos = new LogoStore($database, $files);
    $photos = new PhotoStore($database, $files);
    $links = new PasswordLinks($database);
    $members = new Members($database);
    $record = new MemberRecord($database);
    $sections = new Sections($database);

    // ---------------------------------------------------------------
    // 1. Public
    // ---------------------------------------------------------------
    $app->get('/api/health', new HealthAction($database));
    $app->get('/api/band', new ShowBandAction($database, $logos));
    $app->get('/api/band/logo', new ShowLogoAction($logos));
    $app->get('/api/band/icon/{size:180|192|512}', new ShowLogoAction($logos));
    $app->get('/api/manifest', new ManifestAction($database, $logos));
    $app->get('/api/install', new InstallStatusAction($database));
    $app->post('/api/install/key', new CheckInstallKeyAction($database, $installKey));
    $app->post('/api/install', new InstallAction($database, $sessions, $cookie, $profile, $installKey, $logos));
    $app->post('/api/session', new SignInAction($database, $sessions, $cookie, $profile));
    // Whoever holds a password link is not signed in yet.
    $app->post('/api/passwordLink/check', new CheckPasswordLinkAction($links));
    $app->post('/api/passwordLink/use', new UsePasswordLinkAction($database, $links, $sessions, $cookie, $profile));

    // ---------------------------------------------------------------
    // 2. Signed in
    // ---------------------------------------------------------------
    $app->group('', function (RouteCollectorProxy $group) use (
        $database,
        $sessions,
        $cookie,
        $profile,
        $logos,
        $photos,
        $links,
        $members,
        $record,
        $sections,
    ): void {
        $group->get('/api/me', new MeAction($profile));
        $group->put('/api/me/preferences', new UpdatePreferencesAction($database, $profile));
        $group->put('/api/me/password', new ChangePasswordAction($database, $sessions, $links, new SignInFailures($database)));
        $group->delete('/api/session', new SignOutAction($sessions, $cookie, everywhere: false));
        $group->delete('/api/sessions', new SignOutAction($sessions, $cookie, everywhere: true));

        // The directory of the band: each action shows what the member may see.
        $group->get('/api/members', new ListMembersAction($members));
        $group->get('/api/members/{id:[0-9]+}', new ShowMemberAction($members));
        $group->get('/api/members/{id:[0-9]+}/photo', new ShowPhotoAction($members, $photos));
        $group->get('/api/sections', new ListSectionsAction($sections));

        // ---------------------------------------------------------------
        // 3. One's own record, or a permission
        // ---------------------------------------------------------------
        $selfOrManager = new RequireSelfOrPermission(Permission::MANAGE_MEMBERS);
        $group->put('/api/members/{id:[0-9]+}', new UpdateMemberAction($database, $members, $record))
            ->add($selfOrManager);
        $group->put('/api/members/{id:[0-9]+}/photo', new UpdatePhotoAction($members, $photos, removes: false))
            ->add($selfOrManager);
        $group->delete('/api/members/{id:[0-9]+}/photo', new UpdatePhotoAction($members, $photos, removes: true))
            ->add($selfOrManager);

        // ---------------------------------------------------------------
        // 4. Permission
        // ---------------------------------------------------------------
        $manageMembers = new RequirePermission(Permission::MANAGE_MEMBERS);
        $group->post('/api/members', new CreateMemberAction($database, $members, $record, $links))
            ->add($manageMembers);
        $group->delete('/api/members/{id:[0-9]+}', new DeleteMemberAction($database, $members, $photos))
            ->add($manageMembers);
        $group->put('/api/members/{id:[0-9]+}/status', new ChangeStatusAction($database, $members, $sessions, $links, $photos))
            ->add($manageMembers);
        $group->post('/api/members/{id:[0-9]+}/passwordLink', new CreatePasswordLinkAction($database, $members, $links))
            ->add($manageMembers);
        $group->delete('/api/members/{id:[0-9]+}/passwordLink', new DeletePasswordLinkAction($members, $links))
            ->add($manageMembers);

        $group->put('/api/members/{id:[0-9]+}/roles', new SetRolesAction($database, $members, $links))
            ->add(new RequirePermission(Permission::MANAGE_ROLES));

        $manageSections = new RequirePermission(Permission::MANAGE_SECTIONS);
        $group->post('/api/sections', new SaveSectionAction($database, $sections))->add($manageSections);
        $group->put('/api/sections/{id:[0-9]+}', new SaveSectionAction($database, $sections))->add($manageSections);
        $group->delete('/api/sections/{id:[0-9]+}', new DeleteSectionAction($database, $sections))->add($manageSections);
        $group->post('/api/instruments', new SaveInstrumentAction($database, $sections))->add($manageSections);
        $group->put('/api/instruments/{id:[0-9]+}', new SaveInstrumentAction($database, $sections))->add($manageSections);
        $group->delete('/api/instruments/{id:[0-9]+}', new DeleteInstrumentAction($database, $sections))->add($manageSections);

        $manageBand = new RequirePermission(Permission::MANAGE_BAND);
        $group->patch('/api/band', new UpdateBandAction($database))->add($manageBand);
        $group->put('/api/band/logo', new UpdateLogoAction($logos))->add($manageBand);
        $group->delete('/api/band/logo', new DeleteLogoAction($logos))->add($manageBand);
    })->add(new RequireSession($sessions, $cookie));
};
