import {afterEach,expect,it} from 'vitest';
import {cleanup,render} from 'ink-testing-library';
import type {Mandant} from '../../src/app/types.js';
import {StatusBar} from '../../src/components/layout/StatusBar.js';
afterEach(cleanup);
it('hält Datum und KI-Zustand bei langen Mandantennamen sichtbar',()=>{const mandant={id:'M-2024-0002',name:'Schmidt und Partner mit einem sehr langen Kanzleinamen'} as Mandant;const app=render(<StatusBar width={80} mandant={mandant} now={new Date(2026,8,4,9,30)} aiAvailable={false}/>);expect(app.lastFrame()).toContain('04.09.2026 09:30');expect(app.lastFrame()).toContain('KI aus');});
