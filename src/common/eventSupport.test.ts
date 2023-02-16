import * as ss from './systemSupport';
import { L, U } from './systemSupport';
import * as qt from './quickTest';
import { Event, ChannelEvent } from './eventSupport';


qt.module( () => {


  qt.section('Event class', () => {

    qt.test('using e.result', () => {
      let onEvent = new Event<string,string>();
      onEvent.do((s, e)=>{
        e.result = s+'!';
      });
      qt.testValue( onEvent.cue('hi') ).shouldEqual('hi!');
    });

    qt.test('using return', () => {
      let onEvent = new Event<string,string>();
      onEvent.do((s)=>{
        return s+'!';
      });
      qt.testValue( onEvent.cue('hi') ).shouldEqual('hi!');
    });

    qt.test('multiple listeners', () => {
      let onEvent = new Event<string,string>();
      onEvent.do((s, e)=>{
        e.result += '!';
      });
      onEvent.do((s, e)=>{
        e.result += '?';
      });
      qt.testValue( onEvent.cue('hi','wow') ).shouldEqual('wow!?');
    });

    qt.test('multiple listeners, with stop', () => {
      let onEvent = new Event<string,string>();
      onEvent.do((s, e)=>{
        e.result += '!';
        e.stopCues();
      });
        onEvent.do((s, e)=>{
        e.result += '?';
      });
      qt.testValue( onEvent.cue('hi','wow') ).shouldEqual('wow!');
    });

    qt.test('multiple listeners, with cancel', () => {
      let onEvent = new Event<string,string>();
      onEvent.do((s, e)=>{
        e.result += '!';
      });
        onEvent.do((s, e)=>{
        e.result += '?';
        e.cancelEvent();
      });
      qt.testValue( onEvent.cue('hi','wow') ).shouldEqual('wow');
    });

    qt.test('multiple asynchronous listeners (no await)', () => {
      let onEvent = new Event<string,string>();
      onEvent.do(async (s, e)=>{
        await ss.sleep(100);
        e.result += '!';
      });
        onEvent.do(async (s, e)=>{
        await ss.sleep(100);
        e.result += '?';
      });
      qt.testValue( onEvent.cue('hi','wow') ).shouldEqual('wow');
    });

    qt.test('multiple real asynchronous listeners (with await)', async () => {
      let onEvent = new Event<string,string>();
      onEvent.do(async (s, e)=>{
        await ss.sleep(100);
        e.result += '!';
      });
        onEvent.do(async (s, e)=>{
        await ss.sleep(100);
        e.result += '?';
      });
      qt.testValue( await onEvent.cueAsync('hi','wow') ).shouldEqual('wow!?');
    });

    qt.test('doOnce', () => {
      let onEvent = new Event<string,string>();
      let count = 0;
      onEvent.doOnce(()=>{
        count++;
      });
      onEvent.cue();
      onEvent.cue();
      qt.testValue( count ).shouldEqual(1);
    });

    qt.test('doFirst', () => {
      let onEvent = new Event<string,string>();
      let value = 10;
      onEvent.do(()=>{
        value -= 5;
      });
      onEvent.doFirst(()=>{
        value *= 2;
      });
      onEvent.cue();
      qt.testValue( value ).shouldEqual(15);
    });

    qt.test('doOnceFirst', () => {
      let onEvent = new Event<string,string>();
      let count = 10;
      onEvent.do(()=>{
        count += 1;
      });
      onEvent.doOnceFirst(()=>{
        count *= 4;
      });
      onEvent.cue();
      onEvent.cue();
      qt.testValue( count ).shouldEqual(42);
    });


    qt.test('context', () => {
      let onEvent = new Event<string,string>();
      qt.testValue( onEvent.hasListeners ).shouldBeFalse;
      onEvent.do(()=>{
        console.log('nothing');
      },'ctx');
      qt.testValue( onEvent.hasListeners ).shouldBeTrue;
      onEvent.removeContext('nope');
      qt.testValue( onEvent.hasListeners ).shouldBeTrue;
      onEvent.removeContext('ctx');
      qt.testValue( onEvent.hasListeners ).shouldBeFalse;
    });



  });


  qt.section('ChannelEvent class', () => {

    qt.test('using return', () => {
      let onChannelEvent = new ChannelEvent<string,string,string>();
      onChannelEvent.on('this', (s)=>{
        return 'this: '+s+'!';
      });
      onChannelEvent.on('that', (s)=>{
        return 'that: '+s+'!';
      });
      qt.testValue( onChannelEvent.cue('that','hi') ).shouldEqual('that: hi!');
    });

  });

});
