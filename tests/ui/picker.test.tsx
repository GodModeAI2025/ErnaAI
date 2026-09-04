import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import { MandantPicker } from '../../src/components/shared/MandantPicker.js';
const { context }=vi.hoisted(()=>({context:{mandanten:[{id:'M-2024-0001',name:'Huber GmbH',aktiv:true},{id:'M-2024-0002',name:'Schmidt KG',aktiv:true}],index:null,height:20,width:76,selectMandant:vi.fn(async()=>undefined)}}));
vi.mock('../../src/app/App.js',()=>({useErna:()=>context}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('filtert per Typeahead und öffnet den ausgewählten Mandanten',async()=>{const close=vi.fn(),ui=render(<MandantPicker onClose={close}/>);await new Promise(resolve=>setTimeout(resolve,50));ui.stdin.write('schm');await vi.waitFor(()=>expect(ui.lastFrame()).not.toContain('Huber GmbH'));ui.stdin.write('\r');await vi.waitFor(()=>expect(context.selectMandant).toHaveBeenCalledWith('M-2024-0002'));expect(close).toHaveBeenCalled();});
