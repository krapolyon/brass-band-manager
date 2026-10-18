<?php

declare(strict_types=1);

namespace BrassBand\Band;

use BrassBand\Access\CurrentMember;
use BrassBand\Discord\Discord;
use BrassBand\Discord\DiscordLinks;
use BrassBand\Http\FieldErrors;
use BrassBand\Http\Input;
use BrassBand\Http\Json;
use Doctrine\DBAL\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

// GET and PUT /api/band/discord: the screen "Discord" of the band settings.
// Asks for MANAGE_BAND. Rules: model/band.md, "Discord", and
// section.discordRoleId (model/members.md, entry 2).
//
// The answer says whether the bot reaches the server, asked of Discord each
// time (GET /guilds/{id}), and lists the roles of the server a section can be
// tagged with (GET /guilds/{id}/roles). The token of the bot is never part of
// it: only whether there is one. With ?withoutBot, Discord is not asked: the
// summary of the band settings only needs to know whether a server is set.
final class DiscordSettingsAction
{
    public function __construct(
        private readonly Connection $database,
        private readonly Discord $discord,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if ($request->getMethod() === 'PUT') {
            $this->save(Input::from($request, DiscordSettingsInput::class), CurrentMember::of($request)->id);
        }

        return Json::write($response, $this->view(askDiscord: !array_key_exists('withoutBot', $request->getQueryParams())));
    }

    private function save(DiscordSettingsInput $input, int $memberId): void
    {
        $errors = new FieldErrors();
        $serverId = null;
        $link = trim($input->link ?? '');
        if ($link !== '') {
            $read = DiscordLinks::read($link, alone: 'server');
            if ($read === null || $read['serverId'] === null) {
                $errors->add('link', 'invalid');
            } else {
                $serverId = $read['serverId'];
            }
        }

        $sectionIds = array_map('intval', $this->database->fetchFirstColumn('SELECT id FROM section'));
        $roles = [];
        foreach ($input->sectionRoles as $index => $choice) {
            $role = trim($choice->discordRoleId ?? '');
            if (!in_array($choice->sectionId, $sectionIds, true) || ($role !== '' && preg_match(DiscordLinks::ID, $role) !== 1)) {
                $errors->add("sectionRoles.{$index}", 'invalid');
                continue;
            }
            if ($role !== '' && in_array($role, $roles, true)) {
                // One role tags one section.
                $errors->add("sectionRoles.{$index}", 'duplicate');
                continue;
            }
            $roles[$choice->sectionId] = $role === '' ? null : $role;
        }
        $errors->throwIfAny();

        $this->database->transactional(function () use ($serverId, $roles, $memberId): void {
            $previous = $this->database->fetchOne('SELECT discordServerId FROM band WHERE id = 1 FOR UPDATE');
            $this->database->update('band', ['discordServerId' => $serverId, 'updatedByMemberId' => $memberId], ['id' => 1]);
            // The roles of another server, or of none, tag nothing here.
            $isSameServer = $serverId !== null && $serverId === $previous;
            if (!$isSameServer) {
                $this->database->executeStatement('UPDATE section SET discordRoleId = NULL, updatedByMemberId = ? WHERE discordRoleId IS NOT NULL', [$memberId]);
            }
            if ($serverId === null || ($previous !== null && !$isSameServer)) {
                return;
            }
            // Emptied first, so that two sections can swap their roles.
            foreach (array_keys($roles) as $sectionId) {
                $this->database->update('section', ['discordRoleId' => null], ['id' => $sectionId]);
            }
            foreach ($roles as $sectionId => $role) {
                $this->database->update('section', ['discordRoleId' => $role, 'updatedByMemberId' => $memberId], ['id' => $sectionId]);
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function view(bool $askDiscord): array
    {
        $serverId = $this->database->fetchOne('SELECT discordServerId FROM band WHERE id = 1');
        $serverId = is_string($serverId) && $serverId !== '' ? $serverId : null;
        $server = $serverId === null || !$askDiscord ? ['status' => 'none', 'serverName' => null] : $this->discord->server($serverId);
        $roles = $serverId !== null && $server['status'] === 'connected' ? $this->discord->roles($serverId, fresh: true) : null;

        return [
            'serverId' => $serverId,
            // Whether the configuration holds a token, never the token.
            'hasBot' => $this->discord->hasBot(),
            // none: no server or no bot; connected; refused: Discord said no
            // (a bot not invited, a wrong token); unreachable: no answer.
            'bot' => $server['status'],
            'serverName' => $server['serverName'],
            'roles' => $roles,
            'sections' => array_map(fn (array $section) => [
                'id' => (int) $section['id'],
                'name' => (string) $section['name'],
                'icon' => $section['icon'] === null ? null : (string) $section['icon'],
                'discordRoleId' => $section['discordRoleId'] === null ? null : (string) $section['discordRoleId'],
            ], $this->database->fetchAllAssociative('SELECT id, name, icon, discordRoleId FROM section ORDER BY position, name')),
        ];
    }
}
