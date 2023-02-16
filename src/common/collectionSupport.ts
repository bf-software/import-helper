/*
  full find collections - uses a "Full Find" design pattern to extend the usefullness of standard JS collections like Array, and Map.

  classes offered:
    FfArray - a simple array
    FfSortedArray - sorts items using a custom sort function
    FfUniqueSortedArray - only keeps one copy of each item

    FfMap - a simple map
    FfOrderedMap - lets you change the order of the items in the map
    FfSortedMap - keeps the map sorted by the key
    FfDualKeyMap - a map with 2 keys.  Fast searches can be done on each key individually or both together


  ["Full Find" Design Pattern for Collections]

  Empowers collections to always return the full details about values found by various searches.  It also
  encourages a uniform searching method for all types of collections no matter what kind of values they
  hold and regardless of how they are indexed or keyed in the collection.

  The main problem this solves:  When a search has been found to return a result, additional code is often
  required to get more details about the found value.

  "Full Find" makes searching for and using the found data take as few steps as possible.

  JavaScript Array Example:

  let a = [ {name:"joe",score:95}, {name:"jill",score:90}, {name:"pat",score:88} ];
  let value = a.find( (v)=> v.score == 88 );
  if ( value ) {
    a.console.log('deleting '+value.name);
    let index = a.indexOf(value);                 // <-- `a.find` gave us the actual value reference, but not
    s.splice(index,1);                            //     the index, we'll need to look that up separately here.
  }

  An array that implements the "Full Find" pattern:

  let a = new FfArray<{name:string,score:number}>( {name:"joe",score:95}, {name:"jill",score:90}, {name:"pat",score:88} );
  let found = a.byFunc( (v) => v.score == 88 );
  if ( found ) {
    console.log('deleting '+found.value.name);
    a.splice(found.index);                                //  <-- since all searches return the index *and* the found value,
  }                                                       //      we never need to do extra lookups.

  "Full Find" encourages adding a specialized searching functions to the collection to make common searches easier:

  If you find yourself searching by "score" a lot in the example above, "Full Find" would encourage adding a byScore() function:

  class ScoresArray extends FfArray<{name:string,score:number}> {
    public byScore(score:number):FfArrayFound {
      return this.byFunc( (v) => v.score == score);
    }
  }

  let a = new ScoresArray( {name:"joe",score:95}, {name:"jill",score:90}, {name:"pat",score:88} );
  let found = a.byScore(88);    // <-- now we can simply search by score
  if (found) {
    console.log('deleting '+found.value.name);
    a.splice(found.index);
  }

  All "full find" collections have the basic find function `byFunc( func:(value,key1,key2,...) => boolean )`.
  It takes a function that returns true if the value was found while sequentially searching the values in the collection.
  The parameters of the "func" function depend on the keys and values strored in the collection.  Additional byXXXX()
  functions can be made available for specific searches. For example, arrays have a byIndex() find function which quickly
  locates the array value by accessing it via the array index.  Other collections have values that are sorted or hashed, and
  therefore can benefit from a binary search or hash lookup instead of byFunc's sequential search.  In those cases, they implement
  a fast byKey() or byValue() without using byFunc().

  Some collection functions that add new values (like `add()` which is an alternative to `push()` for arrays) to the collection may
  also return a Found object. Pointing to the newly added object.
  (The biggest improvement here is when the location of the value in the collection may not be known before the insert takes place
  due to sorting.)
  For example:
    let a = new FfSortedArray<string>('a','b','y','z');
    let found = a.add('hello');
    console.log(found.index) // <-- found.index will equal 2

  "Base..." Classes

  all "full find" classes have an abstract "Base" class as their foundation.  This allows a developer to create subclasses where the keys
  and values have more specific names associated with them.  For example: lets say we want a Map<string,number> which will hold a person's
  name and a score.  You could use `new FfMap<string,number>()` and store values like this:

  let scores = new FfMap<string,number>();
  scores.set('joe',95);
  scores.set('jill,90);
  scores.set('pat,88);

  to get jill's score you us `byKey()` like so:

  let score = map.byKey('jill').value;

  however, if you find yourself using the scores map a lot in your project, it might make sense to create a more specific
  version of the scores map that names the key and value aspects of the map more appropriately, like so:

  class ScoreMapFound extends FfBaseMapFound<string,number> {
    public get name() {
      return this._key;     // <-- renames the `key` to "name"
    }
    public get score() {
      return this._value;   // <-- renames the `value` to "score"
    }
  }
  class ScoreMapFoundIndex extends FfBaseMapFoundIndex<string,number> {  // <-- FfMaps also require a ...FoundIndex version of the Found class
    public get name() {
      return this._key;
    }
    public get score() {
      return this._value;
    }
    public get index() {
      return this._index;
    }
  }
  class ScoreMap extends FfBaseMap<string,number,ScoreMapFound,ScoreMapFoundIndex> {
    protected foundClass = ScoreMapFound;                                 // <-- tells the new class about your new ScoreMapFound class
    protected foundClassIndex = ScoreMapFoundIndex;                       // <-- tells the new class about your new ScoreMapFoundIndex class
    public byName(name:string):ScoreMapFound|undefined {
      return this.byKey(name);
    }
  }

  Yes, it requires a bit of setup code, so it may not be appropriate in many circumstances. However, once
  the setup code is done, you can now do this throughout the rest of your project:

  let scores = new ScoreMap();
  scores.set('joe',95);
  scores.set('jill,90);
  scores.set('pat,88);

  let score = scores.byName('jill').score;

  ... and, by the way, `ScoreMap` is derrived from `Map<K,V>` so it can be used by anything that accepts a normal map.
  ... also, notice that the `byName()`, and `.score` are fully fleshed out by TypeScript and are available in Intellisense in VSCode.


  [... 🤞 and maybe someday we'll be able to do this:]
  let a = new FfArray<{name:string,score:number}>( {name:"joe",score:95}, {name:"jill",score:90}, {name:"pat",score:88} );
  if ( let found = a.byName('joe') ) ) {           // <-- in ES6 we can't currently initialize a new local variable inside an if statement's condition... see: https://esdiscuss.org/topic/if-scoped-let
    console.log('deleting '+found.value.name);
    a.splice(found.index);
  };

*/


//***** FfBaseArray -> FfArray *********************

import * as ss from './systemSupport';
import { Event } from './eventSupport';


export class FfBaseArrayFound<V> {
  /* friend of FfBaseArray; */
  constructor(
    protected _index:number,
    protected _value:V
  ) {
  }
}

export abstract class FfBaseArray<V,F extends FfBaseArrayFound<V>> extends Array<V> {

  private _comparator:ss.Comparator<V> | undefined;
  private _collator = new Intl.Collator(undefined, {sensitivity: 'accent'});
  private _sortReversed = false;
  private _useCollator = false;

  protected abstract foundClass: { new(index:number, value:V): F };

  public onBeforeDelete = new Event<F>();


  public get sortReversed() {
    return this._sortReversed;
  }
  public set sortReversed(value:boolean) {
    this._sortReversed = value;
  }

  /**
   * indicates whether or not to use the `collator` for comparing strings. The default collator is case-insensitive.
   * When the collator is not used, the default comparator uses standard javascript string comparison which is case
   * sensitive.
   */
  public get useCollator() {
    return this._useCollator;
  }
  public set useCollator(value:boolean) {
    this._useCollator = value;
  }

  public set collator(value:Intl.Collator) {
    this._collator = value;
  }

  public get collator():Intl.Collator {
    return this._collator;
  }

  /**
   * for strings, the default comparator handles comparing strings using the default {@link FfBaseArray#collator}
   * (if {@link FfBaseArray#useCollator} is true) otherwise it uses regular JS <, >, =, comparisons.  For numbers, it simply does an a - b by default.
   *
   * For custom comparing, assign a function to this member in the form: `(a: V, b: V) => number`
   * - if a < b, return a negative number
   * - if a == b, return 0
   * - if a > b, return a positive number
   */
  public get comparator():ss.Comparator<V> {
    if (this._comparator)
      return this._comparator;
    else if (typeof this[0] == 'string' || typeof this[0] == 'undefined') {
      if (this.useCollator)
        return (a,b) => this._collator.compare(a as any, b as any);
      else
        return (a,b) => ( a < b ? -1 : (a > b ? 1 : 0) );
    }else if (typeof this[0] == 'number')
      return (a,b) => (+a - +b);
    else
      throw new Error('must specify a comparator for an array type: '+ (typeof this[0]) );
  }

  public set comparator(value:ss.Comparator<V>) {
    this._comparator = value;
  }

  public byFunc( func: (value:V, index:number) => boolean ):F | undefined {
    let index = 0;
    for (let value of this) {
      if (func(value, index))
        return new this.foundClass(index, value);
      index++;
    }
  }

  protected byValue(value:V):F | undefined {
    return this.byFunc( (v) => v == value );
  }

  protected byIndex(index:number):F | undefined {
    let value = this[index];
    if (value)
      return new this.foundClass(index, value);
  }

  /**
   * alternative to `push()` that returns a found object pointing to the last item added.
   */
  public add(...values:V[]):F {
    this.push(...values);
    return this.last!;
  }

  public splice(start: number, deleteCount: number, ...values: V[]): V[] {
    if (this.onBeforeDelete.hasListeners)
      if (deleteCount != null && deleteCount > 0)
        for (let i = start; i < start+deleteCount; i++)
          this.onBeforeDelete.cue(this.byIndex(i)!);
    return super.splice(start,deleteCount,...values);
  }

  public pop(): V | undefined {
    if (this.length == 0)
      return;
    this.onBeforeDelete.cue( () => this.last! );
    return super.pop();
  }

  public shift(): V | undefined {
    if (this.length == 0)
      return;
    this.onBeforeDelete.cue( () => this.first! );
    return super.shift();
  }

  public delete(startIndex:number, deleteCount:number = 1) {
    this.splice(startIndex,deleteCount);
  }

  public swap(index1:number, index2:number) {
    let found1 = this.byIndex(index1);
    if (found1) {
      let found2 = this.byIndex(index2);
      if (found2) {
        this[index1] = (index2 as any).value;
        this[index2] = (index1 as any).value;
      }
    }
  }

  public move(oldIndex:number, newIndex:number) {
    let found = this.byIndex(oldIndex);
    if (found) {
      this.delete((found as any).index);
      this.splice(newIndex,0,(found as any).value);
    }
  }

  public moveToFirst(index:number) {
    this.move(index,0);
  }

  public moveToLast(index:number) {
    this.move(index,this.length-1);
  }


  /**
   * traverses the array and removes duplicate values based on the comparator.  The array must
   * first be sorted in order for this to work.
   */
  public deleteDuplicates() {
    let i = 1;
    while (i < this.length)
      if (this.comparator(this[i-1], this[i]) == 0)
        this.delete(i);
      else
        i++;
  }

  public clear() {
    this.length = 0;
  }

  public get first():F | undefined {
    return this.byIndex(0);
  };

  public get last():F | undefined {
    return this.byIndex(this.length-1);
  };

}


export class FfArrayFound<V> extends FfBaseArrayFound<V> {
  constructor(_index:number,_value:V){
    super(_index,_value);
  }
  public get index() {
    return this._index;
  }
  public get value() {
    return this._value;
  }
}

/**
 * extends a JS Array with advanced searching functions such as `byValue()`, and `byIndex()`
 * Search functions always return an instance of `FfArrayFound<V>` which contains both the index and value of the found value.
 */
export class FfArray<V> extends FfBaseArray<V, FfArrayFound<V>> {
  protected foundClass = FfArrayFound;

  public byValue(value:V):FfArrayFound<V> | undefined {
    return super.byValue(value);
  }

  public byIndex(index:number):FfArrayFound<V> | undefined {
    return super.byIndex(index);
  }
}

//***** FfBaseSortedAray -> FfSortedArray *****

export abstract class FfBaseSortedArray<V,F extends FfBaseArrayFound<V>> extends FfBaseArray<V,F> {

  private _forceInternalSplice: boolean = false;

  /**
   * after a `byValue()` fails to find a key, this will contain the index position that the value
   * should be placed into if it is to be inserted.  This would also indicate the location
   * of a partial match, if the value is a string.  After calling `byValue()`, to check if a partial
   * string match was found, you'll need to do use `if (myArray[myArray.insertIndex].startsWith('whatever')) ...`
   * to be sure the partial match was actually found.
   */
  public insertIndex = -1;

  public get sortReversed() {
    return super.sortReversed;
  }
  public set sortReversed(value:boolean) {
    if (super.sortReversed == value)
      return;
    super.sortReversed = value;
    this.sort();
  }

  public get useCollator() {
    return super.useCollator;
  }
  public set useCollator(value:boolean) {
    if (super.useCollator == value)
      return;
    super.useCollator = value;
    this.sort();
  }

  public set collator(value:Intl.Collator) {
    if (super.collator == value)
      return;
    super.collator = value;
    this.sort();
  }

  public get comparator():ss.Comparator<V> {
    return super.comparator;
  }
  public set comparator(value:ss.Comparator<V>) {
    if (super.comparator == value)
      return;
    super.comparator = value;
    this.sort();
  }

  constructor(...values:V[]) {
    super(...values);
    this.sort();
  }

  protected byValue(value:V):F | undefined {
    let searchResult = ss.binarySearch<V>(this, value, (a,b) => {
      let result = 0;
      result = this.comparator(a,b);
      if (result != 0 && this.sortReversed)
        result *= -1;
      return result;
    });
    this.insertIndex = searchResult.index;
    if (searchResult.isFound)
      return new this.foundClass(searchResult.index, value);
  }

  protected internalSplice(start: number, deleteCount: number, ...values: V[]): V[] {
    this._forceInternalSplice = true;
    return this.splice(start,deleteCount,...values);
  }


  /**
   * inserts the value into its proper location based on the sort.
   * @returns an FfXxxFound object that contains the index and value of the value inserted.  If multiple
   * value are inserted, it will be the index and value of the last value inserted.
   */
  public add(...values:V[]):F {
    let found:F | undefined;
    for (let value of values) {
      found = this.byValue(value);
      if (!found)
        found = new this.foundClass(this.insertIndex, value);
      this.internalSplice( (found as any).index, 0,  value);
    }
    return found!;
  }

  public sort(compareFn?: (a: V, b: V) => number): this {
    if (!compareFn)
      compareFn = this.comparator;
    super.sort(compareFn);
    return this;
  }

  /**
  * @deprecated this simply works like an `add()` for sorted arrays.
  */
  public push(...values: V[]): number {
    this.add(...values);
    return this.length;
  }

  /**
  * @deprecated this simply works like an `add()` for sorted arrays.
  */
  public unshift(...values: V[]): number {
    this.add(...values);
    return this.length;
  }

  /**
  * @deprecated this simply works like a `delete()` followed by a `splice()` for sorted arrays. The reason it's
  * deprecated is that splice's insert ability is too confusing for sorted arrays, since there can be no index based insert.
  */
  public splice(start: number, deleteCount: number, ...values: V[]): V[] {
    if (values.length == 0 || this._forceInternalSplice) {
      this._forceInternalSplice = false;
      return super.splice(start, deleteCount, ...values);
    } else {
      super.splice(start, deleteCount);
      this.add(...values);
      return values;
    }
  }

  /**
  * @deprecated this is unnecessary, simply set `sortReversed` to reverse a sorted array
  */
  public reverse(): V[] {
    this.sortReversed = !this.sortReversed;
    this.sort();
    return new Array(...this);
  }

}

/**
 * keeps the values of the array sorted at all times.  As values are inserted, they are spliced into the
 * correct index position according to the sort.  Since the position of new values are controlled by the
 * sort, `push()`, `unshift()`, and `splice()` have no special effect because they each simply call
 * `internalSplice()`.
 */
export class FfSortedArray<V> extends FfBaseSortedArray<V, FfArrayFound<V>> {
  protected foundClass = FfArrayFound;

  public byValue(value:V):FfArrayFound<V> | undefined {
    return super.byValue(value);
  }

  public byIndex(index:number):FfArrayFound<V> | undefined {
    return super.byIndex(index);
  }
}

//***** FfBaseUniqueSortedArray ->> FfUniqeSortedArray */
export abstract class FfBaseUniqueSortedArray<V, F extends FfBaseArrayFound<V>> extends FfBaseSortedArray<V,F> {
  constructor(...values:V[]) {
    super(...values);
    this.deleteDuplicates();
  }

  public add(...values:V[]):F {
    let found:F | undefined;
    for (let value of values) {
      found = this.byValue(value);
      if (!found) {
        found = new this.foundClass(this.insertIndex, value);
        this.internalSplice( (found as any).index, 0,  value);
      }
    }
    return found!;
  }


}


/**
 * keeps the values of the array sorted at all times.  As values are inserted, they are spliced into the
 * correct index position according to the sort.  If the value already exists, it is simply ignored.  Since
 * the position of new values are controlled by the sort, `push()`, `unshift()`, and `splice()` have no
 * special effect because they each simply call `internalSplice()`.
 */
export class FfUniqueSortedArray<V> extends FfBaseUniqueSortedArray<V, FfArrayFound<V>> {
  protected foundClass = FfArrayFound;

  public byValue(value:V):FfArrayFound<V> | undefined {
    return super.byValue(value);
  }

  public byIndex(index:number):FfArrayFound<V> | undefined {
    return super.byIndex(index);
  }
}

//***** FfBaseMap -> FfMap *********************

export class FfBaseMapFound<K,V> {
  /* friend of FfBaseMap; */
  constructor(
    protected _key:K,
    protected _value:V
  ) {}
}

export class FfBaseMapFoundIndex<K,V> extends FfBaseMapFound<K,V> {
  /* friend of FfBaseMap; */
  constructor(
    _key:K,
    _value:V,
    protected _index:number
  ) {
    super(_key, _value);
  }
}

/**
 * base class for a Full Find Map.
 */
export abstract class FfBaseMap<K,V,F extends FfBaseMapFound<K,V>,FI extends FfBaseMapFoundIndex<K,V>> extends Map<K,V> {
  private _useLowercaseKeys = false;
  private _lastSetWasNew = false;
  protected abstract foundClass: { new(key:K, value:V): F };
  protected abstract foundClassIndex:  { new(key:K, value:V, index:number): FI };

  /**
   * if this is set to `true`, all keys will be converted to lowercase when stored in the map.  Additionally, all functions
   * that take a key will convert it to lowercase before looking it up in the map.
   */
  public get useLowercaseKeys() {
    return this._useLowercaseKeys;
  }

  public set useLowercaseKeys(value:boolean) {
    if (this._useLowercaseKeys == value)
      return;
    if (this.size > 0)
      throw new Error('can not change useLowercaseKeys after data has already been entered into the map');
    this._useLowercaseKeys = value;
  }

  public get lastSetWasNew() {
    return this._lastSetWasNew;
  }

  public byFunc( func: (value:V, key:K, index:number) => boolean):FI | undefined {
    let index = 0;
    for (let [key, value] of this) {
      if (func(value, key, index))
        return new this.foundClassIndex(key, value, index);
      index++;
    }
  }

  /**
   * returns the value for the provided key.  Note: the index can not be returned because byKey() uses the
   * internal "Map.get()" function which is very fast, but does not return the index.
   */
  protected byKey(key:K):F | undefined {
    let value = this.get( key );
    if (typeof value == 'undefined' || value == null)
      return;
    return new this.foundClass(key, value);
  }

  /**
   * returns the value for the provided key.  If the key is not found, this throws an error.
   */
  protected byExistingKey(key:K, keyName:string='key'):F {
    let value = this.get( key );
    if (typeof value == 'undefined' || value == null)
      throw new Error(`${keyName} not found: ${key}`);
    return new this.foundClass(key, value);
  }

  /**
   * sequentially searches the map for the value
   */
  protected byValue(value:V):FI | undefined {
    return this.byFunc( (v) => value == v );
  }

  /**
   * sequentially searches the map for the value  If the key is not found, this throws an error.
   */
  protected byExistingValue(value:V, valueName:string='value'):FI {
    let valueFound = this.byValue( value );
    if (!valueFound)
      throw new Error(`${valueName} not found: ${value}`);
    return valueFound;
  }

  /**
   * sequentially searches the map for the key and returns the key, value and index
   */
  protected byKeyWithIndex(key:K):FI | undefined {
    key = this.maybeToLowercase(key)
    return this.byFunc( (v, k) => key == k );
  }

  /**
   * this is somewhat slow because it uses a sequential search to find the index. (Normally you
   * cannot access `Map()` items directly by index.)  For a faster `byIndex()` search, use `FfOrderedMap()`.
   */
  protected byIndex(index:number):FI | undefined {
    let foundEntry = ss.byIndex<[K,V]>(this.entries(), index);
    if (foundEntry) {
      let key = foundEntry.value[0];
      let value = foundEntry.value[1];
      return new this.foundClassIndex(key, value, index);
    }
  }

  public get first():FI | undefined {
    return this.byIndex(0);
  }

  /**
   * this is somewhat slow because it uses a sequential search to find the last item. (Normally you
   * cannot access `Map()` items directly by index.)  For a faster `last` search, use `FfOrderedMap()`.
   */
  public get last():FI | undefined {
    let foundEntry = ss.last<[K,V]>(this.entries());
    if (foundEntry) {
      let key = foundEntry.value[0];
      let value = foundEntry.value[1];
      return new this.foundClassIndex(key, value, foundEntry.index);
    }
  }

  protected maybeToLowercase(key:K):K {
    if (this.useLowercaseKeys && typeof key === 'string')
      return (key.toLowerCase() as any) as K;
    return key;
  }

  public set(key: K, value: V): this {
    let lastSize = this.size;
    super.set(this.maybeToLowercase(key), value)
    this._lastSetWasNew = (lastSize < this.size);
    return this;
  }

  public setFromArray(mapArray: ([K, V])[]) {
    for (let [key, value] of mapArray)
      this.set(key,value);
    return this;
  }


  public delete(key: K): boolean {
    return super.delete(this.maybeToLowercase(key));
  }

  public get(key: K): V | undefined {
    return super.get(this.maybeToLowercase(key));
  }

  public has(key: K): boolean {
    return super.has(this.maybeToLowercase(key));
  }

  public toArray():[K,V][] {
    return Array.from(this.entries());
  }

  public toJSON():Array<any> {
    return this.toArray();
  }

  /**
   * allows for a mapping between all of the elements in the Map to an array.
   */
  public map<T>( mapFunc:(value:V, key:K) => T ):T[] {
    let result:T[] = [];
    for (let [key, value] of this)
      result.push(mapFunc(value,key))
    return result;
  }

}

export class FfMapFound<K,V> extends FfBaseMapFound<K,V> {
  constructor(
    _key:K,
    _value:V
  ) {
    super(_key, _value);
  }
  public get key() {
    return this._key;
  }
  public get value() {
    return this._value;
  }
}

export class FfMapFoundIndex<K,V> extends FfBaseMapFoundIndex<K,V> {
  constructor(
    _key:K,
    _value:V,
    _index:number
  ) {
    super(_key, _value, _index);
  }
  public get key() {
    return this._key;
  }
  public get value() {
    return this._value;
  }
  public get index() {
    return this._index;
  }
  public toFound():FfMapFound<K,V> {
    return new FfMapFound<K,V>(this.key,this.value);
  }
}

/**
 * extends a JS Map with advanced searching functions such as @function byKey(), and @function byValue()
 * Search functions always return an instance of @class FfMapFound<K,V> which contains both the key
 * and value of the found item.  When possible, searches will return @class FfMapFoundIndex<K,V>
 * which also includes the index of the found value.  Map classes technically have an index, which simply
 * refers to the order in which the values were added.  The index itself is of limited use because it can not
 * be changed the way it can in an array.
 */
export class FfMap<K,V> extends FfBaseMap<K, V, FfMapFound<K,V>, FfMapFoundIndex<K,V>> {
  protected foundClass = FfMapFound;
  protected foundClassIndex = FfMapFoundIndex;
  /**
   * returns the value for the provided key.  Note: the index can not be returned because byKey() uses the
   * internal "Map.get()" function which is very fast, but does not return the index.
   */
  public byKey(key:K):FfMapFound<K,V> | undefined {
    return super.byKey(key);
  }
  public byValue(value:V):FfMapFoundIndex<K,V> | undefined {
    return super.byValue(value);
  }

  public byExistingKey(key:K, keyName:string='key'):FfMapFound<K,V> {
    return super.byExistingKey(key, keyName);
  }

  public byExistingValue(value:V, valueName:string='value'):FfMapFoundIndex<K,V> {
    return super.byExistingValue(value, valueName);
  }


  /**
   * finds the key and returns the value and index.  Note: this is slower than @function byKey() because it uses
   * a sequential search instead of a hash search.
   */
  public byKeyWithIndex(key:K):FfMapFoundIndex<K,V> | undefined {
    return super.byKeyWithIndex(key);
  }
  public byIndex(index:number):FfMapFoundIndex<K,V> | undefined {
    return super.byIndex(index);
  }
}

/**
 * FfBaseIndexableKeyMap -> FfBaseOrderedMap -> FfOrderedMap *********************************************************
 *                       -> FfBaseSortedMap -> FfSortedMap ***********************************************************
 */

/**
 * this is meant as a common ancestor class for FfOrderedMap and FfSortedMap.  Both of those maps require a separate
 * internal array for holding an array of keys so that they can be accessed quickly by index (which cannot be
 * done with a normal JS Map() object.)
 */
export abstract class FfBaseIndexableKeyMap<K,V,F extends FfBaseMapFound<K,V>,FI extends FfBaseMapFoundIndex<K,V>> extends FfBaseMap<K, V, F, FI> {
  protected keyArray!: FfBaseArray<K, FfArrayFound<K>>;

  protected initializeKeyArray(newKeyArray:  FfBaseArray<K, FfArrayFound<K>>, initial?: ([K, V])[] ) {
    this.keyArray = newKeyArray;
    if (initial)
      for (let [key, value] of initial)
        this.keyArray.push(key);
  }

  public get sortReversed() {
    return this.keyArray.sortReversed;
  }
  public set sortReversed(value:boolean) {
    this.keyArray.sortReversed = value;
  }
  public get useCollator() {
    return this.keyArray.useCollator;
  }
  public set useCollator(value:boolean) {
    this.keyArray.useCollator = value;
  }

  public set collator(value:Intl.Collator) {
    this.keyArray.collator = value;
  }

  public get collator():Intl.Collator {
    return this.keyArray.collator;
  }

  /**
   * for string keys, the default comparator handles comparing strings using the default {@link FfBaseIndexableKeyMap#collator}
   * (if {@link FfBaseIndexableKeyMap#useCollator} is true) otherwise it uses regular JS <, >, =, comparisons.  For numbers, it simply does an a - b by default.
   *
   * For custom comparing, assign a function to this member in the form: `(a: K, b: K) => number`
   * - if a < b, return a negative number
   * - if a == b, return 0
   * - if a > b, return a positive number
   */
  public get comparator():ss.Comparator<K> {
    return this.keyArray.comparator
  }

  public set comparator(value:ss.Comparator<K>) {
    this.keyArray.comparator = value;
  }

  /**
   * gets the last item in the map.  This is faster than FfMap.last because it doens't have to iterate over the map to get the last item.
   */
  public get last():FI | undefined {
    let lastKeyFound = this.keyArray.last;
    if (lastKeyFound) {
      let key = lastKeyFound.value;
      let value = this.get(key)!;
      return new this.foundClassIndex(key, value, lastKeyFound.index);
    }
  }


  *[Symbol.iterator](): IterableIterator<[K, V]> {
    yield *this.entries();
  }

  public *entries(): IterableIterator<[K, V]> {
    for (let i = 0; i < this.keyArray!.length; i++)
      yield [this.keyArray[i],this.get(this.keyArray[i])!];
  }

  public *keys(): IterableIterator<K> {
    for (let i = 0; i < this.keyArray.length; i++)
      yield this.keyArray[i];
  }

  public *values(): IterableIterator<V> {
    for (let i = 0; i < this.keyArray!.length; i++)
      yield this.get(this.keyArray[i])!;
  }


  public byKeyWithIndex(key:K):FI | undefined {
    let value:V;
    let index:number;
    let foundKey = (this.keyArray as any).byValue(this.maybeToLowercase(key));
    if (foundKey) {
      key = foundKey.value;
      index = foundKey.index;
      value = (this.byKey(key) as any)._value;
      return new this.foundClassIndex(key,value,index);
    }
  }


  /**
   * this is a quick lookup by index. Unlike `FfMap()`, this class uses a separate internal key array which can
   * quickly be accessed by index.
   */
  protected byIndex(index:number):FI | undefined {
    let foundKey = (this.keyArray as any).byIndex(index);
    if (!foundKey)
      return;
    let key = foundKey.value;
    let value = (this.byKey(key) as any)._value;
    return new this.foundClassIndex(key, value, index);
  }


  public set(key:K,value:V):this {
    super.set(key,value);
    if (this.keyArray)   // <-- we need to check this because the constructor's super(intial) may call set() to add the initial values, and this.keyArray will not have been initialized then.
      this.keyArray.push( this.maybeToLowercase(key) );
    return this;
  }

  public delete(key: K): boolean {
    if (! super.delete(key))
      return false;
    this.keyArray.delete( (this.keyArray as any).byValue(this.maybeToLowercase(key))!.index );
    return true;
  }

  public deleteByIndex(index: number): boolean {
    let found = (this.keyArray as any).byIndex(index);
    if (! found)
      return false;
    let key = (found as any).value;
    super.delete(key);
    return true;
  }

  public clear(): void {
    super.clear();
    this.keyArray.clear();
  }

}


export abstract class FfBaseOrderedMap<K,V,F extends FfBaseMapFound<K,V>,FI extends FfBaseMapFoundIndex<K,V>> extends FfBaseIndexableKeyMap<K, V, F, FI> {
  declare protected keyArray:FfArray<K>;

  constructor(initial?: ([K, V])[]) {
    super(initial);
    this.initializeKeyArray(new FfArray<K>(), initial);
  }

  public move(oldIndex:number, newIndex:number) {
    this.keyArray.move(oldIndex, newIndex);
  }

  public moveToFirst(index:number) {
    this.keyArray.moveToFirst(index);
  }

  public moveToLast(index:number) {
    this.keyArray.moveToLast(index);
  }

}

/**
 * provides a map where the keys can be re-ordered using various `move..()` functions.  This is needed because
 * although a normal JS map is actually ordered, the order is set when adding the items and can never be changed.
 */
export class FfOrderedMap<K,V> extends FfBaseOrderedMap<K, V, FfMapFound<K,V>, FfMapFoundIndex<K,V>> {
  protected foundClass = FfMapFound;
  protected foundClassIndex = FfMapFoundIndex;

  public byKey(key:K):FfMapFound<K,V> | undefined {
    return super.byKey(key);
  }
  public byExistingKey(key:K, keyName:string='key'):FfMapFound<K,V> {
    return super.byExistingKey(key, keyName);
  }
  public byValue(value:V):FfMapFoundIndex<K,V> | undefined {
    return super.byValue(value);
  }
  public byKeyWithIndex(key:K):FfMapFoundIndex<K,V> | undefined {
    return super.byKeyWithIndex(key);
  }
  public byIndex(index:number):FfMapFoundIndex<K,V> | undefined {
    return super.byIndex(index);
  }

  /**
   * @deprecated this function may be a little slow on large data sets because it does a sequential search to find
   * the key's index.  Use `deleteByIndex()` instead if possible.
   */
  public delete(key: K): boolean {
    return super.delete(key);
  }
}

//***** FfBaseSortedMap -> FfSortedMap *********************

export abstract class FfBaseSortedMap<K,V,F extends FfBaseMapFound<K,V>,FI extends FfBaseMapFoundIndex<K,V>> extends FfBaseIndexableKeyMap<K,V,F,FI> {
  declare protected keyArray:FfUniqueSortedArray<K>;

  constructor(initial?: ([K, V])[] | undefined) {
    super(initial);
    this.initializeKeyArray(new FfUniqueSortedArray<K>(), initial);
  }

  /**
   * for string keys, this returns the value of the first key that matches the partial key.  This simply acts like `byKeyWithIndex()` for
   * non-string keys.  For For example, if the map contains:
   * ```
   * [['Baratheon, Robert',95],['Lanister, Tyrian',100],['Lanister, Jamie',88]]
   * ```
   * then, `byPartialKey('Lanister,')` will return found.index = 1
   */
  public byPartialKey(partialKey:K):FI | undefined {
    let key:K;
    let value:V;
    let index:number;

    let lowercasePartialKey = this.maybeToLowercase(partialKey);

    let foundKey = this.keyArray.byValue(lowercasePartialKey);
    if (foundKey) {
      key = foundKey.value;
      index = foundKey.index;
      value = (this.byKey(key) as any)._value;

    } else if (
      this.keyArray.insertIndex >= 0 &&
      this.keyArray.insertIndex < this.keyArray.length &&
      typeof this.keyArray[this.keyArray.insertIndex] == 'string' &&
      ((this.keyArray[this.keyArray.insertIndex] as any) as string).startsWith((lowercasePartialKey as any) as string)
    ) {
      index = this.keyArray.insertIndex;
      key = this.keyArray[this.keyArray.insertIndex];
      value = (this.byKey(key) as any)._value;

    } else
      return;

    return new this.foundClassIndex(key,value,index);
  }

}


/**
 * the order of the map is determined by the sort order of the keys.
 */
export class FfSortedMap<K,V> extends FfBaseSortedMap<K, V, FfMapFound<K,V>, FfMapFoundIndex<K,V>> {
  protected foundClass = FfMapFound;
  protected foundClassIndex = FfMapFoundIndex;

  public byKey(key:K):FfMapFound<K,V> | undefined {
    return super.byKey(key);
  }
  public byExistingKey(key:K, keyName:string='key'):FfMapFound<K,V> {
    return super.byExistingKey(key, keyName);
  }
  public byValue(value:V):FfMapFoundIndex<K,V> | undefined {
    return super.byValue(value);
  }
  /**
   * this uses a sorted internal key list to find the value and is therefore faster than the `byKeyWithIndex()`
   * of other maps.
   */
  public byKeyWithIndex(key:K):FfMapFoundIndex<K,V> | undefined {
    return super.byKeyWithIndex(key);
  }
  public byIndex(index:number):FfMapFoundIndex<K,V> | undefined {
    return super.byIndex(index);
  }
}


//***** FfBaseDualKeyMap -> FfDualKeyMap *********************
export class FfBaseDualKeyMapFound<K1,K2,V> {
  constructor(
    protected _key1:K1,
    protected _key2:K2,
    protected _value:V
  ) {}
}

export class FfBaseDualKeyMapFoundIndex<K1,K2,V> extends FfBaseDualKeyMapFound<K1,K2,V> {
  constructor(
    _key1:K1,
    _key2:K2,
    _value:V,
    protected _index1:number,
    protected _index2:number
  ) {
    super(_key1, _key2, _value);
  }
}


export class FfBaseDualKeyMapFoundKey1_key2MapFound<K2,V> extends FfBaseMapFound<K2,V> {

}

export class FfBaseDualKeyMapFoundKey1_key2MapFoundIndex<K2,V> extends FfBaseMapFoundIndex<K2,V> {
  constructor(
    _key:K2,
    _value:V,
    _index:number
  ) {
    super(_key, _value, _index);
  }
}

export class FfBaseDualKeyMapFoundKey2_key1MapFound<K1,V> extends FfBaseMapFound<K1,V> {

}

export class FfBaseDualKeyMapFoundKey2_key1MapFoundIndex<K1,V> extends FfBaseMapFoundIndex<K1,V> {
  constructor(
    _key:K1,
    _value:V,
    _index:number
  ) {
    super(_key, _value, _index);
  }
}


export class FfBaseDualKeyMapFoundKey1<K1,K2,V,K2M extends FfBaseMap<K2,V,FfBaseDualKeyMapFoundKey1_key2MapFound<K2,V>,FfBaseDualKeyMapFoundKey1_key2MapFoundIndex<K2,V>>> {
  constructor(
    protected _key1:K1,
    protected _key2Map: K2M
  ) {}
}

export class FfBaseDualKeyMapFoundKey2<K1,K2,V,K1M extends FfBaseMap<K1,V,FfBaseDualKeyMapFoundKey2_key1MapFound<K1,V>,FfBaseDualKeyMapFoundKey2_key1MapFoundIndex<K1,V>>> {
  constructor(
    protected _key2:K2,
    protected _key1Map:K1M
  ) {}
}

/**
 * Yes, the number of generic variables in this class is absurd.  The reason for this is to allow subclasses to
 * name the keys and values as they see fit.
 */
export abstract class FfBaseDualKeyMap<K1,K2,V,
                                        F extends FfBaseDualKeyMapFound<K1,K2,V>,
                                        FI extends FfBaseDualKeyMapFoundIndex<K1,K2,V>,
                                        K2M extends FfBaseMap<K2,V,FfBaseDualKeyMapFoundKey1_key2MapFound<K2,V>,FfBaseDualKeyMapFoundKey1_key2MapFoundIndex<K2,V>>,
                                        K1M extends FfBaseMap<K1,V,FfBaseDualKeyMapFoundKey2_key1MapFound<K1,V>,FfBaseDualKeyMapFoundKey2_key1MapFoundIndex<K1,V>>,
                                        FK1 extends FfBaseDualKeyMapFoundKey1<K1,K2,V,K2M>,
                                        FK2 extends FfBaseDualKeyMapFoundKey2<K1,K2,V,K1M>
                                      > {

  /** contains a list of key1 entries mapping to a key2 map */
  private _key1Key2Map = new FfMap<K1,K2M>();
  /**
   * contains a list of key2 entries mapping to a key1 map.  By having the key1 map's
   * value set to undefined, it is being used more like a set.  We only need one
   * reference to the actual value, and that is stored in _key1Key2Map
   */
  private _key2Key1Map = new FfMap<K2,FfMap<K1,undefined>>();

  private _size = 0;

  protected abstract foundClass: { new(key1:K1, key2:K2, value:V): F };
  protected abstract foundClassIndex:  { new(key1:K1, key2:K2, value:V, index1:number, index2:number): FI };
  protected abstract foundClassKey1: { new(key1:K1, key2Map: K2M): FK1 };
  protected abstract foundClassKey2: { new(key2:K2, key1Map: K1M ): FK2 };

  /**
   * unfortunately these two factories must exist because they are used in the constructor when a initial value is passed.
   * Constructor's in JavaScript can not access their own classes' variables before the super() call is made.  Otherwise,
   * I would have made them protected variables like the `foundClass...` ones above.
   */
  protected abstract createKey2MapClass():K2M;
  protected abstract createKey1MapClass():K1M;

  protected get useLowercaseKey1() {
    return this._key1Key2Map.useLowercaseKeys;
  }
  protected set useLowercaseKey1(value:boolean) {
    if (this._key1Key2Map.useLowercaseKeys == value)
      return;
    if (this.size > 0)
      throw new Error('can not change useLowercaseKey1 after data has already been entered into the map');
    this._key1Key2Map.useLowercaseKeys = value;
  }
  protected get useLowercaseKey2() {
    return this._key2Key1Map.useLowercaseKeys;
  }
  protected set useLowercaseKey2(value:boolean) {
    if (this._key2Key1Map.useLowercaseKeys == value)
      return;
    if (this.size > 0)
      throw new Error('can not change useLowercaseKey2 after data has already been entered into the map');
    this._key2Key1Map.useLowercaseKeys = value;
  }

  constructor(initial?: ([K1, K2, V])[]) {
    if (initial)
      this.setFromArray(initial);
  }

  public byFunc( func: (value:V, key1:K1, key2:K2, index1:number, index2:number) => boolean):FI | undefined {
    let index1 = 0;
    for (let [key1, key2Map] of this._key1Key2Map) {
      let index2 = 0;
      for (let [key2, value] of key2Map) {
        if (func(value, key1, key2, index1, index2)) {
          return new this.foundClassIndex(key1, key2, value, index1, index2);
        }
        index2++;
      }
      index1++;
    }
  }

  *[Symbol.iterator](): IterableIterator<[K1, K2, V]> {
    yield *this.entries();
  }

  public *entries(): IterableIterator<[K1, K2, V]>  {
    for (let [key1, key2Map] of this._key1Key2Map)
      for (let [key2, value] of key2Map)
        yield [key1, key2, value];
  }

  public get size() {
    return this._size;
  }

  public clear() {
    this._key1Key2Map.clear();
    this._key2Key1Map.clear();
    this._size = 0;
  }

  /**
   * returns a "found" object containing a map of all the Key2 values associated with Key1.  This is slightly faster than `byKey2()` because it's
   * more direct.  When using an `FfDualKeyMap`, optimize it so that most of the calls use `byKey1()`.
   */
  protected byKey1(key1:K1):FK1 | undefined {
    let foundKey1 = this._key1Key2Map.byKey(key1);
    if (foundKey1)
      return new this.foundClassKey1(key1,foundKey1.value);
  }

  /**
   * returns a "found" object containing a map of all the Key1 values associated with Key2.  This is slightly less efficient than `byKey1()`.
   */
  protected byKey2(key2:K2):FK2 | undefined {
    let key1ValueMap:K1M | undefined;
    // find all the key1s that this key2 points to
    let key1Map = this._key2Key1Map.byKey(key2)?.value;
    if (key1Map) {
      key1ValueMap = this.createKey1MapClass();
      key1ValueMap.useLowercaseKeys = this.useLowercaseKey1;
      for (let [key1, ignore] of key1Map)
        key1ValueMap.set(key1,(this.byKeys(key1,key2) as any)._value);  // <-- if key1 exists in the key1Map, it must exist
    }
    if (key1ValueMap)
      return new this.foundClassKey2(key2,key1ValueMap);
  }

  protected byKeys(key1:K1, key2:K2):F | undefined {
    let found = undefined;
    let foundKey1 = this.byKey1(key1);
    if (foundKey1) {
      // @ts-ignore: allowed to access the private fields `foundKey1._key2Map`
      let key2Map:K2M = foundKey1._key2Map;
      // @ts-ignore: allowed to access the private method `key2Map.byKey`
      let foundKey2 = key2Map.byKey(key2);
      if (foundKey2) {
        // @ts-ignore: allowed to access the private field `_value`
        found = new this.foundClass(key1, key2, foundKey2._value );
      }
    }
    return found;
  }

  /**
   * delete the entry corresponding to `key1` and `key2`
   */
  protected delete(key1: K1, key2:K2): boolean {
    let found1 = this._key1Key2Map.byKey(key1)      // <-- first look up key1 in _key1...map
    if (!found1)
      return false;
    if (!found1.value.delete(key2))                 // <-- if there was nothing to delete then return
      return false;

    this._size--;

    if (found1.value.size == 0)                     // <-- since it was deleted, clean up any empty _key1...map entries
      this._key1Key2Map.delete(key1);

    let found2 = this._key2Key1Map.byKey(key2);
    if (found2) {     // <-- now remove the key1 entry in the _key2...map
      found2.value.delete(key1);
      if (found2.value.size == 0)                   // <-- since it was deleted, clean up any empty _key2...map entries
        this._key2Key1Map.delete(key2);
    }
    return true;
  }

  /**
   * deletes all entries that have `key1`
   */
  protected deleteKey1(key1: K1): boolean {
    let found1 = this._key1Key2Map.byKey(key1)               // <-- first look up key1 in _key1...map
    if (!found1)
      return false;

    this._size -= found1.value.size;                         // <-- the size gets reduced by the entire count of the key2Map items that were deleted.

    this._key1Key2Map.delete(key1);
    for (let [key2,value] of found1.value) {                 // <-- remove the key1 entry in each _key2...map
      let key1Map = this._key2Key1Map.byKey(key2)?.value;
      if (key1Map) {
        key1Map.delete(key1);
        if (key1Map.size == 0)                               // <-- since it was deleted, clean up any empty _key2...map entries
          this._key2Key1Map.delete(key2);
      }
    }
    return true;
  }

  /**
   * deletes all entries that have `key2`
   */
  protected deleteKey2(key2: K2): boolean {
    let found2 = this._key2Key1Map.byKey(key2)               // <-- first look up key2 in _key2...map
    if (!found2)
      return false;
    this._size -= found2.value.size;                         // <-- the size gets reduced by the entire count of the key1Map items that were deleted.
    this._key2Key1Map.delete(key2);
    for (let [key1,value] of found2.value) {                 // <-- remove the key2 entry in each _key1...map
      let key2Map = this._key1Key2Map.byKey(key1)?.value;
      if (key2Map) {
        key2Map.delete(key2);
        if (key2Map.size == 0)                               // <-- since it was deleted, clean up any empty _key2...map entries
          this._key1Key2Map.delete(key1);
      }
    }
    return true;
  }

  protected set(key1:K1, key2:K2, value:V): this {
    // first check if key1Map has a key2Map alreay available
    let key2Map:K2M;
    let found1 = this._key1Key2Map.byKey(key1);
    if (found1)
      key2Map = found1.value;
    else {
      // since it's not there, add an empty one
      key2Map = this.createKey2MapClass();
      key2Map.useLowercaseKeys = this.useLowercaseKey2;
      this._key1Key2Map.set(key1,key2Map);
    }
    // at this point we have a key2Map to add our value to (or update)
    key2Map.set(key2,value);
    if (key2Map.lastSetWasNew)
      this._size++;

    // now add the key1 to the key2Key1Map
    // first check if key2Key1Map has a key2 map alreay available
    let key1Map:FfMap<K1,undefined>;
    let found2 = this._key2Key1Map.byKey(key2);
    if (found2)
      key1Map = found2.value;
    else {
      // since it's not there, add an empty one
      key1Map = new FfMap<K1,undefined>();
      key1Map.useLowercaseKeys = this.useLowercaseKey1;
      this._key2Key1Map.set(key2,key1Map);
    }
    key1Map.set(key1,undefined);

    return this;
  }

  public setFromArray(mapArray: readonly (readonly [K1, K2, V])[]):this {
    for (let [key1, key2, value] of mapArray)
      this.set(key1,key2,value);
    return this;
  }

}


export class FfDualKeyMapFound<K1,K2,V> extends  FfBaseDualKeyMapFound<K1,K2,V> {
  public get key1() {
    return this._key1;
  }
  public get key2() {
    return this._key2;
  }
  public get value() {
    return this._value;
  }
}

export class FfDualKeyMapFoundIndex<K1,K2,V> extends FfBaseDualKeyMapFoundIndex<K1,K2,V> {
  public get key1() {
    return this._key1;
  }
  public get key2() {
    return this._key2;
  }
  public get value() {
    return this._value;
  }
  public get index1() {
    return this._index1;
  }
  public get index2() {
    return this._index2;
  }
}


export class FfDualKeyMapFoundKey1_key2MapFound<K2, V> extends FfBaseMapFound<K2, V> {
  public get key2() {
    return this._key;
  }
  public get value() {
    return this._value;
  }
}

export class FfDualKeyMapFoundKey1_key2MapFoundIndex<K2, V> extends FfBaseMapFoundIndex<K2, V> {
  public get key2() {
    return this._key;
  }
  public get value() {
    return this._value;
  }
  public get index2() {
    return this._index;
  }
}

export class FfDualKeyMapFoundKey1_key2Map<K2, V> extends FfBaseMap<K2, V, FfDualKeyMapFoundKey1_key2MapFound<K2, V>,FfDualKeyMapFoundKey1_key2MapFoundIndex<K2, V>> {
  protected foundClass = FfDualKeyMapFoundKey1_key2MapFound;
  protected foundClassIndex = FfDualKeyMapFoundKey1_key2MapFoundIndex;

  public byKey2(key2:K2):FfDualKeyMapFoundKey1_key2MapFound<K2, V> | undefined {
    return this.byKey(key2);
  }
  public byValue(value:V):FfDualKeyMapFoundKey1_key2MapFoundIndex<K2, V> | undefined {
    return super.byValue(value);
  }
  public byKey2WithIndex(key2:K2):FfDualKeyMapFoundKey1_key2MapFoundIndex<K2, V> | undefined {
    return this.byKeyWithIndex(key2);
  }
  public byIndex2(index:number):FfDualKeyMapFoundKey1_key2MapFoundIndex<K2, V> | undefined {
    return this.byIndex(index);
  }
  public set(key2: K2, value: V): this {
    return super.set(key2, value);
  }
  public delete(key2: K2): boolean {
    return super.delete(key2);
  }

}

export class FfDualKeyMapFoundKey1<K1,K2,V> extends FfBaseDualKeyMapFoundKey1<K1,K2,V,FfDualKeyMapFoundKey1_key2Map<K2, V>> {
  public get key1() {
    return this._key1;
  }
  public get key2Map() {
    return this._key2Map;
  }
}


export class FfDualKeyMapFoundKey2_key1MapFound<K1, V> extends FfBaseMapFound<K1, V> {
  public get key1() {
    return this._key;
  }
  public get value() {
    return this._value;
  }
}

export class FfDualKeyMapFoundKey2_key1MapFoundIndex<K1, V> extends FfBaseMapFoundIndex<K1, V> {
  public get key1() {
    return this._key;
  }
  public get value() {
    return this._value;
  }
  public get index1() {
    return this._index;
  }
}

export class FfDualKeyMapFoundKey2_key1Map<K1, V> extends FfBaseMap<K1, V, FfDualKeyMapFoundKey2_key1MapFound<K1, V>,FfDualKeyMapFoundKey2_key1MapFoundIndex<K1, V>> {
  protected foundClass = FfDualKeyMapFoundKey2_key1MapFound;
  protected foundClassIndex = FfDualKeyMapFoundKey2_key1MapFoundIndex;

  public byKey1(key1:K1):FfDualKeyMapFoundKey2_key1MapFound<K1, V> | undefined {
    return this.byKey(key1);
  }
  public byValue(value:V):FfDualKeyMapFoundKey2_key1MapFoundIndex<K1,V> | undefined {
    return super.byValue(value);
  }
  public byKey1WithIndex(key1:K1):FfDualKeyMapFoundKey2_key1MapFound<K1, V> | undefined {
    return this.byKeyWithIndex(key1);
  }
  public byIndex1(index:number):FfDualKeyMapFoundKey2_key1MapFound<K1, V> | undefined {
    return this.byIndex(index);
  }
  public set(key1: K1, value: V): this {
    return super.set(key1, value);
  }
  public delete(key1: K1): boolean {
    return super.delete(key1);
  }

}

export class FfDualKeyMapFoundKey2<K1,K2,V> extends FfBaseDualKeyMapFoundKey2<K1,K2,V, FfDualKeyMapFoundKey2_key1Map<K1, V>> {
  public get key2() {
    return this._key2;
  }
  public get key1Map() {
    return this._key1Map;
  }
}

/**
 *  a two dimensional map that can be quickly accessed by the first and second keys.  Think of this as a
 *  two dimensional array. for example:
 *
 *  `let myArray = [['1a','1b'],['2a','2b']];` can be represented as a DualKeyMap like so:
 *  `let myMap = new FfDualKeyMap<number,number,string>([[0,0,'1a'],[0,1,'1b'],[1,0,'2a'],[1,1,'2b']]);`
 *
 *  The array element `myArray[1][1]` equals `'2b'`. Similarly, the DualKeyMap value `myMap.byKeys(1,1).value` also equals `'2b'`.  The
 *  difference is that the DualKeyMap can accept any variable type as keys, whereas arrays can only use numbers via the array indexes.
 *
 *  An important feature is to be able to access all of the values quickly by K1 or K2.  To implement the quick K2 access, this class
 *  maintains an extra internal map of associations between Key2 and Key1.
 */
export class FfDualKeyMap<K1,K2,V> extends FfBaseDualKeyMap<K1,K2,V,
                                             FfDualKeyMapFound<K1,K2,V>,
                                             FfDualKeyMapFoundIndex<K1,K2,V>,
                                             FfDualKeyMapFoundKey1_key2Map<K2,V>,
                                             FfDualKeyMapFoundKey2_key1Map<K1,V>,
                                             FfDualKeyMapFoundKey1<K1,K2,V>,
                                             FfDualKeyMapFoundKey2<K1,K2,V>
                                           > {
  protected foundClass = FfDualKeyMapFound;
  protected foundClassIndex = FfDualKeyMapFoundIndex;
  // protected key2MapClass = FfDualKeyMapFoundKey1_key2Map;
  // protected key1MapClass = FfDualKeyMapFoundKey2_key1Map;
  protected foundClassKey1 = FfDualKeyMapFoundKey1;
  protected foundClassKey2 = FfDualKeyMapFoundKey2;

  protected  createKey2MapClass():FfDualKeyMapFoundKey1_key2Map<K2, V> {
    return new FfDualKeyMapFoundKey1_key2Map<K2, V>();
  }

  protected  createKey1MapClass():FfDualKeyMapFoundKey2_key1Map<K1, V> {
    return new FfDualKeyMapFoundKey2_key1Map<K1, V>();
  }

  public get useLowercaseKey1() {
    return super.useLowercaseKey1;
  }
  public set useLowercaseKey1(value:boolean) {
    super.useLowercaseKey1 = value;
  }
  public get useLowercaseKey2() {
    return super.useLowercaseKey2;
  }
  public set useLowercaseKey2(value:boolean) {
    super.useLowercaseKey2 = value;
  }

  public byKey1(key1:K1):FfDualKeyMapFoundKey1<K1,K2,V> | undefined {
    return super.byKey1(key1);
  }
  public byKey2(key2:K2):FfDualKeyMapFoundKey2<K1,K2,V> | undefined {
    return super.byKey2(key2);
  }
  public byKeys(key1:K1, key2:K2):FfDualKeyMapFound<K1,K2,V> | undefined {
    return super.byKeys(key1,key2);
  }
  public delete(key1: K1, key2:K2): boolean {
    return super.delete(key1,key2);
  }
  public deleteKey1(key1: K1): boolean {
    return super.deleteKey1(key1);
  }
  public deleteKey2(key2: K2): boolean {
    return super.deleteKey2(key2);
  }
  public set(key1:K1, key2:K2, value:V): this {
    return super.set(key1,key2,value);
  }

}


/**
 * Weighted Sort
 */

class WeightedSortDebugInfo {
  public criteria:{
    name:string,
    value:number,
    adjustedValue?:number,
    lowest:number,
    highest:number,
    adjustedLowest?:number,
    adjustedHighest?:number,
    lowerIsBetter: boolean,
    weight: number,
    score: number
  }[] = [];
  public totalScore:number = 0;
}

interface CriterianOptions<T> {
  /** name used in debug function output */
  name?:string,

  /**
   * default: `false` | Setting this to `true` causes the weight to be flipped, where the lowest
   * number gets the best score.  Ex. if a high value is considered "bad" like a "bank fee", where
   * the higher the fee, the worse it is, you would set this to `true` so that higher bank fees are
   * sorted towards the bottom.
   */
  lowerIsBetter?:boolean;

  /**
   * sets a floor for the values. This means, all values are considered to be at least
   * this high. For example, if a list consists of numbers from 1 to 100, setting this to 10 would
   * mean that the actual range considered in the weighted calculations would only be from 10 to
   * 100.  Numbers from 0 to 9 would be given the same weight as 10.
   */
  minimumHighValue?:number;

  /**
   * caps the highest value at this.  Normally the highest value is given all of the points, but this can be used to set a maximum high value.
   */
  maximumHighValue?:number;

  /**
   * caps the lowest value at this.  Normally the lowest value is given no points at all, but this can be used to set a minimum low value in order to limit the penalty.
   */
  minimumLowValue?:number;

  /**
   * sets a ceiling for the lowest value
   */
  maximumLowValue?:number;

}

class WeightedCriterian<T> {
  constructor(
    public weight:number = 0,
    public valueGetter:(item:T) => number,
    public options?:CriterianOptions<T>
  ) {
    this.clearRanges();
  }

  public highest:number = 0;
  public adjustedHighest:number = 0;

  public lowest:number = 0;
  public adjustedLowest:number = 0;

  public clearRanges() {
    this.highest = -Number.MAX_VALUE;
    this.lowest = Number.MAX_VALUE;
    this.adjustedHighest = this.options?.minimumHighValue ?? -Number.MAX_VALUE;
    this.adjustedLowest = this.options?.maximumLowValue ?? Number.MAX_VALUE;
  }

}


/**
 * sorts arrays based on a set of weighted criteria.  When sorting, each individual criterian is
 * compared to the best value in the entire array.  The score for that criteria is determined by how
 * close it is to the best value.  The best value is awarded the entire `weight` amount as its
 * score, while lower scores are awarded a portion of the weight amount.  All of the individual
 * scores for each item are added together to find the final score of the item.  An item's location
 * in the final sort is based on its final score.
 * ```
 * let example = [
 *   {name:'joe', test1:85, test2:77, final:89,  daysAbsent:2},
 *   {name:'bob', test1:65, test2:88, final:95,  daysAbsent:4},
 *   {name:'sue', test1:87, test2:89, final:100, daysAbsent:9}
 * ];
 *
 * let weightedSort = new WeightedSort<typeof example[0]>();
 *
 * weightedSort.addCriterian(20, (item) => item.test1 );
 * weightedSort.addCriterian(30, (item) => item.test2 );
 * weightedSort.addCriterian(50, (item) => item.final );
 * weightedSort.addCriterian(10, (item) => item.daysAbsent, {higherIsBetter: false} );
 *
 * weightedSort.prepareAndSort(example);
 * ```
 * in the example above, the best `test1` score is 87. A weight of 20 points is configured for the
 * `test1` value.  So when calculating the final score for `sue`, she is awarded all 20 points for
 * her value of `87`. `bob` is awarded a score of `0` because he has the worst score. And finally
 * `joe ` is awarded a score of 18 points.  This continues for each additional criteria, adding up
 * all of the points to arrive at a final score for each person.
 *
 * Note that `daysAbsent` is set as `higherIsBetter: false`.  This will award points based on having
 * the lowest value.
 *
 * The intermediate and final scores calculated for the example are as follows:
 * ```
 * {name:'joe', test1:85 (score: 18), test2:77 (score:  0), final:89  (score: 0),   daysAbsent:2 (score: 10)},  (totalScore: 18+0+0+10=28)
 * {name:'bob', test1:65 (score:  0), test2:88 (score: 28), final:95  (score: 27 ), daysAbsent:4 (score:  7)},  (totalScore: 0+28+27+7=62)
 * {name:'sue', test1:87 (score: 20), test2:89 (score: 30), final:100 (score: 50),  daysAbsent:9 (score:  0)}   (totalScore: 20+30+50+0=100)
 * ```
 * so as you can see, `sue` would be sorted first with a final score of 100, and the rest would follow.
 *
 * Some things to note: This is strictly for sorting.  As you can see the score itself wouldn't be
 * "fair" if this were to be used in an actual academic grading system, as poor `joe` did pretty
 * well on his tests, but ended up with a final "score" of 28. Also, the weights are completely
 * arbitrary and do not have to add up to any particular number.  In the example, all of the weights
 * added up to 110.  You may want to use 100 as a starting point, but it isn't necessary.
 *
 * If you are interested in what the scores actually were after a sort, simply use
 * {@link getScore}() on any item in your array.  (note: only use `getScore()` after first calling
 * {@link prepare}() or {@link prepareAndSort}()
 *
 */
export class WeightedSort<T> {
  public criteria = new FfArray<WeightedCriterian<T>>();
  public isPrepared = false;

  private clearRanges() {
    this.isPrepared = false;
    for (let weightedCritirian of this.criteria)
      weightedCritirian.clearRanges();
  }

  /**
   * sets the provided criteria ranges to the highest and lowest values among each other.  Call without parameters to
   * set all criteria.  This is useful when 2 or more criteria are related to each other and should adhere to the
   * same range.
   */
	public equalizeRanges(...criteria:WeightedCriterian<T>[]) {
    if (criteria.length == 0)
      criteria = this.criteria
    let adjustedHighest = -Number.MAX_VALUE;
    let adjustedLowest = Number.MAX_VALUE;
    for (let criterian of criteria) {
      adjustedHighest = Math.max(adjustedHighest, criterian.adjustedHighest);
      adjustedLowest = Math.min(adjustedLowest, criterian.adjustedLowest);
    }
    for (let criterian of criteria) {
      criterian.adjustedHighest = adjustedHighest;
      criterian.adjustedLowest = adjustedLowest;
    }
	}


  /**
   * does an initial pass through the data to determine the ranges of the criteria.  This is
   * necessary to properly weigh the values.
   */
  public prepare(array:Array<T>) {
    this.clearRanges();
    for (let item of array) {
      for (let criterian of this.criteria) {
        let value = criterian.valueGetter(item);
        criterian.highest = Math.max(criterian.highest, value);
        criterian.lowest = Math.min(criterian.lowest, value);
        criterian.adjustedHighest = Math.max(criterian.adjustedHighest, value);
        criterian.adjustedLowest = Math.min(criterian.adjustedLowest, value);
      }
    }
    this.isPrepared = true;
  }

  /**
   * uses the critia weights and item values to come up with a overall score for the item.  This
   * score determines the item's position in the sort.
   */
  public getScore(item:T):{criterianValues:{value:number, adjustedValue:number, score:number}[], totalScore:number} {
    if (!this.isPrepared)
      throw new Error('prepare() must be called first');
    let criterianValues:{value:number, adjustedValue:number, score:number}[] = [];
    let totalScore = 0;
    for (let criterian of this.criteria) {
      let value = criterian.valueGetter(item);
      let adjustedValue = value;
      adjustedValue = Math.min(criterian.options?.maximumHighValue ?? Number.MAX_VALUE, adjustedValue);
      adjustedValue = Math.max(criterian.options?.minimumLowValue ?? 0, adjustedValue);

      let scoreFraction = 0;
      if ( criterian.adjustedHighest != criterian.adjustedLowest ) {
        scoreFraction = (adjustedValue - criterian.adjustedLowest) /
                        (criterian.adjustedHighest - criterian.adjustedLowest);
        if (criterian.options?.lowerIsBetter ?? false)
          scoreFraction = 1 - scoreFraction;
      }
      let criterianScore = scoreFraction * criterian.weight;
      criterianValues.push({value, adjustedValue, score:criterianScore});
      totalScore += criterianScore;
    }
    return {criterianValues, totalScore};
  }

  public clearCriteria() {
    this.criteria.clear();
    this.isPrepared = false;
  }

  /**
   * @param weight an arbitrary number to assign to the best value in the criterian range.  The best value of the entire array
   * returned by the `valueGetter` in this criterian will be assigned this `weight` value as the "score", while the worst value will be
   * assigned 0.  Everything else will be assigned a score proportional between `weight` and 0.  All of the individual criterian scores
   * are then added together to arrive at the final "score" which is what is actually used for sorting.
   * @param valueGetter the getter function that is used to get value of an item's criterian when needed during the sorting
   * process.  The value may come from the actual array element, or from some member deep within classes inside the array
   * element. This architecture simply provides the most flexibility when sorting.
   * @param options {@link CriterianOptions}
   */
  public addCriterian(weight:number, valueGetter:(item:T) => number, options?:CriterianOptions<T>):WeightedCriterian<T> {
    return this.criteria.add(new WeightedCriterian<T>(weight,valueGetter,options)).value;
  }

  /**
   * @param array sorts the array in place using the established weighted criteria.  {@link prepareSort()} must be called before this.
   */
  public sort(array:Array<T>) {
    if (!this.isPrepared)
      throw new Error('prepare() must be called first');
    array.sort( (a:T, b:T) => {
      return (this.getScore(a).totalScore - this.getScore(b).totalScore) * /*sort descending*/ -1;
    })
  }

  /**
   * prepares the criteria, then sorts the array.  You may however want to call {@link prepare}() and {@link sort}() separately
   * so you can modify the criteria's high and low values before calling sort.
   */
  public prepareAndSort(array:Array<T>) {
    this.prepare(array);
    this.sort(array);
  }


  /**
   * returns all of the information used to come up with an item's weighted score
   */
  public getDebugInfo(item: T): WeightedSortDebugInfo {
    let info = new WeightedSortDebugInfo();
    let criterianScore = this.getScore(item);
    info.totalScore = criterianScore.totalScore;
    let i = 0;
    for (let criterian of this.criteria) {
      let criterianValue = criterianScore.criterianValues[i++];
      let criterianInfo = {
        name: criterian.options?.name ?? '',
        value: criterianValue.value,
        adjustedValue: (criterianValue.value == criterianValue.adjustedValue ? undefined : criterianValue.adjustedValue),
        lowest: criterian.lowest,
        highest: criterian.highest,
        adjustedLowest:(criterian.lowest == criterian.adjustedLowest && criterian.highest == criterian.adjustedHighest ? undefined : criterian.adjustedLowest),
        adjustedHighest:(criterian.lowest == criterian.adjustedLowest && criterian.highest == criterian.adjustedHighest ? undefined : criterian.adjustedHighest),
        lowerIsBetter: criterian.options?.lowerIsBetter ?? false,
        weight: criterian.weight,
        score: criterianValue.score
      }
      info.criteria.push(criterianInfo);
    }
    return info;
  }

  /**
   * outputs debug info in a text grid. ex:
   *```
   *   criterian        range          value    weight  score
   *   test1            20…87 (50…87)  20 (50)  20       8.96
   *   test2            77…89          77       30       0.00
   *   final            89…100         89       50       0.00
   *   daysAbsent ↓🖒    2…9            2        10      10.00
   *                                            total   18.96
   * ```
   * key:
   *  - `(50…87)` - the range was ajdusted to 50…87
   *  - `(50)` - value was adjusted to 50
   *  - `↓🖒` - lower is better
   */
  public getDebugGrid(item: T): string {
    let info = this.getDebugInfo(item);
    let grid:string[][] = [];
    grid.push(          ['criterian','range','value','weight','score']);
    let columnOptions = [{},         {},     {},      {},     {textAlign: 'right'}];
    for (let criterian of info.criteria)
      grid.push([
        criterian.name +
          (criterian.lowerIsBetter ? ' ↓🖒' : ''),
        `${criterian.lowest}…${criterian.highest}` +
          (typeof criterian.adjustedLowest == 'number' ? ` (${criterian.adjustedLowest}…${criterian.adjustedHighest})`: ''),
        `${criterian.value}` + (typeof criterian.adjustedValue == 'number' ? ` (${criterian.adjustedValue})` : ''),
        `${criterian.weight}`,
        `${criterian.score.toFixed(2)}`
      ]);
    grid.push([
      '',
      '',
      '',
      `total`,
      `${info.totalScore.toFixed(2)}`
    ]);
    return ss.buildTextGrid(grid,{columnOptions});
  }

}
