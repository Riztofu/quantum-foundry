'use strict';
class Parameter { constructor(){this.events=[];this.value=0;} setValueAtTime(v,t){this.events.push(['set',v,t]);} linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);} setTargetAtTime(v,t,c){this.events.push(['target',v,t,c]);} cancelScheduledValues(t){this.events.push(['cancel',t]);} }
class AudioStub {
  static instances=[];
  constructor(){this.currentTime=0;this.state='suspended';this.destination={};this.oscillators=[];this.gains=[];AudioStub.instances.push(this);}
  async resume(){this.state='running';}
  createGain(){const node={gain:new Parameter(),connect(){},disconnect(){}};this.gains.push(node);return node;}
  createOscillator(){const node={frequency:new Parameter(),connect(){},disconnect(){},start(t){this.started=t;},stop(t){this.stopped=t;}};this.oscillators.push(node);return node;}
}
module.exports={AudioStub};
