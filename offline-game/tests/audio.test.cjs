'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const {AudioStub}=require('./audio-fixture.cjs');
function engine(options={},Context=AudioStub){const intervals=new Map();let id=0;const window={AudioContext:Context,setInterval:f=>{intervals.set(++id,f);return id;},clearInterval:i=>intervals.delete(i)};const sandbox={window};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/audio.js'),'utf8'),sandbox);return {audio:window.FoundryAudio.create(options),intervals,window};}
test('music waits for activation, composes local notes, and does not duplicate its scheduler',async()=>{
  const {audio,intervals}=engine();assert.equal(audio.status().playing,false);assert.equal(intervals.size,0);
  assert.equal(await audio.start(),true);assert.equal(intervals.size,1);assert.equal(audio.status().playing,true);
  const ctx=AudioStub.instances.at(-1);assert.ok(ctx.oscillators.length>=4);ctx.oscillators.forEach(o=>{assert.ok(o.frequency.events[0][1]>0);assert.ok(o.stopped>o.started);});
  await audio.start();assert.equal(intervals.size,1);audio.stop();assert.equal(intervals.size,0);assert.equal(audio.status().playing,false);
});
test('volume, track, mute and visibility transitions update the active score without orphan timers',async()=>{
  const {audio,intervals}=engine({volume:.22});await audio.start();audio.setVolume(.4);assert.equal(audio.status().volume,.4);
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
  const {audio}=engine({},null);assert.equal(audio.status().available,false);assert.equal(await audio.start(),false);
  class Blocked extends AudioStub{async resume(){throw Error('blocked');}}
  const blocked=engine({},Blocked);assert.equal(await blocked.audio.start(),false);assert.equal(blocked.intervals.size,0);
});
test('a pending audio resume cannot restart sound after hiding or muting',async()=>{
  let finish;class Deferred extends AudioStub{resume(){return new Promise(resolve=>{finish=()=>{this.state='running';resolve();};});}}
  const {audio,intervals}=engine({},Deferred);const pending=audio.start();audio.visibility(true);finish();assert.equal(await pending,false);assert.equal(intervals.size,0);assert.equal(audio.status().playing,false);
});
class AudioElementStub {
  static instances=[];static failing=new Set();
  constructor(src){this.src=src;this.volume=1;this.paused=true;this.listeners={};AudioElementStub.instances.push(this);}
  addEventListener(t,f){(this.listeners[t] ||= []).push(f);}
  async play(){if([...AudioElementStub.failing].some(p=>this.src.includes(p)))throw Error('NotSupportedError');this.paused=false;}
  pause(){this.paused=true;}
  removeAttribute(){}
  load(){}
  emit(t){(this.listeners[t]||[]).forEach(f=>f());}
}
function fileEngine(options={}){const intervals=new Map();let id=0;const window={AudioContext:AudioStub,Audio:AudioElementStub,setInterval:f=>{intervals.set(++id,f);return id;},clearInterval:i=>intervals.delete(i)};const sandbox={window};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../source/audio.js'),'utf8'),sandbox);return {audio:window.FoundryAudio.create(options),intervals,window};}
test('Kevin MacLeod file tracks play, carry attribution, advance at track end, and map volume',async()=>{
  AudioElementStub.instances.length=0;AudioElementStub.failing=new Set();
  const {audio}=fileEngine({track:'km-monkeys'});
  assert.equal(await audio.start(),true);
  const s=audio.status();assert.equal(s.playing,true);assert.equal(s.kind,'file');assert.match(s.credit,/Kevin MacLeod/);assert.equal(s.title,'Monkeys Spinning Monkeys');
  const el=AudioElementStub.instances.at(-1);assert.match(el.src,/music\/Monkeys Spinning Monkeys\.mp3$/);assert.equal(el.paused,false);
  audio.setVolume(.3);assert.ok(Math.abs(el.volume-.5)<1e-9);
  el.emit('ended');await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(audio.status().track,'km-fluffing');assert.equal(audio.status().playing,true);
  assert.match(AudioElementStub.instances.at(-1).src,/Fluffing a Duck\.mp3$/);
  audio.stop();assert.equal(AudioElementStub.instances.at(-1).paused,true);
});
test('a missing soundtrack file falls back to the original score instead of silence',async()=>{
  AudioElementStub.instances.length=0;AudioElementStub.failing=new Set(['Sneaky Snitch']);
  const {audio,intervals}=fileEngine({track:'km-sneaky'});
  assert.equal(await audio.start(),false);
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  const s=audio.status();assert.equal(s.track,'copper');assert.equal(s.kind,'score');assert.equal(s.playing,true);assert.match(s.note,/original score/);
  assert.equal(intervals.size,1);
});
test('switching between a file track and the original score stops the other source cleanly',async()=>{
  AudioElementStub.instances.length=0;AudioElementStub.failing=new Set();
  const {audio,intervals}=fileEngine({track:'copper'});
  assert.equal(await audio.start(),true);assert.equal(intervals.size,1);
  await audio.setTrack('km-cipher');await Promise.resolve();
  assert.equal(intervals.size,0);assert.equal(audio.status().kind,'file');assert.equal(audio.status().playing,true);
  await audio.setTrack('night');await Promise.resolve();
  assert.equal(AudioElementStub.instances.at(-1).paused,true);assert.equal(intervals.size,1);assert.equal(audio.status().title,'Night Shift');
});
