'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const {AudioStub,MediaStub}=require('./audio-fixture.cjs');
function engine(options={track:'copper'},Context=AudioStub){const intervals=new Map();let id=0;const window={AudioContext:Context,Audio:MediaStub,setInterval:f=>{intervals.set(++id,f);return id;},clearInterval:i=>intervals.delete(i)};const sandbox={window};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/audio.js'),'utf8'),sandbox);return {audio:window.FoundryAudio.create(options),intervals,window};}
test('music waits for activation, composes local notes, and does not duplicate its scheduler',async()=>{
  const {audio,intervals}=engine();assert.equal(audio.status().playing,false);assert.equal(intervals.size,0);
  assert.equal(await audio.start(),true);assert.equal(intervals.size,1);assert.equal(audio.status().playing,true);
  const ctx=AudioStub.instances.at(-1);assert.ok(ctx.oscillators.length>=4);ctx.oscillators.forEach(o=>{assert.ok(o.frequency.events[0][1]>0);assert.ok(o.stopped>o.started);});
  await audio.start();assert.equal(intervals.size,1);audio.stop();assert.equal(intervals.size,0);assert.equal(audio.status().playing,false);
});
test('volume, track, mute and visibility transitions update the active score without orphan timers',async()=>{
  const {audio,intervals}=engine({volume:.22,track:'copper'});await audio.start();audio.setVolume(.4);assert.equal(audio.status().volume,.4);
  audio.setVolume(9);assert.equal(audio.status().volume,.6);audio.setVolume(NaN);assert.equal(audio.status().volume,.6);
  await audio.setTrack('night');assert.equal(audio.status().track,'night');assert.equal(intervals.size,1);
  audio.setTrack('bad');assert.equal(audio.status().track,'night');audio.visibility(true);assert.equal(intervals.size,0);
  await audio.visibility(false);assert.equal(intervals.size,1);audio.setEnabled(false);assert.equal(intervals.size,0);assert.equal(await audio.start(),false);
  audio.visibility(false);assert.equal(intervals.size,0);
});
test('background-time recovery schedules future notes rather than a backlog, and muted music has no chime',async()=>{
  const {audio,intervals}=engine();await audio.start();const ctx=AudioStub.instances.at(-1);ctx.currentTime=100;
  const before=ctx.oscillators.length;[...intervals.values()][0]();ctx.oscillators.slice(before).forEach(o=>assert.ok(o.started>=100));
  audio.setVolume(0);const count=ctx.oscillators.length;audio.chime();assert.equal(ctx.oscillators.length,count);
});
test('unavailable audio or a rejected browser resume does not break the game',async()=>{
  const {audio}=engine({track:'copper'},null);assert.equal(audio.status().available,false);assert.equal(await audio.start(),false);
  class Blocked extends AudioStub{async resume(){throw Error('blocked');}}
  const blocked=engine({track:'copper'},Blocked);assert.equal(await blocked.audio.start(),false);assert.equal(blocked.intervals.size,0);
});
test('a pending audio resume cannot restart sound after hiding or muting',async()=>{
  let finish;class Deferred extends AudioStub{resume(){return new Promise(resolve=>{finish=()=>{this.state='running';resolve();};});}}
  const {audio,intervals}=engine({track:'copper'},Deferred);const pending=audio.start();audio.visibility(true);finish();assert.equal(await pending,false);assert.equal(intervals.size,0);assert.equal(audio.status().playing,false);
});
test('the bundled Kevin MacLeod tracks load locally and stop cleanly when changed or muted',async()=>{
  const {audio,window}=engine({track:'monkeys'}), player=new window.Audio();
  window.document={getElementById:id=>id==='music-player'?player:null};
  assert.equal(audio.status().available,true); assert.equal(await audio.start(),true);
  assert.equal(player.src,'assets/music/monkeys-spinning-monkeys.mp3'); assert.equal(player.volume,.22);
  await audio.setTrack('duck'); assert.equal(player.src,'assets/music/fluffing-a-duck.mp3'); assert.equal(player.paused,false);
  audio.setEnabled(false); assert.equal(player.paused,true); assert.equal(audio.status().playing,false);
  assert.equal(Object.values(require('../source/audio.js').tracks).filter(t=>t.kind==='recording').length,10);
});
