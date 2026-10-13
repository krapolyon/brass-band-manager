// Writes a made-up MuseScore file to the standard output, in base64: two
// staves, "Trompette" and "Tuba", playing a scale over four measures, with a
// rehearsal mark, "Refrain", on the third. No music
// file is kept in the repository, so the tests build this one when they need
// it, with the same MuseScore engine the app uses (webmscore).
//
// Run apart from the tests (songFiles.ts): the engine expects an older Node,
// and what it needs changed here would change it for every test.
import { createRequire } from 'node:module';

Object.defineProperty(globalThis, 'navigator', { value: {}, writable: true, configurable: true });
// With no fetch, the engine reads its own files from the disk.
delete globalThis.fetch;

const scale = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
const part = (id, octave) =>
  `<part id="${id}">${[0, 1, 2, 3]
    .map(
      (measure) =>
        `<measure number="${measure + 1}">${
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
          .join('')}</measure>`,
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
const file = await score.saveMsc('mscz');
process.stdout.write(Buffer.from(file).toString('base64'), () => process.exit(0));
