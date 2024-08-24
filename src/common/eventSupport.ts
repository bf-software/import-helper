export type SyncEventListener<D,R> = (data:D, eventParams:EventParams<D,R>) =>  R|undefined|void;
export type AsyncEventListener<D,R> = (data:D, eventParams:EventParams<D,R>) => Promise<R|undefined|void>;

export type EventListener<D,R> = SyncEventListener<D,R> | AsyncEventListener<D,R>;


interface ListenerMapParams {
  once: boolean;
  context: any;
}


export class ChannelEventParams<C,D,R> {
  private _isCueingStopped = false;
  private _isEventCanceled = false;
  constructor(
    public channel:C,
    public result:R | undefined,
    public listener:EventListener<D,R>
  ) {}

  public get isCueingStopped() {
    return this._isCueingStopped;
  }

  public get isEventCanceled() {
    return this._isEventCanceled;
  }

  /**
   * prevents any further listeners from being cued. This is the same as `stopImmediatePropagation()`
   * method used in JS DOM element events.
   */
  public stopCues() {
    this._isCueingStopped = true;
  }

  /**
   * prevents any further listeners from being cued **and signals to the hosting class** that the event
   * should be canceled if possible.  It will then be up to the hosting class to heed the `isEventCanceled`
   * flag to cancel whatever process it is in charge of.
   */
  public cancelEvent() {
    this.stopCues();
    this._isEventCanceled = true;
  }

}



/**
 * represents a event attached to any object. [see below for the &lt;generic&gt; type details]
 *
 * Unlike other event systems, this does not require that the class wanting to
 * offer events be a descendant of a specific event class.  Each `ChannelEvent` can host 0 or more listeners per channel.
 * Example:
 * ```
 * class chat {
 *   public onUserMessage = new ChannelEvent<string,{message:string},string>;
 *   public sendMessage(name:string, message:string) {
 *     let reply = this.onUserMessage.cue(name,{message});
 *     console.log(`reply was "${reply}"`)
 *   }
 * }
 *
 * let chat = new chat();
 * chat.onUserMessage.on('jim', (data) => {
 *   console.log(`jim says "${data.message}"`);
 *   return 'got it!';
 * });
 *
 * chat.sendMessage('jim','hi!');
 *
 * output:
 *   jim says "hi!"
 *   reply was "got it!"
 * ```
 * When the events are cued, each listener is called and provided with an `eventParams` which contains
 * the members `data` and `result`.  The listener will read any info provided in the `data` member
 * and optionally set the `result` member if a return value is needed.  Also note that the `data` member
 * can be changed and thereby affect other listers yet to be called. The default `result` is determined
 * by a parameter provided when calling the `cue()` method.  `eventParams` can also be used to prevent
 * other listeners from being called by using the `stopCueing()` method.  The listener can also request
 * that the event itself be canceled by calling `cancelEvent()`.  It then will be up to the class hosting
 * the event to heed the cancellation or not.
 *
 * Generic params: <C,D,R>
 * @type C is the type of data for the channel
 * @type D is the type of data passed to each listener
 * @type R is the type of the return data coming from listeners
 */
export class ChannelEvent<C, D = undefined, R = undefined> {
  /** a Map of a Map of listeners */
  protected channels = new Map<C, Map<EventListener<D,R>,ListenerMapParams> >();
  protected _isCueing = false;

  /** when false, calling {@link cue}() will not call any listeners */
  public isEnabled = true;

  /** simple callback thats called when a listener is added.  Mostly used internally for monitoring event activity. */
  public onAddListener:((listener: EventListener<D,R>)=>void) | undefined;

  public hasListeners(channel:C):boolean {
    let listenerMap = this.channels.get(channel);
    return (listenerMap?.size ?? 0) > 0;
  }

  public get isCueing() {
    return this._isCueing;
  }

  /**
   * adds an event listener to the channeled event.  The listener will be executed when the event's `cue()` or
   * `cueAsync()` methods are called by the hosting class for that channel.
   *
   * example:
   * ```
   *   myEvent.on('test', (data, eventParams) => {
   *     return data.num+1;
   *   })
   * ```
   * in most cases, listener functions access members of the `data` object and return a result. If
   * undefined is returned, the `defaultValue` passed into the calling `cue()` or `cueAsync()`
   * function will be returned instead.
   *
   * if there are other listeners, they will all be executed in the order in which they were added.
   * Async listeners called using `cueAsync()` will be awaited before calling the next listener.
   *
   * @param channel the channel the listener should be associated with
   *
   * @param listener a callback that gets called when the event is cued. The first parameter of the
   * callback is the "data" of the event. It is of the type passed in as generic variable D. The
   * second parameter is an EventParams:
   *
   * {@link EventParams} includes the following members:
   *  - `result` <-- contains the default result of type R to be used if this listener returns undefined
   *  - `listener` <-- a reference to this listener which can be passed to {@link remove}()
   *  - `stopCues()` <-- call this to stop calling further listeners. This also guarantees that the
   *                    return value will be the one from this listener.
   *  - `cancelEvent()` <-- call this to stop calling further listeners (like `stopCues()`). but
   *                        this also indicates to the hosting class that the entire event should
   *                        be canceled.  It would be up to the hosting class to react to the flag.
   *
   * @param context this is a way to group listeners under a single context in your application. The
   * purpose is so that you can call {@link removeContext}() in order to clean up many listeners at
   * once.  Usually this is done when a class sets numerous listeners so that it can clear them all
   * before the class object is destroyed.
   */
   public on(channel: C, listener: EventListener<D,R>, context:any = undefined): EventListener<D,R> {
    let listenerMap = this.channels.get(channel);
    if (!listenerMap) {
      listenerMap = new Map<EventListener<D,R>,ListenerMapParams>();
      this.channels.set(channel, listenerMap);
    }
    listenerMap.set(listener, {once: false, context});
    if (this.onAddListener)
      this.onAddListener(listener);
    return listener;
  }

  /**
   * adds an event listener to the event and makes it the first one to be executed when the `cue()`
   * or `cueAsync()` methods are called. Normally, multiple listeners are executed in the order they
   * are added. See {@link on}() for information about the listener parameters.
   */
  public onFirst(channel: C, listener: EventListener<D,R>, context:any = undefined): EventListener<D,R> {
    let oldListenerMap = this.channels.get(channel);
    if (!oldListenerMap)
      oldListenerMap = new Map<EventListener<D,R>,ListenerMapParams>();
    let newListenerMap = new Map<EventListener<D,R>,ListenerMapParams>([[listener,{once:false, context}],...oldListenerMap]);
    this.channels.set(channel, newListenerMap);
    if (this.onAddListener)
      this.onAddListener(listener);
    return listener;
  }

  /**
   * adds an event listener to be executed the next time the `cue()` or `cueAsync()` methods are
   * called, but then removes it from the list of listeners. See {@link on}() for information about
   * the listener parameters.
   */
  public onOnce(channel: C, listener: EventListener<D,R>, context:any = undefined): EventListener<D,R> {
    let listenerMap = this.channels.get(channel);
    if (!listenerMap) {
      listenerMap = new Map<EventListener<D,R>,ListenerMapParams>();
      this.channels.set(channel, listenerMap);
    }
    listenerMap.set(listener, {once: true, context});
    if (this.onAddListener)
      this.onAddListener(listener);
    return listener;
  }

  /**
   * makes the event listener the first to be executed the next time the `cue()` or `cueAsync()`
   * methods are called but then removes it from the list of listeners. See {@link on}() for
   * information about the listener parameters.
   */
  public onOnceFirst(channel: C, listener: EventListener<D,R>, context:any = undefined): EventListener<D,R> {
    let oldListenerMap = this.channels.get(channel);
    if (!oldListenerMap)
      oldListenerMap = new Map<EventListener<D,R>,ListenerMapParams>();
    let newListenerMap = new Map<EventListener<D,R>,ListenerMapParams>([[listener,{once:true, context}],...oldListenerMap]);
    this.channels.set(channel, newListenerMap);
    if (this.onAddListener)
      this.onAddListener(listener);
    return listener;
  }

  public remove(channel: C, listener: EventListener<D,R>) {
    let listenerMap = this.channels.get(channel);
    if (listenerMap) {
      listenerMap.delete(listener);
      if (listenerMap.size <= 0)
        this.channels.delete(channel);
    }
  }

  public removeAll(channel?: C) {
    if (typeof channel == 'undefined')
      this.channels.clear();
    else
      this.channels.delete(channel);
  }

  public removeContext(context: any) {
    for (let [channel, listeners] of this.channels)
      for (let [listener, params] of listeners)
        if (params.context == context)
          this.remove(channel, listener);
  }


  /**
   * classes that host the event should execute this method to call the listeners to action. Note
   * that although {@link on}() will accept asyc functions, they will not be awaited when the host
   * object calls cue().  Use {@link cueAsync}() if the hosting object needs to make the call with
   * `await` in order to get a return value from asynchronous listeners.
   * @param data contains arbitrary data that the host wants to pass to the listener.
   * `data` can also be a reference to a function that returns the data. Use a function
   * when there is a performance cost to obtaining the data. That way, the cost will only be
   * incurred if there are actually listeners listening.
   * @param defaultResult what the result will be if the listeners don't assign one before returning.
   * @returns the result of the last listener that returned something other than undefined or else it
   * returns the defaultResult.
   */
  public cue(channel: C):R | undefined;
  public cue(channel: C, data:D | (() => D), defaultResult?:R ):R | undefined;
  public cue(channel: C, data:D | (() => D), defaultResult:R ):R;
  public cue(channel: C, data?:D | (() => D), defaultResult?:R ):R | undefined {
    this._isCueing = true;
    try {

      let listenerMap = this.channels.get(channel);
      if (!this.isEnabled || !listenerMap || listenerMap.size <= 0)
        return defaultResult;

      if (data instanceof Function)
        data = data();
      let eventParams = new EventParams<D,R>(defaultResult,undefined!);
      for (let [listener, params] of listenerMap) {
        if (params.once)
          this.remove(channel, listener);
        eventParams.listener = listener;
        let result = listener(data as any, eventParams);
        if (eventParams.isEventCanceled)
          return defaultResult;
        if (! (result instanceof Promise) && (typeof result != 'undefined'))
          eventParams.result = result;
        if (eventParams.isCueingStopped)
          break;
      }
      return eventParams.result;

    } finally {
      this._isCueing = false;
    }
  }


  /**
   * classes that host the event should execute this method to call the listeners to action when
   * it needs to await an async result.
   * @param data contains arbitrary data that the host wants to pass to the listener.
   * `data` can also be a reference to a function that returns the data. Use a function
   * when there is a performance cost to obtaining the data. That way, the cost will only be
   * incurred if there are actually listeners listening.
   * @param defaultResult what the result will be if the listeners don't assign one before returning.
   * @returns the result of the last listener that returned something other than undefined or else it
   * returns the defaultResult.
   */
  public async cueAsync(channel: C):Promise<R | undefined | void>;
  public async cueAsync(channel: C, data:D | (() => D) ):Promise<R | undefined | void>;
  public async cueAsync(channel: C, data:D | (() => D), defaultResult:R ):Promise<R>;
  public async cueAsync(channel: C, data?:D | (() => D), defaultResult?:R ):Promise<R | undefined | void > {
    this._isCueing = true;
    try {
      let listenerMap = this.channels.get(channel);
      if (!this.isEnabled || !listenerMap || listenerMap.size <= 0)
        return defaultResult;

      if (data instanceof Function)
        data = data();
      let eventParams = new EventParams<D,R>(defaultResult,undefined!);
      for (let [listener, params] of listenerMap) {
        if (params.once)
          this.remove(channel, listener);
        eventParams.listener = listener;
        let result = await listener(data as any, eventParams);
        if (eventParams.isEventCanceled)
          return defaultResult;
        if (typeof result != 'undefined')
          eventParams.result = result;
        if (eventParams.isCueingStopped)
          break;
      }
      return eventParams.result;
    } finally {
      this._isCueing = false;
    }
  }

}














// normal event (this is a channel event will an empty channel)



export class EventParams<D,R> {
  private _isCueingStopped = false;
  private _isEventCanceled = false;
  constructor(
    public result:R | undefined,
    public listener:EventListener<D,R>
  ) {}

  public get isCueingStopped() {
    return this._isCueingStopped;
  }

  public get isEventCanceled() {
    return this._isEventCanceled;
  }

  /**
   * prevents any further listeners from being cued. This is the same as `stopImmediatePropagation()`
   * method used in JS DOM element events.
   */
  public stopCues() {
    this._isCueingStopped = true;
  }

  /**
   * prevents any further listeners from being cued **and signals to the hosting class** that the event
   * should be canceled if possible.  It will then be up to the hosting class to heed the `isEventCanceled`
   * flag to cancel whatever process it is in charge of.
   */
  public cancelEvent() {
    this.stopCues();
    this._isEventCanceled = true;
  }

}

const cNone = -1;

/**
 * represents an event attached to any object.
 *
 * Generic params: `<D, R>`
 * @type D is the type of data passed to each listener
 * @type R is the type of the return data coming from listeners
 *
 * Unlike other event systems, this does not require that the class wanting to
 * offer events be a descendant of a specific event class.  Each `Event` can host 0 or more listeners.
 * Example:
 * ```
 * class car {
 *   private position = 0;
 *   public onMove = new Event<{distance:number},number>(); // <-- onMove will be called before a move is actually made so the developer has a chance to change the move amount
 *   public move(distance:number) {
 *     distance = this.onMove.cue({distance},distance);
 *     this.position += distance;
 *   }
 * }
 *
 * let car = new car();
 * car.onMove.do( (eventParams) => {
 *   const maxDistance = 100;
 *   if (eventParams.data.distance > maxDistance)
 *     eventParams.result = 0;
 * });
 * ```
 * When the events are cued, each listener is called and provided with an `eventParams` which contains
 * the members `data` and `result`.  The listener will read any info provided in the `data` member
 * and optionally set the `result` member if a return value is needed.  Also note that the `data` member
 * can be changed and thereby affect other listers yet to be called. The default `result` is determined
 * by a parameter provided when calling the `cue()` method.  `eventParams` can also be used to prevent
 * other listeners from being called by using the `stopCueing()` method.  The listener can also request
 * that the event itself be canceled by calling `cancelEvent()`.  It then will be up to the class hosting
 * the event to heed the cancellation or not.
 */
export class Event<D = undefined,R = undefined> {
  private channelEvent = new ChannelEvent<number,D,R>();

  /** simple callback thats called when a listener is added.  Mostly used internally for monitoring event activity. */
  public get onAddListener():((listener: EventListener<D,R>)=>void) | undefined {
    return this.channelEvent.onAddListener;
  }
  public set onAddListener(value: ((listener: EventListener<D,R>)=>void) | undefined) {
    this.channelEvent.onAddListener = value;
  }

  /** when false, calling {@link cue}() will not call any listeners */
  public get isEnabled() {
    return this.channelEvent.isEnabled;
  }
  public set isEnabled(value) {
    this.channelEvent.isEnabled = value;
  }


  public get hasListeners():boolean {
    return this.channelEvent.hasListeners(cNone);
  }

  public get isCueing() {
    return this.channelEvent.isCueing;
  }

  /**
   * adds an event listener to the event.  The listener will be executed when the event's `cue()` or
   * `cueAsync()` methods are called by the hosting class.
   *
   * example:
   * ```
   *   myEvent.do((data, eventParams) => {
   *     return data.num+1;
   *   })
   * ```
   * in most cases, listener functions access members of the `data` object and return a result. If
   * undefined is returned, the `defaultValue` passed into the calling `cue()` or `cueAsync()`
   * function will be returned instead.
   *
   * if there are other listeners, they will all be executed in the order in which they were added.
   * Async listeners called using `cueAsync()` will be awaited before calling the next listener.
   *
   * @param listener a callback that gets called when the event is cued. The first parameter of the
   * callback is the "data" of the event. It is of the type passed in as generic variable D. The
   * second parameter is an EventParams:
   *
   * {@link EventParams} includes the following members:
   *  - `result` <-- contains the default result of type R to be used if this listener returns undefined
   *  - `listener` <-- a reference to this listener which can be passed to {@link remove}()
   *  - `stopCues()` <-- call this to stop calling further listeners. This also guarantees that the
   *                    return value will be the one from this listener.
   *  - `cancelEvent()` <-- call this to stop calling further listeners (like `stopCues()`). but
   *                        this also indicates to the hosting class that the entire event should
   *                        be canceled.  It would be up to the hosting class to react to the flag.
   *
   * @param context this is a way to group listeners under a single context in your application. The
   * purpose is so that you can call {@link removeContext}() in order to clean up many listeners at
   * once.  Usually this is done when a class sets numerous listeners so that it can clear them all
   * before the class object is destroyed.
   *
   */
   public do(listener: EventListener<D,R>, context:any = undefined): EventListener<D,R> {
    this.channelEvent.on(cNone, listener, context);
    return listener;
  }

  /**
   * adds an event listener to the event and makes it the first one to be executed when the `cue()`
   * or `cueAsync()` methods are called. Normally, multiple listeners are executed in the order they
   * are added. See {@link do}() for information about the listener parameters.
   */
  public doFirst(listener: EventListener<D,R>, context:any = undefined): EventListener<D,R> {
    this.channelEvent.onFirst(cNone, listener, context);
    return listener;
  }

  /**
   * adds an event listener to be executed the next time the `cue()` or `cueAsync()` methods are
   * called, but then removes it from the list of listeners. See {@link do}() for information about
   * the listener parameters.
   */
  public doOnce(listener: EventListener<D,R>, context:any = undefined): EventListener<D,R> {
    this.channelEvent.onOnce(cNone, listener, context);
    return listener;
  }

  /**
   * makes the event listener the first to be executed the next time the `cue()` or `cueAsync()`
   * methods are called but then removes it from the list of listeners. See {@link do}() for
   * information about the listener parameters.
   */
  public doOnceFirst(listener: EventListener<D,R>, context:any = undefined): EventListener<D,R> {
    this.channelEvent.onOnceFirst(cNone, listener, context);
    return listener;
  }

  public remove(listener: EventListener<D,R>) {
    this.channelEvent.remove(cNone, listener);
  }

  public removeAll() {
    this.channelEvent.removeAll(cNone);
  }

  public removeContext(context:any) {
    this.channelEvent.removeContext(context);
  }


  /**
   * classes that host the event should execute this method to call the listeners to action. Note
   * that although {@link do}() will accept asyc functions, they will not be awaited when the host
   * object calls cue().  Use {@link cueAsync}() if the hosting object needs to make the call with
   * `await` in order to get a return value from asynchronous listeners.
   * @param data contains arbitrary data that the host wants to pass to the listener.
   * `data` can also be a reference to a function that returns the data. Use a function
   * when there is a performance cost to obtaining the data. That way, the cost will only be
   * incurred if there are actually listeners listening.
   * @param defaultResult what the result will be if the listeners don't assign one before returning.
   * @returns the result of the last listener that returned something other than undefined or else it
   * returns the defaultResult.
   */
  public cue():R | undefined;
  public cue(data:D | (() => D), defaultResult:R ):R;
  public cue(data:D | (() => D), defaultResult?:R ):R | undefined;
  public cue(data?:D | (() => D), defaultResult?:R ):R | undefined {
    // @ts-ignore: there is no way that this call can't work, it's the exact same set of overloads
    return this.channelEvent.cue(cNone, data, defaultResult);
  }


  /**
   * classes that host the event should execute this method to call the listeners to action when
   * it needs to await an async result.
   * @param data contains arbitrary data that the host wants to pass to the listener.
   * `data` can also be a reference to a function that returns the data. Use a function
   * when there is a performance cost to obtaining the data. That way, the cost will only be
   * incurred if there are actually listeners listening.
   * @param defaultResult what the result will be if the listeners don't assign one before returning.
   * @returns the result of the last listener that returned something other than undefined or else it
   * returns the defaultResult.
   */
  public async cueAsync():Promise<R | undefined | void>;
  public async cueAsync(data:D | (() => D) ):Promise<R | undefined | void>;
  public async cueAsync(data:D | (() => D), defaultResult:R ):Promise<R>;
  public async cueAsync(data?:D | (() => D), defaultResult?:R ):Promise<R | undefined | void > {
    // @ts-ignore: there is no way that this call can't work, it's the exactly the same as the set of overloads
    return this.channelEvent.cueAsync(cNone, data, defaultResult);
  }

}
