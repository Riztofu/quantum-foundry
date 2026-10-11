'use strict';
class Parameter { constructor(){this.events=[];this.value=0;} setValueAtTime(v,t){this.events.push(['set',v,t]);} linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);} setTargetAtTime(v,t,c){this.events.push(['target',v,t,c]);} cancelScheduledValues(t){this.events.push(['cancel',t]);} }
class AudioStub {
  static instances=[];
  constructor(){this.currentTime=0;this.state='suspended';this.destination={};this.oscillators=[];this.gains=[];AudioStub.instances.push(this);}
  async resume(){this.state='running';}
  createGain(){const node={gain:new Parameter(),connect(){},disconnect(){}};this.gains.push(node);return node;}
  createOscillator(){const node={frequency:new Parameter(),connect(){},disconnect(){},start(t){this.started=t;},stop(t){this.stopped=t;}};this.oscillators.push(node);return node;}
}
class MediaStub {
  constructor(){this.paused=true;this.currentTime=0;this.volume=1;this.src='';this.calls=[];}
  async play(){this.calls.push(['play',this.src]);this.paused=false;}
  pause(){this.calls.push(['pause',this.src]);this.paused=true;}
  load(){this.calls.push(['load',this.src]);}
  removeAttribute(name){if(name==='src')this.src='';}
}
module.exports={AudioStub,MediaStub};
