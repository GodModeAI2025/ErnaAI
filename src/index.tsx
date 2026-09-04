#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
async function main(): Promise<void> {
  const [major=0,minor=0]=process.versions.node.split('.').map(Number);
  if(major<22 || major===22&&minor<13)throw new Error('ERNA-AI benötigt Node.js 22.13 oder neuer (aktuelle Ink-Version).');
  if(process.argv.includes('--version')){console.log('ERNA-AI 1.0.0');return;}
  if(process.argv.includes('--help')){console.log('ERNA-AI – lokaler Kanzleiarbeitsplatz\n\nnpm run dev          Entwicklung mit automatischem Neustart\nnpm run build        Anwendung kompilieren\nnpm start            Anwendung starten\nnpm start -- --seed   Demodaten laden und starten\nnpm run seed         Nur Demodaten laden\n\nERNA_DATA_PATH  Datenverzeichnis (Standard: ~/erna-data)\nF1 Hilfe · F2 Mandant · F3 Neu · F5 Suche · F6 Fristen · F9 KI · F10 Beenden');return;}
  const {ensureDataDirectory,loadConfig,getDataPath}=await import('./data/filesystem.js');
  await ensureDataDirectory();
  if(process.argv.includes('--seed')){const {seedDemoData}=await import('./data/seed.js');const result=await seedDemoData();console.log(`Demodaten: ${result.created} Mandanten angelegt, ${result.skipped} vorhandene Akten übersprungen.`);}
  const config=await loadConfig();
  if(!process.stdin.isTTY || !process.stdout.isTTY){console.log(`ERNA-AI ist bereit. Datenpfad: ${getDataPath()}\nBitte in einem interaktiven Terminal mit „npm start“ öffnen. „--help“ zeigt die Startoptionen.`);return;}
  const [{render},{App},{createKeyboardInput}]=await Promise.all([import('ink'),import('./app/App.js'),import('./utils/keyboard.js')]);
  const keyboard=createKeyboardInput(process.stdin);
  try { const application=render(<App initialConfig={config}/>,{stdin:keyboard.stdin,exitOnCtrlC:false,debug:process.env.ERNA_DEBUG==='true',maxFps:20,alternateScreen:true});await application.waitUntilExit(); }
  finally {keyboard.dispose();}
}
main().catch((error:unknown)=>{console.error(`ERNA-AI konnte nicht gestartet werden: ${error instanceof Error?error.message:'Unbekannter Fehler.'}`);process.exitCode=1;});
