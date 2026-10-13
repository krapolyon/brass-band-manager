// Writes a made-up MuseScore file to the standard output, in base64: two
// staves, "Trompette" and "Tuba", playing a scale over four measures, with a
// rehearsal mark, "Refrain", on the third. No music
// file is kept in the repository, so the tests build this one when they need
// it, with the same MuseScore engine the app uses (webmscore).
//
// Run apart from the tests (songFiles.ts): the engine expects an older Node,
// and what it needs changed here would change it for every test.
import { createRequire } from 'node:module';
import { crc32 } from 'node:zlib';

Object.defineProperty(globalThis, 'navigator', { value: {}, writable: true, configurable: true });
// With no fetch, the engine reads its own files from the disk.
delete globalThis.fetch;

// "repeat" as the first argument: the first two measures are played twice.
const hasRepeat = process.argv[2] === 'repeat';
const repeatOf = (measure) =>
  !hasRepeat
    ? ['', '']
    : [
        measure === 0 ? '<barline location="left"><repeat direction="forward"/></barline>' : '',
        measure === 1 ? '<barline location="right"><repeat direction="backward"/></barline>' : '',
      ];

// "lastEid" as the first argument: the file as MuseScore 4.4 writes it, with
// a line the engine does not know, which makes it open an empty score.
const withLastEid = (mscx) =>
  Buffer.from(
    Buffer.from(mscx).toString('utf8').replace('<Score>', '<LastEID>1</LastEID>\n  <Score>'),
  );

// A zip archive of one file, not compressed.
function zipOf(name, data) {
  const title = Buffer.from(name);
  const common = Buffer.alloc(26);
  common.writeUInt16LE(20, 0);
  common.writeUInt32LE(crc32(data), 10);
  common.writeUInt32LE(data.length, 14);
  common.writeUInt32LE(data.length, 18);
  common.writeUInt16LE(title.length, 22);
  const local = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), common, title, data]);
  const listed = Buffer.alloc(46);
  listed.write('PK\x01\x02', 'latin1');
  listed.writeUInt16LE(20, 4);
  common.copy(listed, 6);
  const end = Buffer.alloc(22);
  end.write('PK\x05\x06', 'latin1');
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + title.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, listed, title, end]);
}

const scale = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const part = (id, octave) =>
  `<part id="${id}">${[0, 1, 2, 3]
    .map(
      (measure) =>
        `<measure number="${measure + 1}">${repeatOf(measure)[0]}${
          measure === 0
            ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="120"/></direction>'
            : measure === 2 && id === 'P1'
              ? '<direction placement="above"><direction-type><rehearsal>Refrain</rehearsal></direction-type></direction>'
              : ''
        }${[0, 1, 2, 3]
          .map(
            (beat) =>
              `<note><pitch><step>${scale[(measure * 4 + beat) % 8]}</step><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type></note>`,
          )
          .join('')}${repeatOf(measure)[1]}</measure>`,
    )
    .join('')}</part>`;
const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list>
<score-part id="P1"><part-name>Trompette</part-name><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>57</midi-program></midi-instrument></score-part>
<score-part id="P2"><part-name>Tuba</part-name><midi-instrument id="P2-I1"><midi-channel>2</midi-channel><midi-program>59</midi-program></midi-instrument></score-part>
</part-list>${part('P1', 4)}${part('P2', 2)}</score-partwise>`;

const WebMscore = createRequire(import.meta.url)('webmscore');
await WebMscore.ready;
const score = await WebMscore.load('musicxml', new TextEncoder().encode(musicXml), [], true);
const file =
  process.argv[2] === 'lastEid'
    ? zipOf('score.mscx', withLastEid(await score.saveMsc('mscx')))
    : await score.saveMsc('mscz');
process.stdout.write(Buffer.from(file).toString('base64'), () => process.exit(0));
