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
    $logos = new LogoStore($database, dirname(__DIR__) . '/storage');

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

    // ---------------------------------------------------------------
    // 2. Signed in
    // ---------------------------------------------------------------
    $app->group('', function (RouteCollectorProxy $group) use ($database, $sessions, $cookie, $profile, $logos): void {
        $group->get('/api/me', new MeAction($profile));
        $group->delete('/api/session', new SignOutAction($sessions, $cookie, everywhere: false));
        $group->delete('/api/sessions', new SignOutAction($sessions, $cookie, everywhere: true));

        // 3. Permission
        $group->patch('/api/band', new UpdateBandAction($database))
            ->add(new RequirePermission(Permission::MANAGE_BAND));
        $group->put('/api/band/logo', new UpdateLogoAction($logos))
            ->add(new RequirePermission(Permission::MANAGE_BAND));
        $group->delete('/api/band/logo', new DeleteLogoAction($logos))
            ->add(new RequirePermission(Permission::MANAGE_BAND));
    })->add(new RequireSession($sessions, $cookie));
};
